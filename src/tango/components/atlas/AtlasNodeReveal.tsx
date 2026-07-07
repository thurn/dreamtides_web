// AtlasNodeReveal — one Dream Atlas node wired to the shared InfoCard press
// engine. It renders the node face (AtlasNode) and, while the node is pressed
// (touch) or hovered (fine pointer), reveals the node's detail as an InfoCard
// through the ONE Tango popover — pointer-anchored, clamped on-screen, and kept
// clear of the finger. Selecting an available node (a quick tap, a fine-pointer
// click, or Enter/Space) enters its dreamscape; a deliberate hold-to-read never
// navigates.
//
// The reveal renders through the design system's InfoCard, cut down for mobile:
// a full-bleed scene-art hero with the resident guide's name and the home-site
// bonus as the glass text card laid on top of it. Desktop uses a lighter large
// place/guide card plus a companion standard site InfoCard. A node carrying a
// pre-revealed known dreamsign shows its own companion object card.
//
// It routes through InfoCard's `usePressReveal` + `anchorRect` + `PressPopover`,
// so timing, placement, and the on-screen clamp match every other Tango reveal;
// the same engine reveals on hover on desktop and on press-down on touch.

import * as React from "react";
import { createPortal } from "react-dom";
import { AtlasNode, type AtlasNodeView } from "./AtlasNode";
import {
  InfoCard,
  INFO_CARD_WIDTH,
  infoCardWidth,
  type AnchorRect,
} from "../overlay/InfoCard";
import {
  AtlasHoverCard,
  type AtlasHoverContent,
} from "./AtlasHoverCard";
import { richText } from "../card/rich-text";
import { type ArtRef } from "../../primitives/art";
import { type Glyph } from "../../primitives/glyph";

const { usePressReveal, anchorRect, PressPopover } = InfoCard;

/** A node's pre-revealed known dreamsign, shown as its own companion card. */
export interface AtlasDreamsignCard {
  /** Dreamsign name (headline). */
  name: string;
  /** Its floating art as an {@link ArtRef}, or null when it has no image. */
  art: ArtRef | null;
  /** The dreamsign's ability text (rendered as Dreamtides rules copy). */
  rulesText: string;
}

/** The signature site info card shown beside the large desktop atlas reveal. */
export interface AtlasSiteInfoCard {
  /** Site type label (e.g. "Dream Augury"). */
  name: string;
  /** The same one-line mechanic blurb shown by the dreamscape SiteNode reveal. */
  blurb: string;
  /** The site glyph, matching the dreamscape SiteNode reveal. */
  icon: Glyph;
}

/** The affiliation note shown under the signature site card on desktop. */
export interface AtlasAffiliationInfoCard {
  /** Full InfoCard title, including the affiliation display name. */
  title: string;
  /** Sentence-case affiliation card theme (e.g. "Discard", "Figment"). */
  theme: string;
}

/**
 * The resolved reveal model for one atlas node — the mobile-cut InfoCard content
 * the view-model builder produces. Plain data (strings + {@link ArtRef}s); the
 * component picks the InfoCard variant from `isUnrevealed` / `isBoss` and which
 * media is present.
 *
 * A revealed dreamscape's reveal shows its scene as a full-bleed hero image with
 * a glass text card laid on top — the resident guide's name as the (white,
 * serif) headline and the home-site bonus as the body; the dreamscape's own
 * name, decorative on mobile, is dropped. The boss uses Limbo's scene the same
 * way; an unrevealed node is a compact text card.
 */
export interface AtlasNodeCard {
  /** An unrevealed / unreachable node: the compact "unseen dream" text card. */
  isUnrevealed: boolean;
  /** The looming boss node. */
  isBoss: boolean;
  /** Scene art (the full-bleed hero image): the dreamscape scene, or Limbo for
   * the boss; null while unrevealed. */
  sceneArt: ArtRef | null;
  /** The centered foreground character render laid over the scene hero: the
   * resident Dream Guide, or the boss in Limbo; null when the place has no
   * resident (the starter) or is unrevealed. */
  figureArt: ArtRef | null;
  /** Uppercase eyebrow shown above the title on the scene hero; null otherwise. */
  eyebrow: string | null;
  /** Headline: the resident guide's name, the boss's Apollyon incarnation name,
   * or "An Unseen Dream". */
  title: string;
  /** Body copy: the site bonus, the starter blurb, or the boss / unseen description. */
  body: string;
  /** A pre-revealed known dreamsign carried by this node, shown as its own card. */
  dreamsign: AtlasDreamsignCard | null;
  /** The dreamscape's own name (or "Limbo" for the boss); null while unrevealed.
   * Carried for the large desktop hover card, which presents the place and its
   * guide as distinct lines. */
  placeName: string | null;
  /** The resident guide's name, or the boss incarnation title; null for the
   * guideless starter or an unrevealed node. */
  guideName: string | null;
  /** The signature site's display name (e.g. "Dream Augury"); null for the
   * starter / boss / unrevealed node. */
  siteName: string | null;
  /** The dreamscape's affiliation name; null for the starter / boss /
   * unrevealed node. */
  affiliation: string | null;
  /** The signature site's standard info card; null for starter / boss /
   * unrevealed node. */
  siteCard: AtlasSiteInfoCard | null;
  /** The dreamscape affiliation's standard note card; null for starter / boss /
   * unrevealed node. */
  affiliationCard: AtlasAffiliationInfoCard | null;
}

