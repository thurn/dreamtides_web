import { useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import type { Dreamsign } from "../types/quest";
import { RulesText } from "./RulesText";

/**
 * Shared visual primitives for "pick one of N offered options" surfaces.
 *
 * Owned by the dreamsign draft, dreamsign offering, journey dreamsign
 * chooser, and the card-draft header. Every surface that asks the player
 * to pick one of several offered options draws its frame, palette,
 * accept/cancel buttons, and headings from this module so the look stays
 * consistent.
 *
 * Two flavours are supported:
 *   - Full-screen offerings (dreamsign draft, dreamsign offering) wrap
 *     their content in `OfferingScreenLayout`.
 *   - The card-draft and journey choosers use only the header / button
 *     tokens because their content layouts have separate constraints
 *     (deck sidebar, modal envelope) and are not interchangeable with
 *     the dreamsign card frame.
 */

/** Purple accent colours used across every offering surface. */
export const OFFERING_ACCENT = {
  /** Heading text colour and primary accent. */
  primary: "#a855f7",
  /** Light tint for the enhanced badge text. */
  light: "#c084fc",
  /** Mid-tone for purple borders. */
  border: "rgba(168, 85, 247, 0.35)",
  /** Stronger border tone for selected/highlighted variants. */
  borderStrong: "rgba(168, 85, 247, 0.65)",
  /** Soft glow used on offering cards. */
  glow: "rgba(168, 85, 247, 0.16)",
  /** Background fill behind enhanced badge. */
  badgeBackground: "rgba(168, 85, 247, 0.15)",
  /** Confirm button background. */
  buttonBackground: "#7c3aed",
  /** Tinted background for "Why?" / secondary purple buttons. */
  secondaryBackground: "rgba(168, 85, 247, 0.14)",
  /** Text colour for "Why?" / secondary purple buttons. */
  secondaryText: "#d8b4fe",
} as const;

/** Neutral colours for skip / reject / cancel actions. */
export const OFFERING_NEUTRAL = {
  background: "rgba(107, 114, 128, 0.2)",
  border: "rgba(107, 114, 128, 0.4)",
  text: "#9ca3af",
} as const;

/** Dark gradient panel background used inside every offering card. */
export const OFFERING_CARD_BACKGROUND =
  "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)";

/**
 * Outer motion wrapper used by full-screen offering surfaces. Provides
 * consistent vertical padding and the standard slide-in animation.
 */
export function OfferingScreenLayout({
  children,
  testId,
  className = "",
}: {
  readonly children: ReactNode;
  readonly testId?: string;
  readonly className?: string;
}) {
  return (
    <motion.div
      data-testid={testId}
      data-offering-screen=""
      className={`flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8 ${className}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Header block used by every offering surface. Renders a purple title, a
 * dimmed subtitle, and an optional `enhanced` capsule.
 *
 * `compact` swaps the title font down to text-lg for the card draft inline
 * header. Full-screen offerings use the default size.
 */
export function OfferingScreenHeader({
  title,
  subtitle,
  enhancedLabel,
  compact = false,
  rightSlot,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly enhancedLabel?: string;
  readonly compact?: boolean;
  readonly rightSlot?: ReactNode;
}) {
  if (compact) {
    return (
      <div
        data-offering-header=""
        data-offering-header-compact=""
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="flex items-center gap-3">
          <h2
            className="text-lg font-bold tracking-wide"
            style={{ color: OFFERING_ACCENT.primary }}
          >
            {title}
          </h2>
          {subtitle ? (
            <span className="text-xs opacity-50">{subtitle}</span>
          ) : null}
        </div>
        {rightSlot}
      </div>
    );
  }
  return (
    <div data-offering-header="" className="mb-6 text-center">
      <h2
        className="text-2xl font-bold tracking-wide md:text-3xl"
        style={{ color: OFFERING_ACCENT.primary }}
      >
        {title}
      </h2>
      {subtitle !== undefined && subtitle.length > 0 ? (
        <p className="mt-1 text-sm opacity-50">{subtitle}</p>
      ) : null}
      {enhancedLabel !== undefined && enhancedLabel.length > 0 ? (
        <span
          data-offering-enhanced-badge=""
          className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
          style={{
            background: OFFERING_ACCENT.badgeBackground,
            color: OFFERING_ACCENT.light,
            border: `1px solid ${OFFERING_ACCENT.border}`,
          }}
        >
          {enhancedLabel}
        </span>
      ) : null}
    </div>
  );
}

/**
 * Flex-wrap layout for the offered options. Each child should be a single
 * offering card (or its hover/select wrapper).
 */
export function OfferingGrid({
  children,
  maxWidthClass = "max-w-4xl",
}: {
  readonly children: ReactNode;
  readonly maxWidthClass?: string;
}) {
  return (
    <div
      data-offering-grid=""
      className={`flex ${maxWidthClass} flex-wrap justify-center gap-5`}
    >
      {children}
    </div>
  );
}

/** Width preset shared by every offering card. */
export const OFFERING_CARD_WIDTH_PX = 224;

/**
 * Shared offering card frame: gradient background, purple border, soft
 * glow. Children render whatever the offering surface needs inside
 * (art, name, rules text).
 *
 * `selected` thickens the border for a confirmed pick. `tone` lets a
 * surface (currently the bane reward) swap the purple accent for red.
 */
export function OfferingCardFrame({
  children,
  selected = false,
  tone = "boon",
  className = "",
  style,
}: {
  readonly children: ReactNode;
  readonly selected?: boolean;
  readonly tone?: "boon" | "bane";
  readonly className?: string;
  readonly style?: CSSProperties;
}) {
  const baneBorder = "rgba(239, 68, 68, 0.55)";
  const baneGlow = "rgba(239, 68, 68, 0.18)";
  const border =
    tone === "bane"
      ? baneBorder
      : selected
      ? OFFERING_ACCENT.borderStrong
      : OFFERING_ACCENT.border;
  const glow = tone === "bane" ? baneGlow : OFFERING_ACCENT.glow;
  return (
    <div
      data-offering-card=""
      data-offering-card-tone={tone}
      data-offering-card-selected={selected ? "true" : "false"}
      className={`flex flex-col items-center gap-2 rounded-lg p-4 ${className}`}
      style={{
        width: OFFERING_CARD_WIDTH_PX,
        background: OFFERING_CARD_BACKGROUND,
        border: `1px solid ${border}`,
        boxShadow: `0 0 12px ${glow}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Primary "Accept" / "Select" / "Confirm" button used to commit an
 * offered option. Purple fill, full width of the surrounding card slot
 * so it lines up with the offering card frame above it.
 */
export function OfferingAcceptButton({
  children,
  onClick,
  disabled = false,
  testId,
  className = "w-full",
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly testId?: string;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-offering-accept=""
      className={`rounded-lg px-5 py-2.5 font-bold text-white transition-opacity ${className}`}
      style={{
        backgroundColor: OFFERING_ACCENT.buttonBackground,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

/** Neutral skip/reject/cancel button. Slate-grey fill. */
export function OfferingSkipButton({
  children,
  onClick,
  title,
  testId,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly title?: string;
  readonly testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-offering-skip=""
      className="rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
      style={{
        background: OFFERING_NEUTRAL.background,
        border: `1px solid ${OFFERING_NEUTRAL.border}`,
        color: OFFERING_NEUTRAL.text,
      }}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

/** Secondary purple-tinted footer button for offering-screen actions. */
export function OfferingSecondaryButton({
  children,
  onClick,
  testId,
}: {
  readonly children: ReactNode;
  readonly onClick: () => void;
  readonly testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      data-offering-secondary=""
      className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      style={{
        background: OFFERING_ACCENT.secondaryBackground,
        border: `1px solid ${OFFERING_ACCENT.border}`,
        color: OFFERING_ACCENT.secondaryText,
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Footer toolbar wrapper used below the offering grid. */
export function OfferingFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div
      data-offering-footer=""
      className="mt-8 flex flex-wrap items-center justify-center gap-3"
    >
      {children}
    </div>
  );
}

/**
 * Standard dreamsign body rendered inside `OfferingCardFrame`. Identical
 * art / typography / spacing across the dreamsign draft and dreamsign
 * offering surfaces — the only difference between those two screens is
 * how many cards are offered and what the buttons say.
 */
export function OfferingDreamsignBody({
  dreamsign,
}: {
  readonly dreamsign: Dreamsign;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = Boolean(dreamsign.imageName) && !imageBroken;
  return (
    <>
      {showImage ? (
        <img
          data-offering-dreamsign-art=""
          src={`/dreamsigns/${String(dreamsign.imageName)}`}
          alt={dreamsign.imageAlt ?? dreamsign.name}
          className="h-24 w-24 object-contain"
          style={{
            filter: "drop-shadow(0 2px 6px rgba(168, 85, 247, 0.25))",
          }}
          onError={() => {
            setImageBroken(true);
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          data-offering-dreamsign-art-fallback=""
          className="flex h-24 w-24 items-center justify-center text-3xl"
          style={{ color: OFFERING_ACCENT.light }}
        >
          ✦
        </div>
      )}
      <h3
        data-offering-dreamsign-name=""
        className="text-center text-base font-bold"
        style={{ color: "#f8fafc" }}
      >
        {dreamsign.name}
      </h3>
      <div
        data-offering-dreamsign-text=""
        className="text-center text-xs leading-relaxed opacity-70"
        style={{ color: "#e2e8f0" }}
      >
        <RulesText text={dreamsign.effectDescription} />
      </div>
    </>
  );
}
