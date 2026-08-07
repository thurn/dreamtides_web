// Registry demo for Dreamsign — the dreamsign entity tile whose hover / press
// reveal routes through InfoCard's `object` variant. The demo supplies a
// phone-proportioned scene-like stage and caller-owned square wrappers for a
// row of real dreamsigns (identified by id, never name). `docName` still points
// at the real Dreamsign so the props table reports its actual API.

import { Dreamsign } from "../../components/hud/Dreamsign";
import type { Dreamsign as DreamsignData } from "../../../types/journey";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** Three real dreamsigns, identified by UUID. */
const DEMO_DREAMSIGNS: DreamsignData[] = [
  {
    id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
    name: "Amplified Acorn",
    imageName: "acorn_gold.png",
    imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
  },
  {
    id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
    name: "Pyramid Relic",
    imageName: "aertfact.png",
    imageAlt: "Blue-gray panel with bright red-orange branching nodes.",
    effectDescription: "The second character you play each turn costs 1● less.",
  },
  {
    id: "6E20E6C7-295A-48B1-B252-B8B00D6902C9",
    name: "Amanita",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks.",
    effectDescription:
      "Once per turn, when an ally leaves play, your next character this turn costs 2● less.",
  },
];

interface DreamsignDemoArgs {
  /** Tile material: `flat` (chrome-free) or `hud` (drop-shadow + violet glow). */
  variant?: "flat" | "hud";
}

function DreamsignDemo({ variant = "hud" }: DreamsignDemoArgs) {
  return (
    <div
      style={{
        position: "relative",
        width: 390,
        height: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        overflow: "hidden",
        borderRadius: token("--radius-large"),
        // A dark, scene-like backdrop so the tiles + reveal sit over "art".
        background:
          "radial-gradient(120% 90% at 30% 20%, #3a2a55 0%, #1a1230 45%, #0a0612 100%)",
        touchAction: "none",
      }}
    >
      {DEMO_DREAMSIGNS.map((dreamsign) => (
        <div key={dreamsign.id} style={{ width: 72, height: 72 }}>
          <Dreamsign dreamsign={dreamsign} variant={variant} />
        </div>
      ))}
    </div>
  );
}

export const dreamsignDemo: CumulusComponent = {
  id: "dreamsign",
  title: "Dreamsign",
  blurb:
    "A dreamsign — a minor passive collectible — shown as its art floating on the scene. Hovering or pressing it reveals the full name and effect through the shared InfoCard, including the unified mobile width and typography treatment.",
  group: "Components",
  docName: "Dreamsign",
  Component: DreamsignDemo,
  usage: [
    {
      note: "A dreamsign entity tile whose hover / press reveals its ability through InfoCard. Its caller owns the square layout wrapper; the tile reads its art and ability from UUID-identified `dreamsign` data.",
      code: `import { Dreamsign } from "src/cumulus/components/hud/Dreamsign";

<div style={{ width: 72, height: 72 }}>
  <Dreamsign dreamsign={dreamsign} />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "hud",
    },
  },
};
