// AtlasHoverCard — the large desktop hover card revealed over a Dream Atlas
// node on the Tango desktop atlas. The atlas-specific data shape lives here,
// while the visual treatment is the shared InfoCard `atlasReveal` variant.
//
// The design's guiding constraint is typographic restraint: the legacy atlas
// card stacked six type styles and two icon families to label every field. This
// card carries the main place information in three voices — a display serif
// (the place), an accent serif (the resident guide), and the rules-text body.
// The site mechanic is a separate standard site InfoCard beside it, so this card
// keeps one job and stays quiet.
//
import * as React from "react";
import { type ArtRef } from "../../primitives/art";
import { richText } from "../card/rich-text";
import { InfoCard } from "../overlay/InfoCard";
import type { InfoCardProps } from "../overlay/InfoCard";
import type { AtlasNodePrimary } from "./AtlasNode";

/**
 * The resolved copy + art the hover card renders. Plain display data (strings
 * and {@link ArtRef}s); the view-model builder resolves names, the site label,
 * and the boss incarnation into these fields.
 */
export interface AtlasHoverContent {
  /** The looming boss node — suppresses the site / affiliation, and the
   * incarnation title stands in as the guide name. */
  isBoss: boolean;
  /** The scene hero art (the dreamscape scene, or Limbo for the boss). */
  sceneArt: ArtRef;
  /** The character render standing on the right (the guide, or the boss); null
   * for a guideless place (the starter). */
  figureArt: ArtRef | null;
  /** The place name (dreamscape, or "Limbo"). */
  placeName: string;
  /** The resident guide's name, or the boss incarnation title; null for the
   * starter. */
  guideName: string | null;
  /** The signature site's display name (e.g. "Dream Augury"); null for the
   * starter / boss. */
  siteName: string | null;
  /** The site bonus, starter blurb, or boss incarnation description. */
  body: string;
  /** The dreamscape's affiliation name; null for the starter / boss. */
  affiliation: string | null;
}

/** The bottom-left field stack the card lays out. */
interface FieldStack {
  /** The display-serif lead name. */
  display: string;
  /** The accent-serif secondary line, or null when absent. */
  accent: string | null;
}

/** Resolves the place-forward display stack for the settled atlas hover card. */
export function resolveFieldStack(content: AtlasHoverContent): FieldStack {
  // place-forward: the place is the hero, its guide the accent line.
  return {
    display: content.placeName,
    accent: content.guideName,
  };
}

/** Selects the strict Atlas primary variant from semantic node content. */
export function atlasPrimaryInfoCard(content: AtlasNodePrimary): InfoCardProps {
  if (content.sceneArt === null || content.placeName === null) {
    return { variant: "text", title: content.title, body: richText.plain(content.body) };
  }
  return {
    variant: "atlasReveal",
    image: content.sceneArt,
    imageCrop: "center",
    figure: content.figureArt ?? undefined,
    title: content.placeName,
    subtitle: content.guideName ?? undefined,
    body: richText.plain(content.body),
  };
}

interface AtlasHoverCardProps {
  content: AtlasHoverContent;
}

/**
 * The large desktop Dream Atlas hover card. Pure and props-driven; positioned
 * by the shared InfoCard press engine (`InfoCard.PressPopover`) exactly like
 * every other Tango reveal.
 */
export function AtlasHoverCard({
  content,
}: AtlasHoverCardProps): React.ReactElement {
  const stack = resolveFieldStack(content);

  return (
    <InfoCard
      variant="atlasReveal"
      image={content.sceneArt}
      imageCrop="center"
      figure={content.figureArt ?? undefined}
      title={stack.display}
      subtitle={stack.accent ?? undefined}
      body={richText.plain(content.body)}
    />
  );
}
