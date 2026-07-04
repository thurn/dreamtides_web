// Full-screen mockup for InfoCard — a mock HUD where several pressable objects
// each reveal one of InfoCard's four media variants through the shared press /
// hover reveal engine (InfoCard.PressInfo + the four variants on one shell).
// Each trigger anchors its card to the full-viewport stageRef so the cards clamp
// against the real screen edges. The object/hero media resolve from real assets
// in `public/` (a Dreamcaller portrait, a dreamscape scene); the icon and text
// variants use tokenized glyphs.

import { useRef } from "react";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
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

interface TriggerProps {
  stageRef: React.RefObject<HTMLDivElement | null>;
  label: string;
  variant: string;
  glyph: string;
  card: React.ReactNode;
}

/** One pressable HUD object that reveals its InfoCard on hover / press. */
function Trigger({ stageRef, label, variant, glyph, card }: TriggerProps) {
  const { PressInfo } = InfoCard;
  return (
    <PressInfo stageRef={stageRef} card={card} holdStillClicks>
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: token("--space-3"),
          width: 128,
          padding: `${token("--space-5")} ${token("--space-4")}`,
          background: token("--surface-glass"),
          border: `1px solid ${token("--border-soft")}`,
          borderRadius: token("--radius-panel"),
          cursor: "pointer",
        }}
      >
        <span
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            ...InfoCard.SITE_DISC,
          }}
        >
          <i
            className={glyph}
            aria-hidden="true"
            style={{ fontSize: 24, color: token("--text-on-accent") }}
          />
        </span>
        <span style={{ font: token("--t-button-sm"), color: token("--text-primary") }}>
          {label}
        </span>
        <span
          style={{
            font: token("--t-popover-meta"),
            letterSpacing: ".12em",
            textTransform: "uppercase",
            color: token("--text-faint"),
          }}
        >
          {variant}
        </span>
      </span>
    </PressInfo>
  );
}

export function InfoCardMockup() {
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
        gap: token("--space-10"),
        padding: token("--space-9"),
        background:
          "radial-gradient(120% 90% at 50% 20%, #2c2450 0%, #160f2a 50%, #080512 100%)",
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
          One shell, four media variants
        </p>
        <h1 style={{ font: token("--t-display"), margin: `${token("--space-3")} 0 0`, color: token("--text-primary") }}>
          Press to reveal
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-6"),
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        <Trigger
          stageRef={stageRef}
          label="Dreamcaller"
          variant="object"
          glyph="bxf bx-user-circle"
          card={
            <InfoCard
              variant="object"
              frame
              image={dreamcallerPortraitUrl("0025")}
              title="Threxan, the Resounding Wrath"
              body={richText.rules("At the start of your first turn, draw a card.")}
            />
          }
        />
        <Trigger
          stageRef={stageRef}
          label="Dreamscape"
          variant="hero"
          glyph="bxf bx-map"
          card={
            <InfoCard
              variant="hero"
              image={dreamscapeSceneUrl("pharaohs_gate")}
              meta="Layer IV"
              title="Pharaoh's Gate"
              body={richText.plain(
                "A sun-scoured dream of buried kings and restless sand.",
              )}
            />
          }
        />
        <Trigger
          stageRef={stageRef}
          label="Merchant"
          variant="icon"
          glyph="bxf bx-store-alt-2"
          card={
            <InfoCard
              variant="icon"
              glyph="bxf bx-store-alt-2"
              title="Merchant"
              body={richText.plain(
                "Spend essence on cards, dreamsigns, and services.",
              )}
            />
          }
        />
        <Trigger
          stageRef={stageRef}
          label="Essence"
          variant="text"
          glyph="bxf bx-water"
          card={
            <InfoCard
              variant="text"
              meta="Resource"
              title="Essence"
              body={richText.plain(
                "The dream's currency — spent to draft cards and buy from merchants.",
              )}
              leadGlyph="bxf bx-water"
            />
          }
        />
      </div>

    </div>
  );
}
