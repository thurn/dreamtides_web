// AtlasNodeReveal — one Dream Atlas node wired to the shared InfoCard press
// engine. It renders the node face (AtlasNode) and, while the node is pressed
// (touch) or hovered (fine pointer), reveals the node's detail as an InfoCard
// through the ONE Tango popover — pointer-anchored, clamped on-screen, and kept
// clear of the finger. Selecting an available node (a quick tap, a fine-pointer
// click, or Enter/Space) enters its dreamscape; a deliberate hold-to-read never
// navigates.
//
// The reveal replaces the legacy atlas hover card with the design system's
// InfoCard, cut down for mobile: a scene-art hero with the dreamscape name, its
// resident guide as the eyebrow, and the home-site bonus as the body — the
// labelled "Site / Bonus / Affiliation" rows of the old desktop card are
// dropped. A node carrying a pre-revealed known dreamsign shows a second,
// stacked object card for it.
//
// It routes through InfoCard's `usePressReveal` + `anchorRect` + `PressPopover`,
// so timing, placement, and the on-screen clamp match every other Tango reveal;
// the same engine reveals on hover on desktop and on press-down on touch.

import * as React from "react";
import { createPortal } from "react-dom";
import { AtlasNode, type AtlasNodeView } from "./AtlasNode";
import { InfoCard, type AnchorRect } from "../overlay/InfoCard";
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
 * A revealed dreamscape's reveal FEATURES its resident Dream Guide, composited
 * on top of the dreamscape scene (the scene deemphasized behind them), with the
 * guide's name as the (white, serif) headline — the dreamscape's own name,
 * decorative on mobile, is dropped. The boss superimposes Apollyon on Limbo the
 * same way; an unrevealed node is a compact text card.
 */
export interface AtlasNodeCard {
  /** An unrevealed / unreachable node: the compact "unseen dream" text card. */
  isUnrevealed: boolean;
  /** The looming boss node. */
  isBoss: boolean;
  /** Scene art (banner): the dreamscape scene, or Limbo for the boss; null while unrevealed. */
  sceneArt: ArtRef | null;
  /** The character render composited on top of the scene — the resident guide,
   * or Apollyon for the boss; null when there is no figure to feature (the
   * starter). */
  figureArt: ArtRef | null;
  /** Uppercase eyebrow — the boss's "Final Dream"; null otherwise. */
  eyebrow: string | null;
  /** Headline: the resident guide's name, the boss place, or "An Unseen Dream". */
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

/** Vertical gap (px) between the node card and its companion dreamsign card. */
const CARD_STACK_GAP = 10;

/** The main reveal card for a node: a figure-on-scene, a plain scene, or text. */
function AtlasMainCard({ card }: { card: AtlasNodeCard }): React.ReactElement {
  const body = richText.plain(card.body);
  // A revealed dreamscape (guide) or the boss (Apollyon): the character figure
  // composited on top of the scene, with the featured name as the headline.
  if (card.sceneArt !== null && card.figureArt !== null) {
    return (
      <InfoCard
        variant="scene"
        image={card.sceneArt}
        figure={card.figureArt}
        imageCrop="center"
        meta={card.eyebrow ?? undefined}
        title={card.title}
        body={body}
      />
    );
  }
  // A guideless revealed place (the starter): the scene alone.
  if (card.sceneArt !== null) {
    return (
      <InfoCard
        variant="portrait"
        image={card.sceneArt}
        imageCrop="center"
        title={card.title}
        body={body}
      />
    );
  }
  // Unrevealed / unreachable: a compact text card.
  return <InfoCard variant="text" title={card.title} body={body} />;
}

/**
 * Renders a node's reveal: the main InfoCard, and — when the node carries a
 * pre-revealed known dreamsign — its own companion dreamsign card stacked below.
 */
function AtlasRevealCard({ card }: { card: AtlasNodeCard }): React.ReactElement {
  const { dreamsign } = card;
  if (dreamsign === null) {
    return <AtlasMainCard card={card} />;
  }
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        gap: CARD_STACK_GAP,
      }}
    >
      <AtlasMainCard card={card} />
      {dreamsign.art !== null ? (
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
      )}
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
        createPortal(
          <PressPopover anchor={anchor}>
            <AtlasRevealCard card={card} />
          </PressPopover>,
          stageRef.current,
        )}
    </>
  );
}
