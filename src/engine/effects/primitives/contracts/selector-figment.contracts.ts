import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { all, characterYouControl, controlsNone, count, event } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import { onDawn, onMaterialized, onNight, triggered } from "../../../dsl/triggers";
import type { CharacterSelector, Condition } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { opponent, parseFigmentId, type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState, placeFigment, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { promptView, view } from "../../../view/view";
import { conditionHolds, resolveEffect } from "../../interpreter";
import { abandon } from "../abandon";
import { dissolve } from "../dissolve";
import { eachPlayer } from "../each-player";
import { gainEnergy } from "../gain-energy";
import { materializeFigments } from "../materialize-figments";
import { deck, v } from "./cards-support";

/** Synthetic figment types: a 2✦ Shadow and a 1✦ Warrior. */
const SHADOW: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(6400)), subtype: "Shadow", spark: 2, status: "authored", abilities: () => [] };
const WARRIOR: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(6401)), subtype: "Warrior", spark: 1, status: "authored", abilities: () => [] };

/** A non-figment character with the Shadow subtype. */
const shadowCharacter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(6402), subtype: "Shadow" };
const nonFigment = (): Omit<CharacterSelector, "controller"> => ({ figment: false });
const shadowFigments = characterYouControl({ figment: true, subtype: "Shadow" });

/** "▸Materialized: Each player abandons a non-figment character." */
const avenger: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(6403), status: "authored",
  abilities: () => [triggered(onMaterialized(), eachPlayer(abandon("you", nonFigment())))],
};
/** Resolves "each player abandons a non-figment character", then fails in the same step. */
const abandonsThenFails: EngineCardDefinition = {
  ...v.event0, id: syntheticId(6404), status: "authored", abilities: () => [event(eachPlayer(abandon("you", nonFigment())))],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, eachPlayer(abandon("you", nonFigment())), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after each player's abandon");
    },
  },
};
/** "▸Dawn: Gain 1● for each figment you control." */
const gatherer: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(6405), status: "authored",
  abilities: () => [triggered(onDawn(), gainEnergy(count(characterYouControl({ figment: true }))))],
};
/** "▸Night: If you control no shadow figments, materialize a 3✦ shadow figment." */
const mariner: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(6406), status: "authored",
  abilities: () => [triggered(onNight(), materializeFigments(SHADOW.id, 1, { spark: 3 }), { condition: controlsNone(shadowFigments) })],
};
/** "▸Night: Dissolve each figment you control." */
const sweeper: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(6407), status: "authored",
  abilities: () => [triggered(onNight(), dissolve(all(characterYouControl({ figment: true }))))],
};

const engine = createEngine(testCatalog([shadowCharacter, avenger, abandonsThenFails, gatherer, mariner, sweeper], {}, [SHADOW, WARRIOR]));

const shadowAt = (state: BattleState, side: Side, index: number) =>
  placeFigment(state, side, { rank: "back", index }, { kind: "figment", figment: SHADOW.id, spark: 2 });
const warriorAt = (state: BattleState, side: Side, index: number) =>
  placeFigment(state, side, { rank: "back", index }, { kind: "figment", figment: WARRIOR.id, spark: 1 });
const shadowCopyAt = (state: BattleState, side: Side, index: number) =>
  placeFigment(state, side, { rank: "back", index }, { kind: "figmentCopy", cardId: shadowCharacter.id, spark: null });

const holds = (state: BattleState, condition: Condition, controller: Side, source: InstanceId) =>
  conditionHolds(state, engine.catalog, condition, { controller, source, optionalPaid: [] });

const figmentsOf = (state: BattleState, side: Side, figment = SHADOW.id) =>
  state.sides[side].backRank.filter((id): id is InstanceId => {
    const printing = id === null ? undefined : state.instances[id]?.printing;
    return printing?.kind === "figment" && printing.figment === figment;
  });

const queuedFrom = (events: readonly EngineEvent[], source: InstanceId) =>
  events.filter((e) => e.kind === "triggerQueued" && e.source === source);

const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};

