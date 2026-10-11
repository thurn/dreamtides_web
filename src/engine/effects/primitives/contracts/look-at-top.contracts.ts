import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../../prompts/types";
import { energy, event } from "../../../dsl/builders";
import { triggered, whenDraw } from "../../../dsl/triggers";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { type CardId, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type BoardSetup } from "../../../testing/board";
import { DSL, DSL_CARDS } from "../../../testing/dsl-cards";
import { playFromHand } from "../../../testing/scenario";
import { STACK } from "../../../testing/stack-cards";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { promptView, view } from "../../../view/view";
import { greedyAnswer } from "../../../policy/prompts";
import { identifies } from "../../../view/knowledge";
import { resolveEffect } from "../../interpreter";
import { erode } from "../erode";
import { opponentHand, takeFromAmong } from "../take-from-among";
import { gainPoints } from "../gain-points";
import { lookAtTop } from "../look-at-top";
import { v, deck, noDiscoverCosts, knowing } from "./cards-support";

/** "Look at the top 3 cards of your deck. Draw 2 of the cards." */
const lookThreeDrawTwo: EngineCardDefinition = {
  id: syntheticId(980), cardType: "event", costs: [], spark: null, subtype: "",
  speed: "standard", status: "authored", abilities: () => [event(lookAtTop(3, { draw: 2 }))],
};

/** "When you draw a card, gain 1⍟." */
const drawWatcher: EngineCardDefinition = {
  id: syntheticId(981), cardType: "character", costs: [energy(1)], spark: 1, subtype: "Warrior",
  speed: "standard", status: "authored", abilities: () => [triggered(whenDraw(), gainPoints(1))],
};

/**
 * Looks at the top 4 cards and draws 1 of them, then looks at the opponent's
 * hand without asking (no card in it is an event), then throws: a step that
 * fails after the answer is accepted.
 */
const lookThenFail: EngineCardDefinition = {
  ...lookThreeDrawTwo, id: syntheticId(982), abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      const env = {
        source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
      };
      resolveEffect(ctx, lookAtTop(4, { draw: 1 }), env);
      resolveEffect(ctx, takeFromAmong(opponentHand(), { filter: { cardType: "event" } }), env);
      throw new Error("the step fails after its look");
    },
  },
};

