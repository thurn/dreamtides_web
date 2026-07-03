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
    id: "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5",
    name: "Bell",
    imageName: "bell.png",
    imageAlt: "A brass bell.",
    effectDescription:
      "When you play a character from your void, rematerialize it.",
    isBane: false,
  },
  {
    id: "49990864-1DB0-4C08-91AE-40A1F04223E4",
    name: "Algae",
    imageName: "algae.png",
    imageAlt: "Green tangled algae fronds.",
    effectDescription:
      "Once per turn, when you draw a character, reduce its cost by 1● until end of turn.",
    isBane: false,
  },
  {
    id: "D2A916C1-321A-4AE3-9A50-0B7F13C5EFF6",
    name: "Worm Apple",
    imageName: "apple.png",
    imageAlt: "A polished red apple.",
    effectDescription: "You may play ❖ and ❖❖ events for 1●.",
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
