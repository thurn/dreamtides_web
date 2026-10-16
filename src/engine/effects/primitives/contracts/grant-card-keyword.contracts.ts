import type { ResolvingEffect } from "../../registry";
import { ruleModifier } from "../rule-modifier";
import { reclaimNotBanished } from "../reclaim-not-banished";
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { energy, event, staticAbility } from "../../../dsl/builders";
import type { Keyword } from "../../../dsl/types";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { playRoutes } from "../../../rules/timing";
import { Layers } from "../../../continuous/layers";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup, type SideSetup } from "../../../testing/board";
import { CONTINUOUS } from "../../../testing/continuous-cards";
import { DSL } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { STACK } from "../../../testing/stack-cards";
import { syntheticId } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE, zoneCatalog } from "../../../testing/zone-cards";
import { cardsIn, grantCardKeyword } from "../grant-card-keyword";
import { v } from "./cards-support";

/** "Cards in the opponent's hand have Offering." */
const opponentHandOffering: EngineCardDefinition = {
  id: syntheticId(921),
  cardType: "character",
  costs: [energy(2)],
  spark: 1,
  subtype: "Mage",
  speed: "standard",
  status: "authored",
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("hand", {}, "opponent"), "offering"))],
};

/** "Characters in your deck have Vengeful." */
const deckCharactersVengeful: EngineCardDefinition = {
  ...opponentHandOffering,
  id: syntheticId(923),
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("deck", { cardType: "character" }), "vengeful"))],
};

/** Unsafe synthetic ingress preserves resolution-time refusal after a committed play. */
const resolvingMisuse = [
  { id: syntheticId(922), effect: grantCardKeyword(cardsIn("hand"), "offering") },
  { id: syntheticId(0x764001), effect: ruleModifier({ rule: "carryEnergy" }) },
  { id: syntheticId(0x764002), effect: reclaimNotBanished() },
].map(({ id, effect }) => {
  const card: EngineCardDefinition = {
    id, cardType: "event", costs: [energy(0)], spark: null, subtype: "", speed: "standard", status: "authored",
    abilities: () => [event(effect as unknown as ResolvingEffect)],
  };
  return { card, op: effect.op };
});

