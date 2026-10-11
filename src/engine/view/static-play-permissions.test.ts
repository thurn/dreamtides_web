/** Static void permissions are live presentation data with no source identity. */
import { describe, expect, it } from "vitest";
import { energy, staticAbility } from "../dsl/builders";
import type { CardFilter } from "../dsl/types";
import { CHOSEN_SUBTYPE } from "../effects/primitives/choose-subtype";
import { playFromZone } from "../effects/primitives/play-from-zone";
import { createEngine } from "../engine";
import { cloneState } from "../state/clone";
import { deserializeState, serializeState } from "../state/hash";
import { SIDES } from "../state/ids";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId } from "../testing/synthetic-cards";
import { zoneCatalog } from "../testing/zone-cards";
import { testCardSubtype } from "../../types/test-identities";
import { view } from "./view";

const filters: readonly CardFilter[] = [
  { subtype: testCardSubtype("Fixture Warrior") },
  { cardType: "character", costAtMost: 2 },
  { cardType: "character", costAtLeast: 0, costAtMost: 0 },
  { cardType: "event", costAtLeast: 4 },
  { cardType: "character", subtype: testCardSubtype("Fixture Warrior"), costAtLeast: 1, costAtMost: 3 },
];
const permit = (filter: CardFilter, zone: "play" | "hand" = "play") => ({
  id: syntheticId(0x3930), cardType: "character" as const, costs: [energy(4)], spark: 3,
  subtype: testCardSubtype("Fixture Ancient"), speed: "standard" as const, status: "authored" as const,
  abilities: () => [staticAbility(playFromZone("void", filter), { zone })],
});
const deck = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

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

    it("shows an applicable permission without identifying a hidden functional-zone source", () => {
      const card = permit({ cardType: "character" }, "hand");
      const engine = createEngine(zoneCatalog([card]));
      const { state, ids } = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [card.id], deck } });
      const viewer = side === "player" ? "enemy" : "player";
      const projected = engine.view(state, viewer);
      expect(projected.staticPlayPermissions).toEqual([{ kind: "playFrom", player: side, zone: "void", instance: null, filter: { cardType: "character" }, next: false }]);
      expect(JSON.stringify(projected)).not.toContain(ids[side].hand[0]);
      expect(JSON.stringify(projected)).not.toContain(card.id);
    });
  });
}
