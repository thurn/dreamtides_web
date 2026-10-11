import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { enemyCharacter, event, everyIn, fromVoid, self, target, topOfDeck, x } from "../../../dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenYouPlay } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { greedyAnswer } from "../../../policy/prompts";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer, ArrangeAnswer, ArrangePrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import type { CardId, InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { eventRedactionViolations } from "../../../testing/redaction";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { choosePlayer } from "../choose-player";
import { putFromTop, putInDeck } from "../put-in-deck";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { deck, noDiscoverCosts, v } from "./cards-support";

const eventCard = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  id: syntheticId(0x6300 + index), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(effect)],
});
const three = [{ to: "top", count: 1 }, { to: "bottom", count: 1 }, { to: "hand", count: 1 }] as const;

/** "Look at the top 3 cards of your deck. Put one on top of your deck, one on the bottom of your deck, and one into your hand." */
const ponder = eventCard(1, putFromTop(3, three));
/** The same, looking at the top 4 and putting the rest into your void. */
const ponderRest = eventCard(2, putFromTop(4, [...three, { to: "void", count: "rest" }]));
/** "Put an enemy on top of the opponent's deck." */
const tuck = eventCard(3, putInDeck([target(enemyCharacter())], "top"));
/** "Look at the top 3 …", then "Shuffle your deck": the shuffle ends what the look showed. */
const ponderThenShuffle = eventCard(4, sequence(putFromTop(3, three), shuffleInto()));
/** "Put the top 2 cards of your deck on the bottom of your deck." */
const cycleTop = eventCard(5, putInDeck([topOfDeck(2)], "bottom"));
/** "Put all cards in your void on top of your deck." */
const voidOnTop = eventCard(8, putInDeck([everyIn("void")], "top"));
/** "▸Materialized: Put all cards in a player's void on the bottom of their deck." */
const crow: EngineCardDefinition = {
  id: syntheticId(0x6306), cardType: "character", costs: [], spark: 1, subtype: "Spirit Animal", speed: "standard",
  status: "authored", abilities: () => [triggered(onMaterialized(), choosePlayer((player) => putInDeck([everyIn("void", {}, { player })], "bottom")))],
};
/** Looks at the top 3 and places them, then throws. */
const ponderThenFail: EngineCardDefinition = {
  ...ponder, id: syntheticId(0x6307), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, putFromTop(3, three), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its placements");
    },
  },
};

const opaqueDeck = eventCard(9, putInDeck([everyIn("deck", { cardType: "event" })], "bottom"));
const mixedDeck = eventCard(10, putInDeck([everyIn("deck", { cardType: "character" })], "bottom"));
const reversedVoid = eventCard(11, putInDeck([everyIn("void", { costAtLeast: 2 }), everyIn("void", { costAtMost: 1 })], "top"));
const chosenVoid = eventCard(12, putInDeck([fromVoid({}, { count: 2 })], "bottom"));
const selfOnStack = eventCard(13, putInDeck([self()], "top"));
const subjectOnStack: EngineCardDefinition = {
  ...crow, id: syntheticId(0x630e),
  abilities: () => [triggered(whenYouPlay(), putInDeck([triggeringCard()], "top"))],
};
const arrangeMany = eventCard(15, putFromTop(3, [{ to: "top", count: 2 }, { to: "bottom", count: 1 }]));

const engine = createEngine(testCatalog([...DSL_CARDS, ponder, ponderRest, tuck, ponderThenShuffle, cycleTop, voidOnTop, crow, ponderThenFail, opaqueDeck, mixedDeck, reversedVoid, chosenVoid, selfOnStack, subjectOnStack, arrangeMany]));

/** Answers each prompt from `respond`, keeping every prompt and the state it was asked in. */
class Answers implements AnswerSource {
  readonly asked: { readonly prompt: Prompt; readonly state: BattleState }[] = [];
  constructor(private readonly respond: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt, state: BattleState): Answer {
    this.asked.push({ prompt, state });
    return this.respond(prompt);
  }
}
/** Places the looked-at cards in prompt order: the first card to the first destination, and so on. */
const inOrder = () => new Answers((prompt) => {
  if (prompt.kind === "chooseTargets") return prompt.candidates.slice(0, 1);
  if (prompt.kind !== "arrange") throw new Error(`unexpected ${prompt.kind} prompt`);
  let next = 0;
  return prompt.destinations.flatMap((slot) => prompt.cards.slice(next, (next += slot.max)).map((card) => ({ card, to: slot.to })));
});

