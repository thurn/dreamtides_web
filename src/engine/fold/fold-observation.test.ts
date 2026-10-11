/**
 * Presentation observation through the fold: the presented states and
 * events an observer sees, within its limits.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import { boardState } from "../testing/board";
import { LOOP, LOOP_CARDS } from "../testing/loop-cards";
import { testCatalog } from "../testing/synthetic-cards";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type FoldObservation } from "./slice";
import { v, deck, drawThenDiscard, engine, slice, applied } from "./fold.fixtures";

describe("presentation observation", () => {
  /** The kinds a synthetic presentation shows. */
  const shownKinds: ReadonlySet<EngineEvent["kind"]> = new Set(["cardPlayed", "resolved", "materialized", "returnedToHand", "cardDrawn", "discarded"]);
  const shown = (event: EngineEvent) => shownKinds.has(event.kind);

  it("copies at most its limit of presented states in a long repeatLoop batch, without changing the fold", () => {
    const loops = createEngine(testCatalog(LOOP_CARDS));
    const { state, ids } = boardState(loops.catalog, { active: "player", phase: "day", scoreToWin: 1000, player: { hand: [LOOP.bouncer.id], deck } });
    const observedFold = createFoldAdapter(loops);
    const plainFold = createFoldAdapter(loops);
    const start: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
    const playBouncer: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } } };
    const played = applied(plainFold.reduce(start, playBouncer));
    const loop = played.committed.loops.candidate;
    if (loop === null) throw new Error("no loop offer");
    const observation: FoldObservation = { presented: shown, limit: 6 };
    const repeat: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "repeatLoop", loop: loop.id, count: 60 } };
    const outcome = observedFold.reduce(played, repeat, observation);
    expect(outcome).toEqual(plainFold.reduce(played, repeat));
    if (outcome.kind !== "applied") throw new Error("repeat bounced");

    const states = outcome.published.map((event) => observedFold.observed(event));
    const presentedAt = outcome.published.flatMap((event, index) => (shown(event) ? [index] : []));
    const copies = new Set(states.filter((observed) => observed !== undefined && observed !== played.committed));
    expect(presentedAt.length).toBeGreaterThan(observation.limit * 10);
    expect(copies.size).toBe(observation.limit);
    const kept = presentedAt.slice(0, observation.limit);
    expect(new Set(kept.map((index) => states[index])).size).toBe(observation.limit);
    expect(presentedAt.slice(observation.limit).every((index) => states[index] === undefined)).toBe(true);
    expect(states.slice(presentedAt[observation.limit]).every((observed) => observed === undefined)).toBe(true);
    // An unpresented event shares the latest presented copy, or the state the batch started from.
    states.forEach((observed, index) => {
      if (index >= (presentedAt[observation.limit] ?? 0) || presentedAt.includes(index)) return;
      const latest = presentedAt.filter((at) => at < index).pop();
      expect(observed).toBe(latest === undefined ? played.committed : states[latest]);
    });
    // The copies are the states at their own events: the points scored grow between them.
    const scores = kept.map((index) => states[index]?.sides.player.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(scores[0]).toBeLessThan(scores[scores.length - 1] ?? -1);
  });

  it("observes a run memoized while nothing observed, within its limit, publishing the memoized events", () => {
    const loops = createEngine(testCatalog(LOOP_CARDS));
    const { state, ids } = boardState(loops.catalog, { active: "player", phase: "day", scoreToWin: 1000, player: { hand: [LOOP.bouncer.id], deck } });
    const fold = createFoldAdapter(loops);
    const start: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
    const playBouncer: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand", slot: { rank: "back", index: 0 } } };
    const played = applied(fold.reduce(start, playBouncer));
    const loop = played.committed.loops.candidate;
    if (loop === null) throw new Error("no loop offer");
    const repeat: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "repeatLoop", loop: loop.id, count: 20 } };
    // As a reload's log replay does, fold the intent with nothing observing, memoizing its runs.
    const unobserved = fold.reduce(played, repeat);
    if (unobserved.kind !== "applied") throw new Error("repeat bounced");
    expect(unobserved.published.every((event) => fold.observed(event) === undefined)).toBe(true);

    const observation: FoldObservation = { presented: shown, limit: 6 };
    const outcome = fold.reduce(played, repeat, observation);
    expect(outcome).toEqual(createFoldAdapter(loops).reduce(played, repeat));
    if (outcome.kind !== "applied") throw new Error("repeat bounced");
    expect(outcome.published).toHaveLength(unobserved.published.length);
    expect(outcome.published.every((event, index) => event === unobserved.published[index])).toBe(true);
    const states = outcome.published.map((event) => fold.observed(event));
    const presentedAt = outcome.published.flatMap((event, index) => (shown(event) ? [index] : []));
    const kept = presentedAt.slice(0, observation.limit);
    expect(presentedAt.length).toBeGreaterThan(observation.limit);
    expect(new Set(states.filter((observed) => observed !== undefined && observed !== played.committed)).size).toBe(observation.limit);
    expect(new Set(kept.map((index) => states[index])).size).toBe(observation.limit);
    expect(presentedAt.slice(observation.limit).every((index) => states[index] === undefined)).toBe(true);
    // Each copy is the state at its own memoized event: the points scored grow between them.
    const scores = kept.map((index) => states[index]?.sides.player.score ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => a - b));
    expect(scores[0]).toBeLessThan(scores[scores.length - 1] ?? -1);
    // An observed memoized run keeps its states: a second observed fold copies nothing new.
    const again = fold.reduce(played, repeat, { presented: shown, limit: 64 });
    if (again.kind !== "applied") throw new Error("repeat bounced");
    expect(again.published.every((event, index) => fold.observed(event) === states[index])).toBe(true);
  });

  it("observes only the events an answer newly publishes, from the suspended display", () => {
    const { slice: start, ids } = slice({ active: "player", phase: "day", player: { hand: [drawThenDiscard.id, v.vanilla1.id], deck }, enemy: { deck } });
    const playCard: BattleIntent = { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } };
    /** Plays the card, then answers its discard prompt observing `presented`; the answer's outcome and pending display. */
    const answer = (presented: FoldObservation["presented"]) => {
      const observedFold = createFoldAdapter(engine);
      const seen: EngineEvent[] = [];
      const observation: FoldObservation = { presented: (event) => (seen.push(event), presented(event)), limit: 64 };
      const suspended = applied(observedFold.reduce(start, playCard, observation));
      const pending = observedFold.pending(suspended);
      if (pending === null) throw new Error("no discard prompt");
      seen.length = 0;
      const answered = observedFold.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[1]] }, observation);
      if (answered.kind !== "applied" || answered.published.length === 0) throw new Error("answer published nothing");
      return { observedFold, seen, published: answered.published, display: pending.display };
    };

    const presentedAnswer = answer(shown);
    expect(presentedAnswer.seen).toEqual(presentedAnswer.published);
    const discarded = presentedAnswer.published.find((event) => event.kind === "discarded");
    if (discarded === undefined) throw new Error("no discard");
    expect(presentedAnswer.observedFold.observed(discarded)?.sides.player.void).toContain(ids.player.hand[1]);
    const unpresented = answer(() => false);
    expect(unpresented.seen).toEqual(unpresented.published);
    expect(unpresented.published.every((event) => unpresented.observedFold.observed(event) === unpresented.display)).toBe(true);
  });
});
