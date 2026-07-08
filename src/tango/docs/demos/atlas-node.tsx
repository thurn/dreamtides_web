// Registry demo for AtlasNodeReveal — one Dream Atlas node wired to the shared
// InfoCard press engine. Each node presents its face (AtlasNode) and, on
// hover / press, reveals its detail through the ONE Tango popover, exactly as the
// live atlas does. AtlasNodeReveal's `item` is a fully-resolved
// `AtlasNodeRevealItem` (a placed `AtlasNodeView` face + its `AtlasNodeCard`
// reveal content), which the registry's generic control panel cannot synthesize.
// So this wrapper builds a representative item per lifecycle state — exercising
// every state (unrevealed / revealedLocked / available / completed / forgone)
// plus the boss and starter anchors and the known-dreamsign badge — at the
// production node sizes, and lays them out inside a `.dream-atlas .nodes` stage
// whose `stageRef` the reveal anchors and clamps against. Art resolves from real
// dreamscape ids through `artRef`; the forgone node carries the forced-blank
// unreachable shape the view-model produces (a dimmed, badge-free empty frame).

import { useRef } from "react";
import type { DreamscapeNode } from "../../../types/quest";
import { LayerName } from "../../../types/layer-name";
import {
  ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
  ATLAS_ANCHOR_NODE_SIZE_MOBILE,
  ATLAS_BADGE_SCALE_MOBILE,
  ATLAS_NODE_SIZE_DESKTOP,
  ATLAS_NODE_SIZE_MOBILE,
} from "../../components/atlas/atlas-display";
import {
  AtlasNodeReveal,
  type AtlasNodeCard,
  type AtlasNodeRevealItem,
} from "../../components/atlas/AtlasNodeReveal";
import { artRef } from "../../primitives/art";
import { glyph } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