const sevenCards: readonly CardId[] = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event0.id, v.vanilla1.id, v.vanilla2.id];
const setup = (card: CardId, player: { deck?: readonly CardId[]; void?: readonly CardId[] } = {}): BoardSetup => ({
  active: "player", phase: "day",
  player: { deck: sevenCards, ...player, hand: [card] },
  enemy: { deck, void: [v.vanilla3.id, v.vanilla5.id] },
});
const play = (board: BoardSetup, source: AnswerSource) => {
  const { state, ids } = boardState(engine.catalog, board);
  const played = engine.apply(state, "player", playFromHand(ids, "player").action, source);
  const rest = passUntil(engine, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { start: state, ids, state: rest.state, events: [...played.events, ...rest.events] };
};
const placed = (events: readonly EngineEvent[]) => events.filter((item) => item.kind === "cardsPlaced");
const known = (state: BattleState, side: "player" | "enemy") => view(state, side, engine.catalog).sides.player.deck.known;
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};

describe("putInDeck", () => {
  it("rejects malformed places and stack cards", () => {
    expect(() => putFromTop(3, [])).toThrow();
    expect(() => putFromTop(2, [{ to: "top", count: 1 }, { to: "top", count: 1 }])).toThrow();
    expect(() => putFromTop(3, [{ to: "top", count: 1 }, { to: "bottom", count: "rest" }, { to: "void", count: "rest" }])).toThrow();
    for (const count of [0, -1, 0.5, Number.NaN]) expect(() => putFromTop(3, [{ to: "hand", count }, { to: "bottom", count: "rest" }])).toThrow();
    // Without a rest place every looked-at card needs a place.
    expect(() => putFromTop(4, three)).toThrow();
    expect(() => putFromTop(x(), three)).toThrow();
    expect(() => putInDeck([{ kind: "stackTarget", selector: {}, count: 1 } as never], "top")).toThrow();
    expect(putFromTop(x(), [{ to: "hand", count: 2 }, { to: "bottom", count: "rest" }])).toMatchObject({ op: "putInDeck", from: "lookAtTop" });
  });

  it("looks at the top cards privately and puts one on top, one on the bottom, and one into the hand, which is not a draw", () => {
    const source = inOrder();
    const { start, ids, state, events } = play(setup(ponder.id), source);
    const [{ prompt, state: asked }] = source.asked as { prompt: ArrangePrompt; state: BattleState }[];
    const [a, b, c, ...rest] = ids.player.deck;
    expect(source.asked).toHaveLength(1);
    expect(prompt).toMatchObject({
      kind: "arrange", side: "player", privateTo: "player", cards: [a, b, c],
      destinations: [{ to: "top", min: 1, max: 1 }, { to: "bottom", min: 1, max: 1 }, { to: "hand", min: 1, max: 1 }],
    });
    expect(prompt.purpose.role).toBe("putInDeck");
    expect((promptView(prompt, "enemy", asked) as ArrangePrompt).cards).toEqual([]);
    expect(state.sides.player.deck).toEqual([a, ...rest, b]);
    expect(state.sides.player.hand).toEqual([c]);
    expect(events.some((item) => item.kind === "cardDrawn")).toBe(false);
    expect(events.filter((item) => ["lookedAtTop", "cardsPlaced", "cardTaken"].includes(item.kind))).toEqual([
      { kind: "lookedAtTop", side: "player", cards: [a, b, c] },
      { kind: "cardsPlaced", side: "player", to: "deckTop", cards: [a], from: ["deck"], seenBy: [["player"]] },
      { kind: "cardsPlaced", side: "player", to: "deckBottom", cards: [b], from: ["deck"], seenBy: [["player"]] },
      { kind: "cardTaken", side: "player", instance: c, from: "deck", holder: "player" },
    ]);
    // The looker keeps knowing both cards left in its deck, where they are; the opponent sees only counts.
    expect(known(state, "player")).toEqual([{ id: a, index: 0 }, { id: b, index: rest.length + 1 }]);
    expect(known(state, "enemy")).toEqual([]);
    for (const item of placed(events)) expect(eventSeenBy(item, "enemy", state)).toEqual({ ...item, cards: [null] });
    expect(unannouncedChanges(events, start, state)).toEqual([]);
    expect(eventRedactionViolations(events, start, state)).toEqual([]);
  });

  it("puts the rest into the void, naming them to both sides", () => {
    const source = inOrder();
    const { ids, state, events } = play(setup(ponderRest.id), source);
    const [a, b, c, d] = ids.player.deck;
    expect(source.asked[source.asked.length - 1]?.prompt).toMatchObject({ destinations: [
      { to: "top", min: 1, max: 1 }, { to: "bottom", min: 1, max: 1 }, { to: "hand", min: 1, max: 1 }, { to: "void", min: 1, max: 1 },
    ] });
    expect(state.sides.player.void).toContain(d);
    const voided = placed(events).find((item) => item.to === "void");
    expect(voided).toEqual({ kind: "cardsPlaced", side: "player", to: "void", cards: [d], from: ["deck"], seenBy: [["player", "enemy"]] });
    expect(eventSeenBy(voided!, "enemy", state)).toEqual(voided);
    expect([state.sides.player.deck[0], state.sides.player.deck[state.sides.player.deck.length - 1], state.sides.player.hand[0]]).toEqual([a, b, c]);
  });

  it("with fewer cards lets each counted place take up to its number and skips the rest; an empty deck asks nothing", () => {
    const source = inOrder();
    const short = play(setup(ponderRest.id, { deck: [v.vanilla1.id, v.vanilla2.id] }), source);
    expect(source.asked[source.asked.length - 1]?.prompt).toMatchObject({ destinations: [
      { to: "top", min: 0, max: 1 }, { to: "bottom", min: 0, max: 1 }, { to: "hand", min: 0, max: 1 },
    ] });
    expect(short.state.sides.player.deck).toEqual(short.ids.player.deck);
    const none = inOrder();
    const empty = play(setup(ponder.id, { deck: [] }), none);
    expect(none.asked).toEqual([]);
    expect(empty.events.filter((item) => ["lookedAtTop", "cardsPlaced"].includes(item.kind))).toEqual([]);
  });

  it("forgets the placed cards once the deck is shuffled", () => {
    const { start, state, events } = play(setup(ponderThenShuffle.id), inOrder());
    expect(state.knownTo).toEqual({ player: [], enemy: [] });
    // Each placement still names its card to the looker, who saw it go there before the shuffle.
    for (const item of placed(events)) expect(eventSeenBy(item, "player", state)).toEqual(item);
    expect(eventRedactionViolations(events, start, state)).toEqual([]);
  });

  it("puts every card of the chosen player's void on the bottom of their deck in void order, known to both sides", () => {
    for (const [mode, owner] of [[0, "player"], [1, "enemy"]] as const) {
      const source = new Answers((prompt) => {
        if (prompt.kind !== "chooseMode") throw new Error(`unexpected ${prompt.kind} prompt`);
        return mode;
      });
      const { start, state, events } = play(setup(crow.id, { void: [v.vanilla5.id, v.event0.id] }), source);
      expect(source.asked.map(({ prompt }) => prompt.purpose.role)).toEqual(["choosePlayer"]);
      const voided = start.sides[owner].void;
      expect(state.sides[owner].void).toEqual([]);
      expect(state.sides[owner].deck).toEqual([...start.sides[owner].deck, ...voided]);
      expect(events.filter((item) => item.kind === "leftVoid").map((item) => item.instance)).toEqual(voided);
      const [put] = placed(events);
      expect(put).toEqual({
        kind: "cardsPlaced", side: owner, to: "deckBottom", cards: voided, from: ["void", "void"], seenBy: [["player", "enemy"], ["player", "enemy"]],
      });
      const depth = start.sides[owner].deck.length;
      for (const viewer of ["player", "enemy"] as const) {
        expect(eventSeenBy(put, viewer, state)).toEqual(put);
        expect(view(state, viewer, engine.catalog).sides[owner].deck.known).toEqual(voided.map((id, index) => ({ id, index: depth + index })));
      }
      expect(unannouncedChanges(events, start, state)).toEqual([]);
    }
  });

  it("puts a target in play on top of its owner's deck; a created card ceases to exist and a reclaimed card is banished instead", () => {
    const board: BoardSetup = { ...setup(tuck.id), enemy: { deck, back: [v.vanilla2.id] } };
    const first = new Answers((prompt) => (prompt.kind === "chooseTargets" ? prompt.candidates.slice(0, 1) : []));
    const { start, ids, state, events } = play(board, first);
    const enemy = ids.enemy.back[0]!;
    expect(state.sides.enemy.deck[0]).toBe(enemy);
    expect(placed(events)).toEqual([{ kind: "cardsPlaced", side: "enemy", to: "deckTop", cards: [enemy], from: ["play"], seenBy: [["player", "enemy"]] }]);
    expect(events.some((item) => item.kind === "leftPlay" && item.instance === enemy)).toBe(true);
    expect(unannouncedChanges(events, start, state)).toEqual([]);

    for (const status of ["created", "reclaimed"] as const) {
      const { state: before, ids: placedIds } = boardState(engine.catalog, board);
      const victim = placedIds.enemy.back[0]!;
      const marked = structuredClone(before);
      marked.instances[victim].status[status] = true;
      const played = engine.apply(marked, "player", playFromHand(placedIds, "player").action, first);
      const after = passUntil(engine, played.state, (next) => next.stack.length === 0, first);
      const all = [...played.events, ...after.events];
      expect(after.state.sides.enemy.deck).not.toContain(victim);
      expect(placed(all)).toEqual([]);
      expect(all.some((item) => item.kind === (status === "created" ? "ceasedToExist" : "banished"))).toBe(true);
      expect(unannouncedChanges(all, marked, after.state)).toEqual([]);
    }
  });

  it("moves named deck cards to the bottom, still unknown to a side that never saw them", () => {
    const { ids, state, events } = play(setup(cycleTop.id), inOrder());
    const [a, b, ...rest] = ids.player.deck;
    expect(state.sides.player.deck).toEqual([...rest, a, b]);
    expect(placed(events)).toEqual([{ kind: "cardsPlaced", side: "player", to: "deckBottom", cards: [a, b], from: ["deck", "deck"], seenBy: [[], []] }]);
    expect(state.knownTo).toEqual({ player: [], enemy: [] });
    // Several cards put on top keep their order, the first nearest the top.
    const onTop = play(setup(voidOnTop.id, { void: [v.vanilla5.id, v.event0.id] }), inOrder());
    const voided = onTop.start.sides.player.void;
    expect(onTop.state.sides.player.deck).toEqual([...voided, ...onTop.start.sides.player.deck]);
    expect(placed(onTop.events)).toMatchObject([{ to: "deckTop", cards: voided }]);
  });

  for (const card of [opaqueDeck, mixedDeck]) {
    it(`forgets uncertain deck positions after an opaque relocation (${card.id})`, () => {
      const { state, ids } = boardState(engine.catalog, setup(card.id, { deck: [v.event0.id, v.vanilla1.id, v.vanilla2.id] }));
      const tracked = ids.player.deck[1];
      const otherDeck = ids.enemy.deck[0];
      state.knownTo = { player: [tracked, otherDeck], enemy: [tracked, otherDeck] };
      const played = engine.apply(state, "player", playFromHand(ids, "player").action, inOrder());
      const resolved = passUntil(engine, played.state, (next) => next.stack.length === 0, inOrder());
      const after = resolved.state;
      expect(eventRedactionViolations([...played.events, ...resolved.events], state, after)).toEqual([]);
      for (const side of ["player", "enemy"] as const) {
        expect(view(after, side, engine.catalog).sides.enemy.deck.known).toEqual([{ id: otherDeck, index: 0 }]);
        expect(view(after, side, engine.catalog).sides.player.deck.known).toEqual([]);
        expect(after.knownTo[side]).not.toContain(tracked);
      }
    });
  }

  it("retains inferable deck positions for an exact top-prefix relocation", () => {
    const { state, ids } = boardState(engine.catalog, setup(cycleTop.id));
    const tracked = ids.player.deck[3];
    state.knownTo = { player: [tracked], enemy: [tracked] };
    const played = engine.apply(state, "player", playFromHand(ids, "player").action, inOrder());
    const after = passUntil(engine, played.state, (next) => next.stack.length === 0, inOrder()).state;
    for (const side of ["player", "enemy"] as const) expect(known(after, side)).toEqual([{ id: tracked, index: 1 }]);
  });

  for (const card of [reversedVoid, chosenVoid]) {
    it(`uses original source-zone order (${card.id})`, () => {
      const source = new Answers((prompt) => prompt.kind === "chooseTargets" ? prompt.candidates.slice(0, 2).reverse() : []);
      const result = play(setup(card.id, { void: [v.vanilla1.id, v.vanilla2.id] }), source);
      expect(placed(result.events).flatMap((event) => event.cards)).toEqual(result.ids.player.void);
      expect(result.state.sides.player.deck).toEqual(card === reversedVoid
        ? [...result.ids.player.void, ...result.start.sides.player.deck]
        : [...result.start.sides.player.deck, ...result.ids.player.void]);
    });
  }

  it("keeps the player's chosen order within a looked-at destination", () => {
    const result = play(setup(arrangeMany.id), new Answers((prompt) => {
      if (prompt.kind !== "arrange") throw new Error("expected arrangement");
      return [{ card: prompt.cards[1], to: "top" }, { card: prompt.cards[0], to: "top" }, { card: prompt.cards[2], to: "bottom" }];
    }));
    expect(result.state.sides.player.deck.slice(0, 2)).toEqual([result.ids.player.deck[1], result.ids.player.deck[0]]);
  });

  for (const subject of [false, true]) {
    it(`skips resolved references still on the stack (subject: ${subject})`, () => {
      const card = subject ? v.event0 : selfOnStack;
      const result = play({ ...setup(card.id), player: { ...setup(card.id).player, back: subject ? [subjectOnStack.id] : [] } }, inOrder());
      expect(placed(result.events)).toEqual([]);
      expect(result.events.some((event) => event.kind === "noLegalTarget")).toBe(true);
      expect(result.state.sides.player.deck).not.toContain(result.ids.player.hand[0]);
    });
  }

  for (const position of ["beforeLook", "afterShuffle", "knownBeforeShuffle"] as const) {
    it(`judges event-local visibility (${position})`, () => {
      const result = play(setup(ponderThenShuffle.id), inOrder());
      const hidden = result.ids.player.deck[0];
      // Deliberately malformed public payload exercises the detector, not game rules.
      const leak: EngineEvent = { kind: "countersChanged", instance: hidden, counters: 1 };
      const before = structuredClone(result.start);
      if (position === "knownBeforeShuffle") before.knownTo.player = [hidden];
      const events = position === "beforeLook" ? [leak, ...result.events] : [...result.events, leak];
      const violations = eventRedactionViolations(events, before, result.state);
      expect(violations).toHaveLength(2);
      expect(violations.every((violation) => violation.includes(hidden))).toBe(true);
      expect(eventRedactionViolations(result.events, before, result.state)).toEqual([]);
    });
  }

  for (const corruptShuffle of [false, true]) {
    it(`rejects placement metadata that widens a private identity (shuffle: ${corruptShuffle})`, () => {
      const result = play(setup(ponderThenShuffle.id), inOrder());
      const placement = placed(result.events).find((event) => event.to === "deckTop");
      const hidden = placement?.cards[0];
      if (placement === undefined || hidden == null) throw new Error("expected a private top placement");
      expect(placement.from).toEqual(["deck"]);
      expect(placement.seenBy).toEqual([["player"]]);
      expect(eventRedactionViolations(result.events, result.start, result.state)).toEqual([]);
      const corrupted = result.events.map((event): EngineEvent => {
        if (event === placement) return { ...event, seenBy: [["player", "enemy"]] };
        if (corruptShuffle && event.kind === "shuffledIntoDeck") {
          // Malformed payload names a private deck card as though it entered the shuffle.
          return { ...event, cards: [hidden], from: ["deck"], seenBy: [["player", "enemy"]] };
        }
        return event;
      });
      const violations = eventRedactionViolations(corrupted, result.start, result.state);
      expect(violations).toHaveLength(corruptShuffle ? 2 : 1);
      expect(violations.every((violation) => violation.includes(hidden))).toBe(true);
    });
  }

  it("is deterministic and Greedy answers its arrangement legally", () => {
    const source = inOrder();
    const once = play(setup(ponderRest.id), source);
    const again = play(setup(ponderRest.id), inOrder());
    expect(stateHash(again.state)).toBe(stateHash(once.state));
    const prompt = source.asked[0].prompt;
    expect(isLegalAnswer(prompt, greedyAnswer(prompt, () => ({ mine: true, value: 1 }), noDiscoverCosts, 0))).toBe(true);
  });
});

