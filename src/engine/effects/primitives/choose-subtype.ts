import type { ResolvingEffect } from "../registry";
import { parseCardSubtype, type CardSubtype } from "../../../types/card-identity";
import { startContinuous } from "../../continuous/resolve";
import type { ChooseModePrompt } from "../../prompts/types";
import { sourceInstance, type AbilitySource } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { resolveChosenEffect } from "../interpreter";
import { definePrimitive, type ResolvingPrimitiveDefinition, type EffectNode } from "../types";

/**
 * "Choose a character type" (rules § Keywords and Effects → Choose a
 * character type): as the node resolves, its controller chooses one of the
 * catalog's character types (`EngineCatalog.characterTypes`) in a public
 * `chooseMode` prompt with the `chooseSubtype` role, whose `subtypes` name
 * each mode's type, and the choice is announced (`subtypeChosen`). Then
 * either:
 *
 * - `then`, "Discover a character of that type …": the following
 *   instruction resolves with each `CHOSEN_SUBTYPE` in it replaced by the
 *   chosen type; its modes and targets are chosen as it resolves;
 * - `self`, "This character is that character type": the source becomes
 *   that type while it is in play (a layer-2 `subtype` change lasting while
 *   the source is in play), and that is its chosen type, which its static
 *   abilities name with `CHOSEN_SUBTYPE` (`chosenSubtypeOf`). With the
 *   source out of play nothing is chosen.
 */
export interface ChooseSubtypeNode {
  readonly op: "chooseSubtype";
  readonly then: ResolvingEffect | null;
  readonly self: boolean;
}

/**
 * The chosen character type, written where an instruction or a static
 * ability names "that character type" or "the chosen type". It is no
 * printed subtype, and it is replaced before any card is compared with it.
 */
export const CHOSEN_SUBTYPE: CardSubtype = parseCardSubtype("{chosen character type}");

export const chooseSubtypePrimitive: ResolvingPrimitiveDefinition<ChooseSubtypeNode> = definePrimitive<ChooseSubtypeNode>({
  op: "chooseSubtype",
  deferred: (node) => (node.then === null ? [] : [node.then]),
  resolve(ctx, node, env) {
    const own = node.self ? sourceInstance(env.source) : null;
    if (node.self && (own === null || ctx.state.instances[own]?.zone !== "play")) return;
    const types = ctx.catalog.characterTypes;
    if (types.length === 0) return;
    const mode = ctx.choose<ChooseModePrompt>({
      kind: "chooseMode",
      side: env.controller,
      purpose: env.purpose("chooseSubtype"),
      options: types.map((_type, index) => ({ mode: index, legal: true })),
      subtypes: types,
    });
    const subtype = types[mode];
    if (subtype === undefined) throw new Error("chooseSubtype answered with no character type");
    ctx.emit({ kind: "subtypeChosen", side: env.controller, source: env.source, subtype });
    if (own !== null) startContinuous(ctx, env, "whileSourceInPlay", [own], [{ kind: "subtype", instance: own, subtype }]);
    if (node.then !== null) {
      const originals = new Map<object, object>();
      resolveChosenEffect(ctx, withChosenSubtype(node.then, subtype, originals), { ...env, chosenSubtype: subtype }, false, originals);
    }
  },
});

/** Whether `node` names `CHOSEN_SUBTYPE` anywhere. */
export function mentionsChosenSubtype(node: EffectNode): boolean {
  const seen = new Set<object>();
  const visit = (value: unknown): boolean => {
    if (typeof value !== "object" || value === null) return value === CHOSEN_SUBTYPE;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value).some(visit);
  };
  return visit(node);
}

/**
 * The placeholders in one lexical scope name `subtype`; a nested type choice
 * owns its following instruction. Graph aliases persist within that scope.
 * `originals` binds replacements to their enclosing identities. `scope` can
 * reconstruct a public whole declaration around one retained callback; other
 * branches remain present and keep their own unbound placeholders.
 */
export function withChosenSubtype<N extends EffectNode>(node: N, subtype: CardSubtype, originals?: Map<object, object>, scope: EffectNode = node): N {
  const memo = new WeakMap<object, object>();
  const replace = (value: unknown): unknown => {
    if (typeof value !== "object" || value === null) return value;
    if ("op" in value && value.op === "chooseSubtype") return value;
    const previous = memo.get(value);
    if (previous !== undefined) return previous;
    if (!mentionsChosenSubtype(value as EffectNode)) return value;
    const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    // Register before following captures back into their instruction graph.
    memo.set(value, output);
    originals?.set(output, value);
    for (const [key, field] of Object.entries(value)) {
      Object.assign(output, { [key]: (key === "subtype" || key === "notSubtype") && field === CHOSEN_SUBTYPE ? subtype : replace(field) });
    }
    return output;
  };
  const specialized = replace(scope);
  if (scope === node) return specialized as N;
  // Only public proof needs the enclosing declaration. Runtime instructions
  // retain the canonical root and bridge their local replacements separately.
  const enclosing = new WeakMap<object, object>();
  const retain = (value: unknown): unknown => {
    if (value === scope) return specialized;
    if (typeof value !== "object" || value === null) return value;
    const previous = enclosing.get(value);
    if (previous !== undefined) return previous;
    const output: Record<string, unknown> | unknown[] = Array.isArray(value) ? [] : {};
    enclosing.set(value, output);
    for (const [key, field] of Object.entries(value)) Object.assign(output, { [key]: retain(field) });
    return output;
  };
  return retain(node) as N;
}

/**
 * The chosen character type of `source` in `state`: the type of the latest
 * `subtype` change it made to itself that still lasts, which ends as it
 * leaves play; `null` for an emblem or a source with none.
 */
export function chosenSubtypeOf(state: BattleState, source: AbilitySource): CardSubtype | null {
  const instance = sourceInstance(source);
  if (instance === null) return null;
  for (let index = state.floating.length - 1; index >= 0; index--) {
    const effect = state.floating[index];
    if (effect?.source === instance && effect.change.kind === "subtype" && effect.change.instance === instance) return effect.change.subtype;
  }
  return null;
}

/** "Choose a character type. <then, naming CHOSEN_SUBTYPE>", or "… This character is that character type." */
export function chooseSubtype(use: { readonly then: ResolvingEffect } | { readonly self: true }): ChooseSubtypeNode {
  return "then" in use ? { op: "chooseSubtype", then: use.then, self: false } : { op: "chooseSubtype", then: null, self: true };
}
