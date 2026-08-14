// Full-screen mockup for Dreamsign — a dreamsign collection / revelation scene:
// a gallery of dreamsign tiles over a dark scene wash, each revealing its InfoCard
// `object` card (art + name + effect) on hover / press through the shared reveal
// engine. Tiles are identified by id (never name — names are not unique) and the
// art resolves from real dreamsign image assets in `public/dreamsigns/`, exactly
// as the shop / reward / deck surfaces resolve it. One tile is shown in its negative
// treatment (a desaturation), a run-time state rather than data.

import { useRef } from "react";
import { Dreamsign } from "../../components/hud/Dreamsign";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";
import { asDreamsignId } from "../../../types/identifiers";

/** A gallery of real dreamsign art assets (by id), with authored-style effects. */
const GALLERY = [
  {
    id: asDreamsignId("c706d0ba-2f41-4b14-95d8-db168ac6246c"),
    name: "Amplified Acorn",
    imageName: "acorn_gold.png",
    imageAlt: "Golden fruit-like charm with a mesh-patterned orb.",
    effectDescription:
      "Once per turn, when you discard a card, your next card this turn costs 2● less.",
  },
  {
    id: asDreamsignId("278ec1ab-f532-4862-84ae-63df5e49548c"),
    name: "Pyramid Relic",
    imageName: "aertfact.png",
    imageAlt: "Blue-gray panel with bright red-orange branching nodes.",
    effectDescription: "The second character you play each turn costs 1● less.",
  },
  {
    id: asDreamsignId("d1fdbe21-56f6-43c0-aaac-1e4683964da5"),
    name: "Bell",
    imageName: "bell.png",
    imageAlt: "A brass bell.",
    effectDescription:
      "When you play a character from your void, rematerialize it.",
  },
  {
    id: asDreamsignId("49990864-1db0-4c08-91ae-40a1f04223e4"),
    name: "Algae",
    imageName: "algae.png",
    imageAlt: "Green tangled algae fronds.",
    effectDescription:
      "Once per turn, when you draw a character, reduce its cost by 1● until end of turn.",
  },
  {
    id: asDreamsignId("d2a916c1-321a-4ae3-9a50-0b7f13c5eff6"),
    name: "Worm Apple",
    imageName: "apple.png",
    imageAlt: "A polished red apple.",
    effectDescription: "You may play ❖ and ❖❖ events for 1●.",
  },
  {
    id: asDreamsignId("6e20e6c7-295a-48b1-b252-b8b00d6902c9"),
    name: "Amanita",
    imageName: "amanita.png",
    imageAlt: "Red spotted mushroom with white flecks.",
    effectDescription:
      "Once per turn, when an ally leaves play, your next character this turn costs 2● less.",
  },
].map(localizedDreamsignFixture);

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
        gap: token("--space-3xl"),
        padding: token("--space-3xl"),
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
        <h1
          style={{
            font: token("--t-display"),
            margin: `${token("--space-xs")} 0 0`,
            color: token("--text-primary"),
          }}
        >
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
          <div key={dreamsign.id} style={{ width: 92, height: 92 }}>
            <Dreamsign dreamsign={dreamsign} />
          </div>
        ))}
      </div>
    </div>
  );
}
