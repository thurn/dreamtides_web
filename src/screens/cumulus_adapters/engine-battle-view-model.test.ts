import { describe, expect, it } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { createEngine, type Action, type BattleState, type InstanceId } from "../../engine";
import { createFoldAdapter } from "../../engine/fold/slice";
import { boardState, placeFigment, type BoardSetup } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { LOOP, LOOP_CARDS } from "../../engine/testing/loop-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { ZONE_FIGMENT, zoneCatalog } from "../../engine/testing/zone-cards";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { parseBattleCardId, parseBattleId, parseBattleSlotViewId } from "../../types/identifiers";
import {
  buildEngineBattleScreenModel,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import {
  foreseeAnswer,
  pickerAnswer,
  targetAnswer,
  type PendingEnginePrompt,
} from "./engine-battle-prompt-view-model";

const engine = createEngine(zoneCatalog(LOOP_CARDS));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
const cards = createEngineCardModels({ definitions: [], cards: new Map(), figment: () => undefined });
const adapter = createFoldAdapter(engine);

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
function screenOf(state: BattleState, prompt: PendingEnginePrompt | null = null, display = state): EngineBattleScreenModel {
  const decision = engine.decision(state);
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: engine.view(display, "player"),
    legal: prompt === null && decision?.side === "player" ? engine.legalActions(state, "player") : [],
    prompt,
    playing: null,
    cards,
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
  });
}

