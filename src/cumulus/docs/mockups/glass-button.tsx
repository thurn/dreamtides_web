// Full-screen A/B playground for the glass-control placement recipes. Each
// sample puts the same labeled and icon controls directly on scene media and
// inside a real glass panel so the effective tint can be judged side by side.

import { assertLocalized } from "@trox/runtime";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { GlassButton } from "../../components/controls/GlassButton";
import { IconButton } from "../../components/controls/IconButton";
import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import { sceneRoot } from "./scene";

interface MediaSample {
  id: string;
  title: string;
  scene: Parameters<typeof dreamscapeSceneUrl>[0];
  position: string;
}

const mediaSamples: MediaSample[] = [
  {
    id: "bright",
    title: "Firstlight Meadow",
    scene: "firstlight_meadow",
    position: "center",
  },
  {
    id: "cool",
    title: "Winterwake Fjords",
    scene: "winterwake_fjords",
    position: "center",
  },
  {
    id: "saturated",
    title: "Grid City",
    scene: "grid_city",
    position: "center",
  },
];

function ControlPair({ placement }: { placement: GlassControlPlacement }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-s"),
      }}
    >
      <GlassButton
        label={assertLocalized("Decline")}
        placement={placement}
        onPress={() => {}}
      />
      <IconButton
        glyph={GLYPHS.gear}
        label={assertLocalized("Settings")}
        placement={placement}
        onPress={() => {}}
      />
    </div>
  );
}

function SampleColumn({
  label,
  placement,
  glass,
  sample,
}: {
  label: string;
  placement: GlassControlPlacement;
  glass: boolean;
  sample: MediaSample;
}) {
  return (
    <div
      data-sample-placement={placement}
      style={{
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        backgroundImage: `url(${dreamscapeSceneUrl(sample.scene)})`,
        backgroundSize: "cover",
        backgroundPosition: sample.position,
        border: `1px solid ${token("--border-strong")}`,
      }}
    >
      <div
        style={{
          ...(glass
            ? {
                ...glassSurfaceStyle({ radius: token("--radius-panel") }),
                background: `${token("--glass-sheen")}, ${token("--glass-fill-popover")}`,
              }
            : {}),
          minHeight: 156,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: token("--space-l"),
          padding: token("--space-l"),
          boxSizing: "border-box",
        }}
      >
        <p
          style={{
            margin: 0,
            color: token("--text-on-glass"),
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            textAlign: "center",
            textShadow: token("--text-outline-media"),
          }}
        >
          {label}
        </p>
        <ControlPair placement={placement} />
      </div>
    </div>
  );
}

function MediaSamplePanel({
  sample,
  desktop,
}: {
  sample: MediaSample;
  desktop: boolean;
}) {
  return (
    <section
      data-media-sample={sample.id}
      style={{
        minHeight: 250,
        display: "flex",
        flexDirection: "column",
        gap: token("--space-m"),
        padding: token("--space-l"),
        boxSizing: "border-box",
        borderRadius: token("--radius-panel"),
        overflow: "hidden",
        background: token("--surface-chrome-strong"),
        border: `1px solid ${token("--border-strong")}`,
        boxShadow: token("--shadow-lg"),
      }}
    >
      <h2
        style={{
          alignSelf: "center",
          margin: 0,
          color: token("--text-on-glass"),
          font: token("--t-title-sm"),
          textShadow: token("--text-outline-media"),
        }}
      >
        {sample.title}
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: desktop ? "repeat(2, minmax(0, 1fr))" : "1fr",
          gap: token("--space-m"),
        }}
      >
        <SampleColumn
          label="Directly On Media"
          placement="onMedia"
          glass={false}
          sample={sample}
        />
        <SampleColumn
          label="Nested On Glass"
          placement="onGlass"
          glass
          sample={sample}
        />
      </div>
    </section>
  );
}

export function GlassButtonMockup() {
  const desktop = useIsDesktop();
  return (
    <div
      style={{
        ...sceneRoot,
        background: token("--bg-app"),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: desktop ? token("--space-2xl") : token("--space-s"),
        boxSizing: "border-box",
        overflow: "auto",
      }}
    >
      <header
        style={{
          width: "min(100%, 1080px)",
          marginTop: desktop ? token("--space-m") : token("--space-6xl"),
          marginBottom: token("--space-xl"),
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
          Glass Control Playground
        </p>
        <h1
          style={{
            font: token("--t-title"),
            color: token("--text-primary"),
            margin: `${token("--space-xs")} 0 0`,
          }}
        >
          Media And Glass Placement
        </h1>
      </header>

      <main
        data-glass-control-placement-lab
        style={{
          width: "min(100%, 1080px)",
          display: "flex",
          flexDirection: "column",
          gap: token("--space-m"),
          paddingBottom: token("--space-2xl"),
        }}
      >
        {mediaSamples.map((sample) => (
          <MediaSamplePanel key={sample.id} sample={sample} desktop={desktop} />
        ))}
      </main>
    </div>
  );
}
