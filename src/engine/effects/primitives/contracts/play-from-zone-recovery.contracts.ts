import { describe, expect, it } from "vitest";
import { playPermission } from "../../../continuous/permissions";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { stateHash } from "../../../state/hash";
import type { Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { playFromHand } from "../../../testing/scenario";
import { ZONE } from "../../../testing/zone-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { v } from "./cards-support";
import { act, activate, Answering, engine, fromVoid, PERMIT, placed, resolveStack, voidPlays } from "./play-from-zone-support";

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

describe("playFromZone recovery", () => {
  /** An event in the void with Reclaim 1●, after an activation that lets its controller play one event from the void. */
  const granted = () => {
    const { state, ids } = placed({ back: [PERMIT.technician.id], void: [ZONE.reclaimDraw.id, v.event0.id], energy: 3 });
    return { state: resolveStack(act(state, "player", activate(ids.player.back[0])).state), spell: ids.player.void[0], other: ids.player.void[1] };
  };

  it("keeps a one-play permission through a cancelled play and a reload mid-route-choice, and uses it only by its own route", () => {
    const { state, spell, other } = granted();
    expect(state.floating).toHaveLength(1);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const action = fromVoid(spell);
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action }));
    const pending = fold.pending(opened)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseMode", side: "player", purpose: { role: "voidRoute" } });
    // Nothing commits before the commit point.
    expect(stateHash(opened.committed)).toBe(stateHash(state));
    const cancelled = applied(fold.reduce(opened, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    expect(voidPlays(cancelled.committed).sort()).toEqual([spell, other].sort());

    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    expect(cold.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: Answer) => cold.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", 0)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", 2)).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    // By the permission: its normal cost, and the permission is used up as the play commits.
    const outcome = answer("player", 0);
    if (outcome.kind !== "applied") throw new Error("bounced");
    expect(outcome.published).toContainEqual({ kind: "effectEnded", effect: state.floating[0].id });
    const permitted = applied(outcome).committed;
    expect(permitted.floating).toEqual([]);
    expect(permitted.sides.player.currentEnergy).toBe(1);
    // Stale input: the other event is no longer covered.
    expect(cold.reduce(applied(outcome), { kind: "battleAction", side: "player", action: fromVoid(other) })).toEqual({ kind: "bounced", reason: "illegalAction" });

    // By Reclaim: the permission is not used.
    const reclaimed = applied(answer("player", 1)).committed;
    expect(reclaimed.instances[spell]?.status.reclaimed).toBe(true);
    expect(reclaimed.floating).toEqual(state.floating);
  });

  it("stores only its floating change: a JSON reload and a saved journey battle read the same permission", () => {
    const { state, spell } = granted();
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(state));
    expect(engine.legalActions(reloaded, "player")).toEqual(engine.legalActions(state, "player"));
    expect(playPermission(reloaded, engine.catalog, spell, "player")).toEqual({ consumes: state.floating[0].id });

    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(state)))).not.toBeNull();
    const malformed = (change: Record<string, unknown>) =>
      parseJourneyBattleFoldState(savedJourney(sliceOf({ ...state, floating: [{ ...state.floating[0], change: { ...state.floating[0].change, ...change } }] })));
    expect(malformed({ zone: "hand" })).toBeNull();
    expect(malformed({ instance: 7 })).toBeNull();
    expect(malformed({ next: "once" })).toBeNull();
    expect(malformed({ filter: { costAtMost: "2" } })).toBeNull();
  });

  it.each(["sparkAtMost", "sparkAtLeast"] as const)("validates saved %s as a finite signed number", (bound) => {
    const { state } = granted();
    const withBound = (value: unknown) => sliceOf({
      ...state, floating: [{ ...state.floating[0], change: { ...state.floating[0].change, filter: { [bound]: value } } }],
    } as BattleState);
    for (const value of ["2", null, {}, [], true, NaN, Infinity, -Infinity]) {
      const decoded = savedJourney(withBound(value));
      expect(parseJourneyBattleFoldState(decoded)).toBeNull();
      // The public parser also rejects a decoded object containing non-finite numbers.
      const savedSlice = (decoded.engine as { slice: BattleSlice }).slice;
      savedSlice.committed.floating = withBound(value).committed.floating;
      expect(parseJourneyBattleFoldState(decoded)).toBeNull();
    }
    for (const value of [-2, 0, 1.5]) {
      const original = withBound(value);
      const parsed = parseJourneyBattleFoldState(savedJourney(original));
      expect(parsed).not.toBeNull();
      expect(parsed!.engine.slice.committed.floating[0].change).toEqual(original.committed.floating[0].change);
      expect(stateHash(parsed!.engine.slice.committed)).toBe(stateHash(original.committed));
      expect(engine.legalActions(parsed!.engine.slice.committed, "player")).toEqual(engine.legalActions(original.committed, "player"));
    }
  });

  it("commits and publishes no permission when its step fails after granting it", () => {
    const { state, ids } = placed({ hand: [PERMIT.permitThenFail.id], void: [v.event0.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const outcome = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its permission/);
    expect(outcome.published.map((event) => event.kind)).toEqual(["cardPlayed"]);
    expect(outcome.slice.committed.floating).toEqual([]);
    expect(voidPlays(outcome.slice.committed)).toEqual([]);
  });

  it("stops covering a named card that left the void, and hides the permission while the card is hidden", () => {
    const { state, ids } = placed({ back: [PERMIT.salvager.id], hand: [PERMIT.discarder.id, v.vanilla2.id, PERMIT.shuffler.id], energy: 2 });
    const [discarderCard, discarded, shuffler] = ids.player.hand;
    const after = resolveStack(act(state, "player", { kind: "play", card: discarderCard, from: "hand" }, new Answering(() => [discarded])).state);
    expect(voidPlays(after)).toEqual([discarded]);
    const shuffled = resolveStack(act(after, "player", { kind: "play", card: shuffler, from: "hand" }).state);
    expect(shuffled.sides.player.deck).toContain(discarded);
    expect(voidPlays(shuffled)).toEqual([]);
    expect(shuffled.floating).toHaveLength(1);
    // Neither player knows where the card is in the deck, so no view names it.
    for (const viewer of ["player", "enemy"] as const) expect(engine.view(shuffled, viewer).floating).toEqual([]);
  });

  it("covers only the void of the side the permission belongs to", () => {
    const { state, ids } = placed({ back: [PERMIT.anything.id], void: [v.event0.id] }, { back: [PERMIT.anything.id], void: [v.event0.id] });
    const [mine] = ids.player.void;
    const [theirs] = ids.enemy.void;
    expect(playPermission(state, engine.catalog, mine, "player")).toEqual({ consumes: null });
    expect(playPermission(state, engine.catalog, mine, "enemy")).toBeNull();
    expect(playPermission(state, engine.catalog, theirs, "player")).toBeNull();
    expect(playPermission(state, engine.catalog, theirs, "enemy")).toEqual({ consumes: null });
    expect(voidPlays(state, "player")).toEqual([mine]);
  });
});