/** Answers a mode prompt with `mode` and a card prompt with `pick` of its candidates, keeping each prompt and what the chooser knew as it opened. */
class LookAtTopSource implements AnswerSource {
  readonly prompts: { readonly prompt: Prompt; readonly known: readonly InstanceId[] }[] = [];
  constructor(private readonly mode: number, private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt, state: BattleState): Answer {
    this.prompts.push({ prompt, known: [...state.knownTo[prompt.side]] });
    if (prompt.kind === "chooseMode") return this.mode;
    if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

describe("lookAtTop", () => {
  const looking = createEngine(testCatalog([...DSL_CARDS, lookThreeDrawTwo, drawWatcher, lookThenFail]));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };
  const fiveCards = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id, v.event0.id];
  const board = (card: CardId, playerDeck: readonly CardId[] = fiveCards): BoardSetup => ({
    active: "player", phase: "day", player: { hand: [card], back: [drawWatcher.id], deck: playerDeck }, enemy: { deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(looking.catalog, setup);
    return { start: state, ids, result: looking.apply(state, "player", playFromHand(ids, "player").action, source) };
  };

  it("rejects draw counts that are not positive safe integers", () => {
    for (const count of [0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => lookAtTop(4, { draw: count })).toThrow();
    }
  });

  it("keeps the played mode across a response, looks at the resolution-time deck, and looks at nothing when prevented", () => {
    const erosion: EngineCardDefinition = {
      ...v.interruptEvent, id: syntheticId(983), costs: [], status: "authored", abilities: () => [event(erode(1, "opponent"))],
    };
    const responding = createEngine(testCatalog([...DSL_CARDS, lookThreeDrawTwo, drawWatcher, erosion, STACK.preventEvent]));
    for (const response of [erosion, STACK.preventEvent]) {
      for (const [mode, drawn] of [[0, 1], [1, 2]] as const) {
        const source = new LookAtTopSource(mode, (candidates) => candidates.slice(candidates.length - drawn));
        const { state, ids } = boardState(responding.catalog, {
          ...board(DSL.lookAtTopDraw.id), enemy: { hand: [response.id], energy: 1, deck },
        });
        const played = responding.apply(state, "player", playFromHand(ids, "player").action, source);
        expect(played.state.stack).toHaveLength(1);
        expect(source.prompts.map(({ prompt }) => prompt.kind)).toEqual(["chooseMode"]);
        expect(source.prompts[0].known).toEqual([]);
        expect(played.events.some((item) => item.kind === "lookedAtTop")).toBe(false);
        const responded = responding.apply(played.state, "enemy", playFromHand(ids, "enemy").action, source);
        const rest = passUntil(responding, responded.state, (next) => next.stack.length === 0, source);
        const events = [...played.events, ...responded.events, ...rest.events];
        if (response.id === erosion.id) {
          const candidates = ids.player.deck.slice(1);
          const chosen = candidates.slice(candidates.length - drawn);
          expect(source.prompts.map(({ prompt }) => prompt.kind)).toEqual(["chooseMode", "chooseCards"]);
          expect(source.prompts[1].prompt).toMatchObject({ min: drawn, max: drawn, candidates });
          expect(rest.state.sides.player.hand).toEqual(chosen);
          expect(chosen.map((id) => rest.state.instances[id].status.ephemeral)).toEqual(chosen.map(() => mode === 1));
          expect(events.filter((item) => item.kind === "lookedAtTop")).toEqual([{ kind: "lookedAtTop", side: "player", cards: candidates }]);
          expect(rest.state.sides.player.void).toContain(ids.player.deck[0]);
        } else {
          expect(source.prompts.map(({ prompt }) => prompt.kind)).toEqual(["chooseMode"]);
          expect(events.some((item) => item.kind === "lookedAtTop" || item.kind === "cardDrawn")).toBe(false);
          expect(rest.state.sides.player.deck).toEqual(ids.player.deck);
          expect(rest.state.sides.player.hand).toEqual([]);
          expect(rest.state.sides.player.void).toContain(ids.player.hand[0]);
        }
      }
    }
  });

  it("privately offers the top cards, draws the chosen ones in deck order as draws, and leaves the rest on top in their order", () => {
    const source = new LookAtTopSource(0, (candidates) => [candidates[2], candidates[0]]);
    const { start, ids, result } = play(board(lookThreeDrawTwo.id), source);
    const [{ prompt }] = source.prompts as { prompt: ChooseCardsPrompt }[];
    expect(source.prompts).toHaveLength(1);
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 2, max: 2, candidates: ids.player.deck.slice(0, 3) });
    expect(prompt.purpose.role).toBe("lookAtTop");
    const [d0, d1, d2, d3, d4] = ids.player.deck;
    const { state, events } = result;
    expect(state.sides.player.hand).toEqual([d0, d2]);
    expect(state.sides.player.deck).toEqual([d1, d3, d4]);
    expect([d0, d2].map((id) => state.instances[id].status.ephemeral)).toEqual([false, false]);
    // Each drawn card is a draw: counted, announced, and seen by "when you draw".
    expect(state.turnLog.drawn.player).toBe(start.turnLog.drawn.player + 2);
    expect(state.sides.player.score).toBe(2);
    const look = { kind: "lookedAtTop", side: "player", cards: [d0, d1, d2] } as const;
    expect(events.filter((item) => item.kind === "lookedAtTop" || item.kind === "cardDrawn")).toEqual([
      look, { kind: "cardDrawn", side: "player", instance: d0 }, { kind: "cardDrawn", side: "player", instance: d2 },
    ]);
    // The looker keeps knowing the card it left on top; the opponent sees only how many cards were looked at.
    expect(eventSeenBy(look, "player", state)).toEqual(look);
    expect(eventSeenBy(look, "enemy", state)).toEqual({ ...look, cards: [null, null, null] });
    expect(state.knownTo.player).toEqual([d1]);
    expect(state.knownTo.enemy).toEqual([]);
    // The opponent sees each draw as a count, never the card drawn.
    expect(events.filter((item) => item.kind === "cardDrawn").map((item) => eventSeenBy(item, "enemy", state))).toEqual([
      { kind: "cardDrawn", side: "player", instance: null },
      { kind: "cardDrawn", side: "player", instance: null },
    ]);
  });

  it("chooses the mode as the card is played, before the look: one card drawn, or two that gain ephemeral", () => {
    for (const [mode, drawn] of [[0, 1], [1, 2]] as const) {
      const source = new LookAtTopSource(mode, (candidates) => candidates.slice(candidates.length - drawn));
      const { ids, result } = play(board(DSL.lookAtTopDraw.id), source);
      expect(source.prompts.map(({ prompt }) => [prompt.kind, prompt.purpose.role])).toEqual([["chooseMode", "chooseOne"], ["chooseCards", "lookAtTop"]]);
      const [modePrompt, pick] = source.prompts;
      // The mode is chosen knowing none of the deck; the look then shows the top 4 cards.
      expect(modePrompt.known).toEqual([]);
      expect(pick.prompt).toMatchObject({ min: drawn, max: drawn, candidates: ids.player.deck.slice(0, 4) });
      const chosen = ids.player.deck.slice(4 - drawn, 4);
      expect(result.state.sides.player.hand).toEqual(chosen);
      expect(chosen.map((id) => result.state.instances[id].status.ephemeral)).toEqual(chosen.map(() => mode === 1));
      expect(result.state.sides.player.deck).toEqual([...ids.player.deck.slice(0, 4 - drawn), ids.player.deck[4]]);
    }
  });

  it("draws every card of a deck shorter than the draw without asking, and does nothing from an empty deck", () => {
    const short = play(board(DSL.lookAtTopDraw.id, [v.vanilla2.id]), new LookAtTopSource(1, () => []));
    expect(short.result.state.sides.player.hand).toEqual(short.ids.player.deck);
    expect(short.result.answers).toEqual([expect.objectContaining({ value: 1 }), expect.objectContaining({ auto: true })]);
    expect(short.result.state.sides.player.fatigueCount).toBe(0);
    const empty = play(board(DSL.lookAtTopDraw.id, []), new LookAtTopSource(1, () => []));
    expect(empty.result.answers).toHaveLength(1);
    expect(empty.result.state.sides.player.hand).toEqual([]);
    expect(empty.result.state.sides.player.fatigueCount).toBe(0);
    expect(empty.result.events.some((item) => item.kind === "lookedAtTop" || item.kind === "cardDrawn" || item.kind === "fatigue")).toBe(false);
  });

  it("commits nothing while the look is suspended, reloads to the same private prompt, bounces foreign, stale, and illegal answers, and resolves once", () => {
    const fold = createFoldAdapter(looking, { checkEventPrefix: true });
    const { state, ids } = boardState(looking.catalog, board(DSL.lookAtTopDraw.id));
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opening = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    const atMode = applied(opening);
    const modePrompt = fold.pending(atMode)!;
    expect(modePrompt.prompt).toMatchObject({ kind: "chooseMode", cancellable: true });
    const looked = fold.reduce(atMode, { kind: "answer", side: "player", promptId: modePrompt.prompt.id, value: 1 });
    const suspended = applied(looked);
    const top = ids.player.deck.slice(0, 4);
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(suspended.committed.sides.player.hand).toEqual([]);
    expect(suspended.committed.knownTo.player).toEqual([]);
    const committed = stateHash(suspended.committed);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(looking, { checkEventPrefix: true });
    const pending = fresh.pending(reloaded)!;
    expect(pending).toEqual(fold.pending(suspended));
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", privateTo: "player", cancellable: false, min: 2, max: 2, candidates: top });
    // Only the looker sees the cards it looks at.
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);
    expect(top.every((id) => identifies(pending.display, id, "player") && !identifies(pending.display, id, "enemy"))).toBe(true);

    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [top[1], top[3]] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...reloaded, attempt: reloaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    for (const value of [[], [top[0]], top.slice(0, 3), [top[0], ids.player.deck[4]], [top[0], top[0]], [top[0], ids.player.back[0]!]]) {
      expect(fresh.reduce(reloaded, { ...answer, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    }
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fresh.reduce(reloaded, { kind: "cancel", side: "player", promptId: pending.prompt.id })).toEqual({ kind: "bounced", reason: "notCancellable" });
    expect(stateHash(reloaded.committed)).toBe(committed);

    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (opening.kind !== "applied" || looked.kind !== "applied" || outcome.kind !== "applied") throw new Error("expected applied intents");
    const published = [...opening.published, ...looked.published, ...outcome.published];
    expect(published.filter((item) => item.kind === "lookedAtTop")).toHaveLength(1);
    expect(outcome.published.filter((item) => item.kind === "cardDrawn")).toHaveLength(2);
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([top[1], top[3]]);
    expect([top[1], top[3]].every((id) => done.committed.instances[id].status.ephemeral)).toBe(true);
    expect(done.committed.sides.player.deck).toEqual([top[0], top[2], ids.player.deck[4]]);
    expect(fresh.reduce(done, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it("keeps only the published look's private knowledge, leaving the draw count untouched and publishing nothing more, when the step fails after the answer is accepted", () => {
    const fold = createFoldAdapter(looking, { checkEventPrefix: true });
    const { state, ids } = boardState(looking.catalog, { ...board(lookThenFail.id), enemy: { deck, hand: [v.vanilla1.id, v.vanilla2.id] } });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    const top = ids.player.deck.slice(0, 4);
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", candidates: top });
    const outcome = fold.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.deck[2]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its look/);
    expect(outcome.published).toEqual([]);
    // The looker keeps knowing the top 4 cards where they still sit. The look at the opponent's hand after the
    // answer was never published, so it is forgotten with the rest of the step.
    expect(outcome.slice.committed).toEqual(knowing(suspended.committed, "player", top));
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(view(outcome.slice.committed, "player", looking.catalog).sides.player.deck.known).toEqual(top.map((id, index) => ({ id, index })));
    expect(view(outcome.slice.committed, "player", looking.catalog).sides.enemy.hand.known).toEqual([]);
    expect(view(outcome.slice.committed, "enemy", looking.catalog).sides.player.deck.known).toEqual([]);
    expect(outcome.slice.committed.turnLog.drawn.player).toBe(state.turnLog.drawn.player);
    expect(fold.pending(outcome.slice)).toBeNull();
  });

  it("has Greedy draw its most valuable looked-at cards", () => {
    const { state, ids } = boardState(looking.catalog, board(lookThreeDrawTwo.id));
    const [low, high, mid] = ids.player.deck;
    const value = new Map([[low, 0], [high, 3], [mid, 1]]);
    const prompt: ChooseCardsPrompt = {
      kind: "chooseCards", side: "player", privateTo: "player", cancellable: false, candidates: [low, high, mid], min: 2, max: 2,
      purpose: { source: ids.player.hand[0], cardId: lookThreeDrawTwo.id, ability: 0, role: "lookAtTop" },
    };
    // The looked-at cards are the chooser's own: a hostile-target heuristic would draw the least valuable.
    expect(greedyAnswer(prompt, (id) => ({ mine: true, value: value.get(id) ?? 0 }), noDiscoverCosts, state.automaticChoices)).toEqual([high, mid]);
  });
});
