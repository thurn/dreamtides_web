// Pure mapping from a docgen prop description to the interactive control the
// /cumulus doc site renders for it. Consumed by the (later) ControlPanel, which
// switches on `ControlSpec.kind` to pick a widget.
//
// The docgen metadata generator (scripts/generate-cumulus-metadata.mjs) is a
// .mjs script, so it has no TS type to import from; `PropMeta` is declared and
// exported here as the single canonical definition, and downstream doc code
// (props table, control panel) should import it from this module rather than
// redeclaring it.

/**
 * One field of a nested model object, as expanded one level by
 * `extractPropMeta` in scripts/generate-cumulus-metadata.mjs.
 */
export interface NestedField {
  name: string;
  /** e.g. "number", "string | null", "DreamscapeNode". */
  tsType: string;
  optional: boolean;
  description: string;
}

/**
 * The one-level shape of a prop whose type is a named project model object
 * (e.g. `model: AtlasNodeModel`), so the props table can document the fields the
 * caller must supply rather than only the opaque type name.
 */
export interface NestedTypeDoc {
  /** The model type's name, e.g. "AtlasNodeModel". */
  name: string;
  fields: NestedField[];
}

/**
 * Flat, normalized description of a single component prop, as produced by
 * `extractPropMeta` in scripts/generate-cumulus-metadata.mjs.
 */
export interface PropMeta {
  name: string;
  /** e.g. "boolean", "number", '"sm" | "md" | "lg"'. */
  tsType: string;
  /** ["sm","md","lg"] for a string-literal union prop; [] otherwise. */
  unionMembers: string[];
  required: boolean;
  defaultValue: string | null;
  description: string;
  /**
   * Present only when `tsType` names a project model object (or an array of
   * one): its one-level field list, for the props table to expand.
   */
  nested?: NestedTypeDoc;
}

/**
 * The interactive control to render for a prop on the /cumulus doc site. This
 * is the contract the (later) ControlPanel switches on.
 */
export type ControlSpec =
  | { kind: "toggle" }
  | { kind: "select"; options: string[] }
  | { kind: "number" }
  | { kind: "text" }
  | { kind: "none" };

/**
 * Decide which control represents a prop, in priority order:
 *
 *   1. A string-literal union (unionMembers non-empty) always wins, even
 *      though its tsType is the quoted union string rather than "string" —
 *      unionMembers is the reliable structured signal, so this is checked
 *      BEFORE tsType and rules out ever string-parsing tsType for unions.
 *   2. "boolean" -> toggle.
 *   3. "number" -> number.
 *   4. "string" -> text.
 *   5. Anything else (ReactNode, functions, objects, ...) -> none: shown in
 *      the props table but with no interactive control, rather than
 *      silently falling through to a broken widget.
 */
export function controlForProp(meta: PropMeta): ControlSpec {
  if (meta.unionMembers.length > 0) {
    return { kind: "select", options: meta.unionMembers };
  }
  if (meta.tsType === "boolean") {
    return { kind: "toggle" };
  }
  if (meta.tsType === "number") {
    return { kind: "number" };
  }
  if (meta.tsType === "string") {
    return { kind: "text" };
  }
  return { kind: "none" };
}
