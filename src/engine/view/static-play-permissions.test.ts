/** Static void permissions are live presentation data with no source identity. */
import { describe, expect, it } from "vitest";
import { energy, staticAbility } from "../dsl/builders";
import type { CardFilter } from "../dsl/types";
import { CHOSEN_SUBTYPE } from "../effects/primitives/choose-subtype";
import { playFromZone } from "../effects/primitives/play-from-zone";
import { createEngine } from "../engine";
import { cloneState } from "../state/clone";
import { deserializeState, serializeState } from "../state/hash";
import { battleSeed, SIDES } from "../state/ids";
import { PolicyRandom } from "../policy/random";
import { comparableView } from "../testing/determinization-fidelity";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { zoneCatalog } from "../testing/zone-cards";
import { testCardSubtype } from "../../types/test-identities";
import { parseAvatarId, parseDreamsignId } from "../../types/identifiers";
import { forgetShuffledDeck, revealToBoth } from "./knowledge";
import { view } from "./view";

const filters: readonly CardFilter[] = [
  { subtype: testCardSubtype("Fixture Warrior") },
  { cardType: "character", costAtMost: 2 },
  { cardType: "character", costAtLeast: 0, costAtMost: 0 },
  { cardType: "event", costAtLeast: 4 },
  { cardType: "character", subtype: testCardSubtype("Fixture Warrior"), costAtLeast: 1, costAtMost: 3 },
];
const permit = (filter: CardFilter, zone: "play" | "hand" | "deck" = "play") => ({
  id: syntheticId(0x3930), cardType: "character" as const, costs: [energy(4)], spark: 3,
  subtype: testCardSubtype("Fixture Ancient"), speed: "standard" as const, status: "authored" as const,
  abilities: () => [staticAbility(playFromZone("void", filter), { zone: zone === "deck" ? "any" : zone })],
});
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

it.each(["hand", "deck"] as const)("preserves presentation across hidden %s source alternatives and seeded samples", (zone) => {
  const card = permit({ cardType: "character", costAtLeast: 0, costAtMost: 0 }, zone);
  const engine = createEngine(zoneCatalog([card]));
  const { state } = boardState(engine.catalog, {
    active: "player", phase: "day", player: { deck }, enemy: zone === "hand"
      ? { hand: [card.id], deck }
      : { hand: [deck[0]], deck: [card.id, ...deck.slice(1)] },
  });
  const visible = engine.view(state, "player");
  const alternate = cloneState(state);
  const hand = alternate.sides.enemy.hand[0];
  const top = alternate.sides.enemy.deck[0];
  alternate.sides.enemy.hand[0] = top;
  alternate.sides.enemy.deck[0] = hand;
  alternate.instances[hand] = { ...alternate.instances[hand], zone: "deck" };
  alternate.instances[top] = { ...alternate.instances[top], zone: "hand" };
  expect(comparableView(engine.view(alternate, "player"))).toEqual(comparableView(visible));
  const decklists = {
    player: deck.map((cardId) => ({ cardId })),
    enemy: [card.id, ...deck].map((cardId) => ({ cardId })),
  };
  for (const seed of ["static-permission-c", "static-permission-a", "static-permission-b"]) {
    const random = new PolicyRandom(battleSeed(seed));
    const sampled = engine.determinize(visible, decklists, () => random.next());
    expect(comparableView(engine.view(sampled, "player"))).toEqual(comparableView(visible));
  }
});

