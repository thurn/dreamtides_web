// The battle screen model's prompt surfaces and their answers, and the
// opponent's prompts and responses as the human sees them.
import { describe, expect, it } from "vitest";
import { parseCardName } from "../../types/card-identity";
import { createEngine, type Action, type BattleState } from "../../engine";
import { createFoldAdapter, type BattleSlice, type PendingPrompt } from "../../engine/fold/slice";
import { DSL } from "../../engine/testing/dsl-cards";
import { LAB } from "../../engine/testing/prompt-lab";
import { SYNTHETIC, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { isLegalAnswer } from "../../engine/prompts/answers";
import { additionalCost, choiceCost, energy, event, pointsCost } from "../../engine/dsl/builders";
import type { CharacterSelector, PaymentCost } from "../../engine/dsl/types";
import { gainPoints } from "../../engine/effects/primitives/gain-points";
import { boardState } from "../../engine/testing/board";
import { promptFingerprint } from "../../engine/prompts/fingerprint";
import { isWellFormedPrompt } from "../../engine/prompts/structure";
import { narrowPrompt } from "../../engine/prompts/narrow";
import { promptView } from "../../engine/view/view";
import { parseBattleId, parsePromptId } from "../../types/identifiers";
import { buildEngineBattleScreenModel, enginePrintedKeywords, type EngineBattleScreenModel } from "./engine-battle-view-model";
import { type PendingEnginePrompt, type PromptSurface } from "./prompt-host-view-model";
import { adapter, board, cards, engine, id, labScreen, labSlice, screenOf, selections } from "./engine-battle-view-model.fixtures";

/** Takes `action` through the fold and returns the screen at the prompt it suspends on. */
function screenAtPrompt(state: BattleState, action: Action, presented = true) {
  const slice: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
  const outcome = adapter.reduce(slice, { kind: "battleAction", side: "player", action });
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  const pending = adapter.pending(outcome.slice);
  if (pending === null) throw new Error("no prompt");
  return { model: screenOf(state, pending.prompt, pending.display, presented), prompt: pending.prompt };
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

/** The answer each choice button of the model's surface gives. */
const choiceAnswers = (model: EngineBattleScreenModel) =>
  selections(model).map((select) => (select.kind === "answer" ? select.answer : null));

describe("buildEngineBattleScreenModel", () => {
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

  it("identifies the positions’ battlefield independently of the answering side, retaining every numeric choice", () => {
    const own = labScreen("move");
    const transferred = labScreen("move-transferred");
    if (own.prompt?.kind !== "chooseSlot" || transferred.prompt?.kind !== "chooseSlot") throw new Error("Expected movement prompts");
    expect(own.prompt).toMatchObject({ side: "player", fieldSide: "player" });
    expect(transferred.prompt).toMatchObject({ side: "player", fieldSide: "enemy" });
    expect(own.model.view.promptHost?.heading?.detail).not.toEqual(transferred.model.view.promptHost?.heading?.detail);
    expect(own.model.view.promptHost?.heading?.title).toEqual(transferred.model.view.promptHost?.heading?.title);
    expect(choiceAnswers(own.model)).toEqual([...Array(18).keys()]);
    expect(choiceAnswers(transferred.model)).toEqual([...Array(18).keys()]);
    expect(own.model.view.choicePrompt?.options.map((option) => option.label)).toEqual(transferred.model.view.choicePrompt?.options.map((option) => option.label));
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

    expect(picker.model.view.cardPicker).toMatchObject({ count: 2, minCount: 0, optional: true, presentation: "board", ringCandidates: true });
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

  it("rings each character an abandon cost may take on the board, the cost's every candidate", () => {
    const { committed } = labSlice("void-activation");
    const activate = engine.legalActions(committed, "player").find((action) => action.kind === "activate");
    if (activate === undefined) throw new Error("no activation");
    const { model } = screenAtPrompt(committed, activate);
    const { picker } = surfaceOf(model, "picker");
    const { backRank, frontRank } = committed.sides.player;
    const inPlay = [...backRank, ...frontRank].flatMap((instance) => (instance === null ? [] : [id(instance)]));

    expect(picker.presentation).toBe("board");
    expect(picker.ringCandidates).toBe(true);
    expect(new Set(picker.candidateIds)).toEqual(new Set(inPlay));
  });

  it.each([
    ["player", "hand", "board"],
    ["enemy", "hand", "gallery"],
    ["player", "back", "board"],
    ["enemy", "front", "board"],
  ] as const)("routes %s %s choices by their holder, preserving duplicate instances", (holder, zone, presentation) => {
    const { state, ids } = board({ [holder]: { [zone]: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla1.id] } });
    const candidates = ids[holder][zone].flatMap((instance) => instance === null ? [] : [instance]);
    for (const instance of candidates) {
      state.instances[instance] = { ...state.instances[instance], owner: holder === "player" ? "enemy" : "player" };
    }
    state.knownTo.player = candidates;
    const prompt: PendingEnginePrompt = {
      id: parsePromptId("1:0:0"),
      kind: "chooseCards",
      side: "player",
      privateTo: "player",
      candidates,
      min: 1,
      max: 1,
      cancellable: false,
      purpose: { source: null, cardId: null, ability: null, role: "discardChosen" },
    };
    const model = screenOf(state, prompt);
    const picker = surfaceOf(model, "picker");

    expect(picker.picker.presentation).toBe(presentation);
    expect(picker.picker.ringCandidates).toBe(true);
    expect(picker.picker.candidateIds).toEqual(candidates.map(id));
    expect(picker.picker.candidates.map((candidate) => candidate.owner)).toEqual([holder, holder]);
    expect(new Set(picker.picker.candidates.map((candidate) => candidate.cardUuid)).size).toBe(1);
    expect(picker.answer([id(candidates[0])])).toEqual([candidates[0]]);
    expect(picker.answer([id(candidates[1])])).toEqual([candidates[1]]);
    expect(picker.answer([id(candidates[0]), id(candidates[0])])).toBeNull();
    if (presentation === "gallery") {
      expect(model.view.promptHost).toBeNull();
      expect(picker.picker.cancellable).toBe(false);
    }
  });

  it("uses the gallery for a choice spanning the human and opposing hands", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id] }, enemy: { hand: [SYNTHETIC.vanilla1.id] } });
    const candidates = [...ids.player.hand, ...ids.enemy.hand];
    state.knownTo.player = ids.enemy.hand;
    const prompt: PendingEnginePrompt = {
      id: parsePromptId("1:0:0"),
      kind: "chooseCards",
      side: "player",
      privateTo: "player",
      candidates,
      min: 1,
      max: 1,
      cancellable: false,
      purpose: { source: null, cardId: null, ability: null, role: "discardChosen" },
    };
    const picker = surfaceOf(screenOf(state, prompt), "picker");
    expect(picker.picker.presentation).toBe("gallery");
    expect(picker.picker.candidateIds).toEqual(candidates.map(id));
    expect(picker.answer([id(ids.enemy.hand[0])])).toEqual(ids.enemy.hand);
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
});

