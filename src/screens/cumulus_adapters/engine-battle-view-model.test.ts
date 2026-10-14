// The battle screen model over the prompt lab: a legal answer on every
// human prompt's surface and an affordance for every legal action. The
// screen model's affordances, prompts, and display are in
// engine-battle-view-model-affordances.test.ts,
// engine-battle-view-model-prompts.test.ts, and
// engine-battle-view-model-display.test.ts; engine card models in
// engine-battle-view-model-card-models.test.ts; presentation and the battle
// log in engine-battle-presentation.test.ts and its siblings.
import { describe, expect, it } from "vitest";
import { createEngine, type Action } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { event } from "../../engine/dsl/builders";
import { chooseOne } from "../../engine/effects/primitives/choose-one";
import { draw } from "../../engine/effects/primitives/draw";
import { gainEnergy } from "../../engine/effects/primitives/gain-energy";
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { boardState } from "../../engine/testing/board";
import { dreamwellLabBattle } from "../../engine/testing/card-lab";
import { SYNTHETIC_CARDS, SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabBattle } from "../../engine/testing/prompt-lab";
import { firstLegalAnswer, isLegalAnswer } from "../../engine/prompts/answers";
import type { Answer, PromptRole } from "../../engine/prompts/types";
import { parseBattleCardId, parseBattleId, parseDreamwellCardId, parsePromptId } from "../../types/identifiers";
import {
  buildEngineBattleScreenModel,
  enginePrintedKeywords,
  type EngineBattleViewInput,
  type EngineBattleAffordances,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import { type PendingEnginePrompt, type PromptSurface } from "./prompt-host-view-model";
import { cards, screenOf } from "./engine-battle-view-model.fixtures";

const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);

