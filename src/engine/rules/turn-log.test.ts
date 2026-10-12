import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../rules/battle/fold";
import type { EngineCardDefinition } from "../catalog";
import { all, characterYouControl, energy, event } from "../dsl/builders";
import { resolveEffect } from "../effects/interpreter";
import { gainEnergy } from "../effects/primitives/gain-energy";
import { giveAllTypes } from "../effects/primitives/give-all-types";
import { optional } from "../effects/primitives/optional";
import { rematerialize } from "../effects/primitives/rematerialize";
import { returnToHand } from "../effects/primitives/return-to-hand";
import { sequence } from "../effects/primitives/sequence";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../fold/slice";
import type { Action } from "./actions";
import { instanceOrigin } from "./activation";
import { instanceOf } from "./zones";
import { stateHash } from "../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState, MaterializedCard } from "../state/types";
import { NO_PROMPTS, ScriptedSource } from "../steps/sources";
import type { AnswerSource } from "../steps/types";
import { boardState, type BoardSetup } from "../testing/board";
import { determinizationDivergences } from "../testing/determinization-fidelity";
import { invariantViolations } from "../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { at, passUntil } from "../testing/trigger-harness";
import { materializedThisTurn } from "./turn-log";

function spell(index: number, abilities: EngineCardDefinition["abilities"], extra: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return {
    id: syntheticId(0x7a1e00 + index), cardType: "event", costs: [energy(0)], spark: null,
    subtype: "", speed: "standard", status: "authored", abilities, ...extra,
  };
}

/** "Your characters gain all character types this turn. Rematerialize them." */
const resurgence = spell(0, () => [event(sequence(giveAllTypes(all(characterYouControl()), "untilEndOfTurn"), rematerialize(all(characterYouControl()))))]);
/** "Return your characters to hand." */
const recall = spell(1, () => [event(returnToHand(all(characterYouControl())))]);
/** "Rematerialize your characters. You may gain 1●." */
const hesitant = spell(2, () => [event(sequence(rematerialize(all(characterYouControl())), optional(gainEnergy(1))))]);
/** Rematerializes your characters, then fails. */
const failing = spell(3, () => [], {
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, rematerialize(all(characterYouControl())), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
        controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("synthetic failure after a materialization");
    },
  },
});

const engine = createEngine(testCatalog([resurgence, recall, hesitant, failing]));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

const board = (player: BoardSetup["player"], enemy: BoardSetup["enemy"] = {}): BoardSetup => ({
  active: "player", phase: "day", player: { deck, energy: 5, ...player }, enemy: { deck, energy: 5, ...enemy },
});
const play = (card: InstanceId): Action => ({ kind: "play", card, from: "hand" });
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

/** Plays `card` for `side` and passes until the stack and trigger queue are empty. */
function resolved(state: BattleState, side: Side, card: InstanceId, source: AnswerSource = NO_PROMPTS) {
  const cast = engine.apply(state, side, play(card), source);
  const rest = passUntil(engine, cast.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: rest.state, events: [...cast.events, ...rest.events] };
}

const record = (instance: InstanceId, subtype: string, allTypes = false): MaterializedCard =>
  ({ instance, cardType: "character", subtype: subtype as MaterializedCard["subtype"], allTypes });

/** The instances each `materialized` event announced for `side`, in order. */
const announced = (events: readonly EngineEvent[], side: Side): InstanceId[] =>
  events.flatMap((event) => (event.kind === "materialized" && event.side === side ? [event.instance] : []));

/**
 * The player materializes a Survivor from hand, a figment copy of it that
 * ceases to exist, and rematerializes the Survivor after it gains all
 * character types, while the enemy materializes a Warrior in response.
 */
function materializingTurn() {
  const { state, ids } = boardState(engine.catalog, board(
    { hand: [v.survivorVictim.id, v.dissolveFigmentCopy.id, resurgence.id, recall.id] },
    { hand: [v.interruptCharacter.id] },
  ));
  const [survivor, copier, resurging, recalling] = ids.player.hand;
  const [interrupt] = ids.enemy.hand;
  const first = resolved(state, "player", survivor);
  const copied = resolved(first.state, "player", copier, new ScriptedSource([[survivor]]));
  const cast = engine.apply(copied.state, "player", play(resurging), NO_PROMPTS);
  const responded = engine.apply(cast.state, "enemy", play(interrupt), NO_PROMPTS);
  const rest = passUntil(engine, responded.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0);
  const events = [...first.events, ...copied.events, ...cast.events, ...responded.events, ...rest.events];
  const [copy] = announced(copied.events, "player");
  if (copy === undefined) throw new Error("expected a figment copy to materialize");
  return { start: state, state: rest.state, events, survivor, copy, interrupt, recalling, ids };
}

const decklists = {
  player: [v.survivorVictim.id, v.dissolveFigmentCopy.id, resurgence.id, recall.id, ...deck].map((cardId) => ({ cardId })),
  enemy: [v.interruptCharacter.id, ...deck].map((cardId) => ({ cardId })),
};

