// Checks of the battle screen's presentation (engine-design § Presentation)
// shared by its tests: each applied intent's items show boards that only
// move forward, the fold observes a bounded number of states and only at
// presented events, and no item shows a viewer a card it cannot identify.
// `replayObservedBatches` drives a recorded fuzz game through the shared
// fold adapter with the mounted feed's observation, as the screen sees it.
import { expect } from "vitest";
import { PRESENTATION_OBSERVATION } from "../../../battle/components/battle-presentation";
import { presentedAsItem, presentationItems, type PresentationItem } from "../../../battle/components/presentation-items";
import type { BattleState, Engine, EngineEvent, Side } from "../../../engine";
import { eventSeenBy } from "../../../engine/events";
import type { BattleIntent, BattleSlice } from "../../../engine/fold/slice";
import { promptFingerprint } from "../../../engine/prompts/fingerprint";
import { PHASES, SIDES, type BattleSeed, type InstanceId } from "../../../engine/state/ids";
import { fuzzInit, playRandomGame, type FuzzGame, type FuzzPool, type RecordedAction } from "../../../engine/testing/fuzz";
import { batchStates, foldAdapterFor } from "../../../rules/battle/engine-battle";
import { parsePresentationId } from "../../../types/identifiers";

/** One applied intent's events, the states they started from and arrive with, and the states observed at each. */
export interface ObservedBatch {
  readonly events: readonly EngineEvent[];
  readonly before: BattleState;
  readonly state: BattleState;
  readonly eventStates: readonly (BattleState | undefined)[];
}

/** An observed batch and the items one viewer is shown for it. */
export interface PresentedBatch {
  readonly before: BattleState;
  readonly state: BattleState;
  readonly eventStates: readonly (BattleState | undefined)[];
  readonly items: readonly PresentationItem[];
}

/** Where a card is on a board: its zone and holder, its position in play, or gone. */
function placeOf(state: BattleState, id: InstanceId): string {
  const instance = state.instances[id] as BattleState["instances"][InstanceId] | undefined;
  if (instance === undefined) return "gone";
  const side = state.sides[instance.controller];
  const slot = instance.zone === "play" ? `${String(side.backRank.indexOf(id))}/${String(side.frontRank.indexOf(id))}` : "";
  return `${instance.zone}:${instance.controller}:${slot}`;
}

const withoutRepeats = (places: readonly string[]) => places.filter((place, index) => places[index - 1] !== place);

/** The states a batch passes through in event order: where it started, each observed event's, and where it arrives. */
function trajectory(batch: PresentedBatch | ObservedBatch): BattleState[] {
  return [batch.before, ...batch.eventStates.filter((state): state is BattleState => state !== undefined), batch.state];
}

/**
 * Where the items' boards step back, in event order: a card returning to a
 * place it left, or the turn, phase, or a score going back. Empty when every
 * card visits its places in the order the batch moved it.
 */
export function boardRewinds(batch: PresentedBatch): string[] {
  const path = trajectory(batch);
  const boards = batch.items.map((item) => item.batch.state);
  const rewinds: string[] = [];
  const cards = new Set(path.flatMap((state) => Object.keys(state.instances) as InstanceId[]));
  for (const id of cards) {
    const places = withoutRepeats(path.map((state) => placeOf(state, id)));
    let at = 0;
    let shown: string | null = null;
    for (const item of batch.items) {
      const place = placeOf(item.batch.state, id);
      if (place === shown) continue;
      shown = place;
      const next = places.indexOf(place, at);
      if (next < 0) {
        rewinds.push(`${item.key}: ${id} shows at ${place} out of order (${places.join(" > ")})`);
        break;
      }
      at = next;
    }
  }
  const progress = (state: BattleState) => [
    state.turn.turnNumber * PHASES.length + PHASES.indexOf(state.turn.phase),
    ...SIDES.map((side) => state.sides[side].score),
  ];
  boards.forEach((state, index) => {
    const previous = progress(boards[index - 1] ?? batch.before);
    const current = progress(state);
    if (current.some((value, at) => value < (previous[at] ?? value))) {
      rewinds.push(`${batch.items[index]?.key ?? ""}: steps back from turn/phase/scores ${previous.join(",")} to ${current.join(",")}`);
    }
  });
  return rewinds;
}

/**
 * Every item's board in event order only moves forward: each card visits its
 * places in the order the batch moved it, never returning to one it left,
 * and the turn, phase, and scores never go back.
 */
export function expectForward(batch: PresentedBatch): void {
  const observed = batch.eventStates.filter((state): state is BattleState => state !== undefined);
  expect(observed).toHaveLength(batch.eventStates.length);
  expect(boardRewinds(batch)).toEqual([]);
}

/**
 * Where an observed batch breaks the feed's observation: a presented event
 * gets its own copy while the per-intent `limit` lasts and none after it,
 * and every other event shares the latest copy, or the state the batch
 * started from.
 */
