// AtlasMap — the Dream Atlas map surface: the run graph of nodes and edges
// fitted into a fixed design stage that scales to fit its container
// (letterboxed). It owns the `.dream-atlas` scope the node / edge CSS is written
// under and the uniform scale-to-fit. Each node reveals its detail through the
// shared InfoCard press engine (see {@link AtlasNodeReveal}) — hover on desktop,
// press-down on touch. Callers (the atlas screen) compose it with the atmosphere
// and HUD around it and hand it the placed view models plus the stage root the
// reveals anchor against.
//
// A component, not a screen: the `.dream-atlas` scope and the `.node` / `.edge`
// class names the child components emit are class-based styling, which belongs
// in a component. The placed models decide the layout — vertical on mobile,
// left-to-right on desktop; this surface only scales the design stage to fit and
// reveals each node.

import { useEffect, useState } from "react";
import { type AtlasNodeView } from "./AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "./AtlasEdge";
import {
  AtlasNodeReveal,
  type AtlasNodeCard,
} from "./AtlasNodeReveal";
import { type AtlasHoverTweaks } from "./AtlasHoverCard";
import "./atlas.css";

/** One placed node: its face view plus the resolved InfoCard reveal content. */
export interface AtlasMapNode {
  /** Presentational data for the {@link AtlasNode} face. */
  view: AtlasNodeView;
  /** The InfoCard reveal content shown while this node is pressed / hovered. */
  card: AtlasNodeCard;
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
  /** Placed nodes, laid out by the view model along its layer axis (starter to boss). */
  nodes: AtlasMapNode[];
  /** Forward connectors between nodes. */
  edges: AtlasMapEdge[];
  /** Enter a node's dreamscape; fired on a tap / click of an available node. */
  onEnterNode: (nodeId: string) => void;
  /** Screen root the node reveals anchor + clamp against (viewport coordinates). */
  stageRef: React.RefObject<HTMLElement | null>;
  /** Live geometry / hierarchy for the large desktop hover card (dev tweaks). */
  hoverTweaks?: AtlasHoverTweaks;
}

/**
 * The scaled Dream Atlas stage: draws the edges beneath the nodes, reveals each
 * node's detail InfoCard on press / hover, and uniformly scales the fixed design
 * canvas to fit the viewport.
 */
export function AtlasMap({
  stageWidth,
  stageHeight,
  nodes,
  edges,
  onEnterNode,
  stageRef,
  hoverTweaks,
}: AtlasMapProps) {
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

  return (
    <div
      className="dream-atlas"
      style={{ position: "absolute", inset: 0, zIndex: 2 }}
    >
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
            <AtlasNodeReveal
              key={item.view.node.id}
              item={item}
              stageRef={stageRef}
              onEnterNode={onEnterNode}
              hoverTweaks={hoverTweaks}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
