/**
 * "When you discard this card" (`whenDiscardSelf`; rules § Ability Types →
 * When you discard this card; RD-hv-umm2.82-1): the card's own discard from
 * its owner's hand, by any cause, matched once `discarded` announces it in
 * the void, where the ability works.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, anyCharacter, discardCost, energy, event, everyIn, target, thisCardIn } from "../../../dsl/builders";
import { either, onMaterialized, triggered, whenDiscard, whenDiscardSelf } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { hasKeyword } from "../../../rules/keywords";
import { discardCard } from "../../../rules/resources";
import { routeCosts } from "../../../rules/timing";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { discard } from "../discard";
import { discardChosen } from "../discard-chosen";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { erode } from "../erode";
import { gainEnergy } from "../gain-energy";
import { grantReclaim } from "../grant-reclaim";
import { optional } from "../optional";
import { putInDeck } from "../put-in-deck";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x8200 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const D = {
  /** "When you discard this card, it gains reclaim 0●." */
  guide: card(0, "character", 3, () => [triggered(whenDiscardSelf(), grantReclaim(thisCardIn("void"), { costs: [energy(0)] }), { zone: "void" })]),
  /** "Gain 1●. When you discard this card, it gains reclaim." */
  answers: card(1, "event", 2, () => [event(gainEnergy(1)), triggered(whenDiscardSelf(), grantReclaim(thisCardIn("void")), { zone: "void" })]),
  /** "When you discard a card, gain 1●." */
  discardWatch: card(2, "character", 5, () => [triggered(whenDiscard(), gainEnergy(1))]),
  /** "Discard a card: Gain 1●." */
  discardForEnergy: card(3, "character", 5, () => [activated([discardCost()], gainEnergy(1))]),
  /** "When you discard a card, put each card in your void on the bottom of your deck." */
  voidToDeck: card(4, "character", 5, () => [triggered(whenDiscard(), putInDeck([everyIn("void")], "bottom"))]),
  /** "When you discard a card, you may draw a card." */
  mayDraw: card(5, "character", 5, () => [triggered(whenDiscard(), optional(draw(1)))]),
} as const;
const S = {
  discardOne: card(10, "event", 0, () => [event(discard(1))]),
  opponentDiscards: card(11, "event", 0, () => [event(discard(1, "opponent"))]),
  chosenDiscard: card(12, "event", 0, () => [event(discardChosen())]),
  dissolveOne: card(13, "event", 0, () => [event(dissolve(target(anyCharacter())))]),
  erodeOne: card(14, "event", 0, () => [event(erode(1))]),
  discardInterrupt: { ...card(16, "event", 0, () => [event(discard(1))]), speed: "interrupt" },
  underlying: card(17, "event", 0, () => [event(gainEnergy(4))]),
  /** Discards the first other card of its controller's hand, then fails. */
  failing: { ...card(15, "event", 0, () => []), synthetic: {
    resolve(ctx, item) {
      const [first] = ctx.state.sides[item.controller].hand;
      if (first !== undefined) discardCard(ctx, item.controller, first);
      throw new Error("synthetic failure after a discard");
    },
  } } satisfies EngineCardDefinition,
} as const;

const E = createEngine(testCatalog([...Object.values(D), ...Object.values(S)]));
const deck = Array.from({ length: 6 }, () => v.vanilla3.id);

function setup(board: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "active" | "phase">>) {
  return boardState(E.catalog, { active: "player", phase: "day", ...board });
}
function act(state: BattleState, side: Side, action: Action, answers: readonly Answer[] = []) {
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, action, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function cast(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card, from: "hand" }, answers);
}
function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function controllers(events: readonly EngineEvent[]): Side[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.controller] : []));
}
const reclaimable = (state: BattleState, id: InstanceId) => hasKeyword(state, E.catalog, id, "reclaim");
const reclaimCosts = (state: BattleState, id: InstanceId) => routeCosts(state, E.catalog, id, "reclaim");

