// Full-screen mockup for the Dream Atlas — the shared scene behind the
// `atlas-node` and `atlas-edge` component pages. It mounts the real `AtlasMap`
// surface: the run graph of dreamscape nodes and their connectors, fitted into
// the production portrait design stage and uniformly scaled to fit the viewport
// (letterboxed) by AtlasMap itself. The mockup only owns the full-bleed
// `.dream-atlas` scene, its violet journey wash, and the `stageRef` the node
// reveals anchor and clamp against — the orientation, scale-to-fit, edge drawing,
// and press / hover reveals all belong to the real component.
//
// The fixtures form a vertical run graph read bottom-up, exactly as the live
// mobile atlas reads: the Firstlight Meadow starter anchors the bottom, each
// layer climbs toward the Apollyon boss battle at the top, and the nodes span
// every lifecycle state (completed / available / revealedLocked / unrevealed /
// forgone) plus the boss and starter anchors and one `isReachable: false` forgone
// node. The node faces and their reveal cards come from the shared atlas fixtures
// (see `__atlas-fixtures__`), drawn at the production mobile node sizes; the
// forward connectors exercise all four AtlasEdge treatments (traveled / open /
// dim / locked). Node centres and edge endpoints are authored in the production
// portrait stage space.

import {
  ATLAS_STAGE_HEIGHT,
  ATLAS_STAGE_WIDTH,
} from "../../components/atlas/atlas-display";
import {
  AtlasMap,
  type AtlasMapEdge,
  type AtlasMapNode,
} from "../../components/atlas/AtlasMap";
import type { AtlasEdgeKind } from "../../components/atlas/AtlasEdge";
import { token } from "../../primitives/tokens";
import {
  type AtlasFixtureRole,
  atlasFixtureNodes,
  nodeSizing,
} from "../__atlas-fixtures__";
import { sceneRoot } from "./scene";

/** A node centre in the production portrait stage (1080×1920) space. */
interface Placement {
  left: number;
  top: number;
}

/**
 * Where each fixture node sits in the portrait stage, authored as a run graph
 * climbing bottom (the starter) to top (the boss). Same-layer siblings share a
 * row; the layer axis is the vertical span, matching the live mobile atlas.
 */
const PLACEMENTS: Record<AtlasFixtureRole, Placement> = {
  starter: { left: 540, top: 1720 },
  completed: { left: 540, top: 1380 },
  available: { left: 360, top: 1040 },
  forgone: { left: 720, top: 1040 },
  revealedLocked: { left: 360, top: 700 },
  unrevealed: { left: 720, top: 700 },
  boss: { left: 540, top: 340 },
};

/** Forward connectors between the placed nodes, one per AtlasEdge treatment. */
const EDGES: { from: AtlasFixtureRole; to: AtlasFixtureRole; kind: AtlasEdgeKind }[] = [
  { from: "starter", to: "completed", kind: "traveled" },
  { from: "completed", to: "available", kind: "open" },
  { from: "completed", to: "forgone", kind: "dim" },
  { from: "available", to: "revealedLocked", kind: "dim" },
  { from: "available", to: "unrevealed", kind: "dim" },
  { from: "forgone", to: "unrevealed", kind: "locked" },
  { from: "revealedLocked", to: "boss", kind: "locked" },
  { from: "unrevealed", to: "boss", kind: "locked" },
];

export function AtlasMapMockup() {
  // The production mobile node sizes suit the vertical portrait stage.
  const nodes: AtlasMapNode[] = atlasFixtureNodes(nodeSizing(true)).map(
    (fixture) => {
      const at = PLACEMENTS[fixture.role];
      return {
        ...fixture.item,
        left: at.left,
        top: at.top,
      };
    },
  );

  const edges: AtlasMapEdge[] = EDGES.map((edge) => {
    const from = PLACEMENTS[edge.from];
    const to = PLACEMENTS[edge.to];
    return {
      key: `${edge.from}-${edge.to}`,
      x1: from.left,
      y1: from.top,
      x2: to.left,
      y2: to.top,
      kind: edge.kind,
    };
  });

  return (
    <div
      className="dream-atlas"
      style={{ ...sceneRoot, background: token("--dt-wash-journey") }}
    >
      <AtlasMap
        stageWidth={ATLAS_STAGE_WIDTH}
        stageHeight={ATLAS_STAGE_HEIGHT}
        nodes={nodes}
        edges={edges}
        onEnterNode={() => undefined}
      />
    </div>
  );
}
