/** Public synthetic contracts for the two imported, permanent pair-293 emblems. */
import { describe, expect, it } from "vitest";
import keeper from "../../../content/apollyon/aspects/aspect-9ae35d68-a432-45f6-ab8c-07572a25ad6b";
import butcher from "../../../content/apollyon/aspects/aspect-ac116276-5569-491b-85c9-e192823bddae";
import { parseAvatarId, parsePromptId } from "../../../types/identifiers";
import type { EngineCardDefinition } from "../../../engine/catalog";
import { copiableCostOf } from "../../../engine/continuous/characteristics";
import { abandonCost, activated, anyCharacter, discardCost, energy, event, everyIn, target } from "../../../engine/dsl/builders";
import { NO_DECK_MODS, type AbilityList } from "../../../engine/dsl/types";
import { createEngine } from "../../../engine/engine";
import * as p from "../../../engine/effects/primitives";
import { eventSeenBy, type EngineEvent } from "../../../engine/events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../engine/fold/slice";
import type { Answer } from "../../../engine/prompts/types";
import type { Action } from "../../../engine/rules/actions";
import { abandonCharacter } from "../../../engine/rules/costs";
import { hasKeyword } from "../../../engine/rules/keywords";
import { discardCard } from "../../../engine/rules/resources";
import { routeCosts } from "../../../engine/rules/timing";
import { deserializeState, stateHash } from "../../../engine/state/hash";
import { opponent, type InstanceId, type Side } from "../../../engine/state/ids";
import type { BattleState } from "../../../engine/state/types";
import { ScriptedSource } from "../../../engine/steps/sources";
import { boardState, placeFigment, type SideSetup } from "../../../engine/testing/board";
import { invariantViolations } from "../../../engine/testing/invariants";
import { eventRedactionViolations, redactionViolations } from "../../../engine/testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../../engine/testing/trigger-harness";

const KEEPER = parseAvatarId("00974abd-19d8-4d83-8af9-6a34e67f11a0");
const BUTCHER = parseAvatarId("e9fa35a7-fe02-4046-b10b-78e1abcc557a");
function card(index: number, abilities: AbilityList, character = false): EngineCardDefinition {
  return { id: syntheticId(0x29300 + index), cardType: character ? "character" : "event", costs: [energy(0)],
    spark: character ? 1 : null, subtype: character ? "Warrior" : "", speed: "standard", status: "authored", abilities };
}
const C = {
  discard: card(0, () => [event(p.discard(1))]),
  discardTwo: card(1, () => [event(p.discard(2))]),
  forceDiscard: card(2, () => [event(p.discard(1, "opponent"))]),
  emptyRandom: card(3, () => [event(p.discardRandom(1))]),
  discardToDeck: card(4, () => [event(p.sequence(p.discard(1), p.putInDeck([everyIn("void")], "bottom")))]),
  discardPayer: card(5, () => [activated([discardCost()], p.gainEnergy(1))], true),
  abandon: card(6, () => [event(p.abandon())]),
  abandonTwo: card(7, () => [event(p.sequence(p.abandon(), p.abandon()))]),
  forceAbandon: card(8, () => [event(p.abandon("opponent"))]),
  abandonPayer: card(9, () => [activated([abandonCost()], p.gainEnergy(1))], true),
  dissolve: card(10, () => [event(p.dissolve(target(anyCharacter())))]),
  failDiscard: { ...card(11, () => []), synthetic: { resolve(ctx, item) {
    const first = ctx.state.sides[item.controller].hand[0];
    if (first === undefined) throw new Error("missing synthetic discard subject");
    discardCard(ctx, item.controller, first);
    throw new Error("synthetic failure after discard");
  } } } satisfies EngineCardDefinition,
  failAbandon: { ...card(12, () => []), synthetic: { resolve(ctx, item) {
    const first = ctx.state.sides[item.controller].backRank.find((id) => id !== null);
    if (first === undefined) throw new Error("missing synthetic abandon subject");
    abandonCharacter(ctx, item.controller, first);
    throw new Error("synthetic failure after abandon");
  } } } satisfies EngineCardDefinition,
};
const E = createEngine(testCatalog(Object.values(C), { avatars: [
  { id: KEEPER, status: "authored", abilities: keeper }, { id: BUTCHER, status: "authored", abilities: butcher },
] }));
const deck = Array.from({ length: 8 }, () => v.vanilla3.id);
function setup(side: Side, aspect: typeof KEEPER, own: SideSetup, other: SideSetup = {}) {
  return boardState(E.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { avatar: aspect, energy: 8, deck, ...own },
    [opponent(side)]: { avatar: aspect, energy: 8, deck, ...other } });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const first = E.apply(state, side, action, source);
  const rest = passUntil(E, first.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  source.assertExhausted();
  const events = [...first.events, ...rest.events];
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  expect(redactionViolations(rest.state, E.catalog)).toEqual([]);
  expect(eventRedactionViolations(events, state, rest.state)).toEqual([]);
  return { state: rest.state, events };
}
const play = (card: InstanceId, from: "hand" | "void" = "hand"): Action => ({ kind: "play", card, from });
const emblem = (side: Side) => ({ kind: "avatar", side });
const queued = (events: readonly EngineEvent[]) => events.filter((entry) => entry.kind === "triggerQueued");
const grants = (events: readonly EngineEvent[]) => events.flatMap((entry) => entry.kind === "effectStarted" && entry.change.kind === "keyword" ? [entry.change.instance] : []);
const reclaimable = (state: BattleState, id: InstanceId) => hasKeyword(state, E.catalog, id, "reclaim");
const canReclaim = (state: BattleState, side: Side, id: InstanceId) => E.legalActions(state, side).some((a) => a.kind === "play" && a.card === id && a.from === "void");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`unexpected fold outcome ${JSON.stringify(out)}`);
  return out;
}

