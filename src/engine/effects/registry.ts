/**
 * The primitive registry. Each primitive is declared in its own module and
 * re-exported by primitives/index.ts. The Effect union is the union of the
 * node types of the index's PrimitiveDefinition exports, and the table below
 * maps each node's op to its definition, so adding a primitive adds its
 * module, one `export *` line to the index, and one table entry. The
 * `satisfies` clause makes a missing entry a type error.
 *
 * The primitives import the interpreter, which looks definitions up here, so
 * this module shares an import cycle with them, and a production bundle can
 * evaluate a primitive's module after this one. Each entry is a getter, so
 * the table reads a definition when it is looked up, never while modules
 * load (scripts/import-cycles.mjs).
 */
import type * as primitives from "./primitives";
import {
  abandonPrimitive,
  abandonCardsPrimitive,
  awakenPrimitive,
  banishPrimitive,
  banishCardsPrimitive,
  banishSelfOnResolvePrimitive,
  banishUntilPrimitive,
  changeCardCostPrimitive,
  chooseOnePrimitive,
  choosePlayerPrimitive,
  chooseSubtypePrimitive,
  copyAbandonedSubjectAsFigmentPrimitive,
  copyCardPrimitive,
  copyCardTimesPrimitive,
  costModifierPrimitive,
  costModifierNthPrimitive,
  costModifierReclaimPrimitive,
  costSetterPrimitive,
  ruleModifierPrimitive,
  additionalDrawPhaseCardsPrimitive,
  selfCostReductionPrimitive,
  createCardPrimitive,
  createRandomFromPoolPrimitive,
  createCopyInHandPrimitive,
  copyFirstEventLastTurnToHandPrimitive,
  disableTriggersPrimitive,
  redrawHandPrimitive,
  redrawChosenHandPrimitive,
  discardPrimitive,
  discardChosenPrimitive,
  discoverPrimitive,
  dissolvePrimitive,
  doubleEnergyPrimitive,
  eachPlayerPrimitive,
  drawPrimitive,
  drawDreamwellPrimitive,
  drawMatchingPrimitive,
  drawThenIfPrimitive,
  erodePrimitive,
  exhaustPrimitive,
  floatingTriggerPrimitive,
  forDurationPrimitive,
  foreseePrimitive,
  gainAdditionalSparkPrimitive,
  gainAbilitiesPrimitive,
  gainControlPrimitive,
  gainEnergyPrimitive,
  gainMaxEnergyPrimitive,
  gainPointsPrimitive,
  gainSparkPrimitive,
  gainTriggeringCardSparkPrimitive,
  giveAllTypesPrimitive,
  grantCardKeywordPrimitive,
  grantPrimitive,
  grantReclaimPrimitive,
  grantTriggeringCardReclaimPrimitive,
  ifThenPrimitive,
  lookAtTopPrimitive,
  linkedBanishPrimitive,
  loseAllAbilitiesPrimitive,
  loseEnergyPrimitive,
  losePointsPrimitive,
  materializePrimitive,
  materializeKeywordModifierPrimitive,
  firstMaterializationKeywordPrimitive,
  firstPlayedSparkSetterPrimitive,
  firstPlayedCharacterEntrySparkPrimitive,
  materializeChosenPrimitive,
  materializeFigmentCopyPrimitive,
  materializeFigmentsPrimitive,
  modifyCardCostPrimitive,
  movePrimitive,
  optionalPrimitive,
  payToPrimitive,
  unlessPaysPrimitive,
  phasePrimitive,
  playFromZonePrimitive,
  playImmediatelyPrimitive,
  playRestrictionPrimitive,
  preventPrimitive,
  putInDeckPrimitive,
  rematerializePrimitive,
  reclaimNotBanishedPrimitive,
  preserveEphemeralHandPrimitive,
  offeringDiscardPaymentOptionPrimitive,
  repeatPrimitive,
  returnAllButOnePrimitive,
  returnFromVoidPrimitive,
  returnToHandPrimitive,
  revealPrimitive,
  revealDeckTopPrimitive,
  sequencePrimitive,
  setBaseSparkPrimitive,
  shuffleIntoPrimitive,
  sparkModifierPrimitive,
  journeyDeckSparkModifierPrimitive,
  journeyDeckKeywordPrimitive,
  storeCountersPrimitive,
  takeExtraTurnPrimitive,
  takeFromAmongPrimitive,
  triggerAbilityPrimitive,
  triggerAbandonedNamedPrimitive,
  repeatTriggeringAbilityPrimitive,
  winTheGamePrimitive,
  withMaterializedPrimitive,
} from "./primitives";
import type { EffectEnv, EffectNode, PrimitiveDefinition, StaticEnv } from "./types";
import type { StepContext } from "../steps/types";

type Exports = typeof primitives;

/** Infer a registered node from its actual executable or continuous hook. */
type PrimitiveNode<Definition> =
  Definition extends { resolve(ctx: StepContext, node: infer N extends EffectNode, env: EffectEnv): void } ? N
    : Definition extends { continuous: { changes(node: infer N extends EffectNode, env: StaticEnv): unknown } } ? N
      : never;

