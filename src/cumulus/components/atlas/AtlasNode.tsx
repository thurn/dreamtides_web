import * as React from "react";
import type { CSSProperties } from "react";
import type { DreamscapeNode } from "../../../types/journey";
import { richText } from "../card/rich-text";
import type { RevealInfoCardModel, RevealSpec } from "../../internal/reveal/model";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { type ArtRef, resolveArtRef } from "../../primitives/art";
import { type Glyph } from "../../primitives/glyph";
import { Pressable } from "../../primitives/Pressable";
import { atlasPrimaryInfoCard } from "./AtlasHoverCard";
import { BOSS_DISPLAY, ROUND_FRAME_URL } from "./atlas-display";
import "./atlas.css";

// The frame is a cross-origin CSS mask in production. Keep its cache key
// versioned so response-header or source-art changes can take effect immediately.
const ROUND_FRAME_MASK_URL = `${ROUND_FRAME_URL}?v=1`;

/** Atlas-primary display data. The component selects the strict InfoCard variant. */
export interface AtlasNodePrimary {
  sceneArt: ArtRef | null;
  figureArt: ArtRef | null;
  placeName: string | null;
  guideName: string | null;
  title: string;
  body: string;
}

/** A UUID-backed known Dreamsign related to an Atlas node. */
export interface AtlasNodeDreamsign {
  id: string;
  name: string;
  art: ArtRef | null;
  rulesText: string;
}

/** A UUID-backed signature site related to an Atlas node. */
export interface AtlasNodeSite {
  id: string;
  name: string;
  blurb: string;
  icon: Glyph;
}

/** A UUID-backed affiliation related to an Atlas node. */
export interface AtlasNodeAffiliation {
  id: string;
  name: string;
  cardTheme: string;
}

/**
 * Strict semantic model for one Dream Atlas node. It contains placed face data
 * plus the Atlas primary and related domain entities; AtlasNode decides their
 * InfoCard variants and descending Dreamsign → site → affiliation priority.
 */
export interface AtlasNodeModel {
  node: DreamscapeNode;
  /** Stage-space centre in the fixed Atlas design canvas. */
  left: number;
  top: number;
  /** Rendered node diameter in stage pixels. */
  size: number;
  isStarter: boolean;
  isBoss: boolean;
  isReachable?: boolean;
  iconRef: ArtRef | null;
  siteBadgeGlyph: Glyph | null;
  knownDreamsignRef: ArtRef | null;
  badgeScale?: number;
  primary: AtlasNodePrimary;
  dreamsign: AtlasNodeDreamsign | null;
  site: AtlasNodeSite | null;
  affiliation: AtlasNodeAffiliation | null;
}

function dreamsignCard(dreamsign: AtlasNodeDreamsign): RevealInfoCardModel {
  return dreamsign.art === null
    ? { variant: "text", title: dreamsign.name, body: richText.rules(dreamsign.rulesText) }
    : {
        variant: "object",
        image: dreamsign.art,
        imageFilter: "dreamsign-portrait",
        title: dreamsign.name,
        body: richText.rules(dreamsign.rulesText),
      };
}

/** Derives the private reveal protocol from Atlas semantics. */
function atlasNodeRevealSpec(model: AtlasNodeModel): RevealSpec {
  const secondaries: RevealInfoCardModel[] = [];
  if (model.dreamsign !== null) secondaries.push(dreamsignCard(model.dreamsign));
  if (model.site !== null) {
    secondaries.push({
      variant: "icon",
      glyph: model.site.icon,
      title: model.site.name,
      body: richText.plain(model.site.blurb),
    });
  }
  if (model.affiliation !== null) {
    secondaries.push({
      variant: "text",
      title: `Affiliation: ${model.affiliation.name}`,
      body: richText.plain(`${model.affiliation.cardTheme} cards are more likely here.`),
    });
  }
  return {
    primary: { kind: "infoCard", card: atlasPrimaryInfoCard(model.primary) },
    secondaries,
  };
}

export interface AtlasNodeProps {
  /** Placed face plus UUID-backed semantic Atlas reveal data. */
  model: AtlasNodeModel;
  /** Enter the node's dreamscape. Available nodes invoke this with their UUID. */
  onActivate: (nodeId: string) => void;
}

