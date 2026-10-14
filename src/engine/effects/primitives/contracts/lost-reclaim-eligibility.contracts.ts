/** Public play eligibility and recovery for a printed Reclaim whose keyword is lost. */
import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../../../battle/ui/engine-card-model";
import { buildEngineBattleScreenModel, enginePrintedKeywords } from "../../../../screens/cumulus_adapters/engine-battle-view-model";
import { parseBattleCardId, parseBattleId } from "../../../../types/identifiers";
import { testCardSubtype } from "../../../../types/test-identities";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, energy, everyIn, keyword, reclaim, self, staticAbility } from "../../../dsl/builders";
import { NO_DECK_MODS } from "../../../dsl/types";
import { createEngine, IllegalAction, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { dissolve } from "../dissolve";
import { loseKeyword } from "../grant";
import { grantReclaim } from "../grant-reclaim";
import { loseAllAbilities } from "../lose-all-abilities";
import { playFromZone } from "../play-from-zone";
import { sequence } from "../sequence";

function card(index: number, abilities: EngineCardDefinition["abilities"], cost = 7): EngineCardDefinition {
  return {
    id: syntheticId(0x37200 + index),
    cardType: "character",
    costs: [energy(cost)],
    spark: 1,
    subtype: testCardSubtype("Fixture Warrior"),
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const printed = card(0, () => [reclaim(energy(3)), activated([], dissolve(self()))]);
const lost = card(1, () => [
  reclaim(energy(3)),
  activated([], sequence(loseKeyword(self(), "reclaim", "untilEndOfTurn"), dissolve(self()))),
]);
const otherLoss = card(2, () => [
  reclaim(energy(3)),
  activated([], sequence(loseKeyword(self(), "vengeful", "untilEndOfTurn"), dissolve(self()))),
]);
const allLoss = card(3, () => [
  reclaim(energy(3)),
  activated([], sequence(loseAllAbilities(self(), { duration: "untilEndOfTurn" }), dissolve(self()))),
]);
const plain = card(4, () => [keyword("reclaim")]);
const grants = card(5, () => [
  activated([], grantReclaim(everyIn("void"))),
  activated([], grantReclaim(everyIn("void"), { costs: [energy(2)] })),
]);
const permission = card(6, () => [staticAbility(playFromZone("void", { cardType: "character" }))]);
const filler = card(7, () => [], 1);
const definitions = [printed, lost, otherLoss, allLoss, plain, grants, permission, filler];
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });

function placed(engine: Engine, side: Side, setup: SideSetup) {
  const deck = Array.from({ length: 8 }, () => filler.id);
  return boardState(engine.catalog, {
    active: side,
    phase: "day",
    player: { deck },
    enemy: { deck },
    [side]: { deck, energy: 20, ...setup },
  });
}

function perform(engine: Engine, state: BattleState, side: Side, action: Action): BattleState {
  const announced = engine.apply(state, side, action, NO_PROMPTS);
  const resolved = passUntil(engine, announced.state, (next) => next.stack.length === 0).state;
  expect(invariantViolations(resolved, engine.catalog)).toEqual([]);
  return resolved;
}

function play(card: InstanceId): Action {
  return { kind: "play", card, from: "void" };
}

function offers(engine: Engine, state: BattleState, side: Side, card: InstanceId): boolean {
  return engine.legalActions(state, side).some((action) => action.kind === "play" && action.card === card && action.from === "void");
}

function screen(engine: Engine, state: BattleState, side: Side) {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-lost-reclaim-fixture"),
    human: side,
    view: engine.view(state, side),
    legal: engine.legalActions(state, side),
    prompt: null,
    playing: null,
    decision: engine.decision(state),
    presented: true,
    notice: null,
    cards,
    catalog: engine.catalog,
    printedKeywords: enginePrintedKeywords(engine.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 0,
    resultDismissed: false,
  });
}

function expectReclaimPayment(engine: Engine, state: BattleState, side: Side, card: InstanceId, cost: number) {
  expect(offers(engine, state, side, card)).toBe(true);
  const announced = engine.apply(state, side, play(card), NO_PROMPTS);
  expect(announced.events).toContainEqual({ kind: "cardPlayed", side, instance: card });
  expect(announced.state.sides[side].currentEnergy).toBe(state.sides[side].currentEnergy - cost);
  expect(announced.state.instances[card].status.reclaimed).toBe(true);
  expect(announced.state.instances[card].status.playedViaReclaim).toBe(true);
  return passUntil(engine, announced.state, (next) => next.stack.length === 0).state;
}