describe("grantCardKeyword", () => {
  const zones = createEngine(zoneCatalog([opponentHandOffering, ...resolvingMisuse.map(({ card }) => card), deckCharactersVengeful]));
  const filler = Array.from({ length: 6 }, () => v.vanilla1.id);
  const setup = (player: SideSetup, enemy: SideSetup = {}): BoardSetup => ({
    active: "player",
    phase: "day",
    player: { deck: filler, ...player },
    enemy: { deck: filler, ...enemy },
  });
  const placed = (spec: BoardSetup) => boardState(zones.catalog, spec);
  const has = (state: BattleState, id: InstanceId | null | undefined, keyword: Keyword) => hasKeyword(state, zones.catalog, id!, keyword);
  const act = (state: BattleState, side: "player" | "enemy", action: Action, answers: readonly Answer[] = []) => {
    const source = new ScriptedSource(answers);
    const result = zones.apply(state, side, action, source);
    source.assertExhausted();
    expect(invariantViolations(result.state, zones.catalog)).toEqual([]);
    return result;
  };
  const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;

  it("gives the keyword to every card in its controller's named zone that matches, and to no other card", () => {
    const { state, ids } = placed(
      setup(
        { back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.event1.id], deck: [v.vanilla2.id], void: [v.vanilla5.id] },
        { hand: [v.vanilla2.id], deck: [v.vanilla2.id] },
      ),
    );
    for (const card of ids.player.hand) {
      expect(has(state, card, "offering")).toBe(true);
      expect(playRoutes(state, zones.catalog, card, "hand")).toEqual(["hand", "offering"]);
    }
    for (const card of [ids.player.back[0], ids.player.deck[0], ids.player.void[0], ids.enemy.hand[0], ids.enemy.deck[0]]) {
      expect(has(state, card, "offering")).toBe(false);
    }
    expect(has(state, ids.player.hand[0], "awakened")).toBe(false);
  });

  it("plays a card through the granted Offering for 0●, and the Offering status outlasts the keyword", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.vanilla1.id], energy: 0 }));
    const [brute, fodder] = ids.player.hand;
    const after = act(state, "player", { kind: "play", card: brute, from: "hand" }).state;
    expect(zoneOf(after, brute)).toBe("play");
    expect(zoneOf(after, fodder)).toBe("banished");
    expect(after.sides.player.currentEnergy).toBe(0);
    expect(after.instances[brute]?.status.offering).toBe(true);
    // Out of the hand the static no longer applies, but the status still banishes it during Ending.
    expect(has(after, brute, "offering")).toBe(false);
    expect(zoneOf(passUntil(zones, after, at(zones, "enemy", "day")).state, brute)).toBe("banished");
  });

  it("ends as its source leaves play, and each card loses the keyword as it leaves the zone", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [DSL.returnAnyToHand.id, v.vanilla1.id], energy: 1 }));
    const [bounce, kept] = ids.player.hand;
    const nomad = ids.player.back[0];
    // The card's own costs, then the only character in play, the source, returns to hand.
    const after = act(state, "player", { kind: "play", card: bounce, from: "hand" }, [0]).state;
    expect(zoneOf(after, nomad)).toBe("hand");
    expect(zoneOf(after, bounce)).toBe("void");
    expect(after.instances[bounce]?.status.offering).toBe(false);
    for (const card of [kept, nomad, bounce]) expect(has(after, card, "offering")).toBe(false);
    expect(playRoutes(after, zones.catalog, kept, "hand")).toEqual(["hand"]);
  });

  it("matches its filter by the type changes of layer 2, so a card that has all character types matches every subtype", () => {
    const { state, ids } = placed(
      setup({
        back: [v.vanilla1.id, ZONE.sacrifice.id, DSL.voidMagesReclaim.id],
        hand: [CONTINUOUS.shapeshift.id],
        void: [ZONE.sacrifice.id, v.vanilla2.id, v.event1.id],
        energy: 5,
      }),
    );
    const [warrior, sacrifice] = ids.player.back;
    const [mage, plainWarrior, spell] = ids.player.void;
    expect(has(state, mage, "reclaim")).toBe(true);
    for (const card of [plainWarrior, spell]) expect(has(state, card, "reclaim")).toBe(false);
    // The Warrior gains all character types until end of turn, then is abandoned into the void.
    const shifted = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, [[warrior!]]).state;
    expect(has(shifted, warrior, "reclaim")).toBe(false);
    const settled = act(shifted, "player", { kind: "activate", source: sacrifice!, ability: 0 }, [[warrior!]]).state;
    expect(zoneOf(settled, warrior)).toBe("void");
    expect(has(settled, warrior, "reclaim")).toBe(true);
    const legal = zones.legalActions(settled, "player");
    expect(legal).toContainEqual({ kind: "play", card: warrior, from: "void" });
    expect(legal.some((action) => action.kind === "play" && action.card === plainWarrior)).toBe(false);
  });

  it("reads layer 2 through the evaluation expanding it, never another evaluation of the state", () => {
    const plain = placed(setup({ back: [DSL.voidMagesReclaim.id], void: [v.vanilla2.id] }));
    const mage = placed(setup({ back: [DSL.voidMagesReclaim.id], void: [ZONE.sacrifice.id] }));
    const card = plain.ids.player.void[0];
    expect(mage.ids.player.void[0]).toBe(card);
    expect(new Layers(mage.state, zones.catalog).of(card).keywords).toContain("reclaim");
    // An evaluation of another state answers for this one, as a stale memo would; a fresh evaluation never consults it.
    zones.catalog.memo.set(plain.state, { version: plain.state.version, layers: new Layers(mage.state, zones.catalog) });
    expect(new Layers(plain.state, zones.catalog).of(card).keywords).not.toContain("reclaim");
  });

  it("covers its controller's deck cards that match, naming them in no view that does not know them, and stores nothing", () => {
    const placedState = placed(
      setup({ back: [deckCharactersVengeful.id], deck: [v.vanilla1.id, v.event1.id, v.vanilla2.id] }, { deck: [v.vanilla2.id] }),
    );
    const { ids } = placedState;
    const [first, spell, known] = ids.player.deck;
    const state: BattleState = { ...placedState.state, knownTo: { ...placedState.state.knownTo, player: [known] } };
    expect(invariantViolations(state, zones.catalog)).toEqual([]);
    for (const card of [first, known]) expect(has(state, card, "vengeful")).toBe(true);
    for (const card of [spell, ids.player.back[0], ids.enemy.deck[0]]) expect(has(state, card, "vengeful")).toBe(false);
    const names = (seen: object, id: InstanceId | undefined) => JSON.stringify(seen).includes(`"${id!}"`);
    // The player's view names only the deck card the player knows, with its granted keyword.
    const mine = zones.view(state, "player");
    expect(mine.sides.player.deck).toEqual({ count: 3, known: [{ id: known, index: 2 }] });
    expect(mine.instances[known]?.characteristics.keywords).toContain("vengeful");
    for (const card of [first, spell]) expect(names(mine, card)).toBe(false);
    // The opponent's view names none of them.
    const theirs = zones.view(state, "enemy");
    expect(theirs.sides.player.deck).toEqual({ count: 3, known: [] });
    for (const card of ids.player.deck) expect(names(theirs, card)).toBe(false);
    // A serialization round trip reads the same keywords and the same views.
    const reloaded = deserializeState(serializeState(state));
    expect(stateHash(reloaded)).toBe(stateHash(state));
    expect(reloaded.floating).toEqual([]);
    for (const card of ids.player.deck) expect(has(reloaded, card, "vengeful")).toBe(has(state, card, "vengeful"));
    expect(zones.view(reloaded, "player")).toEqual(mine);
    expect(zones.view(reloaded, "enemy")).toEqual(theirs);
  });

  it("applies each side's static to its own controller's zone, and resolves a player reference from that controller", () => {
    const { state, ids } = placed(
      setup({ back: [DSL.handOffering.id], hand: [v.vanilla1.id] }, { back: [opponentHandOffering.id], hand: [v.vanilla2.id] }),
    );
    expect(has(state, ids.player.hand[0], "offering")).toBe(true);
    // The enemy's "the opponent's hand" is the player's hand, which already has it; the enemy's own hand has none.
    expect(has(state, ids.enemy.hand[0], "offering")).toBe(false);
    const both = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla1.id] }, { back: [DSL.handOffering.id], hand: [v.vanilla2.id] }));
    expect(has(both.state, both.ids.enemy.hand[0], "offering")).toBe(true);
    // Neither side's view names the other's hand cards or their keywords.
    const seen = zones.view(both.state, "enemy");
    expect(seen.instances[both.ids.player.hand[0]]).toBeUndefined();
    expect(seen.instances[both.ids.enemy.hand[0]]?.characteristics.keywords).toContain("offering");
  });

  it("keeps the route chosen when paying its costs removes the source", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [STACK.abandonOrDiscardToDraw.id, v.vanilla1.id], energy: 0 }));
    const [card, fodder] = ids.player.hand;
    const nomad = ids.player.back[0];
    // Offering is the only payable route, its banish takes the only other hand card, so the additional cost abandons the source (RD-hv-umm2.52-2).
    const after = act(state, "player", { kind: "play", card: card, from: "hand" }).state;
    expect(zoneOf(after, nomad)).toBe("void");
    expect(zoneOf(after, fodder)).toBe("banished");
    expect(zoneOf(after, card)).toBe("void");
    expect(after.instances[card]?.status.offering).toBe(true);
    expect(after.sides.player.hand).toHaveLength(2);
    expect(zoneOf(passUntil(zones, after, at(zones, "enemy", "day")).state, card)).toBe("banished");
  });

  it("stores nothing: a reloaded state reads the same keywords and legal actions, and the route prompt survives suspension", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.vanilla1.id], energy: 3 }));
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(state));
    for (const card of ids.player.hand) expect(has(reloaded, card, "offering")).toBe(true);
    expect(zones.legalActions(reloaded, "player")).toEqual(zones.legalActions(state, "player"));

    const fold = createFoldAdapter(zones, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied") throw new Error("bounced");
    const pending = fold.pending(outcome.slice)!;
    expect(pending.prompt.purpose.role).toBe("playRoute");
    expect(outcome.slice.committed.sides.player.hand).toEqual(ids.player.hand);
    const saved = JSON.parse(JSON.stringify(outcome.slice)) as BattleSlice;
    const fresh = createFoldAdapter(zones, { checkEventPrefix: true });
    expect(fresh.pending(saved)!.prompt.id).toBe(pending.prompt.id);
    const answer = (side: "player" | "enemy", value: Answer) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", 1)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", 2)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const offered = answer("player", 1);
    if (offered.kind !== "applied" || offered.error !== null) throw new Error("the Offering route did not apply");
    expect(offered.slice.committed.sides.player.currentEnergy).toBe(3);
    expect(zoneOf(offered.slice.committed, ids.player.hand[1])).toBe("banished");
    expect(offered.slice.committed.instances[ids.player.hand[0]]?.status.offering).toBe(true);
  });

  it.each(resolvingMisuse)("$op refuses resolving ingress after committing the play", ({ card, op }) => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [card.id, v.vanilla1.id] }));
    const fold = createFoldAdapter(zones, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const played = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (played.kind !== "applied") throw new Error("bounced");
    const route = fold.pending(played.slice)!;
    expect(route.prompt.purpose.role).toBe("playRoute");
    const outcome = fold.reduce(played.slice, { kind: "answer", side: "player", promptId: route.prompt.id, value: 0 });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toContain(op);
    // The play commits; its resolution, which fails, commits and publishes nothing, so the card waits on the stack.
    expect(outcome.published.map((event) => event.kind)).toEqual(["cardPlayed"]);
    const after = outcome.slice.committed;
    expect(after.stack).toEqual([expect.objectContaining({ kind: "card", instance: ids.player.hand[0] })]);
    expect(after.sides.player.hand).toEqual([ids.player.hand[1]]);
    expect(after.floating).toEqual([]);
    expect(fold.pending(outcome.slice)).toBeNull();
  });
});
