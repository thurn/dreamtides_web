// Full-screen mockup for GlassButton — the official default and danger glass
// treatments over real scene media, so the backdrop blur and red rim/glow can
// be judged against warm, cold, and saturated backgrounds.

import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { GlassButton } from "../../components/controls/GlassButton";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

interface MediaSample {
  id: string;
  title: string;
  scene: Parameters<typeof dreamscapeSceneUrl>[0];
  position: string;
}

const mediaSamples: MediaSample[] = [
  {
    id: "warm",
    title: "Rust Expanse",
    scene: "rust_expanse",
    position: "center",
  },
  {
    id: "cool",
    title: "Winterwake Fjords",
    scene: "winterwake_fjords",
    position: "center",
  },
  {
    id: "neon",
    title: "Grid City",
    scene: "grid_city",
    position: "center",
  },
];

function MediaSamplePanel({ sample }: { sample: MediaSample }) {
  return (
    <section
      data-media-sample={sample.id}
      style={{
        minHeight: 236,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: token("--space-7"),
        padding: token("--space-6"),
        boxSizing: "border-box",
        borderRadius: token("--radius-panel"),
        overflow: "hidden",
        backgroundImage: `url(${dreamscapeSceneUrl(sample.scene)})`,
        backgroundSize: "cover",
        backgroundPosition: sample.position,
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 18px 46px rgba(0,0,0,0.3)",
      }}
    >
      <h2
        style={{
          alignSelf: "flex-start",
          margin: 0,
          padding: `${token("--space-2")} ${token("--space-4")}`,
          borderRadius: token("--radius-pill"),
          background: "rgba(8, 5, 17, 0.48)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: token("--text-primary"),
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
        }}
      >
        {sample.title}
      </h2>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: token("--space-4"),
        }}
      >
        <GlassButton label="Sort" glyph={GLYPHS.sort} onPress={() => {}} />
        <GlassButton
          label="Decline Offer"
          glyph={GLYPHS.close}
          variant="danger"
          onPress={() => {}}
        />
      </div>
    </section>
  );
}

export function GlassButtonMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        background: token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: token("--space-8"),
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <header
        style={{
          width: "min(100%, 980px)",
          marginTop: token("--space-5"),
          marginBottom: token("--space-7"),
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
          Glass Button
        </p>
        <h1
          style={{
            font: token("--t-title"),
            color: token("--text-primary"),
            margin: `${token("--space-3")} 0 0`,
          }}
        >
          Default And Danger Variants
        </h1>
      </header>

      <main
        data-glass-button-media-lab
        style={{
          width: "min(100%, 980px)",
          display: "flex",
          flexDirection: "column",
          gap: token("--space-5"),
        }}
      >
        {mediaSamples.map((sample) => (
          <MediaSamplePanel key={sample.id} sample={sample} />
        ))}
      </main>
    </div>
  );
}