describe("Dreamwell modal source copy", () => {
  const sourceId = parseDreamwellCardId("00000000-0000-4000-8000-000000054601");
  const otherId = parseDreamwellCardId("00000000-0000-4000-8000-000000054602");
  const modeCopy = ["Draw a card", "gain 2●"];
  const renderedText = `Choose one: ${modeCopy.join(" or ")}.`;
  const definition = { id: sourceId, order: 4, energyAdded: 0, status: "authored" as const,
    abilities: () => [event(chooseOne(draw(1), gainEnergy(2)))] };
  const engine = createEngine(createCatalog(SYNTHETIC_CARDS, [definition, { ...definition, id: otherId }]));
  const fold = createFoldAdapter(engine);
  const source = (cardId = sourceId, text = renderedText) => ({ cardId,
    displaySnapshot: { id: cardId, name: "Synthetic shared name", renderedText: text, energyAdded: 0, imageNumber: 0 } });
  const opening = () => {
    const lab = dreamwellLabBattle(engine, { cardId: sourceId, side: "player" }, [sourceId, otherId]);
    const out = fold.reduce(lab.slice, { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    if (out.kind !== "applied" || out.error !== null) throw new Error("fixture pass failed");
    const pending = fold.pending(out.slice);
    if (pending === null || pending.prompt.kind !== "chooseMode") throw new Error("missing modal Dreamwell prompt");
    return { out, pending: { ...pending, prompt: pending.prompt } };
  };
  const inputOf = (pending: ReturnType<typeof opening>["pending"]): EngineBattleViewInput => ({
    battleId: parseBattleId("battle-dreamwell-copy"), human: "player", view: engine.view(pending.display, "player"),
    legal: [], prompt: pending.prompt, playing: null, decision: null, presented: true, notice: null,
    cards, catalog: engine.catalog, printedKeywords: enginePrintedKeywords(engine.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } }, opponentName: "Synthetic opponent",
    essenceReward: 0, resultDismissed: false,
  });
  const choices = (input: EngineBattleViewInput) => {
    const model = buildEngineBattleScreenModel(input);
    if (model.prompt.surface.kind !== "choice") throw new Error("missing choice surface");
    return { model, options: model.prompt.surface.options };
  };

  it("resolves the pinned UUID once despite matching source display names, preserving authored mode order", () => {
    const { pending } = opening();
    const sources = new Map([[sourceId, source()], [otherId, source(otherId, "Choose one: Other first; or other second.")]]);
    const resolved: typeof sourceId[] = [];
    const { model, options } = choices({ ...inputOf(pending), dreamwellCard: (id) => { resolved.push(id); return sources.get(id) ?? null; } });
    expect(pending.prompt.purpose.source).toEqual({ kind: "dreamwell", side: "player", id: sourceId });
    expect(resolved).toEqual([sourceId]);
    expect(model.prompt.sourceCard).toBeNull();
    expect(model.prompt.host?.heading?.detail).toContain(source().displaySnapshot.name);
    expect(options.map((option) => option.select)).toEqual(pending.prompt.options.map((option) => ({ kind: "answer", answer: option.mode })));
    options.forEach((option, index) => expect(option.label.toLowerCase()).toContain(modeCopy[index].toLowerCase()));
    expect(options.map((option) => option.label)).not.toEqual(choices(inputOf(pending)).options.map((option) => option.label));
  });

  it.each([0, 1])("submits offered mode %i with matching observed effects through saved replay and rejects stale answers", (index) => {
    const { out, pending } = opening();
    const { options } = choices({ ...inputOf(pending), dreamwellCard: () => source() });
    const select = options[index].select;
    if (select.kind !== "answer") throw new Error("choice is not an answer");
    const intent = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: select.answer };
    const before = JSON.stringify(out.slice);
    for (const slice of [out.slice, JSON.parse(before) as BattleSlice]) {
      const replayedPending = createFoldAdapter(engine).pending(slice);
      if (replayedPending === null) throw new Error("saved prompt missing");
      expect(choices({ ...inputOf({ ...replayedPending, prompt: pending.prompt }), dreamwellCard: () => source() }).options).toEqual(options);
      expect(fold.reduce(slice, { ...intent, promptId: parsePromptId("999:0:0") })).toMatchObject({ kind: "bounced", reason: "stalePrompt" });
      expect(fold.reduce(slice, { ...intent, value: 2 })).toMatchObject({ kind: "bounced", reason: "illegalAnswer" });
      const answered = fold.reduce(slice, intent);
      if (answered.kind !== "applied") throw new Error(answered.reason);
      expect(answered.error).toBeNull();
      expect(answered.slice.committed.sides.player.hand).toHaveLength(index === 0 ? 2 : 1);
      expect(answered.slice.committed.sides.player.currentEnergy).toBe(index === 0 ? 2 : 4);
      expect(answered.published.filter((effect) => effect.kind === "cardDrawn" && effect.side === "player")).toHaveLength(index === 0 ? 2 : 1);
      expect(answered.published.filter((effect) => effect.kind === "energyChanged" && effect.cause === "effect")).toHaveLength(index === 0 ? 0 : 1);
      expect(fold.reduce(answered.slice, intent)).toMatchObject({ kind: "bounced", reason: "noPendingPrompt" });
    }
    expect(JSON.stringify(out.slice)).toBe(before);
  });

  it("retains numbered fallback for absent or malformed models and holds or hides unanswered prompts", () => {
    const { pending } = opening();
    const input = inputOf(pending);
    const fallback = choices(input).options;
    for (const dreamwellCard of [() => null, () => source(sourceId, "Synthetic nonmodal rules"), () => source(sourceId, "Choose one: One only.")]) {
      expect(choices({ ...input, dreamwellCard }).options).toEqual(fallback);
    }
    const held = buildEngineBattleScreenModel({ ...input, presented: false, dreamwellCard: () => source() });
    expect(held.prompt.surface.kind).toBe("held");
    expect(choiceView(held.view)).toBeNull();
    const waiting = buildEngineBattleScreenModel({ ...input, human: "enemy", view: engine.view(pending.display, "enemy"), dreamwellCard: () => source() });
    expect(waiting.prompt.surface.kind).toBe("waiting");
    expect(choiceView(waiting.view)).toBeNull();
  });

  it("keeps instance-backed chooseOne copy independent of the Dreamwell resolver", () => {
    const { pending } = opening();
    const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [SYNTHETIC.vanilla1.id] } });
    const input = inputOf(pending);
    const instanceCards = Object.assign((instance: Parameters<typeof cards>[0]) => {
      const model = cards(instance);
      return { ...model, displaySnapshot: { ...model.displaySnapshot, renderedText } };
    }, { nameOf: (identity: Parameters<typeof cards.nameOf>[0]) => cards.nameOf(identity) });
    const { model, options } = choices({ ...input, view: engine.view(state, "player"), cards: instanceCards,
      prompt: { ...pending.prompt, purpose: { ...pending.prompt.purpose, source: ids.player.hand[0] } },
      dreamwellCard: () => { throw new Error("instance source queried Dreamwell"); } });
    expect(model.prompt.sourceCard?.id).toBe(parseBattleCardId(ids.player.hand[0]));
    options.forEach((option, index) => expect(option.label.toLowerCase()).toContain(modeCopy[index].toLowerCase()));
  });
});

