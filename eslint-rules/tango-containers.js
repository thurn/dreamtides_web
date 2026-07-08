/**
 * Single source of truth for Tango's CONTAINER components — the card / pressable
 * / panel wrappers whose whole job is to hold and frame caller-supplied content,
 * so they may legitimately take `children` and raw ReactNode slots. Every other
 * component must render its copy from strict, typed props (a resolved string, a
 * RichText model, an enumerated variant).
 *
 * This list is consumed in two places that must agree, so it lives here rather
 * than being duplicated:
 *   - eslint-rules/no-escape-hatch-props.js keys the `children`/node-slot
 *     exemption by the `*Props` TYPE name (`${name}Props`).
 *   - scripts/tango-strict-api.contract.test.mjs keys it by the react-docgen
 *     DISPLAY name.
 * Because both derive from this one array, they can never drift apart. Add a NEW
 * entry only for a genuine wrapper — the point is to force that to be a
 * deliberate, reviewed decision.
 */

/**
 * Container components that live in `src/tango/components/` — the styled public
 * surface. Listed by their react-docgen display name; the escape-hatch rule
 * appends `Props` to match the type declaration.
 */
export const CONTAINER_COMPONENTS = [
  "GroupPanel",
  "HoverPopover",
  "HoverZoomCard",
  "PressPopover",
  "PressInfo",
  "GlassDialog", // the glass overlay shell — holds caller-supplied body content
  "GlassBackdrop", // the frosted layer — hosts optional lifted-above-the-frost content
];

/**
 * `Pressable` is also a container-like slot holder, but it is a PRIMITIVE (it
 * lives in `src/tango/primitives/`, forwarding every DOM prop onto the element
 * it wraps). The escape-hatch ESLint rule is scoped to `components/` and never
 * sees it, so it belongs only to the resolved-surface contract test, which does
 * cover primitives. Kept separate so each consumer picks exactly the set it
 * needs.
 */
export const CONTAINER_PRIMITIVES = ["Pressable"];
