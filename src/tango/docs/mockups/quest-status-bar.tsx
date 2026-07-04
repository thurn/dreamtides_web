// Full-screen mockup for QuestStatusBar — the transparent quest HUD docked over
// a real dreamscape backdrop. QuestStatusBar positions itself against `stageRef`
// (the screen root) and reveals its essence / Dreamcaller / dreamsign info cards
// through the shared reveal engine, so the mockup supplies a full-viewport
// scene-art stage, owns the stageRef, and lets the HUD sit at the bottom over the
// art — the `.hud-outline` legibility treatment visibly earning its keep. The
// Dreamcaller portrait and dreamsign art resolve from real assets in `public/`.

import { useRef } from "react";
import { QuestStatusBar } from "../../components/hud/QuestStatusBar";
import { dreamscapeSceneUrl, dreamsignIconUrl } from "../../components/atlas/atlas-display";
import { assetUrl } from "../../../runtime/asset-url";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

/** A Dreamcaller's character render, resolved the same way `assetUrl` resolves
 * every other binary art asset (see `src/components/DreamcallerPortrait.tsx`
 * for the production equivalent — reimplemented locally here so this
 * tango-isolated mockup never imports from `src/components/`). */
function dreamcallerPortraitUrl(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

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
          name: "Threxan",
          epithet: "the Resounding Wrath",
          portrait: dreamcallerPortraitUrl("0025"),
          ability: "At the start of your first turn, draw a card.",
        }}
        dreamsigns={[
          {
            id: "C706D0BA-2F41-4B14-95D8-DB168AC6246C",
            name: "Amplified Acorn",
            art: dreamsignIconUrl("acorn_gold.png"),
            ability:
              "Once per turn, when you discard a card, your next card this turn costs 2● less.",
          },
          {
            id: "278EC1AB-F532-4862-84AE-63DF5E49548C",
            name: "Pyramid Relic",
            art: dreamsignIconUrl("aertfact.png"),
            ability: "The second character you play each turn costs 1● less.",
          },
          {
            id: "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5",
            name: "Bell",
            art: dreamsignIconUrl("bell.png"),
            ability:
              "When you play a character from your void, rematerialize it.",
          },
        ]}
      />

    </div>
  );
}
