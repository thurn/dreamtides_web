import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import type { Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { v } from "./cards-support";
import { changeThenFail, costNow, engine, MC, placed, play, playAndResolve } from "./modify-card-cost-support";

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

/** A saved journey battle around `slice`, as a save file holds it. */
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1",
      siteId: "site-1",
      nodeId: null,
      completionLevelAtStart: 0,
      essenceReward: 0,
      opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null,
      cardDefinitions: [],
    },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  };
}

describe("modifyCardCost recovery", () => {
  /** The player's "Return an enemy to hand. It costs 2● more", with two enemies to choose from. */
  const choosing = () => placed({ hand: [MC.repel.id], energy: 1 }, { back: [v.vanilla2.id, v.vanilla3.id] });

  it("keeps its target prompt through a cancel and a reload, rejects stale answers, and changes the chosen card", () => {
    const { state, ids } = choosing();
    const [first, second] = ids.enemy.back;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", side: "player", candidates: [first, second] });
    // Nothing commits before the commit point, and a cancel restores the committed state.
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)!.prompt.id).toBe(pending.prompt.id);
    const answer = (side: Side, value: Answer, promptId = pending.prompt.id) => fresh.reduce(saved, { kind: "answer", side, promptId, value });
    expect(answer("enemy", [second!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [ids.player.hand[0]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const done = applied(answer("player", [second!]));
    const after = done.committed;
    expect(after.instances[second!]?.zone).toBe("hand");
    expect(after.instances[first!]?.zone).toBe("play");
    expect(costNow(after, second, "enemy")).toBe(5);
    expect(after.floating).toHaveLength(1);
  });

  it("saves and loads a battle holding the change, and rejects a malformed one", () => {
    const { state, ids } = choosing();
    const after = playAndResolve(state, "player", ids.player.hand[0]).state;
    const returned = ids.enemy.back[0];
    expect(after.floating).toHaveLength(1);
    const reloaded = JSON.parse(JSON.stringify(after)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(after));
    expect(costNow(reloaded, returned, "enemy")).toBe(costNow(after, returned, "enemy"));
    expect(engine.legalActions(reloaded, "enemy")).toEqual(engine.legalActions(after, "enemy"));

    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(after)))).not.toBeNull();
    const malformed = (change: Record<string, unknown>) =>
      parseJourneyBattleFoldState(savedJourney(sliceOf({ ...after, floating: [{ ...after.floating[0], change: { ...after.floating[0].change, ...change } }] })));
    expect(malformed({ mode: "halve" })).toBeNull();
    expect(malformed({ amount: "2" })).toBeNull();
    // An amount the primitive refuses: a negative increase would be a reduction, and energy is whole.
    expect(malformed({ amount: -2 })).toBeNull();
    expect(malformed({ amount: 0.5 })).toBeNull();
    expect(malformed({ mode: "set", amount: -1 })).toBeNull();
    expect(malformed({ mode: "set", amount: 0 })).not.toBeNull();
    expect(malformed({ instance: 7 })).toBeNull();
  });

  it("commits and publishes no change when its step fails after changing the cost", () => {
    const { state, ids } = placed({ hand: [changeThenFail.id] }, { back: [v.vanilla3.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const outcome = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play(ids.player.hand[0]) });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its cost change/);
    expect(outcome.published.map((event) => event.kind)).toEqual(["handEmptied", "cardPlayed"]);
    expect(outcome.slice.committed.floating).toEqual([]);
    expect(outcome.slice.committed.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(costNow(outcome.slice.committed, ids.enemy.back[0], "enemy")).toBe(3);
  });
});
