import { assertLocalized } from "@trox/runtime";
// Full-screen mockup for SiteNode — a dreamscape screen: the wayside site discs
// scattered across real scene art, each revealing its InfoCard `icon` card on
// hover / press through the shared reveal engine. The node positions come from
// `model.pos` (stage percentages); the reveal anchors to the full-viewport
// stageRef, so cards clamp against the real screen edges. The scene art is a real
// dreamscape backdrop resolved by id from the atlas-display helpers. The site
// models are representative presentation fixtures (glyphs, labels) — the live
// dreamscape screen builds real ones from its site list and seeded scatter.

import { useRef } from "react";
import {
  SiteNode,
  type DreamscapeSiteModel,
} from "../../components/dreamscape/SiteNode";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { GLYPHS, glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";
import { parseSiteId } from "../../../types/identifiers";
import { parseDreamscapeId } from "../../../types/identifiers";

/** Representative placed-site models, scattered across the scene (pos in %). */
const SITE_MODELS: DreamscapeSiteModel[] = [
  {
    id: parseSiteId("s-shop"),
    type: "Shop",
    isVisited: false,
    pos: { x: 22, y: 34 },
    index: 0,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: assertLocalized("Merchant"),
    blurb: assertLocalized("Spend essence on cards, dreamsigns, and services."),
    icon: glyph("bxf bx-store-alt-2"),
  },
  {
    id: parseSiteId("s-reward"),
    type: "Reward",
    isVisited: false,
    pos: { x: 40, y: 22 },
    index: 1,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: assertLocalized("Treasure"),
    blurb: assertLocalized("Claim a reward carried by this site."),
    icon: glyph("bxf bx-treasure-chest"),
  },
  {
    id: parseSiteId("s-rest"),
    type: "Reward",
    isVisited: false,
    pos: { x: 78, y: 52 },
    index: 3,
    isBattle: false,
    isLocked: false,
    isInteractive: true,
    label: assertLocalized("Wellspring"),
    blurb: assertLocalized(
      "An enhanced site — rest and recover before the road ahead.",
    ),
    icon: GLYPHS.exhaust,
  },
  {
    id: parseSiteId("s-battle"),
    type: "Battle",
    isVisited: false,
    pos: { x: 34, y: 66 },
    index: 4,
    isBattle: true,
    isLocked: false,
    isInteractive: true,
    label: assertLocalized("Battle"),
    blurb: assertLocalized("The dreamscape's guardian awaits."),
    icon: glyph("bxf bx-sword-alt"),
  },
  {
    id: parseSiteId("s-boss"),
    type: "Battle",
    isVisited: false,
    pos: { x: 58, y: 74 },
    index: 5,
    isBattle: true,
    isLocked: true,
    isInteractive: false,
    label: assertLocalized("Final Boss"),
    blurb: assertLocalized("Visit the other sites in this dreamscape first."),
    icon: glyph("bxf bx-meteor"),
  },
];

export function SiteNodeMockup() {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.35) 0%, rgba(8,5,17,0.55) 60%, rgba(8,5,17,0.9) 100%), url(${dreamscapeSceneUrl(parseDreamscapeId("wilderveil"))})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        touchAction: "none",
      }}
    >
      {SITE_MODELS.map((model) => (
        <SiteNode
          key={model.id}
          model={model}
          motion
          onSelect={() => undefined}
        />
      ))}

      <div
        style={{
          position: "absolute",
          top: token("--space-2xl"),
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{ font: token("--t-title"), color: token("--text-primary") }}
        >
          Wilderveil
        </div>
        <div
          style={{
            font: token("--t-caption"),
            color: token("--text-secondary"),
            marginTop: token("--space-xs"),
          }}
        >
          Choose a site — press and hold any disc to read it.
        </div>
      </div>
    </div>
  );
}
