import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { matchesEveryCard, matchesFilter, type FilterSubject } from "../../../continuous/characteristics";
import { activated, banishFromVoidCost, discardCostFilter, energy, event } from "../../../dsl/builders";
import { onMaterialized, triggered, whenYouPlay } from "../../../dsl/triggers";
import type { CardFilter } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { ChooseCardsPrompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { type CardId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { boardState, cardIdOf, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { labBoard } from "../../../testing/lab-solver";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { discover } from "../discover";
import { erode } from "../erode";
import { gainPoints } from "../gain-points";
import { deck, knowing, PickingSource, v } from "./cards-support";

/** Synthetic ✦-bound filter fixtures; contracts never depend on live card data. */
const lowSparkPilgrim: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1120), costs: [energy(0)], status: "authored",
  abilities: () => [triggered(onMaterialized(), discover({ cardType: "character", sparkAtMost: 2 }))],
};

const highSparkDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1121), costs: [energy(0)],
  abilities: () => [event(discover({ sparkAtLeast: 3 }))],
};

const sparkBoundCosts: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1122), status: "authored",
  abilities: () => [activated([discardCostFilter({ sparkAtMost: 1 }), banishFromVoidCost(1, { sparkAtLeast: 2 })], gainPoints(1))],
};

const playedLowSpark: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(1123), status: "authored",
  abilities: () => [triggered(whenYouPlay({ sparkAtMost: 1 }), gainPoints(1))],
};

const sparkEightDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1124), costs: [energy(0)],
  abilities: () => [event(discover({ cardType: "character", sparkAtLeast: 6 }))],
};

/** An Interrupt: the opponent of its controller erodes 2. */
const interruptErodeTwo: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(1125), status: "authored",
  abilities: () => [event(erode(2, "opponent"))],
};

/** Discovers a ≤2✦ character, then throws: a step that fails after its Discover's answer was accepted. */
const sparkDiscoverThenFail: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(1126), costs: [], abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character", sparkAtMost: 2 }), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller,
        x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

const engine = createEngine(testCatalog([
  ...DSL_CARDS, lowSparkPilgrim, highSparkDiscover, sparkBoundCosts, playedLowSpark, sparkEightDiscover, interruptErodeTwo, sparkDiscoverThenFail,
]));

const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};

/** A deck on both sides of a 2✦ bound: 0✦, 1✦, 2✦, 3✦, 5✦ characters, an event, an X✦ character (0✦ outside play), and a 1✦ character that gained +2✦. */
const mixedDeck = [v.vanilla0.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event1.id, DSL.variableSpark.id, v.vanilla1.id];

/** The mixed deck's board with every card offerable at once; the last deck card has gained +2✦. */
function mixedBoard(card: CardId, side: Side = "player"): { state: BattleState; ids: ReturnType<typeof boardState>["ids"] } {
  const other: Side = side === "player" ? "enemy" : "player";
  const setup: BoardSetup = { active: side, phase: "day", [side]: { hand: [card], deck: mixedDeck, energy: 3 }, [other]: { hand: [interruptErodeTwo.id], deck, energy: 1 } };
  const { state, ids } = boardState(engine.catalog, setup);
  state.instances[ids[side].deck[7]].status.gainedSpark = 2;
  const saved = JSON.parse(JSON.stringify({ ...state, config: { ...state.config, discoverOptions: 10 } })) as BattleState;
  return { state: saved, ids };
}

/**
 * Plays `card` through the fold until a prompt is pending; with `respond`, the
 * opponent first answers the card on the stack with its Interrupt.
 * Triggered abilities never use the stack, so nobody responds to the trigger
 * itself (rules § Playing Cards and the Stack → Priority).
 */
function suspend(card: CardId, side: Side = "player", respond = false) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const { state, ids } = mixedBoard(card, side);
  const other: Side = side === "player" ? "enemy" : "player";
  let slice = applied(fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
    { kind: "battleAction", side, action: playFromHand(ids, side).action }));
  let responded = !respond;
  for (let passes = 0; fold.pending(slice) === null; passes++) {
    const decision = engine.decision(slice.committed);
    if (decision === null || passes > 10) throw new Error("the discovery never prompted");
    const top = slice.committed.stack[slice.committed.stack.length - 1];
    if (!responded && decision.side === other && top?.kind === "card") {
      responded = true;
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: other, action: { kind: "play", card: ids[other].hand[0], from: "hand" } }));
      continue;
    }
    slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
  }
  const pending = fold.pending(slice)!;
  return { fold, slice, pending, prompt: pending.prompt as ChooseCardsPrompt, ids };
}

