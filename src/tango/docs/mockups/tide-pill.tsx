// Full-screen mockup for TidePill — a Draft Pool screen: the three real
// construction roles the `tides4` pool algorithm actually uses (Signature /
// Theme / Broad — see the debug Pool Viewer's own `TIDE_SELECTION_META`
// labels) grouping real tide `displayName` values pulled from
// `data/tides4.jsonc` (the player-facing narrative name baked for each tide,
// shown on the real Dreamcaller-select / pool-viewer / "why this card"
// screens per that file's schema docs). `tone` is TidePill's own
// presentation-only prop — there is no tide→tone mapping in production data,
// so each pill is assigned a distinct tone purely to demonstrate the full
// palette, not to assert a fabricated color identity for that tide.

import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { TidePill, type TidePillProps } from "../../components/TidePill";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

interface TideEntry {
  id: string;
  displayName: string;
  tone: NonNullable<TidePillProps["tone"]>;
}

interface RoleGroup {
  role: string;
  blurb: string;
  tides: TideEntry[];
}

// Real tide records — id + displayName — from data/tides4.jsonc.
const GROUPS: RoleGroup[] = [
  {
    role: "Signature",
    blurb: "Your Dreamcaller's own tide — always joined.",
    tides: [{ id: "tide-sig-10", displayName: "Singular Storm", tone: "violet" }],
  },
  {
    role: "Theme",
    blurb: "Facet tides carrying a Dreamcaller's themes.",
    tides: [
      { id: "tide-fac-03", displayName: "The Worldbreaker", tone: "gold" },
      { id: "tide-fac-05", displayName: "Teeming Thicket", tone: "green" },
      { id: "tide-fac-06", displayName: "The Shifting Tide", tone: "neutral" },
    ],
  },
  {
    role: "Broad",
    blurb: "Neutral tides that top up any pool until it is full.",
    tides: [
      { id: "tide-neu-01", displayName: "The Undertow", tone: "blue" },
      { id: "tide-neu-03", displayName: "Rising Power", tone: "rust" },
      { id: "tide-neu-04", displayName: "March of the Mighty", tone: "red" },
    ],
  },
];

export function TidePillMockup() {
  return (
    <div
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
              background: token("--surface-glass"),
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
                <TidePill key={tide.id} tone={tide.tone} icon={<i className="bxf bx-water" />}>
                  {tide.displayName}
                </TidePill>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SceneCaption
        eyebrow="Tide Pill"
        title="Real tide displayName values from data/tides4.jsonc, each shown under its real construction role: Signature, Theme (facet), or Broad (neutral)."
        corner="bottom-left"
      />
    </div>
  );
}
