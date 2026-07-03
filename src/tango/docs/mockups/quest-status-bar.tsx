// Full-screen mockup for QuestStatusBar — the transparent quest HUD docked over
// a real dreamscape backdrop. QuestStatusBar positions itself against `stageRef`
// (the screen root) and reveals its essence / Dreamcaller / dreamsign info cards
// through the shared reveal engine, so the mockup supplies a full-viewport
// scene-art stage, owns the stageRef, and lets the HUD sit at the bottom over the
// art — the `.hud-outline` legibility treatment visibly earning its keep. The
// Dreamcaller portrait and dreamsign art resolve from real assets in `public/`.

import { useRef } from "react";
import { QuestStatusBar } from "../../components/QuestStatusBar";
import {
  dreamscapeSceneUrl,
  dreamsignIconUrl,
  guidePortraitUrl,
} from "../../components/atlas-display";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

export function QuestStatusBarMockup() {
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
          top: token("--space-8"),
          left: 0,
          right: 0,
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ font: token("--t-title"), color: token("--text-primary") }}>
          Frostforge
        </div>
        <div style={{ font: token("--t-caption"), color: token("--text-secondary"), marginTop: token("--space-2") }}>
          Press essence, the Dreamcaller, or a dreamsign to read it.
        </div>
      </div>

      <QuestStatusBar
        stageRef={stageRef}
        essence={240}
        deck={23}
        elevation={12}
        signElevation={12}
        dreamcaller={{
          name: "Aldric",
          epithet: "the Seer",
          portrait: guidePortraitUrl("aldric_the_seer"),
          ability:
            "Whenever you foresee, draw a card. ▸ Dawn: Gain 2 essence.",
        }}
        dreamsigns={[
          {
            id: "sign-acorn",
            name: "Amplified Acorn",
            art: dreamsignIconUrl("acorn_gold.png"),
            ability:
              "Once per turn, when you discard a card, your next card this turn costs 2● less.",
          },
          {
            id: "sign-relic",
            name: "Pyramid Relic",
            art: dreamsignIconUrl("aertfact.png"),
            ability: "The second character you play each turn costs 1● less.",
          },
          {
            id: "sign-bell",
            name: "Ringing Bell",
            art: dreamsignIconUrl("bell.png"),
            ability: "▸ Dawn: Foresee 1.",
          },
        ]}
      />

      <SceneCaption
        eyebrow="Quest Status Bar"
        title="The transparent HUD docked over real scene art, with press-to-read info cards."
        corner="top-left"
      />
    </div>
  );
}
