// Registry demo for SiteNode — the dreamscape site disc whose hover / press
// reveal routes through InfoCard's `icon` variant. SiteNode positions itself
// from `model.pos` inside a `position: relative` stage and anchors its reveal to
// a `stageRef`, so the demo's `Component` supplies a phone-proportioned scene-like
// stage, owns the `stageRef`, and lays out one node per state (a plain site, a
// larger battle guardian, a locked guardian, a visited site). `docName` still
// points at the real SiteNode so the props table reports its actual API. The
// models here are representative demo fixtures (glyphs, labels), not game data —
// the dreamscape screen builds real ones from its site list + seeded scatter.

import { useRef } from "react";
import { SiteNode, type DreamscapeSiteModel } from "../../components/atlas/SiteNode";
import { glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import type { TangoComponent } from "../registry";

/** Representative placed-site models, one per node state. */
const DEMO_MODELS: DreamscapeSiteModel[] = [
  {
    site: { id: "s-shop", type: "Shop", isEnhanced: false, isVisited: false },
    pos: { x: 24, y: 40 },
    index: 0,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: "Merchant",
    blurb: "Spend essence on cards, dreamsigns, and services.",
    icon: glyph("bxf bx-store-alt-2"),
  },
  {
    site: { id: "s-reward", type: "Reward", isEnhanced: false, isVisited: false },
    pos: { x: 50, y: 26 },
    index: 1,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: "Treasure",
    blurb: "Claim a reward carried by this site.",
    icon: glyph("bxf bx-treasure-chest"),
  },
  {
    site: { id: "s-visited", type: "Draft", isEnhanced: false, isVisited: true },
    pos: { x: 76, y: 42 },
    index: 2,
    isBattle: false,
    isLocked: false,
    isInteractive: false,
    label: "Draft 3x",
    blurb: "Draft new cards into your deck.",
    icon: glyph("bxf bx-copy"),
  },
  {
    site: { id: "s-battle", type: "Battle", isEnhanced: false, isVisited: false },
    pos: { x: 38, y: 74 },
    index: 3,
    isBattle: true,
    isLocked: false,
    isInteractive: true,
    label: "Battle",
    blurb: "The dreamscape's guardian awaits.",
    icon: glyph("bxf bx-sword-alt"),
  },
  {
    site: { id: "s-locked", type: "Battle", isEnhanced: false, isVisited: false },
    pos: { x: 66, y: 74 },
    index: 4,
    isBattle: true,
    isLocked: true,
    isInteractive: false,
    label: "Final Boss",
    blurb: "Visit the other sites in this dreamscape first.",
    icon: glyph("bxf bx-meteor"),
  },
];

interface SiteNodeDemoArgs {
  /** Enable the calm floaty drift. */
  motion?: boolean;
}

function SiteNodeDemo({ motion = true }: SiteNodeDemoArgs) {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: 390,
        height: 320,
        overflow: "hidden",
        borderRadius: token("--radius-sheet"),
        // A dark, scene-like backdrop so the discs sit over "scene art".
        background:
          "radial-gradient(120% 90% at 40% 25%, #2c2450 0%, #160f2a 50%, #080512 100%)",
        touchAction: "none",
      }}
    >
      {DEMO_MODELS.map((model) => (
        <SiteNode
          key={model.site.id}
          model={model}
          motion={motion}
          stageRef={stageRef}
          onSelect={() => undefined}
        />
      ))}
    </div>
  );
}

export const siteNodeDemo: TangoComponent = {
  id: "site-node",
  title: "Site Node",
  blurb:
    "The dreamscape site disc: a floating circular node over scene art carrying a glyph and accent ring. It has no text label — pressing or hovering reveals the site's name and detail through the shared InfoCard. The screen positions each node (via `model.pos`); it does not resize or recolor it.",
  group: "Components",
  docName: "SiteNode",
  Component: SiteNodeDemo,
  usage: [
    {
      note: "A dreamscape site disc that positions itself from `model.pos` inside a `position: relative` stage and reveals its description through InfoCard, anchored to the scene's `stageRef`. The disc's size and accent are the system's (battle guardians scale up on their own); `motion` enables the calm floaty drift.",
      code: `import { SiteNode } from "src/tango/components/atlas/SiteNode";

<div ref={stageRef} style={{ position: "relative" }}>
  {models.map((model) => (
    <SiteNode
      key={model.site.id}
      model={model}
      motion
      stageRef={stageRef}
      onSelect={() => visitSite(model.site)}
    />
  ))}
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      motion: true,
    },
  },
};