describe("putInDeck in the fold", () => {
  const fold = () => createFoldAdapter(engine, { checkEventPrefix: true });
  const opened = (card: CardId) => {
    const adapter = fold();
    const { state, ids } = boardState(engine.catalog, setup(card));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    return { adapter, state, ids, opening: adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }) };
  };

  it("commits nothing while the arrangement is suspended, reloads to it, bounces foreign, stale, concurrent, and illegal input, and resolves once", () => {
    const { state, ids, opening } = opened(ponder.id);
    const suspended = applied(opening);
    expect(suspended.inFlight).not.toBeNull();
    const committed = stateHash(suspended.committed);
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = fold();
    const pending = fresh.pending(reloaded)!;
    expect(pending).toEqual(fold().pending(suspended));
    const [a, b, c, d] = ids.player.deck as [InstanceId, InstanceId, InstanceId, InstanceId];
    expect(pending.prompt).toMatchObject({ kind: "arrange", cancellable: false, cards: [a, b, c] });
    // The looker knows the cards as the prompt shows them; the opponent does not.
    expect(pending.display.knownTo).toEqual({ player: [a, b, c], enemy: [] });

    const value: ArrangeAnswer = [{ card: c, to: "top" }, { card: a, to: "bottom" }, { card: b, to: "hand" }];
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const illegal: ArrangeAnswer[] = [
      [],
      [{ card: c, to: "top" }, { card: a, to: "bottom" }],
      [{ card: c, to: "top" }, { card: a, to: "top" }, { card: b, to: "hand" }],
      [{ card: c, to: "top" }, { card: a, to: "bottom" }, { card: d, to: "hand" }],
      [{ card: c, to: "top" }, { card: a, to: "bottom" }, { card: b, to: "void" }],
      [{ card: c, to: "top" }, { card: c, to: "bottom" }, { card: b, to: "hand" }],
    ];
    for (const wrong of illegal) expect(fresh.reduce(reloaded, { ...answer, value: wrong })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(reloaded.committed)).toBe(committed);

    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected an applied answer");
    expect(placed(outcome.published)).toHaveLength(2);
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.deck).toEqual([c, ...ids.player.deck.slice(3), a]);
    expect(done.committed.sides.player.hand).toEqual([b]);
    expect(done.committed.rng).toEqual(state.rng);
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(applied(fold().reduce(suspended, answer)).committed)).toBe(stateHash(done.committed));
  });

  it("commits no placement when the step fails after it, and the opponent learns nothing", () => {
    const { adapter, ids, opening } = opened(ponderThenFail.id);
    const suspended = applied(opening);
    const state = suspended.committed;
    const pending = adapter.pending(suspended)!;
    const [a, b, c] = ids.player.deck as [InstanceId, InstanceId, InstanceId];
    const outcome = adapter.reduce(suspended, {
      kind: "answer", side: "player", promptId: pending.prompt.id,
      value: [{ card: c, to: "top" }, { card: a, to: "bottom" }, { card: b, to: "hand" }],
    });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.published).toEqual([]);
    const { committed } = outcome.slice;
    expect(committed.sides).toEqual(state.sides);
    const recovered = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = fold();
    const replayed = fresh.reduce(recovered, { kind: "answer", side: "player", promptId: fresh.pending(recovered)!.prompt.id,
      value: [{ card: c, to: "top" }, { card: a, to: "bottom" }, { card: b, to: "hand" }] });
    if (replayed.kind !== "applied" || replayed.error === null) throw new Error("expected replayed engine error");
    expect(stateHash(replayed.slice.committed)).toBe(stateHash(committed));
    expect(committed.knownTo).toEqual({ player: [a, b, c], enemy: [] });
    for (const side of ["player", "enemy"] as const) {
      const visible = view(committed, side, engine.catalog);
      expect(view(replayed.slice.committed, side, engine.catalog)).toEqual(visible);
      expect(visible.sides.player.deck.known).toEqual(side === "player" ? [a, b, c].map((id, index) => ({ id, index })) : []);
      for (const id of [a, b, c]) expect(visible.instances[id]?.printing).toEqual(side === "player" ? state.instances[id].printing : undefined);
    }
    expect(adapter.pending(outcome.slice)).toBeNull();
  });
});
