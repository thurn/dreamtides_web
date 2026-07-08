// SiteNode — the dreamscape site disc. A floating circular node over a
// dreamscape's scene art: a dark radial disc with a white glyph and a soft accent
// ring. Every site disc is the same size; the guardian battle carries a pulsing
// ring, and visited and locked nodes dim and show a status badge. The disc
// carries no text label —
// pressing / hovering it reveals the site name + detail through the ONE shared
// popover, InfoCard's `icon` variant, whose disc is styled to read identically to
// the node it rose from.
//
// The reveal is INPUT-ADAPTIVE (the Tango generalization of the touch-first
// design source): on a fine pointer (mouse / desktop) HOVER reveals and a click
// enters the site; on a coarse pointer (touch) press-down reveals, and a quick
// tap enters while a deliberate hold-to-read is just a read. It routes through
// InfoCard's `usePressReveal` + `anchorRect` + `PressPopover`, so timing,
// placement, and the on-screen clamp match every other Tango reveal.
//
// Unifies the local `DreamscapeSiteNode` / `DreamscapeSitePopover` pair with the
// design source `components/quest/SiteNode.jsx`: the LOCAL node treatment + game
// data (battle sizing, floaty drift, visited / locked badges, the placed-site
// model, the deferred-cursor contract) is authoritative; the
// DESIGN InfoCard-icon reveal + the input-adaptive engine is the Tango vocabulary
// the preview now speaks. The node measures against `stageRef` (the screen root)
// to anchor its reveal.

import * as React from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { InfoCard } from "../overlay/InfoCard";
import { richText, type RichText } from "../card/rich-text";
import { type ScatterPoint } from "./dreamscape-scatter";
import type { SiteState } from "../../../types/quest";
import { type Glyph } from "../../primitives/glyph";
import { type TangoColor, withAlpha } from "../../primitives/color";
import "./site-node.css";

const { usePressReveal, anchorRect, PressPopover } = InfoCard;

/** Disc diameter in px; battle guardians scale up from here. The disc's size is
 * the design system's, not a caller knob — the screen positions the node (via
 * `model.pos`); it does not resize it. */
const NODE_SIZE = 60;

/** The node's fixed accent — the system's violet, not a per-node color. The ring
 * and reveal disc derive their alpha from it via {@link withAlpha}. */
const NODE_ACCENT: TangoColor = "accent";

/**
 * One site placed in the dreamscape scene. The screen builds these models from
 * the node's sites + the seeded scatter so the node and its reveal share a
 * single source of truth for position, label, and interaction state.
 */
export interface DreamscapeSiteModel {
  site: SiteState;
  pos: ScatterPoint;
  index: number;
  /** This site is the dreamscape's guardian battle. */
  isBattle: boolean;
  /** A battle gated behind the dreamscape's other, unvisited sites. */
  isLocked: boolean;
  /** Clickable: not visited and not locked. */
  isInteractive: boolean;
  /** Display label (battle tier / `Draft Nx` / site type name). */
  label: string;
  /** One-line mechanic blurb shown in the reveal. */
  blurb: string;
  /** The site {@link Glyph}. */
  icon: Glyph;
}

/** The status note (locked / visited) shown under the blurb in the reveal. */
function siteRevealNote(model: DreamscapeSiteModel): string | null {
  if (model.isLocked && !model.site.isVisited) {
    return "You must visit the other sites in this dreamscape first.";
  }
  if (model.site.isVisited) {
    return "Already visited.";
  }
  return null;
}

/** The InfoCard body for a site reveal: the mechanic blurb plus, when locked or
 * visited, a muted status note under it. */
function siteRevealBody(model: DreamscapeSiteModel): RichText {
  const note = siteRevealNote(model);
  const blurb = richText.plain(model.blurb);
  return note === null ? blurb : richText.stack(blurb, richText.note(note));
}

export interface SiteNodeProps {
  /** The placed-site model — position, label, glyph, and state. */
  model: DreamscapeSiteModel;
  /** Enable the calm floaty drift (disabled under reduced-motion via CSS). */
  motion: boolean;
  /** Screen root the reveal anchors + clamps against (for popover placement). */
  stageRef: React.RefObject<HTMLElement | null>;
  /** Enter the site; fired on a tap / click of an interactive node only. */
  onSelect: (siteId: string) => void;
}

/**
 * A single floating site node whose press-reveal routes through InfoCard's
 * `icon` variant. The node positions itself from `model.pos` inside the stage.
 */