describe("card filter spark bounds", () => {
  const subject = (spark: number | null): FilterSubject => ({ cardType: spark === null ? "event" : "character", subtype: "Warrior", allTypes: false, cost: 2, spark });

  it.each<[CardFilter, readonly (number | null)[], readonly (number | null)[]]>([
    [{ sparkAtMost: 2 }, [0, 1, 2], [3, 8, null]],
    [{ sparkAtLeast: 2 }, [2, 3, 8], [0, 1, null]],
    [{ sparkAtLeast: 2, sparkAtMost: 2 }, [2], [1, 3, null]],
    [{ sparkAtMost: 0 }, [0], [1, null]],
    [{ cardType: "character", sparkAtMost: 2, costAtMost: 2 }, [0, 2], [3, null]],
  ])("bounds effective spark %j, and a card with no spark meets no bound", (filter, matching, failing) => {
    for (const spark of matching) expect(matchesFilter(subject(spark), filter)).toBe(true);
    for (const spark of failing) expect(matchesFilter(subject(spark), filter)).toBe(false);
    expect(matchesEveryCard(filter)).toBe(false);
  });

  it("discovers from its controller's deck only cards within the bounds, by effective spark, X counting as 0", () => {
    const low = suspend(lowSparkPilgrim.id);
    const deckIds = low.ids.player.deck;
    // 0✦, 1✦, 2✦, and the X✦ character; not 3✦, 5✦, the event, or the 1✦ character that gained +2✦.
    expect([...low.prompt.candidates].sort()).toEqual([deckIds[0], deckIds[1], deckIds[2], deckIds[6]].sort());
    const high = suspend(highSparkDiscover.id);
    expect([...high.prompt.candidates].sort()).toEqual([high.ids.player.deck[3], high.ids.player.deck[4], high.ids.player.deck[7]].sort());
    const done = applied(high.fold.reduce(high.slice, { kind: "answer", side: "player", promptId: high.pending.prompt.id, value: [high.ids.player.deck[7]] }));
    expect(done.committed.sides.player.hand).toEqual([high.ids.player.deck[7]]);
    // A card keeps the spark it gained in its new zone.
    expect(done.committed.instances[high.ids.player.deck[7]].status.gainedSpark).toBe(2);
  });

  it("offers hand and void costs only the cards within the bounds", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: {
        back: [sparkBoundCosts.id], hand: [v.vanilla1.id, v.vanilla2.id, v.event1.id, v.vanilla0.id, DSL.variableSpark.id],
        void: [v.vanilla1.id, v.vanilla3.id, v.event1.id, v.vanilla5.id], deck, energy: 3,
      },
      enemy: { deck },
    });
    state.instances[ids.player.hand[3]].status.gainedSpark = 2;
    const source = new PickingSource((candidates) => [candidates[0]]);
    const after = engine.apply(state, "player", { kind: "activate", source: ids.player.back[0]!, ability: 0 }, source).state;
    const [discard, banish] = source.prompts as ChooseCardsPrompt[];
    expect([...discard.candidates].sort()).toEqual([ids.player.hand[0], ids.player.hand[4]].sort());
    expect([...banish.candidates].sort()).toEqual([ids.player.void[1], ids.player.void[3]].sort());
    expect(after.sides.player.score).toBe(1);
  });

  it("matches a play by the played card's spark, and an event by none", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [playedLowSpark.id], hand: [v.vanilla1.id, v.vanilla2.id, v.event1.id, v.vanilla0.id], energy: 10, deck },
      enemy: { deck },
    });
    let after = state;
    const scores: number[] = [];
    for (const card of ids.player.hand) {
      after = engine.apply(after, "player", { kind: "play", card, from: "hand" }, new ScriptedSource([])).state;
      scores.push(after.sides.player.score);
    }
    expect(scores).toEqual([1, 1, 1, 2]);
  });

  it("stages a matching card in the lab deck for a discovery by its filter alone", () => {
    const { setup } = labBoard(engine, sparkEightDiscover.id, [v.vanilla1, v.vanilla5]);
    const deckOf = setup.player?.deck ?? [];
    expect(deckOf[deckOf.length - 1]).toBe(v.vanilla8.id);
    const pilgrim = labBoard(engine, lowSparkPilgrim.id, [v.vanilla5]).setup.player?.deck ?? [];
    const staged = engine.catalog.card(pilgrim[pilgrim.length - 1]);
    expect([pilgrim.length, staged.cardType, typeof staged.spark === "number" && staged.spark <= 2]).toEqual([9, "character", true]);
  });
});

