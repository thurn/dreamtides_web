/**
 * "That card's cost" (`costOf(cardsMovedBy(node))`, the valueCardStats DSL
 * form) and the abandon cost that captures the abandoned character's cost
 * (`abandonCostCapture`), on synthetic cards.
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCostCapture, activated, all, cardsMovedBy, characterYouControl, conditionCardCounts, costOf, energyX, event, x } from "../../../dsl/builders";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, ChooseNumberPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { effectiveSpark } from "../../../rules/spark";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { CardId, InstanceId, Side } from "../../../state/ids";
import type { BattleState, DeckEntry, Printing } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, cardIdOf, placeFigment, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { misplacedMovedCardReads } from "../../../testing/moved-card-audit";
import { playFromHand } from "../../../testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { choosePlayer } from "../choose-player";
import { discard } from "../discard";
import { discover } from "../discover";
import { eachPlayer } from "../each-player";
import { erode } from "../erode";
import { forDuration } from "../for-duration";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { optional } from "../optional";
import { repeat } from "../repeat";
import { sequence } from "../sequence";
import { sparkModifier } from "../spark-modifier";

const synthetic = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  id: syntheticId(index), cardType: "event", costs: [], spark: null, subtype: "", speed: "standard", status: "authored", abilities,
});

/** "You may discard a card to discover a character with cost greater than that card's cost." */
function discardToDiscover(): ReturnType<typeof sequence> {
  const payment = discard(1);
  return sequence(payment, discover({ cardType: "character" }, { costGreaterThan: costOf(cardsMovedBy(payment)) }));
}
const reclaim = synthetic(1200, () => [event(ifThen(conditionCardCounts("hand", 1), optional(discardToDiscover())))]);
/** Each value is built per ability list, so its reference is the node object it resolves. */
const pointsFor = (index: number, build: (payment: ReturnType<typeof discard>) => Parameters<typeof event>[0], count = 1) =>
  synthetic(index, () => {
    const payment = discard(count);
    return [event(build(payment))];
  });
const discardForPoints = pointsFor(1201, (payment) => sequence(payment, gainPoints(costOf(cardsMovedBy(payment)))));
const discardTwoForPoints = pointsFor(1202, (payment) => sequence(payment, gainPoints(costOf(cardsMovedBy(payment)))), 2);
const repeatedDiscard = pointsFor(1203, (payment) => repeat(2, sequence(payment, gainPoints(costOf(cardsMovedBy(payment))))));
const declinablePayment = pointsFor(1204, (payment) => sequence(optional(payment), gainPoints(costOf(cardsMovedBy(payment)))));
const eachDiscards = pointsFor(1205, (payment) => eachPlayer(sequence(payment, gainPoints(costOf(cardsMovedBy(payment))))));
const pumpByDiscard = pointsFor(1206, (payment) => forDuration("untilEndOfTurn", sequence(payment, sparkModifier(all(characterYouControl()), costOf(cardsMovedBy(payment))))));
const choosingReader = pointsFor(1207, (payment) => sequence(payment, choosePlayer((player) => gainPoints(costOf(cardsMovedBy(payment)), player))));
/** Resolves the Discover offer, then throws: a step that fails after its answers were accepted. */
const reclaimThenFail: EngineCardDefinition = {
  ...synthetic(1208, () => []),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discardToDiscover(), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};
const character = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.vanilla1, id: syntheticId(index), status: "authored", abilities,
});
/** "Abandon a character: Gain X⍟, where X is that character's cost." */
const sacrificeForPoints = character(1210, () => [activated([abandonCostCapture()], gainPoints(x()))]);
/** "X, Abandon a character with cost X●" through one shared X. */
const pricedSacrifice = character(1211, () => [activated([energyX(0), abandonCostCapture()], gainPoints(x()))]);
/** "Abandon a character: A player erodes X, where X is that character's cost." */
const sacrificeToErode = character(1212, () => [activated([abandonCostCapture()], choosePlayer((player) => erode(x(), player)))]);

const MOVED_CARD_READERS: readonly EngineCardDefinition[] = [
  reclaim, discardForPoints, discardTwoForPoints, repeatedDiscard, declinablePayment, eachDiscards, pumpByDiscard, choosingReader, reclaimThenFail, sacrificeForPoints, pricedSacrifice, sacrificeToErode,
];

const engine = createEngine(testCatalog(
  MOVED_CARD_READERS,
  {},
  ZONE_FIGMENTS,
));

