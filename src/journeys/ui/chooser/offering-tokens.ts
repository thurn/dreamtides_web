/**
 * Journey-local mirror of the offering visual tokens.
 *
 * The journey module enforces an isolation contract: nothing under
 * `src/journeys/ui/` may import quest-prototype-side files. The shared
 * offering primitives live in `src/components/OfferingScreen.tsx`, so the
 * journey choosers cannot import them directly.
 *
 * To keep the journey chooser modal aligned with the dreamsign-draft,
 * dreamsign-offering, and card-draft surfaces, this file mirrors every
 * value used to style the prototype-side `<OfferingScreenHeader>`,
 * `<OfferingAcceptButton>`, `<OfferingSkipButton>`, and
 * `<OfferingCardFrame>`.
 *
 * `OfferingTokens.unify` is the source-of-truth canonical object. The
 * companion regression test
 * `src/components/OfferingScreen.test.ts` deep-equals this constant
 * against the prototype-side `OFFERING_ACCENT` / `OFFERING_NEUTRAL`
 * objects so the two can never silently diverge.
 */

export const OFFERING_ACCENT = {
  primary: "#a855f7",
  light: "#c084fc",
  border: "rgba(168, 85, 247, 0.35)",
  borderStrong: "rgba(168, 85, 247, 0.65)",
  glow: "rgba(168, 85, 247, 0.16)",
  badgeBackground: "rgba(168, 85, 247, 0.15)",
  buttonBackground: "#7c3aed",
  secondaryBackground: "rgba(168, 85, 247, 0.14)",
  secondaryText: "#d8b4fe",
} as const;

export const OFFERING_NEUTRAL = {
  background: "rgba(107, 114, 128, 0.2)",
  border: "rgba(107, 114, 128, 0.4)",
  text: "#9ca3af",
} as const;

export const OFFERING_CARD_BACKGROUND =
  "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)";
