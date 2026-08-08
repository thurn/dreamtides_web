// Full-screen mockup for JourneyStatusBar — the transparent journey HUD docked over
// a real dreamscape backdrop. JourneyStatusBar positions itself against `stageRef`
// (the screen root) and reveals its essence / DreamAvatar / dreamsign info cards
// through the shared reveal engine, so the mockup supplies a full-viewport
// scene-art stage, owns the stageRef, and lets the HUD sit at the bottom over the
// art — the `.hud-outline` legibility treatment visibly earning its keep. The
// DreamAvatar portrait and dreamsign art resolve from real assets in `public/`.

import { useRef } from "react";
import { JourneyStatusBar } from "../../components/hud/JourneyStatusBar";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { artRef } from "../../primitives/art";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

export function JourneyStatusBarMockup() {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.25) 0%, rgba(8,5,17,0.35) 55%, rgba(8,5,17,0.85) 100%), url(${dreamscapeSceneUrl("frostforge")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        touchAction: "none",
      }}
    >
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
        <div style={{ font: token("--t-title"), color: token("--text-primary") }}>
          Frostforge
        </div>
        <div style={{ font: token("--t-caption"), color: token("--text-secondary"), marginTop: token("--space-xs") }}>
          Press essence, the DreamAvatar, or a dreamsign to read it.
        </div>
      </div>

      <JourneyStatusBar
        size="grand"
        stageRef={stageRef}
        essence={240}
        deck={23}
        dreamAvatar={{
          id: "00000000-0000-4000-8000-000000000051",
          name: "Threxan",
          epithet: "the Resounding Wrath",
          portrait: artRef.dreamAvatar("0025"),
          ability: "At the start of your first turn, draw a card.",
        }}
        dreamsigns={[
          {
            id: "c706d0ba-2f41-4b14-95d8-db168ac6246c",
            name: "Amplified Acorn",
            imageName: "acorn_gold.png",
            effectDescription:
              "Once per turn, when you discard a card, your next card this turn costs 2● less.",
          },
          {
            id: "278ec1ab-f532-4862-84ae-63df5e49548c",
            name: "Pyramid Relic",
            imageName: "aertfact.png",
            effectDescription:
              "The second character you play each turn costs 1● less.",
          },
          {
            id: "d1fdbe21-56f6-43c0-aaac-1e4683964da5",
            name: "Bell",
            imageName: "bell.png",
            effectDescription:
              "When you play a character from your void, rematerialize it.",
          },
        ]}
      />

    </div>
  );
}
