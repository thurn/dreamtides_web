// SiteNode — the dreamscape site disc. A floating circular node over a
// dreamscape's scene art: a dark radial disc with a white glyph and a soft accent
// ring. Scene nodes use the compact map presentation; reward previews use a
// larger presentation of the same component. The disc shows one of three states: a plain site, the guardian battle
// (a pulsing ring), and a locked guardian (a desaturated disc with a padlock
// badge). The disc carries no text label —
// pressing / hovering it reveals the site name + detail through the coordinator
// as InfoCard's `icon` variant, whose disc is styled to read identically to
// the node it rose from.
//
// The reveal is INPUT-ADAPTIVE (the Cumulus generalization of the touch-first
// design source): on a fine pointer (mouse / desktop) HOVER reveals and a click
// enters the site; on a coarse pointer (touch) press-down reveals, and a quick
// tap enters while a deliberate hold-to-read is just a read. It routes through
// the shared reveal coordinator, so timing,
// placement, and the on-screen clamp match every other Cumulus reveal.
//
// The component owns the node treatment, presentation size, placed-site semantics, activation, and
// reveal registration; the coordinator owns viewport measurement and placement.

import * as React from "react";
import type { CSSProperties } from "react";
import { richText, type RichText } from "../card/rich-text";
import { type ScatterPoint } from "./dreamscape-scatter";
import type { SiteState } from "../../../types/journey";
import { type Glyph, GLYPHS } from "../../primitives/glyph";
import { type CumulusColor, withAlpha } from "../../primitives/color";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import "./site-node.css";

/** Compact diameter for site nodes placed over a dreamscape scene. */
const SCENE_NODE_SIZE = 60;

/** Larger diameter for a SiteNode presented as the primary reward object. */
const REWARD_NODE_SIZE = 160;

/** The node's fixed accent — the system's violet, not a per-node color. The ring
 * and reveal disc derive their alpha from it via {@link withAlpha}. */
const NODE_ACCENT: CumulusColor = "accent";

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

/** The status note (the lock note) shown under the blurb in the reveal. */
function siteRevealNote(model: DreamscapeSiteModel): string | null {
  if (model.isLocked) {
    return "You must visit the other sites in this dreamscape first.";
  }
  return null;
}

/** The InfoCard body for a site reveal: the mechanic blurb plus, when locked, a
 * muted lock note under it. */
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
  /** Scene placement or a large reward preview. Defaults to `scene`. */
  presentation?: "scene" | "reward";
  /** Enter the site; fired on a tap / click of an interactive node only. */
  onSelect: (siteId: string) => void;
}

/**
 * A single floating site node whose semantic reveal uses InfoCard's
 * `icon` variant. The node positions itself from `model.pos` inside the stage.
 */
export function SiteNode({
  model,
  motion,
  presentation = "scene",
  onSelect,
}: SiteNodeProps): React.ReactElement {
  const { site, pos, index, isBattle, isLocked, isInteractive } = model;

  const binding = useRevealSource({
    identity: { entityType: "site", entityId: revealEntityId("site", site.id) },
    spec: {
      primary: { kind: "infoCard", card: { variant: "icon", glyph: model.icon, title: model.label, body: siteRevealBody(model) } },
      secondaries: [],
    },
    onActivate: isInteractive ? () => onSelect(site.id) : undefined,
  });
  const lastPointerType = React.useRef<string | null>(null);
  const pointerDown = binding.sourceProps.onPointerDown;

  const diameter = presentation === "reward"
    ? REWARD_NODE_SIZE
    : SCENE_NODE_SIZE;
  // A locked guardian stays at full opacity but its disc is desaturated to a
  // clear, readable "disabled" grey. The dimming lands on the disc alone so the
  // lock badge stays crisp and legible.
  const lockedFilter = isLocked ? "grayscale(1) brightness(0.62)" : undefined;

  // Ring + border derive from the node's fixed accent via color-mix alpha. The
  // bright ring shows while the reveal is up (hover on a fine pointer, press on
  // touch).
  const ring = binding.sourceProps["data-reveal-active"] === "true"
    ? `0 0 0 2px ${withAlpha(NODE_ACCENT, 0.9)}, 0 0 30px ${withAlpha(NODE_ACCENT, 0.55)}, 0 14px 26px rgba(0,0,0,.55)`
    : `0 0 0 1px ${withAlpha(NODE_ACCENT, 0.35)}, 0 0 18px ${withAlpha(NODE_ACCENT, 0.26)}, 0 8px 18px rgba(0,0,0,.5)`;

  const nodeStyle: CSSProperties = {
    left: `${String(pos.x)}%`,
    top: `${String(pos.y)}%`,
    width: diameter,
    height: diameter,
    marginLeft: -diameter / 2,
    marginTop: -diameter / 2,
    animationDelay: `${String(index * -1.37)}s`,
    zIndex: binding.sourceProps["data-reveal-active"] === "true" ? 40 : 10,
    ...binding.sourceProps.style,
    touchAction: "pan-x pan-y",
    WebkitTapHighlightColor: "transparent",
  };

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      className={"ds-node" + (motion ? " floaty" : "")}
      style={nodeStyle}
      onPointerDown={(event) => { lastPointerType.current = event.pointerType; pointerDown?.(event); }}
      onClick={() => { if (isInteractive && lastPointerType.current !== "touch") onSelect(site.id); }}
      onKeyDown={(event) => {
        if (isInteractive && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault(); onSelect(site.id);
        }
      }}
      aria-label={model.label}
      aria-disabled={!isInteractive}
      data-site-id={site.id}
      data-site-type={site.type}
      data-site-node-presentation={presentation}
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
      {isBattle && !isLocked && (
        <span className="ds-battle-pulse" aria-hidden="true" />
      )}
      {isLocked && (
        <span className="ds-node-badge locked" aria-hidden="true">
          <i className={GLYPHS.lockFilled} />
        </span>
      )}
    </Pressable>
  );
}
