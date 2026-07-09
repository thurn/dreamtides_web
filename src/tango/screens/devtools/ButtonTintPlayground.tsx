import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { GlowIcon } from "../../components/controls/GlowIcon";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { controlChrome } from "../../internal/control-treatment";

const BUTTON_HEIGHT = 42;

type BackgroundId = "rust" | "winter" | "grid";

interface MediaBackground {
  id: BackgroundId;
  title: string;
  scene: string;
  position: string;
}

interface TintSettings {
  fillAlpha: number;
  neutralAlpha: number;
  borderAlpha: number;
  glowAlpha: number;
  blur: number;
  saturation: number;
  labelChipAlpha: number;
}

interface Preset {
  id: string;
  title: string;
  note: string;
  settings: TintSettings;
  labelChip?: boolean;
}

const backgrounds: MediaBackground[] = [
  {
    id: "rust",
    title: "Warm Rust",
    scene: "rust_expanse",
    position: "center",
  },
  {
    id: "winter",
    title: "Cold Blue",
    scene: "winterwake_fjords",
    position: "center",
  },
  {
    id: "grid",
    title: "Neon City",
    scene: "grid_city",
    position: "center",
  },
];

const defaultSettings: TintSettings = {
  fillAlpha: 0.22,
  neutralAlpha: 0.4,
  borderAlpha: 0.88,
  glowAlpha: 0.34,
  blur: 18,
  saturation: 1.7,
  labelChipAlpha: 0,
};

const presets: Preset[] = [
  {
    id: "border",
    title: "Red Border",
    note: "Neutral glass body, obvious danger rim.",
    settings: {
      fillAlpha: 0.02,
      neutralAlpha: 0.46,
      borderAlpha: 0.94,
      glowAlpha: 0.16,
      blur: 18,
      saturation: 1.7,
      labelChipAlpha: 0,
    },
  },
  {
    id: "rim",
    title: "Rim Glow",
    note: "Keeps backdrop visibility with stronger red edges.",
    settings: {
      fillAlpha: 0.12,
      neutralAlpha: 0.38,
      borderAlpha: 0.92,
      glowAlpha: 0.44,
      blur: 20,
      saturation: 1.8,
      labelChipAlpha: 0,
    },
  },
  {
    id: "wash",
    title: "Glass Wash",
    note: "A readable red body with some media still visible.",
    settings: {
      fillAlpha: 0.28,
      neutralAlpha: 0.32,
      borderAlpha: 0.78,
      glowAlpha: 0.3,
      blur: 22,
      saturation: 1.8,
      labelChipAlpha: 0,
    },
  },
  {
    id: "chip",
    title: "Label Chip",
    note: "Neutral glass plus a bright red semantic payload.",
    settings: {
      fillAlpha: 0.04,
      neutralAlpha: 0.42,
      borderAlpha: 0.7,
      glowAlpha: 0.18,
      blur: 18,
      saturation: 1.7,
      labelChipAlpha: 0.96,
    },
    labelChip: true,
  },
];

function alpha(value: number): string {
  return value.toFixed(2);
}

function redFill(opacity: number): string {
  return `rgba(244, 43, 72, ${alpha(opacity)})`;
}

function redDeep(opacity: number): string {
  return `rgba(150, 12, 35, ${alpha(opacity)})`;
}

function redBright(opacity: number): string {
  return `rgba(255, 111, 130, ${alpha(opacity)})`;
}

function prototypeStyle(settings: TintSettings): CSSProperties {
  const chrome = controlChrome().trigger;
  const neutral = `rgba(22, 14, 32, ${alpha(settings.neutralAlpha)})`;
  const redTop = redFill(settings.fillAlpha);
  const redBottom = redDeep(settings.fillAlpha * 0.84);
  const blurBackdrop = `blur(${String(settings.blur)}px) saturate(${settings.saturation.toFixed(1)})`;
  return {
    ...chrome,
    background: `linear-gradient(180deg, ${redTop}, ${redBottom}), var(--glass-sheen), ${neutral}`,
    backdropFilter: blurBackdrop,
    WebkitBackdropFilter: blurBackdrop,
    borderColor: redBright(settings.borderAlpha),
    boxShadow: [
      "inset 0 1px 0 rgba(255,255,255,0.28)",
      `inset 0 -14px 30px ${redDeep(settings.fillAlpha * 0.8)}`,
      `0 0 0 1px ${redFill(settings.borderAlpha * 0.22)}`,
      `0 14px 36px ${redFill(settings.glowAlpha)}`,
    ].join(", "),
  };
}