describe.each(["player", "enemy"] as const)("printed Reclaim after keyword loss: %s", (side) => {
  const engine = createEngine(testCatalog(definitions));

  it("preserves printed explicit and plain Reclaim costs as actual legal plays", () => {
    const setup = placed(engine, side, { void: [printed.id, plain.id] });
    const [explicit, normal] = setup.ids[side].void;
    expectReclaimPayment(engine, setup.state, side, explicit, 3);
    expectReclaimPayment(engine, setup.state, side, normal, 7);
  });

  it("preserves a deck-entry explicit Reclaim after normal hand play and dissolution", () => {
    const setup = placed(engine, side, {
      hand: [{ cardId: printed.id, amplified: false, deckMods: { ...NO_DECK_MODS, reclaim: 2 } }],
    });
    const card = setup.ids[side].hand[0];
    const inPlay = perform(engine, setup.state, side, { kind: "play", card, from: "hand" });
    const inVoid = perform(engine, inPlay, side, { kind: "activate", source: card, ability: 1 });
    expect(inVoid.instances[card].zone).toBe("void");
    expectReclaimPayment(engine, inVoid, side, card, 2);
  });

  it("rejects a lost printed Reclaim across public actions, affordances, reload and expiry", () => {
    const setup = placed(engine, side, { back: [lost.id] });
    const card = setup.ids[side].back[0]!;
    const inVoid = perform(engine, setup.state, side, { kind: "activate", source: card, ability: 1 });
    expect(inVoid.instances[card].zone).toBe("void");
    expect(inVoid.floating).toContainEqual(expect.objectContaining({
      expiry: { at: "endOfTurn" },
      change: { kind: "keyword", instance: card, keyword: "reclaim", gains: false },
    }));
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(inVoid, viewer).instances[card]?.characteristics.keywords).not.toContain("reclaim");
    }
    const reloaded = deserializeState(serializeState(inVoid));
    expect(stateHash(reloaded)).toBe(stateHash(inVoid));
    for (const committed of [inVoid, reloaded]) {
      const fresh = createEngine(testCatalog(definitions));
      const before = stateHash(committed);
      expect(offers(fresh, committed, side, card), "lost route must be absent").toBe(false);
      expect(offers(fresh, committed, opponent(side), card)).toBe(false);
      expect(screen(fresh, committed, side).affordances.voidPlays.has(parseBattleCardId(card))).toBe(false);
      expect(() => fresh.apply(committed, side, play(card), NO_PROMPTS)).toThrow(IllegalAction);
      const slice: BattleSlice = { committed, inFlight: null, publishedEvents: 0, attempt: 0 };
      const records: unknown[] = [];
      const fold = createFoldAdapter(fresh, { log: (record) => records.push(record) });
      expect(fold.reduce(slice, { kind: "battleAction", side, action: play(card) })).toEqual({ kind: "bounced", reason: "illegalAction" });
      expect(records).toEqual([]);
      expect(stateHash(committed)).toBe(before);
    }
    const ended = passUntil(engine, inVoid, at(engine, opponent(side), "day")).state;
    const restored = passUntil(engine, ended, at(engine, side, "day")).state;
    expect(restored.floating).toEqual([]);
    expectReclaimPayment(engine, restored, side, card, 3);
  });

  it("lets later real grants restore the keyword and choose its printed or latest granted cost", () => {
    const setup = placed(engine, side, { back: [lost.id, grants.id] });
    const card = setup.ids[side].back[0]!;
    const source = setup.ids[side].back[1]!;
    const inVoid = perform(engine, setup.state, side, { kind: "activate", source: card, ability: 1 });
    expect(offers(engine, inVoid, side, card), "loss precedes any later grant").toBe(false);
    const regained = perform(engine, inVoid, side, { kind: "activate", source, ability: 0 });
    expectReclaimPayment(engine, regained, side, card, 3);
    const explicit = perform(engine, regained, side, { kind: "activate", source, ability: 1 });
    expectReclaimPayment(engine, explicit, side, card, 2);
    const retained = perform(engine, explicit, side, { kind: "activate", source, ability: 0 });
    expectReclaimPayment(engine, retained, side, card, 2);
  });

  it("keeps an independent normal-cost permission without offering a lost Reclaim choice", () => {
    const setup = placed(engine, side, { back: [lost.id, permission.id] });
    const card = setup.ids[side].back[0]!;
    const inVoid = perform(engine, setup.state, side, { kind: "activate", source: card, ability: 1 });
    expect(offers(engine, inVoid, side, card)).toBe(true);
    expect(screen(engine, inVoid, side).affordances.voidPlays.has(parseBattleCardId(card))).toBe(true);
    const fold = createFoldAdapter(engine);
    const slice: BattleSlice = { committed: inVoid, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(slice, { kind: "battleAction", side, action: play(card) });
    if (outcome.kind !== "applied") throw new Error("permission play was rejected");
    expect(outcome.error).toBeNull();
    expect(fold.pending(outcome.slice), "permission is the only available route").toBeNull();
    expect(outcome.published).toContainEqual({ kind: "cardPlayed", side, instance: card });
    expect(outcome.slice.committed.sides[side].currentEnergy).toBe(inVoid.sides[side].currentEnergy - 7);
    expect(outcome.slice.committed.instances[card].status.reclaimed).toBe(false);
    expect(outcome.slice.committed.instances[card].status.playedViaReclaim).toBe(false);
  });

  it("preserves printed Reclaim when an unrelated keyword is lost", () => {
    const setup = placed(engine, side, { back: [otherLoss.id] });
    const card = setup.ids[side].back[0]!;
    const inVoid = perform(engine, setup.state, side, { kind: "activate", source: card, ability: 1 });
    expectReclaimPayment(engine, inVoid, side, card, 3);
  });

  it("restores printed Reclaim when losing all abilities ends on departure", () => {
    const setup = placed(engine, side, { back: [allLoss.id] });
    const card = setup.ids[side].back[0]!;
    const inVoid = perform(engine, setup.state, side, { kind: "activate", source: card, ability: 1 });
    expect(inVoid.floating).toEqual([]);
    expectReclaimPayment(engine, inVoid, side, card, 3);
  });
});
