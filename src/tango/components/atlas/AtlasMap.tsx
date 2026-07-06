// AtlasMap — the Dream Atlas map surface: the run graph of nodes and edges
// fitted into a fixed design stage that scales to fit its container
// (letterboxed). It owns the `.dream-atlas` scope the node / edge / preview
// CSS is written under, the uniform scale-to-fit, and the hover state that
// reveals a node's detail card. Callers (the atlas screen) compose it with the
// atmosphere and HUD around it and hand it the placed view models.
//
// A component, not a screen: the `.dream-atlas` scope and the `.node` / `.edge`
// class names the child components emit are class-based styling, which belongs
// in a component. The map runs vertically — the placed models decide the
// layout; this surface only scales and reveals.

import { useEffect, useState } from "react";
import { AtlasNode, type AtlasNodeView } from "./AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "./AtlasEdge";
import {
  AtlasPreview,
  AtlasDreamsignCard,
  type AtlasPreviewModel,
  type AtlasDreamsignModel,
} from "./AtlasPreview";
import "./atlas.css";

/** One placed node: its face view plus the resolved hover cards. */
export interface AtlasMapNode {
  /** Presentational data for the {@link AtlasNode} face. */
  view: AtlasNodeView;
  /** The floating detail card shown while this node is hovered. */
  preview: AtlasPreviewModel;
  /** The companion known-dreamsign card, or null when the node carries none. */
  dreamsign: AtlasDreamsignModel | null;
}

/** One connector between two nodes, in stage coordinates. */
export interface AtlasMapEdge {
  key: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: AtlasEdgeKind;
}

interface AtlasMapProps {
  /** The fixed design canvas the stage scales to fit (letterboxed). */
  stageWidth: number;
  stageHeight: number;
  /** Placed nodes, laid out by the view model (starter at bottom, boss at top). */
  nodes: AtlasMapNode[];
  /** Forward connectors between nodes. */
  edges: AtlasMapEdge[];
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: string) => void;
}

/**
 * The scaled Dream Atlas stage: draws the edges beneath the nodes, reveals the
 * hovered node's {@link AtlasPreview}, and uniformly scales the fixed design
 * canvas to fit the viewport.
 */
export function AtlasMap({
  stageWidth,
  stageHeight,
  nodes,
  edges,
  onEnterNode,
}: AtlasMapProps) {
  const [hover, setHover] = useState<string | null>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      setScale(
        Math.min(window.innerWidth / stageWidth, window.innerHeight / stageHeight),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, [stageWidth, stageHeight]);

  const hovered = hover !== null
    ? (nodes.find((item) => item.view.node.id === hover) ?? null)
    : null;

  return (
    <div className="dream-atlas" style={{ position: "absolute", inset: 0, zIndex: 2 }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: stageWidth,
          height: stageHeight,
          transformOrigin: "center center",
          transform: `translate(-50%, -50%) scale(${String(scale)})`,
        }}
      >
        <svg
          className="edges"
          viewBox={`0 0 ${String(stageWidth)} ${String(stageHeight)}`}
          width={stageWidth}
          height={stageHeight}
        >
          {edges.map((edge) => (
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

        <div className="nodes">
          {nodes.map((item) => (
            <AtlasNode
              key={item.view.node.id}
              view={item.view}
              hovered={hover === item.view.node.id}
              onEnter={setHover}
              onLeave={() => {
                setHover(null);
              }}
              onClick={onEnterNode}
            />
          ))}
        </div>

        {hovered && (
          <AtlasPreview
            model={hovered.preview}
            hasDreamsign={hovered.dreamsign !== null}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
          />
        )}
        {hovered?.dreamsign != null && (
          <AtlasDreamsignCard
            model={hovered.dreamsign}
            previewIsMini={hovered.preview.isUnrevealed}
            stageWidth={stageWidth}
            stageHeight={stageHeight}
          />
        )}
      </div>
    </div>
  );
}
