import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useQuest } from "../state/quest-context";
import { AtlasNode } from "../components/AtlasNode";
import {
  generateInitialAtlas,
  type SiteGenerationContext,
} from "../atlas/atlas-generator";
import { logEvent } from "../logging";

const DRAG_THRESHOLD = 5;

/** The Dream Atlas screen: a pannable radial graph of dreamscape nodes. */
export function AtlasScreen() {
  const { state, mutations, questContent } = useQuest();
  const { atlas } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPointerDown, setIsPointerDown] = useState(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const didDrag = useRef(false);

  const viewportOffset = useMemo(() => {
    const nodeList = Object.values(atlas.nodes);
    if (nodeList.length === 0) return { x: 0, y: 0 };

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const node of nodeList) {
      minX = Math.min(minX, node.position.x);
      maxX = Math.max(maxX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxY = Math.max(maxY, node.position.y);
    }

    return { x: -(minX + maxX) / 2, y: -(minY + maxY) / 2 };
  }, [atlas.nodes]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsPointerDown(true);
      didDrag.current = false;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    },
    [pan],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      if (
        Math.abs(dx) > DRAG_THRESHOLD ||
        Math.abs(dy) > DRAG_THRESHOLD
      ) {
        didDrag.current = true;
      }
      setPan({
        x: dragStart.current.panX + dx,
        y: dragStart.current.panY + dy,
      });
    };

    const handleMouseUp = () => {
      setIsPointerDown(false);
      dragStart.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  /**
   * Debug-only: discard the persisted atlas and rebuild a fresh 7-layer atlas
   * with the current generation logic, so we can iterate on atlas generation and
   * see the result live without starting a new quest. Because every node ID is
   * reissued, the current dreamscape is reset to the freshly generated starter
   * so the rest of the quest state stays internally consistent.
   */
  const handleDebugRegenerate = useCallback(() => {
    const context: SiteGenerationContext = {
      ...(state.dreamscapeModifiers.length > 0
        ? { dreamscapeModifiers: state.dreamscapeModifiers }
        : {}),
    };
    const previousNodeCount = Object.keys(state.atlas.nodes).length;
    const regenerated = generateInitialAtlas(
      state.completionLevel,
      context,
      {
        dreamscapes: questContent.dreamscapes,
        atlasConfig: questContent.atlasConfig,
        dreamsignPoolIds: state.remainingDreamsignPool,
      },
      { logEvents: true },
    );

    logEvent("debug_atlas_regenerated", {
      source: "atlas_debug_refresh",
      completionLevel: state.completionLevel,
      dreamscapeModifierCount: state.dreamscapeModifiers.length,
      previousNodeCount,
      regeneratedNodeCount: Object.keys(regenerated.nodes).length,
      startingNodeId: regenerated.startingNodeId,
      bossNodeId: regenerated.bossNodeId,
    });

    mutations.updateAtlas(regenerated);
    mutations.setCurrentDreamscape(regenerated.startingNodeId);
  }, [
    state.deck,
    state.dreamsigns,
    state.dreamscapeModifiers,
    state.completionLevel,
    state.atlas.nodes,
    state.remainingDreamsignPool,
    questContent,
    mutations,
  ]);

  const handleNodeClick = useCallback(
    (nodeId: string) => {
      if (didDrag.current) return;
      const node = atlas.nodes[nodeId];
      if (!node || node.state !== "available") return;

      mutations.setCurrentDreamscape(nodeId);
      mutations.setScreen({ type: "dreamscape" });
    },
    [atlas.nodes, mutations],
  );

  const svgWidth = 1200;
  const svgHeight = 800;
  const transformX = svgWidth / 2 + viewportOffset.x + pan.x;
  const transformY = svgHeight / 2 + viewportOffset.y + pan.y;

  return (
    <motion.div
      className="flex h-full w-full flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-2 text-center">
        <h2
          className="text-2xl font-bold tracking-wide"
          style={{ color: "#a855f7" }}
        >
          Dream Atlas
        </h2>
        <p className="text-sm opacity-50">
          Click a glowing node to enter a dreamscape
        </p>
        <button
          type="button"
          onClick={handleDebugRegenerate}
          data-testid="atlas-debug-regenerate"
          className="mt-2 rounded border px-2 py-1 text-xs font-medium tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
          style={{
            background: "rgba(217, 119, 6, 0.12)",
            border: "1px solid rgba(217, 119, 6, 0.4)",
            color: "#fbbf24",
          }}
        >
          {"🔄 Debug: Regenerate Atlas"}
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative w-full flex-1 overflow-hidden"
        style={{
          cursor: isPointerDown ? "grabbing" : "grab",
          minHeight: "400px",
        }}
        onMouseDown={handleMouseDown}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${String(svgWidth)} ${String(svgHeight)}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <defs aria-hidden="true">
            <style aria-hidden="true">
              {
                "@keyframes dashFlow{to{stroke-dashoffset:-20}}.atlas-edge{stroke-dasharray:6 4;animation:dashFlow 1.5s linear infinite}"
              }
            </style>
          </defs>

          <g transform={`translate(${String(transformX)}, ${String(transformY)})`}>
            {Object.values(atlas.nodes).flatMap((fromNode) =>
              fromNode.forwardIds.map((toId) => {
                const toNode = atlas.nodes[toId];
                if (!toNode) return null;

                // An edge reads "active" only when both endpoints are visible to
                // the player (revealed in some form), so connections into still
                // unrevealed nodes stay faint.
                const isActive =
                  fromNode.state !== "unrevealed" &&
                  toNode.state !== "unrevealed";

                return (
                  <line
                    key={`edge-${fromNode.id}-${toId}`}
                    className="atlas-edge"
                    x1={fromNode.position.x}
                    y1={fromNode.position.y}
                    x2={toNode.position.x}
                    y2={toNode.position.y}
                    stroke={isActive ? "#a855f780" : "#4a386040"}
                    strokeWidth={isActive ? 2 : 1}
                  />
                );
              }),
            )}

            {Object.values(atlas.nodes).map((node) => (
              <AtlasNode
                key={node.id}
                node={node}
                isStarting={node.id === atlas.startingNodeId}
                onNodeClick={handleNodeClick}
              />
            ))}
          </g>
        </svg>
      </div>
    </motion.div>
  );
}
