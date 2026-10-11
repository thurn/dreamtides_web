/**
 * Synthetic authored cards written in the ability DSL: fixtures for
 * primitive tests and the fuzzer, never catalog content. UUID prefix
 * `5e5e5e5e-…-0000000002xx`.
 */
import type { EngineCardDefinition } from "../catalog";
import {
  anyCharacter,
  characterYouControl,
  enemyCharacter,
  energy,
  energyX,
  event,
  everyIn,
  fromVoid,
  keyword,
  noCardsIn,
  staticAbility,
  target,
  thisCardIn,
  topOfDeck,
  upTo,
  winCondition,
  x,
} from "../dsl/builders";
import { onDissolved, triggered } from "../dsl/triggers";
import type { Ability, CardCost } from "../dsl/types";
import * as p from "../effects/primitives";
import { syntheticId } from "./synthetic-cards";

function authored(
  index: number,
  cardType: "character" | "event",
  cost: number | readonly CardCost[],
  abilities: EngineCardDefinition["abilities"],
  options: Partial<Pick<EngineCardDefinition, "speed" | "spark" | "subtype">> = {},
): EngineCardDefinition {
  return {
    id: syntheticId(200 + index),
    cardType,
    costs: typeof cost === "number" ? [energy(cost)] : cost,
    spark: cardType === "character" ? (options.spark ?? 1) : null,
    subtype: options.subtype ?? (cardType === "character" ? "Warrior" : ""),
    speed: options.speed ?? "standard",
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
  pointsTimesX: authored(20, "event", [energyX()], events(event(p.repeat(x(), p.gainPoints(1))))),
  /** "Exhaust an enemy; it gains +1✦": one target spec used in two places is one target. */
  exhaustAndPumpSame: authored(21, "event", 1, () => {
    const enemy = target(enemyCharacter());
    return [event(p.sequence(p.exhaust(enemy), p.gainSpark(enemy, 1)))];
  }),
  vengefulCharacter: authored(22, "character", 1, () => [keyword("vengeful")], { spark: 1 }),
  awakenedCharacter: authored(23, "character", 2, () => [keyword("awakened")], { spark: 2 }),
  /** "Amplified: draw 3 instead of 2." */
  amplifiedDraw: authored(24, "event", 1, (variant) => [event(p.draw(variant.amplified ? 3 : 2))]),
  /** "1 X: Gain X⍟" — a fixed cost plus X. */
  fixedPlusXPoints: authored(25, "event", [energy(1), energyX()], events(event(p.gainPoints(x())))),
  /** An X-cost character with X spark. */
  variableSpark: { ...authored(26, "character", [energyX()], () => [], { spark: "x" }), status: "vanilla" },
  /** "Choose one: Dissolve an enemy; or gain 1⍟." */
  chooseDissolveOrPoints: authored(27, "event", 0, events(event(p.chooseOne(p.dissolve(target(enemyCharacter())), p.gainPoints(1))))),
  /** "Choose one: Gain 1⍟; or dissolve an enemy." then "Return a character to its owner's hand." */
  modalThenBounce: authored(28, "event", 0, events(
    event(p.chooseOne(p.gainPoints(1), p.dissolve(target(enemyCharacter())))),
    event(p.returnToHand(target(anyCharacter()))),
  )),
  /** A character: "If you have no cards in your deck, you win the game." (C15) */
  winWithEmptyDeck: authored(29, "character", 2, () => [winCondition(noCardsIn("deck"))], { spark: 1 }),
  /** An event, as Terminus reads: "If you have no cards in your deck, you win the game." */
  winIfDeckEmpty: authored(30, "event", 1, events(event(p.ifThen(noCardsIn("deck"), p.winTheGame())))),
  /** A character that cannot be targeted by effects (C17). */
  untargetableCharacter: authored(31, "character", 1, () => [keyword("cannotBeTargeted")], { spark: 1 }),
  /** ❖❖ "A character you control cannot be targeted by effects this turn." */
  shieldAlly: authored(32, "event", 1, events(event(p.grant(target(characterYouControl()), "cannotBeTargeted", "untilEndOfTurn"))), { speed: "interrupt" }),
  /** "Discover a character." */
  discoverCharacter: authored(33, "event", 0, events(event(p.discover({ cardType: "character" })))),
  /** "Discover an event." */
  discoverEvent: authored(34, "event", 0, events(event(p.discover({ cardType: "event" })))),
  /** A Mage, as Nomad of Endless Paths reads: "Cards in your hand have Offering." */
  handOffering: authored(35, "character", 2, () => [staticAbility(p.grantCardKeyword(p.cardsIn("hand"), "offering"))], { subtype: "Mage" }),
  /** "Mage characters in your void have Reclaim." */
  voidMagesReclaim: authored(36, "character", 2, () => [staticAbility(p.grantCardKeyword(p.cardsIn("void", { cardType: "character", subtype: "Mage" }), "reclaim"))], { subtype: "Mage" }),
  /** "Add a copy of a character in your void to your hand": a void target chosen as the card is played. */
  copyVoidCharacter: authored(37, "event", 1, events(event(p.createCopyInHand(fromVoid({ cardType: "character" }))))),
  /** "Add copies of up to two cards in the opponent's void to your hand." */
  copyOpponentVoidCards: authored(38, "event", 1, events(event(p.createCopyInHand(fromVoid({}, { player: "opponent", count: 2, upTo: true }))))),
  /** "Add a copy of each event in your void to your hand." */
  copyVoidEvents: authored(39, "event", 1, events(event(p.createCopyInHand(everyIn("void", { cardType: "event" }))))),
  /** "Add a copy of the top card of your deck to your hand, if it is a character." */
  copyTopCharacter: authored(40, "event", 1, events(event(p.createCopyInHand(topOfDeck(1, { cardType: "character" }))))),
  /** "▸Dissolved: Add a copy of another warrior in your void to your hand": a void target chosen as the trigger resolves. */
  dissolvedCopiesVoidWarrior: authored(41, "character", 1, () => [triggered(onDissolved(), p.createCopyInHand(fromVoid({ subtype: "Warrior" }, { another: true })))], { spark: 1 }),
  /** "▸Dissolved: Add a copy of this character from your void to your hand." */
  dissolvedCopiesItself: authored(42, "character", 1, () => [triggered(onDissolved(), p.createCopyInHand(thisCardIn("void")))], { spark: 1 }),
  /** "Erode 3. You may put a ≤2● cost character from among those cards into your hand." */
  erodeTakeCharacter: authored(43, "event", 0, events(event(p.takeFromAmong(p.movedBy(p.erode(3)), { filter: { cardType: "character" }, costAtMost: 2, optional: true })))),
  /** "Look at the opponent's hand. Put a card from it into your hand." */
  takeFromOpponentHand: authored(44, "event", 0, events(event(p.takeFromAmong(p.opponentHand())))),
  /** "Look at the top 4 cards of your deck. Choose one: Draw 1 of the cards, or draw 2 of the cards and they gain ephemeral." */
  lookAtTopDraw: authored(45, "event", 0, events(event(p.chooseOne(p.lookAtTop(4, { draw: 1 }), p.lookAtTop(4, { draw: 2, ephemeral: true }))))),
} as const;

export const DSL_CARDS: readonly EngineCardDefinition[] = Object.values(DSL);
