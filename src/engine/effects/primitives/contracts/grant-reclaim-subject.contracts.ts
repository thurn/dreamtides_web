/**
 * `grantReclaim(triggeringCard())` (rules § Keywords and Effects → Reclaim;
 * RD-hv-umm2.494-1): "When you discard a card, it gains reclaim". The card a
 * discard trigger concerns gains Reclaim only while it is in a void as the
 * ability resolves.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, discardCost, energy, event, everyIn } from "../../../dsl/builders";
import { triggered, triggeringCard, whenDiscard } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import type { Answer, PromptId } from "../../../prompts/types";
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
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { grantReclaim } from "../grant-reclaim";
import { optional } from "../optional";
import { putInDeck } from "../put-in-deck";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0x7a40 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const G = {
  /** "Discard a card: Gain 1●. When you discard a card, it gains reclaim." */
  seeker: card(0, "character", 2, () => [activated([discardCost()], gainEnergy(1)), triggered(whenDiscard(), grantReclaim(triggeringCard()))]),
  /** "When you discard a card, put each card in your void on the bottom of your deck." */
  voidToDeck: card(1, "character", 5, () => [triggered(whenDiscard(), putInDeck([everyIn("void")], "bottom"))]),
  /** "When you discard a card, you may draw a card." */
  mayDraw: card(2, "character", 5, () => [triggered(whenDiscard(), optional(draw(1)))]),
  discardOne: card(10, "event", 0, () => [event(discard(1))]),
  opponentDiscards: card(11, "event", 0, () => [event(discard(1, "opponent"))]),
  chosenDiscard: card(12, "event", 0, () => [event(discardChosen())]),
  /** Discards the first card of its controller's hand, then fails. */
  failing: {
    ...card(13, "event", 0, () => []),
    synthetic: {
      resolve(ctx, item) {
        const [first] = ctx.state.sides[item.controller].hand;
        if (first !== undefined) discardCard(ctx, item.controller, first);
        throw new Error("synthetic failure after a discard");
      },
    },
  } satisfies EngineCardDefinition,
} as const;