/** Answers prompts from a script, keeping each prompt it was asked. */
class Recording implements AnswerSource {
  readonly prompts: Prompt[] = [];
  private next = 0;
  constructor(private readonly answers: readonly Answer[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    const value = this.answers[this.next++];
    if (value === undefined) throw new Error(`no answer for ${prompt.purpose.role}`);
    return value;
  }
}

const board = (player: SideSetup, enemy: SideSetup = {}) => boardState(engine.catalog, { active: "player", phase: "day", player, enemy });
const costOfCard = (state: BattleState, id: InstanceId): number => {
  const card = engine.catalog.card(cardIdOf(state, id));
  return card.costs.reduce((total, cost) => total + (cost.cost === "energy" ? cost.amount : 0), 0);
};
/** Marks a placed card as created, so it ceases to exist instead of reaching a void. */
const created = (state: BattleState, id: InstanceId): void => {
  const instance = instanceOf(state, id);
  state.instances[id] = { ...instance, status: { ...instance.status, created: true } };
};
const run = (state: BattleState, side: Side, action: Parameters<typeof engine.apply>[2], answers: readonly Answer[] = []) => {
  const source = new Recording(answers);
  const result = engine.apply(state, side, action, source);
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return { ...result, prompts: source.prompts };
};
const discoverPrompt = (prompts: readonly Prompt[]) => prompts.find((prompt) => prompt.purpose.role === "discover") as ChooseCardsPrompt | undefined;

describe("costOf(cardsMovedBy(node))", () => {
  const playerDeck: readonly CardId[] = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event1.id];
  const reclaimBoard = (hand: readonly (CardId | DeckEntry)[], deck = playerDeck) => board({ hand: [reclaim.id, ...hand], deck });

  it("discovers only characters whose copiable cost is strictly greater than the discarded card's", () => {
    const { state, ids } = reclaimBoard([v.vanilla2.id, v.event0.id]);
    const discarded = ids.player.hand[1];
    const result = run(state, "player", playFromHand(ids, "player").action, [true, [discarded], [ids.player.deck[3]]]);
    const offered = discoverPrompt(result.prompts)!;
    // Cost 2 discarded: the 3● and 5● characters, never the equal 2● one, the cheaper one, or the event.
    expect([...offered.candidates].sort()).toEqual([ids.player.deck[2], ids.player.deck[3]].sort());
    expect(result.state.sides.player.void).toContain(discarded);
    expect(result.state.sides.player.hand).toEqual([ids.player.hand[2], ids.player.deck[3]]);
  });

  it("reads the copiable cost after deck-entry modifications, and a created card's cost after it ceased to exist", () => {
    const reduced = reclaimBoard([{ cardId: v.vanilla3.id, deckMods: { ...NO_DECK_MODS, costReduction: 2 } }]);
    const cheap = run(reduced.state, "player", playFromHand(reduced.ids, "player").action, [true, [reduced.ids.player.deck[1]]]);
    // The 3● card costs 1● as modified: the 2●, 3●, and 5● characters are offered.
    expect(discoverPrompt(cheap.prompts)!.candidates).toHaveLength(3);

    const { state, ids } = reclaimBoard([v.vanilla3.id]);
    created(state, ids.player.hand[1]);
    const result = run(state, "player", playFromHand(ids, "player").action, [true]);
    expect(result.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: ids.player.hand[1] }));
    expect(result.state.instances[ids.player.hand[1]]).toBeUndefined();
    // Only the 5● character costs more than the 3● card that ceased to exist: it is answered alone.
    expect(result.state.sides.player.hand).toEqual([ids.player.deck[3]]);
  });

  it("still pays the discard when no character costs more, and offers nothing with an empty hand or a declined payment", () => {
    const { state, ids } = reclaimBoard([v.vanilla5.id]);
    const top = run(state, "player", playFromHand(ids, "player").action, [true]);
    expect(top.state.sides.player.void).toContain(ids.player.hand[1]);
    expect(discoverPrompt(top.prompts)).toBeUndefined();
    expect(top.state.sides.player.deck).toEqual(ids.player.deck);
    expect(top.state.rng["random:discover"]).toBeUndefined();

    const empty = reclaimBoard([]);
    const none = run(empty.state, "player", playFromHand(empty.ids, "player").action);
    expect(none.prompts).toEqual([]);
    expect(none.state.sides.player.hand).toEqual([]);

    const declinable = reclaimBoard([v.vanilla1.id]);
    const declined = run(declinable.state, "player", playFromHand(declinable.ids, "player").action, [false]);
    expect(declined.prompts.map((prompt) => prompt.purpose.role)).toEqual(["youMay"]);
    expect(declined.state.sides.player.hand).toEqual([declinable.ids.player.hand[1]]);
  });

  it("reads each card's node after it in the same resolution, as the content gate requires", () => {
    for (const card of MOVED_CARD_READERS) expect(misplacedMovedCardReads(card.abilities(BASE_VARIANT)), card.id).toEqual([]);
  });

  it("totals several moved cards, reads none from a node that did not resolve, and replaces a node's record each time it resolves", () => {
    const two = board({ hand: [discardTwoForPoints.id, v.vanilla2.id, v.vanilla3.id] });
    expect(run(two.state, "player", playFromHand(two.ids, "player").action).state.sides.player.score).toBe(5);

    const declinable = board({ hand: [declinablePayment.id, v.vanilla5.id] });
    const declined = run(declinable.state, "player", playFromHand(declinable.ids, "player").action, [false]);
    expect(declined.state.sides.player.hand).toEqual([declinable.ids.player.hand[1]]);
    expect(declined.state.sides.player.score).toBe(0);

    // Each repetition reads the card it discarded: 2 then 3, never the 2 again or a running total.
    const twice = board({ hand: [repeatedDiscard.id, v.vanilla2.id, v.vanilla3.id] });
    expect(run(twice.state, "player", playFromHand(twice.ids, "player").action, [[twice.ids.player.hand[1]]]).state.sides.player.score).toBe(5);
    // A repetition that discards nothing reads nothing, not the previous repetition's card.
    const once = board({ hand: [repeatedDiscard.id, v.vanilla2.id] });
    expect(run(once.state, "player", playFromHand(once.ids, "player").action).state.sides.player.score).toBe(2);
  });

  it("reads through eachPlayer, forDuration, and a chosen player's branch", () => {
    const each = board({ hand: [eachDiscards.id, v.vanilla2.id] }, { hand: [v.vanilla5.id] });
    const both = run(each.state, "player", playFromHand(each.ids, "player").action).state;
    expect([both.sides.player.score, both.sides.enemy.score]).toEqual([2, 5]);

    const pump = board({ hand: [pumpByDiscard.id, v.vanilla3.id], back: [v.vanilla1.id] });
    const pumped = run(pump.state, "player", playFromHand(pump.ids, "player").action).state;
    expect(effectiveSpark(pumped, engine.catalog, pump.ids.player.back[0]!)).toBe(1 + 3);

    const chosen = board({ hand: [choosingReader.id, v.vanilla3.id] });
    expect(run(chosen.state, "player", playFromHand(chosen.ids, "player").action, [1]).state.sides.enemy.score).toBe(3);
  });

  it("keeps the discover offer private and the discarded card public", () => {
    const { state, ids } = reclaimBoard([v.vanilla1.id]);
    const result = run(state, "player", playFromHand(ids, "player").action, [true, [ids.player.deck[1]]]);
    const offered = discoverPrompt(result.prompts)!;
    expect(offered.privateTo).toBe("player");
    expect((promptView(offered, "enemy", result.state) as ChooseCardsPrompt).candidates).toEqual([]);
    expect(view(result.state, "enemy", engine.catalog).sides.player.void).toContain(ids.player.hand[1]);
  });
});

