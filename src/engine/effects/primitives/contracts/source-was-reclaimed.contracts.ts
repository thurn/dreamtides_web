/** Historical Reclaim play provenance through legal play, re-entry by effect, copies and replay. */
import { describe, expect, it } from "vitest";
import { parseAvatarId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, abandonSelfCost, additionalCost, discardCost, energy, event, keyword, reclaim, sourceWasReclaimed, stackItem } from "../../../dsl/builders";
import { onMaterialized, triggered } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Action } from "../../../rules/actions";
import { cloneState } from "../../../state/clone";
import { stateHash } from "../../../state/hash";
import type { InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { ZONE } from "../../../testing/zone-cards";
import { copyCard } from "../copy-card";
import { discard } from "../discard";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { sequence } from "../sequence";

const conditional: EngineCardDefinition = {
  id: syntheticId(1400), cardType: "event", costs: [energy(1)], spark: null,
  subtype: "", speed: "standard", status: "authored",
  abilities: () => [event(ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2))), reclaim(energy(3))],
};
const copy: EngineCardDefinition = {
  ...conditional, id: syntheticId(1401), speed: "interrupt",
  abilities: () => [event(copyCard({ kind: "stackTarget", selector: stackItem({ cardType: "event" }) }))],
};
const prompted: EngineCardDefinition = {
  ...conditional, id: syntheticId(1402),
  abilities: () => [
    additionalCost(discardCost()), reclaim(energy(3)),
    event(sequence(ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2)), discard(1))),
  ],
};
const missingSource: EngineCardDefinition = {
  ...conditional, id: syntheticId(1403), cardType: "character", spark: 1,
  abilities: () => [activated([abandonSelfCost()], ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2)))],
};
const fails: EngineCardDefinition = {
  ...conditional, id: syntheticId(1404),
  synthetic: { resolve(ctx, item) {
    ctx.state.sides[item.controller].score += 9;
    ctx.state.instances[item.instance].status.playedViaReclaim = false;
    throw new Error("synthetic resolution failure");
  } },
};
const offering: EngineCardDefinition = {
  ...conditional, id: syntheticId(1405),
  abilities: () => [keyword("offering"), event(ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2)))],
};
const reentry: EngineCardDefinition = {
  ...conditional, id: syntheticId(1407), cardType: "character", spark: 1,
  abilities: () => [triggered(onMaterialized(), ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2))), reclaim(energy(3))],
};
const avatar = {
  id: parseAvatarId("5e5e5e5e-0000-4000-8000-000000001406"), status: "authored" as const,
  abilities: () => [activated([], ifThen(sourceWasReclaimed(), gainPoints(7), gainPoints(2)))],
};
const engine = createEngine(testCatalog([conditional, copy, prompted, missingSource, fails, offering, reentry, ZONE.exile], { avatars: [avatar] }));
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id];
const action = (card: InstanceId, from: "hand" | "void"): Action => ({ kind: "play", card, from });
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
function setup(side: Side, from: "hand" | "void", card = conditional.id) {
  const other: Side = side === "player" ? "enemy" : "player";
  const board = boardState(engine.catalog, {
    active: side, phase: "day",
    [side]: { [from]: [card], deck, energy: 8 },
    [other]: { hand: [copy.id], deck, energy: 8 },
  });
  return { ...board, card: board.ids[side][from][0], other };
}