export function observationViolations(batch: ObservedBatch, limit: number): string[] {
  const violations: string[] = [];
  const copies = new Set<BattleState>();
  let latest: BattleState | undefined = batch.before;
  batch.events.forEach((event, index) => {
    const state = batch.eventStates[index];
    if (!presentedAsItem(event)) {
      if (state !== latest) violations.push(`unpresented ${event.kind} #${String(index)} does not share the latest copy`);
      return;
    }
    if (copies.size >= limit) {
      if (state !== undefined) violations.push(`${event.kind} #${String(index)} is observed past the limit of ${String(limit)}`);
    } else if (state === undefined || state === batch.before || copies.has(state)) {
      violations.push(`presented ${event.kind} #${String(index)} has no copy of its own`);
    }
    if (state !== undefined) copies.add(state);
    latest = state;
  });
  return violations;
}

/**
 * Where `viewer`'s items show it what it may not see: an item for an event
 * hidden from it, or a board whose view identifies a card that the viewer's
 * view of no state the batch passes through identifies (an opponent's hand
 * card, a deck card).
 */
export function hiddenInformationLeaks(engine: Engine, viewer: Side, batch: ObservedBatch, items: readonly PresentationItem[]): string[] {
  const leaks: string[] = [];
  const path = trajectory(batch);
  const states = new Set(path);
  const identified = (state: BattleState) => Object.keys(engine.view(state, viewer).instances);
  const seen = new Set(path.flatMap(identified));
  for (const item of items) {
    const index = Number(item.key.split(":").pop());
    const event = batch.events[index];
    if (event === undefined || eventSeenBy(event, viewer, batch.state) === null) {
      leaks.push(`${viewer} is shown ${event?.kind ?? "a missing event"} #${String(index)}, hidden from it`);
    }
    if (states.has(item.batch.state)) continue;
    for (const id of identified(item.batch.state)) {
      if (!seen.has(id)) leaks.push(`${viewer} identifies ${id} at ${item.key}, which no state of the batch shows it`);
    }
  }
  return leaks;
}

/** The items `viewer` is shown for an observed batch, as the screen builds them. */
export function presentObserved(batch: ObservedBatch, viewer: Side, key: string): PresentedBatch {
  const presented = { key: parsePresentationId(key), state: batch.state };
  return { ...batch, items: presentationItems(batch.events, viewer, presented, batch.before, () => null, batch.eventStates) };
}

/** A recorded game: its init, the answers its creation took, and each action with the answers it took. */
export type RecordedGame = Pick<FuzzGame, "init" | "startAnswers" | "actions">;

/**
 * Plays the fuzz game of `seed` over `pool` with the Random policy on both
 * sides, as `playFuzzGame` does without its invariant checks, and records it.
 */
export function recordFuzzGame(engine: Engine, seed: BattleSeed, pool: FuzzPool): RecordedGame & { readonly ended: boolean } {
  const init = fuzzInit(seed, pool);
  let startAnswers: RecordedGame["startAnswers"] = [];
  const actions: RecordedAction[] = [];
  const game = playRandomGame(engine, init, {
    committed: (applied, chosen) => {
      if (chosen === null) startAnswers = applied.answers;
      else actions.push({ ...chosen, answers: applied.answers });
    },
  });
  return { init, startAnswers, actions, ended: game.end === "result" };
}

/**
 * Replays a recorded fuzz game through `engine`'s shared fold adapter with
 * the mounted feed's observation (`PRESENTATION_OBSERVATION`), suspending at
 * every prompt and answering it from the recording, and passes each applied
 * intent's observed batch to `visit`.
 */
export function replayObservedBatches(engine: Engine, game: RecordedGame, visit: (batch: ObservedBatch) => void): void {
  const fold = foldAdapterFor(engine);
  const apply = (slice: BattleSlice, intent: BattleIntent): BattleSlice => {
    const outcome = fold.reduce(slice, intent, PRESENTATION_OBSERVATION);
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`replayed ${intent.kind} failed`);
    visit({ events: outcome.published, ...batchStates(fold, slice, outcome.slice, outcome.published) });
    return outcome.slice;
  };
  const answerAll = (start: BattleSlice, answers: RecordedAction["answers"]): BattleSlice => {
    let slice = start;
    for (const recorded of answers.filter((answer) => answer.auto !== true)) {
      const pending = fold.pending(slice);
      if (pending === null) throw new Error("no pending prompt for a recorded answer");
      const { id, ...prompt } = pending.prompt;
      if (promptFingerprint(prompt) !== recorded.fingerprint) throw new Error("a replayed prompt differs from the recording");
      slice = apply(slice, { kind: "answer", side: pending.prompt.side, promptId: id, value: recorded.value });
    }
    return slice;
  };
  const started = fold.start(game.init);
  if (started.kind !== "applied") throw new Error("the replayed battle did not start");
  let slice = answerAll(started.slice, game.startAnswers);
  for (const { side, action, answers } of game.actions) {
    slice = answerAll(apply(slice, { kind: "battleAction", side, action }), answers);
  }
}
