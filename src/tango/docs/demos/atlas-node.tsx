// Registry demo for AtlasNodeReveal — one Dream Atlas node wired to the shared
// InfoCard press engine. Each node presents its face (AtlasNode) and, on
// hover / press, reveals its detail through the ONE Tango popover, exactly as the
// live atlas does. AtlasNodeReveal's `item` is a fully-resolved
// `AtlasNodeRevealItem` (a placed `AtlasNodeView` face + its `AtlasNodeCard`
// reveal content), which the registry's generic control panel cannot synthesize.
// So this demo draws the shared atlas fixtures — one node per lifecycle state
// (unrevealed / revealedLocked / available / completed / forgone) plus the boss
// and starter anchors and the known-dreamsign badge — at the production node
// sizes, laid out in a compact grid inside a `.dream-atlas .nodes` stage whose
// `stageRef` the reveal anchors and clamps against. Art resolves from real
// dreamscape ids through `artRef`; the forgone node carries the forced-blank
// unreachable shape the view-model produces (a dimmed, badge-free empty frame).

import { useRef } from "react";
import {
  atlasFixtureNodes,
  nodeSizing,
} from "../__atlas-fixtures__";
import { AtlasNodeReveal } from "../../components/atlas/AtlasNodeReveal";
import type { TangoComponent } from "../registry";

interface AtlasNodeDemoArgs {
  /** Draw the nodes at the larger mobile production sizes + enlarged badges. */
  mobileSizing?: boolean;
}

function AtlasNodeDemo({ mobileSizing = false }: AtlasNodeDemoArgs) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sizing = nodeSizing(mobileSizing);
  const items = atlasFixtureNodes(sizing).map((fixture) => fixture.item);

  // Lay the nodes out in a compact grid (4 per row); each node centres itself on
  // its left/top so the row/column pitch is the node-centre spacing. The pitch
  // scales with the node size so the production-scale mobile nodes do not overlap.
  const perRow = 4;
  const colGap = Math.round(sizing.nodeSize * 1.05);
  const rowGap = Math.round(sizing.nodeSize * 1.2);
  const startX = Math.round(sizing.nodeSize * 0.62);
  const startY = Math.round(sizing.nodeSize * 0.66);
  const placed = items.map((item, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return {
      ...item,
      view: {
        ...item.view,
        left: startX + col * colGap,
        top: startY + row * rowGap,
      },
    };
  });

  return (
    <div
      ref={stageRef}
      className="dream-atlas"
      style={{
        position: "relative",
        width: "100%",
        minWidth: mobileSizing ? 900 : 620,
        height: mobileSizing ? 620 : 380,
        background: "#0a0612",
        borderRadius: 12,
        overflow: "hidden",
        touchAction: "none",
      }}
    >
      <div className="nodes">
        {placed.map((item) => (
          <AtlasNodeReveal
            key={item.view.node.id}
            item={item}
            stageRef={stageRef}
            onEnterNode={() => undefined}
          />
        ))}
      </div>
    </div>
  );
}

export const atlasNodeDemo: TangoComponent = {
  id: "atlas-node",
  title: "Atlas Node",
  blurb:
    "One dreamscape node on the Dream Atlas, wired to the shared InfoCard press engine: a framed circular icon whose glow and badges track its state — revealed, known, visited, completed, forgone, or a looming boss — and which reveals its scene / detail card on hover or press.",
  group: "Components",
  docName: "AtlasNodeReveal",
  Component: AtlasNodeDemo,
  usage: [
    {
      note: "One node on the Dream Atlas, wired to the InfoCard press engine. `item` is a fully-resolved `AtlasNodeRevealItem` (a placed `AtlasNodeView` face + its `AtlasNodeCard` reveal content) built by the atlas view-model; the node positions itself from `view.left` / `view.top` inside a `.dream-atlas .nodes` stage and anchors its press / hover reveal to the stage root via `stageRef`. Selecting an available node enters its dreamscape through `onEnterNode`.",
      code: `import { AtlasNodeReveal } from "src/tango/components/atlas/AtlasNodeReveal";

const stageRef = useRef<HTMLDivElement>(null);

<div ref={stageRef} className="dream-atlas">
  <div className="nodes">
    {items.map((item) => (
      <AtlasNodeReveal
        key={item.view.node.id}
        item={item}
        stageRef={stageRef}
        onEnterNode={(id) => enterDreamscape(id)}
      />
    ))}
  </div>
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      mobileSizing: false,
    },
  },
};
