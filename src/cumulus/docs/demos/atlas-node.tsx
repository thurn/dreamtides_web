// Registry demo for AtlasNode — one semantic Dream Atlas node wired privately
// to the shared reveal coordinator. Each node presents its face and derives its
// strict primary and ordered related cards from one AtlasNodeModel.
// So this demo draws the shared atlas fixtures — one node per lifecycle state
// (unrevealed / revealedLocked / available / completed / forgone) plus the boss
// and starter anchors and the known-dreamsign badge — at the production node
// sizes, laid out in a compact grid inside a `.dream-atlas .nodes` stage. Art resolves from real
// dreamscape ids through `artRef`; the forgone node carries the forced-blank
// unreachable shape the view-model produces (a dimmed, badge-free empty frame).

import { atlasFixtureNodes, nodeSizing } from "../__atlas-fixtures__";
import { AtlasNode } from "../../components/atlas/AtlasNode";
import type { CumulusComponent } from "../registry";

interface AtlasNodeDemoArgs {
  /** Draw the nodes at the larger mobile production sizes. */
  mobileSizing?: boolean;
}

function AtlasNodeDemo({ mobileSizing = false }: AtlasNodeDemoArgs) {
  const sizing = nodeSizing(mobileSizing);
  const items = atlasFixtureNodes(sizing);

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
      left: startX + col * colGap,
      top: startY + row * rowGap,
    };
  });

  return (
    <div
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
        {placed.map(({ item, boxSize, left, top }) => (
          <div
            key={item.node.id}
            style={{
              position: "absolute",
              left,
              top,
              width: boxSize,
              height: boxSize,
              transform: "translate(-50%, -50%)",
            }}
          >
            <AtlasNode model={item} onPress={() => undefined} />
          </div>
        ))}
      </div>
    </div>
  );
}

export const atlasNodeDemo: CumulusComponent = {
  id: "atlas-node",
  title: "Atlas Node",
  blurb:
    "One dreamscape node on the Dream Atlas, wired to the shared InfoCard press engine: a framed circular icon whose glow and badges track its state — including a frame-shaped violet outline that visibly widens and contracts around the next selectable dreamscape — and which reveals its scene / detail card on hover or press.",
  group: "Atlas & Sites",
  docName: "AtlasNode",
  Component: AtlasNodeDemo,
  usage: [
    {
      note: "One semantic Atlas node. The model carries UUID-backed face, primary, Dreamsign, site, and affiliation data; AtlasNode owns reveal interaction and activation.",
      code: `import { AtlasNode } from "src/cumulus/components/atlas/AtlasNode";

<div className="dream-atlas">
  <div className="nodes">
    {nodes.map(({ model, left, top, boxSize }) => (
      <div
        key={model.node.id}
        style={{ position: "absolute", left, top, width: boxSize, height: boxSize, transform: "translate(-50%, -50%)" }}
      >
        <AtlasNode model={model} onPress={(id) => enterDreamscape(id)} />
      </div>
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
