// Full-screen mockup for SiteNode — a dreamscape screen: the wayside site discs
// scattered across real scene art, each revealing its InfoCard `icon` card on
// hover / press through the shared reveal engine. The node positions come from
// `model.pos` (stage percentages); the reveal anchors to the full-viewport
// stageRef, so cards clamp against the real screen edges. The scene art is a real
// dreamscape backdrop resolved by id from the atlas-display helpers. The site
// models are representative presentation fixtures (glyphs, labels, accents) — the
// live dreamscape screen builds real ones from its site list and seeded scatter.

import { useRef } from "react";
import { SiteNode, type DreamscapeSiteModel } from "../../components/SiteNode";
import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

/** Representative placed-site models, scattered across the scene (pos in %). */
const SITE_MODELS: DreamscapeSiteModel[] = [
  {
    site: { id: "s-shop", type: "Shop", isEnhanced: false, isVisited: false },
    pos: { x: 22, y: 34 },
    index: 0,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: "Merchant",
    blurb: "Spend essence on cards, dreamsigns, and services.",
    icon: "bxf bx-store-alt-2",
    accent: "#a855f7",
  },
  {
    site: { id: "s-reward", type: "Reward", isEnhanced: false, isVisited: false },
    pos: { x: 40, y: 22 },
    index: 1,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: "Treasure",
    blurb: "Claim a reward carried by this site.",
    icon: "bxf bx-treasure-chest",
    accent: "#a855f7",
  },
  {
    site: { id: "s-draft", type: "Draft", isEnhanced: false, isVisited: true },
    pos: { x: 62, y: 30 },
    index: 2,
    isBattle: false,
    isLocked: false,
    isInteractive: false,
    label: "Draft 3x",
    blurb: "Draft new cards into your deck.",
    icon: "bxf bx-copy",
    accent: "#a855f7",
  },
  {
    site: { id: "s-rest", type: "Reward", isEnhanced: true, isVisited: false },
    pos: { x: 78, y: 52 },
    index: 3,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: "Wellspring",
    blurb: "An enhanced site — rest and recover before the road ahead.",
    icon: "bxf bx-moon",
    accent: "#38bdf8",
  },
  {
    site: { id: "s-battle", type: "Battle", isEnhanced: false, isVisited: false },
    pos: { x: 34, y: 66 },
    index: 4,
    isBattle: true,
    isLocked: false,
    isInteractive: true,
    label: "Battle",
    blurb: "The dreamscape's guardian awaits.",
    icon: "bxf bx-sword-alt",
    accent: "#ef4444",
  },
  {
    site: { id: "s-boss", type: "Battle", isEnhanced: false, isVisited: false },
    pos: { x: 58, y: 74 },
    index: 5,
    isBattle: true,
    isLocked: true,
    isInteractive: false,
    label: "Final Boss",
    blurb: "Visit the other sites in this dreamscape first.",
    icon: "bxf bx-meteor",
    accent: "#6b7280",
  },
];

export function SiteNodeMockup() {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.35) 0%, rgba(8,5,17,0.55) 60%, rgba(8,5,17,0.9) 100%), url(${dreamscapeSceneUrl("wilderveil")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        touchAction: "none",
      }}
    >
      {SITE_MODELS.map((model) => (
        <SiteNode
          key={model.site.id}
          model={model}
          size={64}
          motion
          stageRef={stageRef}
          onSelect={() => undefined}
        />
      ))}

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
          Wilderveil
        </div>
        <div style={{ font: token("--t-caption"), color: token("--text-secondary"), marginTop: token("--space-2") }}>
          Choose a site — press and hold any disc to read it.
        </div>
      </div>

    </div>
  );
}
