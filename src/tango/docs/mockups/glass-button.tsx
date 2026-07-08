// Full-screen mockup for GlassButton tint exploration. The production
// GlassButton stays unchanged; this page uses local prototype buttons to compare
// how different hue-mixing strategies behave on the shared liquid-glass surface.

import type { CSSProperties } from "react";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlowIcon } from "../../components/controls/GlowIcon";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { controlChrome } from "../../internal/control-treatment";
import { sceneRoot } from "./scene";

const GLASS_BUTTON_HEIGHT = 42;

interface TintVariant {
  id: string;
  title: string;
  strategy: string;
  label: string;
  glyph?: Glyph;
  style: CSSProperties;
}

function baseTrigger(): CSSProperties {
  return controlChrome().trigger;
}

function makeTintedBackground(layers: string): string {
  return `${layers}, var(--glass-sheen), var(--glass-fill)`;
}

const variants: TintVariant[] = [
  {
    id: "baseline",
    title: "Baseline",
    strategy: "Current neutral glass",
    label: "Sort",
    glyph: GLYPHS.sort,
    style: {},
  },
  {
    id: "crimson-underlay",
    title: "Crimson Underlay",
    strategy: "Bright red fill below the sheen",
    label: "Discard",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "linear-gradient(180deg, rgba(255, 71, 88, 0.62), rgba(190, 18, 60, 0.46))",
      ),
      borderColor: "rgba(255, 185, 194, 0.72)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -16px 34px rgba(144, 10, 34, 0.42), 0 12px 30px rgba(190, 18, 60, 0.26)",
    },
  },
  {
    id: "ruby-rim",
    title: "Ruby Rim",
    strategy: "Red rim, red wash, and outer glow",
    label: "Cancel",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "linear-gradient(180deg, rgba(244, 63, 94, 0.28), rgba(136, 19, 55, 0.22))",
      ),
      borderColor: "rgba(255, 92, 112, 0.82)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -14px 32px rgba(225, 29, 72, 0.5), 0 0 0 1px rgba(255, 71, 88, 0.22), 0 12px 34px rgba(244, 63, 94, 0.32)",
    },
  },
  {
    id: "rose-bloom",
    title: "Rose Bloom",
    strategy: "Hot rose bloom inside red glass",
    label: "Decline",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "radial-gradient(circle at 18% 18%, rgba(255, 184, 202, 0.72), transparent 54%), linear-gradient(180deg, rgba(244, 63, 94, 0.48), rgba(159, 18, 57, 0.36))",
      ),
      borderColor: "rgba(255, 205, 213, 0.68)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -16px 34px rgba(159, 18, 57, 0.4), 0 12px 34px rgba(244, 63, 94, 0.26)",
    },
  },
  {
    id: "vermilion-smoke",
    title: "Vermilion Smoke",
    strategy: "Bright orange-red fill with warm glow",
    label: "Burn",
    glyph: GLYPHS.spark,
    style: {
      background: makeTintedBackground(
        "linear-gradient(135deg, rgba(249, 115, 22, 0.58), rgba(220, 38, 38, 0.44) 56%, rgba(255,255,255,0.05))",
      ),
      borderColor: "rgba(255, 180, 126, 0.72)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -16px 34px rgba(185, 28, 28, 0.38), 0 12px 34px rgba(249, 115, 22, 0.24)",
    },
  },
  {
    id: "danger-chip",
    title: "Danger Chip",
    strategy: "Bright red label well on a red glass body",
    label: "Banish",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "linear-gradient(180deg, rgba(244, 63, 94, 0.34), rgba(136, 19, 55, 0.28))",
      ),
      borderColor: "rgba(255, 121, 137, 0.62)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -14px 30px rgba(225, 29, 72, 0.34), 0 12px 32px rgba(190, 18, 60, 0.22)",
    },
  },
];

const mediaVariants = variants.filter((variant) =>
  ["baseline", "crimson-underlay", "ruby-rim", "rose-bloom", "danger-chip"].includes(
    variant.id,
  ),
);

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

function TintedGlassButton({
  variant,
}: {
  variant: TintVariant;
}) {
  const chrome = controlChrome();
  const triggerStyle = {
    ...baseTrigger(),
    ...variant.style,
  };
  const hasLabelWell = variant.id === "danger-chip";

  return (
    <Pressable
      as="button"
      onClick={() => {}}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: GLASS_BUTTON_HEIGHT,
        padding: "0 14px",
        boxSizing: "border-box",
        font: token("--t-body"),
        color: token("--text-on-glass"),
        whiteSpace: "nowrap",
        ...triggerStyle,
      }}
    >
      {variant.glyph !== undefined && (
        <GlowIcon
          iconClass={variant.glyph}
          color={chrome.triggerGlyphColor}
          size="1.1em"
        />
      )}
      {hasLabelWell ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 26,
            padding: "0 9px",
            borderRadius: token("--radius-pill"),
            background:
              "linear-gradient(180deg, rgba(255, 57, 76, 0.96), rgba(190, 18, 60, 0.92))",
            border: "1px solid rgba(255, 221, 226, 0.48)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px rgba(244, 63, 94, 0.42)",
          }}
        >
          {variant.label}
        </span>
      ) : (
        variant.label
      )}
    </Pressable>
  );
}

function VariantButton({ variant }: { variant: TintVariant }) {
  return variant.id === "baseline" ? (
    <GlassButton label={variant.label} glyph={variant.glyph} onPress={() => {}} />
  ) : (
    <TintedGlassButton variant={variant} />
  );
}

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
        {mediaVariants.map((variant) => (
          <VariantButton key={`${sample.id}-${variant.id}`} variant={variant} />
        ))}
      </div>
    </section>
  );
}

function VariantCard({ variant }: { variant: TintVariant }) {
  return (
    <div
      data-tint-variant={variant.id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-4"),
        padding: token("--space-5"),
        borderRadius: token("--radius-control"),
        background: "rgba(12, 8, 20, 0.58)",
        border: "1px solid rgba(255,255,255,0.13)",
        boxShadow: "0 16px 44px rgba(0,0,0,0.24)",
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", justifyContent: "center" }}>
        <VariantButton variant={variant} />
      </div>
      <div>
        <h2
          style={{
            margin: 0,
            font: token("--t-lead"),
            color: token("--text-primary"),
          }}
        >
          {variant.title}
        </h2>
        <p
          style={{
            margin: `${token("--space-2")} 0 0`,
            font: token("--t-caption"),
            color: token("--text-muted"),
          }}
        >
          {variant.strategy}
        </p>
      </div>
    </div>
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
          Glass Button Tint Study
        </p>
        <h1
          style={{
            font: token("--t-title"),
            color: token("--text-primary"),
            margin: `${token("--space-3")} 0 0`,
          }}
        >
          Red Glass Strategies
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

      <section
        data-glass-button-tint-lab
        style={{
          width: "min(100%, 980px)",
          marginTop: token("--space-7"),
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: token("--space-5"),
        }}
      >
        {variants.map((variant) => (
          <VariantCard key={variant.id} variant={variant} />
        ))}
      </section>
    </div>
  );
}
