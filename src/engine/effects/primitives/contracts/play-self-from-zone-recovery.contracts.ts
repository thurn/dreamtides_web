import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import type { Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { fromVoid } from "./play-from-zone-support";
import { BANISH, engine, payers, placed, SELF, voidPlays } from "./play-self-from-zone-support";

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("playSelfFromZone recovery", () => {
  const board = () => placed({ void: [SELF.abomination.id, ...payers(BANISH + 1)], energy: 3 });

  it("commits nothing before the banish is chosen, survives a reload mid-choice, and rejects stale or invalid input", () => {
    const { state, ids } = board();
    const [abomination, ...others] = ids.player.void;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    // Another void card is not covered: playing it is bounced.
    expect(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: fromVoid(others[0]) })).toEqual({ kind: "bounced", reason: "illegalAction" });

    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: fromVoid(abomination) }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", side: "player", purpose: { role: "banishCost" } });
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(voidPlays(cancelled.committed)).toEqual([abomination]);

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer) => cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    // The opponent cannot answer, the card cannot banish itself, and the count is exact.
    expect(answer("enemy", others.slice(0, BANISH))).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [abomination, ...others.slice(0, BANISH - 1)])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", others.slice(0, BANISH - 1))).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const after = applied(answer("player", others.slice(0, BANISH)));
    expect(after.committed.instances[abomination]?.zone).not.toBe("void");
    expect(after.committed.sides.player.banished.sort()).toEqual(others.slice(0, BANISH).sort());
    // Stale: the card left the void, so playing it from there again is bounced.
    expect(cold.reduce(after, { kind: "battleAction", side: "player", action: fromVoid(abomination) })).toEqual({ kind: "bounced", reason: "illegalAction" });
  });

  it("stores nothing: a JSON reload offers the same plays", () => {
    const { state } = board();
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(reloaded.floating).toEqual([]);
    expect(stateHash(reloaded)).toBe(stateHash(state));
    expect(engine.legalActions(reloaded, "player")).toEqual(engine.legalActions(state, "player"));
  });

  it("rolls back a play step that fails mid-step: the card stays in the void and stays playable", () => {
    const { state, ids } = placed({ void: [SELF.failing.id], energy: 3 });
    const [failing] = ids.player.void;
    expect(voidPlays(state)).toEqual([failing]);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    // The step fails as its failing choice is explored or answered, whichever comes first.
    const opened = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: fromVoid(failing) });
    const pending = opened.kind === "applied" && opened.error === null ? fold.pending(opened.slice) : null;
    const outcome = pending === null ? opened : fold.reduce(applied(opened), { kind: "answer", side: "player", promptId: pending.prompt.id, value: 1 });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/fails mid-step/);
    expect(outcome.published).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(state));
    expect(voidPlays(outcome.slice.committed)).toEqual([failing]);
  });
});
