import { useMemo } from "react";
import type { CSSProperties } from "react";
import type { SiteState } from "../types/quest";
import { mulberry32, type ScatterPoint } from "../tango/components/dreamscape-scatter";

/**
 * One site placed in the dreamscape scene. The screen builds these models from
 * the node's sites + the seeded scatter so the node and its popover share a
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
  /** One-line mechanic blurb shown in the popover. */
  blurb: string;
  /** Boxicons (v3 filled) / Font Awesome class for the site glyph. */
  icon: string;
  /** Accent colour as a `#rrggbb` hex, used for the node's ring + popover. */
  accent: string;
}

/** Eyebrow shown above the site name in the popover. */
function popoverEyebrow(model: DreamscapeSiteModel): {
  text: string;
  className: string;
} {
  if (model.isBattle) return { text: "Guardian", className: "battle" };
  return { text: "Site", className: "" };
}

/**
 * A single floating site node: a dark disc with a white glyph, a soft accent
 * ring, and a calm drift. Battle nodes are larger and carry a pulsing ring;
 * visited and locked nodes dim and show a status badge.
 */
export function DreamscapeSiteNode({
  model,
  size,
  motion,
  hovered,
  onHover,
  onSelect,
}: {
  model: DreamscapeSiteModel;
  size: number;
  motion: boolean;
  hovered: boolean;
  onHover: (index: number | null) => void;
  onSelect: (siteId: string) => void;
}) {
  const { site, pos, index, isBattle, isLocked, isInteractive, accent } = model;

  // Battle guardians loom a little larger than the wayside sites.
  const diameter = isBattle ? Math.round(size * 1.22) : size;
  // A locked guardian stays at full opacity but is desaturated to a clear,
  // readable "disabled" grey — the old translucent treatment washed out against
  // the bright scene art and was hard to see.
  const opacity = site.isVisited ? 0.42 : 1;
  const lockedFilter = isLocked ? "grayscale(1) brightness(0.62)" : undefined;

  // Ring + border derive from the node's `#rrggbb` accent with alpha suffixes.
  const ring = hovered
    ? `0 0 0 2px ${accent}e6, 0 0 30px ${accent}8c, 0 14px 26px rgba(0,0,0,.55)`
    : `0 0 0 1px ${accent}59, 0 0 18px ${accent}42, 0 8px 18px rgba(0,0,0,.5)`;

  const handleSelect = () => {
    if (isInteractive) onSelect(site.id);
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
    zIndex: hovered ? 40 : 10,
    transform: hovered && isInteractive ? "scale(1.08)" : "scale(1)",
  };

  return (
    <button
      type="button"
      className={"ds-node" + (motion ? " floaty" : "")}
      style={nodeStyle}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(index)}
      onBlur={() => onHover(null)}
      onClick={handleSelect}
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
    </button>
  );
}

/**
 * The frosted hover card for the focused node. It opens toward open space —
 * leftward when the node sits on the right half, upward when the node sits low —
 * so it stays clear of the stage edges. Battle sites carry a tinted eyebrow;
 * locked and visited sites add a status note.
 */
export function DreamscapeSitePopover({
  model,
}: {
  model: DreamscapeSiteModel;
}) {
  const { pos, site, isLocked, label, blurb, accent } = model;
  const openLeft = pos.x > 52; // node on the right → card to its left
  const openUp = pos.y > 60; // node low → card above
  const eyebrow = popoverEyebrow(model);

  const note =
    isLocked && !site.isVisited
      ? {
          text: "You must visit the other sites in this dreamscape first.",
          className: "locked",
        }
      : site.isVisited
        ? { text: "Already visited.", className: "visited" }
        : null;

  return (
    <div
      className="ds-pop"
      style={{
        left: `${String(pos.x)}%`,
        top: `${String(pos.y)}%`,
        transform: `translate(${openLeft ? "calc(-100% - 30px)" : "30px"}, ${
          openUp ? "calc(-100% + 16px)" : "-16px"
        })`,
      }}
    >
      <div className="ds-pop-card">
        <div className="ds-pop-head">
          <span className="ds-pop-disc" style={{ borderColor: `${accent}73` }}>
            <i className={model.icon} aria-hidden="true" />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className={`ds-pop-eyebrow ${eyebrow.className}`}>
              {eyebrow.text}
            </div>
            <div className="ds-pop-name">{label}</div>
          </div>
        </div>
        <div className="ds-pop-body">
          {blurb}
          {note !== null && (
            <div className={`ds-pop-note ${note.className}`}>{note.text}</div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Sparse drifting motes that give the scene its dream mood. */
export function DreamscapeMotes({ on }: { on: boolean }) {
  const motes = useMemo(() => {
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
  if (!on) return null;
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