function PrototypeButton({
  label,
  glyph,
  settings,
  labelChip = false,
}: {
  label: string;
  glyph: Glyph;
  settings: TintSettings;
  labelChip?: boolean;
}) {
  const chrome = controlChrome();
  const showChip = labelChip || settings.labelChipAlpha > 0.05;
  return (
    <Pressable
      as="button"
      onClick={() => {}}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        height: BUTTON_HEIGHT,
        padding: "0 14px",
        boxSizing: "border-box",
        font: token("--t-body"),
        color: token("--text-on-glass"),
        whiteSpace: "nowrap",
        ...prototypeStyle(settings),
      }}
    >
      <GlowIcon
        iconClass={glyph}
        color={chrome.triggerGlyphColor}
        size="1.1em"
      />
      {showChip ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 26,
            padding: "0 9px",
            borderRadius: token("--radius-pill"),
            background: `linear-gradient(180deg, ${redFill(settings.labelChipAlpha)}, ${redDeep(settings.labelChipAlpha * 0.96)})`,
            border: `1px solid ${redBright(settings.labelChipAlpha * 0.74)}`,
            boxShadow: `inset 0 1px 0 rgba(255,255,255,0.3), 0 0 18px ${redFill(settings.labelChipAlpha * 0.42)}`,
          }}
        >
          {label}
        </span>
      ) : (
        label
      )}
    </Pressable>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label
      style={{
        display: "grid",
        gridTemplateColumns: "116px 1fr 44px",
        alignItems: "center",
        gap: 10,
        font: token("--t-caption"),
        color: token("--text-secondary"),
      }}
    >
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
      <span style={{ color: token("--text-primary"), textAlign: "right" }}>
        {value.toFixed(step < 1 ? 2 : 0)}
      </span>
    </label>
  );
}

function TweaksPanel({
  settings,
  setSettings,
  activeBackground,
  setActiveBackground,
}: {
  settings: TintSettings;
  setSettings: (settings: TintSettings) => void;
  activeBackground: BackgroundId;
  setActiveBackground: (id: BackgroundId) => void;
}) {
  const update = (key: keyof TintSettings, value: number) => {
    setSettings({ ...settings, [key]: value });
  };
  return (
    <aside
      style={{
        position: "sticky",
        top: 18,
        flex: "1 1 300px",
        maxWidth: 360,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: 18,
        borderRadius: 14,
        background: "rgba(10, 7, 18, 0.84)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 18px 50px rgba(0,0,0,0.34)",
        color: token("--text-primary"),
      }}
    >
      <div>
        <p
          style={{
            margin: 0,
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
          }}
        >
          Tweaks
        </p>
        <h1 style={{ margin: "6px 0 0", font: token("--t-title-sm") }}>
          Red Glass Button
        </h1>
      </div>

      <label
        style={{
          display: "grid",
          gap: 8,
          font: token("--t-caption"),
          color: token("--text-secondary"),
        }}
      >
        Focus Background
        <select
          value={activeBackground}
          onChange={(event) =>
            setActiveBackground(event.currentTarget.value as BackgroundId)
          }
          style={{
            minHeight: 36,
            borderRadius: 8,
            padding: "0 10px",
            background: "rgba(255,255,255,0.1)",
            color: token("--text-primary"),
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          {backgrounds.map((background) => (
            <option key={background.id} value={background.id}>
              {background.title}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        <Slider
          label="Red Fill"
          min={0}
          max={0.72}
          step={0.01}
          value={settings.fillAlpha}
          onChange={(value) => update("fillAlpha", value)}
        />
        <Slider
          label="Neutral Base"
          min={0}
          max={0.64}
          step={0.01}
          value={settings.neutralAlpha}
          onChange={(value) => update("neutralAlpha", value)}
        />
        <Slider
          label="Border"
          min={0}
          max={1}
          step={0.01}
          value={settings.borderAlpha}
          onChange={(value) => update("borderAlpha", value)}
        />
        <Slider
          label="Glow"
          min={0}
          max={0.8}
          step={0.01}
          value={settings.glowAlpha}
          onChange={(value) => update("glowAlpha", value)}
        />
        <Slider
          label="Blur"
          min={0}
          max={34}
          step={1}
          value={settings.blur}
          onChange={(value) => update("blur", value)}
        />
        <Slider
          label="Saturation"
          min={1}
          max={2.4}
          step={0.1}
          value={settings.saturation}
          onChange={(value) => update("saturation", value)}
        />
        <Slider
          label="Label Chip"
          min={0}
          max={1}
          step={0.01}
          value={settings.labelChipAlpha}
          onChange={(value) => update("labelChipAlpha", value)}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => setSettings(preset.settings)}
            style={{
              minHeight: 34,
              padding: "0 10px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.16)",
              background: "rgba(255,255,255,0.08)",
              color: token("--text-primary"),
              font: token("--t-caption"),
            }}
          >
            {preset.title}
          </button>
        ))}
      </div>

      <pre
        style={{
          margin: 0,
          padding: 12,
          borderRadius: 8,
          overflow: "auto",
          background: "rgba(0,0,0,0.28)",
          color: token("--text-muted"),
          font: token("--t-caption"),
        }}
      >
        {JSON.stringify(settings, null, 2)}
      </pre>
    </aside>
  );
}

function MediaPanel({
  background,
  settings,
  showOnlyCustom = false,
}: {
  background: MediaBackground;
  settings: TintSettings;
  showOnlyCustom?: boolean;
}) {
  return (
    <section
      {...(showOnlyCustom
        ? { "data-playground-focus": background.id }
        : { "data-playground-media": background.id })}
      style={{
        minHeight: showOnlyCustom ? 360 : 250,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 26,
        padding: 24,
        borderRadius: 16,
        overflow: "hidden",
        backgroundImage: `url(${dreamscapeSceneUrl(background.scene)})`,
        backgroundSize: "cover",
        backgroundPosition: background.position,
        border: "1px solid rgba(255,255,255,0.16)",
        boxShadow: "0 20px 56px rgba(0,0,0,0.34)",
      }}
    >
      <div
        style={{
          alignSelf: "flex-start",
          padding: "8px 14px",
          borderRadius: 999,
          background: "rgba(8, 5, 17, 0.58)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: token("--text-primary"),
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
        }}
      >
        {background.title}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "center",
          gap: 14,
        }}
      >
        <PrototypeButton
          label="Custom"
          glyph={GLYPHS.close}
          settings={settings}
        />
        {!showOnlyCustom &&
          presets.map((preset) => (
            <PrototypeButton
              key={preset.id}
              label={preset.title}
              glyph={GLYPHS.close}
              settings={preset.settings}
              labelChip={preset.labelChip}
            />
          ))}
      </div>
    </section>
  );
}

