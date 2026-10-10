/** Card primitives: draw, discard, foresee, erode, discover. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { eventSeenBy } from "../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../fold/slice";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../prompts/types";
import { stateHash } from "../../state/hash";
import type { CardId, InstanceId } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { IllegalAnswer } from "../../steps/errors";
import { ScriptedSource } from "../../steps/sources";
import type { AnswerSource } from "../../steps/types";
import { boardState, cardIdOf, type BoardSetup } from "../../testing/board";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";
import { promptView } from "../../view/view";

const engine = createEngine(testCatalog(DSL_CARDS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

describe("card primitives", () => {
  it("draw moves cards from the top of the deck to hand", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("reads the amplified variant", () => {
    const run = (amplified: boolean) =>
      runScenario(engine, {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [{ cardId: DSL.amplifiedDraw.id, amplified }], energy: 1, deck },
          enemy: { deck },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
    expect(run(false).state.sides.player.hand).toHaveLength(2);
    expect(run(true).state.sides.player.hand).toHaveLength(3);
  });

  it("discard has the player choose, discarding the whole hand when it is short", () => {
    const chosen = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.player.hand[1], ids.player.hand[3]]],
    });
    expect(chosen.state.sides.player.hand).toEqual([chosen.ids.player.hand[2]]);
    const short = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(short.state.sides.player.hand).toEqual([]);
    expect(short.answers).toEqual([expect.objectContaining({ auto: true })]);
  });

  it("random discard draws from its own random stream without a prompt", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentDiscardsRandom.id], energy: 1, deck }, enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.hand).toHaveLength(1);
    expect(state.rng["random:discard"]).toBe(1);
    expect(answers).toEqual([]);
  });

  it("foresee reorders the top cards and sends the chosen ones to the void", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    expect(state.sides.player.deck.slice(0, 3)).toEqual([ids.player.deck[1], ids.player.deck[2], ids.player.deck[3]]);
    expect(state.sides.player.void).toContain(ids.player.deck[0]);
  });

  it("erode moves the top cards to the void and causes Fatigue from an empty deck", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.erodeThree.id], deck }, enemy: { deck: [v.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.void).toHaveLength(1);
    expect(state.sides.enemy.fatigueCount).toBe(2);
    expect(state.sides.player.score).toBe(1 + 2);
  });
});

/** Answers every prompt with `pick` of its candidates, keeping each prompt it was asked. */
class PickingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

