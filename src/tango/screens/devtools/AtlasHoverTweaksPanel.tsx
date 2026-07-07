// AtlasHoverTweaksPanel — a dev-only floating panel for tuning the large desktop
// Dream Atlas hover card ({@link AtlasHoverCard}) live in the browser. It is
// exploratory scaffolding: the design is in motion, so the box measures (widths,
// heights, insets, the text-column split) and the two information-hierarchy
// PROPOSALS are dialed in against the real screen rather than guessed.
//
// The panel is gated on `import.meta.env.DEV` by its caller (AtlasScreen) and
// never ships to production. It renders raw native inputs and hand-styled markup
// — permitted for `src/tango/screens/devtools/` — and prints a live JSON readout
// of the current values to paste back as the new baked defaults. Per the tango
// tweaks-panel cleanup contract, this file and the plumbing that threads the
// values through the atlas are removed once the design settles.

import { useState } from "react";
import {
  ATLAS_HOVER_DEFAULTS,
  type AtlasHoverHierarchy,
  type AtlasHoverTweaks,
} from "../../components/atlas/AtlasHoverCard";

/** One numeric slider spec. */
interface Slider {
  key: keyof AtlasHoverTweaks;
  label: string;
  min: number;
  max: number;
  step: number;
}

/** The tunable box measures, in panel order. */
const SLIDERS: Slider[] = [
  { key: "cardWidth", label: "Card width", min: 320, max: 620, step: 4 },
  { key: "heroHeight", label: "Hero height", min: 120, max: 340, step: 4 },
  { key: "figureHeight", label: "Figure height", min: 180, max: 460, step: 4 },
  { key: "figureFootInset", label: "Figure foot", min: -40, max: 80, step: 2 },
  { key: "figureRightInset", label: "Figure right", min: -20, max: 80, step: 2 },
  {
    key: "textColumnFraction",
    label: "Text column",
    min: 0.4,
    max: 1,
    step: 0.02,
  },
];

const PANEL_BG = "rgba(14, 10, 24, 0.94)";
const PANEL_BORDER = "1px solid rgba(168, 85, 247, 0.4)";
const FIELD_LABEL = "#b8a8e0";
const READOUT_BG = "rgba(0, 0, 0, 0.4)";

interface AtlasHoverTweaksPanelProps {
  value: AtlasHoverTweaks;
  onChange: (next: AtlasHoverTweaks) => void;
}

/**
 * The floating tweaks panel. Collapsed to a small tab by default so it never
 * blocks the hover cards it tunes; expanded, it exposes the hierarchy proposal,
 * the site / affiliation toggles, the box-measure sliders, a reset, and a JSON
 * readout of the live values.
 */
export function AtlasHoverTweaksPanel({
  value,
  onChange,
}: AtlasHoverTweaksPanelProps) {
  const [open, setOpen] = useState(false);

  const setNum = (key: keyof AtlasHoverTweaks, n: number): void =>
    onChange({ ...value, [key]: n });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          top: 12,
          left: 12,
          zIndex: 1000,
          padding: "6px 12px",
          borderRadius: 8,
          border: PANEL_BORDER,
          background: PANEL_BG,
          color: FIELD_LABEL,
          font: "600 11px ui-monospace, monospace",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        Hover Tweaks
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        top: 12,
        left: 12,
        zIndex: 1000,
        width: 288,
        maxHeight: "calc(100vh - 24px)",
        overflowY: "auto",
        padding: 14,
        borderRadius: 12,
        border: PANEL_BORDER,
        background: PANEL_BG,
        backdropFilter: "blur(8px)",
        color: "#e8e2f5",
        font: "500 12px ui-sans-serif, system-ui, sans-serif",
        boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            font: "700 11px ui-monospace, monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: FIELD_LABEL,
          }}
        >
          Atlas Hover Card
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: FIELD_LABEL,
            cursor: "pointer",
            font: "600 16px ui-monospace, monospace",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      {/* Hierarchy proposal — the two high-level information hierarchies. */}
      <div style={{ marginBottom: 14 }}>
        <div
          style={{
            color: FIELD_LABEL,
            marginBottom: 6,
            font: "700 10px ui-monospace, monospace",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Hierarchy proposal
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["place-forward", "guide-forward"] as AtlasHoverHierarchy[]).map(
            (h) => {
              const active = value.hierarchy === h;
              return (
                <button
                  key={h}
                  type="button"
                  onClick={() => onChange({ ...value, hierarchy: h })}
                  style={{
                    flex: 1,
                    padding: "7px 6px",
                    borderRadius: 7,
                    border: active
                      ? "1px solid rgba(168,85,247,0.9)"
                      : "1px solid rgba(255,255,255,0.14)",
                    background: active
                      ? "rgba(168,85,247,0.28)"
                      : "rgba(255,255,255,0.04)",
                    color: active ? "#fff" : FIELD_LABEL,
                    cursor: "pointer",
                    font: "600 11px ui-sans-serif, system-ui, sans-serif",
                  }}
                >
                  {h === "place-forward" ? "Place-forward" : "Guide-forward"}
                </button>
              );
            },
          )}
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 10.5,
            lineHeight: 1.4,
            color: "#9d90c4",
          }}
        >
          {value.hierarchy === "place-forward"
            ? "Dreamscape is the hero; its guide is the accent line (legacy layout)."
            : "Resident guide is the hero; the dreamscape rides the overline."}
        </div>
      </div>

      {/* Field toggles. */}
      <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
        <Toggle
          label="Site eyebrow"
          checked={value.showSite}
          onChange={(b) => onChange({ ...value, showSite: b })}
        />
        <Toggle
          label="Affiliation"
          checked={value.showAffiliation}
          onChange={(b) => onChange({ ...value, showAffiliation: b })}
        />
      </div>

      {/* Box-measure sliders. */}
      {SLIDERS.map((s) => {
        const raw = value[s.key];
        const n = typeof raw === "number" ? raw : 0;
        const shown =
          s.step < 1 ? n.toFixed(2) : String(Math.round(n));
        return (
          <div key={s.key} style={{ marginBottom: 10 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 3,
              }}
            >
              <span style={{ color: FIELD_LABEL }}>{s.label}</span>
              <span style={{ font: "600 11px ui-monospace, monospace" }}>
                {shown}
              </span>
            </div>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={n}
              onChange={(e) => setNum(s.key, Number(e.target.value))}
              style={{ width: "100%", accentColor: "#a855f7" }}
            />
          </div>
        );
      })}

      <div style={{ display: "flex", gap: 8, margin: "12px 0 10px" }}>
        <button
          type="button"
          onClick={() => onChange({ ...ATLAS_HOVER_DEFAULTS })}
          style={{
            flex: 1,
            padding: "7px",
            borderRadius: 7,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.05)",
            color: FIELD_LABEL,
            cursor: "pointer",
            font: "600 11px ui-sans-serif, system-ui, sans-serif",
          }}
        >
          Reset defaults
        </button>
      </div>

      {/* Live JSON readout to paste back as the new baked defaults. */}
      <pre
        style={{
          margin: 0,
          padding: 10,
          borderRadius: 8,
          background: READOUT_BG,
          font: "500 10.5px ui-monospace, monospace",
          color: "#c9bdf0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

/** A small labelled checkbox for the boolean field toggles. */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (b: boolean) => void;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        cursor: "pointer",
        color: FIELD_LABEL,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "#a855f7" }}
      />
      {label}
    </label>
  );
}
