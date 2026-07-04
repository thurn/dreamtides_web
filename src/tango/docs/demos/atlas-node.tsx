// Registry demo for AtlasNode — one node on the Dream Atlas. AtlasNode's `view`
// prop is a fully-resolved AtlasNodeView (node lifecycle + resolved art URLs),
// which the registry's generic `ComponentType<Record<string, unknown>>`
// signature and the auto-generated control panel cannot synthesize. So this
// wrapper builds a representative AtlasNodeView per lifecycle state and lays the
// nodes out inside a `.dream-atlas` stage, exercising every state
// (unrevealed / revealedLocked / available / completed / forgone) plus the
// boss and starter flags and the known-dreamsign badge. Art URLs resolve from
// real dreamscape ids via the Tango atlas-display helpers; `docName` still
// points at the real AtlasNode so the props table reports its actual API.

import type { DreamscapeNode } from "../../../types/quest";
import { AtlasNode, type AtlasNodeView } from "../../components/atlas/AtlasNode";
import {
  dreamscapeIconUrl,
  dreamsignIconUrl,
} from "../../components/atlas/atlas-display";
import type { TangoComponent } from "../registry";

/** Builds a revealed atlas node in the given lifecycle state. */
function makeNode(
  id: string,
  state: DreamscapeNode["state"],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer: 0,
    indexInLayer: 0,
    dreamscapeId: "demo_dreamscape",
    biomeName: "Demo Dreamscape",
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

interface DemoNode {
  view: AtlasNodeView;
  hovered: boolean;
}

/** The grid of nodes shown in the demo, one per state + the special flags. */
function demoNodes(hoverAvailable: boolean): DemoNode[] {
  const size = 96;
  const bossSize = 112;
  // A signature-site badge glyph (Boxicons filled). Static presentation, not
  // game data — the atlas resolves these per site type at render time.
  const shopBadge = "bxf bx-store-alt-2";

  const specs: Array<{
    view: AtlasNodeView;
    hovered?: boolean;
  }> = [
    {
      view: {
        node: makeNode("n-unrevealed", "unrevealed", {
          biomeName: "",
          dreamscapeId: null,
        }),
        left: 0,
        top: 0,
        size,
        isStarter: false,
        isBoss: false,
        iconUrl: null,
        siteBadgeIconClass: null,
        knownDreamsignIconUrl: null,
      },
    },
    {
      view: {
        node: makeNode("n-locked", "revealedLocked"),
        left: 0,
        top: 0,
        size,
        isStarter: false,
        isBoss: false,
        iconUrl: dreamscapeIconUrl("hopes_end"),
        siteBadgeIconClass: shopBadge,
        knownDreamsignIconUrl: null,
      },
    },
    {
      view: {
        node: makeNode("n-available", "available"),
        left: 0,
        top: 0,
        size,
        isStarter: false,
        isBoss: false,
        iconUrl: dreamscapeIconUrl("frostforge"),
        siteBadgeIconClass: shopBadge,
        knownDreamsignIconUrl: dreamsignIconUrl("acorn_gold.png"),
      },
      hovered: hoverAvailable,
    },
    {
      view: {
        node: makeNode("n-completed", "completed"),
        left: 0,
        top: 0,
        size,
        isStarter: false,
        isBoss: false,
        iconUrl: dreamscapeIconUrl("tumbleleaf_village"),
        siteBadgeIconClass: shopBadge,
        knownDreamsignIconUrl: null,
      },
    },
    {
      view: {
        node: makeNode("n-forgone", "forgone"),
        left: 0,
        top: 0,
        size,
        isStarter: false,
        isBoss: false,
        iconUrl: dreamscapeIconUrl("grid_city"),
        siteBadgeIconClass: shopBadge,
        knownDreamsignIconUrl: null,
      },
    },
    {
      view: {
        node: makeNode("n-starter", "available", { biomeName: "Firstlight Meadow" }),
        left: 0,
        top: 0,
        size: bossSize,
        isStarter: true,
        isBoss: false,
        iconUrl: dreamscapeIconUrl("firstlight_meadow"),
        siteBadgeIconClass: null,
        knownDreamsignIconUrl: null,
      },
    },
    {
      view: {
        node: makeNode("n-boss", "revealedLocked", { biomeName: "" }),
        left: 0,
        top: 0,
        size: bossSize,
        isStarter: false,
        isBoss: true,
        iconUrl: null,
        siteBadgeIconClass: null,
        knownDreamsignIconUrl: null,
      },
    },
  ];

  // Lay the nodes out in a compact grid (4 per row); each node centres itself
  // on its left/top so the row/column pitch is the node-centre spacing.
  const perRow = 4;
  const colGap = 130;
  const rowGap = 150;
  const startX = 78;
  const startY = 84;
  return specs.map((spec, i) => {
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    return {
      view: {
        ...spec.view,
        left: startX + col * colGap,
        top: startY + row * rowGap,
      },
      hovered: spec.hovered ?? false,
    };
  });
}

interface AtlasNodeDemoArgs {
  /** Draw the available node in its hover (bright glow + scale-up) state. */
  hovered?: boolean;
}

function AtlasNodeDemo({ hovered = false }: AtlasNodeDemoArgs) {
  const nodes = demoNodes(hovered);
  return (
    <div
      className="dream-atlas"
      style={{
        position: "relative",
        width: "100%",
        minWidth: 560,
        height: 320,
        background: "#0a0612",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div className="nodes">
        {nodes.map(({ view, hovered: isHovered }) => (
          <AtlasNode
            key={view.node.id}
            view={view}
            hovered={isHovered}
            onEnter={() => undefined}
            onLeave={() => undefined}
            onClick={() => undefined}
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
    "One dreamscape node on the Dream Atlas: a framed circular icon whose glow and badges track its state — revealed, known, visited, completed, or a looming boss.",
  group: "Components",
  docName: "AtlasNode",
  Component: AtlasNodeDemo,
  usage: [
    {
      note: "One node on the Dream Atlas. `view` is a fully-resolved `AtlasNodeView` (node lifecycle + resolved art URLs + placement) built by the atlas layout; the node reports hover / click through the callbacks and positions itself from `view.left` / `view.top` inside a `.dream-atlas .nodes` stage.",
      code: `import { AtlasNode } from "src/tango/components/atlas/AtlasNode";

<div className="dream-atlas">
  <div className="nodes">
    <AtlasNode
      view={view}
      hovered={hoveredId === view.node.id}
      onEnter={() => setHoveredId(view.node.id)}
      onLeave={() => setHoveredId(null)}
      onClick={() => enterDreamscape(view.node)}
    />
  </div>
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      hovered: false,
    },
  },
};
