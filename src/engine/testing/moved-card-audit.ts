/**
 * The structural check behind "that card" values (`costOf(cardsMovedBy(node))`):
 * a value reads the cards its referenced node moved in the current
 * resolution, and reads none, so 0, when that node has not resolved before
 * the value is read. A reference to a later node, to a node on another
 * branch, to an equivalent node that is not part of the effect, or from a
 * static ability therefore always reads 0. The content gate runs this over
 * every authored entity, so such a reference fails at authoring instead.
 */
import { abilityEffect } from "../dsl/abilities";
import type { Ability, MovedCardRef } from "../dsl/types";
import { primitiveDefinition } from "../effects/registry";
import type { EffectNode } from "../effects/types";

/** A moved-card reference whose node never resolves before the value holding it is read. */
export interface MisplacedMovedCardRead {
  /** The primitive of the node whose own fields hold the value. */
  readonly op: string;
  /** The primitive of the node the reference names. */
  readonly node: string;
  /** `static`: a static ability, which reads no moved card; `notBefore`: no earlier part of the same resolution. */
  readonly reason: "static" | "notBefore";
}

/** The one primitive whose children resolve in order, each after the ones before it. */
const ORDERED = "sequence";
/** The one primitive whose deferred effect resolves later, as a resolution of its own with no moved cards yet. */
const SEPARATE_RESOLUTION = "floatingTrigger";

function isMovedCardRef(value: object): value is MovedCardRef {
  return "kind" in value && value.kind === "movedCards" && "node" in value;
}

/** The nested effect nodes a primitive names: children, modes, and deferred effects. */
function nestedNodes(node: EffectNode): Set<unknown> {
  const definition = primitiveDefinition(node.op);
  return new Set<unknown>([...(definition.children?.(node) ?? []), ...(definition.modes?.(node) ?? []), ...(definition.deferred?.(node) ?? [])]);
}

/** The nested effects that resolve within the same resolution as `node`. */
function sameResolution(node: EffectNode): readonly EffectNode[] {
  const definition = primitiveDefinition(node.op);
  return [
    ...(definition.children?.(node) ?? []),
    ...(definition.modes?.(node) ?? []),
    ...(node.op === SEPARATE_RESOLUTION ? [] : (definition.deferred?.(node) ?? [])),
  ];
}

/** `node` and every node that may resolve while it does, in the same resolution. */
function resolvedWithin(node: EffectNode, into: Set<EffectNode>): void {
  if (into.has(node)) return;
  into.add(node);
  for (const nested of sameResolution(node)) resolvedWithin(nested, into);
}

/** The moved-card references in a node's own fields, skipping the nested effect nodes it names. */
function ownReads(node: EffectNode): MovedCardRef[] {
  const nested = nestedNodes(node);
  const found: MovedCardRef[] = [];
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || nested.has(value)) return;
    if (isMovedCardRef(value)) {
      found.push(value);
      return;
    }
    for (const field of Object.values(value)) visit(field);
  };
  for (const field of Object.values(node)) visit(field);
  return found;
}

/**
 * The misplaced moved-card reads in one effect tree. `before` holds the nodes
 * that resolved earlier in the same resolution: the earlier children of each
 * enclosing `sequence`, with everything that resolves within them. Every
 * other container passes it through unchanged, since its children are
 * alternatives (`chooseOne`, `ifThen`, `choosePlayer`) or one effect
 * (`optional`, `repeat`, `eachPlayer`, `forDuration`); a floating trigger's
 * effect starts empty. A node used in several places is checked in each.
 */
function misplacedIn(effect: EffectNode, isStatic: boolean): MisplacedMovedCardRead[] {
  const failures: MisplacedMovedCardRead[] = [];
  const walk = (node: EffectNode, before: ReadonlySet<EffectNode>, path: ReadonlySet<EffectNode>): void => {
    if (path.has(node)) throw new Error(`A ${node.op} node contains itself`);
    for (const ref of ownReads(node)) {
      if (isStatic) failures.push({ op: node.op, node: ref.node.op, reason: "static" });
      else if (!before.has(ref.node)) failures.push({ op: node.op, node: ref.node.op, reason: "notBefore" });
    }
    const inside = new Set(path).add(node);
    const definition = primitiveDefinition(node.op);
    if (node.op === ORDERED) {
      const resolved = new Set(before);
      for (const child of definition.children?.(node) ?? []) {
        walk(child, resolved, inside);
        resolvedWithin(child, resolved);
      }
      return;
    }
    for (const child of new Set([...(definition.children?.(node) ?? []), ...(definition.modes?.(node) ?? [])])) walk(child, before, inside);
    for (const child of definition.deferred?.(node) ?? []) walk(child, node.op === SEPARATE_RESOLUTION ? new Set() : before, inside);
  };
  walk(effect, new Set(), new Set());
  return failures;
}

/**
 * Every moved-card read in a list of abilities whose referenced node does
 * not resolve before it: the node is the same object as, or resolves within,
 * an earlier child of an enclosing `sequence` in the same resolution. Any
 * moved-card read in a static ability is misplaced.
 */
export function misplacedMovedCardReads(abilities: readonly Ability[]): MisplacedMovedCardRead[] {
  return abilities.flatMap((ability) => {
    const effect = abilityEffect(ability);
    return effect === null ? [] : misplacedIn(effect, ability.kind === "static");
  });
}
