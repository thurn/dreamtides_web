/**
 * Synthetic fixtures for loops (rules § Infinite Loops): optional loops a
 * player can repeat, and mandatory trigger cycles. Test fixtures only, never
 * catalog content. Cards use synthetic ids 0xd00+.
 */
import type { EngineCardDefinition } from "../catalog";
import { activated, characterYouControl, choiceCost, energy, self, target } from "../dsl/builders";
import { onMaterialized, triggered } from "../dsl/triggers";
import type { AbilityList } from "../dsl/types";
import * as p from "../effects/primitives";
import type { ChooseTargetsPrompt } from "../prompts/types";
import { instanceOf } from "../rules/zones";
import { opponent } from "../state/ids";
import { syntheticId } from "./synthetic-cards";

function character(index: number, abilities: AbilityList): EngineCardDefinition {
  return {
    id: syntheticId(0xd00 + index),
    cardType: "character",
    costs: [energy(1)],
    spark: 1,
    subtype: "Warrior",
    speed: "standard",
    keywords: [],
    status: "authored",
    abilities,
  };
}

/** Optional-loop fixtures by role. */
export const LOOP = {
  /** "Gain 1⍟." — a free activated ability: an optional loop with a gain each time. */
  freePoints: character(1, () => [activated([], p.gainPoints(1))]),
  /** "Choose one: Gain 1⍟; or gain 1●." — a free loop with a prompt in each iteration. */
  freeChoice: character(2, () => [activated([], p.chooseOne(p.gainPoints(1), p.gainEnergy(1)))]),
  /**
   * "Pay 3● or pay nothing: Gain 1●." — the cost choice is forced until 3●
   * is affordable, then offers both alternatives: a choice that changes.
   */
  thresholdChoice: character(3, () => [activated([choiceCost([energy(3)], [])], p.gainEnergy(1))]),
  /** "The opponent loses 1●." — a loop whose iterations stop changing the battle once the opponent has none. */
  drain: character(5, () => [activated([], p.gainEnergy(-1, "opponent"))]),
  /**
   * "▸Materialized: Gain 1⍟, then return this character to your hand." — at
   * no cost: a loop of plays, resolutions, and triggers.
   */
  bouncer: { ...character(6, () => [triggered(onMaterialized(), p.sequence(p.gainPoints(1), p.returnToHand(self())))]), costs: [energy(0)] },
  /** An Interrupt event with no effect, playable only while the opponent has 3⍟ or more: a response that appears mid-loop. */
  lateResponse: {
    id: syntheticId(0xd04),
    cardType: "event",
    costs: [energy(0)],
    spark: null,
    subtype: "",
    speed: "interrupt",
    keywords: [],
    status: "authored",
    abilities: () => [],
    synthetic: {
      play: (ctx, card) => {
        const side = instanceOf(ctx.state, card).controller;
        if (ctx.state.sides[opponent(side)].score < 3) {
          // An empty required prompt makes the play illegal.
          ctx.choose<ChooseTargetsPrompt>({
            kind: "chooseTargets",
            side,
            purpose: { source: card, cardId: syntheticId(0xd04), ability: 0, role: "target" },
            candidates: [],
            min: 1,
            max: 1,
          });
        }
        return {};
      },
    },
  },
} as const satisfies Record<string, EngineCardDefinition>;

export const LOOP_CARDS: readonly EngineCardDefinition[] = Object.values(LOOP);

/** Mandatory-cycle fixtures by role: triggers nobody can stop. */
export const CYCLE = {
  /** "▸Materialized: Trigger this character's ▸Materialized abilities." — repeats the same state exactly. */
  echo: character(11, () => [triggered(onMaterialized(), p.triggerAbility(self(), "materialized"))]),
  /** "▸Materialized: Gain 1●, then trigger this character's ▸Materialized abilities." — never repeats a state. */
  growingEcho: character(12, () => [triggered(onMaterialized(), p.sequence(p.gainEnergy(1), p.triggerAbility(self(), "materialized")))]),
  /** "▸Materialized: You may trigger this character's ▸Materialized abilities." — repeats while its controller chooses to. */
  optionalEcho: character(13, () => [triggered(onMaterialized(), p.optional(p.triggerAbility(self(), "materialized")))]),
  /**
   * "▸Materialized: You may gain 1●, then trigger this character's
   * ▸Materialized abilities." — never repeats a state, and continues while
   * its controller chooses to.
   */
  optionalGrowingEcho: character(14, () => [
    triggered(onMaterialized(), p.optional(p.sequence(p.gainEnergy(1), p.triggerAbility(self(), "materialized")))),
  ]),
  /**
   * "▸Materialized: Trigger target character you control's ▸Materialized
   * abilities." — alone in play, its target choice is forced, so it repeats
   * the same state exactly.
   */
  targetedEcho: character(15, () => [triggered(onMaterialized(), p.triggerAbility(target(characterYouControl()), "materialized"))]),
  /**
   * "▸Materialized: If you have 8● or more, trigger this character's
   * ▸Materialized abilities; otherwise gain 1●, then trigger them." — repeats
   * the same state exactly once its controller reaches 8●: a cycle entered as
   * late in the run as its starting ● puts it.
   */
  lateEcho: character(16, () => {
    const echo = p.triggerAbility(self(), "materialized");
    return [triggered(onMaterialized(), p.ifThen({ cond: "energyAtLeast", amount: 8 }, echo, p.sequence(p.gainEnergy(1), echo)))];
  }),
} as const satisfies Record<string, EngineCardDefinition>;

export const CYCLE_CARDS: readonly EngineCardDefinition[] = Object.values(CYCLE);
