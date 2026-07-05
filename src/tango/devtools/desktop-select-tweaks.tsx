// Dev-only tooling for the desktop Dreamcaller-select layout: a live schema of
// tunable proportions plus the floating panel that drives them. This is a
// devtools surface (like the design-system docs site), so it renders raw
// controls and sample colors rather than composing product Tango controls — it
// exists to dial in the numbers, and the tuned result is what {@link
// DEFAULT_TWEAKS} ships. The screen renders the panel only under
// `import.meta.env.DEV`, and reads {@link DEFAULT_TWEAKS} as its production
// config regardless.

import { type Dispatch, type SetStateAction, useState } from "react";

/** Live, dev-only knobs for the desktop layout. The floating {@link
 * TweaksPanel} drives these so the exact figure/card proportions can be dialed
 * in by eye; the {@link DEFAULT_TWEAKS} values are what ship. */
export interface DesktopSelectTweaks {
  /** Choose-button height: the responsive `md` by default. */
  buttonSize: "sm" | "md" | "lg";
  /** Whether the hairline between ability text and tides is drawn. */
  showDivider: boolean;
  /** The internal vertical rhythm unit, in px (top/bottom padding + every gap). */
  cardSpacing: number;
  /** Fixed height of the reserved ability-text region, in px. */
  abilityHeight: number;
  /** The standing figure's stage height, in px. */
  portraitHeight: number;
  /** A multiplier on the rendered figure art, anchored at the feet. The cutout
   * is contained within the column width, so this is how the art grows larger
   * (overflowing the column) while the name, card, and column spacing stay put;
   * 1 = fit-to-column. */
  portraitScale: number;
  /** Column width — the figure stage's width — in px. */
  columnWidth: number;
  /** Console-card width, in px. May be narrower than the column (the card
   * centers under the full-width figure stage). */
  cardWidth: number;
  /** A floor on the console card's height, in px (0 = size to content). Extra
   * height pins the Choose button to the card's bottom edge. */
  cardMinHeight: number;
  /** How far the card rides up over the figure's legs, in px (bigger = higher). */
  cardOverlap: number;
}

/** The shipping desktop proportions — the screen's production config, and what
 * the tweaks panel resets to. `abilityHeight` reserves three lines of --t-rules
 * (14px at 1.36 line-height ≈ 58px); `cardSpacing` is one --space-6 (16px). */
export const DEFAULT_TWEAKS: DesktopSelectTweaks = {
  buttonSize: "md",
  showDivider: true,
  cardSpacing: 16,
  abilityHeight: 58,
  portraitHeight: 560,
  portraitScale: 1,
  columnWidth: 400,
  cardWidth: 320,
  cardMinHeight: 0,
  cardOverlap: 256,
};

/** One labeled range control in the tweaks panel. */
function TweakSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
}) {
  return (
    <label
      style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 11 }}
    >
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ opacity: 0.8 }}>{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          onChange(Number(event.target.value));
        }}
        style={{ width: "100%" }}
      />
    </label>
  );
}

/** A dev-only floating panel of live knobs for the desktop layout. Rendered
 * only under `import.meta.env.DEV`, it drives {@link DesktopSelectTweaks} so the
 * figure/card proportions can be tuned by eye; the JSON readout at the bottom is
 * the current values, ready to paste back into {@link DEFAULT_TWEAKS}. */
export function TweaksPanel({
  tweaks,
  onChange,
}: {
  tweaks: DesktopSelectTweaks;
  // Accept the raw state setter so `set` can update functionally — each knob
  // reads the latest tweaks even when several fire before a re-render, rather
  // than clobbering earlier changes with a stale snapshot.
  onChange: Dispatch<SetStateAction<DesktopSelectTweaks>>;
}) {
  const [open, setOpen] = useState(true);
  const set = <K extends keyof DesktopSelectTweaks>(
    key: K,
    value: DesktopSelectTweaks[K],
  ): void => {
    onChange((prev) => ({ ...prev, [key]: value }));
  };

  const shell: React.CSSProperties = {
    position: "fixed",
    top: 12,
    right: 12,
    zIndex: 50,
    width: open ? 232 : "auto",
    padding: 10,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(14,12,20,0.92)",
    color: "#e8e6f0",
    font: "500 12px/1.3 ui-monospace, SFMono-Regular, Menlo, monospace",
    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
    backdropFilter: "blur(6px)",
  };

  if (!open) {
    return (
      <div style={shell}>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}
          style={{
            all: "unset",
            cursor: "pointer",
            fontSize: 11,
            fontFamily: "inherit",
          }}
        >
          ⚙ tweaks
        </button>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 11, letterSpacing: "0.06em" }}>
          DESKTOP TWEAKS
        </strong>
        <span style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              onChange(DEFAULT_TWEAKS);
            }}
            style={{
              all: "unset",
              cursor: "pointer",
              fontSize: 11,
              opacity: 0.8,
            }}
          >
            reset
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
            }}
            style={{ all: "unset", cursor: "pointer", fontSize: 13 }}
          >
            ×
          </button>
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ fontSize: 11 }}>Button size</span>
          <span style={{ display: "flex", gap: 4 }}>
            {(["sm", "md", "lg"] as const).map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => {
                  set("buttonSize", size);
                }}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "2px 8px",
                  borderRadius: 5,
                  fontSize: 11,
                  textAlign: "center",
                  flex: 1,
                  background:
                    tweaks.buttonSize === size
                      ? "rgba(150,110,240,0.9)"
                      : "rgba(255,255,255,0.08)",
                }}
              >
                {size}
              </button>
            ))}
          </span>
        </div>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={tweaks.showDivider}
            onChange={(event) => {
              set("showDivider", event.target.checked);
            }}
          />
          Show divider
        </label>

        <TweakSlider
          label="Card spacing"
          value={tweaks.cardSpacing}
          min={0}
          max={28}
          onChange={(v) => {
            set("cardSpacing", v);
          }}
        />
        <TweakSlider
          label="Ability height"
          value={tweaks.abilityHeight}
          min={20}
          max={180}
          onChange={(v) => {
            set("abilityHeight", v);
          }}
        />
        <TweakSlider
          label="Portrait height"
          value={tweaks.portraitHeight}
          min={280}
          max={820}
          onChange={(v) => {
            set("portraitHeight", v);
          }}
        />
        <TweakSlider
          label="Portrait scale"
          value={tweaks.portraitScale}
          min={0.8}
          max={2.4}
          step={0.05}
          onChange={(v) => {
            set("portraitScale", v);
          }}
        />
        <TweakSlider
          label="Column width"
          value={tweaks.columnWidth}
          min={220}
          max={540}
          onChange={(v) => {
            set("columnWidth", v);
          }}
        />
        <TweakSlider
          label="Card width"
          value={tweaks.cardWidth}
          min={180}
          max={540}
          onChange={(v) => {
            set("cardWidth", v);
          }}
        />
        <TweakSlider
          label="Card min height"
          value={tweaks.cardMinHeight}
          min={0}
          max={520}
          onChange={(v) => {
            set("cardMinHeight", v);
          }}
        />
        <TweakSlider
          label="Card overlap"
          value={tweaks.cardOverlap}
          min={0}
          max={380}
          onChange={(v) => {
            set("cardOverlap", v);
          }}
        />

        <pre
          style={{
            margin: 0,
            marginTop: 4,
            padding: 8,
            borderRadius: 6,
            background: "rgba(0,0,0,0.4)",
            fontSize: 10,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            userSelect: "all",
          }}
        >
          {JSON.stringify(tweaks, null, 2)}
        </pre>
      </div>
    </div>
  );
}
