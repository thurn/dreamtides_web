import type { MerchantArchetypeId } from "../archetypes/types";

/**
 * Design-space dimensions. The whole Dream Journey composition is authored at
 * 1440 x 980 and scaled uniformly (single transform, top-left origin) to fit
 * its container, so every measurement in the UI modules is a design-space pixel
 * value. See {@link DreamJourneyStage} for the scaling wrapper.
 */
export const JOURNEY_DESIGN_WIDTH = 1440;
export const JOURNEY_DESIGN_HEIGHT = 980;

/** The shared accept-button gradient — purple is the universal "yes". */
export const JOURNEY_ACCEPT_GRADIENT = "linear-gradient(180deg,#8b5cff,#6a35e0)";
export const JOURNEY_ACCEPT_BORDER = "1px solid rgba(180,150,255,.5)";

/** The clipped-text gradient used for the screen title. */
export const JOURNEY_TITLE_GRADIENT = "linear-gradient(180deg,#efeaff,#a988ff)";

/** Purple CHOSEN ring + glow for draft / package selections. */
export const JOURNEY_RING_CHOSEN =
  "0 0 0 3px rgba(150,120,255,.95), 0 0 26px rgba(124,77,255,.55), 0 14px 28px rgba(0,0,0,.5)";
/** Teal ring used by the Transfigure "after" card. */
export const JOURNEY_RING_TRANSFIGURE =
  "0 0 0 2.5px rgba(95,230,205,.85), 0 0 32px rgba(60,210,180,.5), 0 14px 30px rgba(0,0,0,.5)";
/** Blue ring used by the Duplicate chosen card. */
export const JOURNEY_RING_DUPLICATE =
  "0 0 0 2.5px rgba(138,180,255,.95), 0 0 24px rgba(110,150,255,.55), 0 12px 26px rgba(0,0,0,.5)";
/** Soft drop shadow for an idle (unselected) card. */
export const JOURNEY_SHADOW_IDLE = "0 12px 26px rgba(0,0,0,.5)";

/**
 * A category pill is "small and loud": 11px / 800, uppercase, 0.2em tracking,
 * tinted in the theme accent. The accent tints only the pill and secondary
 * labels — never the accept button, which is always purple.
 */
export interface JourneyAccent {
  /** Category label shown in the pill (e.g. "Grant · Draft"). */
  pill: string;
  /** Accent text color. */
  color: string;
  /** Pill background. */
  background: string;
  /** Pill border. */
  border: string;
}

function accent(
  pill: string,
  color: string,
  bg: string,
  border: string,
): JourneyAccent {
  return { pill, color, background: bg, border };
}

/**
 * Per-archetype theme accent and category-pill label. Drives the pill and the
 * secondary captions (NOW / AFTER, the chosen-count, etc.). Keyed by the
 * archetype id — an enum, never a card name — so the mapping is stable.
 */
export const JOURNEY_ACCENTS: Readonly<Record<MerchantArchetypeId, JourneyAccent>> =
  {
    strong_card: accent(
      "Grant · Gift",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    fit_card_grant: accent(
      "Grant · Gift",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    fit_card_draft: accent(
      "Grant · Draft",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    copies_draft: accent(
      "Grant · Draft",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    category_draft_known: accent(
      "Grant · Package",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    card_bundle: accent(
      "Grant · Package",
      "#4fe0c4",
      "rgba(79,224,196,.1)",
      "1px solid rgba(79,224,196,.32)",
    ),
    transfigured_draft: accent(
      "Grant · Draft",
      "#5fe6cd",
      "rgba(79,224,196,.1)",
      "1px solid rgba(95,230,205,.32)",
    ),
    transfigure: accent(
      "Improve · Transfigure",
      "#b79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    starter_transfigure: accent(
      "Improve · Transfigure",
      "#b79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    keyword_mod: accent(
      "Improve · Transfigure",
      "#b79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    tribal_change: accent(
      "Improve · Transfigure",
      "#b79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    purge: accent(
      "Remove · Purge",
      "#ff8d8a",
      "rgba(224,82,76,.12)",
      "1px solid rgba(224,82,76,.34)",
    ),
    purge_replace: accent(
      "Remove · Replace",
      "#ffae8a",
      "rgba(224,130,76,.12)",
      "1px solid rgba(224,130,76,.34)",
    ),
    duplicate: accent(
      "Duplicate",
      "#8ab4ff",
      "rgba(110,150,255,.12)",
      "1px solid rgba(110,150,255,.32)",
    ),
    dreamsign: accent(
      "Dreamsign · Gift",
      "#c79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    dreamsign_draft: accent(
      "Dreamsign · Draft",
      "#c79bff",
      "rgba(124,77,255,.12)",
      "1px solid rgba(124,77,255,.34)",
    ),
    add_site: accent(
      "Site · Reshape",
      "#7fe6a0",
      "rgba(90,220,140,.12)",
      "1px solid rgba(90,220,140,.34)",
    ),
  };