const E = createEngine(testCatalog(Object.values(G)));
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
function cast(state: BattleState, side: Side, played: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (played === undefined) throw new Error("no card");
  return act(state, side, { kind: "play", card: played, from: "hand" }, answers);
}
function queued(events: readonly EngineEvent[]): (AbilitySource | null)[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function granted(events: readonly EngineEvent[]): InstanceId[] {
  return events.flatMap((entry) => (entry.kind === "effectStarted" && entry.change.kind === "keyword" ? [entry.change.instance] : []));
}
const reclaimable = (state: BattleState, id: InstanceId) => hasKeyword(state, E.catalog, id, "reclaim");
const canReclaim = (state: BattleState, id: InstanceId, side: Side = "player") =>
  E.legalActions(state, side).some((action) => action.kind === "play" && action.card === id && action.from === "void");

describe("grantReclaim(triggeringCard())", () => {
  it("gives the card discarded by an effect permanent plain Reclaim in its owner's void, which it can then be played by", () => {
    const { state, ids } = setup({
      player: { back: [G.seeker.id], hand: [G.discardOne.id, v.event1.id, v.vanilla1.id], void: [v.event0.id], energy: 1, deck },
      enemy: { deck },
    });
    const [seeker] = ids.player.back;
    const [discardOne, spell, kept] = ids.player.hand;
    const [resting] = ids.player.void;
    const result = cast(state, "player", discardOne, [[spell]]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: seeker, controller: "player", subject: spell }));
    expect(result.events).toContainEqual(
      expect.objectContaining({ kind: "effectStarted", expiry: { at: "never" }, change: { kind: "keyword", instance: spell, keyword: "reclaim", gains: true } }),
    );
    // Only the discarded card gains it: not the card already in the void, the one kept in hand, or the event that discarded.
    expect(granted(result.events)).toEqual([spell]);
    expect([spell, resting, kept, discardOne].map((id) => reclaimable(result.state, id))).toEqual([true, false, false, false]);
    expect(routeCosts(result.state, E.catalog, spell, "reclaim")).toEqual([energy(1)]);
    expect(canReclaim(result.state, spell, "enemy")).toBe(false);
    const played = act(result.state, "player", { kind: "play", card: spell, from: "void" });
    expect(played.state.sides.player.currentEnergy).toBe(0);
    expect(played.state.instances[spell]?.status.reclaimed).toBe(true);
    expect(played.state.instances[spell]?.zone).toBe("banished");
  });

  it("triggers on a discard paid as a cost, its own included, and on the hand-limit discard", () => {
    const cost = setup({ player: { back: [G.seeker.id], hand: [v.event1.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [seeker] = cost.ids.player.back;
    const [paidWith] = cost.ids.player.hand;
    const paid = act(cost.state, "player", { kind: "activate", source: seeker!, ability: 0 }, [[paidWith]]);
    expect(queued(paid.events)).toEqual([seeker]);
    expect(paid.state.instances[paidWith]?.zone).toBe("void");
    expect(reclaimable(paid.state, paidWith)).toBe(true);
    expect(paid.state.sides.player.currentEnergy).toBe(1);

    const full = setup({ phase: "night", player: { back: [G.seeker.id], hand: Array.from({ length: 11 }, () => v.vanilla1.id), deck }, enemy: { deck } });
    const [over] = full.ids.player.hand;
    const ended = act(full.state, "player", { kind: "pass" }, [[over]]);
    expect(ended.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: full.ids.player.back[0], subject: over }));
    expect(reclaimable(ended.state, over)).toBe(true);
  });

  it("does not see the opponent discard, whoever chose the card, and fires for the discarding player's own copy", () => {
    const { state, ids } = setup({
      player: { back: [G.seeker.id], hand: [G.opponentDiscards.id, G.chosenDiscard.id], energy: 0, deck },
      enemy: { hand: [v.event1.id, v.event1.id, v.vanilla1.id], deck },
    });
    const [forced, chosen] = ids.enemy.hand;
    const made = cast(state, "player", ids.player.hand[0], [[forced]]);
    expect(made.events).toContainEqual({ kind: "discarded", side: "enemy", instance: forced });
    expect(queued(made.events)).toEqual([]);
    expect(reclaimable(made.state, forced)).toBe(false);
    const picked = cast(made.state, "player", ids.player.hand[1], [[chosen]]);
    expect(queued(picked.events)).toEqual([]);
    expect(reclaimable(picked.state, chosen)).toBe(false);

    // The enemy's own copy sees the enemy's discard, even one the player forced.
    const mirrored = setup({
      player: { hand: [G.opponentDiscards.id], energy: 0, deck },
      enemy: { back: [G.seeker.id], hand: [v.event1.id, v.vanilla1.id], deck },
    });
    const [enemyCard] = mirrored.ids.enemy.hand;
    const enemyResult = cast(mirrored.state, "player", mirrored.ids.player.hand[0], [[enemyCard]]);
    expect(enemyResult.events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: mirrored.ids.enemy.back[0], controller: "enemy" }));
    expect(reclaimable(enemyResult.state, enemyCard)).toBe(true);
    expect(canReclaim(enemyResult.state, enemyCard)).toBe(false);
  });

  it("grants a card the opponent owns in the opponent's void, and nothing to a created card that ceased to exist", () => {
    const { state, ids } = setup({ player: { back: [G.seeker.id], hand: [G.discardOne.id, v.event1.id, G.discardOne.id, v.event0.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [seeker] = ids.player.back;
    const [first, borrowed, second, created] = ids.player.hand;
    state.instances[borrowed] = { ...state.instances[borrowed], owner: "enemy" };
    const lent = cast(state, "player", first, [[borrowed]]);
    expect(lent.state.sides.enemy.void).toContain(borrowed);
    expect(granted(lent.events)).toEqual([borrowed]);
    expect(reclaimable(lent.state, borrowed)).toBe(true);
    expect(canReclaim(lent.state, borrowed)).toBe(false);

    lent.state.instances[created].status.created = true;
    const gone = cast(lent.state, "player", second, [[created]]);
    expect(gone.state.instances[created]).toBeUndefined();
    expect(gone.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: seeker, applied: true }));
    expect(granted(gone.events)).toEqual([]);
  });

  it("grants nothing when the discarded card left the void before the trigger resolves", () => {
    const { state, ids } = setup({ player: { back: [G.voidToDeck.id, G.seeker.id], hand: [G.discardOne.id, v.event1.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [watch, seeker] = ids.player.back;
    const [discardOne, spell] = ids.player.hand;
    const result = cast(state, "player", discardOne, [[spell]]);
    // The first watcher resolves first and puts the discarded card into the deck.
    expect(queued(result.events)).toEqual([watch, seeker]);
    expect(result.state.instances[spell]?.zone).toBe("deck");
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "triggerResolved", source: seeker, applied: true }));
    expect(granted(result.events)).toEqual([]);
    expect(result.state.floating).toEqual([]);
    expect(reclaimable(result.state, spell)).toBe(false);
  });

  it("names the discarded card to both sides, with nothing redacted, and both views show its Reclaim", () => {
    const { state, ids } = setup({ player: { back: [G.seeker.id], hand: [G.discardOne.id, v.event1.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [discardOne, spell] = ids.player.hand;
    expect(E.view(state, "enemy").instances[spell]).toBeUndefined();
    const result = cast(state, "player", discardOne, [[spell]]);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = result.events.flatMap((entry) => {
        const shown = eventSeenBy(entry, viewer, result.state);
        return shown === null ? [] : [shown];
      });
      expect(seen).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: ids.player.back[0], subject: spell }));
      expect(seen.some((entry) => entry.kind === "effectStarted" && entry.change.kind === "keyword" && entry.change.instance === spell)).toBe(true);
      expect(E.view(result.state, viewer).instances[spell]?.characteristics.keywords).toContain("reclaim");
    }
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("keeps its queued trigger across a reload, bounces stale and other-side answers, and resolves identically", () => {
    const { state, ids } = setup({ player: { back: [G.mayDraw.id, G.seeker.id], hand: [G.discardOne.id, v.event1.id, v.vanilla1.id], energy: 0, deck }, enemy: { deck } });
    const [mayDraw, seeker] = ids.player.back;
    const [discardOne, spell] = ids.player.hand;
    const action = { kind: "play", card: discardOne, from: "hand" } as const;
    const inline = E.apply(state, "player", action, new ScriptedSource([[spell], true]));
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action });
    if (opened.kind !== "applied") throw new Error("bounced");
    const choose = fold.pending(opened.slice);
    if (choose === null) throw new Error("no discard prompt");
    const chosen = fold.reduce(opened.slice, { kind: "answer", side: "player", promptId: choose.prompt.id, value: [spell] });
    if (chosen.kind !== "applied" || chosen.error !== null) throw new Error("discard failed");
    const saved = JSON.parse(JSON.stringify(chosen.slice)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(chosen.slice.committed)) };
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded);
    if (pending === null) throw new Error("no trigger prompt after reload");
    expect(pending.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(pending.display.triggerQueue.map((entry) => entry.source)).toEqual([seeker]);
    expect(reclaimable(reloaded.committed, spell)).toBe(false);
    const answer = (side: Side, promptId: PromptId) => fresh.reduce(reloaded, { kind: "answer", side, promptId, value: true });
    expect(answer("player", choose.prompt.id)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(answer("enemy", pending.prompt.id)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const answered = answer("player", pending.prompt.id);
    if (answered.kind !== "applied" || answered.error !== null) throw new Error("answer failed");
    expect(stateHash(answered.slice.committed)).toBe(stateHash(inline.state));
    expect([...opened.published, ...chosen.published, ...answered.published]).toEqual(inline.events);
    expect(reclaimable(answered.slice.committed, spell)).toBe(true);
  });

  it("queues and grants nothing from a step that fails after its discard", () => {
    const { state, ids } = setup({ player: { back: [G.seeker.id], hand: [G.failing.id, v.event1.id], energy: 0, deck }, enemy: { deck } });
    const [failing, spell] = ids.player.hand;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: failing, from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected synthetic failure");
    expect(outcome.error.message).toContain("synthetic failure after a discard");
    expect(outcome.published.some((entry) => entry.kind === "discarded" || entry.kind === "triggerQueued" || entry.kind === "effectStarted")).toBe(false);
    expect(outcome.slice.committed.triggerQueue).toEqual([]);
    expect(outcome.slice.committed.floating).toEqual([]);
    expect(outcome.slice.committed.sides.player.hand).toContain(spell);
    expect(reclaimable(outcome.slice.committed, spell)).toBe(false);
  });
});