describe("figment selectors", () => {
  it("match figments with figment copies, non-figments without them, and a figment subtype only among figments", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [shadowCharacter.id, v.vanilla1.id], deck }, enemy: { back: [v.vanilla2.id], deck },
    });
    const shadow = shadowAt(state, "player", 2);
    const warrior = warriorAt(state, "player", 3);
    const copy = shadowCopyAt(state, "player", 4);
    const enemyShadow = shadowAt(state, "enemy", 1);
    const match = (selector: CharacterSelector, controller: Side = "player") => matchingCharacters(state, engine.catalog, selector, controller, ids.enemy.back[0]!);
    expect(match(characterYouControl({ figment: true }))).toEqual([shadow, warrior, copy]);
    expect(match(characterYouControl({ figment: false }))).toEqual(ids.player.back);
    expect(match(shadowFigments)).toEqual([shadow, copy]);
    expect(match(shadowFigments, "enemy")).toEqual([enemyShadow]);
    expect(match(characterYouControl({ figment: false, subtype: "Shadow" }))).toEqual([ids.player.back[0]]);
  });

  it("holds 'controls no …' only while nothing its controller controls matches, and bounds 'controls' from above", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { back: [shadowCharacter.id], deck }, enemy: { deck },
    });
    const holdsFor = (condition: Condition, controller: Side) => holds(state, condition, controller, ids.player.back[0]!);
    warriorAt(state, "player", 1);
    shadowAt(state, "enemy", 0);
    // A non-figment Shadow, a Warrior figment, and the opponent's shadow figment are no shadow figment of yours.
    expect(holdsFor(controlsNone(shadowFigments), "player")).toBe(true);
    expect(holdsFor(controlsNone(shadowFigments), "enemy")).toBe(false);
    shadowCopyAt(state, "player", 2);
    expect(holdsFor(controlsNone(shadowFigments), "player")).toBe(false);
    const figments = characterYouControl({ figment: true });
    expect(holdsFor({ cond: "controls", selector: figments, atLeast: 1, atMost: 2 }, "player")).toBe(true);
    shadowAt(state, "player", 3);
    expect(holdsFor({ cond: "controls", selector: figments, atLeast: 1, atMost: 2 }, "player")).toBe(false);
    expect(holdsFor({ cond: "controls", selector: figments, atLeast: 3 }, "player")).toBe(true);
  });
});

describe("a count of figments you control", () => {
  /** The player's energy once their next Day begins, from the enemy's Day with `figments` placed first. */
  const energyAtDay = (figments: (state: BattleState) => void) => {
    const { state } = boardState(engine.catalog, {
      active: "enemy", phase: "day", player: { back: [gatherer.id, v.vanilla1.id], deck }, enemy: { back: [v.vanilla2.id], deck },
    });
    figments(state);
    return passUntil(engine, state, at(engine, "player", "day")).state.sides.player.currentEnergy;
  };

  it("gains one energy per figment its controller controls as it resolves, figment copies included", () => {
    const base = energyAtDay(() => {});
    const counted = energyAtDay((state) => {
      shadowAt(state, "player", 2);
      warriorAt(state, "player", 3);
      shadowCopyAt(state, "player", 4);
      shadowAt(state, "enemy", 1);
      warriorAt(state, "enemy", 2);
    });
    expect(counted - base).toBe(3);
  });
});