describe("discover", () => {
  // Four characters and three events.
  const mixed = [v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla3.id, v.event0.id, v.vanilla5.id];
  const board = (card: CardId, playerDeck: readonly CardId[]): BoardSetup => ({
    active: "player",
    phase: "day",
    player: { hand: [card], deck: playerDeck },
    enemy: { deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(engine.catalog, setup);
    return { start: state, ids, result: engine.apply(state, "player", playFromHand(ids, "player").action, source) };
  };
  const cardType = (state: BattleState, id: InstanceId) => engine.catalog.card(cardIdOf(state, id)).cardType;

  it("privately offers up to three matching cards of its controller's deck, puts the chosen one into hand, and shuffles the deck", () => {
    const source = new PickingSource((candidates) => [candidates[1]]);
    const { start, ids, result } = play(board(DSL.discoverCharacter.id, mixed), source);
    const [prompt] = source.prompts as ChooseCardsPrompt[];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 1, max: 1 });
    expect(prompt.purpose.role).toBe("discover");
    expect(new Set(prompt.candidates).size).toBe(3);
    for (const card of prompt.candidates) {
      expect(ids.player.deck).toContain(card);
      expect(cardType(start, card)).toBe("character");
    }
    const chosen = prompt.candidates[1];
    const { state } = result;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(state.instances[chosen]?.zone).toBe("hand");
    expect([...state.sides.player.deck].sort()).toEqual(ids.player.deck.filter((card) => card !== chosen).sort());
    expect(state.rng["random:discover"]).toBe(3);
    expect(state.rng["shuffle:player"] ?? 0).toBeGreaterThan(start.rng["shuffle:player"] ?? 0);
    // Nobody can place a card of the shuffled deck, the offered ones included.
    for (const side of ["player", "enemy"] as const) {
      expect(state.knownTo[side].filter((card) => state.sides.player.deck.includes(card))).toEqual([]);
    }
    expect(result.events.some((event) => event.kind === "cardDrawn")).toBe(false);
    // Both sides see the discovery; only the discoverer sees which card it was.
    const discovered = result.events.filter((event) => event.kind === "cardDiscovered");
    expect(discovered).toEqual([{ kind: "cardDiscovered", side: "player", instance: chosen }]);
    expect(eventSeenBy(discovered[0], "player", state)).toEqual(discovered[0]);
    expect(eventSeenBy(discovered[0], "enemy", state)).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
  });

  it("offers every matching card when fewer match, answers a lone match itself, and does nothing with none", () => {
    const events = new PickingSource((candidates) => [candidates[0]]);
    const twoEvents = play(board(DSL.discoverEvent.id, [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]), events);
    expect([...(events.prompts[0] as ChooseCardsPrompt).candidates].sort()).toEqual([twoEvents.ids.player.deck[1], twoEvents.ids.player.deck[3]].sort());

    const lone = play(board(DSL.discoverCharacter.id, [v.event0.id, v.vanilla1.id, v.event1.id]), new ScriptedSource([]));
    expect(lone.result.state.sides.player.hand).toEqual([lone.ids.player.deck[1]]);
    expect(lone.result.answers).toEqual([expect.objectContaining({ auto: true })]);

    const none = play(board(DSL.discoverCharacter.id, [v.event0.id, v.event1.id]), new ScriptedSource([]));
    expect(none.result.answers).toEqual([]);
    expect(none.result.events.some((event) => event.kind === "cardDiscovered")).toBe(false);
    expect(none.result.state.sides.player.hand).toEqual([]);
    expect(none.result.state.sides.player.deck).toEqual(none.ids.player.deck);
    expect(none.result.state.rng["random:discover"]).toBeUndefined();
    expect(none.result.state.rng["shuffle:player"]).toEqual(none.start.rng["shuffle:player"]);
  });

  it("hides the offer from the opponent and rejects an answer it did not offer without touching the state", () => {
    const { state: start, ids } = boardState(engine.catalog, board(DSL.discoverCharacter.id, mixed));
    const action = playFromHand(ids, "player").action;
    const before = stateHash(start);
    const offered = new PickingSource((candidates) => [candidates[0]]);
    engine.apply(start, "player", action, offered);
    const prompt = offered.prompts[0] as ChooseCardsPrompt;
    const characters = ids.player.deck.filter((card) => cardType(start, card) === "character");
    const unoffered = characters.find((card) => !prompt.candidates.includes(card))!;
    for (const answer of [[unoffered], [], prompt.candidates.slice(0, 2), [ids.player.deck[0]]]) {
      expect(() => engine.apply(start, "player", action, new ScriptedSource([answer]))).toThrow(IllegalAnswer);
    }
    expect(stateHash(start)).toBe(before);
  });
});

describe("discover across suspension", () => {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };

  it("commits nothing while suspended, reloads to the same offer, bounces foreign and illegal answers, and resolves once answered", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.discoverCharacter.id], deck: [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] },
      enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    // Only the answer commits the step: the deck, hand, and random streams are untouched until then.
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(suspended.committed.sides.player.hand).toEqual([]);
    expect(suspended.committed.rng["random:discover"]).toBeUndefined();
    expect(suspended.committed.knownTo.player).toEqual([]);
    // The opponent learns that a choice is pending, never which cards it offers.
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);

    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt.id).toBe(pending.prompt.id);
    const offered = (pending.prompt as ChooseCardsPrompt).candidates;
    expect((again.prompt as ChooseCardsPrompt).candidates).toEqual(offered);

    const unoffered = [ids.player.deck[0], ids.player.deck[2], ids.player.deck[3], ids.player.deck[4]].find((card) => !offered.includes(card))!;
    const answer = (side: "player" | "enemy", value: readonly InstanceId[]) =>
      fresh.reduce(reloaded, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [offered[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [unoffered])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", offered.slice(0, 2))).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });

    const done = applied(answer("player", [offered[2]]));
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([offered[2]]);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [offered[2]] })).toMatchObject({ kind: "bounced" });
  });
});
