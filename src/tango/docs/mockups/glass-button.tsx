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
    strategy: "Transparent red fill below the sheen",
    label: "Discard",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "linear-gradient(180deg, rgba(220, 54, 68, 0.24), rgba(110, 14, 28, 0.14))",
      ),
      borderColor: "rgba(255, 156, 166, 0.28)",
    },
  },
  {
    id: "ruby-rim",
    title: "Ruby Rim",
    strategy: "Neutral fill with colored rim and inner glow",
    label: "Cancel",
    glyph: GLYPHS.close,
    style: {
      borderColor: "rgba(255, 112, 124, 0.42)",
      boxShadow:
        "inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -12px 28px rgba(170, 20, 42, 0.18), 0 10px 28px rgba(15, 7, 18, 0.4)",
    },
  },
  {
    id: "rose-bloom",
    title: "Rose Bloom",
    strategy: "Radial color bloom inside neutral glass",
    label: "Decline",
    glyph: GLYPHS.close,
    style: {
      background: makeTintedBackground(
        "radial-gradient(circle at 18% 18%, rgba(255, 135, 157, 0.34), transparent 52%), linear-gradient(180deg, rgba(180, 30, 58, 0.14), rgba(95, 12, 38, 0.1))",
      ),
      borderColor: "rgba(255, 185, 196, 0.3)",
    },
  },
  {
    id: "vermilion-smoke",
    title: "Vermilion Smoke",
    strategy: "Warmer orange-red mixed lightly into the fill",
    label: "Burn",
    glyph: GLYPHS.spark,
    style: {
      background: makeTintedBackground(
        "linear-gradient(135deg, rgba(236, 88, 42, 0.2), rgba(132, 23, 35, 0.12) 56%, rgba(255,255,255,0.03))",
      ),
      borderColor: "rgba(255, 168, 126, 0.3)",
    },
  },
  {
    id: "danger-chip",
    title: "Danger Chip",
    strategy: "Small red well behind the label, glass body intact",
    label: "Banish",
    glyph: GLYPHS.close,
    style: {},
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
              "linear-gradient(180deg, rgba(210, 37, 54, 0.72), rgba(124, 15, 30, 0.62))",
            border: "1px solid rgba(255, 176, 184, 0.22)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18)",
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
        {variant.id === "baseline" ? (
          <GlassButton
            label={variant.label}
            glyph={variant.glyph}
            onPress={() => {}}
          />
        ) : (
          <TintedGlassButton variant={variant} />
        )}
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
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.26) 0%, rgba(8,5,17,0.54) 52%, rgba(8,5,17,0.9) 100%), url(${dreamscapeSceneUrl("rust_expanse")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
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
        data-glass-button-tint-lab
        style={{
          width: "min(100%, 980px)",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
          gap: token("--space-5"),
        }}
      >
        {variants.map((variant) => (
          <VariantCard key={variant.id} variant={variant} />
        ))}
      </main>
    </div>
  );
}