describe("costOf(cardsMovedBy(node)) across suspension", () => {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };
  const slice = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

  it("reloads between the discard and the Discover offer to the same bound, commits nothing until answered, and bounces other actors", () => {
    const { state, ids } = board({ hand: [reclaim.id, v.vanilla2.id, v.event0.id], deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] });
    const discarded = ids.player.hand[1];
    let current = applied(fold.reduce(slice(state), { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    for (const value of [true, [discarded]] as const) {
      const prompt = fold.pending(current)!.prompt;
      current = applied(fold.reduce(current, { kind: "answer", side: "player", promptId: prompt.id, value }));
    }
    const pending = fold.pending(current)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    expect([...(pending.prompt as ChooseCardsPrompt).candidates].sort()).toEqual([ids.player.deck[2], ids.player.deck[3]].sort());
    // The payment is part of the suspended step: the committed hand still holds the card.
    expect(current.committed.sides.player.hand).toContain(discarded);

    const reloaded = JSON.parse(JSON.stringify(current)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt).toEqual(pending.prompt);
    const answer = (side: Side, value: readonly InstanceId[]) => fresh.reduce(reloaded, { kind: "answer", side, promptId: again.prompt.id, value });
    expect(answer("enemy", [ids.player.deck[3]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [ids.player.deck[1]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });

    const done = applied(answer("player", [ids.player.deck[3]]));
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.void).toContain(discarded);
    expect(done.committed.sides.player.hand).toEqual([ids.player.hand[2], ids.player.deck[3]]);
  });

  it("commits neither the discard nor the discovery when the step fails after both were answered", () => {
    const { state, ids } = board({ hand: [reclaimThenFail.id, v.vanilla2.id], deck: [v.vanilla3.id, v.vanilla5.id] });
    const before = stateHash(state);
    const source = new Recording([[ids.player.deck[1]]]);
    expect(() => engine.apply(state, "player", playFromHand(ids, "player").action, source)).toThrow(/after its discovery/);
    expect(source.prompts.map((prompt) => prompt.purpose.role)).toEqual(["discover"]);
    expect(stateHash(state)).toBe(before);
    expect(state.sides.player.hand).toEqual(ids.player.hand);
  });
});

describe("abandonCostCapture", () => {
  const activate = (source: InstanceId) => ({ kind: "activate", source, ability: 0 }) as const;
  const warriorFigment: Printing = { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 };
  const copyOfFive: Printing = { kind: "figmentCopy", cardId: v.vanilla5.id, spark: null };

  it("captures the abandoned character's copiable cost as X before it is abandoned, the source itself included", () => {
    const { state, ids } = board({ back: [sacrificeForPoints.id, v.vanilla5.id, v.vanilla3.id] });
    const [source, five] = [ids.player.back[0]!, ids.player.back[1]!];
    const result = run(state, "player", activate(source), [[five]]);
    expect(result.prompts.map((prompt) => prompt.purpose.role)).toEqual(["abandonCost"]);
    expect([...(result.prompts[0] as ChooseCardsPrompt).candidates].sort()).toEqual([source, five, ids.player.back[2]!].sort());
    expect(result.state.sides.player.void).toEqual([five]);
    expect(result.state.sides.player.score).toBe(5);

    const self = run(state, "player", activate(source), [[source]]);
    expect(self.state.sides.player.void).toEqual([source]);
    expect(self.state.sides.player.score).toBe(costOfCard(state, source));
  });

  it("captures 0 for a figment and the copied cost for a figment copy, though both cease to exist", () => {
    for (const [printing, expected] of [[warriorFigment, 0], [copyOfFive, 5]] as const) {
      const { state, ids } = board({ back: [sacrificeForPoints.id] });
      const figment = placeFigment(state, "player", { rank: "back", index: 3 }, printing);
      const result = run(state, "player", activate(ids.player.back[0]!), [[figment]]);
      expect(result.state.instances[figment]).toBeUndefined();
      expect(result.state.sides.player.score).toBe(expected);
    }
  });

  it("shares X with an energy X: only characters whose cost is the chosen X are offered", () => {
    const { state, ids } = board({ back: [pricedSacrifice.id, v.vanilla2.id, v.vanilla3.id], energy: 3 });
    const result = run(state, "player", activate(ids.player.back[0]!), [2]);
    const [chooseX] = result.prompts as [ChooseNumberPrompt];
    expect(chooseX.purpose.role).toBe("chooseX");
    // The lone 2● character answers the abandon prompt itself.
    expect(result.state.sides.player.void).toEqual([ids.player.back[1]!]);
    expect(result.state.sides.player.score).toBe(2);
    expect(result.state.sides.player.currentEnergy).toBe(1);
  });

  it("erodes X from the chosen player's deck, and reloads the abandon choice without paying it", () => {
    const { state, ids } = board({ back: [sacrificeToErode.id, v.vanilla3.id] }, { deck: [v.event0.id, v.event1.id, v.vanilla1.id, v.vanilla2.id] });
    const three = ids.player.back[1]!;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const opened = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, { kind: "battleAction", side: "player", action: activate(ids.player.back[0]!) });
    if (opened.kind !== "applied") throw new Error("expected the activation to open");
    const reloaded = JSON.parse(JSON.stringify(opened.slice)) as BattleSlice;
    const pending = fold.pending(reloaded)!;
    expect(pending.prompt.purpose.role).toBe("abandonCost");
    expect(reloaded.committed.sides.player.backRank).toEqual(state.sides.player.backRank);
    expect(fold.reduce(reloaded, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: [three] })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const paid = fold.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [three] });
    if (paid.kind !== "applied") throw new Error("expected the payment to apply");
    const choose = fold.pending(paid.slice)!;
    expect(choose.prompt.purpose.role).toBe("choosePlayer");
    const done = fold.reduce(paid.slice, { kind: "answer", side: "player", promptId: choose.prompt.id, value: 1 });
    if (done.kind !== "applied" || done.error !== null) throw new Error("expected the erosion to apply");
    expect(done.slice.committed.sides.enemy.void).toHaveLength(3);
    expect(done.slice.committed.sides.enemy.deck).toEqual([ids.enemy.deck[3]]);
    expect(done.slice.committed.sides.player.void).toEqual([three]);
  });
});
