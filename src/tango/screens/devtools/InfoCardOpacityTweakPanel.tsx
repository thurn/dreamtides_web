import * as React from "react";
import { token } from "../../primitives/tokens";

const STORAGE_KEY = "tango.infocardOpacityTweaks";
const DEFAULT_GLASS_ALPHA = 0.82;
const MIN_GLASS_ALPHA = 0.45;
const MAX_GLASS_ALPHA = 0.95;
const STEP = 0.01;

interface InfoCardOpacityTweaks {
  glassAlpha: number;
}

interface InfoCardOpacityTweakPanelProps {
  tweaks: InfoCardOpacityTweaks;
  onChange: (next: InfoCardOpacityTweaks) => void;
}

type InfoCardOpacityStyle = React.CSSProperties & {
  "--tango-infocard-glass-alpha"?: string;
};

function clampGlassAlpha(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_GLASS_ALPHA;
  }
  return Math.min(MAX_GLASS_ALPHA, Math.max(MIN_GLASS_ALPHA, value));
}

function roundedGlassAlpha(value: number): number {
  return Math.round(clampGlassAlpha(value) * 100) / 100;
}

function readStoredTweaks(): InfoCardOpacityTweaks {
  if (typeof window === "undefined") {
    return { glassAlpha: DEFAULT_GLASS_ALPHA };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { glassAlpha: DEFAULT_GLASS_ALPHA };
    }
    const parsed = JSON.parse(raw) as Partial<InfoCardOpacityTweaks>;
    return { glassAlpha: roundedGlassAlpha(Number(parsed.glassAlpha)) };
  } catch {
    return { glassAlpha: DEFAULT_GLASS_ALPHA };
  }
}

export function useInfoCardOpacityTweaks(): {
  enabled: boolean;
  style: InfoCardOpacityStyle | undefined;
  panel: React.ReactNode;
} {
  const enabled = import.meta.env.DEV;
  const [tweaks, setTweaks] = React.useState<InfoCardOpacityTweaks>(() =>
    readStoredTweaks(),
  );

  React.useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tweaks));
  }, [enabled, tweaks]);

  if (!enabled) {
    return { enabled, style: undefined, panel: null };
  }

  return {
    enabled,
    style: {
      "--tango-infocard-glass-alpha": tweaks.glassAlpha.toFixed(2),
    },
    panel: <InfoCardOpacityTweakPanel tweaks={tweaks} onChange={setTweaks} />,
  };
}

function InfoCardOpacityTweakPanel({
  tweaks,
  onChange,
}: InfoCardOpacityTweakPanelProps): React.ReactElement {
  const setGlassAlpha = (raw: string): void => {
    onChange({ glassAlpha: roundedGlassAlpha(Number(raw)) });
  };
  const json = JSON.stringify({
    infoCardGlassAlpha: Number(tweaks.glassAlpha.toFixed(2)),
  });

  return (
    <div
      data-infocard-opacity-tweaks
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 120,
        width: 260,
        padding: 14,
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(9,7,18,0.88)",
        boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
        color: token("--text-primary"),
        font: token("--t-body-sm"),
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <strong style={{ font: token("--t-button-sm") }}>InfoCard Glass</strong>
        <span style={{ color: token("--text-secondary") }}>
          {tweaks.glassAlpha.toFixed(2)}
        </span>
      </div>

      <label
        style={{
          display: "grid",
          gap: 8,
          marginTop: 12,
          color: token("--text-secondary"),
        }}
      >
        Fill Opacity
        <input
          type="range"
          min={MIN_GLASS_ALPHA}
          max={MAX_GLASS_ALPHA}
          step={STEP}
          value={tweaks.glassAlpha}
          onChange={(event) => setGlassAlpha(event.currentTarget.value)}
        />
      </label>

      <input
        aria-label="InfoCard glass opacity value"
        type="number"
        min={MIN_GLASS_ALPHA}
        max={MAX_GLASS_ALPHA}
        step={STEP}
        value={tweaks.glassAlpha.toFixed(2)}
        onChange={(event) => setGlassAlpha(event.currentTarget.value)}
        style={{
          width: "100%",
          marginTop: 10,
          padding: "8px 10px",
          borderRadius: 8,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.08)",
          color: token("--text-primary"),
          font: token("--t-body-sm"),
        }}
      />

      <pre
        style={{
          margin: "12px 0 0",
          padding: 10,
          borderRadius: 8,
          overflow: "auto",
          background: "rgba(0,0,0,0.28)",
          color: token("--text-secondary"),
          font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
          whiteSpace: "pre-wrap",
        }}
      >
        {json}
      </pre>
    </div>
  );
}
