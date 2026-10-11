import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonSelfCost, activated, everyIn, event, fromVoid } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { greedyAnswer } from "../../../policy/prompts";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { type CardId, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { eventRedactionViolations } from "../../../testing/redaction";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL_CARDS } from "../../../testing/dsl-cards";
import { playFromHand } from "../../../testing/scenario";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { resolveEffect } from "../../interpreter";
import { createCopyInHand } from "../create-copy-in-hand";
import { draw } from "../draw";
import { lookAtTop } from "../look-at-top";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { opponentHand, takeFromAmong } from "../take-from-among";
import { deck, noDiscoverCosts, v } from "./cards-support";

const eventCard = (index: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({
  id: syntheticId(0x6400 + index), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(effect)],
});

/** "Shuffle up to 2 cards from your void into your deck. Draw a card." */
const voidShuffle = eventCard(1, sequence(shuffleInto([fromVoid({}, { count: 2, upTo: true })]), draw(1)));
/** "Draw 2 cards, then shuffle 2 cards from your hand into your deck." */
const handShuffle = eventCard(2, sequence(draw(2), shuffleInto([], { chooseFromHand: 2 })));
/** "Look at the top 3 cards of your deck. Draw one of them and shuffle the rest back." */
const lookThenShuffle = eventCard(3, sequence(lookAtTop(3, { draw: 1 }), shuffleInto()));
/** "Shuffle your hand and void into your deck." */
const handAndVoid = eventCard(4, shuffleInto([everyIn("hand"), everyIn("void")]));
/** "Put a copy of each card in your void into your hand, then shuffle your hand into your deck." */
const copyThenShuffle = eventCard(5, sequence(createCopyInHand(everyIn("void")), shuffleInto([everyIn("hand")])));
/** "Look at the opponent's hand and put a card from it into your hand, then shuffle your hand into your deck." */
const takeThenShuffle = eventCard(6, sequence(takeFromAmong(opponentHand()), shuffleInto([everyIn("hand")])));
/** "Abandon this character: Shuffle up to 3 cards from your void into your deck." */
const abandonShuffler: EngineCardDefinition = {
  id: syntheticId(0x6407), cardType: "character", costs: [], spark: 1, subtype: "Warrior", speed: "standard",
  status: "authored", abilities: () => [activated([abandonSelfCost()], shuffleInto([fromVoid({}, { count: 3, upTo: true })]))],
};
/** Looks at the top 3 and draws one, shuffles, asks for a hand card to shuffle in, then throws. */
const shuffleThenFail: EngineCardDefinition = {
  ...lookThenShuffle, id: syntheticId(0x6408), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      const env = {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      };
      resolveEffect(ctx, sequence(lookAtTop(3, { draw: 1 }), shuffleInto(), shuffleInto([], { chooseFromHand: 1 })), env);
      throw new Error("the step fails after its shuffle");
    },
  },
};

const engine = createEngine(testCatalog([
  ...DSL_CARDS, voidShuffle, handShuffle, lookThenShuffle, handAndVoid, copyThenShuffle, takeThenShuffle, abandonShuffler, shuffleThenFail,
]));

/** Answers each prompt from `answer`, keeping every prompt and the state it was asked in. */
class Answers implements AnswerSource {
  readonly asked: { readonly prompt: Prompt; readonly state: BattleState }[] = [];
  constructor(private readonly respond: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt, state: BattleState): Answer {
    this.asked.push({ prompt, state });
    return this.respond(prompt);
  }
}
const firstCards = (count: number) => new Answers((prompt) => {
  if (prompt.kind !== "chooseCards" && prompt.kind !== "chooseTargets") throw new Error(`unexpected ${prompt.kind} prompt`);
  return prompt.candidates.slice(0, count);
});

const fiveCards: readonly CardId[] = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event0.id];
const setup = (card: CardId, player: Omit<NonNullable<BoardSetup["player"]>, "hand"> & { hand?: readonly CardId[] } = {}): BoardSetup => ({
  active: "player", phase: "day",
  player: { deck: fiveCards, ...player, hand: [card, ...(player.hand ?? [])] },
  enemy: { deck },
});
const play = (board: BoardSetup, source: AnswerSource) => {
  const { state, ids } = boardState(engine.catalog, board);
  const played = engine.apply(state, "player", playFromHand(ids, "player").action, source);
  const rest = passUntil(engine, played.state, (next) => next.stack.length === 0, source);
  return { start: state, ids, state: rest.state, events: [...played.events, ...rest.events] };
};
const shuffles = (events: readonly EngineEvent[]) => events.filter((item) => item.kind === "shuffledIntoDeck");
const sorted = (ids: readonly InstanceId[]) => [...ids].sort();
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  if (outcome.error !== null) throw new Error(outcome.error.message);
  return outcome.slice;
};

