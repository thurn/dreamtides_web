// Registry demo for Dreamsign — the dreamsign entity tile whose hover / press
// reveal routes through InfoCard's `object` variant. Like QuestStatusBar,
// Dreamsign anchors its reveal to a `stageRef` (the screen root), so the demo's
// `Component` is a small wrapper that supplies a phone-proportioned,
// `position: relative` stage with a dark scene-like backdrop, owns the
// `stageRef`, and lays a row of real dreamsigns (identified by id, never name)
// inside it. `docName` still points at the real Dreamsign so the props table
// reports its actual API. The art resolves from real dreamsign image names via
// the asset pipeline, exactly as it does on the shop / reward / deck surfaces.

import { useRef } from "react";
import { Dreamsign } from "../../components/hud/Dreamsign";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { token } from "../../primitives/tokens";
import type { TangoComponent } from "../registry";

/** Three real dreamsigns (by id). The last is shown in its bane treatment to
 * exercise the red ring + desaturation; `isBane` is a run-time state, not data. */
const DEMO_DREAMSIGNS: DreamsignData[] = [
  {
    id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
    name: "Amplified Acorn",
    imageName: "acorn_gold.png",
    imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
    isBane: false,
  },
  {
    id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
    name: "Pyramid Relic",
    imageName: "aertfact.png",
    imageAlt: "Blue-gray panel with bright red-orange branching nodes.",
    effectDescription: "The second character you play each turn costs 1● less.",
    isBane: false,
  },
  {
    id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
    name: "Amanita",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks.",
    effectDescription:
      "Once per turn, when an ally leaves play, your next character this turn costs 2● less.",
    isBane: true,
  },
];

interface DreamsignDemoArgs {
  /** Tile edge length in px (drives every tile in the row). */
  sizePx?: number;
}

function DreamsignDemo({ sizePx = 72 }: DreamsignDemoArgs) {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        position: "relative",
        width: 390,
        height: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        overflow: "hidden",
        borderRadius: token("--radius-sheet"),
        // A dark, scene-like backdrop so the tiles + reveal sit over "art".
        background:
          "radial-gradient(120% 90% at 30% 20%, #3a2a55 0%, #1a1230 45%, #0a0612 100%)",
        touchAction: "none",
      }}
    >
      {DEMO_DREAMSIGNS.map((dreamsign) => (
        <Dreamsign
          key={dreamsign.id}
          dreamsign={dreamsign}
          sizePx={sizePx}
          stageRef={stageRef}
        />
      ))}
    </div>
  );
}

export const dreamsignDemo: TangoComponent = {
  id: "dreamsign",
  title: "Dreamsign",
  blurb:
    "A dreamsign — a minor passive collectible — shown as its art floating on the scene. Hovering or pressing it reveals the full name and effect through the shared InfoCard.",
  group: "Components",
  docName: "Dreamsign",
  Component: DreamsignDemo,
  usage: [
    {
      note: "A dreamsign entity tile whose hover / press reveals its ability through InfoCard, anchored to the screen root — so pass the scene's `stageRef`. `sizePx` sets the tile edge length. The tile reads its art / ability from the `dreamsign` data (identified by id, never name).",
      code: `import { Dreamsign } from "src/tango/components/hud/Dreamsign";

<div ref={stageRef} style={{ position: "relative" }}>
  <Dreamsign dreamsign={dreamsign} sizePx={72} stageRef={stageRef} />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      sizePx: 72,
    },
  },
};