/** Builds an atlas node in the given lifecycle state. */
function makeNode(
  id: string,
  state: DreamscapeNode["state"],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer: LayerName.One,
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

/** The compact "unseen dream" reveal card an unrevealed / unreachable node shows. */
function unseenCard(): AtlasNodeCard {
  return {
    isUnrevealed: true,
    isBoss: false,
    sceneArt: null,
    figureArt: null,
    title: "An Unseen Dream",
    body: "This dreamscape is revealed only as you draw near. Travel onward to learn what waits here.",
    dreamsign: null,
    placeName: null,
    guideName: null,
    siteName: null,
    affiliation: null,
    siteCard: null,
    affiliationCard: null,
  };
}

/** A revealed dreamscape's full-bleed scene reveal card. */
function sceneCard(
  dreamscapeId: string,
  overrides: Partial<AtlasNodeCard> = {},
): AtlasNodeCard {
  return {
    isUnrevealed: false,
    isBoss: false,
    sceneArt: artRef.dreamscapeScene(dreamscapeId),
    figureArt: null,
    title: "A Revealed Dream",
    body: "A place whose shape you have already glimpsed on the road ahead.",
    dreamsign: null,
    placeName: null,
    guideName: null,
    siteName: null,
    affiliation: null,
    siteCard: null,
    affiliationCard: null,
    ...overrides,
  };
}

/** The active node-size set — production desktop or mobile. */
interface NodeSizing {
  nodeSize: number;
  anchorNodeSize: number;
  badgeScale: number;
}

/**
 * The demo nodes, one per lifecycle state plus the starter / boss anchors, each
 * carrying the production node face and its resolved reveal card. A
 * signature-site badge glyph (Boxicons filled) is static presentation, not game
 * data — the live atlas resolves these per site type at render time.
 */
function demoItems(sizing: NodeSizing): AtlasNodeRevealItem[] {
  const { nodeSize, anchorNodeSize, badgeScale } = sizing;
  const shopBadge = glyph("bxf bx-store-alt-2");

  const specs: AtlasNodeRevealItem[] = [
    {
      view: {
        node: makeNode("n-unrevealed", "unrevealed", {
          biomeName: "",
          dreamscapeId: null,
        }),
        left: 0,
        top: 0,
        size: nodeSize,
        isStarter: false,
        isBoss: false,
        isReachable: true,
        iconRef: null,
        siteBadgeGlyph: null,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: unseenCard(),
    },
    {
      view: {
        node: makeNode("n-locked", "revealedLocked"),
        left: 0,
        top: 0,
        size: nodeSize,
        isStarter: false,
        isBoss: false,
        isReachable: true,
        iconRef: artRef.dreamscapeIcon("hopes_end"),
        siteBadgeGlyph: shopBadge,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: sceneCard("hopes_end"),
    },
    {
      view: {
        node: makeNode("n-available", "available"),
        left: 0,
        top: 0,
        size: nodeSize,
        isStarter: false,
        isBoss: false,
        isReachable: true,
        iconRef: artRef.dreamscapeIcon("frostforge"),
        siteBadgeGlyph: shopBadge,
        knownDreamsignRef: artRef.dreamsign("acorn_gold.png"),
        badgeScale,
      },
      card: sceneCard("frostforge", {
        dreamsign: {
          name: "Golden Acorn",
          art: artRef.dreamsign("acorn_gold.png"),
          rulesText: "Whenever you play a card, gain 1 essence.",
        },
      }),
    },
    {
      view: {
        node: makeNode("n-completed", "completed"),
        left: 0,
        top: 0,
        size: nodeSize,
        isStarter: false,
        isBoss: false,
        isReachable: true,
        iconRef: artRef.dreamscapeIcon("tumbleleaf_village"),
        siteBadgeGlyph: shopBadge,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: sceneCard("tumbleleaf_village"),
    },
    {
      // The forgone node carries the forced-blank shape `buildAtlasMapNodes`
      // produces for an unreachable node: no icon, no site badge, no known
      // dreamsign, and `isReachable: false` so it renders as the dimmed empty
      // frame beside its still-reachable siblings. Its reveal is the "unseen
      // dream" text card — it leaks nothing about the dreamscape it forgot.
      view: {
        node: makeNode("n-forgone", "forgone", {
          biomeName: "",
          dreamscapeId: null,
        }),
        left: 0,
        top: 0,
        size: nodeSize,
        isStarter: false,
        isBoss: false,
        isReachable: false,
        iconRef: null,
        siteBadgeGlyph: null,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: unseenCard(),
    },
    {
      view: {
        node: makeNode("n-starter", "available", {
          biomeName: "Firstlight Meadow",
        }),
        left: 0,
        top: 0,
        size: anchorNodeSize,
        isStarter: true,
        isBoss: false,
        isReachable: true,
        iconRef: artRef.dreamscapeIcon("firstlight_meadow"),
        siteBadgeGlyph: null,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: sceneCard("firstlight_meadow", {
        title: "Firstlight Meadow",
        body: "A quiet place where every dream quest begins.",
      }),
    },
    {
      view: {
        node: makeNode("n-boss", "revealedLocked", { biomeName: "" }),
        left: 0,
        top: 0,
        size: anchorNodeSize,
        isStarter: false,
        isBoss: true,
        isReachable: true,
        iconRef: null,
        siteBadgeGlyph: null,
        knownDreamsignRef: null,
        badgeScale,
      },
      card: {
        isUnrevealed: false,
        isBoss: true,
        sceneArt: artRef.dreamscapeScene("limbo"),
        figureArt: artRef.dreamGuide("apollyon"),
        title: "Apollyon, the Doom of Humanity",
        body: "A Dreamcaller of annihilating power — his own deck, dreamsigns, and abilities bend the dream toward ruin.",
        dreamsign: null,
        placeName: "Limbo",
        guideName: "Apollyon, the Doom of Humanity",
        siteName: null,
        affiliation: null,
        siteCard: null,
        affiliationCard: null,
      },
    },
  ];

  // Lay the nodes out in a compact grid (4 per row); each node centres itself on
  // its left/top so the row/column pitch is the node-centre spacing. The pitch
  // scales with the node size so the production-scale mobile nodes do not overlap.
  const perRow = 4;
  const colGap = Math.round(nodeSize * 1.05);
  const rowGap = Math.round(nodeSize * 1.2);
  const startX = Math.round(nodeSize * 0.62);
  const startY = Math.round(nodeSize * 0.66);
  return specs.map((item, i) => {
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
}

interface AtlasNodeDemoArgs {
  /** Draw the nodes at the larger mobile production sizes + enlarged badges. */
  mobileSizing?: boolean;
}

function AtlasNodeDemo({ mobileSizing = false }: AtlasNodeDemoArgs) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sizing: NodeSizing = mobileSizing
    ? {
        nodeSize: ATLAS_NODE_SIZE_MOBILE,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_MOBILE,
        badgeScale: ATLAS_BADGE_SCALE_MOBILE,
      }
    : {
        nodeSize: ATLAS_NODE_SIZE_DESKTOP,
        anchorNodeSize: ATLAS_ANCHOR_NODE_SIZE_DESKTOP,
        badgeScale: 1,
      };
  const items = demoItems(sizing);
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
        {items.map((item) => (
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
