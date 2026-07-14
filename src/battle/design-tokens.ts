/**
 * Battle screen design tokens — Stage 2 foundation.
 *
 * These tokens are the single source of truth that Stage-3 domain agents must
 * consume when restyling individual battle components. Adding a new hex, a
 * one-off tailwind class, or an ad-hoc font size here is fine so long as it
 * updates a token — do NOT restyle downstream components by inventing fresh
 * values.
 *
 * Iconography rule (FIND-10-7):
 * - Color emoji are RESERVED for purely decorative use (e.g. celebration
 *   splash screens, tutorial flourishes). They must never encode state or
 *   appear inside interactive controls.
 * - System/semantic glyphs (suit icons, stat icons, phase markers, button
 *   adornments) use the existing monochrome custom-glyph family. When a new
 *   glyph is needed, add it to the monochrome set — do not reach for color
 *   emoji or unicode pictographs.
 *
 * Consumption pattern:
 *
 *   import { sideColor, typography, radius, buttonVariant } from "../design-tokens";
 *
 *   <button className={buttonVariant("primary")}>End Turn</button>
 *   <p className={typography.caption}>Round 3</p>
 *   <aside className={`${sideColor.player.border} ${radius.md}`}>...</aside>
 */

/**
 * Player/enemy ownership cues. Spec line 174 requires a consistent side-color
 * treatment across every surface. Canonical pair matches the dreamtides-staggered
 * battle prototype: green for player, red for enemy.
 *
 * The Tailwind class fragments below are intentionally granular so consumers
 * can mix and match (e.g. `${sideColor.player.border} ${sideColor.player.bgSoft}`)
 * without pulling in conflicting variants.
 */
export const sideColor = {
  player: {
    /** Raw hex for non-tailwind contexts. */
    hex: "#22c55e",
    /** Strong text and iconography. */
    text: "text-green-200",
    /** Subheading / eyebrow text. */
    textStrong: "text-green-300",
    /** Section and card borders at full emphasis. */
    border: "border-green-400/60",
    /** Borders at secondary emphasis (e.g. neutral strips). */
    borderSoft: "border-green-300/35",
    /** Background tint at low alpha — pairs with `border` or `borderSoft`. */
    bgSoft: "bg-green-400/10",
    /** Solid fill for pills / badges. */
    bgSolid: "bg-green-500/25",
    /** Focus / hover ring color. */
    ring: "ring-green-300/50",
  },
  enemy: {
    hex: "#ef4444",
    text: "text-red-200",
    textStrong: "text-red-300",
    border: "border-red-400/60",
    borderSoft: "border-red-300/35",
    bgSoft: "bg-red-500/10",
    bgSolid: "bg-red-500/25",
    ring: "ring-red-300/50",
  },
} as const;

/**
 * Five-step typography ramp (FIND-10-8). Downstream agents must pick one of
 * these — any new font size has to be added here first with a clear semantic
 * name.
 */
export const typography = {
  /** 11px — stat chip labels, tertiary metadata. */
  caption: "text-[11px] leading-tight",
  /** 13px — body copy, inspector descriptions, card rules text. */
  body: "text-[13px] leading-snug",
  /** 16px — section subheaders, card titles. */
  subheading: "text-[16px] leading-snug font-semibold",
  /** 20px — panel titles (Inspector, Rewards). */
  heading: "text-[20px] leading-tight font-semibold",
  /** 28px — overlay / result banners. */
  display: "text-[28px] leading-tight font-semibold",
} as const;

/**
 * Exactly two border-radius tokens (FIND-10-10). `sm` for interactive
 * chrome; `md` for surfaces that contain content.
 */
export const radius = {
  /** ~6px — pills, buttons, chips, badges. */
  sm: "rounded-md",
  /** ~12px — cards, modals, section panels. */
  md: "rounded-xl",
} as const;

/**
 * Four-variant button taxonomy (FIND-10-5).
 *
 * - `primary` — game-progressing actions (End Turn, Begin Quest, Confirm
 *   Reward). High emphasis, side-agnostic accent.
 * - `secondary` — neutral controls (Undo, Redo, Toggle Battle Log, View
 *   Deck). Low emphasis; slate border, no fill.
 * - `destructive` — irreversible game-state mutations under Debug (Force
 *   Victory/Defeat/Draw, Skip To Rewards, Reset). Rose fill to warn.
 * - `debug` — non-destructive debug shortcuts (Foresee, Reveal Top, Extra
 *   Judgment, Mark Prevented). Amber outline so it reads as debug without
 *   suggesting irreversibility.
 *
 * Each variant supplies explicit hover / focus-visible / active / disabled
 * states (FIND-05-4, FIND-05-7, FIND-10-12 baseline).
 */
export type ButtonVariant = "primary" | "secondary" | "destructive" | "debug";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-semibold "
  + "transition-colors duration-150 "
  + "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 "
  + "disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: [
    BUTTON_BASE,
    "border border-violet-300/70 bg-violet-500/35 text-violet-50",
    "hover:bg-violet-400/45 hover:border-violet-200",
    "active:bg-violet-500/60",
    "focus-visible:ring-violet-300",
    "disabled:bg-violet-500/10 disabled:border-violet-300/30 disabled:text-violet-200/60",
  ].join(" "),
  secondary: [
    BUTTON_BASE,
    "border border-slate-600 bg-slate-900/60 text-slate-100",
    "hover:bg-slate-800 hover:border-slate-400",
    "active:bg-slate-700",
    "focus-visible:ring-slate-300",
    "disabled:bg-slate-900/40 disabled:border-slate-700 disabled:text-slate-500",
  ].join(" "),
  destructive: [
    BUTTON_BASE,
    "border border-red-400/70 bg-red-500/25 text-red-50",
    "hover:bg-red-400/40 hover:border-red-200",
    "active:bg-red-500/60",
    "focus-visible:ring-red-300",
    "disabled:bg-red-500/10 disabled:border-red-300/30 disabled:text-red-200/60",
  ].join(" "),
  debug: [
    BUTTON_BASE,
    "border border-amber-300/60 bg-amber-500/10 text-amber-100",
    "hover:bg-amber-500/20 hover:border-amber-200",
    "active:bg-amber-500/30",
    "focus-visible:ring-amber-300",
    "disabled:bg-amber-500/5 disabled:border-amber-300/20 disabled:text-amber-100/50",
  ].join(" "),
};

/**
 * Resolve a button variant to its full className string. Prefer the
 * Cumulus `GlassButton` for new labeled actions; call this directly when
 * embedding in a legacy button site that cannot yet migrate.
 */
export function buttonVariant(variant: ButtonVariant): string {
  return BUTTON_VARIANTS[variant];
}
