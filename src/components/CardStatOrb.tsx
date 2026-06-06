import { type CSSProperties, type ReactNode } from "react";
import { HoverPopover } from "./HoverPopover";
import {
  ENERGY_GLOW_FILTER,
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  GlowIcon,
  SPARK_GLOW_FILTER,
  SPARK_ICON_CLASS,
  SPARK_ICON_COLOR,
} from "./GlowIcon";
import { useFitText } from "./useFitText";

export type CardStatOrbVariant = "energy" | "spark";

const DEFAULT_LABEL: Readonly<Record<CardStatOrbVariant, string>> = {
  energy: "energy cost",
  spark: "spark",
};

/**
 * Glyph spec per stat variant. Both stats render the same way — a glowing,
 * black-outlined Boxicons mark behind the centered number — so they read as a
 * matched pair. `overscale` pushes each glyph past the orb box (centered) to
 * cancel the padding inside its 24×24 viewBox, tuned per glyph so the sparkle
 * and flame land at the same visual weight.
 */
const ICON_BY_VARIANT: Readonly<
  Record<
    CardStatOrbVariant,
    { iconClass: string; color: string; glowFilter: string; overscale: number }
  >
> = {
  spark: {
    iconClass: SPARK_ICON_CLASS,
    color: SPARK_ICON_COLOR,
    glowFilter: SPARK_GLOW_FILTER,
    overscale: 1.15,
  },
  energy: {
    iconClass: ENERGY_ICON_CLASS,
    color: ENERGY_ICON_COLOR,
    glowFilter: ENERGY_GLOW_FILTER,
    overscale: 1.05,
  },
};

/** Tooltip delay tuned for corner stat targets (matches the old pip badges). */
const ORB_TOOLTIP_DELAY_MS = 1000;

interface CardStatOrbProps {
  variant: CardStatOrbVariant;
  /** Displayed value (string so callers can pass `"X"` for variable cost). */
  value: string;
  /** CSS length for the square orb diameter (e.g. `var(--cv-energy-orb-size)`). */
  sizeVar: string;
  /**
   * Upper bound (px) for the digit auto-shrink search. The displayed size is
   * the smaller of the orb-relative ceiling and the fitted size, so this only
   * needs to sit at or above the rendered orb size.
   */
  numberCapPx: number;
  ariaLabel?: string;
  tooltip?: ReactNode;
}

/**
 * A card stat rendered with a centered number over a glowing, black-outlined
 * Boxicons mark: the blue flame (`bxf bx-fire-alt`) for energy cost — floating
 * over the top name bar's left end — and the amber-gold sparkle (`bxf
 * bx-sparkles`) for spark, at the right of the name bar. Both marks carry a
 * matching warm/cool bloom and outline so they read as a pair. The number is
 * set in Anton — white with a black outline — and auto-shrinks to fit so
 * multi-digit values never overflow.
 *
 * Single source of truth for the corner stat treatment shared by every
 * `CardView` surface. The inline `⍏N` references in rules text keep their own
 * compact `PipBadge` rendering; this component is only for the corner stats.
 */
export function CardStatOrb({
  variant,
  value,
  sizeVar,
  numberCapPx,
  ariaLabel,
  tooltip,
}: CardStatOrbProps) {
  const label = ariaLabel ?? DEFAULT_LABEL[variant];
  // The number box is inset to the glowing core of the orb so the digit sits
  // centered on the brightest region rather than over the soft outer edge.
  const numberBoxSize = `calc(${sizeVar} * 0.66)`;
  const { ref, fontSize } = useFitText(numberCapPx, 6, [value, numberCapPx]);

  // The digit's font-size is the smaller of the box-relative ceiling and the
  // fitted size, so a single digit fills the box (and tracks the CSS orb size
  // live) while multi-digit values shrink to fit.
  const numberFontSize = `min(${numberBoxSize}, ${String(fontSize)}px)`;

  const numberStyle: CSSProperties = {
    fontFamily: '"Anton", system-ui, sans-serif',
    fontWeight: 400,
    color: "#ffffff",
    lineHeight: 1,
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    // Crisp black outline composed from eight offsets so it reads against both
    // the dark teal energy orb and the bright gold spark orb. Offsets are in
    // `em` so the outline tracks the rendered digit size.
    textShadow: [
      `0.08em 0 0 #000`,
      `-0.08em 0 0 #000`,
      `0 0.08em 0 #000`,
      `0 -0.08em 0 #000`,
      `0.08em 0.08em 0 #000`,
      `-0.08em 0.08em 0 #000`,
      `0.08em -0.08em 0 #000`,
      `-0.08em -0.08em 0 #000`,
    ].join(", "),
  };

  const icon = ICON_BY_VARIANT[variant];

  const orb = (
    <span
      data-card-stat={variant}
      aria-label={label}
      role="img"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: sizeVar,
        height: sizeVar,
        flex: "0 0 auto",
      }}
    >
      {/* The glowing mark sits below the digit. Each Boxicons glyph leaves
          padding inside its 24×24 viewBox, so it is overscaled past the box
          (centered) to reach the stat's footprint. */}
      <GlowIcon
        iconClass={icon.iconClass}
        color={icon.color}
        glowFilter={icon.glowFilter}
        outline
        size={`calc(${sizeVar} * ${String(icon.overscale)})`}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
      <div
        ref={ref}
        style={{
          ...numberStyle,
          position: "relative",
          width: numberBoxSize,
          height: numberBoxSize,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: numberFontSize,
        }}
      >
        {value}
      </div>
    </span>
  );

  if (tooltip === undefined) {
    return orb;
  }

  return (
    <HoverPopover
      delayMs={ORB_TOOLTIP_DELAY_MS}
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
      {orb}
    </HoverPopover>
  );
}
