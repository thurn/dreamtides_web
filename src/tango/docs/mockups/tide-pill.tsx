// Full-screen mockup for TidePill — a Draft Pool screen: the three real
// construction roles the `tides4` pool algorithm actually uses (Signature /
// Theme / Broad — see the debug Pool Viewer's own `TIDE_SELECTION_META`
// labels) grouping real tide `displayName` values pulled from
// `data/tides4.jsonc` (the player-facing narrative name baked for each tide,
// shown on the real Dreamcaller-select / pool-viewer / "why this card"
// screens per that file's schema docs). `tide` is TidePill's own
// presentation prop naming one of the five tides — there is no tide→identity
// mapping in production data, so each pill is assigned a tide purely to
// demonstrate the palette, not to assert a fabricated identity for that record.

import { useRef } from "react";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { TidePill, type Tide } from "../../components/hud/TidePill";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

interface TideEntry {
  id: string;
  displayName: string;
  description: string;
  tide: Tide;
}

interface RoleGroup {
  role: string;
  blurb: string;
  tides: TideEntry[];
}

// Real tide records — id + displayName — from data/tides4.jsonc. The
// descriptions are illustrative flavor for the mockup's InfoCard reveals.
const GROUPS: RoleGroup[] = [
  {
    role: "Signature",
    blurb: "Your Dreamcaller's own tide — always joined.",
    tides: [
      {
        id: "tide-sig-10",
        displayName: "Singular Storm",
        description:
          "A tide of sudden, singular force — one overwhelming swell rather than a steady current.",
        tide: "shadow",
      },
    ],
  },
  {
    role: "Theme",
    blurb: "Facet tides carrying a Dreamcaller's themes.",
    tides: [
      {
        id: "tide-fac-03",
        displayName: "The Worldbreaker",
        description:
          "The tide of endings — cards and characters that trade the board away for a decisive break.",
        tide: "ember",
      },
      {
        id: "tide-fac-05",
        displayName: "Teeming Thicket",
        description:
          "A verdant, crowding tide — wide, cheap swarms that fill the board faster than they can be cleared.",
        tide: "wild",
      },
      {
        id: "tide-fac-06",
        displayName: "The Shifting Tide",
        description:
          "A tide that never settles — cards that transform, relocate, and rewrite what is already in play.",
        tide: "vision",
      },
    ],
  },
  {
    role: "Broad",
    blurb: "Neutral tides that top up any pool until it is full.",
    tides: [
      {
        id: "tide-neu-01",
        displayName: "The Undertow",
        description:
          "The quiet pull beneath the surface — value that accrues turn over turn until it drags the game under.",
        tide: "vision",
      },
      {
        id: "tide-neu-03",
        displayName: "Rising Power",
        description:
          "A tide that only grows — each turn spent building leaves you stronger than the last.",
        tide: "valor",
      },
      {
        id: "tide-neu-04",
        displayName: "March of the Mighty",
        description:
          "The advance of heavy things — expensive, unstoppable characters that close a game outright.",
        tide: "ember",
      },
    ],
  },
];

export function TidePillMockup() {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={stageRef}
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.55) 0%, rgba(8,5,17,0.72) 55%, rgba(8,5,17,0.95) 100%), url(${dreamscapeSceneUrl("tsukiren")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: token("--space-9"),
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div style={{ textAlign: "center", marginTop: token("--space-4") }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: 0,
          }}
        >
          Draft Pool
        </p>
        <h1 style={{ font: token("--t-display"), margin: `${token("--space-3")} 0 0`, color: token("--text-primary") }}>
          Tides by Construction Role
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: token("--space-7"),
          width: "min(640px, 94vw)",
          marginTop: token("--space-8"),
        }}
      >
        {GROUPS.map((group) => (
          <div
            key={group.role}
            style={{
              padding: token("--space-6"),
              background: token("--surface-chrome"),
              border: `1px solid ${token("--border-soft")}`,
              borderRadius: token("--radius-panel"),
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: token("--space-4"), marginBottom: token("--space-4") }}>
              <span
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  textTransform: "uppercase",
                  color: token("--text-primary"),
                }}
              >
                {group.role}
              </span>
              <span style={{ font: token("--t-caption"), color: token("--text-muted") }}>{group.blurb}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-3") }}>
              {group.tides.map((tide) => (
                <TidePill
                  key={tide.id}
                  tide={tide.tide}
                  label={tide.displayName}
                  description={tide.description}
                  stageRef={stageRef}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
