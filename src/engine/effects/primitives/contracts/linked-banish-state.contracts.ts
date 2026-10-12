import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { cycleHash, loopSignature } from "../../../loops/signature";
import { cloneState } from "../../../state/clone";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import type { BattleState } from "../../../state/types";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { eventSeenBy } from "../../../events";
import { resolveQueuedTrigger } from "../../../triggers/resolve";
import { dissolve } from "../../../rules/zones";
import { promptView } from "../../../view/view";
import { comparableView } from "../../../testing/determinization-fidelity";
import { canonicalHash } from "../../../state/hash";
import { F, engine, five, picking, play, setup } from "./linked-banish-support";

const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return { mode: { kind: "journey" }, init: {
    battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}
function suspended(card = F.repeat) {
  const { state, ids } = setup({ back: [F.pair.id], hand: [card.id] });
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  let slice = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
  while (fold.pending(slice) === null) {
    const decision = engine.decision(slice.committed);
    if (decision === null) throw new Error("no decision before choice");
    slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
  }
  return { state, ids, fold, slice, pending: fold.pending(slice)! };
}

describe("linkedBanish state", () => {
  it("saves a pending private choice, rejects cross-actor/stale/invalid answers, and commits its member once after reload", () => {
    const { ids, fold, slice, pending } = suspended();
    const hidden = promptView(pending.prompt, "enemy", pending.display);
    expect(hidden.kind).toBe("chooseCards");
    if (hidden.kind === "chooseCards") expect(hidden.candidates).toEqual([]);
    expect(slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(engine.view(slice.committed, "player").linkedBanished).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    expect(parseJourneyBattleFoldState(savedJourney(reloaded))).not.toBeNull();
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(reloaded)).toEqual(pending);
    const promptId = pending.prompt.id;
    const correct = { kind: "answer", side: "player", promptId, value: [ids.player.deck[2]] } as const;
    expect(fresh.reduce(reloaded, { ...correct, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloaded, { ...correct, promptId: "0:0:0" as typeof promptId })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(reloaded, { ...correct, value: [ids.player.deck[4]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(fresh.reduce(reloaded, correct));
    expect(done.committed.sides.player.banished).toEqual([ids.player.deck[2]]);
    expect(engine.view(done.committed, "player").linkedBanished?.flatMap((record) => record.cards)).toHaveLength(1);
    expect(fresh.reduce(done, correct)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(slice.committed)).toBe(stateHash(reloaded.committed));
    expect(fold.pending(slice)).toEqual(pending);
  });

  it("rolls back both banishment and linkage after an accepted choice followed by a step error", () => {
    const { ids, fold, slice, pending } = suspended(F.failAfterLook);
    const result = fold.reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.deck[1]] });
    if (result.kind !== "applied" || result.error === null) throw new Error("expected synthetic failure");
    expect(result.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(result.slice.committed.sides.player.banished).toEqual([]);
    expect(engine.view(result.slice.committed, "player").linkedBanished).toEqual([]);
    expect(result.published.some((event) => event.kind === "banished")).toBe(false);
  });

  it("clones, validates and reloads durable cells and an owed old-object trigger", () => {
    const { state, ids } = setup({ hand: [F.pair.id] });
    const entered = play(state, ids.player.hand[0], picking).state;
    const ctx = new Context(entered, engine.catalog, NO_PROMPTS);
    dissolve(ctx, ids.player.hand[0], null);
    const owed = ctx.state;
    const copy = cloneState(owed);
    expect(copy).toEqual(owed);
    expect(copy.linkedBanished).not.toBe(owed.linkedBanished);
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(copy)))).not.toBeNull();
    const loaded = deserializeState(serializeState(copy));
    const resuming = new Context(loaded, engine.catalog, NO_PROMPTS);
    resolveQueuedTrigger(resuming, resuming.state.triggerQueue.shift()!);
    expect(resuming.state.sides.player.hand).toEqual([ids.player.deck[3]]);
    const base = owed.linkedBanished![0];
    for (const invalid of [
      { ...base, source: "bad" }, { ...base, enteredPlayAt: -1 }, { ...base, enteredPlayAt: owed.clock + 1 }, { ...base, ability: 0.1 },
      { ...base, gainedFrom: "not-effect" }, { ...base, cards: [{ instance: "bad", enteredBanishedAt: 1 }] },
      { ...base, cards: [{ instance: ids.player.deck[3], enteredBanishedAt: -1 }] },
    ]) expect(parseJourneyBattleFoldState(savedJourney(sliceOf({ ...owed, linkedBanished: [invalid] } as unknown as BattleState)))).toBeNull();
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf({ ...owed, linkedBanished: [base, base] })))).toBeNull();
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf({ ...owed, linkedBanished: [{ ...base, cards: [...base.cards, ...base.cards] }] })))).toBeNull();
    const malformed = { ...owed, triggerQueue: [{ ...owed.triggerQueue[0], linkedSource: { ...owed.triggerQueue[0].linkedSource, source: ids.player.deck[3] } }] } as BattleState;
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(malformed)))).toBeNull();
    const legacy = cloneState(state); delete legacy.linkedBanished;
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(legacy)))).not.toBeNull();
  });

  it("keeps public source/member linkage through both determinizations without leaking the three leftovers", () => {
    const { state, ids } = setup({ hand: [F.pair.id] });
    const entered = play(state, ids.player.hand[0], picking).state;
    const lists = { player: [F.pair.id, ...five].map((cardId) => ({ cardId })), enemy: [...five, ...five].map((cardId) => ({ cardId })) };
    for (const side of ["player", "enemy"] as const) {
      const seen = engine.view(entered, side);
      const sampled = engine.determinize(seen, lists, () => 0.5);
      expect(canonicalHash(comparableView(engine.view(sampled, side)))).toBe(canonicalHash(comparableView(seen)));
      expect(seen.linkedBanished?.flatMap((record) => record.cards.map((card) => card.instance))).toEqual([ids.player.deck[3]]);
    }
  });

  it("redacts context when the source becomes hidden, while the actual old consumer still resolves", () => {
    const { state, ids } = setup({ hand: [F.pair.id] });
    const entered = play(state, ids.player.hand[0], picking).state;
    const ctx = new Context(entered, engine.catalog, NO_PROMPTS);
    dissolve(ctx, ids.player.hand[0], null);
    const queued = ctx.state.triggerQueue[0];
    // Move through actual zone rules, then stage a synthetic hidden-identity observation fixture.
    requireZones.moveInstance(ctx, ids.player.hand[0], "deck");
    ctx.state.knownTo.player = []; ctx.state.knownTo.enemy = [];
    for (const side of ["player", "enemy"] as const) {
      const seen = engine.view(ctx.state, side);
      expect(seen.triggerQueue[0]?.source).toBeNull();
      expect(seen.triggerQueue[0]?.linkedSource).toBeUndefined();
      expect(seen.linkedBanished).toEqual([]);
      const queuedEvent = ctx.events.find((event) => event.kind === "triggerQueued")!;
      const shown = eventSeenBy(queuedEvent, side, ctx.state);
      if (shown !== null) expect(shown).not.toHaveProperty("linkedSource");
    }
    resolveQueuedTrigger(ctx, ctx.state.triggerQueue.shift()!);
    expect(ctx.state.sides.player.hand).toContain(ids.player.deck[3]);
    expect(queued.linkedSource).toBeDefined();
  });

  it("normalizes visit clocks, acquired occurrence identifiers, cell order and inaccessible history in both semantic hashes", () => {
    const { state, ids } = setup({ hand: [F.pair.id, F.pair.id] });
    const first = play(state, ids.player.hand[0], picking).state;
    const two = play(first, ids.player.hand[1], picking).state;
    const hashes = (value: BattleState) => [loopSignature(value), cycleHash(value)];
    const reordered = cloneState(two); reordered.linkedBanished!.reverse();
    expect(hashes(reordered)).toEqual(hashes(two));
    const advanced = cloneState(two); advanced.clock += 100;
    for (const instance of Object.values(advanced.instances)) instance.enteredZoneAt += 100;
    advanced.linkedBanished = advanced.linkedBanished!.map((record) => ({ ...record, enteredPlayAt: record.enteredPlayAt + 100,
      cards: record.cards.map((member) => ({ ...member, enteredBanishedAt: member.enteredBanishedAt + 100 })) }));
    expect(hashes(advanced)).toEqual(hashes(two));
    const wrong = cloneState(two); wrong.linkedBanished = wrong.linkedBanished!.map((record, index) => ({ ...record, cards: two.linkedBanished![1 - index].cards }));
    expect(hashes(wrong)).not.toEqual(hashes(two));
    const inaccessible = cloneState(two); inaccessible.linkedBanished!.push({ ...two.linkedBanished![0], enteredPlayAt: 999 });
    expect(hashes(inaccessible)).toEqual(hashes(two));
    const ctx = new Context(cloneState(two), engine.catalog, NO_PROMPTS);
    dissolve(ctx, ids.player.hand[0], null);
    const owed = ctx.state;
    owed.triggerQueue = owed.triggerQueue.map((trigger) => ({ ...trigger, linkedSource: { ...trigger.linkedSource!, gainedFrom: "e10" } }));
    owed.linkedBanished = owed.linkedBanished!.map((record) => record.source === ids.player.hand[0] ? { ...record, gainedFrom: "e10" } : record);
    const renamed = cloneState(owed);
    renamed.triggerQueue = renamed.triggerQueue.map((trigger) => ({ ...trigger, linkedSource: { ...trigger.linkedSource!, gainedFrom: "e900" } }));
    renamed.linkedBanished = renamed.linkedBanished!.map((record) => record.source === ids.player.hand[0] ? { ...record, gainedFrom: "e900" } : record);
    expect(hashes(renamed)).toEqual(hashes(owed));
  });
});

import * as requireZones from "../../../rules/zones";