export function SiteNode({
  model,
  motion,
  stageRef,
  onSelect,
}: SiteNodeProps): React.ReactElement {
  const { site, pos, index, isBattle, isLocked, isInteractive } = model;

  const btnRef = React.useRef<HTMLButtonElement>(null);
  const { shown, fine, begin, end, enter, leave, heldPastTap, pointerRef } =
    usePressReveal();
  const [anchor, setAnchor] = React.useState<ReturnType<
    typeof anchorRect
  > | null>(null);

  React.useLayoutEffect(() => {
    if (shown && stageRef.current && btnRef.current) {
      setAnchor(anchorRect(stageRef.current, btnRef.current, pointerRef.current));
    } else {
      setAnchor(null);
    }
  }, [shown, stageRef, pointerRef]);

  // Every site disc is the same size — the guardian battle reads as special
  // through its pulsing ring and lock badge, not a larger disc.
  const diameter = NODE_SIZE;
  // A locked guardian stays at full opacity but its disc is desaturated to a
  // clear, readable "disabled" grey. The dimming lands on the disc alone so the
  // lock badge stays crisp and legible.
  const opacity = site.isVisited ? 0.42 : 1;
  const lockedFilter = isLocked ? "grayscale(1) brightness(0.62)" : undefined;

  // Ring + border derive from the node's fixed accent via color-mix alpha. The
  // bright ring shows while the reveal is up (hover on a fine pointer, press on
  // touch).
  const ring = shown
    ? `0 0 0 2px ${withAlpha(NODE_ACCENT, 0.9)}, 0 0 30px ${withAlpha(NODE_ACCENT, 0.55)}, 0 14px 26px rgba(0,0,0,.55)`
    : `0 0 0 1px ${withAlpha(NODE_ACCENT, 0.35)}, 0 0 18px ${withAlpha(NODE_ACCENT, 0.26)}, 0 8px 18px rgba(0,0,0,.5)`;

  const doSelect = (): void => {
    if (isInteractive) {
      onSelect(site.id);
    }
  };

  const onUp = (): void => {
    // On touch, a deliberate hold-to-read must not enter the site; a quick tap
    // does. On a fine pointer the click event drives selection instead.
    const wasHold = !fine && heldPastTap();
    end();
    if (!fine && !wasHold) {
      doSelect();
    }
  };

  const onClick = (): void => {
    // Fine pointer: a click enters the site. (On touch, selection already
    // happened in onUp; the synthesized click after a tap would double-fire, so
    // it is guarded by the fine check.)
    if (fine) {
      doSelect();
    }
  };

  const nodeStyle: CSSProperties = {
    left: `${String(pos.x)}%`,
    top: `${String(pos.y)}%`,
    width: diameter,
    height: diameter,
    marginLeft: -diameter / 2,
    marginTop: -diameter / 2,
    animationDelay: `${String(index * -1.37)}s`,
    opacity,
    zIndex: shown ? 40 : 10,
    transform: shown && isInteractive ? "scale(1.08)" : "scale(1)",
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <button
      ref={btnRef}
      type="button"
      className={"ds-node" + (motion ? " floaty" : "")}
      style={nodeStyle}
      onPointerEnter={enter}
      onPointerDown={begin}
      onPointerUp={onUp}
      onPointerLeave={leave}
      onPointerCancel={end}
      onFocus={enter}
      onBlur={leave}
      onClick={onClick}
      aria-label={model.label}
      aria-disabled={!isInteractive}
      data-site-id={site.id}
      data-site-type={site.type}
      data-site-visited={site.isVisited ? "true" : "false"}
      data-site-locked={isLocked ? "true" : "false"}
      data-interactive={isInteractive ? "true" : "false"}
    >
      <span
        className="ds-disc"
        style={{
          boxShadow: ring,
          borderColor: withAlpha(NODE_ACCENT, 0.45),
          ...(lockedFilter !== undefined ? { filter: lockedFilter } : {}),
        }}
      >
        <span
          className="ds-ico"
          style={{
            fontSize: diameter * 0.52,
            width: diameter * 0.52,
            height: diameter * 0.52,
          }}
        >
          <i
            className={model.icon}
            aria-hidden="true"
            style={{ fontSize: "inherit", lineHeight: 1 }}
          />
        </span>
      </span>
      {isBattle && !isLocked && !site.isVisited && (
        <span className="ds-battle-pulse" aria-hidden="true" />
      )}
      {site.isVisited && (
        <span className="ds-node-badge visited" aria-hidden="true">
          <i className="bx bx-check" />
        </span>
      )}
      {isLocked && !site.isVisited && (
        <span className="ds-node-badge locked" aria-hidden="true">
          <i className="bxf bx-lock" />
        </span>
      )}
      {anchor &&
        stageRef.current &&
        createPortal(
          <PressPopover anchor={anchor}>
            <InfoCard
              variant="icon"
              glyph={model.icon}
              title={model.label}
              body={siteRevealBody(model)}
            />
          </PressPopover>,
          stageRef.current,
        )}
    </button>
  );
}
