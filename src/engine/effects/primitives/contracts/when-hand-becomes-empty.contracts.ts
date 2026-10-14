/** Public hand-size transitions, independent of card identity and global first-occurrence policies. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, conditionCardCounts, energy, everyIn, staticAbility } from "../../../dsl/builders";
import { triggered, whenHandBecomesEmpty, whenYouPlay } from "../../../dsl/triggers";
import type { PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecords, type EngineLogRecord } from "../../../log";
import { discardCards } from "../../../rules/resources";
import { ceaseToExist, materialize as enterCharacter, moveInstance, moveToHand } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { InlineSource, NO_PROMPTS } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";

function card(index: number, abilities: EngineCardDefinition["abilities"], character = true, synthetic?: EngineCardDefinition["synthetic"]): EngineCardDefinition {
  return { id: syntheticId(0x6e0000 + index), cardType: character ? "character" : "event", costs: [energy(0)], spark: character ? 1 : null,
    subtype: "Warrior", speed: "standard", status: "authored", abilities, ...(synthetic === undefined ? {} : { synthetic }) };
}
const watch = (index: number, ref: PlayerRef = "you", oncePerTurn = false) => card(index, () => [triggered(whenHandBecomesEmpty(ref), p.gainPoints(1), { oncePerTurn })]);
const H = {
  watch: watch(0), other: watch(1, "opponent"), once: watch(2, "you", true),
  draw: card(3, () => [triggered(whenHandBecomesEmpty(), p.draw(1))]),
  may: card(4, () => [triggered(whenHandBecomesEmpty(), p.optional(p.gainEnergy(1)))]),
  played: card(5, () => [triggered(whenYouPlay(), p.gainEnergy(1))]),
  discard: card(6, () => [activated([], p.discard(9))]),
  zero: card(7, () => [activated([], p.discard(0))]),
  one: card(8, () => [activated([], p.discard(1))]),
  redraw: card(9, () => [activated([], p.redrawHand())]),
  shuffle: card(10, () => [activated([], p.shuffleInto([everyIn("hand")]))]),
  put: card(11, () => [activated([], p.putInDeck([everyIn("hand")], "bottom"))]),
  materialize: card(12, () => [activated([], p.materialize(everyIn("hand")))]),
  banish: card(13, () => [activated([], p.banishCards([everyIn("hand")]))]),
  take: card(14, () => [activated([], p.takeFromAmong(p.opponentHand()))]),
  same: card(15, () => [], false, { resolve(ctx, item) { moveToHand(ctx, ctx.state.sides[item.controller].hand[0], item.controller); } }),
  sameOwner: card(16, () => [], false, { resolve(ctx, item) { moveInstance(ctx, ctx.state.sides[item.controller].hand[0], "hand"); } }),
  cease: card(17, () => [], false, { resolve(ctx, item) { ceaseToExist(ctx, ctx.state.sides[item.controller].hand[0]); } }),
  fail: card(18, () => [], false, { resolve(ctx, item) { discardCards(ctx, item.controller, [...ctx.state.sides[item.controller].hand]); throw new Error("failure after hand exit"); } }),
  cancel: card(19, () => [], false, { play(ctx, self) {
    ctx.choose({ kind: "confirm", side: ctx.state.instances[self].controller, purpose: { source: self, cardId: H.cancel.id, ability: 0, role: "youMay" } }); return {};
  } }),
  pause: card(20, () => [activated([], p.sequence(p.discard(9), p.optional(p.draw(1))))]),
  reveal: card(21, () => [staticAbility(p.revealDeckTop())]),
  conditionalReveal: card(22, () => [staticAbility(p.revealDeckTop(), { while: conditionCardCounts("hand", 0, { atMost: 0 }) })]),
  floating: card(23, () => [activated([], p.sequence(p.floating(whenHandBecomesEmpty(), p.gainEnergy(1)), p.discard(9)))]),
  capacity: card(25, () => [], false, { resolve(ctx, item) { enterCharacter(ctx, ctx.state.sides[item.controller].hand[0], item.controller); } }),
  hidden: card(26, () => [triggered(whenHandBecomesEmpty(), p.gainPoints(1), { zone: "any" })]),
  invalid: card(24, () => [], false, { resolve(ctx, item) { const hand = ctx.state.sides[item.controller].hand; discardCards(ctx, item.controller, [hand[0], hand[0]]); } }),
};
const E = createEngine(testCatalog(Object.values(H)));
const deck = Array.from({ length: 8 }, () => v.vanilla1.id);
const answer = () => new InlineSource({ player: (prompt) => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm" || prompt.kind === "payOrDecline") return true;
  throw new Error(`Unexpected prompt ${prompt.kind}`);
}, enemy: (prompt) => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm" || prompt.kind === "payOrDecline") return true;
  throw new Error(`Unexpected prompt ${prompt.kind}`);
} });
function board(side: Side, own: SideSetup, other: SideSetup = {}) {
  return boardState(E.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { deck, energy: 8, ...own }, [opponent(side)]: { deck, energy: 8, ...other } });
}
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome): BattleSlice {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected outcome ${JSON.stringify(out)}`);
  return out.slice;
}
function run(state: BattleState, side: Side, source: InstanceId, activate = true) {
  const first = E.apply(state, side, activate ? { kind: "activate", source, ability: 0 } : { kind: "play", card: source, from: "hand" }, answer());
  const rest = passUntil(E, first.state, (s) => s.stack.length === 0 && s.triggerQueue.length === 0, answer());
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...first.events, ...rest.events] };
}
const empty = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "handEmptied");
const queued = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerQueued");

describe("whenHandBecomesEmpty", () => {
  it.each(SIDES)("observes only real %s transitions, repeats after a refill and does not synthesize turn occasions", (side) => {
    const b = board(side, { back: [H.watch.id, H.draw.id], hand: [v.event0.id, v.event0.id] });
    const first = run(b.state, side, b.ids[side].hand[0], false);
    expect(empty(first.events)).toEqual([]);
    const second = run(first.state, side, b.ids[side].hand[1], false);
    expect(empty(second.events)).toEqual([{ kind: "handEmptied", side }]);
    expect(second.state.sides[side].score).toBe(1);
    const again = run(second.state, side, second.state.sides[side].hand[0], false);
    expect(empty(again.events)).toEqual([{ kind: "handEmptied", side }]);
    expect(again.state.sides[side].score).toBe(2);
    const otherTurn = passUntil(E, again.state, at(E, opponent(side), "day"), answer());
    const next = passUntil(E, otherTurn.state, at(E, side, "day"), answer());
    expect(empty([...otherTurn.events, ...next.events])).toEqual([]);
    const none = board(side, {});
    expect(empty(passUntil(E, none.state, at(E, opponent(side), "day"), answer()).events)).toEqual([]);
  });

  it.each(SIDES)("matches both relative orientations and source-local once-per-turn limits for %s", (side) => {
    const b = board(side, { back: [H.watch.id, H.once.id, H.draw.id], hand: [v.event0.id] }, { back: [H.other.id] });
    const first = run(b.state, side, b.ids[side].hand[0], false);
    expect(first.state.sides[side].score).toBe(2);
    expect(first.state.sides[opponent(side)].score).toBe(1);
    const again = run(first.state, side, first.state.sides[side].hand[0], false);
    expect(again.state.sides[side].score).toBe(3);
    expect(again.state.sides[opponent(side)].score).toBe(2);
    expect(queued(first.events).map(e => e.subject)).toEqual([null, null, null, null]);
  });

  it.each(SIDES)("covers discard, banish, shuffle, deck placement, direct entry and floating listeners for %s", (side) => {
    for (const operation of [H.discard, H.banish, H.shuffle, H.put, H.materialize, H.floating]) {
      const b = board(side, { back: [H.watch.id, operation.id], hand: [v.vanilla1.id] });
      const done = run(b.state, side, b.ids[side].back[1]!);
      expect(empty(done.events), operation.id).toEqual([{ kind: "handEmptied", side }]);
      expect(done.state.sides[side].score).toBe(1);
      if (operation === H.floating) expect(done.state.sides[side].currentEnergy).toBe(b.state.sides[side].currentEnergy + 1);
    }
    const partial = board(side, { back: [H.watch.id, H.one.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    expect(empty(run(partial.state, side, partial.ids[side].back[1]!).events)).toEqual([]);
    const zero = board(side, { back: [H.watch.id, H.zero.id] });
    expect(empty(run(zero.state, side, zero.ids[side].back[1]!).events)).toEqual([]);
  });

  it.each(SIDES)("uses the former %s holder across foreign ownership, taking and replacement departures", (side) => {
    const taken = board(side, { back: [H.take.id, H.other.id], hand: [v.vanilla1.id] }, { back: [H.watch.id], hand: [v.vanilla2.id] });
    const done = run(taken.state, side, taken.ids[side].back[0]!);
    expect(empty(done.events)).toEqual([{ kind: "handEmptied", side: opponent(side) }]);
    expect(done.state.sides[side].score).toBe(1);
    expect(done.state.sides[opponent(side)].score).toBe(1);
    expect(done.state.instances[taken.ids[opponent(side)].hand[0]]).toMatchObject({ owner: opponent(side), controller: side, zone: "hand" });
    for (const replacement of ["created", "reclaimed", "foreign"] as const) {
      const b = board(side, { back: [H.watch.id, H.discard.id], hand: [v.vanilla1.id] });
      const held = b.ids[side].hand[0];
      if (replacement === "foreign") b.state.instances[held] = { ...b.state.instances[held], owner: opponent(side) };
      else b.state.instances[held].status[replacement] = true;
      const result = run(b.state, side, b.ids[side].back[1]!);
      expect(empty(result.events)).toEqual([{ kind: "handEmptied", side }]);
      expect(result.state.sides[side].score).toBe(1);
      if (replacement === "created") expect(result.state.instances[held]).toBeUndefined();
      if (replacement === "foreign") expect(result.state.sides[opponent(side)].void).toContain(held);
    }
  });

  it("excludes same-hand detaches, failed capacity, setup and initial empty hands", () => {
    for (const operation of [H.same, H.sameOwner]) {
      const b = board("player", { back: [H.watch.id], hand: [operation.id, v.vanilla1.id] });
      expect(empty(run(b.state, "player", b.ids.player.hand[0], false).events)).toEqual([]);
    }
    const b = board("player", { back: [H.watch.id, ...Array.from({ length: 9 }, () => v.vanilla1.id)], hand: [H.capacity.id, v.vanilla1.id] });
    const blocked = run(b.state, "player", b.ids.player.hand[0], false);
    expect(empty(blocked.events)).toEqual([]);
    expect(blocked.events.some(e => e.kind === "capacityReached")).toBe(true);
    expect(blocked.state.sides.player.hand).toEqual([b.ids.player.hand[1]]);
    const created = board("player", { back: [H.watch.id], hand: [H.same.id, v.vanilla1.id] });
    created.state.instances[created.ids.player.hand[1]].status.created = true;
    const ceased = run(created.state, "player", created.ids.player.hand[0], false);
    expect(empty(ceased.events)).toEqual([{ kind: "handEmptied", side: "player" }]);
    expect(ceased.state.instances[created.ids.player.hand[1]]).toBeUndefined();
    const init = E.createBattle({ seed: battleSeed("hand-empty-opening"), scoreToWin: 100, decks: { player: deck.map(cardId => ({ cardId })), enemy: deck.map(cardId => ({ cardId })) }, dreamwell: [] }, NO_PROMPTS);
    expect(empty(init.events)).toEqual([]);
  });

  it("keeps zero-card operations and two-to-one reductions quiet", () => {
    const b = board("player", { back: [H.watch.id, H.zero.id, H.one.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    expect(empty(run(b.state, "player", b.ids.player.back[1]!).events)).toEqual([]);
    const reduced = run(b.state, "player", b.ids.player.back[2]!);
    expect(empty(reduced.events)).toEqual([]);
    expect(reduced.state.sides.player.score).toBe(0);
  });

  it.each(["ephemeral", "handLimit"] as const)("observes a real empty hand during %s cleanup", (cause) => {
    const b = board("player", { back: [H.watch.id], hand: [v.vanilla1.id] });
    b.state.turn.phase = "night";
    if (cause === "ephemeral") b.state.instances[b.ids.player.hand[0]].status.ephemeral = true;
    const state = cause === "handLimit" ? { ...b.state, config: { ...b.state.config, handLimit: 0 } } : b.state;
    const done = passUntil(E, state, at(E, "enemy", "day"), answer());
    expect(empty(done.events)).toEqual([{ kind: "handEmptied", side: "player" }]);
    expect(done.state.sides.player.score).toBe(1);
  });

  it("records a subjectless occasion without listeners, including hidden created cessation", () => {
    const b = board("player", { hand: [H.cease.id, v.vanilla1.id] });
    const held = b.ids.player.hand[1];
    b.state.instances[held].status.created = true;
    const done = run(b.state, "player", b.ids.player.hand[0], false);
    const occasion = { kind: "handEmptied", side: "player" } as const;
    expect(empty(done.events)).toEqual([occasion]);
    for (const viewer of SIDES) expect(eventSeenBy(occasion, viewer, done.state)).toEqual(occasion);
    expect(eventLogRecords(done.events, b.state.version).filter(e => e.event === "engine.handEmptied"))
      .toEqual([{ event: "engine.handEmptied", version: b.state.version, detail: occasion }]);
    expect(queued(done.events)).toEqual([]);
    expect(E.view(done.state, "enemy").instances[held]).toBeUndefined();
  });

  it("keeps a hidden functional listener private while its subjectless occasion stays public", () => {
    const b = board("player", { back: [H.discard.id], hand: [v.vanilla1.id], deck: [H.hidden.id, ...deck] });
    const done = run(b.state, "player", b.ids.player.back[0]!);
    expect(empty(done.events)).toEqual([{ kind: "handEmptied", side: "player" }]);
    expect(done.state.sides.player.score).toBe(1);
    const callback = queued(done.events)[0];
    expect(callback.subject).toBeNull();
    expect(eventSeenBy(callback, "enemy", done.state)).toBeNull();
    expect(eventSeenBy(callback, "player", done.state)).toMatchObject({ source: null, subject: null });
  });

  it("queues in causal/listener FIFO order and waits for all redraw instructions", () => {
    const b = board("player", { back: [H.watch.id, H.played.id, H.draw.id], hand: [v.event0.id] }, { back: [H.other.id] });
    const played = runStep(b.state, { kind: "play", card: b.ids.player.hand[0], from: "hand" }, NO_PROMPTS, E.catalog);
    if (played.kind !== "done") throw new Error("Unexpected prompt");
    expect(played.state.triggerQueue.map(t => t.source)).toEqual([b.ids.player.back[0], b.ids.player.back[2], b.ids.enemy.back[0], b.ids.player.back[1]]);
    expect(played.state.sides.player.score).toBe(0);
    expect(played.events.findIndex(e => e.kind === "handEmptied")).toBeLessThan(played.events.findIndex(e => e.kind === "cardPlayed"));
    const redraw = board("player", { back: [H.watch.id, H.draw.id, H.redraw.id], hand: [v.vanilla1.id, v.vanilla2.id] });
    const done = run(redraw.state, "player", redraw.ids.player.back[2]!);
    expect(empty(done.events)).toHaveLength(1);
    expect(done.state.sides.player.hand).toHaveLength(3);
    const draws = done.events.flatMap((e, i) => e.kind === "cardDrawn" ? [i] : []);
    expect(draws[1]).toBeLessThan(done.events.findIndex(e => e.kind === "triggerResolved"));
    expect(draws[2]).toBeGreaterThan(draws[1]);
  });

  it("checks new listeners after direct entry and retains the substantive top-revelation boundary", () => {
    const self = board("player", { back: [H.materialize.id], hand: [H.watch.id] });
    expect(run(self.state, "player", self.ids.player.back[0]!).state.sides.player.score).toBe(1);
    const normal = board("player", { hand: [H.watch.id] });
    const played = run(normal.state, "player", normal.ids.player.hand[0], false);
    expect(empty(played.events)).toEqual([{ kind: "handEmptied", side: "player" }]);
    expect(played.state.sides.player.score).toBe(0);
    for (const source of [H.reveal, H.conditionalReveal]) {
      const b = board("player", { back: [H.materialize.id], hand: [source.id] });
      const cast = E.apply(b.state, "player", { kind: "activate", source: b.ids.player.back[0]!, ability: 0 }, answer());
      // E.apply may finish automatically; its ordered public events still prove the boundary.
      const rest = passUntil(E, cast.state, s => s.stack.length === 0 && s.triggerQueue.length === 0, answer());
      const events = [...cast.events, ...rest.events];
      const kinds = events.map(e => e.kind);
      expect(kinds.indexOf("handEmptied")).toBeLessThan(kinds.indexOf("materialized"));
      expect(kinds.indexOf("materialized")).toBeLessThan(kinds.indexOf("revealed"));
      expect(E.view(rest.state, "enemy").sides.player.deck.known).toEqual([{ id: b.ids.player.deck[0], index: 0 }]);
    }
  });

  it("preserves public queue subjects and continuation in a hidden-hand determinization", () => {
    const b = board("player", { back: [H.watch.id], hand: [v.event0.id] });
    const out = runStep(b.state, { kind: "play", card: b.ids.player.hand[0], from: "hand" }, NO_PROMPTS, E.catalog);
    if (out.kind !== "done") throw new Error("Unexpected prompt");
    const lists = { player: [H.watch.id, v.event0.id, ...deck].map(cardId => ({ cardId })), enemy: deck.map(cardId => ({ cardId })) };
    const view = E.view(out.state, "enemy");
    expect(view.triggerQueue.map(t => t.subject)).toEqual([null]);
    expect(determinizationDivergences(E, out.state, lists, battleSeed("hand-empty-sample"), 0)).toEqual([]);
    const sample = E.determinize(view, lists, () => 0.5);
    const callback = runStep(sample, { kind: "resolveTrigger" }, NO_PROMPTS, E.catalog);
    if (callback.kind !== "done") throw new Error("Unexpected prompt");
    expect(callback.state.sides.player.score).toBe(1);
  });
});

describe("whenHandBecomesEmpty recovery", () => {
  it("rolls back a late failure and rejects an invalid discard cohort before any departure", () => {
    for (const operation of [H.fail, H.invalid]) {
      const b = board("player", { back: [H.watch.id], hand: [operation.id, v.vanilla1.id] }, { hand: [v.interruptEvent.id] });
      const cast = E.apply(b.state, "player", { kind: "play", card: b.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
      const before = stateHash(cast.state), observed: EngineEvent[] = [];
      expect(() => runStep(cast.state, { kind: "resolveTop" }, NO_PROMPTS, E.catalog, { observeEvent: e => observed.push(e) })).toThrow();
      expect(empty(observed)).toHaveLength(operation === H.fail ? 1 : 0);
      expect(stateHash(cast.state)).toBe(before);
      const logs: EngineLogRecord[] = [];
      const fold = createFoldAdapter(E, { checkEventPrefix: true, log: e => logs.push(e) });
      const outcome = fold.reduce(slice(cast.state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
      if (outcome.kind !== "applied") throw new Error("Expected failed resolution");
      expect(outcome.error).not.toBeNull();
      expect(empty(outcome.published)).toEqual([]);
      expect(logs.filter(e => e.event === "engine.handEmptied")).toEqual([]);
      expect(stateHash(outcome.slice.committed)).toBe(before);
      expect(outcome.slice.inFlight).toBeNull();
    }
  });

  it("cancels before commitment without an empty occasion or callback", () => {
    const b = board("player", { back: [H.watch.id], hand: [H.cancel.id] });
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start = slice(b.state);
    const opening = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } });
    const opened = applied(opening), pending = fold.pending(opened)!;
    if (opening.kind !== "applied") throw new Error("Expected play prompt");
    expect(empty(opening.published)).toEqual([]);
    const done = applied(fold.reduce(JSON.parse(JSON.stringify(opened)) as BattleSlice, { kind: "cancel", side: "player", promptId: pending.prompt.id }));
    expect(stateHash(done.committed)).toBe(stateHash(b.state));
    expect(done.committed.triggerQueue).toEqual([]);
  });

  it("replays a partially written effect prefix once after reload, rejects other actors and stale answers", () => {
    const b = board("player", { back: [H.watch.id, H.pause.id], hand: [v.vanilla1.id] }, { hand: [v.interruptEvent.id] });
    const logs: EngineLogRecord[] = [], fold = createFoldAdapter(E, { checkEventPrefix: true, log: e => logs.push(e) });
    const cast = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: { kind: "activate", source: b.ids.player.back[1]!, ability: 0 } }));
    const opening = fold.reduce(cast, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    const opened = applied(opening), pending = fold.pending(opened)!;
    if (opening.kind !== "applied") throw new Error("Expected resolution prompt");
    expect(empty(opening.published)).toHaveLength(1);
    expect(opened.committed.sides.player.hand).toHaveLength(1);
    expect(pending.display.sides.player.hand).toEqual([]);
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const accept = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, accept)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { ...accept, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { ...accept, value: 3 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(saved, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const done = fresh.reduce(saved, accept), result = applied(done);
    if (done.kind !== "applied") throw new Error("Expected answer");
    expect(empty(done.published)).toEqual([]);
    expect(result.committed.sides.player.hand).toHaveLength(1);
    expect(result.committed.sides.player.score).toBe(1);
    expect(stateHash(result.committed)).toBe(stateHash(applied(fold.reduce(opened, accept)).committed));
    expect(logs.filter(e => e.event === "engine.handEmptied")).toHaveLength(1);
    expect(fresh.reduce(result, accept)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("resolves an optional queued callback once across reload without disclosing a card subject", () => {
    const b = board("player", { back: [H.may.id], hand: [v.event0.id] }, { hand: [v.interruptEvent.id] });
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(b.state), { kind: "battleAction", side: "player", action: { kind: "play", card: b.ids.player.hand[0], from: "hand" } }));
    const pending = fold.pending(opened)!;
    expect(opened.committed.sides.player.hand).toEqual([]);
    expect(E.view(opened.committed, "enemy").triggerQueue.map(t => t.subject)).toEqual([null]);
    const reloaded = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const accept = { kind: "answer", side: "player", promptId: pending.prompt.id, value: true } as const;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const done = applied(fresh.reduce(reloaded, accept));
    expect(done.committed.sides.player.currentEnergy).toBe(b.state.sides.player.currentEnergy + 1);
    expect(stateHash(done.committed)).toBe(stateHash(applied(fold.reduce(opened, accept)).committed));
    expect(fresh.reduce(done, accept)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });
});
