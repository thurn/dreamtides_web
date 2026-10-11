import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import type { EngineEvent } from "../../../events";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { Answering, engine, fromHand, KEEP, placed, playOn, reclaim, resolveStack, zoneOf } from "./reclaim-not-banished-support";

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}

const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

/** The player's revenant reclaimed into play beside the player's source in B0, with `hand`. */
function covered(hand: Parameters<typeof placed>[0]["hand"] = [KEEP.dissolveOne.id]) {
  const { state, ids } = placed({ back: [KEEP.keeper.id], void: [KEEP.revenant.id], hand, energy: 3 });
  const revenant = ids.player.void[0];
  return { state: reclaim(state, revenant), revenant, keeper: ids.player.back[0]!, ids };
}

describe("reclaimNotBanished recovery", () => {
  it("decides as the dissolve commits: a reload mid-target-choice and a cancel keep the reclaimed card, and stale input is bounced", () => {
    const { state, revenant, ids } = covered();
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: fromHand(ids.player.hand[0]) }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", side: "player" });
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    expect(applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id })).committed).toEqual(state);

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    expect(cold.reduce(saved, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [revenant] })).toEqual({
      kind: "bounced",
      reason: "notYourPrompt",
    });
    const played = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [revenant] }));
    const after = resolveStack(played.committed);
    expect(zoneOf(after, revenant)).toBe("void");
    // Stale input: the card that left play cannot be chosen again.
    expect(cold.reduce(sliceOf(after), { kind: "battleAction", side: "player", action: fromHand(ids.player.hand[0]) })).toEqual({
      kind: "bounced",
      reason: "illegalAction",
    });
  });

  it("stores nothing but the card's status: a JSON reload and a saved journey battle give the same outcome", () => {
    const { state, revenant, ids } = covered();
    expect(state.floating).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(state));
    const fresh = playOn(reloaded, ids.player.hand[0], revenant).state;
    expect(stateHash(fresh)).toBe(stateHash(playOn(state, ids.player.hand[0], revenant).state));
    expect(zoneOf(fresh, revenant)).toBe("void");
    // The status is part of the state hash, so a reload that lost it would not match.
    const lost = JSON.parse(JSON.stringify(state)) as BattleState;
    lost.instances[revenant].status.reclaimed = false;
    expect(stateHash(lost)).not.toBe(stateHash(state));

    const save = {
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
      engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(sliceOf(state))) as unknown },
    };
    expect(parseJourneyBattleFoldState(save)).not.toBeNull();
  });

  it("commits nothing when its step fails after a covered card left play", () => {
    const { state, ids } = placed({ back: [KEEP.revenant.id, KEEP.keeper.id], hand: [KEEP.dissolveThenFail.id] });
    const revenant = ids.player.back[0]!;
    state.instances[revenant].status.reclaimed = true;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const failed = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: fromHand(ids.player.hand[0]) });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected an engine error");
    expect(failed.error.message).toMatch(/after the dissolve/);
    const committed = failed.slice.committed;
    expect(zoneOf(committed, revenant)).toBe("play");
    expect(committed.instances[revenant]?.status.reclaimed).toBe(true);
    expect(failed.published.some((event) => event.kind === "leftPlay" || event.kind === "dissolved")).toBe(false);
  });

  it("announces each covered leave with the events naming the card, and lets each side's ability cover only its own cards", () => {
    const { state, ids } = placed(
      { back: [KEEP.revenant.id, KEEP.keeper.id], hand: [KEEP.wipe.id] },
      { back: [KEEP.revenant.id, KEEP.keeper.id] },
    );
    const mine = ids.player.back[0]!;
    const theirs = ids.enemy.back[0]!;
    for (const id of [mine, theirs]) state.instances[id].status.reclaimed = true;
    const steps: { readonly state: BattleState; readonly events: readonly EngineEvent[] }[] = [];
    const played = engine.apply(state, "player", fromHand(ids.player.hand[0]), new Answering(), (next, _step, events) => steps.push({ state: next, events }));
    const resolved = resolveStack(played.state);
    for (const id of [mine, theirs]) {
      expect(zoneOf(resolved, id)).toBe("void");
      expect(resolved.instances[id]?.status.reclaimed).toBe(false);
    }
    // Each step names every card whose zone or status it changed.
    expect(resolved).toBe(played.state);
    expect(steps.length).toBeGreaterThan(1);
    steps.forEach(({ state: after, events }, index) => {
      expect(unannouncedChanges(events, steps[index - 1]?.state ?? state, after)).toEqual([]);
    });
  });

  it("names no hidden card: a covered card returned to a hand carries no reclaimed status, and the opponent's view of that hand shows only its count", () => {
    const { state, revenant, ids } = covered([KEEP.bounce.id]);
    const after = playOn(state, ids.player.hand[0], revenant);
    expect(zoneOf(after.state, revenant)).toBe("hand");
    expect(after.state.instances[revenant]?.status.reclaimed).toBe(false);
    for (const viewer of ["player", "enemy"] as const) {
      expect(engine.view(after.state, viewer).instances[revenant]?.status.reclaimed ?? false).toBe(false);
    }
    expect(after.events.some((event) => event.kind === "effectStarted")).toBe(false);
  });
});