for (const side of SIDES) {
  describe(`static void-play presentation for ${side}`, () => {
    it.each(filters)("retains the complete filter %j and excludes floating permissions", (filter) => {
      const card = permit(filter);
      const engine = createEngine(zoneCatalog([card]));
      const { state, ids } = boardState(engine.catalog, {
        active: side, phase: "day", [side]: { back: [card.id], void: [SYNTHETIC.vanilla1.id], deck },
      });
      state.floating.push({ id: "e901", source: ids[side].back[0]!, controller: side, timestamp: 1, expiry: { at: "never" },
        change: { kind: "playFrom", player: side, zone: "void", instance: ids[side].void[0], filter: {}, next: true } });
      const projected = engine.view(state, side);
      expect(projected.staticPlayPermissions).toEqual([{ kind: "playFrom", player: side, zone: "void", instance: null, filter, next: false }]);
      expect(projected.floating).toHaveLength(1);
      const reloaded = deserializeState(serializeState(state));
      expect(engine.view(reloaded, side).staticPlayPermissions).toEqual(projected.staticPlayPermissions);
      // Projection fields are copies, including the filter that came from the catalog.
      const permission = projected.staticPlayPermissions![0];
      (permission.filter as { costAtMost?: number }).costAtMost = 99;
      expect(view(state, side, engine.catalog).staticPlayPermissions![0].filter).toEqual(filter);
    });

    it("tracks source removal and control changes without persisting a permission", () => {
      const card = permit({ cardType: "character", costAtMost: 2 });
      const engine = createEngine(zoneCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], deck } });
      const source = ids[side].back[0]!;
      const other = side === "player" ? "enemy" : "player";
      const changed = cloneState(state);
      changed.sides[side].backRank[0] = null;
      changed.sides[other].backRank[0] = source;
      changed.instances[source] = { ...changed.instances[source], controller: other };
      changed.version += 1;
      expect(engine.view(changed, side).staticPlayPermissions![0].player).toBe(other);
      expect(engine.view(state, side).staticPlayPermissions![0].player).toBe(side);
      changed.sides[other].backRank[0] = null;
      changed.instances[source] = { ...changed.instances[source], zone: "void" };
      changed.sides[side].void.push(source);
      changed.version += 1;
      expect(engine.view(changed, side).staticPlayPermissions).toEqual([]);
      expect(changed.floating).toEqual([]);
      expect(serializeState(changed)).not.toContain("staticPlayPermissions");
    });

    it("follows the chosen-type applicability condition evaluated by Layers", () => {
      const card = permit({ subtype: CHOSEN_SUBTYPE });
      const engine = createEngine(zoneCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { back: [card.id], deck } });
      expect(view(state, side, engine.catalog).staticPlayPermissions).toEqual([]);
      const source = ids[side].back[0]!;
      const subtype = testCardSubtype("Fixture Chosen");
      state.floating.push({ id: "e902", source, controller: side, timestamp: 1, expiry: { at: "sourceLeavesPlay", source }, change: { kind: "subtype", instance: source, subtype } });
      expect(view(state, side, engine.catalog).staticPlayPermissions![0].filter).toEqual({ subtype });
      state.floating = [];
      expect(view(state, side, engine.catalog).staticPlayPermissions).toEqual([]);
    });

    it.each(["hand", "deck"] as const)("withholds an unidentified %s source grant and shows it when the source becomes known", (zone) => {
      const filter = { cardType: "character" as const, costAtMost: 0 };
      const card = permit(filter, zone);
      const engine = createEngine(zoneCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: {
        hand: zone === "hand" ? [card.id] : [], deck: zone === "deck" ? [card.id, ...deck] : deck, void: [SYNTHETIC.vanilla0.id],
      } });
      const source = ids[side][zone][0];
      const viewer = side === "player" ? "enemy" : "player";
      const projected = engine.view(state, viewer);
      expect(projected.staticPlayPermissions).toEqual([]);
      expect(JSON.stringify(projected)).not.toContain(`"${source}"`);
      expect(JSON.stringify(projected)).not.toContain(card.id);
      // Presentation privacy does not change the holder's rules permission.
      expect(engine.legalActions(state, side)).toContainEqual({ kind: "play", card: ids[side].void[0], from: "void" });
      const permission = { kind: "playFrom", player: side, zone: "void", instance: null, filter, next: false };
      expect(engine.view(state, side).staticPlayPermissions).toEqual(zone === "hand" ? [permission] : []);
      const known = cloneState(state);
      known.version += 1;
      revealToBoth(known, [source]);
      expect(engine.view(known, viewer).staticPlayPermissions).toEqual([permission]);
      expect(engine.view(known, side).staticPlayPermissions).toEqual([permission]);
      expect(Object.keys(engine.view(known, viewer).staticPlayPermissions![0])).not.toContain("staticSource");
      const random = new PolicyRandom(battleSeed(`known-static-${zone}-${side}`));
      const sampled = engine.determinize(engine.view(known, viewer), {
        player: Object.values(known.instances).filter((i) => i.owner === "player" && i.printing.kind === "card").map((i) => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : card.id })),
        enemy: Object.values(known.instances).filter((i) => i.owner === "enemy" && i.printing.kind === "card").map((i) => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : card.id })),
      }, () => random.next());
      expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(engine.view(known, viewer)));
      if (zone === "deck") {
        const shuffled = cloneState(known);
        shuffled.version += 1;
        forgetShuffledDeck(shuffled, shuffled.sides[side].deck);
        expect(engine.view(shuffled, viewer).staticPlayPermissions).toEqual([]);
        expect(engine.view(shuffled, side).staticPlayPermissions).toEqual([]);
        expect(engine.view(known, viewer).staticPlayPermissions).toEqual([permission]);
      }
    });

    it("retains public avatar and dreamsign permissions without exposing their provenance in the projection", () => {
      const abilities = () => [staticAbility(playFromZone("void", { cardType: "character", costAtMost: 0 }))];
      const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000004470"), status: "authored" as const, abilities };
      const dreamsign = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000004471"), status: "authored" as const, abilities };
      const engine = createEngine(testCatalog([], { avatars: [avatar], dreamsigns: [dreamsign] }));
      const { state } = boardState(engine.catalog, { active: side, phase: "day", [side]: { avatar: avatar.id, dreamsigns: [dreamsign.id], deck } });
      for (const viewer of SIDES) {
        expect(engine.view(state, viewer).staticPlayPermissions).toEqual(Array.from({ length: 2 }, () => ({
          kind: "playFrom", player: side, zone: "void", instance: null, filter: { cardType: "character", costAtMost: 0 }, next: false,
        })));
      }
    });
  });
}
