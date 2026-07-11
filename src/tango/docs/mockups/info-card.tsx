// Full-screen mockup for InfoCard — a mock HUD where several pressable objects
// each reveal one of InfoCard's media variants through the shared press /
// reveal engine and the variants on one shell.
// Each trigger anchors its card to the full-viewport stageRef so the cards clamp
// against the real screen edges. The full-bleed and object media resolve from a
// real asset in `public/` (a Dreamcaller portrait); the icon and text variants
// use tokenized glyphs, and the epithet trigger shows the text variant's
// name/epithet pairing.

import { useRef } from "react";
import { InfoCard } from "../../components/overlay/InfoCard";
import { richText } from "../../components/card/rich-text";
import { artRef } from "../../primitives/art";
import { GLYPHS, glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

interface TriggerProps {
  label: string;
  variant: string;
  glyph: string;
  card: React.ReactNode;
}

/** One pressable HUD object that reveals its InfoCard on hover / press. */
function Trigger({ label, variant, glyph, card }: TriggerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: token("--space-4") }}>
      <span
        style={{
          display: "inline-flex",
          flexDirection: "column",
          alignItems: "center",
          gap: token("--space-3"),
          width: 128,
          padding: `${token("--space-5")} ${token("--space-4")}`,
          background: token("--surface-chrome"),
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
            background: token("--badge-disc-gradient"),
            boxShadow: `inset 0 0 0 2.5px ${token("--accent")}, 0 0 14px 1px rgba(168,85,247,0.45)`,
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
      {card}
    </div>
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
          One shell, many media variants
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
          label="Dreamcaller"
          variant="fullBleed"
          glyph="bxf bx-user-circle"
          card={
            <InfoCard
              variant="fullBleed"
              image={artRef.dreamcaller("0025")}
              title="Threxan"
              subtitle="the Resounding Wrath"
              body={richText.rules("At the start of your first turn, draw a card.")}
            />
          }
        />
        <Trigger
          label="Reward"
          variant="object"
          glyph="bxf bx-gift"
          card={
            <InfoCard
              variant="object"
              frame
              image={artRef.dreamcaller("0025")}
              title="Seld Rakor"
              body={richText.rules("Whenever you Reclaim a card, deal 1 damage.")}
            />
          }
        />
        <Trigger
          label="Epithet"
          variant="text"
          glyph="bxf bx-user-circle"
          card={
            <InfoCard
              variant="text"
              title="Kragg"
              subtitle="Spent-Blood Chieftain"
              body={richText.rules(
                "At the start of your first turn, gain 1 essence.",
              )}
            />
          }
        />
        <Trigger
          label="Merchant"
          variant="icon"
          glyph="bxf bx-store-alt-2"
          card={
            <InfoCard
              variant="icon"
              glyph={glyph("bxf bx-store-alt-2")}
              title="Merchant"
              body={richText.plain(
                "Spend essence on cards, dreamsigns, and services.",
              )}
            />
          }
        />
        <Trigger
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
              leadGlyph={GLYPHS.water}
            />
          }
        />
      </div>

    </div>
  );
}
