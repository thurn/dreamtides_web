// AtlasScreen — the Cumulus rendering of the Dream Atlas, the between-dreamscapes
// map where the player chooses which dreamscape to enter next on the way to the
// final dream. The map orientation is decided by the view-model per viewport:
// mobile runs it VERTICALLY, reading bottom-up (the First Light Meadow starter at
// the bottom, each layer climbing toward the Apollyon boss battle at the top);
// desktop runs it left-to-right (the starter at the left, advancing to the boss
// at the right). Persistent inventory and the utility menu (deck viewer,
// glossary, atlas regenerate, ...) live in the app-shell chrome —
// the top-left hamburger on mobile, the top-right gear on desktop — so this
// screen renders no title, layer numerals, or debug chrome of its own.
//
// PURE: it renders from a view-model and reports the chosen node through
// `onEnterNode`; the adapter owns state, navigation, and logging. The screen
// owns and exports its view types. The screen owns the scaled run-graph
// composition and preflight; AtlasNode and AtlasEdge remain the reusable game
// objects that own their presentation and interaction contracts.

import { useEffect, useMemo } from "react";
import { AtlasEdge, type AtlasEdgeKind } from "../components/atlas/AtlasEdge";
import { AtlasNode, type AtlasNodeModel } from "../components/atlas/AtlasNode";
import { Motes } from "../components/hud/Motes";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import { glassSurfaceStyle } from "../internal/glass-surface";
import { token } from "../primitives/tokens";
import { useScaleToFit } from "../primitives/use-scale-to-fit";
import { atlasPreflightImageUrls } from "./atlas-preflight";
import type { TutorialSpeechBubbleView } from "./tutorial-speech-bubble-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";
import type { AtlasNodeId } from "../../types/identifiers";

/** One connector between two nodes, in stage coordinates. */
export interface AtlasEdgeView {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: AtlasEdgeKind;
}

/** Screen-owned stage placement for one semantic Atlas node. */
export interface AtlasNodePlacementView {
  model: AtlasNodeModel;
  /** Stage-space centre in the fixed Atlas design canvas. */
  left: number;
  top: number;
  /** Square node box in stage pixels. */
  boxSize: number;
}

/** Everything the atlas screen renders, mapped from live journey state. */
export interface AtlasView {
  /** The design canvas the stage scales to fit (letterboxed): portrait on
   * mobile, landscape on desktop. */
  stageWidth: number;
  stageHeight: number;
  /** Placed nodes, running starter → boss along the map's layer axis. */
  nodes: AtlasNodePlacementView[];
  /** Forward connectors between nodes. */
  edges: AtlasEdgeView[];
  /** Mira's delayed tutorial-only explanation of the Atlas. */
  guideDialogue?: TutorialSpeechBubbleView;
}

export interface AtlasScreenProps {
  /** The view-model to render. */
  view: AtlasView;
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: AtlasNodeId) => void;
  /** Report when delayed tutorial guidance becomes visible. */
  onGuideDialogueShown?: () => void;
}

/**
 * The Cumulus Dream Atlas. Pure and props-driven: a scaled graph of
 * {@link AtlasNode} and {@link AtlasEdge} objects with drifting {@link Motes}.
 */