describe("sourceWasReclaimed", () => {
  it("checks actual Reclaim play for either controller and preserves provenance across cloning and reload", () => {
    for (const side of ["player", "enemy"] as const) for (const from of ["hand", "void"] as const) {
      const { state, card, other } = setup(side, from);
      const played = engine.apply(state, side, action(card, from), NO_PROMPTS).state;
      expect(played.instances[card].status.playedViaReclaim).toBe(from === "void");
      expect(played.sides[side].currentEnergy).toBe(from === "void" ? 5 : 7);
      const saved = JSON.parse(JSON.stringify(played)) as BattleState;
      expect(cloneState(played)).toEqual(saved);
      expect(stateHash(saved)).toBe(stateHash(played));
      const resolved = createEngine(engine.catalog).apply(saved, other, { kind: "pass" }, NO_PROMPTS);
      expect(resolved.state.sides[side].score).toBe(from === "void" ? 7 : 2);
      expect(resolved.state.instances[card].zone).toBe(from === "void" ? "banished" : "void");
      expect(invariantViolations(resolved.state, engine.catalog)).toEqual([]);
      expect(state).toEqual(setup(side, from).state);
    }
  });

  it("keeps historical play provenance when the mutable reclaimed replacement is cleared", () => {
    const { state, card } = setup("player", "void");
    const played = engine.apply(state, "player", action(card, "void"), NO_PROMPTS).state;
    // Arrange the independent replacement flag as an effect that removes it would.
    const cleared = cloneState(played);
    cleared.instances[card].status.reclaimed = false;
    const resolved = engine.apply(cleared, "enemy", { kind: "pass" }, NO_PROMPTS).state;
    expect(resolved.sides.player.score).toBe(7);
    expect(resolved.instances[card].zone).toBe("void");
    const differentHistory = cloneState(cleared);
    differentHistory.instances[card].status.playedViaReclaim = false;
    expect(stateHash(differentHistory)).not.toBe(stateHash(cleared));
  });

  it("a Reclaim-played character returned to play by an effect keeps its Reclaim play provenance", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { void: [reentry.id], deck, energy: 8 }, enemy: { hand: [ZONE.exile.id], deck, energy: 8 },
    });
    const card = ids.player.void[0];
    const effectPoints = (events: readonly EngineEvent[]) =>
      events.flatMap((event) => (event.kind === "pointsScored" && event.side === "player" && event.cause === "effect" ? [event.amount] : []));
    const entered = engine.apply(state, "player", action(card, "void"), NO_PROMPTS);
    expect(entered.state.instances[card].zone).toBe("play");
    expect(effectPoints(entered.events)).toEqual([7]);
    // Arrange the independent replacement flag as an effect that removes it would, so leaving play is not a banish.
    const cleared = cloneState(entered.state);
    cleared.instances[card].status.reclaimed = false;
    const enemyDay = passUntil(engine, cleared, at(engine, "enemy", "day")).state;
    const exiled = engine.apply(enemyDay, "enemy", action(ids.enemy.hand[0], "hand"), new ScriptedSource([[card]])).state;
    expect(exiled.instances[card].zone).toBe("banished");
    const returned = passUntil(engine, exiled, at(engine, "player", "day"));
    expect(returned.events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: card }));
    expect(returned.events.some((event) => event.kind === "cardPlayed" && event.instance === card)).toBe(false);
    expect(returned.state.instances[card].zone).toBe("play");
    expect(returned.state.instances[card].status.playedViaReclaim).toBe(true);
    expect(effectPoints(returned.events)).toEqual([7]);
    expect(invariantViolations(returned.state, engine.catalog)).toEqual([]);
  });

  it("a new normal play resets prior Reclaim provenance", () => {
    const { state, card } = setup("player", "hand");
    state.instances[card].status.playedViaReclaim = true;
    const played = engine.apply(state, "player", action(card, "hand"), NO_PROMPTS).state;
    expect(played.instances[card].status.playedViaReclaim).toBe(false);
    expect(engine.apply(played, "enemy", { kind: "pass" }, NO_PROMPTS).state.sides.player.score).toBe(2);
  });

  it("Offering resets prior play provenance and an emblem takes the false branch", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day", player: { hand: [offering.id, v.vanilla1.id], avatar: avatar.id, deck, energy: 8 }, enemy: { deck },
    });
    const card = ids.player.hand[0];
    state.instances[card].status.playedViaReclaim = true;
    const offered = engine.apply(state, "player", action(card, "hand"), new ScriptedSource([1]));
    expect(offered.state.instances[card].status.playedViaReclaim).toBe(false);
    expect(offered.state.instances[card].status.offering).toBe(true);
    expect(offered.state.sides.player.score).toBe(2);
    const activatedAvatar = engine.apply(offered.state, "player", { kind: "activate", source: { kind: "avatar", side: "player" }, ability: 0 }, NO_PROMPTS);
    expect(activatedAvatar.state.sides.player.score).toBe(4);
  });

  it("a created stack copy uses the normal branch while the reclaimed original keeps its own branch", () => {
    const { state, ids, card } = setup("player", "void");
    const played = engine.apply(state, "player", action(card, "void"), NO_PROMPTS).state;
    const copied = engine.apply(played, "enemy", action(ids.enemy.hand[0], "hand"), NO_PROMPTS);
    const copyEvent = copied.events.find((event) => event.kind === "cardCopied");
    if (copyEvent?.kind !== "cardCopied") throw new Error("copy did not resolve");
    expect(copied.state.sides.enemy.score).toBe(2);
    expect(copied.state.instances[copyEvent.copy]).toBeUndefined();
    expect(copied.state.instances[card].status.playedViaReclaim).toBe(true);
    expect(copied.state.sides.player.score).toBe(7);
  });

  it("an ability whose created source ceased to exist takes the false branch", () => {
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [missingSource.id], deck }, enemy: { deck } });
    const card = ids.player.back[0];
    if (card === null) throw new Error("missing fixture source");
    state.instances[card].status.created = true;
    state.instances[card].status.playedViaReclaim = true;
    const result = engine.apply(state, "player", { kind: "activate", source: card, ability: 0 }, NO_PROMPTS);
    expect(result.state.instances[card]).toBeUndefined();
    expect(result.state.sides.player.score).toBe(2);
  });

  it("suspends before and after commit, reloads, and rejects invalid, foreign, stale and concurrent answers without partial writes", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { void: [prompted.id], hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck, energy: 8 },
      enemy: { hand: [copy.id], deck, energy: 8 },
    });
    const card = ids.player.void[0];
    const play = action(card, "void");
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: play }));
    expect(opened.committed).toEqual(state);
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    expect(pending).toEqual(fold.pending(opened));
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.hand[0]] } as const;
    expect(cold.reduce(saved, { ...answer, value: [card] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action: play })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const cancelled = applied(cold.reduce(saved, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(cancelled.committed).toEqual(state);
    const reopened = applied(cold.reduce(cancelled, { kind: "battleAction", side: "player", action: play }));
    expect(cold.reduce(reopened, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const paid = applied(cold.reduce(saved, answer));
    expect(paid.committed.instances[card].status.playedViaReclaim).toBe(true);
    const resolving = applied(cold.reduce(paid, { kind: "battleAction", side: "enemy", action: { kind: "pass" } }));
    const resolutionSave = JSON.parse(JSON.stringify(resolving)) as BattleSlice;
    const afterReload = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const resolutionPrompt = afterReload.pending(resolutionSave)!;
    expect(resolutionPrompt.display.sides.player.score).toBe(7);
    expect(resolutionSave.committed.sides.player.score).toBe(0);
    const resolved = applied(afterReload.reduce(resolutionSave, { kind: "answer", side: "player", promptId: resolutionPrompt.prompt.id, value: [ids.player.hand[1]] }));
    expect(resolved.committed.sides.player.score).toBe(7);
    expect(resolved.committed.instances[card].zone).toBe("banished");
    expect(resolved.committed.instances[card].status.playedViaReclaim).toBe(true);
    expect(afterReload.reduce(resolved, { kind: "answer", side: "player", promptId: resolutionPrompt.prompt.id, value: [ids.player.hand[2]] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("a failing resolution keeps the previously committed Reclaim provenance without committing effect writes", () => {
    const { state, card } = setup("player", "void", fails.id);
    const played = engine.apply(state, "player", action(card, "void"), NO_PROMPTS).state;
    const before = stateHash(played);
    expect(() => runStep(played, { kind: "resolveTop" }, new ScriptedSource([]), engine.catalog)).toThrow("synthetic resolution failure");
    expect(stateHash(played)).toBe(before);
    expect(played.instances[card].status.playedViaReclaim).toBe(true);
    expect(played.sides.player.score).toBe(0);
  });
});