describe("turn log materializations", () => {
  it("lists each side's announced characters in order, as announced, including figments and rematerializations", () => {
    const { start, state, events, survivor, copy, interrupt } = materializingTurn();
    expect(materializedThisTurn(start, "player")).toEqual([]);
    expect(state.instances[copy]).toBeUndefined();
    expect(state.turnLog.materialized).toEqual({
      // The Survivor's first record keeps the types it had then, though it now has all character types.
      player: [record(survivor, "Survivor"), record(copy, "Survivor"), record(survivor, "Survivor", true)],
      enemy: [record(interrupt, "Warrior")],
    });
    for (const side of SIDES) expect(materializedThisTurn(state, side).map((card) => card.instance)).toEqual(announced(events, side));
    expect(invariantViolations(state, engine.catalog)).toEqual([]);
  });

  it("starts empty each turn", () => {
    const { state } = materializingTurn();
    const enemyDay = passUntil(engine, state, at(engine, "enemy", "day")).state;
    expect(enemyDay.turnLog.materialized).toEqual({ player: [], enemy: [] });
  });

  it("names in views only the instances the viewer can identify, and determinizes back to the same records", () => {
    const { state: turn, survivor, interrupt, recalling } = materializingTurn();
    const returned = resolved(turn, "player", recalling).state;
    expect(returned.instances[survivor]?.zone).toBe("hand");
    // As after a shuffle and a redraw: the enemy no longer identifies the Survivor in the player's hand.
    const hidden: BattleState = { ...returned, knownTo: { ...returned.knownTo, enemy: returned.knownTo.enemy.filter((id) => id !== survivor) } };
    const instances = (viewer: Side, side: Side) => engine.view(hidden, viewer).turnLog.materialized[side].map((card) => card.instance);
    expect(instances("player", "player")).toEqual([survivor, null, survivor]);
    expect(instances("enemy", "player")).toEqual([null, null, null]);
    for (const viewer of SIDES) expect(instances(viewer, "enemy")).toEqual([interrupt]);
    expect(engine.view(hidden, "enemy").turnLog.materialized.player.map((card) => card.subtype)).toEqual(["Survivor", "Survivor", "Survivor"]);
    for (const viewer of SIDES) {
      const seen = engine.view(hidden, viewer);
      const sampled = engine.determinize(seen, decklists, () => 0.5);
      expect(engine.view(sampled, viewer).turnLog).toEqual(seen.turnLog);
    }
    expect(determinizationDivergences(engine, hidden, decklists, battleSeed("materialized-turn-log"), 0)).toEqual([]);
  });
});

describe("turn log materialization recovery", () => {
  it("records a materialization once across a prompt, a reload, and stale or foreign answers", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [hesitant.id], back: [v.vanilla1.id] }, { hand: [v.interruptEvent.id] }));
    const character = ids.player.back[0]!;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const suspended = applied(fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const pending = fold.pending(suspended);
    if (pending === null) throw new Error("expected the optional energy prompt");
    expect(suspended.committed.turnLog.materialized).toEqual({ player: [], enemy: [] });
    expect(pending.display.turnLog.materialized?.player).toEqual([record(character, "Warrior")]);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const done = applied(fresh.reduce(reloaded, answer));
    expect(done.inFlight).toBeNull();
    expect(done.committed.turnLog.materialized).toEqual({ player: [record(character, "Warrior")], enemy: [] });
    const direct = applied(fold.reduce(suspended, answer));
    expect(stateHash(direct.committed)).toBe(stateHash(done.committed));
  });

  it("rolls a materialization back with the step that failed after announcing it", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [failing.id], back: [v.vanilla1.id] }, { hand: [v.interruptEvent.id] }));
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const outcome = fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (outcome.kind !== "applied") throw new Error("expected an applied intent with an error");
    expect(outcome.error).not.toBeNull();
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(cast.committed);
    expect(outcome.slice.committed.turnLog.materialized).toEqual({ player: [], enemy: [] });
  });

  it("saves and loads the record, loads a turn log without it, and rejects malformed records", () => {
    const { state, survivor } = materializingTurn();
    const load = (turnLog: unknown) => parseJourneyBattleFoldState(savedJourney(sliceOf({ ...state, turnLog } as BattleState)));
    const loaded = load(state.turnLog);
    expect(loaded).not.toBeNull();
    expect(loaded!.engine.slice.committed.turnLog).toEqual(state.turnLog);
    const { materialized: _materialized, ...older } = state.turnLog;
    const legacy = load(older);
    expect(legacy).not.toBeNull();
    const legacyState = legacy!.engine.slice.committed;
    expect(materializedThisTurn(legacyState, "player")).toEqual([]);
    expect(engine.view(legacyState, "player").turnLog.materialized).toEqual({ player: [], enemy: [] });
    const good = record(survivor, "Survivor");
    for (const malformed of [
      null, [], { player: [] }, { player: [], enemy: [], neutral: [] }, { player: good, enemy: [] },
      { player: [{ ...good, instance: 7 }], enemy: [] }, { player: [{ ...good, instance: "survivor" }], enemy: [] },
      { player: [{ ...good, cardType: "dream" }], enemy: [] }, { player: [{ ...good, subtype: 3 }], enemy: [] },
      { player: [{ ...good, allTypes: "yes" }], enemy: [] }, { player: [{ cardType: "character", subtype: "Survivor", allTypes: false }], enemy: [] },
    ]) {
      expect(load({ ...state.turnLog, materialized: malformed }), JSON.stringify(malformed)).toBeNull();
    }
  });

  it("continues recording on a state loaded without the record", () => {
    const { state, ids } = boardState(engine.catalog, board({ hand: [v.survivorVictim.id] }));
    const { materialized: _materialized, ...older } = state.turnLog;
    const after = resolved({ ...state, turnLog: older }, "player", ids.player.hand[0]).state;
    expect(after.turnLog.materialized).toEqual({ player: [record(ids.player.hand[0], "Survivor")], enemy: [] });
  });
});

/** A saved journey battle around `slice`, as a save file holds it. */
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null, cardDefinitions: [],
    },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  };
}
