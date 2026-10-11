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
import { createFoldAdapter, type BattleSlice } from "../../engine/fold/slice";
import { PROMPT_LAB_DEFINITIONS, PROMPT_LAB_FIXTURES, promptLabBattle } from "../../engine/testing/prompt-lab";
import { firstLegalAnswer, isLegalAnswer } from "../../engine/prompts/answers";
import type { Answer, PromptRole } from "../../engine/prompts/types";
import { parseBattleCardId } from "../../types/identifiers";
import {
  type EngineBattleAffordances,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import { type PendingEnginePrompt, type PromptSurface } from "./prompt-host-view-model";
import { screenOf } from "./engine-battle-view-model.fixtures";

const labEngine = createEngine(
  createCatalog(PROMPT_LAB_DEFINITIONS.cards, [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments),
);

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
      chooseCost: true, optionalCost: true, optionalPayment: true, abandonCost: true, returnCost: true, abandon: true, discardCost: true, revealCost: true,
      banishAnyVoidCost: true, banishCost: true, offeringCost: true, discard: true, discardChosen: true, banishChosen: true, foresee: true,
      lookAtTop: true, discover: true, discoverCost: true, chooseAmong: true, chooseFromOpponentHand: true, shuffleInto: true, putInDeck: true,
      youMay: true, preventUnlessPays: true, move: true, preventUnlessAbandons: true,
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