describe("shuffleInto", () => {
  it("rejects hand counts that are not non-negative safe integers", () => {
    for (const count of [-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => shuffleInto([], { chooseFromHand: count })).toThrow();
    expect(shuffleInto()).toEqual({ op: "shuffleInto", cards: [], chooseFromHand: 0 });
  });

  it("shuffles chosen void targets into the deck, publicly, forgetting every known deck card, and leaves the rest in the void", () => {
    const board = setup(voidShuffle.id, { void: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] });
    const { state: before, ids } = boardState(engine.catalog, board);
    // Both sides know the top deck card before the shuffle.
    const known = { ...before, knownTo: { player: [ids.player.deck[0]], enemy: [ids.player.deck[0]] } };
    const source = firstCards(2);
    const played = engine.apply(known, "player", playFromHand(ids, "player").action, source);
    const rest = passUntil(engine, played.state, (next) => next.stack.length === 0, source);
    const { state } = rest;
    const events = [...played.events, ...rest.events];
    expect(source.asked.map(({ prompt }) => [prompt.kind, prompt.purpose.role])).toEqual([["chooseTargets", "target"]]);
    const [a, b, c] = ids.player.void;
    expect(sorted(state.sides.player.void)).toEqual(sorted([c, ids.player.hand[0]]));
    // Five deck cards plus the two shuffled in, less the one drawn after the shuffle.
    expect(state.sides.player.deck).toHaveLength(6);
    expect(sorted([...state.sides.player.deck, ...state.sides.player.hand])).toEqual(sorted([...ids.player.deck, a, b]));
    expect(state.rng["shuffle:player"] ?? 0).toBeGreaterThan(known.rng["shuffle:player"] ?? 0);
    expect(events.filter((item) => item.kind === "leftVoid")).toEqual([
      { kind: "leftVoid", instance: a, side: "player", to: "deck" },
      { kind: "leftVoid", instance: b, side: "player", to: "deck" },
    ]);
    const [shuffled] = shuffles(events);
    expect(shuffled).toEqual({ kind: "shuffledIntoDeck", side: "player", cards: [a, b], from: ["void", "void"], seenBy: [["player", "enemy"], ["player", "enemy"]] });
    // A card that entered from a public zone is named to both sides, though neither can place it in the deck.
    for (const side of ["player", "enemy"] as const) {
      expect(eventSeenBy(shuffled, side, state)).toEqual(shuffled);
      expect(view(state, side, engine.catalog).sides.player.deck.known).toEqual([]);
    }
    expect(state.knownTo).toEqual({ player: [], enemy: [] });
    expect(unannouncedChanges(events, known, state)).toEqual([]);
  });

  it("chooses hand cards after the draws, names them only to their holder, and shuffles every deck card out of knowledge", () => {
    const source = firstCards(2);
    const { start, ids, state, events } = play(setup(handShuffle.id, { hand: [v.vanilla2.id] }), source);
    const [{ prompt, state: asked }] = source.asked as { prompt: ChooseCardsPrompt; state: BattleState }[];
    const held = [ids.player.hand[1], ids.player.deck[0], ids.player.deck[1]];
    expect(source.asked).toHaveLength(1);
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", min: 2, max: 2, candidates: held });
    expect(prompt.purpose.role).toBe("shuffleInto");
    // The opponent sees the choice being made, never the hand cards it is made among.
    expect((promptView(prompt, "enemy", asked) as ChooseCardsPrompt).candidates).toEqual([]);
    const chosen = held.slice(0, 2);
    expect(state.sides.player.hand).toEqual([held[2]]);
    expect(sorted(state.sides.player.deck)).toEqual(sorted([...ids.player.deck.slice(2), ...chosen]));
    const [shuffled] = shuffles(events);
    expect(shuffled).toEqual({ kind: "shuffledIntoDeck", side: "player", cards: chosen, from: ["hand", "hand"], seenBy: [["player"], ["player"]] });
    expect(eventSeenBy(shuffled, "player", state)).toEqual(shuffled);
    expect(eventSeenBy(shuffled, "enemy", state)).toEqual({ ...shuffled, cards: [null, null] });
    expect(state.knownTo).toEqual({ player: [], enemy: [] });
    expect(unannouncedChanges(events, start, state)).toEqual([]);
    // The drawer saw the cards it drew though they are hidden in its deck before and after; the opponent never did.
    expect(eventRedactionViolations(events, start, state)).toEqual([]);
    const leaked = { ...shuffled, seenBy: [["player", "enemy"], ["player", "enemy"]] } as const;
    expect(eventRedactionViolations(events.map((item) => (item === shuffled ? leaked : item)), start, state)).toEqual([expect.stringMatching(/^enemy sees a shuffledIntoDeck event/)]);
  });

  it("shuffles the whole hand without asking when it holds fewer cards, and still shuffles the deck when nothing moves", () => {
    const short = play(setup(handShuffle.id, { deck: [v.vanilla1.id] }), firstCards(2));
    expect(short.state.sides.player.hand).toEqual([]);
    expect(shuffles(short.events)).toEqual([
      { kind: "shuffledIntoDeck", side: "player", cards: [short.ids.player.deck[0]], from: ["hand"], seenBy: [["player"]] },
    ]);
    const source = firstCards(0);
    const empty = play(setup(handAndVoid.id), source);
    expect(source.asked).toEqual([]);
    expect(shuffles(empty.events)).toEqual([{ kind: "shuffledIntoDeck", side: "player", cards: [], from: [], seenBy: [] }]);
    expect(empty.state.rng["shuffle:player"] ?? 0).toBeGreaterThan(empty.start.rng["shuffle:player"] ?? 0);
    expect(sorted(empty.state.sides.player.deck)).toEqual(sorted(empty.ids.player.deck));
  });

  it("shuffles the looked-at cards back: the looker forgets the ones it left on top", () => {
    const source = firstCards(1);
    const { ids, state, events } = play(setup(lookThenShuffle.id), source);
    const [top, ...rest] = ids.player.deck;
    expect(state.sides.player.hand).toEqual([top]);
    expect(sorted(state.sides.player.deck)).toEqual(sorted(rest));
    // lookAtTop alone leaves the two undrawn cards known to the looker on top; the shuffle ends that.
    expect(state.knownTo).toEqual({ player: [], enemy: [] });
    expect(shuffles(events)).toEqual([{ kind: "shuffledIntoDeck", side: "player", cards: [], from: [], seenBy: [] }]);
  });

  it("is deterministic: the same state and answers shuffle to the same order, and the battle's seed decides it", () => {
    const once = play(setup(handAndVoid.id, { hand: [v.vanilla1.id, v.vanilla2.id], void: [v.vanilla3.id] }), firstCards(0));
    const again = play(setup(handAndVoid.id, { hand: [v.vanilla1.id, v.vanilla2.id], void: [v.vanilla3.id] }), firstCards(0));
    expect(stateHash(again.state)).toBe(stateHash(once.state));
    expect(once.state.sides.player.deck).toHaveLength(8);
    expect(once.state.sides.player.hand).toEqual([]);
    expect(once.state.sides.player.void).toEqual([once.ids.player.hand[0]]);
  });

  it("makes a created card cease to exist instead, and sends a card to its owner's deck, shuffling each deck it enters", () => {
    const copied = play(setup(copyThenShuffle.id, { void: [v.vanilla1.id] }), firstCards(0));
    expect(copied.events.filter((item) => item.kind === "ceasedToExist").map((item) => item.from)).toEqual(["hand"]);
    expect(shuffles(copied.events)).toEqual([{ kind: "shuffledIntoDeck", side: "player", cards: [], from: [], seenBy: [] }]);
    expect(copied.state.sides.player.deck).toHaveLength(5);
    expect(unannouncedChanges(copied.events, copied.start, copied.state)).toEqual([]);

    const board: BoardSetup = { ...setup(takeThenShuffle.id), enemy: { hand: [v.vanilla2.id], deck } };
    const taken = play(board, firstCards(1));
    const stolen = taken.ids.enemy.hand[0];
    expect(taken.state.sides.enemy.deck).toContain(stolen);
    expect(taken.state.instances[stolen]).toMatchObject({ zone: "deck", controller: "enemy", owner: "enemy" });
    expect(shuffles(taken.events)).toEqual([
      { kind: "shuffledIntoDeck", side: "player", cards: [], from: [], seenBy: [] },
      // The taker looked at the opponent's hand, so both sides can tell which card went back.
      { kind: "shuffledIntoDeck", side: "enemy", cards: [stolen], from: ["hand"], seenBy: [["player", "enemy"]] },
    ]);
    expect(taken.state.rng["shuffle:enemy"] ?? 0).toBeGreaterThan(taken.start.rng["shuffle:enemy"] ?? 0);
    expect(taken.state.knownTo).toEqual({ player: [], enemy: [] });
    expect(unannouncedChanges(taken.events, taken.start, taken.state)).toEqual([]);
  });

  it("chooses its void targets as the ability is activated, before its own abandon puts it in the void", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { back: [abandonShuffler.id], void: [v.vanilla1.id, v.vanilla2.id], deck: fiveCards }, enemy: { deck },
    });
    const shuffler = ids.player.back[0]!;
    const source = firstCards(3);
    const activatedOnce = engine.apply(start, "player", { kind: "activate", source: shuffler, ability: 0 }, source);
    const rest = passUntil(engine, activatedOnce.state, (next) => next.stack.length === 0, source);
    expect(source.asked.map(({ prompt }) => prompt.kind === "chooseTargets" && prompt.candidates)).toEqual([ids.player.void]);
    expect(rest.state.sides.player.void).toEqual([shuffler]);
    expect(sorted(rest.state.sides.player.deck)).toEqual(sorted([...ids.player.deck, ...ids.player.void]));
  });

  it("has Greedy shuffle away its least valuable hand cards", () => {
    const { state, ids } = boardState(engine.catalog, setup(handShuffle.id, { hand: [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id] }));
    const [low, high, mid] = ids.player.hand.slice(1);
    const value = new Map([[low, 0], [high, 3], [mid, 1]]);
    const prompt: ChooseCardsPrompt = {
      kind: "chooseCards", side: "player", cancellable: false, candidates: [low, high, mid], min: 2, max: 2,
      purpose: { source: ids.player.hand[0], cardId: handShuffle.id, ability: 0, role: "shuffleInto" },
    };
    expect(greedyAnswer(prompt, (id) => ({ mine: true, value: value.get(id) ?? 0 }), noDiscoverCosts, state.automaticChoices)).toEqual([low, mid]);
  });
});