describe.each(["player", "enemy"] as const)("pair 293 permanent Aspects for %s", (side) => {
  const other = opponent(side);
  it("Keeper grants only the first individual discard subject, preserves copiable characteristics, and expires at turn end", () => {
    const variant = { cardId: v.vanilla2.id, amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 2, typeChange: { cardType: "character" as const, subtype: "Mage" as const } } };
    const { state, ids } = setup(side, KEEPER, { hand: [C.discardTwo.id, variant, v.event1.id, C.discard.id, v.vanilla1.id], void: [v.event0.id] });
    const [spell, first, second, again, third] = ids[side].hand;
    const discarded = act(state, side, play(spell), [[second, first]]);
    // Individual discard order follows the hand, even when the answer lists the second first.
    expect(queued(discarded.events)).toEqual([expect.objectContaining({ source: emblem(side), controller: side, subject: first })]);
    expect(grants(discarded.events)).toEqual([first]);
    expect([first, second, spell, third, ids[side].void[0]].map((id) => reclaimable(discarded.state, id))).toEqual([true, false, false, false, false]);
    expect(copiableCostOf(discarded.state, E.catalog, first)).toBe(1);
    expect(routeCosts(discarded.state, E.catalog, first, "reclaim")).toEqual([energy(1)]);
    for (const viewer of [side, other]) expect(E.view(discarded.state, viewer).instances[first]?.characteristics).toMatchObject({ cardType: "character", cost: 1, spark: 4, subtype: "Mage", keywords: ["reclaim"] });
    expect(canReclaim(discarded.state, side, first)).toBe(true);
    expect(canReclaim(discarded.state, other, first)).toBe(false);
    const repeated = act(discarded.state, side, play(again));
    expect(queued(repeated.events)).toEqual([]);
    const next = passUntil(E, repeated.state, at(E, other, "day"));
    expect(reclaimable(next.state, first)).toBe(false);
    expect(next.events.some((e) => e.kind === "effectEnded")).toBe(true);
  });

  it("Keeper resets on the actual next turn and pays normal Reclaim cost for an event", () => {
    const { state, ids } = setup(side, KEEPER, { back: [C.discardPayer.id], hand: [v.event1.id, v.event1.id] });
    const [first, second] = ids[side].hand;
    const action: Action = { kind: "activate", source: ids[side].back[0]!, ability: 0 };
    const once = act(state, side, action, [[first]]);
    const reclaimed = act(once.state, side, play(first, "void"));
    expect(reclaimed.state.sides[side].currentEnergy).toBe(8);
    expect(reclaimed.state.instances[first]?.zone).toBe("banished");
    const next = passUntil(E, passUntil(E, reclaimed.state, at(E, other, "day")).state, at(E, side, "day")).state;
    const reset = act(next, side, action, [[second]]);
    expect(grants(reset.events)).toEqual([second]);
    expect(queued(reset.events)).toEqual([expect.objectContaining({ source: emblem(side), subject: second })]);
  });

  it("Keeper uses the discarding controller's emblem when an opponent forces the discard", () => {
    const { state, ids } = setup(side, KEEPER, { hand: [C.forceDiscard.id] }, { hand: [v.event1.id] });
    const subject = ids[other].hand[0];
    const result = act(state, side, play(ids[side].hand[0]));
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(other), controller: other, subject })]);
    expect(grants(result.events)).toEqual([subject]);
    expect(E.view(result.state, side).instances[subject]?.characteristics).toMatchObject({ cardType: "event", cost: 1, spark: null, keywords: ["reclaim"] });
  });

  it("Keeper's empty random discard spends neither a trigger nor RNG", () => {
    const empty = setup(side, KEEPER, { hand: [C.emptyRandom.id] });
    const before = empty.state.rng;
    const none = act(empty.state, side, play(empty.ids[side].hand[0]));
    expect(queued(none.events)).toEqual([]);
    expect(none.state.rng).toEqual(before);
  });

  it("Keeper grants nothing to a ceased created card or a subject moved out of void before resolution", () => {
    const created = setup(side, KEEPER, { hand: [C.discard.id, v.event1.id] });
    const subject = created.ids[side].hand[1];
    created.state.instances[subject].status.created = true;
    const gone = act(created.state, side, play(created.ids[side].hand[0]));
    expect(queued(gone.events)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
    expect(gone.state.instances[subject]).toBeUndefined();
    expect(grants(gone.events)).toEqual([]);
    const moved = setup(side, KEEPER, { hand: [C.discardToDeck.id, v.event1.id] });
    const inDeck = moved.ids[side].hand[1];
    const result = act(moved.state, side, play(moved.ids[side].hand[0]));
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(side), subject: inDeck })]);
    expect(result.state.instances[inDeck]?.zone).toBe("deck");
    expect(grants(result.events)).toEqual([]);
  });

  it("Keeper's character Reclaim respects battlefield capacity and retains the grant across save/replay", () => {
    const { state, ids } = setup(side, KEEPER, { back: Array.from({ length: 10 }, () => v.vanilla1.id), hand: [C.discard.id, v.vanilla2.id] });
    const subject = ids[side].hand[1];
    const result = act(state, side, play(ids[side].hand[0]));
    expect(reclaimable(result.state, subject)).toBe(true);
    expect(canReclaim(result.state, side, subject)).toBe(false);
    const saved = deserializeState(JSON.stringify(result.state));
    expect(stateHash(saved)).toBe(stateHash(result.state));
    expect(E.legalActions(saved, side)).toEqual(E.legalActions(result.state, side));
    expect(stateHash(act(deserializeState(JSON.stringify(state)), side, play(ids[side].hand[0])).state)).toBe(stateHash(result.state));
  });

  it("Butcher draws once for the first of multiple abandoned characters and resets next turn", () => {
    const { state, ids } = setup(side, BUTCHER, { back: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], hand: [C.abandonTwo.id, C.abandon.id, C.abandon.id] });
    const [first, second] = ids[side].back;
    const result = act(state, side, play(ids[side].hand[0]), [[first!], [second!]]);
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(side), controller: side, subject: first })]);
    expect(result.events.filter((e) => e.kind === "cardDrawn")).toEqual([{ kind: "cardDrawn", side, instance: ids[side].deck[0] }]);
    expect(result.state.sides[side].hand).toContain(ids[side].deck[0]);
    const repeated = act(result.state, side, play(ids[side].hand[1]));
    expect(queued(repeated.events)).toEqual([]);
    const next = passUntil(E, passUntil(E, repeated.state, at(E, other, "day")).state, at(E, side, "day")).state;
    const materialized = act(next, side, play(ids[side].deck[0])).state;
    const reset = act(materialized, side, play(ids[side].hand[2]));
    expect(queued(reset.events)).toEqual([expect.objectContaining({ source: emblem(side), subject: ids[side].deck[0] })]);
    expect(reset.events.filter((e) => e.kind === "cardDrawn")).toHaveLength(1);
  });

  it("Butcher rewards the abandoning controller, preserves draw privacy, and not a mere dissolve or discard", () => {
    const { state, ids } = setup(side, BUTCHER, { hand: [C.forceAbandon.id, C.dissolve.id, C.discard.id, v.event0.id] }, { back: [v.vanilla2.id, v.vanilla1.id] });
    const subject = ids[other].back[0]!;
    const result = act(state, side, play(ids[side].hand[0]), [[subject]]);
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(other), controller: other, subject })]);
    const drawn = ids[other].deck[0];
    expect(result.state.sides[other].hand).toEqual([drawn]);
    expect(E.view(result.state, other).instances[drawn]?.printing).toEqual({ kind: "card", cardId: v.vanilla3.id });
    expect(E.view(result.state, side).instances[drawn]).toBeUndefined();
    const drawEvent = result.events.find((e) => e.kind === "cardDrawn")!;
    expect(eventSeenBy(drawEvent, other, result.state)).toEqual(drawEvent);
    expect(eventSeenBy(drawEvent, side, result.state)).not.toMatchObject({ instance: drawn });
    const dissolved = act(result.state, side, play(ids[side].hand[1]));
    expect(queued(dissolved.events)).toEqual([]);
    const discarded = act(dissolved.state, side, play(ids[side].hand[2]));
    expect(queued(discarded.events)).toEqual([]);
  });

  it("Butcher sees reclaimed and ceased characters, and an empty deck applies ordinary Fatigue", () => {
    for (const created of [false, true]) {
      const { state, ids } = setup(side, BUTCHER, { back: [v.vanilla2.id], hand: [C.abandon.id], deck: [] });
      const subject = ids[side].back[0]!;
      state.instances[subject].status[created ? "created" : "reclaimed"] = true;
      const result = act(state, side, play(ids[side].hand[0]));
      expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
      expect(result.state.instances[subject]?.zone).toBe(created ? undefined : "banished");
      expect(result.state.sides[side].fatigueCount).toBe(1);
      expect(result.state.sides[other].score).toBe(1);
      expect(result.events.filter((e) => e.kind === "cardDrawn")).toEqual([]);
    }
  });

  it("Butcher matches a ceased figment copy and an opponent-owned subject controlled by the abandoning side", () => {
    const copied = setup(side, BUTCHER, { hand: [C.abandon.id] });
    const copy = placeFigment(copied.state, side, { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: v.vanilla2.id, spark: null });
    const gone = act(copied.state, side, play(copied.ids[side].hand[0]));
    expect(gone.state.instances[copy]).toBeUndefined();
    expect(queued(gone.events)).toEqual([expect.objectContaining({ source: emblem(side), subject: copy })]);
    const borrowed = setup(side, BUTCHER, { back: [v.vanilla1.id], hand: [C.abandon.id] });
    const subject = borrowed.ids[side].back[0]!;
    borrowed.state.instances[subject] = { ...borrowed.state.instances[subject], owner: other };
    const result = act(borrowed.state, side, play(borrowed.ids[side].hand[0]));
    expect(result.state.sides[other].void).toContain(subject);
    expect(result.state.sides[side].hand).toEqual([borrowed.ids[side].deck[0]]);
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
  });

  it("Butcher draws with a full battlefield and grants nothing when there is no abandon candidate", () => {
    const full = setup(side, BUTCHER, { back: [C.abandonPayer.id, ...Array.from({ length: 9 }, () => v.vanilla1.id)] });
    const drawn = act(full.state, side, { kind: "activate", source: full.ids[side].back[0]!, ability: 0 }, [[full.ids[side].back[1]!]]);
    expect(drawn.state.sides[side].hand).toContain(full.ids[side].deck[0]);
    const empty = setup(side, BUTCHER, { hand: [C.abandon.id] });
    expect(queued(act(empty.state, side, play(empty.ids[side].hand[0])).events)).toEqual([]);
  });

  it("Butcher sees an event played as an effective character without changing its copiable cost or spark", () => {
    const changed = { cardId: v.event1.id, amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 7, typeChange: { cardType: "character" as const, subtype: "Mage" as const } } };
    const { state, ids } = setup(side, BUTCHER, { hand: [changed, C.abandon.id] });
    const subject = ids[side].hand[0];
    const played = act(state, side, play(subject)).state;
    expect(E.view(played, side).instances[subject]?.characteristics).toMatchObject({ cardType: "character", subtype: "Mage", cost: 0, spark: 0 });
    const result = act(played, side, play(ids[side].hand[1]));
    expect(queued(result.events)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
    expect(copiableCostOf(result.state, E.catalog, subject)).toBe(0);
    expect(E.view(result.state, side).instances[subject]?.characteristics).toMatchObject({ cardType: "character", cost: 0, spark: 0 });
    expect(result.state.sides[side].hand).toEqual([ids[side].deck[0]]);
  });

  it.each([[KEEPER, C.discardPayer, "hand"], [BUTCHER, C.abandonPayer, "back"]] as const)("saves, cancels and retries the %s cost prompt without spending its emblem use", (aspect, payer, zone) => {
    const fixture = setup(side, aspect, { back: [payer.id, v.vanilla2.id], hand: [v.event1.id, v.vanilla1.id] });
    const subject = zone === "hand" ? fixture.ids[side].hand[0] : fixture.ids[side].back[1]!;
    const action: Action = { kind: "activate", source: fixture.ids[side].back[0]!, ability: 0 };
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(fixture.state), { kind: "battleAction", side, action }));
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(saved)!;
    expect(pending.prompt.cancellable).toBe(true);
    expect(saved.committed.oncePerTurn).toEqual([]);
    expect(fresh.reduce(saved, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(saved, { kind: "answer", side: other, promptId: pending.prompt.id, value: [subject] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side, promptId: parsePromptId("0:0:0"), value: [subject] })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: [] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const cancelled = applied(fresh.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(fixture.state));
    expect(queued(cancelled.published)).toEqual([]);
    const retry = applied(fresh.reduce(cancelled.slice, { kind: "battleAction", side, action }));
    const prompt = fresh.pending(retry.slice)!;
    expect(prompt.prompt.id).not.toBe(pending.prompt.id);
    const done = applied(fresh.reduce(retry.slice, { kind: "answer", side, promptId: prompt.prompt.id, value: [subject] }));
    const inline = act(fixture.state, side, action, [[subject]]);
    expect(stateHash(done.slice.committed)).toBe(stateHash(inline.state));
    expect(queued(done.published)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
  });

  it.each([[KEEPER, C.discard, "hand"], [BUTCHER, C.abandon, "back"]] as const)("reloads the committed %s effect prompt, refuses cancellation, and replays one emblem reward", (aspect, cause, zone) => {
    const fixture = setup(side, aspect, { hand: [cause.id, v.event1.id, v.vanilla1.id], back: [v.vanilla1.id, v.vanilla2.id] });
    const subject = zone === "hand" ? fixture.ids[side].hand[1] : fixture.ids[side].back[1]!;
    const action = play(fixture.ids[side].hand[0]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(slice(fixture.state), { kind: "battleAction", side, action }));
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const saved = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const pending = fresh.pending(saved)!;
    expect(pending.prompt.cancellable).toBe(false);
    expect(saved.committed.sides[side].avatar?.id).toBe(aspect);
    expect(fresh.reduce(saved, { kind: "cancel", side, promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    const done = applied(fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value: [subject] }));
    const inline = act(fixture.state, side, action, [[subject]]);
    expect([...opened.published, ...done.published]).toEqual(inline.events);
    expect(stateHash(done.slice.committed)).toBe(stateHash(inline.state));
    const reloaded = deserializeState(JSON.stringify(done.slice.committed));
    expect(stateHash(reloaded)).toBe(stateHash(inline.state));
    expect(E.legalActions(reloaded, side)).toEqual(E.legalActions(inline.state, side));
    expect(queued(done.published)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
    expect(fresh.reduce(done.slice, { kind: "answer", side, promptId: pending.prompt.id, value: [subject] })).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it.each([[KEEPER, C.failDiscard, C.discard], [BUTCHER, C.failAbandon, C.abandon]] as const)("keeps a failed %s resolve uncommitted and recovers from a saved healthy action boundary", (aspect, failing, valid) => {
    const { state, ids } = setup(side, aspect, { back: [v.vanilla2.id], hand: [failing.id, valid.id, v.event1.id] });
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const failed = fold.reduce(slice(state), { kind: "battleAction", side, action: play(ids[side].hand[0]) });
    if (failed.kind !== "applied" || failed.error === null) throw new Error("expected synthetic step failure");
    expect(failed.slice.inFlight).toBeNull();
    expect(failed.slice.committed.oncePerTurn).toEqual([]);
    expect(failed.slice.committed.triggerQueue).toEqual([]);
    expect(queued(failed.published)).toEqual([]);
    expect(grants(failed.published)).toEqual([]);
    const subject = aspect === KEEPER ? ids[side].hand[2] : ids[side].back[0]!;
    expect(failed.slice.committed.instances[subject]?.zone).toBe(aspect === KEEPER ? "hand" : "play");
    // Restart from the saved healthy action boundary; the failed resolving card remains on its stack.
    const healthy = deserializeState(JSON.stringify(state));
    const retry = act(healthy, side, play(ids[side].hand[1]), aspect === KEEPER ? [[subject]] : []);
    expect(queued(retry.events)).toEqual([expect.objectContaining({ source: emblem(side), subject })]);
  });
});
