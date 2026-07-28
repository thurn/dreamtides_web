// Full-screen mockup for ResourceChip — the transparent top HUD strip docked
// over real scene art, showing every economy value the game tracks (essence,
// energy, spark, points, a generic counter) as solid chip badges, plus a
// second inline row showing the same marks in their tight "value+mark" text
// form (200◆, no chip background) the way they read inside rules text or a
// reward line. Values are illustrative numbers, matching the pattern the
// JourneyStatusBar mockup already uses for its own essence figure.

import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { ResourceChip } from "../../components/hud/ResourceChip";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

export function ResourceChipMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.3) 0%, rgba(8,5,17,0.4) 45%, rgba(8,5,17,0.88) 100%), url(${dreamscapeSceneUrl("farpoint_station")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      {/* Top HUD strip — the chip variant, as it appears docked over scene art.
          Starts below the fixed "← Back" affordance MockupView overlays at
          top-left, so the two never collide. */}
      <div
        style={{
          position: "absolute",
          top: token("--space-12"),
          left: token("--space-6"),
          right: token("--space-6"),
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-4"),
        }}
      >
        <ResourceChip kind="essence" value={240} chip size="lg" spacing="loose" />
        <ResourceChip kind="energy" value={3} chip size="lg" spacing="loose" />
        <ResourceChip kind="spark" value={12} chip size="lg" spacing="loose" />
        <ResourceChip kind="points" value={1840} chip size="lg" spacing="loose" />
        <ResourceChip kind="counter" value={2} chip size="lg" spacing="loose" />
      </div>

      {/* Center stage: a reward line, showing the tight inline (non-chip) form
          exactly as it reads embedded in rules/reward text. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-5"),
            padding: `${token("--space-9")} ${token("--space-10")}`,
            background: token("--surface-chrome"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--radius-sheet"),
            boxShadow: token("--shadow-lg"),
          }}
        >
          <p
            style={{
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--accent-bright"),
              margin: 0,
            }}
          >
            Reward claimed
          </p>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: token("--space-6"),
              font: token("--t-display"),
            }}
          >
            <ResourceChip kind="essence" value={80} size="lg" />
            <span style={{ color: token("--text-faint"), fontSize: 22 }}>+</span>
            <ResourceChip kind="spark" value={2} size="lg" />
          </div>
          <p
            style={{
              font: token("--t-body"),
              color: token("--text-secondary"),
              margin: 0,
              textAlign: "center",
            }}
          >
            Essence and spark gained — tap to continue.
          </p>
        </div>
      </div>

    </div>
  );
}
