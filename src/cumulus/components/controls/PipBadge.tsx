import { type CSSProperties, type ReactElement } from "react";
import { ENERGY_PIP_COLOR, SPARK_PIP_COLOR } from "./pip-colors";
export { ENERGY_PIP_COLOR, SPARK_PIP_COLOR } from "./pip-colors";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";

/**
 * A circular numeric badge ("pip") used on card corners for stats like
 * spark and energy cost.
 *
 * Each pip variant defines a fill color. The value renders centered, in
 * white with a thin black text-shadow outline so it stays legible against
 * the colored fill at small card sizes.
 *
 * The badge supports an optional `tooltip` node — when set, the badge wraps
 * itself as a semantic reveal source so first-time players can learn what the
 * number represents on long hover. The longer 1000ms delay (vs the 500ms
 * default used for inline glossary terms in `RulesText`) is intentional:
 * pip badges sit at the corners of cards and are easy to brush past with
 * the cursor — a quicker tooltip would feel twitchy.
 *
 * This compact pip appears in dense card rows and inline rules text. Full game
 * card corners use the larger, art-aware `CardStatOrb` surface.
 */

export type PipBadgeVariant = "spark" | "energy";

interface PipBadgeProps {
  /** Which pip this is — picks the fill color. */
  variant: PipBadgeVariant;
  /** The displayed value (string so callers can pass `"X"` for variable cost). */
  value: string;
  /**
   * `"sm"` matches the small card stat row; `"md"` matches the larger
   * `large` GameCard variant. Sizes are tuned so the number
   * stays readable but the badge does not overpower adjacent text.
   */
  size?: "sm" | "md";
  /** Multiplier for card renderers that need the pip to follow card text scale. */
  scale?: number;
  /**
   * Optional accessible label for screen readers. If omitted, the badge
   * uses a sensible default for its variant.
   */
  ariaLabel?: string;
  /**
   * Optional hover/focus tooltip. When provided, the badge becomes its own
   * hover anchor. A short plain-language description string.
   */
  tooltip?: string;
}

/**
 * Canonical resource color tokens. Single source of truth so the corner pip
 * and any inline reference to the same resource (e.g. the energy flame
 * inside rules text via `RulesText`) read as the same color and cannot
 * drift apart over time. Importers should reference these constants
 * directly rather than re-typing the hex value.
 *
 * - `SPARK_PIP_COLOR`: gold, matches the character chrome accent.
 * - `ENERGY_PIP_COLOR`: teal/cyan, distinct from gold so the two badges
 *   read as different stats at a glance.
 */
/**
 * Background fill per variant. Read from the shared resource color tokens
 * so the inline rules-text glyph (rendered by `RulesText`) and this pip
 * badge always share a value.
 */
const VARIANT_FILL: Readonly<Record<PipBadgeVariant, string>> = {
  spark: SPARK_PIP_COLOR,
  energy: ENERGY_PIP_COLOR,
};

const VARIANT_BORDER: Readonly<Record<PipBadgeVariant, string>> = {
  spark: "#854d0e",
  energy: "#0c4a6e",
};

const VARIANT_DEFAULT_LABEL: Readonly<Record<PipBadgeVariant, string>> = {
  spark: "spark",
  energy: "energy cost",
};

/**
 * White text with a thin black outline. Implemented with four 1px text
 * shadows offset on the cardinal axes so the outline reads cleanly against
 * any fill color.
 */
const NUMBER_TEXT_SHADOW =
  "1px 0 0 #000, -1px 0 0 #000, 0 1px 0 #000, 0 -1px 0 #000";

interface SizeSpec {
  /** Square diameter of the disc, in tailwind class form. */
  sizeClass: string;
  /** Tailwind text-size class for the value. */
  textClass: string;
  /** Square diameter of the disc, in px. */
  sizePx: number;
  /** Numeric font size, in px. */
  fontSizePx: number;
}

const SIZES: Readonly<Record<"sm" | "md", SizeSpec>> = {
  sm: {
    sizeClass: "h-5 w-5",
    textClass: "text-[11px]",
    sizePx: 20,
    fontSizePx: 11,
  },
  md: {
    sizeClass: "h-7 w-7",
    textClass: "text-base",
    sizePx: 28,
    fontSizePx: 16,
  },
};

export function PipBadge({
  variant,
  value,
  size = "sm",
  scale = 1,
  ariaLabel,
  tooltip,
}: PipBadgeProps) {
  const spec = SIZES[size];
  const label = ariaLabel ?? VARIANT_DEFAULT_LABEL[variant];
  const resolvedScale = Number.isFinite(scale) && scale > 0 ? scale : 1;

  const badgeStyle: CSSProperties = {
    background: VARIANT_FILL[variant],
    border: `1px solid ${VARIANT_BORDER[variant]}`,
    color: "#ffffff",
    fontSize: `${String(spec.fontSizePx * resolvedScale)}px`,
    height: `${String(spec.sizePx * resolvedScale)}px`,
    textShadow: NUMBER_TEXT_SHADOW,
    width: `${String(spec.sizePx * resolvedScale)}px`,
    lineHeight: 1,
  };

  const badge = (
    <span
      aria-label={label}
      role="img"
      className={`inline-flex ${spec.sizeClass} items-center justify-center rounded-full font-bold ${spec.textClass} shadow-md`}
      style={badgeStyle}
      data-pip-variant={variant}
    >
      {value}
    </span>
  );

  if (tooltip === undefined) {
    return badge;
  }

  return <PipBadgeReveal variant={variant} label={label} tooltip={tooltip}>{badge}</PipBadgeReveal>;
}

function PipBadgeReveal({ variant, label, tooltip, children }: { variant: PipBadgeVariant; label: string; tooltip: string; children: ReactElement }) {
  const binding = useRevealSource({
    identity: { entityType: `card-${variant}-pip`, entityId: revealEntityId(`card-${variant}-pip`, `${label}:${tooltip}`) },
    spec: {
      primary: { kind: "infoCard", card: { variant: "text", title: label, body: { kind: "plain", text: tooltip } } },
      secondaries: [],
    },
  });
  return (
    <Pressable as="span" ref={binding.ref} {...binding.sourceProps} tabIndex={0} style={{ ...binding.sourceProps.style, display: "inline-flex" }}>
      {children}
    </Pressable>
  );
}
