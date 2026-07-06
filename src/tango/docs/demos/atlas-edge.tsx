// Registry demo for AtlasEdge — the four Dream Atlas connector treatments. Each
// AtlasEdge is an SVG `<line>` (or two, for the animated `open` flow) that paints
// its `traveled`/`open` sweep with a per-edge gradient anchored to its own
// endpoints, so the demo renders one AtlasEdge per kind inside a single
// `.dream-atlas` svg. `docName` points at AtlasEdge so the props table reports
// its real API.

import { AtlasEdge, type AtlasEdgeKind } from "../../components/atlas/AtlasEdge";
import type { TangoComponent } from "../registry";

const KINDS: Array<{ kind: AtlasEdgeKind; label: string }> = [
  { kind: "traveled", label: "traveled" },
  { kind: "open", label: "open" },
  { kind: "dim", label: "dim" },
  { kind: "locked", label: "locked" },
];

function AtlasEdgeDemo() {
  const rowY = (i: number) => 40 + i * 56;
  return (
    <div
      className="dream-atlas"
      style={{
        position: "relative",
        width: "100%",
        minWidth: 460,
        maxWidth: 520,
        background: "#0a0612",
        borderRadius: 12,
        padding: 8,
      }}
    >
      <svg viewBox="0 0 480 260" width="100%" height={260}>
        {KINDS.map(({ kind, label }, i) => (
          <g key={kind}>
            <text
              x={20}
              y={rowY(i) + 5}
              fill="#b3aac8"
              fontFamily="ui-monospace, monospace"
              fontSize={14}
            >
              {label}
            </text>
            {/* Drawn perfectly horizontal on purpose: the per-edge
                userSpaceOnUse gradient paints the sweep at any orientation, so a
                same-row route no longer vanishes the way a shared
                objectBoundingBox gradient would. */}
            <AtlasEdge kind={kind} x1={140} y1={rowY(i)} x2={452} y2={rowY(i)} />
          </g>
        ))}
      </svg>
    </div>
  );
}

export const atlasEdgeDemo: TangoComponent = {
  id: "atlas-edge",
  title: "Atlas Edge",
  blurb:
    "The connector between two Atlas nodes, drawn inside the map's SVG. Its treatment reflects the endpoints' lifecycle relative to the layer the player is choosing into.",
  group: "Components",
  docName: "AtlasEdge",
  usage: [
    {
      note: "An atlas connector line. Render one `AtlasEdge` per connection inside the map's `<svg>`, with the `kind` picking the treatment (traveled / open / dim / locked). Each edge carries its own gradient anchored to its endpoints, so it paints at any orientation — horizontal, vertical, or diagonal.",
      code: `import { AtlasEdge } from "src/tango/components/atlas/AtlasEdge";

<svg className="dream-atlas">
  <AtlasEdge kind="open" x1={140} y1={40} x2={452} y2={40} />
</svg>`,
    },
  ],
  Component: AtlasEdgeDemo,
  demo: {
    defaultArgs: {},
  },
};
