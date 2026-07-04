// Typed color values for the strict Tango API.
//
// A Tango component never takes a raw color string. Appearance is the design
// system's, so a color prop is one of two things, and nothing else:
//
//   - a `ColorRole` — a named semantic color from the palette (`"accent"`,
//     `"spark"`, `"selected"`, …). The role → token mapping lives here, so a
//     rebrand edits one table and every component follows.
//   - a `HexColor` — a `#rrggbb` literal, for the genuinely data-driven case
//     (a per-dreamscape node accent) that no fixed role can express. The
//     template-literal type accepts `"#a855f7"` with zero call-site ceremony
//     but rejects `"var(--x)"`, `"red"`, `"color-mix(…)"`, or a typo at compile
//     time — which is what keeps alpha derivation (`withAlpha`) valid.
//
// This is the same "role name, not a raw color" pattern `StatTile` already
// uses; it just names the two shapes so every color prop can share them.

import { token, type TokenName } from "./tokens";

/**
 * A `#rrggbb` (or `#rgb` / `#rrggbbaa`) color literal. A template-literal type,
 * so `"#a855f7"` is accepted with no wrapper while `"var(--x)"` / `"red"` /
 * `"color-mix(…)"` are compile errors — the constraint `withAlpha` relies on.
 */
export type HexColor = `#${string}`;

/** True when a {@link TangoColor} is a raw hex literal rather than a role name. */
export function isHexColor(color: TangoColor): color is HexColor {
  return color.startsWith("#");
}

/**
 * The named semantic colors a component may reference. Each maps to a palette
 * token in {@link COLOR_ROLE_TOKENS}; add a role here (and to that table) rather
 * than letting a raw color reach a prop. `"white"` is the one non-token role —
 * a pure `#ffffff` used as an untinted default.
 */
export type ColorRole =
  | "accent"
  | "accent-bright"
  | "accent-strong"
  | "essence"
  | "energy"
  | "energy-bright"
  | "spark"
  | "points"
  | "danger"
  | "positive"
  | "selected"
  | "sale"
  | "gold"
  | "gold-light"
  | "text-primary"
  | "text-secondary"
  | "text-muted"
  | "text-faint"
  | "text-on-accent"
  | "white";

/** Role → the `var(--…)` token (or literal) it resolves to. */
const COLOR_ROLE_TOKENS: Record<ColorRole, string> = {
  accent: token("--accent"),
  "accent-bright": token("--accent-bright"),
  "accent-strong": token("--accent-strong"),
  essence: token("--essence"),
  energy: token("--energy"),
  "energy-bright": token("--energy-bright"),
  spark: token("--spark"),
  points: token("--points"),
  danger: token("--danger"),
  positive: token("--positive"),
  selected: token("--selected"),
  sale: token("--sale"),
  gold: token("--gold"),
  "gold-light": token("--color-gold-light"),
  "text-primary": token("--text-primary"),
  "text-secondary": token("--text-secondary"),
  "text-muted": token("--text-muted"),
  "text-faint": token("--text-faint"),
  "text-on-accent": token("--text-on-accent"),
  white: "#ffffff",
};

/**
 * A color a Tango component accepts: a named {@link ColorRole} from the palette,
 * or a {@link HexColor} literal for the data-driven case. Never a raw
 * `var(--x)` / CSS-color string.
 */
export type TangoColor = ColorRole | HexColor;

/** Resolve a {@link TangoColor} to the CSS color string to render with. */
export function resolveColor(color: TangoColor): string {
  return isHexColor(color) ? color : COLOR_ROLE_TOKENS[color];
}

/**
 * A resolved CSS color at a given opacity, via `color-mix` so it works for a
 * hex literal, a `var(--…)` token, OR a `color-mix(…)` input alike — unlike
 * hex-suffix concatenation (`${hex}73`), which silently produces invalid CSS
 * for anything that is not a bare hex. `alpha` is 0–1.
 */
export function withAlpha(color: TangoColor, alpha: number): string {
  const pct = Math.round(Math.max(0, Math.min(1, alpha)) * 100);
  return `color-mix(in srgb, ${resolveColor(color)} ${String(pct)}%, transparent)`;
}

/** A palette token name, re-exported for the rare case a raw token is needed. */
export type { TokenName };
