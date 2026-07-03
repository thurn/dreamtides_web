// Full-screen mockup for Pressable — the ONE press-feedback primitive.
// Pressable has no visual language of its own (it forwards `as` and applies
// the shared scale-down), so the most honest showcase is several DIFFERENT
// pressable surfaces sharing the identical press feel: a home-screen menu of
// option tiles over real scene art. Every tile is a `<Pressable as="div">`
// wrapping its own chrome — the tiles look nothing alike, but press exactly
// alike, which is the point of having one primitive. Labels here are generic
// UI chrome (menu affordances), not game entities, so no TOML lookup applies.

import { Pressable } from "../../primitives/Pressable";
import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

interface TileSpec {
  icon: string;
  label: string;
  sub: string;
  emphasis?: boolean;
}

const TILES: TileSpec[] = [
  { icon: "bxf bx-play", label: "Continue", sub: "Resume your dream", emphasis: true },
  { icon: "bxf bx-moon", label: "New Dream", sub: "Begin a fresh run" },
  { icon: "bxf bx-grid", label: "Collection", sub: "Browse every card" },
  { icon: "bxf bx-cog", label: "Settings", sub: "Audio, controls, data" },
];

function Tile({ icon, label, sub, emphasis = false }: TileSpec) {
  return (
    <Pressable
      as="div"
      role="button"
      tabIndex={0}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-4"),
        width: "clamp(140px, 20vw, 190px)",
        padding: `${token("--space-8")} ${token("--space-5")}`,
        borderRadius: token("--r-lg"),
        border: `1px solid ${emphasis ? token("--border-accent") : token("--border-soft")}`,
        background: emphasis ? token("--gradient-accent") : token("--surface-glass"),
        boxShadow: emphasis ? token("--glow-accent-soft") : token("--shadow-md"),
      }}
    >
      <i
        className={icon}
        aria-hidden="true"
        style={{
          fontSize: 30,
          color: emphasis ? token("--text-on-accent") : token("--accent-bright"),
        }}
      />
      <span
        style={{
          font: token("--t-button"),
          color: emphasis ? token("--text-on-accent") : token("--text-primary"),
        }}
      >
        {label}
      </span>
      <span
        style={{
          font: token("--t-caption"),
          textAlign: "center",
          color: emphasis
            ? "rgba(255,255,255,0.85)"
            : token("--text-muted"),
        }}
      >
        {sub}
      </span>
    </Pressable>
  );
}

/**
 * Full-screen mockup for Pressable — a home-screen menu gallery. Four visually
 * distinct tiles (an emphasized "Continue", three plain chrome tiles) share the
 * identical press-down feedback, over real Dream Atlas scene art. Try
 * clicking/holding each — every surface compresses by the same --press-scale.
 */
export function PressableMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.45) 0%, rgba(8,5,17,0.6) 55%, rgba(8,5,17,0.92) 100%), url(${dreamscapeSceneUrl("firstlight_meadow")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-9"),
        padding: token("--space-9"),
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
          Dreamtides
        </p>
        <h1
          style={{
            font: token("--t-display"),
            margin: `${token("--space-3")} 0 0`,
            color: token("--text-primary"),
          }}
        >
          Welcome back
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-6"),
          justifyContent: "center",
        }}
      >
        {TILES.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </div>

      <SceneCaption
        eyebrow="Pressable"
        title="Four unrelated surfaces, one shared press-down feedback — click or hold any tile."
        corner="bottom-left"
      />
    </div>
  );
}
