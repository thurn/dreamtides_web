// AtlasMap — the Dream Atlas map surface: the run graph of nodes and edges
// fitted into a fixed design stage that scales to fit its container
// (letterboxed). It owns the `.dream-atlas` scope the node / edge CSS is written
// under and the uniform scale-to-fit. Each node reveals its detail through the
// shared reveal coordinator through AtlasNode — hover on desktop,
// press-down on touch. Callers (the atlas screen) compose it with the atmosphere
// and HUD around it and hand it the placed view models plus the stage root the
// reveals anchor against.
//
// A component, not a screen: the `.dream-atlas` scope and the `.node` / `.edge`
// class names the child components emit are class-based styling, which belongs
// in a component. The placed models decide the layout — vertical on mobile,
// left-to-right on desktop; this surface only scales the design stage to fit and
// reveals each node.

import { useEffect, useMemo } from "react";
import { useScaleToFit } from "../../primitives/use-scale-to-fit";
import { AtlasNode, type AtlasNodeModel } from "./AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "./AtlasEdge";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import { atlasPreflightImageUrls } from "./atlas-preflight";
import "./atlas.css";

/** One placed node: its face view plus the resolved InfoCard reveal content. */
export type AtlasMapNode = AtlasNodeModel;

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
      for (const link of links) {
        link.remove();
      }
      for (const image of images) {
        image.src = "";
      }
    };
  }, [urls]);
}

function AtlasPreflight({ nodes }: { nodes: AtlasMapNode[] }) {
  const urls = useMemo(() => atlasPreflightImageUrls(nodes), [nodes]);
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
}: AtlasMapProps) {
  const scale = useScaleToFit(stageWidth, stageHeight);

  return (
    <div
      className="dream-atlas"
      style={{ position: "absolute", inset: 0, zIndex: 2 }}
    >
      <AtlasPreflight nodes={nodes} />
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
          {nodes.map((model) => (
            <AtlasNode
              key={model.node.id}
              model={model}
              onPress={onEnterNode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