function PresetCard({ preset }: { preset: Preset }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        padding: 16,
        borderRadius: 12,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
      }}
    >
      <PrototypeButton
        label={preset.title}
        glyph={GLYPHS.close}
        settings={preset.settings}
        labelChip={preset.labelChip}
      />
      <div>
        <h2 style={{ margin: 0, font: token("--t-lead") }}>{preset.title}</h2>
        <p
          style={{
            margin: "6px 0 0",
            font: token("--t-caption"),
            color: token("--text-muted"),
          }}
        >
          {preset.note}
        </p>
      </div>
    </div>
  );
}

export default function ButtonTintPlayground() {
  const [settings, setSettings] = useState<TintSettings>(defaultSettings);
  const [activeBackground, setActiveBackground] =
    useState<BackgroundId>("rust");
  const focusedBackground = useMemo(
    () =>
      backgrounds.find((background) => background.id === activeBackground) ??
      backgrounds[0],
    [activeBackground],
  );

  return (
    <div
      className="tango"
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        padding: 28,
        background: token("--bg-app"),
        color: token("--text-primary"),
        fontFamily: token("--font-ui"),
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 24,
          alignItems: "start",
          maxWidth: 1320,
          margin: "0 auto",
        }}
      >
        <TweaksPanel
          settings={settings}
          setSettings={setSettings}
          activeBackground={activeBackground}
          setActiveBackground={setActiveBackground}
        />

        <main
          style={{
            flex: "999 1 620px",
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <MediaPanel
            background={focusedBackground}
            settings={settings}
            showOnlyCustom
          />

          <section
            data-playground-presets
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 14,
            }}
          >
            {presets.map((preset) => (
              <PresetCard key={preset.id} preset={preset} />
            ))}
          </section>

          <section
            data-playground-backgrounds
            style={{ display: "flex", flexDirection: "column", gap: 16 }}
          >
            {backgrounds.map((background) => (
              <MediaPanel
                key={background.id}
                background={background}
                settings={settings}
              />
            ))}
          </section>
        </main>
      </div>
    </div>
  );
}
