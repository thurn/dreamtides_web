import { useEffect, useState } from "react";
import { logEvent } from "../../../logging";
import { DEFAULT_GLOSSARY_DIVIDER_STYLE } from "../../components/card/rich-text";

interface GlossaryDividerPreset {
  readonly id: string;
  readonly name: string;
  readonly note: string;
  readonly length: string;
  readonly thickness: string;
  readonly gapBefore: string;
  readonly gapAfter: string;
  readonly paint: string;
  readonly shadow: string;
}

const GLOSSARY_DIVIDER_PRESETS: readonly GlossaryDividerPreset[] = [
  {
    id: "silver-whisper",
    name: "1 · Silver Whisper",
    note: "Full-width neutral thread; the quiet baseline.",
    ...DEFAULT_GLOSSARY_DIVIDER_STYLE,
  },
  {
    id: "violet-inset",
    name: "2 · Violet Inset",
    note: "Shorter, cooler, and a little more explicit.",
    length: "78%",
    thickness: "1px",
    gapBefore: "12px",
    gapAfter: "10px",
    paint: "rgba(202, 180, 255, 0.34)",
    shadow: "none",
  },
  {
    id: "gilded-center",
    name: "3 · Gilded Center",
    note: "A compact warm rule that echoes spark accents.",
    length: "62%",
    thickness: "1px",
    gapBefore: "13px",
    gapAfter: "11px",
    paint: "rgba(239, 211, 145, 0.38)",
    shadow: "none",
  },
  {
    id: "soft-fade",
    name: "4 · Soft Fade",
    note: "A longer rule whose ends dissolve into the glass.",
    length: "100%",
    thickness: "1px",
    gapBefore: "11px",
    gapAfter: "9px",
    paint:
      "linear-gradient(90deg, rgba(246, 246, 245, 0), rgba(246, 246, 245, 0.36) 18%, rgba(246, 246, 245, 0.36) 82%, rgba(246, 246, 245, 0))",
    shadow: "none",
  },
  {
    id: "luminous-thread",
    name: "5 · Luminous Thread",
    note: "A thicker low-alpha line with a restrained violet halo.",
    length: "86%",
    thickness: "2px",
    gapBefore: "14px",
    gapAfter: "12px",
    paint: "rgba(232, 224, 255, 0.22)",
    shadow: "0 0 6px rgba(196, 171, 255, 0.24)",
  },
] as const;

const DEFAULT_PRESET = GLOSSARY_DIVIDER_PRESETS[0];

function applyPreset(preset: GlossaryDividerPreset): void {
  document.documentElement.dataset.glossaryDividerPreset = preset.id;
}

/**
 * Temporary development-only comparison panel for choosing the shared divider
 * treatment between glossary definition rows.
 */
