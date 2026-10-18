/**
 * Contracts of the Expert prompt strategy: every prompt kind gets a legal
 * answer for its own chooser, selections follow the role's orientation and
 * the injected card valuation, an injected answer valuation picks among
 * legal answers, and the optional-chain bound ends loopable prompts only.
 */
import { describe, expect, it } from "vitest";
import { AI } from "../../content/ai";
import { parseCardSubtype } from "../../types/card-identity";
import { isLegalAnswer } from "../prompts/answers";
import type { Answer, Prompt, PromptRole } from "../prompts/types";
import { SIDES, type InstanceId, type Side } from "../state/ids";
import { enemyCharacter, event, target } from "../dsl/builders";
import { dissolve } from "../effects/primitives/dissolve";
import { createEngine } from "../engine";
import { boardState } from "../testing/board";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { expertContext } from "./expert-contracts";
import { expertAnswer, featureCardValue, type CardValue, type ExpertPromptContext, type ExpertPromptWeights } from "./expert-prompts";
import { deck, entries } from "./policy.fixtures";

const WEIGHTS: ExpertPromptWeights = { scoredAnswers: 16, cheapUnlessCost: 2 };
const [mineLow, mineHigh, theirsLow, theirsHigh] = ["i1", "i2", "i3", "i4"] as InstanceId[];
const VALUES: Readonly<Record<string, CardValue>> = {
  i1: { mine: true, value: 1 }, i2: { mine: true, value: 5 }, i3: { mine: false, value: 2 }, i4: { mine: false, value: 6 },
};
const WARRIOR = parseCardSubtype("Warrior"), SURVIVOR = parseCardSubtype("Survivor");

function context(side: Side, extra: Partial<ExpertPromptContext> = {}): ExpertPromptContext {
  return {
    side, energy: 3, automaticChoices: 0,
    cardValue: (id) => VALUES[id] ?? null,
    discoverCosts: () => new Set([1, 3]),
    subtypeCounts: () => new Map([[WARRIOR, 1], [SURVIVOR, 4]]),
    ...extra,
  };
}

const purpose = (role: PromptRole) => ({ source: null, cardId: null, ability: null, role });
const ALL = [mineLow, mineHigh, theirsLow, theirsHigh] as InstanceId[];

function prompts(side: Side): Prompt[] {
  const base = { side, cancellable: false };
  return [
    { ...base, kind: "chooseTargets", purpose: purpose("target"), candidates: ALL, min: 1, max: 1 },
    { ...base, kind: "chooseCards", purpose: purpose("discardCost"), candidates: ALL, min: 1, max: 2 },
    { ...base, kind: "chooseCards", purpose: purpose("discover"), candidates: ALL, min: 1, max: 1 },
    { ...base, kind: "chooseMode", purpose: purpose("chooseSubtype"), options: [{ mode: 0, legal: true }, { mode: 1, legal: true }], subtypes: [WARRIOR, SURVIVOR] },
    { ...base, kind: "chooseMode", purpose: purpose("chooseOne"), options: [{ mode: 0, legal: false }, { mode: 1, legal: true }, { mode: 2, legal: true }] },
    { ...base, kind: "chooseNumber", purpose: purpose("chooseX"), min: 0, max: 4 },
    { ...base, kind: "chooseNumber", purpose: purpose("discoverCost"), min: 0, max: 5 },
    { ...base, kind: "chooseSlot", purpose: purpose("move"), fieldSide: side, slots: [{ rank: "back", index: 2 }, { rank: "front", index: 0 }] },
    { ...base, kind: "arrange", purpose: purpose("foresee"), cards: [mineLow, mineHigh] as InstanceId[], destinations: [{ to: "top", min: 0, max: 2 }, { to: "void", min: 0, max: 2 }] },
    { ...base, kind: "confirm", purpose: purpose("youMay") },
    { ...base, kind: "payOrDecline", purpose: purpose("preventUnlessPays"), energy: 2, payable: true },
  ];
}

const answerOf = (prompt: Prompt, ctx: ExpertPromptContext = context(prompt.side)): Answer => expertAnswer(prompt, ctx, WEIGHTS).answer;