describe("shuffleInto in the fold", () => {
  const fold = () => createFoldAdapter(engine, { checkEventPrefix: true });
  const opened = (card: CardId, hand: readonly CardId[] = [v.vanilla2.id]) => {
    const adapter = fold();
    const { state, ids } = boardState(engine.catalog, setup(card, { hand }));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    return { adapter, state, ids, start, opening: adapter.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }) };
  };

  it("commits nothing while the hand choice is suspended, reloads to the same prompt, bounces foreign, stale, concurrent, and illegal input, and resolves once", () => {
    const { state, ids, opening } = opened(handShuffle.id);
    const suspended = applied(opening);
    expect(suspended.inFlight).not.toBeNull();
    const committed = stateHash(suspended.committed);
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(suspended.committed.rng).toEqual(state.rng);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = fold();
    const pending = fresh.pending(reloaded)!;
    expect(pending).toEqual(fold().pending(suspended));
    const held = [ids.player.hand[1], ids.player.deck[0], ids.player.deck[1]];
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", cancellable: false, min: 2, max: 2, candidates: held });
    // The display already holds the draws; the deck is not yet shuffled.
    expect(pending.display.sides.player.hand).toEqual(held);
    expect(pending.display.rng["shuffle:player"]).toBe(state.rng["shuffle:player"]);

    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [held[0], held[2]] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    for (const value of [[], [held[0]], held, [held[0], held[0]], [held[0], ids.player.deck[2]], [held[0], ids.player.hand[0]]]) {
      expect(fresh.reduce(reloaded, { ...answer, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(reloaded.committed)).toBe(committed);

    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected an applied answer");
    expect(shuffles(outcome.published)).toHaveLength(1);
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([held[1]]);
    expect(sorted(done.committed.sides.player.deck)).toEqual(sorted([...ids.player.deck.slice(2), held[0], held[2]]));
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    // The same answers from the live slice reach the identical committed state.
    expect(stateHash(applied(fold().reduce(suspended, answer)).committed)).toBe(stateHash(done.committed));
  });

  it("commits no move, shuffle, or draw, and keeps no knowledge of shuffled cards, when the step fails after its shuffle", () => {
    const { adapter, state, ids, opening } = opened(shuffleThenFail.id);
    const atLook = applied(opening);
    const look = adapter.pending(atLook)!;
    expect(look.prompt).toMatchObject({ kind: "chooseCards", privateTo: "player", candidates: ids.player.deck.slice(0, 3) });
    const atHand = applied(adapter.reduce(atLook, { kind: "answer", side: "player", promptId: look.prompt.id, value: [ids.player.deck[0]] }));
    const hand = adapter.pending(atHand)!;
    // The hand choice comes after the shuffle: the looker no longer knows the cards it left on top.
    expect(hand.prompt.purpose.role).toBe("shuffleInto");
    expect(hand.display.knownTo.player).toEqual([]);
    const outcome = adapter.reduce(atHand, { kind: "answer", side: "player", promptId: hand.prompt.id, value: [ids.player.hand[1]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its shuffle/);
    expect(outcome.published).toEqual([]);
    // The look was shown, but a shuffle in the same run ended it before the published prompt, so nothing is kept.
    expect(outcome.slice.committed).toEqual(atLook.committed);
    expect(outcome.slice.committed.knownTo).toEqual(state.knownTo);
    expect(adapter.pending(outcome.slice)).toBeNull();
  });
});
