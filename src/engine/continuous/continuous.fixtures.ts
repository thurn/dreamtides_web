/**
 * Shared synthetic fixtures for the continuous-effect tests: anthems, cost
 * modifiers, and "until the opponent pays" cards, the engine over them, and
 * its board, spark, and play helpers.
 */
import type { EngineCardDefinition } from "../catalog";
import {
  additionalCost,
  all,
  characterYouControl,
  costPaid,
  enemyCharacter,
  energy,
  energyX,
  event,
  keyword,
  optionalCost,
  self,
  staticAbility,
  target,
} from "../dsl/builders";
import { untilOpponentPays } from "../dsl/triggers";
import type { AbilityList, FunctionalZone } from "../dsl/types";
import * as p from "../effects/primitives";
import { createEngine } from "../engine";
import type { Answer } from "../prompts/types";
import { effectiveSpark } from "../rules/spark";
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState, ContinuousChange } from "../state/types";
import { ScriptedSource } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS, CONTINUOUS_EMBLEMS } from "../testing/continuous-cards";
import { DSL, DSL_CARDS } from "../testing/dsl-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";

/** "Enemies have base ✦ 3": a second base-setting static, for ties between static abilities. */
export const enemyBaseThree: EngineCardDefinition = {
  id: syntheticId(0xa81),
  cardType: "character",
  costs: [energy(3)],
  spark: 1,
  subtype: "Mage",
  speed: "standard",
  status: "authored",
  abilities: () => [staticAbility(p.setBaseSpark(all(enemyCharacter()), 3))],
};

/** "2 X: …" — a 2● event with an X part, to show cost modifications apply to the total. */
export const twoPlusX: EngineCardDefinition = { ...DSL.fixedPlusXPoints, id: syntheticId(0xa82), costs: [energy(2), energyX()] };

export function fixture(index: number, cardType: "character" | "event", cost: number, abilities: AbilityList): EngineCardDefinition {
  return {
    id: syntheticId(index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 1 : null,
    subtype: cardType === "character" ? "Warrior" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

/** "Characters you control have Awakened." */
export const awakenedBanner = fixture(0xa83, "character", 1, () => [staticAbility(p.grant(all(characterYouControl()), "awakened"))]);
/** "This character has Awakened.", from its own static ability. */
export const selfAwakened = fixture(0xa84, "character", 1, () => [staticAbility(p.grant(self(), "awakened"))]);
/** "You may pay 2● to play this event. If you did, gain 2⍟." — a 0● event with an optional 2● additional cost. */
export const kicker = fixture(0xa85, "event", 0, () => [additionalCost(optionalCost(energy(2))), event(p.ifThen(costPaid(), p.gainPoints(2)))]);
/** "Until the opponent pays 1●, enemies have −1✦ and have all character types." — two changes under one duration. */
export const weakenUntilPays = fixture(0xa86, "event", 0, () => [
  event(p.forDuration(untilOpponentPays(1), p.sequence(p.sparkModifier(all(enemyCharacter()), -1), p.giveAllTypes(all(enemyCharacter()))))),
]);
/** "Until the opponent pays 1●, enemies have −1✦. Dissolve every enemy." — its changes are gone before it finishes resolving. */
export const weakenThenDissolve = fixture(0xa87, "event", 0, () => [
  event(p.forDuration(untilOpponentPays(1), p.sequence(p.sparkModifier(all(enemyCharacter()), -1), p.dissolve(all(enemyCharacter()))))),
]);

/** "Characters you control have +1✦", working from `zone`, on a 1● character. */
function anthemIn(index: number, zone: FunctionalZone, ...extra: AbilityList[]): EngineCardDefinition {
  return fixture(index, "character", 1, (variant) => [
    staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone }),
    ...extra.flatMap((more) => more(variant)),
  ]);
}

/** "Characters you control have +1✦." — in play only, the default. */
export const playAnthem = fixture(0xa88, "character", 1, () => [staticAbility(p.sparkModifier(all(characterYouControl()), 1))]);
/** "If this card is in your void, characters you control have +1✦. Reclaim." */
export const voidAnthem = anthemIn(0xa89, "void", () => [keyword("reclaim")]);
/** "While this card is in your hand, characters you control have +1✦." */
export const handAnthem = anthemIn(0xa8a, "hand");
/** "Wherever this card is, characters you control have +1✦." — play, void, hand, and deck. */
export const anyAnthem = anthemIn(0xa8b, "any");
/** "While this card is in your hand, characters you control have +1✦. Dissolve an enemy." — an event whose play waits on a target. */
export const handEventAnthem = fixture(0xa8c, "event", 1, () => [
  staticAbility(p.sparkModifier(all(characterYouControl()), 1), { zone: "hand" }),
  event(p.dissolve(target(enemyCharacter()))),
]);
/** "If this card is in your void, characters you control have Vengeful." */
export const voidVengeful = fixture(0xa8d, "character", 1, () => [staticAbility(p.grant(all(characterYouControl()), "vengeful"), { zone: "void" })]);
/** "Dissolve a character you control." */
export const dissolveAlly = fixture(0xa8e, "event", 0, () => [event(p.dissolve(target(characterYouControl())))]);
/** A malformed event that dissolves an ally, then resolves a static-only primitive, which throws. */
export const dissolveAllyThenFail = fixture(0xa8f, "event", 0, () => [
  event(p.sequence(p.dissolve(target(characterYouControl())), p.grantCardKeyword(p.cardsIn("hand"), "offering"))),
]);

export const engine = createEngine(
  testCatalog(
    [
      ...CONTINUOUS_CARDS,
      ...DSL_CARDS,
      enemyBaseThree,
      twoPlusX,
      awakenedBanner,
      selfAwakened,
      kicker,
      weakenUntilPays,
      weakenThenDissolve,
      playAnthem,
      voidAnthem,
      handAnthem,
      anyAnthem,
      handEventAnthem,
      voidVengeful,
      dissolveAlly,
      dissolveAllyThenFail,
    ],
    CONTINUOUS_EMBLEMS,
  ),
);
export const catalog = engine.catalog;
export const c = CONTINUOUS;
export const v = SYNTHETIC;
export const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

export function board(setup: Partial<BoardSetup>) {
  return boardState(catalog, { active: "player", phase: "day", ...setup });
}

export function spark(state: BattleState, id: InstanceId | null | undefined): number {
  if (id === null || id === undefined) throw new Error("no character");
  return effectiveSpark(state, catalog, id);
}

/** Adds a floating change at `timestamp`, as a resolving effect would. */
export function float(state: BattleState, change: ContinuousChange, timestamp: number): EffectId {
  const id: EffectId = `e${state.nextEffect}`;
  state.nextEffect += 1;
  state.floating.push({ id, controller: "player", source: { kind: "avatar", side: "player" }, timestamp, expiry: { at: "endOfTurn" }, change });
  return id;
}

export function play(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  return engine.apply(state, side, { kind: "play", card, from: "hand" }, new ScriptedSource(answers));
}
