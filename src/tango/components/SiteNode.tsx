// SiteNode — the dreamscape site disc. A floating circular node over a
// dreamscape's scene art: a dark radial disc with a white glyph and a soft accent
// ring. Battle guardians loom a little larger and carry a pulsing ring; visited
// and locked nodes dim and show a status badge. The disc carries no text label —
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
// data (battle sizing, per-site accent, floaty drift, visited / locked badges,
// the placed-site model, the deferred-cursor contract) is authoritative; the
// DESIGN InfoCard-icon reveal + the input-adaptive engine is the Tango vocabulary
// the preview now speaks. The node measures against `stageRef` (the screen root)
// to anchor its reveal.

import * as React from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { InfoCard } from "./InfoCard";
import { mulberry32, type ScatterPoint } from "./dreamscape-scatter";
import type { SiteState } from "../../types/quest";
import "./site-node.css";

const { usePressReveal, anchorRect, PressPopover } = InfoCard;

/**
 * One site placed in the dreamscape scene. The screen builds these models from
 * the node's sites + the seeded scatter so the node and its reveal share a
 * single source of truth for position, label, accent, and interaction state.
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
  /** Boxicons (v3 filled) / Font Awesome class for the site glyph. */
  icon: string;
  /** Accent colour as a `#rrggbb` hex, used for the node's ring + reveal disc. */
  accent: string;
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

/** The `icon`-variant reveal disc, tinted to match this node's accent so the
 * disc reads identically in the node and in the card. */
function revealDiscStyle(accent: string): CSSProperties {
  return {
    background: "radial-gradient(120% 120% at 50% 28%, #1a1525, #070512)",
    boxShadow: `inset 0 0 0 2px ${accent}73, 0 0 14px 1px ${accent}5c`,
  };
}

export interface SiteNodeProps {
  /** The placed-site model — position, label, accent, glyph, and state. */
  model: DreamscapeSiteModel;
  /** Wayside disc diameter in px; battle guardians scale up from here. */
  size: number;
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
  size,
  motion,
  stageRef,
  onSelect,
}: SiteNodeProps): React.ReactElement {
  const { site, pos, index, isBattle, isLocked, isInteractive, accent } = model;

  const btnRef = React.useRef<HTMLButtonElement>(null);
  const { shown, fine, begin, end, enter, leave, heldPastTap } =
    usePressReveal();
  const [anchor, setAnchor] = React.useState<ReturnType<
    typeof anchorRect
  > | null>(null);

  React.useLayoutEffect(() => {
    if (shown && stageRef.current && btnRef.current) {
      setAnchor(anchorRect(stageRef.current, btnRef.current));
    } else {
      setAnchor(null);
    }
  }, [shown, stageRef]);

  // Battle guardians loom a little larger than the wayside sites.
  const diameter = isBattle ? Math.round(size * 1.22) : size;
  // A locked guardian stays at full opacity but is desaturated to a clear,
  // readable "disabled" grey.
  const opacity = site.isVisited ? 0.42 : 1;
  const lockedFilter = isLocked ? "grayscale(1) brightness(0.62)" : undefined;

  // Ring + border derive from the node's `#rrggbb` accent with alpha suffixes.
  // The bright ring shows while the reveal is up (hover on a fine pointer, press
  // on touch).
  const ring = shown
    ? `0 0 0 2px ${accent}e6, 0 0 30px ${accent}8c, 0 14px 26px rgba(0,0,0,.55)`
    : `0 0 0 1px ${accent}59, 0 0 18px ${accent}42, 0 8px 18px rgba(0,0,0,.5)`;

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
    ...(lockedFilter !== undefined ? { filter: lockedFilter } : {}),
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
        style={{ boxShadow: ring, borderColor: `${accent}73` }}
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
          <i className="bx bx-lock" />
        </span>
      )}
      {anchor &&
        stageRef.current &&
        createPortal(
          <PressPopover anchor={anchor}>
            <InfoCard
              variant="icon"
              glyph={model.icon}
              discStyle={revealDiscStyle(accent)}
              title={model.label}
              body={
                <>
                  {model.blurb}
                  {siteRevealNote(model) !== null && (
                    <div style={{ marginTop: 8, fontStyle: "italic" }}>
                      {siteRevealNote(model)}
                    </div>
                  )}
                </>
              }
            />
          </PressPopover>,
          stageRef.current,
        )}
    </button>
  );
}

/** Sparse drifting motes that give the dreamscape scene its dream mood. */
export function DreamscapeMotes({ on }: { on: boolean }): React.ReactElement | null {
  const motes = React.useMemo(() => {
    const rng = mulberry32(99);
    return Array.from({ length: 22 }, () => ({
      x: rng() * 100,
      y: rng() * 100,
      s: 1 + rng() * 2.4,
      d: 7 + rng() * 9,
      delay: -rng() * 16,
      o: 0.12 + rng() * 0.3,
    }));
  }, []);
  if (!on) {
    return null;
  }
  return (
    <div className="ds-motes" aria-hidden="true">
      {motes.map((m, i) => (
        <span
          key={i}
          style={{
            left: `${String(m.x)}%`,
            top: `${String(m.y)}%`,
            width: m.s,
            height: m.s,
            opacity: m.o,
            animationDuration: `${String(m.d)}s`,
            animationDelay: `${String(m.delay)}s`,
          }}
        />
      ))}
    </div>
  );
}
