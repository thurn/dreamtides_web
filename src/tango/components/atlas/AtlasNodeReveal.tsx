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
// bonus as the glass text card laid on top of it — the labelled "Site / Bonus /
// Affiliation" rows of the desktop card are dropped. A node carrying a
// pre-revealed known dreamsign shows a second, stacked object card for it.
//
// It routes through InfoCard's `usePressReveal` + `anchorRect` + `PressPopover`,
// so timing, placement, and the on-screen clamp match every other Tango reveal;
// the same engine reveals on hover on desktop and on press-down on touch.

import * as React from "react";
import { createPortal } from "react-dom";
import { AtlasNode, type AtlasNodeView } from "./AtlasNode";
import { InfoCard, infoCardScale, type AnchorRect } from "../overlay/InfoCard";
import { richText } from "../card/rich-text";
import { type ArtRef } from "../../primitives/art";

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
}

/** One placed node plus its resolved reveal content. */
export interface AtlasNodeRevealItem {
  /** Presentational data for the {@link AtlasNode} face. */
  view: AtlasNodeView;
  /** The InfoCard reveal content for this node. */
  card: AtlasNodeCard;
}

/** Gap (px) between the node card and its companion dreamsign card — the space
 * between them whether they stack (desktop) or sit side by side (mobile). */
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

/**
 * Renders a node's reveal: the main InfoCard, and — when the node carries a
 * pre-revealed known dreamsign — its own companion dreamsign card beside it.
 * `layout` is `"row"` on mobile (the scaled-down pair sits side by side) or
 * `"stack"` on desktop (native-size cards stacked vertically). A pair with
 * variable copy lengths gets natural height with cross-axis centering, per the
 * variable-content-siblings rule.
 */
function AtlasRevealCard({
  card,
  layout,
}: {
  card: AtlasNodeCard;
  layout: "row" | "stack";
}): React.ReactElement {
  const { dreamsign } = card;
  if (dreamsign === null) {
    return <AtlasMainCard card={card} />;
  }
  const isRow = layout === "row";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: isRow ? "row" : "column",
        alignItems: isRow ? "center" : "stretch",
        gap: CARD_STACK_GAP,
      }}
    >
      <AtlasMainCard card={card} />
      <AtlasDreamsignCard dreamsign={dreamsign} />
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
      setAnchor(anchorRect(stageRef.current, faceRef.current, pointerRef.current));
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
          // Each card scales itself down on mobile (InfoCard's own rule), so a
          // dreamsign pair fits side by side there; at native (desktop) size the
          // pair stacks vertically instead. Ask InfoCard whether we are in the
          // scaled-down mobile size for this screen width.
          const isMobile = infoCardScale(anchor.w) < 1;
          const layout: "row" | "stack" =
            isMobile && card.dreamsign !== null ? "row" : "stack";
          return createPortal(
            <PressPopover anchor={anchor}>
              <AtlasRevealCard card={card} layout={layout} />
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
