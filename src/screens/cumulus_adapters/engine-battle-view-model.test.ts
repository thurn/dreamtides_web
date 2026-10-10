// The battle screen model over the engine: affordances from the human's
// legal actions, prompt surfaces and their answers, and what the human may
// see. Presentation and the battle log are in engine-battle-presentation.test.ts.
import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type Action, type BattleState, type InstanceId } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { boardState, placeFigment, type BoardSetup } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { LOOP, LOOP_CARDS } from "../../engine/testing/loop-cards";
import { LAB, PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabBattle, promptLabFixture } from "../../engine/testing/prompt-lab";
import { CONTINUOUS } from "../../engine/testing/continuous-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { ZONE_FIGMENT, zoneCatalog } from "../../engine/testing/zone-cards";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { NO_DECK_MODS, type DeckMods } from "../../engine/dsl/types";
import type { BattleDeckCardDefinition } from "../../battle/types";
import { parseCardName, parseCardSubtype, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { CardKeywordModification } from "../../types/journey";
import { firstLegalAnswer, isLegalAnswer } from "../../engine/prompts/answers";
import type { Answer } from "../../engine/prompts/types";
import { parseBattleCardId, parseBattleId, parseBattleSlotViewId } from "../../types/identifiers";
import {
  buildEngineBattleScreenModel,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  withChooser,
  type EngineBattleAffordances,
  type EngineBattleScreenModel,
  type EngineChooser,
} from "./engine-battle-view-model";
import { surfaceChoices, type PendingEnginePrompt, type PromptSurface } from "./prompt-host-view-model";

const engine = createEngine(zoneCatalog([...LOOP_CARDS, ...Object.values(LAB)]));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });
const adapter = createFoldAdapter(engine);
const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);

function board(setup: Partial<BoardSetup>) {
  return boardState(engine.catalog, {
    active: "player",
    phase: "day",
    ...setup,
    player: { deck, ...setup.player },
    enemy: { deck, ...setup.enemy },
  });
}

/** The screen model of a committed state, with the human's legal actions when it owns the decision. */
function screenOf(state: BattleState, prompt: PendingEnginePrompt | null = null, display = state, presented = true, on = engine) {
  const decision = on.decision(state);
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: on.view(display, "player"),
    legal: prompt === null && decision?.side === "player" ? on.legalActions(state, "player") : [],
    prompt,
    playing: null,
    decision: prompt === null ? decision : null,
    presented,
    notice: null,
    cards,
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
  });
}

/** Takes `action` through the fold and returns the screen at the prompt it suspends on. */
function screenAtPrompt(state: BattleState, action: Action, presented = true) {
  const slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const outcome = adapter.reduce(slice, { kind: "battleAction", side: "player", action });
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  const pending = adapter.pending(outcome.slice);
  if (pending === null) throw new Error("no prompt");
  return { model: screenOf(state, pending.prompt, pending.display, presented), prompt: pending.prompt };
}

/** The committed slice of a prompt-lab fixture's battle. */
function labSlice(name: string): BattleSlice {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  return promptLabBattle(engine, fixture).slice;
}

/** The screen of a prompt-lab fixture's battle, at its pending prompt or decision. */
function labScreen(name: string, presented = true) {
  const slice = labSlice(name);
  const pending = adapter.pending(slice);
  const model = screenOf(slice.committed, pending?.prompt ?? null, pending?.display ?? slice.committed, presented);
  return { prompt: pending?.prompt ?? null, model };
}

/** The screen at the prompt of a lab fixture whose one hand card is the card it plays. */
function labPlay(name: string) {
  const { committed } = labSlice(name);
  const play = engine.legalActions(committed, "player").find((action) => action.kind === "play");
  if (play === undefined) throw new Error(`no play in ${name}`);
  return screenAtPrompt(committed, play);
}

/** The model's prompt surface, which must be of `kind`. */
function surfaceOf<K extends PromptSurface["kind"]>(model: EngineBattleScreenModel, kind: K): Extract<PromptSurface, { kind: K }> {
  const { surface } = model.prompt;
  if (surface.kind !== kind) throw new Error(`a ${surface.kind} surface, not ${kind}`);
  return surface as Extract<PromptSurface, { kind: K }>;
}
/** What each choice button of the model's surface selects. */
const selections = (model: EngineBattleScreenModel) =>
  (surfaceChoices(model.prompt.surface)?.options ?? []).map((option) => option.select);
