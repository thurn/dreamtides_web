// Full-screen mockup for Dreamsign — a dreamsign collection / revelation scene:
// a gallery of dreamsign tiles over a dark scene wash, each revealing its InfoCard
// `object` card (art + name + effect) on hover / press through the shared reveal
// engine. Tiles are identified by id (never name — names are not unique) and the
// art resolves from real dreamsign image assets in `public/dreamsigns/`, exactly
// as the shop / reward / deck surfaces resolve it. One tile is shown in its bane
// treatment (red ring + desaturation), a run-time state rather than data.

import { useRef } from "react";
import { Dreamsign } from "../../components/Dreamsign";
import type { Dreamsign as DreamsignData } from "../../../types/quest";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

/** A gallery of real dreamsign art assets (by id), with authored-style effects. */
const GALLERY: DreamsignData[] = [
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
    id: "5A2C0F1E-9B44-4D77-8E21-11C0AA33BB90",
    name: "Ringing Bell",
    imageName: "bell.png",
    imageAlt: "A brass bell.",
    effectDescription: "▸ Dawn: Foresee 1.",
    isBane: false,
  },
  {
    id: "9F13D8A7-6C22-4E55-9A03-77B22DD44CE1",
    name: "Tidal Bloom",
    imageName: "algae.png",
    imageAlt: "Green tangled algae fronds.",
    effectDescription:
      "Whenever a tide rises, your first character next turn has +1✦.",
    isBane: false,
  },
  {
    id: "3D7E2B95-4411-42AA-B6C8-88E01133FA22",
    name: "Bright Apple",
    imageName: "apple.png",
    imageAlt: "A polished red apple.",
    effectDescription: "▸ Dawn: Gain 2 essence.",
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

export function DreamsignMockup() {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        ...sceneRoot,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-9"),
        padding: token("--space-9"),
        background:
          "radial-gradient(120% 90% at 30% 15%, #3a2a55 0%, #1a1230 45%, #0a0612 100%)",
        touchAction: "none",
      }}
    >
      <div style={{ textAlign: "center", pointerEvents: "none" }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: 0,
          }}
        >
          Revelation
        </p>
        <h1 style={{ font: token("--t-display"), margin: `${token("--space-3")} 0 0`, color: token("--text-primary") }}>
          Your Dreamsigns
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "clamp(16px, 4vw, 40px)",
          alignItems: "center",
          justifyContent: "center",
          maxWidth: 760,
        }}
      >
        {GALLERY.map((dreamsign) => (
          <Dreamsign
            key={dreamsign.id}
            dreamsign={dreamsign}
            sizePx={92}
            stageRef={stageRef}
          />
        ))}
      </div>

      <SceneCaption
        eyebrow="Dreamsign"
        title="A dreamsign gallery over real art; press-hold any tile to read its effect."
        corner="bottom-left"
      />
    </div>
  );
}
