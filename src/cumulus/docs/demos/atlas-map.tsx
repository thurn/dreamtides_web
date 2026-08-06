// Registry demo for AtlasMap — the Dream Atlas map surface. It mounts the REAL
// AtlasMap inside a bounded stage: the run graph of dreamscape nodes and their
// connectors, authored in the production portrait design stage (1080×1920) and
// uniformly scaled to fit the bounded container (letterboxed) by AtlasMap
// itself. AtlasMap owns the `.dream-atlas` scope and the scale-to-fit; the
// placed view models decide the vertical layout (the Firstlight Meadow starter
// anchors the bottom, each layer climbs toward the Apollyon boss at the top).
// Each node reveals its detail through the shared InfoCard press engine — hover
// on desktop, press-down on touch.
//
// The node faces and their reveal cards come from the shared atlas fixtures (see
// `__atlas-fixtures__`), drawn at the production mobile node sizes and placed
// into a vertical run graph; the forward connectors exercise all four AtlasEdge
// treatments (traveled / open / dim / locked). Node centres and edge endpoints
// are authored in the production portrait stage space. The demo supplies the
// bounded stage, its `stageRef`, and a no-op `onEnterNode`; the atlas screen
// composes AtlasMap with the atmosphere and HUD around it and supplies the
// placed view models from the atlas view-model builder.

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
import type { CumulusComponent } from "../registry";

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
const EDGES: {
  from: AtlasFixtureRole;
  to: AtlasFixtureRole;
  kind: AtlasEdgeKind;
}[] = [
  { from: "starter", to: "completed", kind: "traveled" },
  { from: "completed", to: "available", kind: "open" },
  { from: "completed", to: "forgone", kind: "dim" },
  { from: "available", to: "revealedLocked", kind: "dim" },
  { from: "available", to: "unrevealed", kind: "dim" },
  { from: "forgone", to: "unrevealed", kind: "locked" },
  { from: "revealedLocked", to: "boss", kind: "locked" },
  { from: "unrevealed", to: "boss", kind: "locked" },
];

// The production mobile node sizes suit the vertical portrait stage.
const NODES: AtlasMapNode[] = atlasFixtureNodes(nodeSizing(true)).map(
  (fixture) => {
    const at = PLACEMENTS[fixture.role];
    return {
      ...fixture.item,
      left: at.left,
      top: at.top,
    };
  },
);

const MAP_EDGES: AtlasMapEdge[] = EDGES.map((edge) => {
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

interface AtlasMapDemoProps {
  stageWidth?: number;
  stageHeight?: number;
  nodes?: AtlasMapNode[];
  edges?: AtlasMapEdge[];
}

function AtlasMapDemo({
  stageWidth = ATLAS_STAGE_WIDTH,
  stageHeight = ATLAS_STAGE_HEIGHT,
  nodes = NODES,
  edges = MAP_EDGES,
}: AtlasMapDemoProps) {
  return (
    <div
      className="dream-atlas"
      style={{
        position: "relative",
        width: "100%",
        height: 560,
        background: token("--atlas-map-background"),
        borderRadius: 12,
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <AtlasMap
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        nodes={nodes}
        edges={edges}
        onEnterNode={() => undefined}
      />
    </div>
  );
}

export const atlasMapDemo: CumulusComponent = {
  id: "atlas-map",
  title: "Atlas Map",
  blurb:
    "The Dream Atlas map surface — the run graph of dreamscape nodes and their connectors, fitted into a fixed portrait design stage that uniformly scales to fit its container (letterboxed). It owns the `.dream-atlas` scope and the scale-to-fit while the placed view models decide the vertical layout (the starter anchors the bottom, the boss the top); each node reveals its detail through the shared InfoCard press engine — hover on desktop, press-down on touch.",
  callout:
    "Use AtlasMap for a Dream Atlas run graph that follows its fixed stage, node model, and scale-to-fit contract.",
  details: [
    "For other graph compositions, compose the lower-level AtlasNode and AtlasEdge components.",
  ],
  group: "Components",
  docName: "AtlasMap",
  Component: AtlasMapDemo,
  usage: [
    {
      note: "The Dream Atlas map surface scales the fixed design stage to fit its container. Nodes are strict AtlasNode models; each node measures itself in the visual viewport and activation reports its UUID.",
      code: `import { AtlasMap } from "src/cumulus/components/atlas/AtlasMap";
import {
  ATLAS_STAGE_HEIGHT,
  ATLAS_STAGE_WIDTH,
} from "src/cumulus/components/atlas/atlas-display";

<div className="dream-atlas">
  <AtlasMap
    stageWidth={ATLAS_STAGE_WIDTH}
    stageHeight={ATLAS_STAGE_HEIGHT}
    nodes={nodes}
    edges={edges}
    onEnterNode={enterDreamscape}
  />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      stageWidth: ATLAS_STAGE_WIDTH,
      stageHeight: ATLAS_STAGE_HEIGHT,
    },
    sampleContent: {
      nodes: NODES,
      edges: MAP_EDGES,
    },
  },
};