describe("an intervening 'if you control no shadow figments'", () => {
  /** Passes from the player's Day through their Night to the enemy's Day. */
  const throughNight = (back: readonly CardId[], place: (state: BattleState) => void = () => {}) => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back, deck }, enemy: { back: [v.vanilla2.id], deck } });
    place(state);
    const run = passUntil(engine, state, at(engine, "enemy", "day"));
    return { ...run, ids, start: state };
  };

  it("materializes one figment with the stated spark when its controller controls none, ignoring other figments and non-figment Shadows", () => {
    const run = throughNight([mariner.id, shadowCharacter.id], (state) => {
      warriorAt(state, "player", 2);
      shadowAt(state, "enemy", 1);
    });
    const mine = run.ids.player.back[0]!;
    expect(queuedFrom(run.events, mine)).toHaveLength(1);
    const made = figmentsOf(run.state, "player");
    expect(made).toHaveLength(1);
    expect(run.state.instances[made[0]]).toMatchObject({ printing: { kind: "figment", figment: SHADOW.id, spark: 3 }, controller: "player" });
    expect(figmentsOf(run.state, "enemy")).toHaveLength(1);
    expect(unannouncedChanges(run.events, run.start, run.state)).toEqual([]);
    expect(invariantViolations(run.state, engine.catalog)).toEqual([]);
  });

  it.each(["figment", "figment copy"] as const)("does not trigger while its controller controls a shadow %s", (kind) => {
    const run = throughNight([mariner.id], (state) => (kind === "figment" ? shadowAt : shadowCopyAt)(state, "player", 1));
    expect(queuedFrom(run.events, run.ids.player.back[0]!)).toEqual([]);
    expect(run.events.filter((e) => e.kind === "cardCreated" || e.kind === "materialized")).toEqual([]);
  });

  it("checks as the trigger event happens: a shadow figment that leaves before it would resolve still stops it", () => {
    // B0 dissolves the shadow figment first; an effect-only check would then materialize a new one.
    const run = throughNight([sweeper.id, mariner.id], (state) => shadowAt(state, "player", 2));
    expect(queuedFrom(run.events, run.ids.player.back[0]!)).toHaveLength(1);
    expect(queuedFrom(run.events, run.ids.player.back[1]!)).toEqual([]);
    expect(figmentsOf(run.state, "player")).toEqual([]);
  });

  it("checks again as it resolves: a shadow figment made after it triggered stops it", () => {
    const run = throughNight([mariner.id, mariner.id]);
    const [first, second] = run.ids.player.back as InstanceId[];
    expect(queuedFrom(run.events, first)).toHaveLength(1);
    expect(queuedFrom(run.events, second)).toHaveLength(1);
    expect(run.events.filter((e) => e.kind === "triggerResolved").map((e) => [e.source, e.applied])).toEqual([[first, true], [second, false]]);
    expect(figmentsOf(run.state, "player")).toHaveLength(1);
  });
});

