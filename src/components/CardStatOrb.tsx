import { type CSSProperties, type ReactNode } from "react";
import { HoverPopover } from "./HoverPopover";
import { ENERGY_ORB_URL, SPARK_ORB_URL } from "./card-assets";
import { useFitText } from "./useFitText";

export type CardStatOrbVariant = "energy" | "spark";

const ORB_IMAGE: Readonly<Record<CardStatOrbVariant, string>> = {
  energy: ENERGY_ORB_URL,
  spark: SPARK_ORB_URL,
};

const DEFAULT_LABEL: Readonly<Record<CardStatOrbVariant, string>> = {
  energy: "energy cost",
  spark: "spark",
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
 * A card stat rendered as a glowing orb with a centered number. Energy cost
 * uses the teal orb (floating over the top name bar's left end); spark uses
 * the gold orb (at the right of the name bar). The number is set in Anton —
 * white with a black outline —
 * and auto-shrinks to fit the orb so multi-digit values never overflow.
 *
 * Single source of truth for the orb stat treatment shared by every
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
        backgroundImage: `url(${ORB_IMAGE[variant]})`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        flex: "0 0 auto",
      }}
    >
      <div
        ref={ref}
        style={{
          ...numberStyle,
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