export function AtlasScreen({
  view,
  onEnterNode,
  onGuideDialogueShown,
}: AtlasScreenProps) {
  const guideDialogueVisible = useDelayedTutorialSpeechBubbleVisibility(
    view.guideDialogue?.id,
    view.guideDialogue === undefined
      ? undefined
      : (view.guideDialogue.delaySeconds ?? 0),
  );
  const scale = useScaleToFit(view.stageWidth, view.stageHeight);

  useEffect(() => {
    if (guideDialogueVisible) onGuideDialogueShown?.();
  }, [guideDialogueVisible, onGuideDialogueShown]);

  return (
    <div
      className="cumulus"
      data-cumulus-atlas=""
      style={{
        position: "fixed",
        inset: 0,
        overflow: "hidden",
        background: token("--atlas-map-background"),
      }}
    >
      <Motes on tint="violet" zIndex={1} />

      <AtlasPreflight nodes={view.nodes} />
      <div data-atlas-map-layer="" style={mapLayerStyle}>
        <div
          data-atlas-stage=""
          style={{
            ...stageStyle,
            width: view.stageWidth,
            height: view.stageHeight,
            transform: `translate(-50%, -50%) scale(${String(scale)})`,
          }}
        >
          <svg
            data-atlas-edge-layer=""
            style={edgeLayerStyle}
            viewBox={`0 0 ${String(view.stageWidth)} ${String(view.stageHeight)}`}
            width={view.stageWidth}
            height={view.stageHeight}
          >
            {view.edges.map((edge) => (
              <AtlasEdge
                key={edge.key}
                kind={edge.kind}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
              />
            ))}
          </svg>

          <div data-atlas-node-layer="" style={nodeLayerStyle}>
            {view.nodes.map(({ model, left, top, boxSize }) => (
              <div
                key={model.id}
                data-atlas-node-placement={model.id}
                style={{
                  position: "absolute",
                  left,
                  top,
                  width: boxSize,
                  height: boxSize,
                  transform: "translate(-50%, -50%)",
                }}
              >
                <AtlasNode model={model} onPress={onEnterNode} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {view.guideDialogue !== undefined && (
        <div
          data-atlas-guide-dialogue-placement=""
          style={{
            position: "absolute",
            zIndex: 30,
            top: `calc(${token("--safe-top")} + ${token("--space-s")})`,
            left: "50%",
            width: `${String(view.guideDialogue.bubbleWidth)}px`,
            maxWidth: `calc(100vw - 2 * ${token("--gutter")})`,
            transform: `translate(calc(-50% + ${String(view.guideDialogue.horizontalOffset)}px), ${String(view.guideDialogue.verticalOffset)}px)`,
            pointerEvents: "none",
          }}
        >
          <CharacterDialogue
            dialogue={view.guideDialogue.model}
            visible={guideDialogueVisible}
            size="wide"
            testId="atlas-tutorial-dialogue"
          />
        </div>
      )}
    </div>
  );
}

function usePreloadImages(urls: string[]): void {
  useEffect(() => {
    if (typeof document === "undefined" || typeof Image === "undefined") {
      return;
    }

    const links: HTMLLinkElement[] = [];
    const images: HTMLImageElement[] = [];

    for (const url of urls) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = url;
      document.head.append(link);
      links.push(link);

      const image = new Image();
      image.decoding = "async";
      image.src = url;
      images.push(image);
      void image.decode?.().catch(() => undefined);
    }

    return () => {
      for (const link of links) link.remove();
      for (const image of images) image.src = "";
    };
  }, [urls]);
}

function AtlasPreflight({ nodes }: { nodes: AtlasNodePlacementView[] }) {
  const urls = useMemo(
    () => atlasPreflightImageUrls(nodes.map(({ model }) => model)),
    [nodes],
  );
  usePreloadImages(urls);

  return (
    <div aria-hidden="true" data-atlas-preflight="" style={preflightStyle}>
      <div style={glassWarmupStyle} />
      {urls.map((url) => (
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          loading="eager"
          decoding="async"
          style={preloadImageStyle}
        />
      ))}
    </div>
  );
}

const mapLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
};

const stageStyle: React.CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transformOrigin: "center center",
};

const edgeLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 2,
  pointerEvents: "none",
};

const nodeLayerStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 3,
};

const preflightStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 0,
  pointerEvents: "none",
  userSelect: "none",
  overflow: "hidden",
};

const glassWarmupStyle: React.CSSProperties = {
  ...glassSurfaceStyle(),
  position: "absolute",
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0.001,
  transform: "translateZ(0)",
  willChange: "backdrop-filter, -webkit-backdrop-filter",
};

const preloadImageStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  top: 0,
  width: 1,
  height: 1,
  opacity: 0.001,
  objectFit: "cover",
};