/** The answer each choice button of the model's surface gives. */
const choiceAnswers = (model: EngineBattleScreenModel) =>
  selections(model).map((select) => (select.kind === "answer" ? select.answer : null));

const id = (instance: InstanceId | null | undefined) => {
  if (instance == null) throw new Error("missing instance");
  return parseBattleCardId(instance);
};
const outlined = (model: EngineBattleScreenModel) =>
  model.view.playerHand.filter((card) => card.showPlayableOutline).map((card) => card.id);
const slot = (rank: "back" | "front", position: string) =>
  ({ owner: "player", rank, slotId: parseBattleSlotViewId(position) }) as const;

describe("buildEngineBattleScreenModel", () => {
  it("outlines exactly the hand cards with a legal play and offers the pass", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla3.id], energy: 1 } });
    const model = screenOf(state);

    expect(model.affordances.canAct).toBe(true);
    expect(model.affordances.pass).toEqual({ kind: "pass" });
    expect(outlined(model)).toEqual([id(ids.player.hand[0])]);
    expect([...model.affordances.plays.keys()]).toEqual([id(ids.player.hand[0])]);
    expect(handPlayAction(model, "player", id(ids.player.hand[1]))).toBeNull();
  });

  it("offers no action, outline, or shortcut while the opponent owns the decision", () => {
    const { state } = board({
      active: "enemy",
      player: { hand: [SYNTHETIC.vanilla1.id], back: [SYNTHETIC.vanilla1.id], energy: 5 },
    });
    const model = screenOf(state);

    expect(model.affordances.canAct).toBe(false);
    expect(model.affordances.pass).toBeNull();
    expect(outlined(model)).toEqual([]);
    expect(model.view.rankShortcuts).toBeNull();
    expect(model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
  });

  it("names the open back-rank position a dropped character enters", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id, DSL.drawTwo.id], energy: 5 } });
    const model = screenOf(state);
    const [character, event] = ids.player.hand.map(id);
    const played = { kind: "play", card: ids.player.hand[0], from: "hand" };

    expect(handPlayAction(model, "player", character, slot("back", "B4"))).toEqual({ ...played, slot: { rank: "back", index: 4 } });
    expect(handPlayAction(model, "player", character, { ...slot("back", "B4"), owner: "enemy" })).toEqual(played);
    expect(handPlayAction(model, "player", event, slot("back", "B4"))?.slot).toBeUndefined();
  });

  it("repositions only to legal destinations and plans All Forward and All Back", () => {
    const { state, ids } = board({
      player: {
        back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id],
        front: [null, SYNTHETIC.vanilla5.id],
      },
    });
    const [ready, exhausted, readyToo] = ids.player.back;
    if (exhausted == null) throw new Error("missing card");
    state.instances[exhausted].status.exhausted = true;
    const model = screenOf(state);
    const targetsOf = (instance: InstanceId | null) =>
      (model.affordances.repositions.get(id(instance)) ?? []).map((move) => `${move.target.slotId}`);
    const move = (card: InstanceId | null, rank: "back" | "front", index: number) => ({ kind: "reposition", card, to: { rank, index } });

    expect(targetsOf(exhausted).some((slotId) => slotId.startsWith("F"))).toBe(false);
    expect(targetsOf(ready)).toContain("F0");
    expect(repositionForDrop(model, id(exhausted), slot("front", "F0"))).toBeNull();
    expect(repositionForDrop(model, id(ready), slot("front", "F0"))).toEqual(move(ready, "front", 0));
    expect(model.affordances.allForward).toEqual([move(ready, "front", 0), move(readyToo, "front", 2)]);
    expect(model.affordances.allBack).toEqual([move(ids.player.front[1], "back", 3)]);
    expect(model.view.rankShortcuts).toEqual({ allForward: true, allBack: true });
  });

  it("marks figment merges, blocks a merge across exhaustion, and asks for confirmation where told", () => {
    const { state } = board({});
    const warrior = { kind: "figment" as const, figment: ZONE_FIGMENT.warrior.id, spark: 1 };
    const source = placeFigment(state, "player", { rank: "back", index: 0 }, warrior);
    const same = placeFigment(state, "player", { rank: "back", index: 1 }, warrior);
    const tired = placeFigment(state, "player", { rank: "back", index: 2 }, warrior);
    placeFigment(state, "player", { rank: "back", index: 3 }, { ...warrior, figment: ZONE_FIGMENT.ethereal.id });
    state.instances[tired].status.exhausted = true;
    const model = screenOf(state);
    const targets = figmentMergeTargets(model, "player", id(source), (figment) => figment.id === source);

    expect(targets.map((target) => [target.destinationBattleCardId, target.status, target.requiresConfirmation])).toEqual([
      [id(same), "eligible", true],
      [id(tired), "blocked-exhaustion", false],
    ]);
    expect(figmentMergeTargets(model, "player", id(source), () => false)[0]?.addedSpark).toBe(1);
  });

  it("maps play-time targets onto the board, answering only legal targets, with Skip only beside an up-to-one prompt", () => {
    const { state, ids } = board({
      player: { hand: [DSL.dissolveEnemy.id], back: [SYNTHETIC.vanilla1.id], energy: 2 },
      enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
    });
    const play = engine.legalActions(state, "player").find((action) => action.kind === "play");
    if (play === undefined) throw new Error("no play");
    const { model, prompt } = screenAtPrompt(state, play);
    const targets = surfaceOf(model, "targets");
    const upToOne = labPlay("up-to-one-target");

    expect(targets.ids).toEqual(ids.enemy.back.map(id));
    expect(model.view.promptHost).toMatchObject({ key: prompt.id, cancellable: true });
    expect(model.view.cardPicker).toBeNull();
    expect(model.view.choicePrompt).toBeNull();
    expect(targets.skip).toBeNull();
    expect(model.affordances.canAct).toBe(false);
    expect(targets.answer(id(ids.player.back[0]))).toBeNull();
    expect(targets.answer(id(ids.enemy.back[0]))).toEqual([ids.enemy.back[0]]);
    expect(upToOne.prompt).toMatchObject({ kind: "chooseTargets", min: 0, max: 1 });
    expect(upToOne.model.view.choicePrompt).toMatchObject({ key: upToOne.prompt.id, canResolve: true });
    expect(choiceAnswers(upToOne.model)).toEqual([[]]);
  });

  it("arranges among the top, the bottom, and the hand, cancellable while the play is", () => {
    const { model, prompt } = labPlay("arrange");
    const arrange = model.view.promptHost?.arrange;
    if (prompt.kind !== "arrange" || arrange?.surface !== "arrangement") throw new Error("not the arrangement editor");
    const [first, second] = prompt.cards.map(id);
    const { lanes } = arrange.model;
    const { answer } = surfaceOf(model, "arrange");
    const viewedCardIds = [first, second];
    const split = answer({ viewedCardIds, orderedCardIds: [], bottomCardIds: [first], voidCardIds: [], handCardIds: [second] });

    expect(model.view.promptHost).toMatchObject({ key: prompt.id, cancellable: true, heading: null });
    expect(lanes.map((lane) => [lane.destination, lane.min, lane.max, lane.ordered])).toEqual([
      ["top", 0, 1, true],
      ["bottom", 0, 1, true],
      ["hand", 1, 1, false],
    ]);
    expect(split).toEqual([
      { card: prompt.cards[0], to: "bottom" },
      { card: prompt.cards[1], to: "hand" },
    ]);
    expect(isLegalAnswer(prompt, split!)).toBe(true);
    expect(answer({ viewedCardIds, orderedCardIds: [first, second], voidCardIds: [] })).toBeNull();
  });

  it("holds a prompt back until the events before it are presented", () => {
    const { state, ids } = board({ player: { hand: [LAB.drawTwoThenDiscard.id, SYNTHETIC.vanilla1.id], energy: 1 } });
    const play: Action = { kind: "play", card: ids.player.hand[0], from: "hand" };
    const waiting = screenAtPrompt(state, play, false);
    const ready = screenAtPrompt(state, play, true);

    expect(waiting.model.view.cardPicker).toBeNull();
    expect(waiting.model.view.promptHost?.heading ?? null).toBeNull();
    expect(ready.model.view.cardPicker?.key).toBe(ready.prompt.id);
    expect(ready.model.view.promptHost?.heading).not.toBeNull();
  });

  it("shows the opponent's prompts only as a waiting notice: acting, or choosing when private", () => {
    const discard = labScreen("ai-discard");
    const foresee = labScreen("ai-foresee");

    expect(discard.model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
    expect(foresee.model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-choosing" });
    expect(labScreen("ai-discard", false).model.view.revealedHandCard).toBeNull();
    for (const { model } of [discard, foresee]) {
      expect(model.view.promptHost?.heading ?? null).toBeNull();
      expect(model.view.cardPicker).toBeNull();
      expect(model.view.promptHost?.arrange ?? null).toBeNull();
    }
    const foreseen = foresee.prompt?.kind === "arrange" ? foresee.prompt.cards : [];
    expect(foreseen.filter((card) => card in foresee.model.engine.instances)).toEqual([]);
  });

  it("maps modes, you-mays, pay-or-declines, and X onto their surfaces, each with its answer", () => {
    const { state } = board({ player: { hand: [DSL.chooseDrawOrPoints.id, DSL.mayDrawTwo.id, DSL.pointsTimesX.id], energy: 3 } });
    const [modal, optional, xCost] = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    if (modal === undefined || optional === undefined || xCost === undefined) throw new Error("no plays");
    const modes = screenAtPrompt(state, modal).model;
    const confirm = screenAtPrompt(state, optional).model;
    const number = screenAtPrompt(state, xCost);
    const prevent = labScreen("prevent").model;

    expect(choiceAnswers(modes)).toEqual([0, 1]);
    expect(modes.view.choicePrompt?.options).toHaveLength(2);
    expect(choiceAnswers(confirm)).toEqual([true, false]);
    expect(choiceAnswers(prevent)).toEqual([true, false]);
    expect(number.model.view.promptHost?.number?.values).toEqual([1, 2, 3]);
    expect(surfaceOf(number.model, "number").answer(2)).toBe(2);
    expect(surfaceOf(number.model, "number").answer(4)).toBeNull();
  });

  it("maps targets to the card picker between their bounds and a foresee onto the Foresee editor", () => {
    const { state, ids } = board({
      player: { hand: [DSL.pumpPermanently.id, DSL.foreseeTwo.id], back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 2 },
    });
    const [pump, foresee] = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    if (pump === undefined || foresee === undefined) throw new Error("no plays");
    const picker = screenAtPrompt(state, pump);
    const editor = screenAtPrompt(state, foresee);
    const [first, second] = ids.player.back.map(id);

    expect(picker.model.view.cardPicker).toMatchObject({ count: 2, minCount: 0, optional: true, presentation: "board" });
    const pick = surfaceOf(picker.model, "picker").answer;
    expect(pick([first, second])).toEqual(ids.player.back);
    expect(pick([first])).toEqual([ids.player.back[0]]);
    expect(pick([first, first])).toBeNull();
    const surface = editor.model.view.promptHost?.arrange;
    expect(surface?.surface).toBe("foresee");
    expect(editor.model.view.promptHost?.cancellable).toBe(false);
    const looked = surface?.surface === "foresee" ? surface.model.cards : [];
    expect(looked).toHaveLength(2);
    const [top, bottom] = looked.map((card) => card.battleCardId);
    expect(surfaceOf(editor.model, "arrange").answer({ viewedCardIds: [top, bottom], orderedCardIds: [bottom], voidCardIds: [top] })).toEqual([
      { card: bottom, to: "top" },
      { card: top, to: "void" },
    ]);
  });

  it("opens the response window with the opponent's card and Pass once presented, and never for the opponent's response", () => {
    const respond = labScreen("respond").model;
    const unpresented = labScreen("respond", false).model;
    const stacked = respond.engine.stack[0];
    const { state, ids } = board({
      player: { hand: [DSL.drawTwo.id], energy: 2 },
      enemy: { hand: [SYNTHETIC.interruptEvent.id], energy: 2 },
    });
    const played = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    const theirs = screenOf(played);

    expect(respond.view.promptHost).toMatchObject({ cancellable: false });
    expect(respond.view.promptHost?.heading).not.toBeNull();
    expect(respond.view.revealedHandCard?.id).toBe(id(stacked?.kind === "card" ? stacked.instance : null));
    expect(respond.affordances.pass).toEqual({ kind: "pass" });
    expect(unpresented.view.promptHost?.heading ?? null).toBeNull();
    expect(unpresented.view.revealedHandCard).toBeNull();
    expect(engine.decision(played)).toEqual({ kind: "respond", side: "enemy" });
    expect(theirs.view.revealedHandCard).toBeNull();
    expect(theirs.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
  });

  it("offers Reclaim plays and Avatar and Dreamsign activations from their choosers", () => {
    const { model } = labScreen("reclaim");
    const chooser = (opened: EngineChooser | null) => withChooser(model, opened, cards, () => null);
    const actions = (offered: Iterable<Action>) => [...offered].map((action) => ({ kind: "action", action }));

    expect(model.affordances.voidPlays.size).toBe(1);
    const emblems = model.affordances.emblemActivations.map((action) => (typeof action.source === "string" ? null : action.source.kind));
    expect(emblems).toEqual(["avatar", "dreamsign"]);
    expect(chooser(null)).toBe(model);
    expect(selections(chooser({ kind: "void" }))).toEqual([...actions(model.affordances.voidPlays.values()), { kind: "browseVoid" }, { kind: "close" }]);
    expect(selections(chooser({ kind: "emblems" }))).toEqual([...actions(model.affordances.emblemActivations), { kind: "close" }]);
  });

  it("offers paying to end an effect on each character it changes, from the status display when it changes none, and only while affordable", () => {
    const state = labSlice("pay-to-end").committed;
    const [effect] = state.payable;
    if (effect === undefined) throw new Error("no payable effect");
    const action: Action = { kind: "payToEnd", effect: effect.id };
    const affected = effect.affects.map(id);
    const model = screenOf(state);
    const poor = structuredClone(state);
    poor.sides.player.currentEnergy = effect.cost - 1;
    const unattached = structuredClone(state);
    unattached.payable = [{ ...effect, affects: [] }];
    /** Each affected near character's outline and whether its payable badge (which it must show) is actionable. */
    const shown = (screen: EngineBattleScreenModel) =>
      screen.view.near.backRank.flatMap(({ card }) => {
        if (card === null || !affected.includes(card.id)) return [];
        const badge = card.statuses?.find((status) => status.kind === "payable");
        return [[card.showPlayableOutline, badge === undefined ? "no badge" : badge.actionable === true]];
      });

    expect([...model.affordances.payToEnd.keys()].sort()).toEqual([...affected].sort());
    expect([...model.affordances.payToEnd.values()]).toEqual(affected.map(() => [action]));
    expect(model.affordances.statusPayToEnd).toEqual([]);
    expect(shown(model)).toEqual(affected.map(() => [true, true]));
    expect(selections(withChooser(model, { kind: "card", id: affected[0] }, cards, () => null))).toEqual([{ kind: "action", action }, { kind: "close" }]);
    expect(screenOf(poor).affordances.payToEnd.size).toBe(0);
    expect(shown(screenOf(poor))).toEqual(affected.map(() => [false, false]));
    expect(screenOf(unattached).affordances.statusPayToEnd).toEqual([action]);
    expect(screenOf(unattached).affordances.payToEnd.size).toBe(0);
  });

  it("offers the loop on offer with the iteration cap", () => {
    const { state, ids } = board({ player: { back: [LOOP.freePoints.id] } });
    const source = ids.player.back[0];
    if (source == null) throw new Error("missing source");
    const once = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    const model = screenOf(once);

    expect(model.affordances.loop?.loop).toBe(once.loops.candidate?.id);
    expect(model.view.promptHost?.loopOffer).toEqual({ maxCount: once.config.loopIterationCap });
  });

  it("shows hidden cards only as positions", () => {
    const { state, ids } = board({ enemy: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const model = screenOf(state);
    const hidden = new Set<string>([...ids.enemy.hand, ...ids.enemy.deck, ...ids.player.deck]);

    expect(model.view.farHand.cardIds).toHaveLength(2);
    expect(model.view.far.deckCardIds).toHaveLength(deck.length);
    const shown = [...model.view.farHand.cardIds, ...model.view.far.deckCardIds, ...model.view.near.deckCardIds];
    expect(shown.filter((cardId) => hidden.has(cardId))).toEqual([]);
    expect(model.view.farHand.cards).toEqual([]);
  });

  it("reports the battle's result from the human's side", () => {
    const { state } = board({});
    state.sides.player.score = 4;
    // Two committed states: the engine never sees a state change after it is handed one.
    const won = screenOf({ ...state, result: { kind: "victory", winner: "player", reason: "score" } });
    const lost = screenOf({ ...state, result: { kind: "victory", winner: "enemy", reason: "score" } });

    expect(won.view.result).toMatchObject({ outcome: "victory", playerScore: 4, essenceReward: 100 });
    expect(lost.view.result).toEqual({ outcome: "defeat", dismissed: false });
    expect(won.affordances.canAct).toBe(false);
  });
});

describe("engine card models", () => {
  /** A dealt definition of `cardId`: a deck entry's display, its keyword changes applied. */
  function dealt(cardId: CardId, keywordModification: CardKeywordModification | null, renderedText: string): BattleDeckCardDefinition {
    return {
      sourceDeckEntryId: null,
      cardId,
      cardNumber: 1,
      name: parseCardName("Fixture Card"),
      battleCardKind: "character",
      subtype: parseCardSubtype("Fixture"),
      energyCost: 2,
      printedEnergyCost: 2,
      printedSpark: 1,
      isFast: keywordModification?.fast === true,
      timing: keywordModification?.fast === true ? "fast" : "standard",
      reclaimCost: keywordModification?.reclaim ?? null,
      renderedText,
      imageNumber: 0,
      transfiguration: null,
      ...(keywordModification === null ? {} : { keywordModification }),
      isBane: false,
    };
  }

  it("shows each copy of a card with its own deck-entry modifications", () => {
    const cardId = SYNTHETIC.vanilla1.id;
    const plain = dealt(cardId, null, "plain copy");
    const reclaim = dealt(cardId, { reclaim: 2 }, "reclaim copy");
    const fast = dealt(cardId, { fast: true }, "fast copy");
    const mods = (change: Partial<DeckMods>): DeckMods => ({ ...NO_DECK_MODS, ...change });
    const { state, ids } = board({
      player: {
        hand: [cardId, { cardId, deckMods: mods({ reclaim: 2 }) }, { cardId, deckMods: mods({ fast: true, sparkBonus: 1 }) }],
      },
    });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({ definitions: [plain, reclaim, fast], cards: new Map(), figment: () => undefined });
    const shown = ids.player.hand.map((instance) => {
      const model = models(view.instances[instance]);
      return [model.displaySnapshot.renderedText, model.displaySnapshot.isFast, model.displaySnapshot.reclaimCost];
    });

    expect(shown).toEqual([plain, reclaim, fast].map((definition) => [definition.renderedText, definition.isFast, definition.reclaimCost]));
  });

  it("shows the catalog card for a copy in a variant no deck entry dealt", () => {
    const cardId = SYNTHETIC.vanilla1.id;
    const reclaim = dealt(cardId, { reclaim: 2 }, "reclaim copy");
    const printed: CardData = {
      name: parseCardName("Fixture Card"),
      id: cardId,
      cardNumber: 1,
      cardType: "Character",
      subtype: parseCardSubtype("Fixture"),
      isStarter: false,
      energyCost: 2,
      spark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "printed card",
      imageNumber: 0,
      artOwned: false,
    };
    const { state, ids } = board({ player: { hand: [cardId] } });
    const models = createEngineCardModels({ definitions: [reclaim], cards: new Map([[cardId, printed]]), figment: () => undefined });
    const shown = models(engine.view(state, "player").instances[ids.player.hand[0]]).displaySnapshot;

    expect([shown.renderedText, shown.reclaimCost]).toEqual([printed.renderedText, null]);
  });

  /** A dealt multi-cost event ("1 X") of `cardId`, its deck entry's cost reduction applied to its orbs. */
  function dealtMultiCost(cardId: CardId, energyCostReduction: number): BattleDeckCardDefinition {
    const modification = energyCostReduction === 0 ? null : { energyCostReduction };
    return {
      ...dealt(cardId, modification, "multi-cost copy"),
      battleCardKind: "event",
      energyCost: 1 - energyCostReduction,
      printedEnergyCost: 1,
      energyCosts: [String(1 - energyCostReduction), "X"],
    };
  }

  it("shows each multi-cost copy's orbs at its own deck-entry cost", () => {
    const cardId = DSL.fixedPlusXPoints.id;
    const { state, ids } = board({
      player: { hand: [cardId, { cardId, deckMods: { ...NO_DECK_MODS, costReduction: 1 } }] },
    });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({
      definitions: [dealtMultiCost(cardId, 0), dealtMultiCost(cardId, 1)],
      cards: new Map(),
      figment: () => undefined,
    });
    const orbs = ids.player.hand.map((instance) => models(view.instances[instance]).displaySnapshot.energyCosts);

    expect(orbs).toEqual([
      ["1", "X"],
      ["0", "X"],
    ]);
  });

  it("shows an in-battle cost change on multi-cost orbs and leaves single-cost cards orb-free", () => {
    const multiCost = DSL.fixedPlusXPoints.id;
    const singleCost = DSL.drawTwo.id;
    const { state, ids } = board({ player: { front: [CONTINUOUS.eventTax.id], hand: [multiCost, singleCost] } });
    const view = engine.view(state, "player");
    const models = createEngineCardModels({
      definitions: [dealtMultiCost(multiCost, 0)],
      cards: new Map(),
      figment: () => undefined,
    });
    const [taxedMulti, taxedSingle] = ids.player.hand.map((instance) => models(view.instances[instance]).displaySnapshot);

    expect(taxedMulti.energyCosts).toEqual(["2", "X"]);
    expect(taxedSingle.energyCosts).toBeUndefined();
    expect(taxedSingle.energyCost).toBe(view.instances[ids.player.hand[1]].characteristics.cost);
  });
});

describe("prompt surfaces over the prompt lab", () => {
  const labAdapter = createFoldAdapter(labEngine);
  /** The human's screen at a lab slice, at its pending prompt or decision. */
  const labSliceModel = (slice: BattleSlice) => {
    const pending = labAdapter.pending(slice);
    return screenOf(slice.committed, pending?.prompt ?? null, pending?.display ?? slice.committed, true, labEngine);
  };
  /** An answer the surface itself offers: its first legal target, card selection, option, value, or starting arrangement. */
  const surfaceAnswer = (model: EngineBattleScreenModel): Answer | null => {
    const { surface, host } = model.prompt;
    switch (surface.kind) {
      case "targets":
        return surface.ids.map((target) => surface.answer(target)).find((answer) => answer !== null) ?? null;
      case "picker": {
        const { candidateIds, count } = surface.picker;
        const sizes = Array.from({ length: count + 1 }, (_unused, size) => size);
        return sizes.map((size) => surface.answer(candidateIds.slice(0, size))).find((answer) => answer !== null) ?? null;
      }
      case "choice":
        return surface.options.flatMap((option) => (option.select.kind === "answer" ? [option.select.answer] : []))[0] ?? null;
      case "number": {
        const [value] = host?.number?.values ?? [];
        return value === undefined ? null : surface.answer(value);
      }
      case "arrange": {
        const arrange = host?.arrange;
        const viewedCardIds = arrange?.model.cards.map((card) => card.battleCardId) ?? [];
        if (arrange?.surface === "foresee") return surface.answer({ viewedCardIds, orderedCardIds: viewedCardIds, voidCardIds: [] });
        const lane = (to: string) => arrange?.model.lanes.find((entry) => entry.destination === to)?.cardIds ?? [];
        const [orderedCardIds, bottomCardIds, voidCardIds, handCardIds] = ["top", "bottom", "void", "hand"].map(lane);
        return surface.answer({ viewedCardIds, orderedCardIds, bottomCardIds, voidCardIds, handCardIds });
      }
      default:
        return null;
    }
  };
  const emptyAnswerControl = (surface: PromptSurface): boolean =>
    surface.kind === "targets" ? surface.skip !== null : surface.kind === "picker" ? surface.picker.optional : false;
  const offered = (affordances: EngineBattleAffordances): Action[] => [
    ...(affordances.pass === null ? [] : [affordances.pass]),
    ...affordances.plays.values(),
    ...affordances.voidPlays.values(),
    ...[...affordances.activations.values()].flat(),
    ...affordances.emblemActivations,
    ...[...affordances.repositions.values()].flat().map((move) => move.action),
    ...(affordances.loop === null ? [] : [{ kind: "repeatLoop" as const, loop: affordances.loop.loop, count: "untilVictory" as const }]),
    ...[...affordances.payToEnd.values()].flat(),
    ...affordances.statusPayToEnd,
  ];
  /**
   * Every human prompt and top-level decision a lab fixture reaches: its
   * own, each prompt after one of the human's legal actions, and each
   * prompt after a human answer the surface offers. The AI answers its own
   * prompts with their first legal answer.
   */
  const reached = () => {
    const prompts: { fixture: string; prompt: PendingEnginePrompt; model: EngineBattleScreenModel }[] = [];
    const decisions: { fixture: string; legal: readonly Action[]; model: EngineBattleScreenModel }[] = [];
    const visit = (fixture: string, slice: BattleSlice, depth: number): void => {
      const pending = labAdapter.pending(slice);
      if (pending !== null) {
        const value = pending.prompt.side === "player" ? null : firstLegalAnswer(pending.prompt);
        if (value === null) prompts.push({ fixture, prompt: pending.prompt, model: labSliceModel(slice) });
        const answer = value ?? surfaceAnswer(labSliceModel(slice));
        if (answer === null || depth > 3) return;
        const outcome = labAdapter.reduce(slice, { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value: answer });
        if (outcome.kind === "applied") visit(fixture, outcome.slice, depth + 1);
        return;
      }
      const decision = labEngine.decision(slice.committed);
      if (decision?.side !== "player" || depth > 0) return;
      const legal = labEngine.legalActions(slice.committed, "player");
      decisions.push({ fixture, legal, model: labSliceModel(slice) });
      for (const action of legal) {
        const outcome = labAdapter.reduce(slice, { kind: "battleAction", side: "player", action });
        if (outcome.kind === "applied") visit(fixture, outcome.slice, depth + 1);
      }
    };
    for (const fixture of PROMPT_LAB_FIXTURES) visit(fixture.name, promptLabBattle(labEngine, fixture).slice, 0);
    return { prompts, decisions };
  };
  let explored: ReturnType<typeof reached> | null = null;
  const explore = () => (explored ??= reached());

  it("offers a legal answer on every human prompt's surface, and an empty-answer control exactly when none is legal", () => {
    const { prompts } = explore();
    const kinds = new Set(prompts.map(({ model }) => model.prompt.surface.kind));
    expect(kinds).toEqual(new Set(["targets", "picker", "choice", "number", "arrange"]));
    for (const { fixture, prompt, model } of prompts) {
      const answer = surfaceAnswer(model);
      const where = `${fixture}: ${prompt.kind}`;
      expect(answer, where).not.toBeNull();
      expect(isLegalAnswer(prompt, answer!), where).toBe(true);
      expect(emptyAnswerControl(model.prompt.surface), where).toBe(isLegalAnswer(prompt, []));
    }
  });

  it("maps every legal action of the human's decision to an affordance", () => {
    const { decisions } = explore();
    expect(decisions.length).toBeGreaterThan(0);
    for (const { fixture, legal, model } of decisions) {
      const actions = offered(model.affordances);
      for (const action of legal) expect(actions, `${fixture}: ${action.kind}`).toContainEqual(action);
    }
  });
});