describe("card filter spark bounds across suspension", () => {
  it("hides the offer from the opponent, reloads to the same matching offer, and bounces non-matching, foreign and stale answers", () => {
    const { slice, pending, prompt, ids } = suspend(lowSparkPilgrim.id);
    const promptId = pending.prompt.id;
    const committed = stateHash(slice.committed);
    // The opponent learns that a choice is pending, never which cards it offers.
    expect(promptView(prompt, "enemy", pending.display)).toMatchObject({ candidates: [] });
    for (const card of prompt.candidates) expect(view(pending.display, "enemy", engine.catalog).instances[card]).toBeUndefined();
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(saved)).toEqual(pending);
    const answer = (side: Side, value: readonly InstanceId[], from = saved) => fresh.reduce(from, { kind: "answer", side, promptId, value });
    const [threeSpark, , event, , gained] = [ids.player.deck[3], ids.player.deck[4], ids.player.deck[5], ids.player.deck[6], ids.player.deck[7]];
    for (const value of [[threeSpark], [event], [gained], [], prompt.candidates.slice(0, 2)]) {
      expect(answer("player", value)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(answer("enemy", [prompt.candidates[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...saved, attempt: saved.attempt + 1 }, { kind: "answer", side: "player", promptId, value: [prompt.candidates[0]] }))
      .toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(stateHash(saved.committed)).toBe(committed);
    const outcome = answer("player", [prompt.candidates[1]]);
    const done = applied(outcome);
    expect(done.committed.sides.player.hand).toEqual([prompt.candidates[1]]);
    if (outcome.kind !== "applied") throw new Error("answer bounced");
    const discovered = outcome.published.find((e) => e.kind === "cardDiscovered")!;
    expect(eventSeenBy(discovered, "player", done.committed)).toEqual({ kind: "cardDiscovered", side: "player", instance: prompt.candidates[1] });
    expect(eventSeenBy(discovered, "enemy", done.committed)).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
    expect(answer("player", [prompt.candidates[0]], done)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("reads the bounds as the trigger resolves, after an opponent's response to the card changed the deck", () => {
    const { slice, prompt, ids } = suspend(lowSparkPilgrim.id, "player", true);
    const eroded = slice.committed.sides.player.void.filter((id) => ids.player.deck.includes(id));
    expect(eroded).toHaveLength(2);
    const matching = [ids.player.deck[0], ids.player.deck[1], ids.player.deck[2], ids.player.deck[6]];
    expect(eroded.some((id) => matching.includes(id))).toBe(true);
    expect([...prompt.candidates].sort()).toEqual(matching.filter((id) => !eroded.includes(id)).sort());
  });

  it("offers the enemy controller only its own matching deck cards, hidden from the player", () => {
    const { pending, prompt, ids } = suspend(lowSparkPilgrim.id, "enemy");
    expect(prompt).toMatchObject({ side: "enemy", privateTo: "enemy" });
    expect([...prompt.candidates].sort()).toEqual([ids.enemy.deck[0], ids.enemy.deck[1], ids.enemy.deck[2], ids.enemy.deck[6]].sort());
    expect(promptView(prompt, "player", pending.display)).toMatchObject({ candidates: [] });
  });

  it("publishes nothing and keeps only the offer's private knowledge when the step fails after a bounded discovery", () => {
    const { slice, pending, prompt, ids } = suspend(sparkDiscoverThenFail.id);
    expect(prompt.candidates.every((card) => engine.catalog.card(cardIdOf(slice.committed, card)).cardType === "character")).toBe(true);
    const outcome = createFoldAdapter(engine, { checkEventPrefix: true })
      .reduce(slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [prompt.candidates[0]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.published).toEqual([]);
    expect(outcome.slice.committed).toEqual(knowing(slice.committed, "player", prompt.candidates));
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
  });
});