/** One placed node plus its resolved reveal content. */
export interface AtlasNodeRevealItem {
  /** Presentational data for the {@link AtlasNode} face. */
  view: AtlasNodeView;
  /** The InfoCard reveal content for this node. */
  card: AtlasNodeCard;
}

/** Gap (px) between the node card and its companion cards. */
const CARD_STACK_GAP = 10;

/** The main reveal card for a node: a full-bleed scene hero, or a text card. */
function AtlasMainCard({ card }: { card: AtlasNodeCard }): React.ReactElement {
  const body = richText.plain(card.body);
  // A revealed dreamscape or the boss: the scene as a full-bleed hero image with
  // the featured name / bonus laid on top as the glass text card.
  if (card.sceneArt !== null) {
    return (
      <InfoCard
        variant="fullBleed"
        image={card.sceneArt}
        imageCrop="center"
        figure={card.figureArt ?? undefined}
        meta={card.eyebrow ?? undefined}
        title={card.title}
        body={body}
      />
    );
  }
  // Unrevealed / unreachable: a compact text card.
  return <InfoCard variant="text" title={card.title} body={body} />;
}

/**
 * Maps a resolved node card to the large desktop hover card's content, or null
 * when the node has no scene to render as a hero (an unrevealed node). PURE.
 */
export function toHoverContent(card: AtlasNodeCard): AtlasHoverContent | null {
  if (card.sceneArt === null || card.placeName === null) {
    return null;
  }
  return {
    isBoss: card.isBoss,
    sceneArt: card.sceneArt,
    figureArt: card.figureArt,
    placeName: card.placeName,
    guideName: card.guideName,
    siteName: card.siteName,
    body: card.body,
    affiliation: card.affiliation,
  };
}

/** The companion card for a node's pre-revealed known dreamsign. */
function AtlasDreamsignCard({
  dreamsign,
}: {
  dreamsign: AtlasDreamsignCard;
}): React.ReactElement {
  return dreamsign.art !== null ? (
    <InfoCard
      variant="object"
      image={dreamsign.art}
      imageFilter="dreamsign-portrait"
      title={dreamsign.name}
      body={richText.rules(dreamsign.rulesText)}
    />
  ) : (
    <InfoCard
      variant="text"
      title={dreamsign.name}
      body={richText.rules(dreamsign.rulesText)}
    />
  );
}

/** The standard site reveal card, matching the dreamscape SiteNode info card. */
function AtlasSiteInfoCard({
  site,
}: {
  site: AtlasSiteInfoCard;
}): React.ReactElement {
  return (
    <InfoCard
      variant="icon"
      glyph={site.icon}
      title={site.name}
      body={richText.plain(site.blurb)}
    />
  );
}

/** A compact note explaining the node's affiliation weighting. */
function AtlasAffiliationInfoCard({
  affiliation,
}: {
  affiliation: AtlasAffiliationInfoCard;
}): React.ReactElement {
  return (
    <InfoCard
      variant="text"
      title={affiliation.title}
      body={richText.plain(`${affiliation.theme} cards are more likely here.`)}
    />
  );
}

/**
 * Renders a node's reveal: the main card, and — when the node carries a
 * pre-revealed known dreamsign — its own companion dreamsign card beside it.
 * `layout` is `"row"` on mobile (the scaled-down companion pair sits side by
 * side) or `"desktop"` on desktop (the standard site InfoCard sits beside the
 * large atlas card, while any known-dreamsign card sits underneath). A pair with
 * variable copy lengths gets natural height with cross-axis centering, per the
 * variable-content-siblings rule.
 *
 * On desktop a revealed node's main card is the large {@link AtlasHoverCard}
 * (scene hero + resident figure on the right + the place / guide / bonus
 * panel), with the signature site carried by a separate standard site
 * InfoCard; mobile and unrevealed nodes keep the compact {@link AtlasMainCard}.
 */
