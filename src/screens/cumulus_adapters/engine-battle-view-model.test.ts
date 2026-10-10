import { describe, expect, it, vi } from "vitest";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import {
  enqueuePresentation,
  EVENT_PRESENTATION,
  intentOfEvent,
  PresentationQueue,
  presentationItems,
  type PresentationItem,
} from "../../battle/components/battle-presentation";
import { createEngine, type Action, type BattleState, type InstanceId, type InstanceView } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { EVENT_DEFINITIONS } from "../../engine/events";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { boardState, placeFigment, type BoardSetup } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { LOOP, LOOP_CARDS } from "../../engine/testing/loop-cards";
import {
  LAB,
  PROMPT_LAB_DEFINITIONS,
  promptLabBattle,
  promptLabFixture,
  promptLabPresentation,
} from "../../engine/testing/prompt-lab";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { ZONE_FIGMENT, zoneCatalog } from "../../engine/testing/zone-cards";
import { NO_PROMPTS } from "../../engine/steps/sources";
import {
  parseBattleCardId,
  parseBattleId,
  parseBattleSlotViewId,
  parseDreamwellCardId,
  parsePresentationId as pid,
  parsePromptId,
} from "../../types/identifiers";
import { engineBattleLogText } from "../../runtime/battle-prompt-messages";
import { battleLogEntries, battleLogTurns } from "./engine-battle-log-view-model";
import {
  buildEngineBattleScreenModel,
  engineStatuses,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import {
  arrangeAnswer,
  numberAnswer,
  pickerAnswer,
  targetAnswer,
  type PendingEnginePrompt,
} from "./prompt-host-view-model";

const engine = createEngine(zoneCatalog([...LOOP_CARDS, ...Object.values(LAB)]));
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

const testDreamwellCardId = parseDreamwellCardId("00000000-0000-4000-8000-00000000d001");
const dreamwellModel = {
  cardId: testDreamwellCardId,
  displaySnapshot: { id: testDreamwellCardId, name: "Fixture Dreamwell", renderedText: "", energyAdded: 1, imageNumber: 1 },
};

/** The screen input of a committed state, with no prompt and no legal actions. */
function screenInput(state: BattleState): Parameters<typeof buildEngineBattleScreenModel>[0] {
  return {
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: engine.view(state, "player"),
    legal: [],
    prompt: null,
    playing: null,
    decision: null,
    presented: true,
    notice: null,
    cards,
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
  };
}

/** The screen model of a committed state, with the human's legal actions when it owns the decision. */
function screenOf(
  state: BattleState,
  prompt: PendingEnginePrompt | null = null,
  display = state,
  presented = true,
): EngineBattleScreenModel {
  const decision = engine.decision(state);
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-engine-fixture"),
    human: "player",
    view: engine.view(display, "player"),
    legal: prompt === null && decision?.side === "player" ? engine.legalActions(state, "player") : [],
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
  return {
    model: screenOf(state, pending.prompt, pending.display, presented),
    prompt: pending.prompt,
    slice: outcome.slice,
    published: outcome.published,
  };
}

/** The screen of a prompt-lab fixture's battle, at its pending prompt or decision. */
function labScreen(name: string, presented = true) {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  const { slice } = promptLabBattle(engine, fixture);
  const pending = adapter.pending(slice);
  return {
    slice,
    prompt: pending?.prompt ?? null,
    model: screenOf(slice.committed, pending?.prompt ?? null, pending?.display ?? slice.committed, presented),
  };
}

/** The screen at the prompt of a lab fixture whose one hand card is the card it plays. */
function labPlay(name: string) {
  const fixture = promptLabFixture(name);
  if (fixture === null) throw new Error(`no fixture ${name}`);
  const { slice } = promptLabBattle(engine, fixture);
  const play = engine.legalActions(slice.committed, "player").find((action) => action.kind === "play");
  if (play === undefined) throw new Error(`no play in ${name}`);
  return { ...screenAtPrompt(slice.committed, play), state: slice.committed };
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
    expect(model.view.promptHost?.loopOffer ?? null).toBeNull();
    expect(model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
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

    expect(model.prompt.targetIds).toEqual(ids.enemy.back.map(id));
    expect(model.view.promptHost).toMatchObject({ key: prompt.id, cancellable: true });
    expect(model.view.cardPicker).toBeNull();
    // Exactly one target: no empty answer, so no Skip.
    expect(model.view.choicePrompt).toBeNull();
    expect(model.prompt.choiceAnswers).toEqual([]);
    expect(model.affordances.canAct).toBe(false);
    expect(targetAnswer(prompt, model.engine, id(ids.player.back[0]))).toBeNull();
    expect(targetAnswer(prompt, model.engine, id(ids.enemy.back[0]))).toEqual([ids.enemy.back[0]]);
  });

  it("offers Skip beside the board targets of an up-to-one prompt, and the empty answer applies", () => {
    const { model, prompt, slice, state } = labPlay("up-to-one-target");
    const enemies = state.sides.enemy.backRank.filter((card): card is InstanceId => card !== null);

    expect(prompt).toMatchObject({ kind: "chooseTargets", min: 0, max: 1 });
    expect(model.prompt.targetIds).toEqual(enemies.map(id));
    expect(model.view.cardPicker).toBeNull();
    expect(model.view.choicePrompt).toMatchObject({ key: prompt.id, canResolve: true });
    expect(model.view.choicePrompt?.options).toHaveLength(1);
    expect(model.prompt.choiceAnswers).toEqual([[]]);
    const skipped = adapter.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value: model.prompt.choiceAnswers[0] });
    expect(skipped.kind).toBe("applied");
    expect(skipped.kind === "applied" ? adapter.pending(skipped.slice) : "bounced").toBeNull();
  });

  it("arranges among the top, the bottom, and the hand, starting legal and cancellable while the play is", () => {
    const { model, prompt, slice, state } = labPlay("arrange");
    if (prompt.kind !== "arrange") throw new Error("no arrangement");
    const arrange = model.view.promptHost?.arrange;
    if (arrange?.surface !== "arrangement") throw new Error("not the arrangement editor");
    const [first, second] = prompt.cards.map(id);
    const lanes = arrange.model.lanes;

    expect(model.view.promptHost).toMatchObject({ key: prompt.id, cancellable: true, heading: null });
    expect(lanes.map((lane) => [lane.destination, lane.min, lane.max, lane.ordered])).toEqual([
      ["top", 0, 1, true],
      ["bottom", 0, 1, true],
      ["hand", 1, 1, false],
    ]);
    const initial = arrangeAnswer(prompt, model.engine, {
      viewedCardIds: [first, second],
      orderedCardIds: lanes[0].cardIds,
      bottomCardIds: lanes[1].cardIds,
      voidCardIds: [],
      handCardIds: lanes[2].cardIds,
    });
    expect(initial).not.toBeNull();
    const answer = arrangeAnswer(prompt, model.engine, {
      viewedCardIds: [first, second],
      orderedCardIds: [],
      bottomCardIds: [first],
      voidCardIds: [],
      handCardIds: [second],
    });
    expect(answer).toEqual([
      { card: prompt.cards[0], to: "bottom" },
      { card: prompt.cards[1], to: "hand" },
    ]);
    expect(
      arrangeAnswer(prompt, model.engine, { viewedCardIds: [first, second], orderedCardIds: [first, second], voidCardIds: [] }),
    ).toBeNull();
    const applied = adapter.reduce(slice, { kind: "answer", side: "player", promptId: prompt.id, value: answer! });
    if (applied.kind !== "applied") throw new Error("bounced");
    const committed = applied.slice.committed.sides.player;
    expect(committed.hand).toContain(prompt.cards[1]);
    expect(committed.deck[committed.deck.length - 1]).toBe(prompt.cards[0]);
    const cancelled = adapter.reduce(slice, { kind: "cancel", side: "player", promptId: prompt.id });
    if (cancelled.kind !== "applied") throw new Error("bounced");
    expect(cancelled.slice.committed.sides.player.deck).toEqual(state.sides.player.deck);
  });

  it("holds a prompt back until the events before it are presented", () => {
    const { state, ids } = board({ player: { hand: [LAB.drawTwoThenDiscard.id, SYNTHETIC.vanilla1.id], energy: 1 } });
    const play: Action = { kind: "play", card: ids.player.hand[0], from: "hand" };
    const waiting = screenAtPrompt(state, play, false);
    const ready = screenAtPrompt(state, play, true);
    const drawn = presentationItems(waiting.published, "player", { key: pid("k"), state: waiting.slice.committed }, state, () => null);

    expect(drawn.length).toBeGreaterThanOrEqual(2);
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

  it("asks the human mid-AI-turn once the AI answers its own prompt", () => {
    const { slice, prompt } = labScreen("ai-discard");
    if (prompt?.kind !== "chooseCards") throw new Error("no AI discard");
    const answered = adapter.reduce(slice, { kind: "answer", side: "enemy", promptId: prompt.id, value: [prompt.candidates[0]] });
    if (answered.kind !== "applied") throw new Error("bounced");
    const pending = adapter.pending(answered.slice);
    if (pending === null) throw new Error("no human prompt");
    const model = screenOf(answered.slice.committed, pending.prompt, pending.display);

    expect(pending.prompt.side).toBe("player");
    expect(model.view.activeSide).toBe("enemy");
    expect(model.view.cardPicker).toMatchObject({ key: pending.prompt.id, count: 1, minCount: 1 });
  });

  it("maps modes, you-mays, pay-or-declines, and X onto their surfaces, each with its answer", () => {
    const { state } = board({
      player: { hand: [DSL.chooseDrawOrPoints.id, DSL.mayDrawTwo.id, DSL.pointsTimesX.id], energy: 3 },
    });
    const [modal, optional, xCost] = engine.legalActions(state, "player").filter((action) => action.kind === "play");
    if (modal === undefined || optional === undefined || xCost === undefined) throw new Error("no plays");
    const modes = screenAtPrompt(state, modal).model;
    const confirm = screenAtPrompt(state, optional).model;
    const number = screenAtPrompt(state, xCost);
    const prevent = labScreen("prevent").model;

    expect(modes.prompt.choiceAnswers).toEqual([0, 1]);
    expect(modes.view.choicePrompt?.options).toHaveLength(2);
    expect(confirm.prompt.choiceAnswers).toEqual([true, false]);
    expect(prevent.prompt.choiceAnswers).toEqual([true, false]);
    expect(number.model.view.promptHost?.number?.values).toEqual([1, 2, 3]);
    expect(numberAnswer(number.prompt, 2)).toBe(2);
    expect(numberAnswer(number.prompt, 4)).toBeNull();
  });

  it("maps targets to the card picker between their bounds and a foresee onto the Foresee editor", () => {
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

    expect(picker.model.view.cardPicker).toMatchObject({ count: 2, minCount: 0, optional: true, presentation: "board" });
    expect(pickerAnswer(picker.prompt, picker.model.engine, [first, second])).toEqual(ids.player.back);
    expect(pickerAnswer(picker.prompt, picker.model.engine, [first])).toEqual([ids.player.back[0]]);
    expect(pickerAnswer(picker.prompt, picker.model.engine, [first, first])).toBeNull();
    const surface = editor.model.view.promptHost?.arrange;
    expect(surface?.surface).toBe("foresee");
    expect(editor.model.view.promptHost?.cancellable).toBe(false);
    const looked = surface?.surface === "foresee" ? surface.model.cards : [];
    expect(looked).toHaveLength(2);
    const [top, bottom] = looked.map((card) => card.battleCardId);
    expect(
      arrangeAnswer(editor.prompt, editor.model.engine, {
        viewedCardIds: [top, bottom],
        orderedCardIds: [bottom],
        voidCardIds: [top],
      }),
    ).toEqual([
      { card: bottom, to: "top" },
      { card: top, to: "void" },
    ]);
  });

  it("opens the response window with the opponent's card and Pass, and no window without a response", () => {
    const respond = labScreen("respond").model;
    const { state } = board({ active: "enemy", enemy: { hand: [DSL.drawTwo.id], energy: 2 } });
    const play = engine.legalActions(state, "enemy").find((action) => action.kind === "play");
    if (play === undefined) throw new Error("no play");
    const after = engine.apply(state, "enemy", play, NO_PROMPTS).state;

    expect(respond.view.promptHost).toMatchObject({ cancellable: false });
    expect(respond.view.promptHost?.heading).not.toBeNull();
    expect(respond.view.revealedHandCard?.id).toBe(id(respond.engine.stack[0]?.kind === "card" ? respond.engine.stack[0].instance : null));
    expect(respond.affordances.pass).toEqual({ kind: "pass" });
    expect(engine.decision(after)?.kind).not.toBe("respond");
  });

  it("reveals the response window's card only once presented, and never for the opponent's response", () => {
    const unpresented = labScreen("respond", false).model;
    const { state, ids } = board({
      player: { hand: [DSL.drawTwo.id], energy: 2 },
      enemy: { hand: [SYNTHETIC.interruptEvent.id], energy: 2 },
    });
    const played = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO_PROMPTS).state;
    const theirs = screenOf(played);

    expect(unpresented.view.promptHost?.heading ?? null).toBeNull();
    expect(unpresented.view.revealedHandCard).toBeNull();
    expect(engine.decision(played)).toEqual({ kind: "respond", side: "enemy" });
    expect(played.stack).toHaveLength(1);
    expect(theirs.view.revealedHandCard).toBeNull();
    expect(theirs.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
  });

  it("offers Reclaim plays and Avatar and Dreamsign activations", () => {
    const { model } = labScreen("reclaim");

    expect(model.affordances.voidPlays.size).toBe(1);
    expect(model.affordances.emblemActivations.map((action) => (typeof action.source === "string" ? null : action.source.kind))).toEqual([
      "avatar",
      "dreamsign",
    ]);
  });

  it("offers paying to end an effect on each character it changes, which ends it and spends its price", () => {
    const fixture = promptLabFixture("pay-to-end");
    if (fixture === null) throw new Error("no fixture pay-to-end");
    const { slice } = promptLabBattle(engine, fixture);
    const state = slice.committed;
    const [effect] = state.payable;
    if (effect === undefined) throw new Error("no payable effect");
    const model = screenOf(state);
    const affected = effect.affects.map(id);
    const nearBack = model.view.near.backRank.flatMap((cell) => (cell.card === null ? [] : [cell.card]));

    expect([...model.affordances.payToEnd.keys()].sort()).toEqual([...affected].sort());
    for (const card of affected) {
      expect(model.affordances.payToEnd.get(card)).toEqual([{ kind: "payToEnd", effect: effect.id }]);
    }
    expect(model.affordances.statusPayToEnd).toEqual([]);
    for (const card of nearBack.filter((entry) => affected.includes(entry.id))) {
      expect(card.showPlayableOutline).toBe(true);
      expect(card.statuses?.find((badge) => badge.kind === "payable")?.actionable).toBe(true);
    }
    const [first] = affected;
    const action = first === undefined ? undefined : model.affordances.payToEnd.get(first)?.[0];
    if (action === undefined) throw new Error("no payment");
    const outcome = adapter.reduce(slice, { kind: "battleAction", side: "player", action });
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    const paid = screenOf(outcome.slice.committed);
    expect(outcome.slice.committed.payable).toEqual([]);
    expect(outcome.slice.committed.sides.player.currentEnergy).toBe(state.sides.player.currentEnergy - effect.cost);
    expect(paid.affordances.payToEnd.size).toBe(0);
    expect(engineStatuses(paid.engine, "player").cards.size).toBe(0);
  });

  it("offers no payment the player cannot afford, and one for an effect changing no character from the status display", () => {
    const fixture = promptLabFixture("pay-to-end");
    if (fixture === null) throw new Error("no fixture pay-to-end");
    const state = promptLabBattle(engine, fixture).slice.committed;
    const [effect] = state.payable;
    if (effect === undefined) throw new Error("no payable effect");
    const poor = structuredClone(state);
    poor.sides.player.currentEnergy = effect.cost - 1;
    const unattached = structuredClone(state);
    unattached.payable = [{ ...effect, affects: [] }];
    const broke = screenOf(poor);

    expect(broke.affordances.payToEnd.size).toBe(0);
    const payable = [...engineStatuses(broke.engine, "player").cards.values()].flat().filter((badge) => badge.kind === "payable");
    expect(payable).toHaveLength(effect.affects.length);
    expect(payable.some((badge) => badge.actionable === true)).toBe(false);
    expect(screenOf(unattached).affordances.statusPayToEnd).toEqual([{ kind: "payToEnd", effect: effect.id }]);
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

describe("prompt failure paths", () => {
  const dissolve = () => {
    const { state, ids } = board({
      player: { hand: [DSL.dissolveEnemy.id], energy: 2 },
      enemy: { back: [SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
    });
    return { ...screenAtPrompt(state, { kind: "play", card: ids.player.hand[0], from: "hand" }), ids };
  };

  it("bounces an answer for an old prompt id, a second answer to one prompt, and a cancel of a cancelled prompt", () => {
    const { slice, prompt, ids } = dissolve();
    const answer = { kind: "answer" as const, side: "player" as const, promptId: prompt.id, value: [ids.enemy.back[0]!] };
    const answered = adapter.reduce(slice, answer);
    if (answered.kind !== "applied") throw new Error("bounced");
    const cancelled = adapter.reduce(slice, { kind: "cancel", side: "player", promptId: prompt.id });
    if (cancelled.kind !== "applied") throw new Error("bounced");

    expect(adapter.reduce(answered.slice, answer)).toMatchObject({ kind: "bounced" });
    expect(adapter.reduce(cancelled.slice, { kind: "cancel", side: "player", promptId: prompt.id })).toMatchObject({ kind: "bounced" });
    expect(adapter.reduce(slice, { ...answer, promptId: parsePromptId("0:0:9") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(slice, { ...answer, value: [ids.enemy.back[0]!, ids.enemy.back[1]!] })).toEqual({
      kind: "bounced",
      reason: "illegalAnswer",
    });
  });

  it("reaches the same prompt, with a new id after a cancel, when the slice replays", () => {
    const { slice, prompt } = dissolve();
    const replayed = adapter.pending(JSON.parse(JSON.stringify(slice)) as BattleSlice);
    const cancelled = adapter.reduce(slice, { kind: "cancel", side: "player", promptId: prompt.id });
    if (cancelled.kind !== "applied") throw new Error("bounced");
    const again = engine.legalActions(cancelled.slice.committed, "player").find((action) => action.kind === "play");
    if (again === undefined) throw new Error("no play");
    const reopened = adapter.reduce(cancelled.slice, { kind: "battleAction", side: "player", action: again });
    if (reopened.kind !== "applied") throw new Error("bounced");

    expect(replayed?.prompt).toEqual(prompt);
    expect(cancelled.slice.inFlight).toBeNull();
    expect(adapter.pending(reopened.slice)?.prompt.id).not.toBe(prompt.id);
  });

  it("presents only the events the human may see and notices only the human's automatic answers", () => {
    const { state, ids } = board({ player: { hand: [DSL.dissolveEnemy.id], energy: 2 }, enemy: { back: [SYNTHETIC.vanilla2.id] } });
    const outcome = adapter.reduce(
      { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
      { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } },
    );
    if (outcome.kind !== "applied") throw new Error("bounced");
    const batch = { key: pid("k"), state: outcome.slice.committed };
    const mine = presentationItems(outcome.published, "player", batch, state, () => "Lab Unmaking");
    const theirs = presentationItems(outcome.published, "enemy", batch, state, () => null);

    expect(mine.flatMap((item) => (item.notice === null ? [] : [item.notice]))).toEqual([
      { kind: "autoAnswered", prompt: "chooseTargets", sourceName: "Lab Unmaking" },
    ]);
    expect(theirs.some((item) => item.notice !== null)).toBe(false);
  });

  it("caps a presentation backlog, keeping the newest notice of each kind", () => {
    const batch = { key: pid("k"), state: board({}).state };
    const item = (key: string, notice: PresentationItem["notice"] = null): PresentationItem => ({
      key: pid(key),
      presentation: notice === null ? "travel" : "notice",
      dwellMs: 1_000,
      visual: null,
      notice,
      batch,
    });
    const backlog = enqueuePresentation(
      [item("a"), item("b", { kind: "capacityReached", missing: 1 })],
      [...Array.from({ length: 20 }, (_unused, index) => item(`c${String(index)}`)), item("d", { kind: "capacityReached", missing: 2 })],
    );

    expect(backlog.filter((entry) => entry.notice !== null).map((entry) => entry.key)).toEqual(["d"]);
    expect(backlog[backlog.length - 1]?.key).toBe("d");
    expect(backlog.length).toBeLessThan(22);
  });

  it("reads engine intents back from applied events and ignores other events", () => {
    expect(intentOfEvent("BATTLE_CANCEL", { side: "player", promptId: "3:1:0" })).toEqual({
      kind: "cancel",
      side: "player",
      promptId: "3:1:0",
    });
    expect(intentOfEvent("BATTLE_ANSWER", { side: "enemy", promptId: "3:1:0", value: true })).toMatchObject({ kind: "answer", value: true });
    expect(intentOfEvent("BATTLE_ACTION", { side: "nobody", action: { kind: "pass" } })).toBeNull();
    expect(intentOfEvent("END_BATTLE", { side: "player", promptId: "3:1:0" })).toBeNull();
  });
});

describe("presentation", () => {
  const labEngine = createEngine(
    createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
  );
  /** Each presentation step of a lab fixture, with its items for `human` and the view of the board after it. */
  const steps = (name: string, human: "player" | "enemy" = "player") => {
    const fixture = promptLabFixture(name);
    if (fixture === null) throw new Error(`no fixture ${name}`);
    return promptLabPresentation(labEngine, fixture).map((step, index) => {
      const batch = { key: pid(`${name}:${String(index)}`), state: step.after };
      return { ...step, batch, items: presentationItems(step.published, human, batch, step.before, () => null) };
    });
  };
  const labModel = (state: BattleState, visual: PresentationItem["visual"], revealedCard: InstanceView | null = null) =>
    buildEngineBattleScreenModel({
      battleId: parseBattleId("battle-presentation-fixture"),
      human: "player",
      view: labEngine.view(state, "player"),
      legal: [],
      prompt: null,
      playing: null,
      decision: null,
      presented: visual === null,
      notice: null,
      cards,
      avatars: { player: { avatar: null }, enemy: { avatar: null } },
      opponentName: "Fixture Opponent",
      essenceReward: 100,
      resultDismissed: false,
      visual: visual === null ? null : { key: pid("visual-key"), visual },
      revealedCard,
    });
  const boardIds = (model: EngineBattleScreenModel) =>
    [model.view.far, model.view.near].flatMap((side) => [
      ...side.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
      ...side.frontRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
      ...side.voidCards.map((card) => card.id),
    ]);

  it("names a presentation for every event kind", () => {
    expect(Object.keys(EVENT_PRESENTATION).sort()).toEqual(Object.keys(EVENT_DEFINITIONS).sort());
  });

  it("reveals the opponent's play over the board before it, then holds the card off the board after it until it travels", () => {
    const [registered] = steps("present-opponent");
    const reveal = registered?.items[0];
    if (registered === undefined || reveal?.visual?.kind !== "reveal") throw new Error("no reveal");
    const played = registered.published.find((event) => event.kind === "cardPlayed");

    expect(reveal.presentation).toBe("reveal");
    expect(reveal.visual.instance).toBe(played?.kind === "cardPlayed" ? played.instance : null);
    expect(reveal.batch.state).toBe(registered.before);
    expect(reveal.batch.key).not.toBe(registered.batch.key);
    const revealedCard = labEngine.view(reveal.visual.after, "player").instances[reveal.visual.instance] ?? null;
    const during = labModel(registered.after, reveal.visual, revealedCard);
    expect(during.view.playReveal?.card.id).toBe(reveal.visual.instance);
    expect(boardIds(during)).not.toContain(reveal.visual.instance);
    expect(boardIds(labModel(registered.after, null))).toContain(reveal.visual.instance);
  });

  it("travels the human's own play and never presents an event hidden from the human", () => {
    const [play, answer] = steps("present-zones");
    const dissolve = [...(play?.items ?? []), ...(answer?.items ?? [])];
    const draws = steps("present-challenge")
      .flatMap((step) => step.published)
      .filter((event) => event.kind === "cardDrawn" && event.side === "enemy");
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const enemyBatch = { key: pid("draws"), state: challenge.after };

    expect(dissolve.some((item) => item.presentation === "reveal")).toBe(false);
    expect(dissolve[0]?.presentation).toBe("travel");
    expect(draws.length).toBeGreaterThan(0);
    expect(presentationItems(draws, "player", enemyBatch, challenge.before, () => null)).toEqual([]);
    expect(presentationItems(draws, "enemy", enemyBatch, challenge.before, () => null).length).toBe(draws.length);
  });

  it("scores a challenger with its announcement, announces the new turn, and notices a trigger with no legal target", () => {
    const challenge = steps("present-challenge")[1];
    const score = challenge?.items.find((item) => item.visual?.kind === "score");
    if (challenge === undefined || score?.visual?.kind !== "score") throw new Error("no score");
    const model = labModel(challenge.after, score.visual);
    const noTarget = steps("present-zones")[1]?.items.find((item) => item.notice?.kind === "noLegalTarget");

    expect(model.cardOverlay).toMatchObject({ kind: "points-scored", battleCardId: score.visual.instance, points: score.visual.points });
    expect(challenge.items.some((item) => item.presentation === "turn")).toBe(true);
    expect(noTarget?.presentation).toBe("notice");
  });

  it("presents a challenge's scores in the turn they happen, then announces the new turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const scoreAt = challenge.items.findIndex((item) => item.presentation === "score");
    const turnAt = challenge.items.findIndex((item) => item.presentation === "turn");
    const score = challenge.items[scoreAt];
    const turn = challenge.items[turnAt];
    if (score?.visual?.kind !== "score" || turn === undefined) throw new Error("no score or turn");

    expect(scoreAt).toBeLessThan(turnAt);
    expect(challenge.before.turn.active).toBe("player");
    expect(challenge.after.turn.active).toBe("enemy");
    expect(score.batch.key).not.toBe(challenge.batch.key);
    expect(labModel(score.batch.state, score.visual).view.activeSide).toBe("player");
    expect(turn.batch).toBe(challenge.batch);
    expect(labModel(turn.batch.state, null).view.activeSide).toBe("enemy");
  });

  it("shows a Dreamwell card beside its side while its reveal is presented", () => {
    const { state } = board({});
    const model = buildEngineBattleScreenModel({
      ...screenInput(state),
      visual: { key: pid("dreamwell"), visual: { kind: "dreamwell", side: "enemy", card: testDreamwellCardId } },
      dreamwellCard: (card) => (card === testDreamwellCardId ? dreamwellModel : null),
    });
    expect(model.view.dreamwell).toEqual({ side: "enemy", model: dreamwellModel });
  });

  it("keeps the item being presented, every turn, Dreamwell card, and score, the newest reveals, and the newest travels when a new batch arrives", () => {
    const state = board({}).state;
    const item = (key: string, presentation: PresentationItem["presentation"]): PresentationItem => ({
      key: pid(key),
      presentation,
      dwellMs: 1_000,
      visual: null,
      notice: null,
      batch: { key: pid(key), state },
    });
    const head = item("head", "travel");
    const reveals = Array.from({ length: 6 }, (_unused, index) => item(`reveal${String(index)}`, "reveal"));
    const queue = enqueuePresentation(
      [head, item("turn", "turn"), item("dreamwell", "dreamwell"), item("score", "score")],
      [...reveals, ...Array.from({ length: 6 }, (_unused, index) => item(`travel${String(index)}`, "travel"))],
    );
    const keys: string[] = queue.map((entry) => entry.key);

    expect(keys[0]).toBe("head");
    expect(keys).toEqual(expect.arrayContaining(["turn", "dreamwell", "score"]));
    expect(keys.filter((key) => key.startsWith("reveal"))).toEqual(reveals.slice(-4).map((entry) => entry.key));
    expect(keys.filter((key) => key.startsWith("travel"))).toEqual(["travel4", "travel5"]);
    expect(keys.indexOf("turn")).toBeLessThan(keys.indexOf("reveal2"));
  });

  it("plays queued items in order, each for its dwell, raising each notice as it is presented", () => {
    vi.useFakeTimers();
    try {
      const state = board({}).state;
      const item = (key: string, notice: PresentationItem["notice"] = null): PresentationItem => ({
        key: pid(key),
        presentation: notice === null ? "travel" : "notice",
        dwellMs: 100,
        visual: null,
        notice,
        batch: { key: pid(key), state },
      });
      const queue = new PresentationQueue();
      const heads: (string | null)[] = [];
      queue.subscribe(() => heads.push(queue.snapshot().queue[0]?.key ?? null));
      queue.enqueue([item("a"), item("b", { kind: "capacityReached", missing: 1 })]);
      vi.advanceTimersByTime(50);
      queue.enqueue([item("c")]);
      vi.advanceTimersByTime(100);
      expect(queue.snapshot().notice?.key).toBe("b");
      vi.advanceTimersByTime(200);

      expect(heads.filter((key, index) => heads[index - 1] !== key)).toEqual(["a", "b", "c", null]);
      expect(queue.snapshot().queue).toEqual([]);
      queue.dismissNotice();
      expect(queue.snapshot().notice).toBeNull();
      queue.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks durations, keywords, disabled triggers, payable effects, and side statuses, and clears them as they end", () => {
    const status = steps("present-status");
    const played = status[status.length - 2];
    const ended = status[status.length - 1];
    const zones = steps("present-zones");
    const exiled = zones[5];
    const reclaim = steps("reclaim")[0];
    if (played === undefined || ended === undefined || exiled === undefined || reclaim === undefined) throw new Error("no steps");
    const kinds = (state: BattleState) => {
      const marks = engineStatuses(labEngine.view(state, "player"), "player");
      return {
        cards: [...new Set([...marks.cards.values()].flat().map((badge) => badge.kind))].sort(),
        player: marks.sides.player.map((badge) => badge.kind),
        enemy: marks.sides.enemy.map((badge) => badge.kind),
        labels: [...marks.cards.values(), marks.sides.player, marks.sides.enemy].flat().every((badge) => badge.label.length > 0),
      };
    };

    expect(kinds(played.after)).toMatchObject({
      cards: ["duration", "keyword", "payable", "triggersDisabled"],
      player: ["delayedTrigger"],
      labels: true,
    });
    expect(kinds(ended.after)).toMatchObject({ cards: ["duration", "payable"], player: [] });
    expect(kinds(exiled.after).enemy).toEqual(["returns"]);
    expect(kinds(reclaim.after).player).toEqual(["exhausted"]);
  });

  it("writes a battle log line for what the human saw and none for what it could not see", () => {
    const zones = steps("present-zones");
    const entries = zones.flatMap((step, index) =>
      battleLogEntries(
        step.published,
        "player",
        step.after,
        labEngine.view(step.after, "player"),
        labEngine.view(step.before, "player"),
        `zones:${String(index)}`,
      ),
    );
    const turns = battleLogTurns(entries, "player", cards, () => null);
    const lines = turns.flatMap((turn) => turn.lines);
    const logged = entries.filter(
      (entry) => engineBattleLogText(entry.event, { human: "player", card: () => null, dreamwell: () => null }) !== null,
    );
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const seenByPlayer = battleLogEntries(
      challenge.published,
      "player",
      challenge.after,
      labEngine.view(challenge.after, "player"),
      labEngine.view(challenge.before, "player"),
      "c",
    );

    expect(lines).toHaveLength(logged.length);
    expect(new Set(logged.map((entry) => entry.event.kind))).toEqual(
      new Set(["cardPlayed", "cardDrawn", "dissolved", "noLegalTarget", "banished", "effectStarted", "returnedToHand", "eroded", "cardCreated", "materialized", "controlChanged", "triggerResolved"]),
    );
    expect(lines.every((line) => line.text.length > 0)).toBe(true);
    expect(turns).toHaveLength(1);
    expect(seenByPlayer.some((entry) => entry.event.kind === "cardDrawn" && entry.event.side === "enemy")).toBe(false);
    expect(seenByPlayer.some((entry) => entry.event.kind === "laneResolved")).toBe(true);
  });
});
