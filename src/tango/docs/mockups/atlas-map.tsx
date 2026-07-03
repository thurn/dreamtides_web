// Full-screen mockup for the Dream Atlas — the shared scene behind both the
// `atlas-node` and `atlas-edge` component pages. It composes multiple AtlasNodes
// across their lifecycle states (completed / available / revealedLocked /
// unrevealed, plus the starter and boss) connected by AtlasEdges in all four
// treatments (traveled / open / dim / locked), over a dark scene wash. Node art
// resolves from real dreamscape ids via the atlas-display helpers, exactly as
// the live Atlas screen resolves it; the boss node presents Limbo.
//
// The scene lives in a fixed 1280×800 design canvas that is uniformly scaled to
// fit the viewport (letterboxed), so nodes and edges share one coordinate space
// and the whole map stays coherent at desktop and mobile. Node centres (left/top)
// and edge endpoints are authored in that canvas space.

import { useEffect, useState } from "react";
import type { DreamscapeNode } from "../../../types/quest";
import { AtlasNode, type AtlasNodeView } from "../../components/AtlasNode";
import { AtlasEdge, type AtlasEdgeKind } from "../../components/AtlasEdge";
import { AtlasEdgeDefs } from "../../components/AtlasEdgeDefs";
import { dreamscapeIconUrl, dreamsignIconUrl } from "../../components/atlas-display";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

const CANVAS_W = 1280;
const CANVAS_H = 800;

/** Boxicon class for a signature-site badge (static presentation, not game data). */
const SHOP_BADGE = "bxf bx-store-alt-2";
const DRAFT_BADGE = "bxf bx-copy";

/** Builds a DreamscapeNode in the given lifecycle state. */
function makeNode(
  id: string,
  state: DreamscapeNode["state"],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer: 0,
    indexInLayer: 0,
    dreamscapeId: id,
    biomeName: id,
    biomeColor: "#2d2040",
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
    ...overrides,
  };
}

interface NodeSpec {
  key: string;
  left: number;
  top: number;
  view: AtlasNodeView;
  hovered?: boolean;
}

/**
 * The atlas nodes, authored in 1280×800 canvas space. Real dreamscape ids drive
 * both the id and the resolved circular icon art. `left`/`top` are node centres.
 */
