import type { EngineCatalog } from "../catalog";
import type { PromptPurpose, PromptRole } from "../prompts/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { AbandonedPosition, AbilityOrigin, LinkedSourceContext, BattleState, ContinuousChange, Expiry, SparkGain } from "../state/types";
import type { StepContext } from "../steps/types";
import type { CharacteristicsReader } from "../dsl/selectors";
import type {
  CharacterRef,
  PlayTimeTarget,
  SelfSpec,
  StackTargetSpec,
  SubjectSpec,
  TargetSpec,
  ValueExpr,
  Variant,
  ZoneCardSpec,
} from "../dsl/types";

/**
 * The cards an effect names in any zone: a chosen character in play or card
 * on the stack, the card the triggering event concerns ("copy it"), the
 * source in whatever zone it is, or cards in a deck, hand, or void.
 */
export type CardRef = TargetSpec | StackTargetSpec | SubjectSpec | SelfSpec | ZoneCardSpec;

/**
 * "Them" after a materialize (`withMaterialized`): the characters the nearest
 * enclosing binding's materialize put into play, each while it is in play as
 * the effect naming them resolves, whoever controls it then (rules § Keywords
 * and Effects → Materialize, RD-hv-umm2.392-1). Card identity persists across
 * zones, so a member that left play and entered it again is named again. A
 * floating or delayed trigger created inside the binding keeps the binding's
 * cards for its own later resolution. `banishCards` and `abandonCards` accept
 * it; abandon acts only on members its effect's controller still controls.
 */
export interface CapturedCardsSpec {
  readonly kind: "captured";
}

/** The shape every effect node has; the registry narrows it to the primitive union. */
export interface EffectNode {
  readonly op: string;
}

/**
 * The duration of one `forDuration` node, shared by every change made inside
 * it so they end together: an "until the opponent pays" node is one payable
 * effect covering all its changes and every character they affect.
 */
export interface SharedDuration {
  /** The expiry of changes to `affects` made inside the node; `null` when the duration is already over. */
  join(ctx: StepContext, affects: readonly InstanceId[]): Expiry | null;
  /** Registers the node's payable effect, if it has one, once every change inside it has started. */
  finish(ctx: StepContext): void;
}

/**
 * The cards nodes of one resolving effect moved, for the nodes a value of the
 * effect reads them from (`MovedCardRef`), shared by every nested environment
 * of that resolution. A step's replay rebuilds it from the step's answers,
 * like everything else the resolution computed.
 */
export interface MovedCards {
  /**
   * Resolves `node` through `resolve`. For a node a value reads, it first
   * reads the copiable cost of every card in the battle, and afterwards
   * records those that changed zones or ceased to exist meanwhile, replacing
   * what the node recorded the last time it resolved.
   */
  track(node: EffectNode, resolve: () => void): void;
  /** The copiable costs, read just before it resolved, of the cards `node` moved the last time it resolved; none before that. */
  costs(node: EffectNode): readonly number[];
}

/** Object bindings remembered by conditional siblings in one transient lexical resolution. */
export interface ResolutionChoiceScope {
  readonly modes: Map<EffectNode, number>;
  readonly targets: Map<PlayTimeTarget, readonly InstanceId[]>;
}

/** What a primitive sees while it resolves. */
export interface EffectEnv {
  /** Transient conditional bindings in this lexical resolution; rebuilt from answers on replay. */
  readonly resolutionChoiceScope?: ResolutionChoiceScope;
  readonly linkedSource: LinkedSourceContext | null;
  /** The pending ability's retained departure spark; live in-play spark takes precedence. */
  readonly lastKnownSourceSpark: number | null;
  /** The card or emblem whose ability this is. */
  readonly source: AbilitySource;
  /** Where the ability's definition comes from. */
  readonly origin: AbilityOrigin;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  /** The ability's whole effect tree, which floating and delayed triggers index into. */
  readonly root: EffectNode;
  /** The card the triggering event concerns, for a trigger; otherwise `null`. */
  readonly subject: InstanceId | null;
  /** The gain a "when … gains ✦" trigger matched; otherwise `null`. */
  readonly gain: SparkGain | null;
  /** The positive challenge award the scoring trigger matched; otherwise `null`. */
  readonly scored: number | null;
  readonly controller: Side;
  readonly variant: Variant;
  /** The value chosen for X, or `null`. */
  readonly x: number | null;
  /** Whether each optional cost of the item was paid, in printed order (the `costPaid` condition). */
  readonly optionalPaid: readonly boolean[];
  /** The position vacated by this activation's single-character abandonment cost. */
  readonly abandonedPosition: AbandonedPosition | null;
  /** The duration a `forDuration` node gives the continuous primitives inside it; `null` outside one. */
  readonly duration: SharedDuration | null;
  /** The cards this resolution's nodes moved, for "that card" values (`costOf`). */
  readonly moved: MovedCards;
  /**
   * The cards the nearest enclosing `withMaterialized` binding materialized,
   * in the order they entered play, or those a floating or delayed trigger
   * kept from the binding that created it (`CapturedCardsSpec`); `null`
   * outside a binding.
   */
  readonly captured: readonly InstanceId[] | null;
  /** The mode chosen at play time for a modal node of this effect, or `null` for a node off the chosen path. */
  modeOf(node: EffectNode): number | null;
  /** The targets chosen at play time for a target spec in this effect, or `null` if none were chosen. */
  targetsOf(spec: PlayTimeTarget): readonly InstanceId[] | null;
  /** Resolves a nested effect, for flow primitives. */
  run(effect: EffectNode): void;
  /** The purpose of a prompt this ability raises, with the given role. */
  purpose(role: PromptRole): PromptPurpose;
}

