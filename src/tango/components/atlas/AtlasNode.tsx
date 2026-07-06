import type { CSSProperties, ReactNode } from "react";
import type { DreamscapeNode } from "../../../types/quest";
import { BOSS_DISPLAY, ROUND_FRAME_URL } from "./atlas-display";
import { type Glyph } from "../../primitives/glyph";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import "./atlas.css";

/**
 * Presentational data for one Dream Atlas node, resolved once by
 * {@link import("../screens/AtlasScreen").AtlasScreen} and shared between the
 * node face and its hover-preview card.
 */
export interface AtlasNodeView {
  node: DreamscapeNode;
  /** Stage-space centre of the node (1920x1080 coordinate system). */
  left: number;
  top: number;
  /** Rendered node diameter in stage pixels. */
  size: number;
  isStarter: boolean;
  isBoss: boolean;
  /** The dreamscape icon art as an {@link ArtRef}, or `null` while unrevealed. */
  iconRef: ArtRef | null;
  /** The signature-site badge {@link Glyph}, or `null`. */
  siteBadgeGlyph: Glyph | null;
  /** The pre-revealed known dreamsign icon as an {@link ArtRef}, or `null`. */
  knownDreamsignRef: ArtRef | null;
  /** Multiplier applied to the site / dreamsign badge sizes (the mobile atlas
   * enlarges them). Defaults to 1 — the desktop size. */
  badgeScale?: number;
}

interface AtlasNodeProps {
  view: AtlasNodeView;
  hovered: boolean;
  onEnter: (nodeId: string) => void;
  onLeave: () => void;
  onClick: (nodeId: string) => void;
}

/**
 * One node on the redesigned Dream Atlas: a circular dreamscape icon in an
 * ornate frame with a per-state glow and stacked badges (site badge, known
 * dreamsign, boss skull). A completed node marks itself by turning its site
 * badge into a check. Unrevealed nodes render the empty
 * round frame. Visual state classes
 * (`node-available`, `node-completed`, ...) drive the glow treatment in
 * `atlas.css`.
 */
export function AtlasNode({
  view,
  hovered,
  onEnter,
  onLeave,
  onClick,
}: AtlasNodeProps) {
  const { node, isStarter, isBoss } = view;
  const isAvailable = node.state === "available";
  const isCompleted = node.state === "completed";

  let face: ReactNode;
  if (isBoss) {
    face = (
      <img
        className="frame-img"
        src={BOSS_DISPLAY.iconUrl}
        alt={BOSS_DISPLAY.place}
        draggable={false}
      />
    );
  } else if (view.iconRef !== null) {
    face = (
      <img
        className="frame-img"
        src={resolveArtRef(view.iconRef)}
        alt={node.biomeName}
        draggable={false}
      />
    );
  } else {
    face = (
      <div className="unrevealed-face">
        <img className="frame-img" src={ROUND_FRAME_URL} alt="" draggable={false} />
      </div>
    );
  }

  const className =
    `node node-${node.state}` +
    (hovered ? " is-hover" : "") +
    (isBoss ? " node-boss" : "") +
    (isStarter ? " node-start" : "");

  const ariaLabel =
    `${node.biomeName === "" ? (isBoss ? BOSS_DISPLAY.place : "Unrevealed dreamscape") : node.biomeName} - ${node.state}` +
    (isStarter ? " - starting dreamscape" : "") +
    (isBoss ? " - final boss" : "") +
    (view.knownDreamsignRef !== null ? " - known dreamsign here" : "");

  return (
    <div
      className={className}
      style={
        {
          left: view.left,
          top: view.top,
          width: view.size,
          height: view.size,
          // Drives the badge sizing in atlas.css — every badge is a fraction of
          // this so they scale together with the node's diameter.
          "--atlas-node-size": `${String(view.size)}px`,
          // Per-profile badge enlargement (the mobile atlas bumps this up).
          "--atlas-badge-scale": String(view.badgeScale ?? 1),
        } as CSSProperties
      }
      role={isAvailable ? "button" : "img"}
      tabIndex={isAvailable ? 0 : undefined}
      aria-label={ariaLabel}
      data-node-state={node.state}
      data-node-boss={isBoss ? "true" : undefined}
      data-node-starting={isStarter ? "true" : undefined}
      data-node-known-dreamsign={view.knownDreamsignRef !== null ? "true" : undefined}
      onMouseEnter={() => {
        onEnter(node.id);
      }}
      onMouseLeave={onLeave}
      onFocus={() => {
        onEnter(node.id);
      }}
      onBlur={onLeave}
      onClick={() => {
        onClick(node.id);
      }}
      onKeyDown={(event) => {
        if (isAvailable && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onClick(node.id);
        }
      }}
    >
      <div className="node-glow" />
      <div className="node-art">{face}</div>

      {(isCompleted || view.siteBadgeGlyph !== null) && (
        <div className="site-badges">
          <div className="site-badge">
            {/* A completed node marks itself by turning its site badge into a
                check (purple glyph on the dark disc) rather than carrying a
                separate completion badge. */}
            <i
              className={`${isCompleted ? "fa-solid fa-check" : (view.siteBadgeGlyph ?? "")} site-badge-glyph`}
              aria-hidden="true"
            />
          </div>
        </div>
      )}

      {isBoss && (
        <div className="boss-badge" title="Final boss">
          <i className="fa-solid fa-skull" aria-hidden="true" />
        </div>
      )}

      {view.knownDreamsignRef !== null && (
        <div className="known-badge" title="Known dreamsign">
          <img src={resolveArtRef(view.knownDreamsignRef)} alt="" draggable={false} />
        </div>
      )}
    </div>
  );
}