const NODE_SPECS: NodeSpec[] = [
  {
    key: "starter",
    left: 150,
    top: 400,
    view: {
      node: makeNode("firstlight_meadow", "completed", { biomeName: "Firstlight Meadow" }),
      left: 150,
      top: 400,
      size: 150,
      isStarter: true,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("firstlight_meadow"),
      siteBadgeIconClass: null,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "frostforge",
    left: 400,
    top: 250,
    view: {
      node: makeNode("frostforge", "completed", { biomeName: "Frostforge" }),
      left: 400,
      top: 250,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("frostforge"),
      siteBadgeIconClass: SHOP_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "tumbleleaf",
    left: 400,
    top: 560,
    view: {
      node: makeNode("tumbleleaf_village", "completed", { biomeName: "Tumbleleaf Village" }),
      left: 400,
      top: 560,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("tumbleleaf_village"),
      siteBadgeIconClass: DRAFT_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "hopes_end",
    left: 660,
    top: 190,
    view: {
      node: makeNode("hopes_end", "available", { biomeName: "Hope's End" }),
      left: 660,
      top: 190,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("hopes_end"),
      siteBadgeIconClass: SHOP_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "grid_city",
    left: 660,
    top: 420,
    hovered: true,
    view: {
      node: makeNode("grid_city", "available", { biomeName: "Grid City" }),
      left: 660,
      top: 420,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("grid_city"),
      siteBadgeIconClass: DRAFT_BADGE,
      knownDreamsignIconUrl: dreamsignIconUrl("acorn_gold.png"),
    },
  },
  {
    key: "wilderveil",
    left: 660,
    top: 650,
    view: {
      node: makeNode("wilderveil", "available", { biomeName: "Wilderveil" }),
      left: 660,
      top: 650,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("wilderveil"),
      siteBadgeIconClass: SHOP_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "unrevealed",
    left: 920,
    top: 150,
    view: {
      node: makeNode("u1", "unrevealed", { biomeName: "", dreamscapeId: null }),
      left: 920,
      top: 150,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: null,
      siteBadgeIconClass: null,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "pharaohs_gate",
    left: 920,
    top: 350,
    view: {
      node: makeNode("pharaohs_gate", "revealedLocked", { biomeName: "Pharaoh's Gate", layer: 3 }),
      left: 920,
      top: 350,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("pharaohs_gate"),
      siteBadgeIconClass: SHOP_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "rust_expanse",
    left: 920,
    top: 590,
    view: {
      node: makeNode("rust_expanse", "revealedLocked", { biomeName: "Rust Expanse", layer: 3 }),
      left: 920,
      top: 590,
      size: 132,
      isStarter: false,
      isBoss: false,
      iconUrl: dreamscapeIconUrl("rust_expanse"),
      siteBadgeIconClass: DRAFT_BADGE,
      knownDreamsignIconUrl: null,
    },
  },
  {
    key: "boss",
    left: 1150,
    top: 400,
    view: {
      node: makeNode("boss", "revealedLocked", { biomeName: "", layer: 4 }),
      left: 1150,
      top: 400,
      size: 150,
      isStarter: false,
      isBoss: true,
      iconUrl: null,
      siteBadgeIconClass: null,
      knownDreamsignIconUrl: null,
    },
  },
];

interface EdgeSpec {
  from: string;
  to: string;
  kind: AtlasEdgeKind;
}

// Edge treatments follow the live screen's rules: completed→completed is
// `traveled`, completed→available is `open`, revealed-but-not-yet-open is `dim`,
// and routes reaching from a deeper-than-frontier layer are `locked`.
const EDGE_SPECS: EdgeSpec[] = [
  { from: "starter", to: "frostforge", kind: "traveled" },
  { from: "starter", to: "tumbleleaf", kind: "traveled" },
  { from: "frostforge", to: "hopes_end", kind: "open" },
  { from: "frostforge", to: "grid_city", kind: "open" },
  { from: "tumbleleaf", to: "grid_city", kind: "open" },
  { from: "tumbleleaf", to: "wilderveil", kind: "open" },
  { from: "hopes_end", to: "pharaohs_gate", kind: "dim" },
  { from: "grid_city", to: "pharaohs_gate", kind: "dim" },
  { from: "grid_city", to: "rust_expanse", kind: "dim" },
  { from: "wilderveil", to: "rust_expanse", kind: "dim" },
  { from: "hopes_end", to: "unrevealed", kind: "dim" },
  { from: "pharaohs_gate", to: "boss", kind: "locked" },
  { from: "rust_expanse", to: "boss", kind: "locked" },
];

const NODE_BY_KEY = new Map(NODE_SPECS.map((spec) => [spec.key, spec]));

export function AtlasMapMockup() {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => {
      setScale(
        Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H),
      );
    };
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div
      className="dream-atlas"
      style={{
        ...sceneRoot,
        background:
          "radial-gradient(120% 90% at 50% 30%, #241a3c 0%, #140e26 45%, #060410 100%)",
      }}
    >
      {/* The fixed design canvas, centred and uniformly scaled to fit. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `translate(-50%, -50%) scale(${String(scale)})`,
          transformOrigin: "center",
        }}
      >
        <svg
          className="edges"
          viewBox={`0 0 ${String(CANVAS_W)} ${String(CANVAS_H)}`}
          width={CANVAS_W}
          height={CANVAS_H}
        >
          <AtlasEdgeDefs />
          {EDGE_SPECS.map((edge) => {
            const from = NODE_BY_KEY.get(edge.from);
            const to = NODE_BY_KEY.get(edge.to);
            if (from === undefined || to === undefined) {
              return null;
            }
            return (
              <AtlasEdge
                key={`${edge.from}-${edge.to}`}
                kind={edge.kind}
                x1={from.left}
                y1={from.top}
                x2={to.left}
                y2={to.top}
              />
            );
          })}
        </svg>

        <div className="nodes">
          {NODE_SPECS.map((spec) => (
            <AtlasNode
              key={spec.key}
              view={spec.view}
              hovered={spec.hovered ?? false}
              onEnter={() => undefined}
              onLeave={() => undefined}
              onClick={() => undefined}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: token("--space-8"),
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ font: token("--t-title"), color: token("--text-primary") }}>
          Dream Atlas
        </div>
        <div style={{ font: token("--t-caption"), color: token("--text-muted"), marginTop: token("--space-2") }}>
          Choose your next dream — seven layers to the final dream.
        </div>
      </div>

      <SceneCaption
        eyebrow="Atlas Node · Atlas Edge"
        title="Every node state and edge treatment across a run graph, over real dreamscape art."
        corner="bottom-left"
      />
    </div>
  );
}