describe("the Expert prompt strategy", () => {
  for (const side of SIDES) {
    it(`answers every prompt kind legally for ${side}, with and without an answer valuation`, () => {
      for (const prompt of prompts(side)) {
        expect(isLegalAnswer(prompt, answerOf(prompt)), prompt.kind).toBe(true);
        expect(isLegalAnswer(prompt, answerOf(prompt, context(side, { answerValue: () => 0 }))), prompt.kind).toBe(true);
      }
    });

    it(`orients selections by role for ${side}`, () => {
      const [target, discardCost, discover] = prompts(side);
      expect(target === undefined ? null : answerOf(target)).toEqual([theirsHigh]);
      expect(discardCost === undefined ? null : answerOf(discardCost)).toEqual([mineLow]);
      expect(discover === undefined ? null : answerOf(discover)).toEqual([theirsHigh]);
    });

    it(`picks numbers, modes and types for ${side}`, () => {
      const byKind = prompts(side);
      expect(answerOf(byKind[3])).toBe(1);
      expect(answerOf(byKind[4])).toBe(1);
      expect(answerOf(byKind[5])).toBe(4);
      expect(answerOf(byKind[6])).toBe(3);
    });

    it(`pays a cheap affordable unless cost only, for ${side}`, () => {
      const pay = (energy: number, cost: number, payable = true) =>
        answerOf({ side, cancellable: false, kind: "payOrDecline", purpose: purpose("preventUnlessPays"), energy: cost, payable }, context(side, { energy }));
      expect(pay(3, 2)).toBe(true);
      expect(pay(1, 2)).toBe(false);
      expect(pay(5, 3)).toBe(false);
      expect(pay(3, 2, false)).toBe(false);
    });

    it(`keeps the answer its injected valuation scores best, for ${side}`, () => {
      const target = prompts(side)[0];
      const decision = expertAnswer(target, context(side, { answerValue: (answer) => (Array.isArray(answer) && answer[0] === theirsLow ? 10 : 0) }), WEIGHTS);
      expect(decision).toMatchObject({ answer: [theirsLow], reason: "valuation" });
      expect(decision.scored).toBeGreaterThan(1);
      const unscored = expertAnswer(target, context(side, { answerValue: () => null }), WEIGHTS);
      expect(unscored).toMatchObject({ answer: [theirsHigh], reason: "heuristic", scored: 0 });
    });

    it(`declines loopable prompts once the optional chain is spent, but answers finite ones, for ${side}`, () => {
      const spent = context(side, { automaticChoices: AI.enginePolicy.optionalChainCap });
      const [, , , , , , , , , confirm, unless] = prompts(side);
      expect(confirm === undefined ? null : expertAnswer(confirm, spent, WEIGHTS)).toMatchObject({ answer: false, reason: "chainSpent" });
      expect(unless === undefined ? null : expertAnswer(unless, spent, WEIGHTS)).toMatchObject({ answer: true, reason: "heuristic" });
    });
  }

  it("answers only its own chooser's prompts", () => {
    expect(() => expertAnswer(prompts("player")[0], context("enemy"), WEIGHTS)).toThrow();
  });

  it("values a card by its spark and its favorable AST features, from the chooser's view", () => {
    const enemyRemoval = { ...SYNTHETIC.dissolveVictim, id: syntheticId(0x7c01), abilities: () => [event(dissolve(target(enemyCharacter())))] };
    const engine = createEngine(testCatalog([enemyRemoval]));
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { front: [SYNTHETIC.vanilla1.id], hand: [enemyRemoval.id, SYNTHETIC.dissolveVictim.id] },
      enemy: { front: [SYNTHETIC.vanilla1.id], hand: [SYNTHETIC.vanilla1.id] },
    });
    const expert = expertContext(engine, "player", { player: entries(deck), enemy: entries(deck) });
    const value = featureCardValue(engine.view(state, "player"), "player", (cardId) => expert.features(cardId));
    const [removal, eitherSide] = ids.player.hand;
    const own = ids.player.front[0], theirs = ids.enemy.front[0], hidden = ids.enemy.hand[0];
    if (own == null || theirs == null || removal === undefined || eitherSide === undefined || hidden === undefined) throw new Error("missing fixture cards");
    expect(value(own)).toEqual({ mine: true, value: 1 });
    expect(value(theirs)).toEqual({ mine: false, value: 1 });
    expect(value(removal)?.value).toBeGreaterThan(value(eitherSide)?.value ?? Infinity);
    expect(value(hidden)).toBeNull();
  });
});