/** Real play-time cost prompts over synthetic data, independent of the production catalog. */
function costChoices(choices: readonly (readonly (readonly PaymentCost[])[])[]) {
  const card = { ...SYNTHETIC.vanilla1, id: syntheticId(0x472), cardType: "event" as const, spark: null,
    costs: [energy(0)], abilities: () => [additionalCost(...choices.map((options) => choiceCost(...options))), event(gainPoints(1))] };
  const on = createEngine(testCatalog([card]));
  const fold = createFoldAdapter(on);
  const { state, ids } = boardState(on.catalog, { active: "player", phase: "day",
    player: { hand: [card.id, SYNTHETIC.vanilla1.id], back: [SYNTHETIC.vanilla1.id], energy: 8, score: 8 } });
  const started = fold.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
    { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
  if (started.kind !== "applied") throw new Error(`cost play bounced: ${started.reason}`);
  const pending = fold.pending(started.slice);
  if (pending?.prompt.kind !== "chooseMode") throw new Error("missing cost choice");
  return { on, fold, slice: started.slice, prompt: pending.prompt, display: pending.display, state };
}

function costLabels(fixture: ReturnType<typeof costChoices>, prompt: PendingEnginePrompt = fixture.prompt) {
  return surfaceOf(screenOf(fixture.state, prompt, fixture.display, true, fixture.on), "choice").options.map((option) => option.label);
}

describe("cost-choice prompt data", () => {
  it("names the actual sequential alternatives and preserves mode answers through persisted-slice replay", () => {
    const first = [[energy(1)], [pointsCost(2)]];
    const second = [[pointsCost(3), energy(2)], []];
    const fixture = costChoices([first, second]);
    expect(fixture.prompt.costOptions).toEqual(first);
    const firstLabels = costLabels(fixture);
    expect(new Set(firstLabels).size).toBe(2);
    const { costOptions: _costs, ...legacy } = fixture.prompt;
    expect(firstLabels).not.toEqual(costLabels(fixture, legacy));
    expect(choiceAnswers(screenOf(fixture.state, fixture.prompt, fixture.display, true, fixture.on))).toEqual([0, 1]);
    const replayed = JSON.parse(JSON.stringify(fixture.slice)) as BattleSlice;
    expect(fixture.fold.pending(replayed)?.prompt).toEqual(fixture.prompt);
    const answered = fixture.fold.reduce(replayed, { kind: "answer", side: "player", promptId: fixture.prompt.id, value: 0 });
    if (answered.kind !== "applied") throw new Error("cost answer bounced");
    const pending = fixture.fold.pending(answered.slice);
    if (pending?.prompt.kind !== "chooseMode") throw new Error("missing second cost choice");
    expect(pending.prompt.costOptions).toEqual(second);
    const secondFixture = { ...fixture, slice: answered.slice, prompt: pending.prompt, display: pending.display };
    const secondLabels = costLabels(secondFixture);
    expect(new Set(secondLabels).size).toBe(2);
    expect(secondLabels.every((label) => label.length > 0)).toBe(true);
    expect(secondLabels).not.toEqual(firstLabels);
    expect(choiceAnswers(screenOf(fixture.state, pending.prompt, pending.display, true, fixture.on))).toEqual([0, 1]);
    const paid = fixture.fold.reduce(answered.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
    if (paid.kind !== "applied" || paid.error !== null) throw new Error("compound cost did not commit");
    expect(paid.slice.committed.sides.player.currentEnergy).toBe(5);
    expect(paid.slice.committed.sides.player.score).toBe(6);
  });

  it("retains exact mode-to-cost mapping through narrowed and sparse legal surfaces", () => {
    const fixture = costChoices([[[energy(1)], [pointsCost(2)]]]);
    const narrowed = narrowPrompt(fixture.prompt, [1]);
    expect(narrowed.kind).toBe("chooseMode");
    if (narrowed.kind !== "chooseMode") throw new Error("wrong kind");
    const sparse = { ...narrowed, options: narrowed.options.filter((option) => option.legal) };
    expect(isWellFormedPrompt(sparse)).toBe(true);
    expect(costLabels(fixture, { ...sparse, id: fixture.prompt.id })).toEqual([costLabels(fixture)[1]]);
    expect(choiceAnswers(screenOf(fixture.state, { ...sparse, id: fixture.prompt.id }, fixture.display, true, fixture.on))).toEqual([1]);
    expect(isWellFormedPrompt({ ...fixture.prompt, purpose: { ...fixture.prompt.purpose, role: "chooseOne" } })).toBe(false);
    expect(isWellFormedPrompt({ ...fixture.prompt, options: [{ mode: 2, legal: true }] })).toBe(false);
    expect(isWellFormedPrompt({ ...fixture.prompt, options: [{ mode: -1, legal: true }] })).toBe(false);
    const { costOptions: _costs, ...legacy } = fixture.prompt;
    expect(promptFingerprint(fixture.prompt)).not.toBe(promptFingerprint(legacy));
    expect(promptFingerprint({ ...fixture.prompt, costOptions: [[energy(3)], [pointsCost(2)]] })).not.toBe(promptFingerprint(fixture.prompt));
  });

  it("keeps payment data for its actor and known public source while withholding a hidden or private opponent source", () => {
    const fixture = costChoices([[[energy(1)], [pointsCost(2)]]]);
    expect(promptView(fixture.prompt, "player", fixture.display)).toEqual(fixture.prompt);
    const hidden = promptView(fixture.prompt, "enemy", fixture.display);
    expect(hidden.purpose.source).toBeNull();
    expect("costOptions" in hidden).toBe(false);
    const source = fixture.prompt.purpose.source;
    if (typeof source !== "string") throw new Error("missing source");
    const publicState = { ...fixture.display, knownTo: { ...fixture.display.knownTo, enemy: [...fixture.display.knownTo.enemy, source] } };
    const visible = promptView(fixture.prompt, "enemy", publicState);
    expect(visible).toEqual(fixture.prompt);
    expect("costOptions" in promptView({ ...fixture.prompt, privateTo: "player" }, "enemy", publicState)).toBe(false);
  });

  it("derives copy from every qualified payment without changing unrelated modes", () => {
    const fixture = costChoices([[[energy(1)], [pointsCost(2)]]]);
    const pairs: readonly (readonly [PaymentCost, PaymentCost])[] = [
      [energy(1), energy(4)], [pointsCost(1), pointsCost(3)],
      [{ cost: "discard", count: 1, filter: {} }, { cost: "discard", count: 1, filter: { subtype: "Warrior", costAtMost: 2 } }],
      [{ cost: "discard", count: "x", filter: {}, min: 0 }, { cost: "discard", count: "x", filter: {}, min: 2 }],
      [{ cost: "discard", count: 1, filter: {} }, { cost: "discard", count: 1, filter: {}, captureCost: true }],
      [{ cost: "abandon", count: 1, selector: { controller: "you" } }, { cost: "abandon", count: 1, selector: { kind: "self" } }],
      [{ cost: "banishFromVoid", count: "x", filter: {}, min: 1 }, { cost: "banishFromVoid", count: "x", filter: { cardType: "event" }, min: 2 }],
      [{ cost: "banishFromAnyVoid", count: 1, filter: {}, player: "you" }, { cost: "banishFromAnyVoid", count: 1, filter: {}, player: "opponent" }],
      [{ cost: "reveal", count: 1, filter: {} }, { cost: "reveal", count: 1, filter: { sparkAtLeast: 3 } }],
    ];
    const selectors: readonly CharacterSelector[] = [
      { controller: "opponent" }, { controller: "you", another: true }, { controller: "you", subtype: "Warrior" },
      { controller: "you", notSubtype: "Warrior" }, { controller: "you", figment: false }, { controller: "you", exhausted: true },
      { controller: "you", rank: "front" }, { controller: "you", challenging: true }, { controller: "you", blocking: false },
      { controller: "you", sparkAtMost: { value: "x" } },
      { controller: "you", costAtLeast: { value: "countCards", zone: "void", player: "opponent", filter: { cardType: "event" } } },
    ];
    const changes = [...pairs, ...selectors.map((selector): readonly [PaymentCost, PaymentCost] =>
      [{ cost: "return", count: 1, selector: { controller: "you" } }, { cost: "return", count: 1, selector }])];
    for (const [before, after] of changes) {
      const left = costLabels(fixture, { ...fixture.prompt, costOptions: [[before], [pointsCost(2)]] });
      const right = costLabels(fixture, { ...fixture.prompt, costOptions: [[after], [pointsCost(2)]] });
      expect(right[0]).not.toBe(left[0]);
      expect(right[1]).toBe(left[1]);
    }
  });
});

/** The public pending projection forwarded to the screen, without shared-fixture API changes. */
function discardScreen(pending: PendingPrompt, drawnForDiscard = pending.drawnForDiscard, presented = true, human: "player" | "enemy" = "player") {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-discard-hint"), human, view: engine.view(pending.display, human), legal: [],
    prompt: pending.prompt, drawnForDiscard, playing: null, decision: null, presented, notice: null,
    cards: Object.assign((instance: Parameters<typeof cards>[0]) => {
      const model = cards(instance);
      return { ...model, displaySnapshot: { ...model.displaySnapshot, name: parseCardName("Synthetic duplicate") } };
    }, { nameOf: (identity: Parameters<typeof cards.nameOf>[0]) => cards.nameOf(identity) }), catalog: engine.catalog, printedKeywords: enginePrintedKeywords(engine.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } }, opponentName: "", essenceReward: 0, resultDismissed: false,
  });
}
function drawnDiscard() {
  const { state, ids } = board({ player: { hand: [LAB.drawTwoThenDiscard.id, SYNTHETIC.vanilla1.id],
    deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 2 } });
  const result = adapter.reduce({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 },
    { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
  if (result.kind !== "applied" || result.error !== null) throw new Error("Expected discard prompt");
  const pending = adapter.pending(result.slice);
  if (pending === null || pending.prompt.kind !== "chooseCards") throw new Error("Missing public discard prompt");
  return { pending: { ...pending, prompt: pending.prompt }, ids };
}

describe("drawn discard picker emphasis", () => {
  it("selectively rings drawn physical candidates while all old and drawn cards remain selectable", () => {
    const { pending, ids } = drawnDiscard();
    const model = discardScreen(pending);
    const picker = model.view.cardPicker;
    expect(picker?.ringCandidates).toBe(false);
    expect(picker?.candidates.filter(c => c.highlighted).map(c => c.instanceId)).toEqual(ids.player.deck.map(id));
    expect(picker?.candidateIds).toEqual([id(ids.player.hand[1]), ...ids.player.deck.map(id)]);
    expect(new Set(picker?.candidates.map(c => c.cardUuid)).size).toBe(2);
    const surface = surfaceOf(model, "picker");
    for (const candidate of [ids.player.hand[1], ...ids.player.deck]) expect(surface.answer([id(candidate)])).toEqual([candidate]);
    expect(discardScreen(pending, pending.drawnForDiscard, false).view.cardPicker).toBeNull();
    expect(discardScreen(pending, pending.drawnForDiscard, true, "enemy").view.cardPicker).toBeNull();
  });

  it("retains ordinary and other-role rings, and ignores foreign or invisible hint IDs", () => {
    const { pending, ids } = drawnDiscard();
    for (const hint of [[], ids.enemy.deck]) {
      const picker = discardScreen(pending, hint).view.cardPicker;
      expect(picker?.ringCandidates).toBe(true);
      expect(picker?.candidates.every(c => !c.highlighted)).toBe(true);
    }
    const ordinary = { ...pending, drawnForDiscard: undefined };
    expect(discardScreen(ordinary).view.cardPicker?.ringCandidates).toBe(true);
    const restricted = { ...pending, prompt: { ...pending.prompt, allowed: [[ids.player.hand[1]]] } };
    expect(discardScreen(restricted).view.cardPicker?.candidates.every(c => !c.highlighted)).toBe(true);
    const other = { ...pending, prompt: { ...pending.prompt, purpose: { ...pending.prompt.purpose, role: "discardCost" as const } } };
    expect(discardScreen(other).view.cardPicker?.ringCandidates).toBe(true);
    expect(discardScreen(other).view.cardPicker?.candidates.every(c => !c.highlighted)).toBe(true);
  });
});