export function GlossaryDividerTweaks() {
  const [selectedId, setSelectedId] = useState(DEFAULT_PRESET.id);
  const [collapsed, setCollapsed] = useState(false);
  const selectedPreset =
    GLOSSARY_DIVIDER_PRESETS.find((preset) => preset.id === selectedId) ??
    DEFAULT_PRESET;

  useEffect(() => {
    const root = document.documentElement;
    const previousPreset = root.dataset.glossaryDividerPreset;
    applyPreset(selectedPreset);
    return () => {
      if (previousPreset === undefined) {
        delete root.dataset.glossaryDividerPreset;
      } else {
        root.dataset.glossaryDividerPreset = previousPreset;
      }
    };
  }, [selectedPreset]);

  const selectPreset = (preset: GlossaryDividerPreset): void => {
    setSelectedId(preset.id);
    logEvent("glossary_divider_tweak_selected", {
      presetId: preset.id,
      presetName: preset.name,
      length: preset.length,
      thickness: preset.thickness,
      gapBefore: preset.gapBefore,
      gapAfter: preset.gapAfter,
      paint: preset.paint,
      shadow: preset.shadow,
    });
  };

  if (collapsed) {
    return (
      <>
        <GlossaryDividerPresetStyle preset={selectedPreset} />
        <button
          type="button"
          data-glossary-divider-tweaks="collapsed"
          onClick={() => setCollapsed(false)}
          style={{
            position: "fixed",
            right: "18px",
            bottom: "18px",
            zIndex: 10000,
            border: "1px solid rgba(255, 255, 255, 0.28)",
            borderRadius: "999px",
            padding: "9px 14px",
            background: "rgba(18, 14, 28, 0.94)",
            color: "#f6f6f5",
            font: "600 13px/1.2 Inter, sans-serif",
            boxShadow: "0 8px 28px rgba(0, 0, 0, 0.38)",
            cursor: "pointer",
          }}
        >
          Tweaks · {selectedPreset.name}
        </button>
      </>
    );
  }

  return (
    <>
      <GlossaryDividerPresetStyle preset={selectedPreset} />
      <aside
        data-glossary-divider-tweaks="expanded"
        style={{
          position: "fixed",
          right: "18px",
          bottom: "18px",
          zIndex: 10000,
          width: "312px",
          maxHeight: "calc(100dvh - 36px)",
          overflowY: "auto",
          boxSizing: "border-box",
          border: "1px solid rgba(255, 255, 255, 0.22)",
          borderRadius: "14px",
          padding: "14px",
          background: "rgba(18, 14, 28, 0.96)",
          color: "#f6f6f5",
          font: "500 13px/1.35 Inter, sans-serif",
          boxShadow: "0 18px 60px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "start",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "12px",
          }}
        >
          <div>
            <div
              style={{
                marginBottom: "3px",
                color: "rgba(246, 246, 245, 0.64)",
                font: "700 10px/1.2 ui-monospace, monospace",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Tweaks
            </div>
            <strong style={{ display: "block", fontSize: "15px" }}>
              Glossary dividers
            </strong>
          </div>
          <button
            type="button"
            aria-label="Collapse glossary divider tweaks"
            onClick={() => setCollapsed(true)}
            style={{
              width: "28px",
              height: "28px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              borderRadius: "999px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#f6f6f5",
              cursor: "pointer",
            }}
          >
            −
          </button>
        </div>

        <div style={{ display: "grid", gap: "7px" }}>
          {GLOSSARY_DIVIDER_PRESETS.map((preset) => {
            const isSelected = preset.id === selectedPreset.id;
            return (
              <button
                key={preset.id}
                type="button"
                data-glossary-divider-option={preset.id}
                aria-pressed={isSelected}
                onClick={() => selectPreset(preset)}
                style={{
                  width: "100%",
                  border: isSelected
                    ? "1px solid rgba(215, 196, 255, 0.72)"
                    : "1px solid rgba(255, 255, 255, 0.14)",
                  borderRadius: "9px",
                  padding: "9px 10px",
                  background: isSelected
                    ? "rgba(155, 112, 232, 0.24)"
                    : "rgba(255, 255, 255, 0.055)",
                  color: "#f6f6f5",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <strong style={{ display: "block", marginBottom: "2px" }}>
                  {preset.name}
                </strong>
                <span
                  style={{
                    display: "block",
                    color: "rgba(246, 246, 245, 0.68)",
                    fontSize: "11px",
                  }}
                >
                  {preset.note}
                </span>
              </button>
            );
          })}
        </div>

        <pre
          data-glossary-divider-values=""
          style={{
            margin: "12px 0 0",
            padding: "9px",
            borderRadius: "8px",
            overflowX: "auto",
            background: "rgba(0, 0, 0, 0.26)",
            color: "rgba(246, 246, 245, 0.72)",
            font: "500 10px/1.35 ui-monospace, monospace",
            whiteSpace: "pre-wrap",
          }}
        >
          {JSON.stringify(
            {
              id: selectedPreset.id,
              length: selectedPreset.length,
              thickness: selectedPreset.thickness,
              gapBefore: selectedPreset.gapBefore,
              gapAfter: selectedPreset.gapAfter,
              paint: selectedPreset.paint,
              shadow: selectedPreset.shadow,
            },
            null,
            2,
          )}
        </pre>
      </aside>
    </>
  );
}

function GlossaryDividerPresetStyle({
  preset,
}: {
  readonly preset: GlossaryDividerPreset;
}) {
  return (
    <style data-glossary-divider-tweak-style="">
      {`[data-definition-divider] {
  width: ${preset.length} !important;
  height: ${preset.thickness} !important;
  margin: ${preset.gapBefore} auto ${preset.gapAfter} !important;
  background: ${preset.paint} !important;
  box-shadow: ${preset.shadow} !important;
}`}
    </style>
  );
}