describe("deck-top battle affordances", () => {
  it("separates known owner top plays from hand/void plays, with no deeper or enemy affordance", () => {
    const fixture = PROMPT_LAB_FIXTURES.find((row) => row.name === "deck-top-play")!;
    const { slice } = promptLabBattle(labEngine, fixture);
    const model = screenOf(slice.committed, null, slice.committed, true, labEngine);
    const top = model.view.near.knownDeckTop!;
    expect(top).not.toBeNull();
    expect(top.showPlayableOutline).toBe(true);
    expect(model.affordances.deckPlays.get(top.id)).toMatchObject({ kind: "play", from: "deck" });
    expect(model.affordances.plays.has(top.id)).toBe(false);
    expect(model.affordances.voidPlays.has(top.id)).toBe(false);
    expect(model.affordances.deckPlays.size).toBe(1);
    const hidden = promptLabBattle(labEngine, PROMPT_LAB_FIXTURES.find((row) => row.name === "deck-top-hidden")!).slice;
    const masked = screenOf(hidden.committed, null, hidden.committed, true, labEngine);
    expect(masked.view.near.knownDeckTop).toBeNull();
    expect(masked.affordances.deckPlays.size).toBe(0);
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
        const { candidateIds, selection } = surface.picker;
        const count=selection.max;
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
    surface.kind === "targets" ? surface.skip !== null : surface.kind === "picker" ? surface.picker.selection.min === 0 : false;
  const offered = (affordances: EngineBattleAffordances): Action[] => [
    ...(affordances.pass === null ? [] : [affordances.pass]),
    ...affordances.plays.values(),
    ...affordances.voidPlays.values(),
    ...affordances.deckPlays.values(),
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
   * prompt after each offered choice button, or one legal answer on other
   * surfaces. The AI answers its own
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
        const model = labSliceModel(slice);
        const answer = value ?? surfaceAnswer(model);
        if (answer === null || depth > 3) return;
        const answers = model.prompt.surface.kind === "choice"
          ? model.prompt.surface.options.flatMap((option) => option.select.kind === "answer" ? [option.select.answer] : [])
          : [answer];
        for (const value of answers) {
          const outcome = labAdapter.reduce(slice, { kind: "answer", side: pending.prompt.side, promptId: pending.prompt.id, value });
          if (outcome.kind === "applied") visit(fixture, outcome.slice, depth + 1);
        }
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
    const roles = {
      discardToHandLimit: true, playRoute: true, voidRoute: true, chooseX: true, chooseOne: true, choosePlayer: true, chooseSubtype: true, target: true,
      chooseCost: true, optionalCost: true, optionalPayment: true, abandonCost: true, returnCost: true, keep: true, abandon: true, discardCost: true, revealCost: true,
      banishAnyVoidCost: true, banishCost: true, offeringCost: true, discard: true, discardChosen: true, banishChosen: true, restrictChosen: true, foresee: true,
      lookAtTop: true, lookAtTopBanish: true, discover: true, discoverCost: true, chooseAmong: true, chooseFromOpponentHand: true, shuffleInto: true, putInDeck: true,
      youMay: true, preventUnlessPays: true, opponentUnlessPays: true, move: true, preventUnlessAbandons: true,
    } satisfies Record<PromptRole, true>;
    expect(new Set(prompts.map(({ prompt }) => prompt.purpose.role))).toEqual(new Set(Object.keys(roles)));
    const kinds = new Set(prompts.map(({ model }) => model.prompt.surface.kind));
    expect(kinds).toEqual(new Set(["targets", "picker", "choice", "number", "arrange"]));
    for (const { fixture, prompt, model } of prompts) {
      const answer = surfaceAnswer(model);
      const where = `${fixture}: ${prompt.kind}`;
      expect(answer, where).not.toBeNull();
      expect(isLegalAnswer(prompt, answer!), where).toBe(true);
      expect(emptyAnswerControl(model.prompt.surface), where).toBe(isLegalAnswer(prompt, []));
      const { surface, host } = model.prompt;
      const candidates = "candidates" in prompt ? prompt.candidates : prompt.kind === "arrange" ? prompt.cards : null;
      if (candidates === null) continue;
      const ids = candidates.map(parseBattleCardId);
      const board = [model.view.near, model.view.far].flatMap((side) =>
        [...side.frontRank, ...side.backRank].flatMap((slot) => slot.card === null ? [] : [slot.card.id]),
      );
      const visibleBoard = new Set([...model.view.nearHand.cards.map((card) => card.id), ...board]);
      if (surface.kind === "targets") {
        const legalTargets = candidates.filter((id) => isLegalAnswer(prompt, [id])).map(parseBattleCardId);
        expect(new Set(surface.ids), where).toEqual(new Set(legalTargets));
        for (const id of ids) expect(visibleBoard.has(id), where).toBe(true);
      } else if (surface.kind === "picker") {
        expect(new Set(surface.picker.candidates.map((candidate) => candidate.card.id)), where).toEqual(new Set(ids));
        expect(new Set(surface.picker.candidateIds), where).toEqual(new Set(ids));
        if (surface.picker.presentation === "board") {
          for (const id of ids) expect(visibleBoard.has(id), where).toBe(true);
        }
      } else {
        expect(surface.kind, where).toBe("arrange");
        expect(new Set(host?.arrange?.model.cards.map((card) => card.battleCardId)), where).toEqual(new Set(ids));
      }
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

function choiceView(view: import("../../cumulus/screens/MobileBattleScreen").MobileBattleView) { return view.prompt.surface.kind === "choice" ? view.prompt.surface.choice : null; }

describe("typed payment route presentation", () => {
  it.each(["playRoute", "voidRoute"] as const)("keeps three legal %s routes beside the status with their original answers", role => {
    const from = role === "voidRoute" ? "void" : "hand";
    const { state, ids } = boardState(labEngine.catalog, { active: "player", phase: "day", player: { [from]: [SYNTHETIC.event0.id], energy: 10 } });
    const routes = role === "voidRoute" ? ["normal", "reclaim", "eventAlternative"] as const : ["normal", "offering", "eventAlternative"] as const;
    const options = routes.map((route, mode) => ({ route, mode, legal: true }));
    const prompt: PendingEnginePrompt = { id: parsePromptId("1:0:0"), kind: "chooseMode", side: "player", cancellable: true,
      purpose: { source: ids.player[from][0], cardId: SYNTHETIC.event0.id, ability: null, role }, options };
    const model = screenOf(state, prompt, state, true, labEngine);
    expect(model.prompt.surface).toMatchObject({ kind: "choice", presentation: "chooser" });
    expect(choiceView(model.view)?.presentation).toBe("chooser");
    expect(selectionsOf(model)).toEqual([0, 1, 2]);
    const smaller: Extract<PendingEnginePrompt, { kind: "chooseMode" }>[] = [
      { ...prompt, options: options.slice(0, 2) },
      { ...prompt, options: options.map((option, index) => ({ ...option, legal: index < 2 })) },
      { ...prompt, options: options.map(({ mode, legal }) => ({ mode, legal })) },
      { ...prompt, purpose: { ...prompt.purpose, role: "chooseOne" } },
    ];
    for (const other of smaller) {
      const inline = screenOf(state, other, state, true, labEngine);
      expect(choiceView(inline.view)?.presentation).toBeUndefined();
      expect(selectionsOf(inline)).toEqual(other.options.filter(option => option.legal).map(option => option.mode));
    }
  });
});

function selectionsOf(model: EngineBattleScreenModel) {
  if (model.prompt.surface.kind !== "choice") throw new Error("Expected payment choices");
  return model.prompt.surface.options.map(option => option.select.kind === "answer" ? option.select.answer : null);
}