describe("whenDiscardSelf", () => {
  it("triggers from the void on its own discard only, after the discard, and grants Reclaim at the stated or printed cost", () => {
    const { state, ids } = setup({
      player: { back: [D.discardWatch.id], hand: [S.discardOne.id, D.guide.id, S.discardOne.id, D.answers.id, v.vanilla1.id], void: [D.guide.id], energy: 0, deck },
      enemy: { deck },
    });
    const [watch] = ids.player.back;
    const [first, guide, second, answers] = ids.player.hand;
    const [resting] = ids.player.void;
    const discarded = cast(state, "player", first, [[guide]]);
    // The in-play watcher first, then the discarded card in the void; the copy already in the void sees nothing.
    expect(queued(discarded.events)).toEqual([watch, guide]);
    const kinds = discarded.events.map((entry) => entry.kind);
    expect(kinds.indexOf("discarded")).toBeLessThan(kinds.lastIndexOf("triggerQueued"));
    expect(discarded.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: guide, controller: "player", subject: guide }));
    expect(discarded.state.instances[guide]?.zone).toBe("void");
    expect(reclaimable(discarded.state, guide)).toBe(true);
    expect(reclaimable(discarded.state, resting)).toBe(false);
    expect(reclaimCosts(discarded.state, guide)).toEqual([energy(0)]);
    const plain = cast(discarded.state, "player", second, [[answers]]);
    expect(queued(plain.events)).toEqual([watch, answers]);
    expect(reclaimCosts(plain.state, answers)).toEqual([energy(2)]);
    // Reclaim 0●: played from the void with no energy, and reclaimed.
    const played = act(plain.state, "player", { kind: "play", card: guide, from: "void" });
    expect(played.state.instances[guide]?.zone).toBe("play");
    expect(played.state.instances[guide]?.status.reclaimed).toBe(true);
  });

  it("triggers whatever made its owner discard it: a cost, the opponent's discard effect, a chosen discard, and the hand limit", () => {
    const cost = setup({ player: { back: [D.discardForEnergy.id], hand: [D.guide.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [guide] = cost.ids.player.hand;
    const paid = act(cost.state, "player", { kind: "activate", source: cost.ids.player.back[0]!, ability: 0 }, [[guide]]);
    expect(queued(paid.events)).toEqual([guide]);
    expect(reclaimable(paid.state, guide)).toBe(true);

    // The opponent's effect makes the enemy discard; the enemy's own card triggers for the enemy.
    const forced = setup({ player: { hand: [S.opponentDiscards.id, S.chosenDiscard.id], energy: 0, deck }, enemy: { hand: [D.guide.id, D.answers.id, v.vanilla1.id], deck } });
    const [enemyGuide, enemyAnswers] = forced.ids.enemy.hand;
    const made = cast(forced.state, "player", forced.ids.player.hand[0], [[enemyGuide]]);
    expect(queued(made.events)).toEqual([enemyGuide]);
    expect(controllers(made.events)).toEqual(["enemy"]);
    expect(reclaimable(made.state, enemyGuide)).toBe(true);
    // The player chooses the card from the enemy's hand; the enemy still discards it.
    const chosen = cast(made.state, "player", forced.ids.player.hand[1], [[enemyAnswers]]);
    expect(queued(chosen.events)).toEqual([enemyAnswers]);
    expect(controllers(chosen.events)).toEqual(["enemy"]);
    expect(reclaimCosts(chosen.state, enemyAnswers)).toEqual([energy(2)]);

    const full = setup({ phase: "night", player: { hand: [D.guide.id, ...Array.from({ length: 10 }, () => v.vanilla1.id)], deck }, enemy: { deck } });
    const [kept] = full.ids.player.hand;
    const ended = act(full.state, "player", { kind: "pass" }, [[kept]]);
    expect(ended.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: kept, subject: kept }));
    expect(ended.state.sides.player.void).toContain(kept);
    expect(reclaimable(ended.state, kept)).toBe(true);
  });

  it("drains an Interrupt's discard watcher and self-trigger in order before the underlying item resolves", () => {
    const { state, ids } = setup({
      player: { hand: [S.underlying.id], energy: 0, deck },
      enemy: { back: [D.discardWatch.id], hand: [S.discardInterrupt.id, D.guide.id], energy: 0, deck },
    });
    const [underlying] = ids.player.hand;
    const [interrupt, guide] = ids.enemy.hand;
    const [watch] = ids.enemy.back;
    const played = cast(state, "player", underlying);
    expect(played.state.instances[underlying]?.zone).toBe("stack");
    expect(played.events.some((entry) => entry.kind === "resolved")).toBe(false);
    expect(E.legalActions(played.state, "enemy")).toContainEqual({ kind: "play", card: interrupt, from: "hand" });

    const result = cast(played.state, "enemy", interrupt);
    expect(queued(result.events)).toEqual([watch, guide]);
    expect(controllers(result.events)).toEqual(["enemy", "enemy"]);
    const resolutionOrder = result.events.flatMap((entry) => {
      if (entry.kind === "resolved") return [entry.instance];
      if (entry.kind === "triggerResolved") return [entry.source];
      return [];
    });
    expect(resolutionOrder).toEqual([interrupt, watch, guide, underlying]);
    // Observable effects also finish before the underlying effect begins.
    const underlyingIndex = result.events.findIndex((entry) => entry.kind === "resolved" && entry.instance === underlying);
    const watcherIndex = result.events.findIndex((entry) => entry.kind === "energyChanged" && entry.side === "enemy" && entry.cause === "effect");
    const reclaimIndex = result.events.findIndex((entry) => entry.kind === "effectStarted" && entry.source === guide);
    const underlyingEffectIndex = result.events.findIndex((entry) => entry.kind === "energyChanged" && entry.side === "player" && entry.cause === "effect");
    expect(watcherIndex).toBeGreaterThan(-1);
    expect(reclaimIndex).toBeGreaterThan(watcherIndex);
    expect(underlyingIndex).toBeGreaterThan(reclaimIndex);
    expect(underlyingEffectIndex).toBeGreaterThan(underlyingIndex);
    expect(result.state.sides.enemy.currentEnergy).toBe(1);
    expect(result.state.sides.player.currentEnergy).toBe(4);
    expect(reclaimCosts(result.state, guide)).toEqual([energy(0)]);
    expect(result.state.stack).toEqual([]);
    expect(result.state.triggerQueue).toEqual([]);
  });

  it("does not trigger when its card is discarded from a hand by a player who does not own it", () => {
    const { state, ids } = setup({ player: { hand: [S.opponentDiscards.id], energy: 0, deck }, enemy: { hand: [D.guide.id, v.vanilla1.id], deck } });
    const [held] = ids.enemy.hand;
    state.instances[held] = { ...state.instances[held], owner: "player" };
    // The enemy discards the player's card: it goes to the player's void, but the player did not discard it.
    const result = cast(state, "player", ids.player.hand[0], [[held]]);
    expect(result.state.sides.player.void).toContain(held);
    expect(result.events).toContainEqual({ kind: "discarded", side: "enemy", instance: held });
    expect(queued(result.events)).toEqual([]);
    expect(reclaimable(result.state, held)).toBe(false);
  });

  it("works only from the void: no trigger as its card leaves play, is eroded, or ceases to exist, and no other zone is accepted", () => {
    expect(() => triggered(whenDiscardSelf(), gainEnergy(1))).toThrow();
    expect(() => triggered(whenDiscardSelf(), gainEnergy(1), { zone: "any" })).toThrow();
    expect(() => triggered(either(onMaterialized(), whenDiscardSelf()), gainEnergy(1), { zone: "hand" })).toThrow();
    expect(triggered(whenDiscardSelf(), gainEnergy(1), { zone: "void" }).zone).toBe("void");

    const { state, ids } = setup({
      player: { back: [D.guide.id, v.vanilla1.id], hand: [S.dissolveOne.id, S.erodeOne.id, S.discardOne.id, D.guide.id, v.vanilla1.id], deck: [D.guide.id, ...deck], energy: 0 },
      enemy: { deck },
    });
    const [inPlay] = ids.player.back;
    const [dissolveCard, erodeCard, discardOne, created] = ids.player.hand;
    const [top] = ids.player.deck;
    const dissolved = cast(state, "player", dissolveCard, [[inPlay!]]);
    expect(dissolved.state.instances[inPlay!]?.zone).toBe("void");
    const eroded = cast(dissolved.state, "player", erodeCard);
    expect(eroded.state.instances[top]?.zone).toBe("void");
    // A created card is announced as discarded while still in hand, and ceases to exist.
    eroded.state.instances[created].status.created = true;
    const gone = cast(eroded.state, "player", discardOne, [[created]]);
    expect(gone.state.instances[created]).toBeUndefined();
    for (const result of [dissolved, eroded, gone]) expect(queued(result.events)).toEqual([]);
    expect([inPlay!, top].map((id) => reclaimable(gone.state, id))).toEqual([false, false]);
  });

  it("names its card to both sides when it is discarded from a hidden hand, with nothing redacted", () => {
    const { state, ids } = setup({ player: { hand: [S.discardOne.id, D.guide.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [discardOne, guide] = ids.player.hand;
    expect(E.view(state, "enemy").instances[guide]).toBeUndefined();
    const result = cast(state, "player", discardOne, [[guide]]);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = result.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, result.state);
        return shown === null ? [] : [shown];
      });
      expect(seen).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: guide, subject: guide }));
      expect(E.view(result.state, viewer).instances[guide]?.characteristics.keywords).toContain("reclaim");
    }
    expect(result.events.filter((entry) => entry.kind === "triggerQueued" && entry.subjectHiddenFrom !== undefined)).toEqual([]);
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("grants nothing when its card leaves the void before the trigger resolves", () => {
    const { state, ids } = setup({ player: { back: [D.voidToDeck.id], hand: [S.discardOne.id, D.guide.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [watch] = ids.player.back;
    const [discardOne, guide] = ids.player.hand;
    const result = cast(state, "player", discardOne, [[guide]]);
    // The in-play watcher resolves first and puts the discarded card into the deck.
    expect(queued(result.events)).toEqual([watch, guide]);
    expect(result.state.instances[guide]?.zone).toBe("deck");
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: guide, applied: true }));
    expect(result.events.some((entry) => entry.kind === "effectStarted")).toBe(false);
    expect(reclaimable(result.state, guide)).toBe(false);
  });

  it("keeps a queued trigger across a reload and resolves it identically through the fold", () => {
    const { state, ids } = setup({ player: { back: [D.mayDraw.id], hand: [S.discardOne.id, D.guide.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [mayDraw] = ids.player.back;
    const [discardOne, guide] = ids.player.hand;
    const action = { kind: "play", card: discardOne, from: "hand" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([[guide], true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied") throw new Error("bounced");
    const choose = fold.pending(opened.slice);
    if (choose === null) throw new Error("no discard prompt");
    const chosen = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: choose.prompt.id, value: [guide] });
    if (chosen.kind !== "applied" || chosen.error !== null) throw new Error("discard failed");
    const saved = JSON.parse(JSON.stringify(chosen.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(chosen.slice.committed)) };
    const pending = createFoldAdapter(E, { checkEventPrefix: true }).pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(pending.display.triggerQueue.map((entry) => entry.source)).toEqual([guide]);
    const answered = createFoldAdapter(E, { checkEventPrefix: true }).reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: true });
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...chosen.published, ...answered.published]).toEqual(inline.events);
    expect(reclaimCosts(answered.slice.committed, guide)).toEqual([energy(0)]);
  });

  it("queues nothing from a step that fails after its card was discarded", () => {
    const { state, ids } = setup({ player: { hand: [D.guide.id, S.failing.id], energy: 0, deck }, enemy: { deck } });
    const [guide, failing] = ids.player.hand;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: failing, from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.error.message).toContain("synthetic failure after a discard");
    expect(outcome.published.some((entry) => entry.kind === "discarded" || entry.kind === "triggerQueued")).toBe(false);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
    expect(outcome.slice.committed.sides.player.hand).toContain(guide);
    expect(reclaimable(outcome.slice.committed, guide)).toBe(false);
  });
});
