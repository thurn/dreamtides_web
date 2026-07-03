import { type CSSProperties, type ReactNode } from "react";
import { HoverPopover } from "../tango/components/HoverPopover";
import {
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  GlowIcon,
  SPARK_ICON_CLASS,
  SPARK_ICON_COLOR,
} from "../tango/components/GlowIcon";
import { useFitText } from "./useFitText";

export type CardStatOrbVariant = "energy" | "spark" | "dreamwellEnergy";

/** Purple fill for the Dreamwell energy mark; the number stays white. */
export const DREAMWELL_ENERGY_ICON_COLOR = "#a855f7";

const DEFAULT_LABEL: Readonly<Record<CardStatOrbVariant, string>> = {
  energy: "energy cost",
  spark: "spark",
  dreamwellEnergy: "energy added",
};

/**
 * Glyph spec per stat variant. Both stats render the same way — a shadowed
 * Boxicons mark behind the centered number — so they read as a matched pair.
 * The corner marks carry only the soft content-protection shadow (no emitted
 * bloom; the glow stays on the inline rules-text references). `overscale`
 * pushes each glyph past the orb box (centered) to cancel the padding inside
 * its 24×24 viewBox, tuned per glyph so the sparkle and flame land at the same
 * visual weight.
 *
 * `numberShiftEm` tunes the digit per glyph: the flame's body sits in the upper
 * bulb of its box, so its digit is nudged down to seat inside the bulb instead
 * of crowding the flame's edges. The digit *size* lives in CSS (passed in as
 * `numberSizeVar`) so it can be tuned live alongside the other orb tokens.
 */
const ICON_BY_VARIANT: Readonly<
  Record<
    CardStatOrbVariant,
    {
      iconClass: string;
      color: string;
      overscale: number;
      /** Vertical nudge of the digit, in `em` of the digit size. */
      numberShiftEm: number;
    }
  >
> = {
  spark: {
    iconClass: SPARK_ICON_CLASS,
    color: SPARK_ICON_COLOR,
    overscale: 1.15,
    numberShiftEm: 0,
  },
  energy: {
    iconClass: ENERGY_ICON_CLASS,
    color: ENERGY_ICON_COLOR,
    overscale: 1.12,
    numberShiftEm: 0.06,
  },
  // The Dreamwell energy mark reuses the energy flame glyph in purple (the
  // number stays white) so a card's `energy-added` reads as the same kind of
  // resource as a regular energy cost, recolored for the Dreamwell.
  dreamwellEnergy: {
    iconClass: ENERGY_ICON_CLASS,
    color: DREAMWELL_ENERGY_ICON_COLOR,
    overscale: 1.12,
    numberShiftEm: 0.06,
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
   * CSS length for the digit size — the single-digit ceiling, which doubles as
   * the digit box edge (e.g. `var(--cv-energy-orb-font-size)`). Multi-digit
   * values auto-shrink below this to fit.
   */
  numberSizeVar: string;
  /**
   * Upper bound (px) for the digit auto-shrink search. The displayed size is
   * the smaller of the CSS digit ceiling and the fitted size, so this only
   * needs to sit at or above the rendered digit size.
   */
  numberCapPx: number;
  ariaLabel?: string;
  tooltip?: ReactNode;
  /**
   * Tint applied to the digit when the stat has been changed by a
   * transfiguration (e.g. a bumped spark or halved energy cost). Only the number
   * picks up the tint; the resource glyph behind it keeps its resource hue so a
   * changed stat still reads as the same kind of resource.
   */
  tintColor?: string;
}

/**
 * A card stat rendered with a centered number over a Boxicons mark: the blue
 * flame (`bxf bx-fire-alt`) for energy cost — floating over the top name bar's
 * left end — and the amber-gold sparkle (`bxf bx-sparkles`) for spark, at the
 * right of the name bar. Both marks carry a soft content-protection shadow (no
 * emitted bloom — the glow stays on the inline rules-text references) so they
 * read as a matched pair. The number is set in Anton — white with a soft dark
 * shadow — and auto-shrinks to fit so multi-digit values never overflow.
 *
 * Single source of truth for the corner stat treatment shared by every
 * `CardView` surface. The inline `⍏N` references in rules text keep their own
 * compact `PipBadge` rendering; this component is only for the corner stats.
 */
export function CardStatOrb({
  variant,
  value,
  sizeVar,
  numberSizeVar,
  numberCapPx,
  ariaLabel,
  tooltip,
  tintColor,
}: CardStatOrbProps) {
  const label = ariaLabel ?? DEFAULT_LABEL[variant];
  const icon = ICON_BY_VARIANT[variant];
  // The digit box edge equals the CSS digit size; the digit sits over the
  // glyph's body so it reads over the fullest region rather than the edges.
  const numberBoxSize = numberSizeVar;
  const { ref, fontSize } = useFitText(numberCapPx, 6, [value, numberCapPx]);

  // The digit's font-size is the smaller of the box-relative ceiling and the
  // fitted size, so a single digit fills the box (and tracks the CSS orb size
  // live) while multi-digit values shrink to fit.
  const numberFontSize = `min(${numberBoxSize}, ${String(fontSize)}px)`;

  const numberStyle: CSSProperties = {
    fontFamily: '"Anton", system-ui, sans-serif',
    fontWeight: 400,
    color: tintColor ?? "#ffffff",
    lineHeight: 1,
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    // Soft content protection rather than a hard keyline: a thin near-black
    // halo defines the digit edge against both the bright gold spark and the
    // blue energy flame, and a short downward dark blur grounds it with depth.
    // Radii are in `em` so the effect tracks the rendered digit size.
    textShadow: [
      `0 0 0.04em rgba(0, 0, 0, 0.9)`,
      `0 0 0.08em rgba(0, 0, 0, 0.7)`,
      `0 0.035em 0.06em rgba(0, 0, 0, 0.85)`,
    ].join(", "),
  };

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
        shadow
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
          // Nudge the digit into the glyph's body (e.g. down into the flame's
          // bulb) so it seats over the fullest region. `em` tracks the digit
          // size so the nudge scales with it.
          transform:
            icon.numberShiftEm !== 0
              ? `translateY(${String(icon.numberShiftEm)}em)`
              : undefined,
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