function AtlasRevealCard({
  card,
  layout,
}: {
  card: AtlasNodeCard;
  layout: "row" | "desktop";
}): React.ReactElement {
  const { dreamsign } = card;
  const siteCard = layout === "desktop" ? card.siteCard : null;
  const affiliationCard =
    layout === "desktop" ? card.affiliationCard : null;
  // Desktop uses the desktop layout; a revealed node there gets the large hover
  // card. Mobile (row) and unrevealed nodes keep the compact fullBleed / text card.
  const hoverContent = layout === "desktop" ? toHoverContent(card) : null;
  const main =
    hoverContent !== null ? (
      <AtlasHoverCard content={hoverContent} />
    ) : (
      <AtlasMainCard card={card} />
    );
  if (dreamsign === null && siteCard === null && affiliationCard === null) {
    return main;
  }
  if (layout === "desktop") {
    const hasRightColumn = siteCard !== null || affiliationCard !== null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: CARD_STACK_GAP }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: CARD_STACK_GAP,
          }}
        >
          {main}
          {hasRightColumn && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: CARD_STACK_GAP,
              }}
            >
              {siteCard !== null && <AtlasSiteInfoCard site={siteCard} />}
              {affiliationCard !== null && (
                <AtlasAffiliationInfoCard affiliation={affiliationCard} />
              )}
            </div>
          )}
        </div>
        {dreamsign !== null && <AtlasDreamsignCard dreamsign={dreamsign} />}
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: CARD_STACK_GAP,
      }}
    >
      {main}
      {dreamsign !== null && <AtlasDreamsignCard dreamsign={dreamsign} />}
    </div>
  );
}

interface AtlasNodeRevealProps {
  /** The placed node and its reveal content. */
  item: AtlasNodeRevealItem;
  /** Screen root the reveal anchors + clamps against (for popover placement). */
  stageRef: React.RefObject<HTMLElement | null>;
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: string) => void;
}

/**
 * A single atlas node whose press-reveal routes through the shared InfoCard
 * engine. The node reveals on touch press-down and on fine-pointer hover; an
 * available node enters its dreamscape on a quick tap / click / Enter, while a
 * deliberate hold-to-read never navigates.
 */
export function AtlasNodeReveal({
  item,
  stageRef,
  onEnterNode,
}: AtlasNodeRevealProps): React.ReactElement {
  const { view, card } = item;
  const isAvailable = view.node.state === "available";
  const { shown, fine, begin, end, enter, leave, heldPastTap, pointerRef } =
    usePressReveal();
  const faceRef = React.useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = React.useState<AnchorRect | null>(null);

  React.useLayoutEffect(() => {
    if (shown && stageRef.current && faceRef.current) {
      setAnchor(
        anchorRect(stageRef.current, faceRef.current, pointerRef.current),
      );
    } else {
      setAnchor(null);
    }
  }, [shown, stageRef, pointerRef]);

  const doSelect = (): void => {
    if (isAvailable) {
      onEnterNode(view.node.id);
    }
  };

  const onUp = (): void => {
    // Touch: a quick tap enters; a deliberate hold-to-read does not. On a fine
    // pointer the click event drives selection instead.
    const wasHold = !fine && heldPastTap();
    end();
    if (!fine && !wasHold) {
      doSelect();
    }
  };

  const onActivate = (): void => {
    // Fine pointer: a click / Enter enters the dreamscape. (On touch, selection
    // already happened in onUp; the synthesized tap click is ignored here.)
    if (fine) {
      doSelect();
    }
  };

  return (
    <>
      <AtlasNode
        view={view}
        hovered={shown}
        rootRef={faceRef}
        onEnter={enter}
        onLeave={leave}
        onPointerEnter={enter}
        onPointerDown={begin}
        onPointerUp={onUp}
        onPointerLeave={leave}
        onPointerCancel={end}
        onClick={onActivate}
      />
      {anchor !== null &&
        stageRef.current !== null &&
        (() => {
          // Each card lays itself out at mobile width on narrow screens, so a
          // dreamsign pair fits side by side there; at native desktop width the
          // pair stacks vertically instead. Ask InfoCard whether this screen
          // width uses the mobile card width.
          const isMobile = infoCardWidth(anchor.w) < INFO_CARD_WIDTH;
          const layout: "row" | "desktop" = isMobile ? "row" : "desktop";
          return createPortal(
            <PressPopover anchor={anchor}>
              <AtlasRevealCard
                card={card}
                layout={layout}
              />
            </PressPopover>,
            // Portal into `document.body`, NOT the atlas stage root. The stage
            // root is `position: fixed`, which makes it its own stacking context
            // at `z-index: auto`; the app-shell hamburger menu button sits at a
            // higher z-index in the ROOT context, so any popover nested inside the
            // stage — however high its own z-index — is trapped beneath the menu.
            // Portaling to the body lets the popover's z-index compete with the
            // menu directly, so the reveal renders above it. The anchor is still
            // measured against the stage root (viewport-anchored, unscaled), so
            // its stage-native coordinates map 1:1 onto the body's viewport space.
            document.body,
          );
        })()}
    </>
  );
}
