import { type CSSProperties, type ReactNode } from "react";
import { HoverPopover } from "./HoverPopover";

/**
 * A circular numeric badge ("pip") used on card corners for stats like
 * spark and energy cost.
 *
 * Each pip variant defines a fill color. The value renders centered, in
 * white with a thin black text-shadow outline so it stays legible against
 * the colored fill at small card sizes.
 *
 * The badge supports an optional `tooltip` node — when set, the badge wraps
 * itself in a `HoverPopover` so first-time players can learn what the
 * number represents on long hover. The longer 1000ms delay (vs the 500ms
 * default used for inline glossary terms in `RulesText`) is intentional:
 * pip badges sit at the corners of cards and are easy to brush past with
 * the cursor — a quicker tooltip would feel twitchy.
 *
 * Single source of truth for any "circled number on a colored disc" UI.
 * Used by `CardDisplay` for the spark badge and the energy-cost badge.
 */

export type PipBadgeVariant = "spark" | "energy";

interface PipBadgeProps {
  /** Which pip this is — picks the fill color. */
  variant: PipBadgeVariant;
  /** The displayed value (string so callers can pass `"X"` for variable cost). */
  value: string;
  /**
   * `"sm"` matches the small card stat row; `"md"` matches the larger
   * `large` card variant in `CardDisplay`. Sizes are tuned so the number
   * stays readable but the badge does not overpower adjacent text.
   */
  size?: "sm" | "md";
  /**
   * Optional accessible label for screen readers. If omitted, the badge
   * uses a sensible default for its variant.
   */
  ariaLabel?: string;
  /**
   * Optional hover/focus tooltip. When provided, the badge becomes its own
   * hover anchor. Use a short plain-language description.
   */
  tooltip?: ReactNode;
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
export const SPARK_PIP_COLOR = "#facc15";
export const ENERGY_PIP_COLOR = "#0ea5e9";

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

/** Tooltip delay tuned for pip-corner targets (1s, vs 500ms for inline terms). */
const PIP_TOOLTIP_DELAY_MS = 1000;

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
}

const SIZES: Readonly<Record<"sm" | "md", SizeSpec>> = {
  sm: { sizeClass: "h-5 w-5", textClass: "text-[11px]" },
  md: { sizeClass: "h-7 w-7", textClass: "text-base" },
};

export function PipBadge({
  variant,
  value,
  size = "sm",
  ariaLabel,
  tooltip,
}: PipBadgeProps) {
  const spec = SIZES[size];
  const label = ariaLabel ?? VARIANT_DEFAULT_LABEL[variant];

  const badgeStyle: CSSProperties = {
    background: VARIANT_FILL[variant],
    border: `1px solid ${VARIANT_BORDER[variant]}`,
    color: "#ffffff",
    textShadow: NUMBER_TEXT_SHADOW,
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

  return (
    <HoverPopover
      delayMs={PIP_TOOLTIP_DELAY_MS}
      content={
        <div
          className="rounded-md px-3 py-2 text-xs leading-snug shadow-lg"
          style={{
            background: "rgba(15, 10, 24, 0.96)",
            border: "1px solid rgba(168, 85, 247, 0.55)",
            color: "#f8fafc",
            boxShadow: "0 8px 22px rgba(0, 0, 0, 0.55)",
            maxWidth: 220,
          }}
        >
          {tooltip}
        </div>
      }
    >
      {badge}
    </HoverPopover>
  );
}
