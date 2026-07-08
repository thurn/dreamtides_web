import type {
  CSSProperties,
  PointerEventHandler,
  ReactNode,
  Ref,
} from "react";
import type { DreamscapeNode } from "../../../types/quest";
import { BOSS_DISPLAY, ROUND_FRAME_URL } from "./atlas-display";
import { type Glyph } from "../../primitives/glyph";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { Pressable } from "../../primitives/Pressable";
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
  /**
   * Whether the player can still reach this node from where they now stand.
   * Only an explicit `false` fades the node (drawing it as a dimmed, unrevealed
   * frame — its builder already blanks the icon and badges); omitting the field
   * renders the node normally, which suits the design-system demos that show a
   * lone node in isolation.
   */
  isReachable?: boolean;
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
  /** Draws the node in its revealed/hover glow + scale-up state. */
  hovered: boolean;
  /**
   * Ref to the node's root element, so a caller can anchor an input-adaptive
   * press-reveal (InfoCard) to it and measure it against the stage. Typed as the
   * common `HTMLElement` because an available node renders through `Pressable` as
   * a `<button>` while an unreachable one is a plain `<div>` — the caller only
   * measures the element, so it needs neither concrete tag type.
   */
  rootRef?: Ref<HTMLElement>;
  /**
   * Mouse/focus reveal driver: fired with the node id when the pointer or
   * keyboard focus enters the node. Optional — a caller driving the reveal
   * through the pointer handlers below omits it.
   */
  onEnter?: (nodeId: string) => void;
  /** Paired with {@link onEnter}: fired on mouse leave / blur. */
  onLeave?: () => void;
  /** Activation: fired with the node id on click and on Enter / Space. */
  onClick?: (nodeId: string) => void;
  /**
   * Input-adaptive press-reveal handlers, wired to the node's root so the
   * InfoCard engine (`usePressReveal`) can reveal on touch press-down and on
   * fine-pointer hover. A caller either wires these OR the {@link onEnter} /
   * {@link onLeave} mouse pair, never both.
   */
  onPointerEnter?: PointerEventHandler<HTMLElement>;
  onPointerDown?: PointerEventHandler<HTMLElement>;
  onPointerUp?: PointerEventHandler<HTMLElement>;
  onPointerLeave?: PointerEventHandler<HTMLElement>;
  onPointerCancel?: PointerEventHandler<HTMLElement>;
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
  rootRef,
  onEnter,
  onLeave,
  onClick,
  onPointerEnter,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
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
    (view.isReachable === false ? " node-unreachable" : "") +
    (hovered ? " is-hover" : "") +
    (isBoss ? " node-boss" : "") +
    (isStarter ? " node-start" : "");

  const ariaLabel =
    `${node.biomeName === "" ? (isBoss ? BOSS_DISPLAY.place : "Unrevealed dreamscape") : node.biomeName} - ${node.state}` +
    (isStarter ? " - starting dreamscape" : "") +
    (isBoss ? " - final boss" : "") +
    (view.knownDreamsignRef !== null ? " - known dreamsign here" : "");

  const nodeStyle = {
    left: view.left,
    top: view.top,
    width: view.size,
    height: view.size,
    // Centre the node on its stage-space `left` / `top` via negative margins
    // rather than `transform: translate(-50%,-50%)`. The available node renders
    // through `Pressable`, which owns the element `transform` (its press / hover
    // scale); keeping the centering off `transform` lets that scale compose
    // cleanly. Mirrors the SiteNode centering idiom.
    marginLeft: -view.size / 2,
    marginTop: -view.size / 2,
    // A press-hold to read a node must not be hijacked by the browser as a
    // scroll / pan gesture, which would cancel the pointer and drop the
    // reveal.
    touchAction: "none",
    WebkitTapHighlightColor: "transparent",
    // Drives the badge sizing in atlas.css — every badge is a fraction of
    // this so they scale together with the node's diameter.
    "--atlas-node-size": `${String(view.size)}px`,
    // Per-profile badge enlargement (the mobile atlas bumps this up).
    "--atlas-badge-scale": String(view.badgeScale ?? 1),
  } as CSSProperties;

  // Reveal drivers (mouse / focus) shared by both the interactive and the
  // non-interactive node — an unreachable node still reveals its InfoCard on
  // hover / press; it just can't be activated.
  const revealHandlers = {
    onMouseEnter: () => {
      onEnter?.(node.id);
    },
    onMouseLeave: () => {
      onLeave?.();
    },
    onFocus: () => {
      onEnter?.(node.id);
    },
    onBlur: () => {
      onLeave?.();
    },
    onPointerEnter,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    onPointerCancel,
  };

  const dataAttrs = {
    "data-node-state": node.state,
    "data-node-boss": isBoss ? "true" : undefined,
    "data-node-starting": isStarter ? "true" : undefined,
    "data-node-known-dreamsign":
      view.knownDreamsignRef !== null ? "true" : undefined,
  };

  const inner = (
    <>
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
    </>
  );

  // An available node is the ONE interactive surface here, so it routes through
  // `Pressable` as a native `<button>` — that supplies the button role, tab
  // focus, and Enter / Space activation for free (plus the shared press / hover
  // scale), replacing the former hand-rolled `role="button"` + `tabIndex` +
  // `onKeyDown` on a raw `<div>`. A non-available node stays a plain,
  // non-interactive `<div role="img">` with no activation handler.
  if (isAvailable) {
    return (
      <Pressable
        as="button"
        ref={rootRef}
        className={className}
        style={nodeStyle}
        aria-label={ariaLabel}
        {...dataAttrs}
        {...revealHandlers}
        onClick={() => {
          onClick?.(node.id);
        }}
      >
        {inner}
      </Pressable>
    );
  }

  return (
    <div
      // The prop is `Ref<HTMLElement>` (the interactive branch's <button> and
      // this <div> share only that base); a <div>'s ref slot wants the concrete
      // `HTMLDivElement`. The caller only measures the node, so narrowing the
      // element type here is sound.
      ref={rootRef as Ref<HTMLDivElement>}
      className={className}
      style={nodeStyle}
      role="img"
      aria-label={ariaLabel}
      {...dataAttrs}
      {...revealHandlers}
    >
      {inner}
    </div>
  );
}