/** Takes `action` through the fold and returns the screen at the prompt it suspends on. */
function screenAtPrompt(state: BattleState, action: Action) {
  const outcome = adapter.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 }, {
    kind: "battleAction",
    side: "player",
    action,
  });
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  const pending = adapter.pending(outcome.slice);
  if (pending === null) throw new Error("no prompt");
  return { model: screenOf(state, pending.prompt, pending.display), prompt: pending.prompt };
}

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
    const { state, ids } = board({
      player: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla3.id], energy: 1 },
    });
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
    expect(model.view.loopOffer).toBeNull();
  });

  it("names the open back-rank position a dropped character enters", () => {
    const { state, ids } = board({
      player: { hand: [SYNTHETIC.vanilla1.id, DSL.drawTwo.id], energy: 5 },
    });
    const model = screenOf(state);
    const [character, event] = ids.player.hand.map(id);

    expect(handPlayAction(model, "player", character, slot("back", "B4"))).toEqual({
      kind: "play",
      card: ids.player.hand[0],
      from: "hand",
      slot: { rank: "back", index: 4 },
    });
    expect(handPlayAction(model, "player", character, { ...slot("back", "B4"), owner: "enemy" })).toEqual({
      kind: "play",
      card: ids.player.hand[0],
      from: "hand",
    });
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

    expect(targetsOf(exhausted).some((slotId) => slotId.startsWith("F"))).toBe(false);
    expect(targetsOf(ready)).toContain("F0");
    expect(repositionForDrop(model, id(exhausted), slot("front", "F0"))).toBeNull();
    expect(repositionForDrop(model, id(ready), slot("front", "F0"))).toEqual({
      kind: "reposition",
      card: ready,
      to: { rank: "front", index: 0 },
    });
    expect(model.affordances.allForward).toEqual([
      { kind: "reposition", card: ready, to: { rank: "front", index: 0 } },
      { kind: "reposition", card: readyToo, to: { rank: "front", index: 2 } },
    ]);
    expect(model.affordances.allBack).toEqual([
      { kind: "reposition", card: ids.player.front[1], to: { rank: "back", index: 3 } },
    ]);
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

  it("maps a single play-time target onto the board and answers only legal targets", () => {
    const { state, ids } = board({
      player: { hand: [DSL.dissolveEnemy.id], back: [SYNTHETIC.vanilla1.id], energy: 2 },
      enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
    });
    const play = engine.legalActions(state, "player").find((action) => action.kind === "play");
    if (play === undefined) throw new Error("no play");
    const { model, prompt } = screenAtPrompt(state, play);

    expect(model.prompt.kind).toBe("targets");
    expect(model.prompt.kind === "targets" ? model.prompt.targetIds : []).toEqual(ids.enemy.back.map(id));
    expect(model.view.promptBanner).toMatchObject({ key: prompt.id, cancellable: true });
    expect(model.affordances.canAct).toBe(false);
    expect(targetAnswer(prompt, model.engine, id(ids.player.back[0]))).toBeNull();
    expect(targetAnswer(prompt, model.engine, id(ids.enemy.back[0]))).toEqual([ids.enemy.back[0]]);
  });

  it("shows the opponent's prompts only as a waiting notice", () => {
    const { state } = board({
      player: { hand: [DSL.dissolveEnemy.id], energy: 2 },
      enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
    });
    const play = engine.legalActions(state, "player").find((action) => action.kind === "play");
    if (play === undefined) throw new Error("no play");
    const { prompt } = screenAtPrompt(state, play);
    const model = screenOf(state, { ...prompt, side: "enemy" });

    expect(model.prompt).toEqual({ kind: "waiting", side: "enemy" });
    expect(model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-choosing" });
    expect(model.view.promptBanner).toBeNull();
    expect(model.view.cardPicker).toBeNull();
  });

  it("maps modes and you-mays onto choice buttons, each with its answer", () => {
    const { state } = board({
      player: { hand: [DSL.chooseDrawOrPoints.id, DSL.mayDrawTwo.id], energy: 2 },
    });
    const [modal, optional] = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    if (modal === undefined || optional === undefined) throw new Error("no plays");
    const modes = screenAtPrompt(state, modal).model;
    const confirm = screenAtPrompt(state, optional).model;

    expect(modes.prompt.kind === "choice" ? modes.prompt.answers : null).toEqual([0, 1]);
    expect(modes.view.choicePrompt?.options).toHaveLength(2);
    expect(confirm.prompt.kind === "choice" ? confirm.prompt.answers : null).toEqual([true, false]);
  });

  it("maps a multiple-target prompt onto the card picker and a foresee onto the Foresee editor", () => {
    const { state, ids } = board({
      player: {
        hand: [DSL.pumpPermanently.id, DSL.foreseeTwo.id],
        back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id],
        energy: 2,
      },
    });
    const [pump, foresee] = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    if (pump === undefined || foresee === undefined) throw new Error("no plays");
    const picker = screenAtPrompt(state, pump);
    const editor = screenAtPrompt(state, foresee);
    const [first, second] = ids.player.back.map(id);

    expect(picker.model.view.cardPicker).toMatchObject({ count: 2, presentation: "board" });
    expect(pickerAnswer(picker.prompt, picker.model.engine, [first, second])).toEqual(ids.player.back);
    expect(editor.model.prompt.kind).toBe("foresee");
    const looked = editor.model.prompt.kind === "foresee" ? editor.model.prompt.model.cards : [];
    expect(looked).toHaveLength(2);
    const [top, bottom] = looked.map((card) => card.battleCardId);
    expect(
      foreseeAnswer(editor.prompt, editor.model.engine, {
        viewedCardIds: [top, bottom],
        orderedCardIds: [bottom],
        voidCardIds: [top],
      }),
    ).toEqual([
      { card: bottom, to: "top" },
      { card: top, to: "void" },
    ]);
  });

  it("offers the loop on offer with the iteration cap", () => {
    const { state, ids } = board({ player: { back: [LOOP.freePoints.id] } });
    const source = ids.player.back[0];
    if (source == null) throw new Error("missing source");
    const once = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    const model = screenOf(once);

    expect(model.affordances.loop?.loop).toBe(once.loops.candidate?.id);
    expect(model.view.loopOffer).toEqual({ maxCount: once.config.loopIterationCap });
  });

  it("shows hidden cards only as positions", () => {
    const { state, ids } = board({ enemy: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id] } });
    const model = screenOf(state);
    const hidden = new Set<string>([...ids.enemy.hand, ...ids.enemy.deck, ...ids.player.deck]);

    expect(model.view.farHand.cardIds).toHaveLength(2);
    expect(model.view.far.deckCardIds).toHaveLength(deck.length);
    expect(
      [...model.view.farHand.cardIds, ...model.view.far.deckCardIds, ...model.view.near.deckCardIds].filter((cardId) =>
        hidden.has(cardId),
      ),
    ).toEqual([]);
    expect(model.view.farHand.cards).toEqual([]);
  });

  it("reports the battle's result from the human's side", () => {
    const { state } = board({});
    state.sides.player.score = 4;
    state.result = { kind: "victory", winner: "player", reason: "score" };
    const won = screenOf(state);
    state.result = { kind: "victory", winner: "enemy", reason: "score" };
    const lost = screenOf(state);

    expect(won.view.result).toMatchObject({ outcome: "victory", playerScore: 4, essenceReward: 100 });
    expect(lost.view.result).toEqual({ outcome: "defeat", dismissed: false });
    expect(won.affordances.canAct).toBe(false);
  });
});