/** Every DSL effect node, derived from the authoritative primitive exports. */
export type Effect = { [K in keyof Exports]: PrimitiveNode<Exports[K]> }[keyof Exports];

/** Every node whose primitive can execute during a resolution. */
export type ResolvingEffect = {
  [K in keyof Exports]: Exports[K] extends { resolve: unknown } ? PrimitiveNode<Exports[K]> : never;
}[keyof Exports];

/** Every node whose primitive supplies live continuous changes. */
export type StaticEffect = {
  [K in keyof Exports]: Exports[K] extends { continuous: unknown } ? PrimitiveNode<Exports[K]> : never;
}[keyof Exports];

const DEFINITIONS = {
  get firstPlayedSparkSetter() { return firstPlayedSparkSetterPrimitive; },
  get costSetter() { return costSetterPrimitive; },
  get costModifierNth() { return costModifierNthPrimitive; },
  get costModifierReclaim() { return costModifierReclaimPrimitive; },
  get ruleModifier() { return ruleModifierPrimitive; },
  get additionalDrawPhaseCards() { return additionalDrawPhaseCardsPrimitive; },
  get abandon() {
    return abandonPrimitive;
  },
  get abandonCards() {
    return abandonCardsPrimitive;
  },
  get awaken() {
    return awakenPrimitive;
  },
  get banish() {
    return banishPrimitive;
  },
  get banishCards() {
    return banishCardsPrimitive;
  },
  get banishSelfOnResolve() {
    return banishSelfOnResolvePrimitive;
  },
  get banishUntil() {
    return banishUntilPrimitive;
  },
  get changeCardCost() {
    return changeCardCostPrimitive;
  },
  get chooseOne() {
    return chooseOnePrimitive;
  },
  get choosePlayer() {
    return choosePlayerPrimitive;
  },
  get chooseSubtype() {
    return chooseSubtypePrimitive;
  },
  get copyAbandonedSubjectAsFigment() {
    return copyAbandonedSubjectAsFigmentPrimitive;
  },
  get copyCard() {
    return copyCardPrimitive;
  },
  get copyCardTimes() {
    return copyCardTimesPrimitive;
  },
  get selfCostReduction() {
    return selfCostReductionPrimitive;
  },
  get costModifier() {
    return costModifierPrimitive;
  },
  get createCard() {
    return createCardPrimitive;
  },
  get createRandomFromPool() {
    return createRandomFromPoolPrimitive;
  },
  get copyFirstEventLastTurnToHand() { return copyFirstEventLastTurnToHandPrimitive; },
  get createCopyInHand() {
    return createCopyInHandPrimitive;
  },
  get disableTriggers() {
    return disableTriggersPrimitive;
  },
  get redrawHand() {
    return redrawHandPrimitive;
  },
  get redrawChosenHand() {
    return redrawChosenHandPrimitive;
  },
  get discard() {
    return discardPrimitive;
  },
  get discardChosen() {
    return discardChosenPrimitive;
  },
  get discover() {
    return discoverPrimitive;
  },
  get dissolve() {
    return dissolvePrimitive;
  },
  get doubleEnergy() {
    return doubleEnergyPrimitive;
  },
  get eachPlayer() {
    return eachPlayerPrimitive;
  },
  get drawMatching() {
    return drawMatchingPrimitive;
  },
  get drawDreamwell() {
    return drawDreamwellPrimitive;
  },
  get draw() {
    return drawPrimitive;
  },
  get drawThenIf() {
    return drawThenIfPrimitive;
  },
  get erode() {
    return erodePrimitive;
  },
  get exhaust() {
    return exhaustPrimitive;
  },
  get floatingTrigger() {
    return floatingTriggerPrimitive;
  },
  get forDuration() {
    return forDurationPrimitive;
  },
  get foresee() {
    return foreseePrimitive;
  },
  get gainAdditionalSpark() {
    return gainAdditionalSparkPrimitive;
  },
  get gainAbilities() {
    return gainAbilitiesPrimitive;
  },
  get gainControl() {
    return gainControlPrimitive;
  },
  get gainEnergy() {
    return gainEnergyPrimitive;
  },
  get gainMaxEnergy() {
    return gainMaxEnergyPrimitive;
  },
  get gainPoints() {
    return gainPointsPrimitive;
  },
  get gainSpark() {
    return gainSparkPrimitive;
  },
  get gainTriggeringCardSpark() {
    return gainTriggeringCardSparkPrimitive;
  },
  get giveAllTypes() {
    return giveAllTypesPrimitive;
  },
  get grant() {
    return grantPrimitive;
  },
  get grantCardKeyword() {
    return grantCardKeywordPrimitive;
  },
  get grantReclaim() {
    return grantReclaimPrimitive;
  },
  get grantTriggeringCardReclaim() {
    return grantTriggeringCardReclaimPrimitive;
  },
  get ifThen() {
    return ifThenPrimitive;
  },
  get linkedBanish() { return linkedBanishPrimitive; },
  get lookAtTop() {
    return lookAtTopPrimitive;
  },
  get loseAllAbilities() {
    return loseAllAbilitiesPrimitive;
  },
  get loseEnergy() {
    return loseEnergyPrimitive;
  },
  get losePoints() {
    return losePointsPrimitive;
  },
  get materializeChosen() { return materializeChosenPrimitive; },
  get materializeKeywordModifier() { return materializeKeywordModifierPrimitive; },
  get firstMaterializationKeyword() { return firstMaterializationKeywordPrimitive; },
  get firstPlayedCharacterEntrySpark() { return firstPlayedCharacterEntrySparkPrimitive; },
  get materialize() {
    return materializePrimitive;
  },
  get materializeFigmentCopy() {
    return materializeFigmentCopyPrimitive;
  },
  get materializeFigments() {
    return materializeFigmentsPrimitive;
  },
  get modifyCardCost() {
    return modifyCardCostPrimitive;
  },
  get move() {
    return movePrimitive;
  },
  get payTo() {
    return payToPrimitive;
  },
  get unlessPays() {
    return unlessPaysPrimitive;
  },
  get optional() {
    return optionalPrimitive;
  },
  get phase() {
    return phasePrimitive;
  },
  get playImmediately() {
    return playImmediatelyPrimitive;
  },
  get playFromZone() {
    return playFromZonePrimitive;
  },
  get playRestriction() {
    return playRestrictionPrimitive;
  },
  get prevent() {
    return preventPrimitive;
  },
  get putInDeck() {
    return putInDeckPrimitive;
  },
  get rematerialize() {
    return rematerializePrimitive;
  },
  get preserveEphemeralHand() { return preserveEphemeralHandPrimitive; },
  get offeringDiscardPaymentOption() { return offeringDiscardPaymentOptionPrimitive; },
  get reclaimNotBanished() {
    return reclaimNotBanishedPrimitive;
  },
  get repeat() {
    return repeatPrimitive;
  },
  get returnFromVoid() {
    return returnFromVoidPrimitive;
  },
  get returnAllButOne() {
    return returnAllButOnePrimitive;
  },
  get returnToHand() {
    return returnToHandPrimitive;
  },
  get revealDeckTop() { return revealDeckTopPrimitive; },
  get reveal() {
    return revealPrimitive;
  },
  get sequence() {
    return sequencePrimitive;
  },
  get setBaseSpark() {
    return setBaseSparkPrimitive;
  },
  get shuffleInto() {
    return shuffleIntoPrimitive;
  },
  get journeyDeckSparkModifier() { return journeyDeckSparkModifierPrimitive; },
  get journeyDeckKeyword() { return journeyDeckKeywordPrimitive; },
  get sparkModifier() {
    return sparkModifierPrimitive;
  },
  get storeCounters() {
    return storeCountersPrimitive;
  },
  get takeExtraTurn() {
    return takeExtraTurnPrimitive;
  },
  get takeFromAmong() {
    return takeFromAmongPrimitive;
  },
  get triggerAbandonedNamed() { return triggerAbandonedNamedPrimitive; },
  get repeatTriggeringAbility() {
    return repeatTriggeringAbilityPrimitive;
  },
  get triggerAbility() {
    return triggerAbilityPrimitive;
  },
  get winTheGame() {
    return winTheGamePrimitive;
  },
  get withMaterialized() {
    return withMaterializedPrimitive;
  },
} as const satisfies { readonly [Op in Effect["op"]]: PrimitiveDefinition<Extract<Effect, { op: Op }>> };

function isPrimitive(value: unknown): value is PrimitiveDefinition<EffectNode> {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    (("resolve" in value && typeof value.resolve === "function") ||
      ("continuous" in value && typeof value.continuous === "object" && value.continuous !== null &&
        "changes" in value.continuous && typeof value.continuous.changes === "function"))
  );
}

export function primitiveDefinition(op: string): PrimitiveDefinition<EffectNode> {
  const definition: unknown = (DEFINITIONS as Readonly<Record<string, unknown>>)[op];
  if (!isPrimitive(definition) || definition.op !== op) {
    throw new Error(`Unknown effect primitive ${op}`);
  }
  return definition;
}

/**
 * The heterogeneous registry erases each hook's node parameter at lookup.
 * Raw runtime ingress is checked here, at resolution, inside the caller's transaction.
 */
export function resolvePrimitiveUnchecked(ctx: StepContext, node: EffectNode, env: EffectEnv): void {
  const definition = primitiveDefinition(node.op);
  if (definition.resolve === undefined) throw new Error(node.op + " is a static ability and never resolves");
  definition.resolve(ctx, node, env);
}

/** Every registered primitive op. */
export function primitiveOps(): readonly string[] {
  return Object.keys(DEFINITIONS);
}
