import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineCatalog } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { EngineLogRecord } from "../../../log";
import { isLegalAnswer } from "../../../prompts/answers";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { event } from "../../../dsl/builders";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { opponent as opponentOf, type CardId, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { invariantViolations } from "../../../testing/invariants";
import { playFromHand } from "../../../testing/scenario";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { promptView, view } from "../../../view/view";
import { greedyAnswer } from "../../../policy/prompts";
import { identifies } from "../../../view/knowledge";
import { resolveEffect } from "../../interpreter";
import { discardChosen } from "../discard-chosen";
import { discover } from "../discover";
import { opponentHand, takeFromAmong } from "../take-from-among";
import { v, deck, noDiscoverCosts, knowing, PickingSource } from "./cards-support";

/** Discovers a character, then throws: a step that fails after its Discover's answer was accepted. */
const discoverThenFail: EngineCardDefinition = {
  id: syntheticId(920),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character" }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

/** Synthetic chosen-hand effects, independent of catalog text and printed defaults. */
const chosenDiscard: EngineCardDefinition = {
  id: syntheticId(960), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(discardChosen())],
};

/** Looks at the opponent's hand and takes a card from it, then throws: a step that fails after the answer is accepted. */
const takeThenFail: EngineCardDefinition = {
  ...discoverThenFail,
  id: syntheticId(970),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, takeFromAmong(opponentHand()), {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its take");
    },
  },
};

/** "Look at the opponent's hand. You may put a ≤2● character from it into your hand." */
const takeCheapCharacterFromOpponentHand: EngineCardDefinition = {
  ...chosenDiscard,
  id: syntheticId(971),
  abilities: () => [event(takeFromAmong(opponentHand(), { filter: { cardType: "character" }, costAtMost: 2, optional: true }))],
};

/** An answer source that records what the chooser's view shows of the opponent's hand as it answers. */
class LookingSource implements AnswerSource {
  readonly prompts: ChooseCardsPrompt[] = [];
  readonly seen: (readonly InstanceId[])[] = [];
  constructor(
    private readonly catalog: EngineCatalog,
    private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[],
  ) {}
  answer(prompt: Prompt, work: BattleState): Answer {
    if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    this.prompts.push(prompt);
    this.seen.push(view(work, prompt.side, this.catalog).sides[opponentOf(prompt.side)].hand.known.map((card) => card.id));
    return this.pick(prompt.candidates);
  }
}

