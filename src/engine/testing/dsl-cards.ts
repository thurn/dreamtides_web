/**
 * Synthetic authored cards written in the ability DSL: fixtures for
 * primitive tests and the fuzzer, never catalog content. UUID prefix
 * `5e5e5e5e-…-0000000002xx`.
 */
import type { EngineCardDefinition } from "../catalog";
import { anyCharacter, characterYouControl, enemyCharacter, event, keyword, target, upTo, x } from "../dsl/builders";
import type { Ability } from "../dsl/types";
import * as p from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

function authored(
  index: number,
  cardType: "character" | "event",
  cost: number | null,
  abilities: EngineCardDefinition["abilities"],
  options: Partial<Pick<EngineCardDefinition, "speed" | "spark" | "subtype">> = {},
): EngineCardDefinition {
  return {
    id: syntheticId(200 + index),
    cardType,
    cost,
    spark: cardType === "character" ? (options.spark ?? 1) : null,
    subtype: options.subtype ?? (cardType === "character" ? "Warrior" : ""),
    speed: options.speed ?? "standard",
    keywords: [],
    status: "authored",
    abilities,
  };
}

const events = (...list: Ability[]) => () => list;

/** DSL fixtures by role. */
export const DSL = {
  drawTwo: authored(1, "event", 1, events(event(p.draw(2)))),
  gainTwoEnergy: authored(2, "event", 0, events(event(p.gainEnergy(2)))),
  gainThreePoints: authored(3, "event", 1, events(event(p.gainPoints(3)))),
  opponentLosesFive: authored(4, "event", 1, events(event(p.gainPoints(-5, "opponent")))),
  discardTwo: authored(5, "event", 0, events(event(p.discard(2)))),
  opponentDiscardsRandom: authored(6, "event", 1, events(event(p.discardRandom(1, "opponent")))),
  foreseeTwo: authored(7, "event", 0, events(event(p.foresee(2)))),
  erodeThree: authored(8, "event", 0, events(event(p.erode(3, "opponent")))),
  dissolveEnemy: authored(9, "event", 2, events(event(p.dissolve(target(enemyCharacter())))), { speed: "fast" }),
  banishEnemyWithSparkAtMostTwo: authored(10, "event", 1, events(event(p.banish(target(enemyCharacter({ sparkAtMost: 2 })))))),
  returnAnyToHand: authored(11, "event", 1, events(event(p.returnToHand(target(anyCharacter()))))),
  pumpUntilEndOfTurn: authored(12, "event", 0, events(event(p.gainSpark(target(characterYouControl()), 3, "untilEndOfTurn")))),
  pumpPermanently: authored(13, "event", 1, events(event(p.gainSpark(upTo(characterYouControl(), 2), 1)))),
  awakenAll: authored(14, "event", 0, events(event(p.awaken({ kind: "all", selector: characterYouControl() })))),
  exhaustEnemies: authored(15, "event", 1, events(event(p.exhaust({ kind: "all", selector: enemyCharacter() })))),
  drawThenEnergy: authored(16, "event", 1, events(event(p.sequence(p.draw(1), p.gainEnergy(1))))),
  chooseDrawOrPoints: authored(17, "event", 0, events(event(p.chooseOne(p.draw(1), p.gainPoints(1))))),
  mayDrawTwo: authored(18, "event", 0, events(event(p.optional(p.draw(2))))),
  drawIfTwoWarriors: authored(19, "event", 0, events(event(p.ifThen({ cond: "controls", selector: characterYouControl({ subtype: "Warrior" }), atLeast: 2 }, p.draw(1), p.gainEnergy(1))))),
  pointsTimesX: authored(20, "event", null, events(event(p.repeat(x(), p.gainPoints(1))))),
  /** "Exhaust an enemy; it gains +1✦": one target spec used in two places is one target. */
  exhaustAndPumpSame: authored(21, "event", 1, () => {
    const enemy = target(enemyCharacter());
    return [event(p.sequence(p.exhaust(enemy), p.gainSpark(enemy, 1)))];
  }),
  vengefulCharacter: authored(22, "character", 1, () => [keyword("vengeful")], { spark: 1 }),
  awakenedCharacter: authored(23, "character", 2, () => [keyword("awakened")], { spark: 2 }),
  /** "Amplified: draw 3 instead of 2." */
  amplifiedDraw: authored(24, "event", 1, (variant) => [event(p.draw(variant.amplified ? 3 : 2))]),
} as const;

export const DSL_CARDS: readonly EngineCardDefinition[] = Object.values(DSL);