/**
 * Registry entry for one DSL primitive. Each primitive is defined,
 * interpreted, and tested in its own module and listed by one line in
 * effects/primitives/index.ts.
 */
export interface PrimitiveDefinition<N extends EffectNode> {
  readonly op: N["op"];
  /** A conditional's branch choices are prepared when its instruction is reached during resolution. */
  readonly deferConditionalChoices?: true;
  /** Every nested effect resolved with this node, in order; validation walks them all. */
  children?(node: N): readonly EffectNode[];
  /**
   * Nested effects whose choices are made at resolution, such as a chosen
   * player branch or a floating or delayed trigger: validation and node
   * indexing walk them, but play-time choices never reach into them.
   */
  deferred?(node: N): readonly EffectNode[];
  /**
   * For a modal node, its modes: one is chosen at play time, before targets,
   * and only the chosen mode's targets are collected and resolved.
   */
  modes?(node: N): readonly EffectNode[];
  /** Target specs held directly by this node, in order. */
  targets?(node: N): readonly PlayTimeTarget[];
  resolve(ctx: StepContext, node: N, env: EffectEnv): void;
  /**
   * Whether resolving the node puts characters into play: a card or ability
   * holding one cannot be played or activated while its controller's back
   * rank would be full (rules § Battlefield Capacity).
   */
  readonly entersPlay?: boolean;
  /**
   * Whether only a static ability may hold the node, as its whole effect: a
   * static "have" that never resolves, so `resolve` throws. The content
   * gate rejects one anywhere else in an ability.
   */
  readonly staticOnly?: boolean;
  /** For a continuous primitive, the layer it applies in and its changes while a static ability holds it. */
  readonly continuous?: ContinuousDefinition<N>;
}

/**
 * The layers of the continuous-effects evaluation, in order (engine-design §
 * Continuous effects). Layer 1, copiable values, has no primitives.
 */
export type Layer = 2 | 3 | 4 | 5 | 6;

/**
 * What a static ability's continuous primitive sees: its source and
 * controller, with selectors and values read live, against the
 * characteristics the layers before its own produced.
 */
export interface StaticEnv {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  readonly source: AbilitySource;
  readonly controller: Side;
  /** The characters a reference covers now; a target or the triggering card covers none. */
  characters(ref: CharacterRef): InstanceId[];
  value(expr: ValueExpr): number;
  /**
   * Any card's characteristics after the layers before this primitive's own,
   * read through the evaluation expanding the ability, never another one.
   */
  readonly read: CharacteristicsReader;
}

export interface ContinuousDefinition<N extends EffectNode> {
  readonly layer: Layer;
  /** The changes the node makes while a static ability applies it. */
  changes(node: N, env: StaticEnv): ContinuousChange[];
}

/**
 * The `targets` hook of a primitive holding a character reference: the
 * reference when it is chosen at play time, otherwise nothing.
 */
export function characterTarget(ref: CharacterRef): readonly PlayTimeTarget[] {
  return ref.kind === "target" ? [ref] : [];
}

/**
 * The `targets` hook of a primitive holding a card reference: the reference
 * when it is a character, stack card, or void card chosen at play time,
 * otherwise nothing.
 */
export function cardTarget(ref: CardRef | CapturedCardsSpec): readonly PlayTimeTarget[] {
  return ref.kind === "target" || ref.kind === "stackTarget" || (ref.kind === "inZone" && ref.pick === "target") ? [ref] : [];
}

/** Declares a primitive; the identity keeps the node type checked. */
export function definePrimitive<N extends EffectNode>(
  definition: PrimitiveDefinition<N>,
): PrimitiveDefinition<N> {
  return definition;
}