describe("takeFromAmong", () => {
  const taking = createEngine(testCatalog([...DSL_CARDS, takeThenFail, takeCheapCharacterFromOpponentHand, chosenDiscard]));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };
  const erodeBoard = (playerDeck: readonly CardId[]): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [DSL.erodeTakeCharacter.id], void: [v.vanilla1.id], deck: playerDeck }, enemy: { deck },
  });
  const handBoard = (card: CardId, enemyHand: readonly CardId[]): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [card], deck }, enemy: { hand: enemyHand, deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(taking.catalog, setup);
    return { start: state, ids, result: taking.apply(state, "player", playFromHand(ids, "player").action, source) };
  };

  it("offers the eroded cards that match the filter and cost bound, in the order eroded, and puts the chosen one into hand publicly", () => {
    const source = new PickingSource((candidates) => [candidates[1]]);
    // ≤2● characters: vanilla2 (2●) and vanilla0 (0●); vanilla3 costs 3●, event0 is an event, vanilla1 is not eroded.
    const { ids, result } = play(erodeBoard([v.vanilla2.id, v.vanilla3.id, v.vanilla0.id, v.event0.id, v.vanilla1.id]), source);
    const [prompt] = source.prompts as ChooseCardsPrompt[];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", min: 0, max: 1, candidates: [ids.player.deck[0], ids.player.deck[2]] });
    expect(prompt.privateTo).toBeUndefined();
    expect(prompt.purpose.role).toBe("chooseAmong");
    const chosen = ids.player.deck[2];
    const { state, events } = result;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(state.instances[chosen]).toMatchObject({ zone: "hand", owner: "player", controller: "player" });
    expect([...state.sides.player.void].sort()).toEqual([ids.player.hand[0], ids.player.void[0], ids.player.deck[0], ids.player.deck[1]].sort());
    expect(state.sides.player.deck).toEqual(ids.player.deck.slice(3));
    const taken = { kind: "cardTaken", side: "player", instance: chosen, from: "void", holder: "player" } as const;
    expect(events.filter((item) => item.kind === "cardTaken")).toEqual([taken]);
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(taken, viewer, state)).toEqual(taken);
    expect(events.some((item) => item.kind === "cardDrawn")).toBe(false);
  });

  it("takes nothing when declined, asks nothing when no eroded card matches or the deck is empty", () => {
    const declined = play(erodeBoard([v.vanilla2.id, v.vanilla3.id, v.vanilla0.id]), new PickingSource(() => []));
    expect(declined.result.state.sides.player.hand).toEqual([]);
    expect([...declined.result.state.sides.player.void].sort()).toEqual([declined.ids.player.hand[0], declined.ids.player.void[0], ...declined.ids.player.deck].sort());
    expect(declined.result.events.some((item) => item.kind === "cardTaken")).toBe(false);
    for (const playerDeck of [[v.vanilla3.id, v.event0.id, v.vanilla5.id, v.vanilla1.id], []]) {
      const none = play(erodeBoard(playerDeck), new ScriptedSource([]));
      expect(none.result.answers).toEqual([]);
      expect(none.result.state.sides.player.hand).toEqual([]);
      expect(none.result.events.some((item) => item.kind === "cardTaken")).toBe(false);
    }
  });

  it("looks at the opponent's whole hand privately and puts the chosen card into its controller's hand, still owned by the opponent and known to both", () => {
    const source = new PickingSource((candidates) => [candidates[1]]);
    const { start, ids, result } = play(handBoard(DSL.takeFromOpponentHand.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]), source);
    const [prompt] = source.prompts as ChooseCardsPrompt[];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 1, max: 1, candidates: ids.enemy.hand });
    expect(prompt.purpose.role).toBe("chooseFromOpponentHand");
    expect(view(start, "player", taking.catalog).sides.enemy.hand.known).toEqual([]);
    const { state, events } = result;
    const [kept0, chosen, kept2] = ids.enemy.hand;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(state.sides.enemy.hand).toEqual([kept0, kept2]);
    expect(state.instances[chosen]).toMatchObject({ zone: "hand", owner: "enemy", controller: "player" });
    // The looker keeps knowing the cards it looked at; the opponent still knows the card it lost.
    expect(view(state, "player", taking.catalog).sides.enemy.hand.known).toEqual([{ id: kept0, index: 0 }, { id: kept2, index: 1 }]);
    expect(identifies(state, chosen, "enemy")).toBe(true);
    const taken = { kind: "cardTaken", side: "player", instance: chosen, from: "hand", holder: "enemy" } as const;
    expect(events.filter((item) => item.kind === "cardTaken")).toEqual([taken]);
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(taken, viewer, state)).toEqual(taken);
    // A side that cannot identify the card sees only that a card was taken.
    expect(eventSeenBy(taken, "enemy", { ...state, knownTo: { ...state.knownTo, enemy: [] } })).toEqual({ ...taken, instance: null });
    // A card the opponent draws later is not looked at.
    expect(state.knownTo.player).not.toContain(ids.enemy.deck[0]);
  });

  it("answers a lone card itself, asks nothing from an empty hand, and a created card it takes ceases to exist unannounced as a take", () => {
    const lone = play(handBoard(DSL.takeFromOpponentHand.id, [v.vanilla1.id]), new ScriptedSource([]));
    expect(lone.result.state.sides.player.hand).toEqual(lone.ids.enemy.hand);
    expect(lone.result.answers).toEqual([expect.objectContaining({ auto: true })]);
    const empty = play(handBoard(DSL.takeFromOpponentHand.id, []), new ScriptedSource([]));
    expect(empty.result.answers).toEqual([]);
    expect(empty.result.events.some((item) => item.kind === "cardTaken")).toBe(false);

    const { state, ids } = boardState(taking.catalog, handBoard(DSL.takeFromOpponentHand.id, [v.vanilla1.id]));
    state.instances[ids.enemy.hand[0]].status.created = true;
    const created = taking.apply(state, "player", playFromHand(ids, "player").action, new ScriptedSource([]));
    expect(created.state.instances[ids.enemy.hand[0]]).toBeUndefined();
    expect(created.state.sides.player.hand).toEqual([]);
    expect(created.events.filter((item) => item.kind === "ceasedToExist")).toHaveLength(1);
    expect(created.events.some((item) => item.kind === "cardTaken")).toBe(false);
  });

  it("looks at the whole hand when a filter and cost bound narrow the take, offering only the matching cards, and the opponent learns only the taken card", () => {
    const source = new LookingSource(taking.catalog, (candidates) => [candidates[1]]);
    // ≤2● characters: vanilla1 and vanilla2; vanilla3 costs 3●, event0 is an event.
    const { start, ids, result } = play(handBoard(takeCheapCharacterFromOpponentHand.id, [v.vanilla1.id, v.vanilla3.id, v.event0.id, v.vanilla2.id]), source);
    const [cheap, costly, anEvent, chosen] = ids.enemy.hand;
    const [prompt] = source.prompts;
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 0, max: 1, candidates: [cheap, chosen] });
    expect(prompt.purpose.role).toBe("chooseFromOpponentHand");
    // The looker sees every card in the hand as it chooses, not only those it may take.
    expect(source.seen).toEqual([ids.enemy.hand]);
    const { state } = result;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(view(state, "player", taking.catalog).sides.enemy.hand.known).toEqual([{ id: cheap, index: 0 }, { id: costly, index: 1 }, { id: anEvent, index: 2 }]);
    expect(start.knownTo.enemy).toEqual([]);
    expect(state.knownTo.enemy).toEqual([chosen]);
    expect(state.knownTo.player).not.toContain(ids.enemy.deck[0]);
    expect(invariantViolations(state, taking.catalog)).toEqual([]);
  });

  it("looks at the whole hand without asking when no card in it matches the filter and cost bound", () => {
    const { start, ids, result } = play(handBoard(takeCheapCharacterFromOpponentHand.id, [v.vanilla3.id, v.event0.id, v.vanilla5.id]), new ScriptedSource([]));
    expect(result.answers).toEqual([]);
    expect(result.events.some((item) => item.kind === "cardTaken")).toBe(false);
    const { state } = result;
    expect(state.sides.enemy.hand).toEqual(ids.enemy.hand);
    expect(view(state, "player", taking.catalog).sides.enemy.hand.known).toEqual(ids.enemy.hand.map((id, index) => ({ id, index })));
    expect(state.knownTo.enemy).toEqual(start.knownTo.enemy);
    expect(state.knownTo.player).not.toContain(ids.enemy.deck[0]);
  });

  it("forgets a looked-at card once it leaves the opponent's hand, whether discarded or ceasing to exist", () => {
    const { state: board, ids } = boardState(taking.catalog, {
      ...handBoard(DSL.takeFromOpponentHand.id, [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id]),
      player: { hand: [DSL.takeFromOpponentHand.id, chosenDiscard.id, chosenDiscard.id], deck },
    });
    const [taken, discarded, ceasing] = ids.enemy.hand;
    const [look, discardOne, discardAnother] = ids.player.hand;
    const playing = (state: BattleState, card: InstanceId, pick: InstanceId) =>
      taking.apply(state, "player", { kind: "play", card, from: "hand" }, new PickingSource(() => [pick])).state;
    const looked = playing(board, look, taken);
    expect([...looked.knownTo.player].sort()).toEqual([discarded, ceasing].sort());

    const afterDiscard = playing(looked, discardOne, discarded);
    expect(afterDiscard.sides.enemy.void).toEqual([discarded]);
    expect(afterDiscard.knownTo.player).toEqual([ceasing]);
    expect(view(afterDiscard, "player", taking.catalog).sides.enemy.hand.known).toEqual([{ id: ceasing, index: 0 }]);

    afterDiscard.instances[ceasing].status.created = true;
    const afterCeasing = playing(afterDiscard, discardAnother, ceasing);
    expect(afterCeasing.instances[ceasing]).toBeUndefined();
    expect(afterCeasing.knownTo.player).toEqual([]);
    expect(invariantViolations(afterCeasing, taking.catalog)).toEqual([]);
  });

  it("commits nothing while the look is suspended, reloads to the same private prompt, bounces foreign, stale, and illegal answers, and resolves once", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(taking, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(taking.catalog, handBoard(DSL.takeFromOpponentHand.id, [v.vanilla1.id, v.vanilla2.id]));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    expect(suspended.committed.knownTo.player).toEqual([]);
    expect(suspended.committed.sides.enemy.hand).toEqual(ids.enemy.hand);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(taking, { checkEventPrefix: true, log: (record) => records.push(record) });
    const pending = fresh.pending(reloaded)!;
    expect(pending.prompt.id).toBe(fold.pending(suspended)!.prompt.id);
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual(ids.enemy.hand);
    // The looker sees the opponent's hand while it chooses; the opponent sees only its own cards.
    expect(view(pending.display, "player", taking.catalog).sides.enemy.hand.known).toEqual([{ id: ids.enemy.hand[0], index: 0 }, { id: ids.enemy.hand[1], index: 1 }]);
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual(ids.enemy.hand);

    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[1]] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [[], ids.enemy.hand, [ids.player.hand[0]], [ids.enemy.deck[0]]]) {
      expect(fresh.reduce(reloaded, { ...answer, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected the answer to apply");
    expect(outcome.published.filter((item) => item.kind === "cardTaken")).toHaveLength(1);
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([ids.enemy.hand[1]]);
    expect(done.committed.knownTo.player).toEqual([ids.enemy.hand[0]]);
    expect(fresh.reduce(done, answer)).toMatchObject({ kind: "bounced" });
    expect(records.some((record) => record.event === "engine.promptAnswered")).toBe(true);
  });

  it("replays the erode before a suspended choice after reload, offering the same cards, and commits the erode with a declined take", () => {
    const fold = createFoldAdapter(taking, { checkEventPrefix: true });
    const { state, ids } = boardState(taking.catalog, erodeBoard([v.vanilla2.id, v.vanilla0.id, v.vanilla1.id, v.vanilla3.id]));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opening = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    const suspended = applied(opening);
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(taking, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded)!;
    expect(pending.prompt.id).toBe(fold.pending(suspended)!.prompt.id);
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual(ids.player.deck.slice(0, 3));
    expect(fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.void[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const outcome = fresh.reduce(reloaded, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [] });
    const done = applied(outcome);
    if (opening.kind !== "applied" || outcome.kind !== "applied") throw new Error("expected applied intents");
    expect([...opening.published, ...outcome.published].filter((item) => item.kind === "eroded")).toHaveLength(3);
    expect(outcome.published.some((item) => item.kind === "cardTaken")).toBe(false);
    expect([...done.committed.sides.player.void].sort()).toEqual([ids.player.hand[0], ids.player.void[0], ...ids.player.deck.slice(0, 3)].sort());
    expect(done.committed.sides.player.hand).toEqual([]);
  });

  it("keeps only the look's private knowledge and publishes nothing when the step fails after the answer is accepted", () => {
    const fold = createFoldAdapter(taking, { checkEventPrefix: true });
    const { state, ids } = boardState(taking.catalog, handBoard(takeThenFail.id, [v.vanilla1.id, v.vanilla2.id]));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    const outcome = fold.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.enemy.hand[0]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its take/);
    expect(outcome.published).toEqual([]);
    // The looker keeps knowing the whole hand it looked at; the take and everything else roll back.
    expect(outcome.slice.committed).toEqual(knowing(suspended.committed, "player", ids.enemy.hand));
    expect(outcome.slice.committed.sides.enemy.hand).toEqual(ids.enemy.hand);
    expect(view(outcome.slice.committed, "player", taking.catalog).sides.enemy.hand.known).toEqual(ids.enemy.hand.map((id, index) => ({ id, index })));
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  it("has Greedy answer offered-card choices legally, and decline an optional take once its optional chain is spent", () => {
    const { state, ids } = boardState(taking.catalog, erodeBoard([v.vanilla0.id, v.vanilla2.id]));
    const [low, high] = ids.player.deck;
    const value = new Map([[low, 0], [high, 2]]);
    for (const role of ["chooseAmong", "chooseFromOpponentHand"] as const) {
      const prompt: ChooseCardsPrompt = {
        kind: "chooseCards", side: "player", cancellable: false, candidates: [low, high], min: role === "chooseAmong" ? 0 : 1, max: 1,
        purpose: { source: ids.player.hand[0], cardId: DSL.erodeTakeCharacter.id, ability: 0, role },
      };
      const answer = greedyAnswer(prompt, (id) => ({ mine: role === "chooseAmong", value: value.get(id) ?? 0 }), noDiscoverCosts, state.automaticChoices);
      expect(isLegalAnswer(prompt, answer)).toBe(true);
      if (prompt.min === 1) expect(answer).toHaveLength(1);
    }
    const optional: ChooseCardsPrompt = {
      kind: "chooseCards", side: "player", cancellable: false, candidates: [low, high], min: 0, max: 1,
      purpose: { source: ids.player.hand[0], cardId: DSL.erodeTakeCharacter.id, ability: 0, role: "chooseAmong" },
    };
    const capped = greedyAnswer(optional, (id) => ({ mine: true, value: value.get(id) ?? 0 }), noDiscoverCosts, Number.MAX_SAFE_INTEGER);
    expect(isLegalAnswer(optional, capped)).toBe(true);
    expect(capped).toEqual([]);
  });
});