/** One self-revealing, focusable Dream Atlas node. */
export function AtlasNode({ model, onActivate }: AtlasNodeProps): React.ReactElement {
  const { node, isStarter, isBoss } = model;
  const isAvailable = node.state === "available";
  const binding = useRevealSource({
    identity: {
      entityType: "atlas-node",
      entityId: revealEntityId("atlas-node", node.id),
    },
    spec: atlasNodeRevealSpec(model),
    onActivate: isAvailable ? () => onActivate(node.id) : undefined,
  });
  const suppressCompatibilityClick = React.useRef(false);
  const pointerDown = binding.sourceProps.onPointerDown;
  const active = binding.sourceProps["data-reveal-active"] === "true";
  const isCompleted = node.state === "completed";

  const face = isBoss ? (
    <img className="frame-img" src={BOSS_DISPLAY.iconUrl} alt={BOSS_DISPLAY.place} draggable={false} />
  ) : model.iconRef !== null ? (
    <img className="frame-img" src={resolveArtRef(model.iconRef)} alt={node.biomeName} draggable={false} />
  ) : (
    <div className="unrevealed-face">
      <img className="frame-img" src={ROUND_FRAME_URL} alt="" draggable={false} />
    </div>
  );

  const className =
    `node node-${node.state}` +
    (model.isReachable === false ? " node-unreachable" : "") +
    (isBoss ? " node-boss" : "") +
    (isStarter ? " node-start" : "");
  const ariaLabel =
    `${node.biomeName === "" ? (isBoss ? BOSS_DISPLAY.place : "Unrevealed dreamscape") : node.biomeName} - ${node.state}` +
    (isStarter ? " - starting dreamscape" : "") +
    (isBoss ? " - final boss" : "") +
    (model.knownDreamsignRef !== null ? " - known dreamsign here" : "");
  const nodeStyle = {
    left: model.left,
    top: model.top,
    width: model.size,
    height: model.size,
    marginLeft: -model.size / 2,
    marginTop: -model.size / 2,
    touchAction: "pan-x pan-y",
    WebkitTapHighlightColor: "transparent",
    cursor: isAvailable ? "pointer" : "default",
    "--atlas-node-size": `${String(model.size)}px`,
    "--atlas-badge-scale": String(model.badgeScale ?? 1),
    ...binding.sourceProps.style,
  } as CSSProperties;
  const selectableHighlightStyle = {
    maskImage: `url("${ROUND_FRAME_MASK_URL}")`,
    WebkitMaskImage: `url("${ROUND_FRAME_MASK_URL}")`,
  } as CSSProperties;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      pressFeedback={isAvailable ? "scale" : "stationary"}
      className={className}
      style={nodeStyle}
      aria-label={ariaLabel}
      aria-disabled={!isAvailable}
      data-atlas-node-id={node.id}
      data-node-state={node.state}
      data-node-boss={isBoss ? "true" : undefined}
      data-node-starting={isStarter ? "true" : undefined}
      data-node-known-dreamsign={model.knownDreamsignRef !== null ? "true" : undefined}
      onPointerDown={(event) => {
        suppressCompatibilityClick.current = event.pointerType === "touch";
        pointerDown?.(event);
      }}
      onClick={(event) => {
        if (!isAvailable) return;
        if (event.detail === 0) {
          suppressCompatibilityClick.current = false;
          onActivate(node.id);
          return;
        }
        if (suppressCompatibilityClick.current) {
          suppressCompatibilityClick.current = false;
          return;
        }
        onActivate(node.id);
      }}
    >
      {isAvailable && (
        <div
          className="node-selectable-highlight"
          data-ambient-paused={active ? "true" : "false"}
          aria-hidden="true"
        >
          <div
            className="node-selectable-highlight-layer node-selectable-highlight-pulse"
            style={selectableHighlightStyle}
          />
          <div
            className="node-selectable-highlight-layer node-selectable-highlight-base"
            style={selectableHighlightStyle}
          />
        </div>
      )}
      <div className="node-glow" data-ambient-paused={active ? "true" : "false"} />
      <div className="node-art">{face}</div>

      {(isCompleted || model.siteBadgeGlyph !== null) && (
        <div className="site-badges">
          <div className="site-badge">
            <i
              className={`${isCompleted ? "fa-solid fa-check" : (model.siteBadgeGlyph ?? "")} site-badge-glyph`}
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

      {model.knownDreamsignRef !== null && (
        <div className="known-badge" title="Known dreamsign">
          <img src={resolveArtRef(model.knownDreamsignRef)} alt="" draggable={false} />
        </div>
      )}
    </Pressable>
  );
}
