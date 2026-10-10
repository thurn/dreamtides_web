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
  awakenPrimitive,
  banishPrimitive,
  banishUntilPrimitive,
  chooseOnePrimitive,
  copyCardPrimitive,
  costModifierPrimitive,
  createCopyInHandPrimitive,
  disableTriggersPrimitive,
  discardPrimitive,
  dissolvePrimitive,
  drawPrimitive,
  erodePrimitive,
  exhaustPrimitive,
  floatingTriggerPrimitive,
  forDurationPrimitive,
  foreseePrimitive,
  gainAdditionalSparkPrimitive,
  gainControlPrimitive,
  gainEnergyPrimitive,
  gainMaxEnergyPrimitive,
  gainPointsPrimitive,
  gainSparkPrimitive,
  giveAllTypesPrimitive,
  grantPrimitive,
  ifThenPrimitive,
  materializeFigmentCopyPrimitive,
  materializeFigmentsPrimitive,
  optionalPrimitive,
  phasePrimitive,
  preventPrimitive,
  repeatPrimitive,
  returnToHandPrimitive,
  sequencePrimitive,
  setBaseSparkPrimitive,
  sparkModifierPrimitive,
  triggerAbilityPrimitive,
  winTheGamePrimitive,
} from "./primitives";
import type { EffectNode, PrimitiveDefinition } from "./types";

type Exports = typeof primitives;

/** Every DSL effect node. */
export type Effect = {
  [K in keyof Exports]: Exports[K] extends PrimitiveDefinition<infer N> ? N : never;
}[keyof Exports];

const DEFINITIONS = {
  get awaken() {
    return awakenPrimitive;
  },
  get banish() {
    return banishPrimitive;
  },
  get banishUntil() {
    return banishUntilPrimitive;
  },
  get chooseOne() {
    return chooseOnePrimitive;
  },
  get copyCard() {
    return copyCardPrimitive;
  },
  get costModifier() {
    return costModifierPrimitive;
  },
  get createCopyInHand() {
    return createCopyInHandPrimitive;
  },
  get disableTriggers() {
    return disableTriggersPrimitive;
  },
  get discard() {
    return discardPrimitive;
  },
  get dissolve() {
    return dissolvePrimitive;
  },
  get draw() {
    return drawPrimitive;
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
  get giveAllTypes() {
    return giveAllTypesPrimitive;
  },
  get grant() {
    return grantPrimitive;
  },
  get ifThen() {
    return ifThenPrimitive;
  },
  get materializeFigmentCopy() {
    return materializeFigmentCopyPrimitive;
  },
  get materializeFigments() {
    return materializeFigmentsPrimitive;
  },
  get optional() {
    return optionalPrimitive;
  },
  get phase() {
    return phasePrimitive;
  },
  get prevent() {
    return preventPrimitive;
  },
  get repeat() {
    return repeatPrimitive;
  },
  get returnToHand() {
    return returnToHandPrimitive;
  },
  get sequence() {
    return sequencePrimitive;
  },
  get setBaseSpark() {
    return setBaseSparkPrimitive;
  },
  get sparkModifier() {
    return sparkModifierPrimitive;
  },
  get triggerAbility() {
    return triggerAbilityPrimitive;
  },
  get winTheGame() {
    return winTheGamePrimitive;
  },
} as const satisfies { readonly [Op in Effect["op"]]: PrimitiveDefinition<Extract<Effect, { op: Op }>> };

function isPrimitive(value: unknown): value is PrimitiveDefinition<EffectNode> {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    "resolve" in value &&
    typeof value.resolve === "function"
  );
}

export function primitiveDefinition(op: string): PrimitiveDefinition<EffectNode> {
  const definition: unknown = (DEFINITIONS as Readonly<Record<string, unknown>>)[op];
  if (!isPrimitive(definition) || definition.op !== op) {
    throw new Error(`Unknown effect primitive ${op}`);
  }
  return definition;
}

/** Every registered primitive op. */
export function primitiveOps(): readonly string[] {
  return Object.keys(DEFINITIONS);
}