describe("each player abandons a non-figment character", () => {
  /**
   * The active player plays the Materialized character; each side controls
   * one non-figment character and figments, the enemy also a figment copy.
   */
  const opened = (active: Side, enemyOnlyFigments = false) => {
    const other = opponent(active);
    const board: BoardSetup = {
      active, phase: "day",
      [active]: { hand: [avenger.id, v.vanilla1.id], back: [v.vanilla1.id], energy: 4, deck },
      [other]: { hand: [v.vanilla3.id], back: enemyOnlyFigments ? [null, null] : [v.vanilla2.id, v.vanilla3.id], deck },
    };
    const { state, ids } = boardState(engine.catalog, board);
    const figments = [shadowAt(state, active, 1), shadowAt(state, other, 2), warriorAt(state, other, 3), shadowCopyAt(state, other, 4)];
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    let slice = applied(fold.reduce(start, { kind: "battleAction", side: active, action: { kind: "play", card: ids[active].hand[0], from: "hand", slot: { rank: "back", index: 2 } } }));
    for (let passes = 0; fold.pending(slice) === null && passes < 4; passes++) {
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: slice.committed.priority ?? active, action: { kind: "pass" } }));
    }
    return { fold, slice, ids, figments, other, played: ids[active].hand[0] };
  };

  it.each(["player", "enemy"] as const)("prompts the active player (%s) first, then the other, each offered only their own non-figments, without leaking hands", (active) => {
    const { fold, slice, ids, figments, other, played } = opened(active);
    const first = fold.pending(slice)!;
    expect(first.prompt).toMatchObject({
      kind: "chooseCards", side: active, candidates: [ids[active].back[0], played], min: 1, max: 1,
      cancellable: false, purpose: { role: "abandon", source: played, cardId: avenger.id },
    });
    expect(first.prompt.privateTo).toBeUndefined();
    for (const viewer of [active, other]) {
      expect(promptView(first.prompt, viewer, first.display)).toMatchObject({ candidates: [ids[active].back[0], played] });
      const battle = view(first.display, viewer, engine.catalog);
      for (const hidden of first.display.sides[opponent(viewer)].hand) expect(battle.instances[hidden]).toBeUndefined();
    }
    const afterFirst = applied(fold.reduce(slice, { kind: "answer", side: active, promptId: first.prompt.id, value: [ids[active].back[0]!] }));
    const second = fold.pending(afterFirst)!;
    expect(second.prompt).toMatchObject({ kind: "chooseCards", side: other, candidates: ids[other].back, purpose: { role: "abandon" } });
    const outcome = fold.reduce(afterFirst, { kind: "answer", side: other, promptId: second.prompt.id, value: [ids[other].back[0]!] });
    const done = applied(outcome);
    expect(fold.pending(done)).toBeNull();
    expect(done.committed.sides[active].void).toContain(ids[active].back[0]);
    expect(done.committed.sides[other].void).toEqual([ids[other].back[0]]);
    expect(done.committed.instances[ids[other].back[1]!].zone).toBe("play");
    expect(done.committed.instances[played].zone).toBe("play");
    for (const figment of figments) expect(done.committed.instances[figment].zone).toBe("play");
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    expect(outcome.published.filter((e) => e.kind === "abandoned")).toEqual([{ kind: "abandoned", instance: ids[other].back[0], side: other }]);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("skips a player who controls only figments without prompting them", () => {
    const { fold, slice, ids, figments } = opened("player", true);
    const first = fold.pending(slice)!;
    const done = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: first.prompt.id, value: [ids.player.back[0]!] }));
    expect(fold.pending(done)).toBeNull();
    for (const figment of figments) expect(done.committed.instances[figment].zone).toBe("play");
    expect(done.committed.sides.enemy.void).toEqual([]);
  });

  it("reloads to the second player's prompt and rejects stale, foreign, figment, departed and concurrent input before accepting once", () => {
    const { fold, slice, ids, figments } = opened("player");
    const first = fold.pending(slice)!;
    const departed = ids.player.back[0]!;
    const afterFirst = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: first.prompt.id, value: [departed] }));
    const saved = JSON.parse(JSON.stringify(afterFirst)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const second = fresh.pending(saved)!;
    expect(second).toEqual(fold.pending(afterFirst));
    const hash = stateHash(saved.committed);
    const answer = (side: Side, value: readonly InstanceId[], promptId = second.prompt.id) => fresh.reduce(saved, { kind: "answer", side, promptId, value });
    expect(answer("enemy", [ids.enemy.back[0]!], first.prompt.id)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("player", [ids.enemy.back[0]!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    // Figments and figment copies never match; the first player's abandoned character has left play.
    for (const value of [[], [figments[1]], [figments[2]], [figments[3]], [departed], [ids.player.hand[1]], [ids.enemy.back[0]!, figments[1]]]) {
      expect(answer("enemy", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "cancel", side: "enemy", promptId: second.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(saved.committed)).toBe(hash);
    const intent = { kind: "answer" as const, side: "enemy" as const, promptId: second.prompt.id, value: [ids.enemy.back[0]!] };
    const done = applied(fresh.reduce(saved, intent));
    expect(done).toEqual(applied(fold.reduce(afterFirst, intent)));
    expect(done.committed.sides.enemy.void).toEqual([ids.enemy.back[0]]);
    expect(fresh.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("rolls back an error after both abandons without a partial committed move or a published event", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { hand: [abandonsThenFails.id], back: [v.vanilla1.id, v.vanilla1.id], energy: 4, deck }, enemy: { back: [v.vanilla2.id, v.vanilla3.id], deck },
    });
    const figment = shadowAt(state, "enemy", 2);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const slice = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const first = fold.pending(slice)!;
    const afterFirst = applied(fold.reduce(slice, { kind: "answer", side: "player", promptId: first.prompt.id, value: [ids.player.back[0]!] }));
    const second = fold.pending(afterFirst)!;
    expect(second.prompt).toMatchObject({ side: "enemy", candidates: ids.enemy.back });
    const outcome = fold.reduce(afterFirst, { kind: "answer", side: "enemy", promptId: second.prompt.id, value: [ids.enemy.back[0]!] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.inFlight).toBeNull();
    expect(outcome.slice.committed).toEqual(slice.committed);
    expect(outcome.slice.committed.instances[ids.player.back[0]!].zone).toBe("play");
    expect(outcome.slice.committed.instances[ids.enemy.back[0]!].zone).toBe("play");
    expect(outcome.slice.committed.instances[figment].zone).toBe("play");
    expect(fold.pending(outcome.slice)).toBeNull();
    expect(outcome.error.message).toContain("synthetic failure after each player's abandon");
  });
});
