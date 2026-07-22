import { useMemo, useState, type ReactElement } from "react";

export interface TutorialHowToPlayTweakValues {
  readonly popupWidth: number;
  readonly popupHeight: number;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly internalPadding: number;
  readonly paragraphGap: number;
}

export const DEFAULT_TUTORIAL_HOW_TO_PLAY_TWEAKS: TutorialHowToPlayTweakValues =
  {
    popupWidth: 728,
    popupHeight: 0,
    fontSize: 19,
    lineHeight: 1.3,
    internalPadding: 12,
    paragraphGap: 20,
  };

type TweakKey = keyof TutorialHowToPlayTweakValues;

interface TweakControl {
  readonly key: TweakKey;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix: string;
}

const TWEAK_CONTROLS: readonly TweakControl[] = [
  {
    key: "popupWidth",
    label: "Popup width",
    min: 320,
    max: 960,
    step: 4,
    suffix: "px",
  },
  {
    key: "popupHeight",
    label: "Popup height (0 = auto)",
    min: 0,
    max: 720,
    step: 4,
    suffix: "px",
  },
  {
    key: "fontSize",
    label: "Body font size",
    min: 14,
    max: 32,
    step: 0.5,
    suffix: "px",
  },
  {
    key: "lineHeight",
    label: "Line height",
    min: 1,
    max: 1.8,
    step: 0.05,
    suffix: "",
  },
  {
    key: "internalPadding",
    label: "Internal padding",
    min: 0,
    max: 64,
    step: 2,
    suffix: "px",
  },
  {
    key: "paragraphGap",
    label: "Paragraph gap",
    min: 0,
    max: 64,
    step: 2,
    suffix: "px",
  },
] as const;

interface TutorialHowToPlayTweaksProps {
  readonly values: TutorialHowToPlayTweakValues;
  readonly onChange: (values: TutorialHowToPlayTweakValues) => void;
}

/** Temporary, development-only controls for dialing the tutorial popup. */
export function TutorialHowToPlayTweaks({
  values,
  onChange,
}: TutorialHowToPlayTweaksProps): ReactElement | null {
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const json = useMemo(() => JSON.stringify(values, null, 2), [values]);

  if (!import.meta.env.DEV || typeof document === "undefined") return null;

  const popupHeight =
    values.popupHeight === 0 ? "auto" : `${String(values.popupHeight)}px`;

  return (
    <>
      <style>{`
        [role="dialog"][aria-label="How to Play"] > [data-glass-dialog-panel] {
          width: min(${String(values.popupWidth)}px, 100%) !important;
          height: ${popupHeight} !important;
        }
      `}</style>
      <aside
        data-tutorial-how-to-play-tweaks=""
        style={{
          position: "fixed",
          zIndex: 100,
          top: 16,
          right: 16,
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          boxSizing: "border-box",
          padding: 14,
          border: "1px solid rgba(255, 255, 255, 0.28)",
          borderRadius: 12,
          background: "rgba(16, 10, 30, 0.94)",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
          color: "#ffffff",
          font: "13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <strong style={{ fontSize: 14 }}>How to Play tweaks</strong>
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? "Hide" : "Show"}
          </button>
        </div>
        {expanded ? (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {TWEAK_CONTROLS.map((control) => (
              <label key={control.key} style={{ display: "grid", gap: 5 }}>
                <span
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <span>{control.label}</span>
                  <output data-tutorial-tweak-output={control.key}>
                    {String(values[control.key])}
                    {control.suffix}
                  </output>
                </span>
                <input
                  data-tutorial-tweak-key={control.key}
                  type="range"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={values[control.key]}
                  onChange={(event) => {
                    onChange({
                      ...values,
                      [control.key]: Number(event.currentTarget.value),
                    });
                    setCopied(false);
                  }}
                />
              </label>
            ))}
            <pre
              aria-live="polite"
              data-tutorial-how-to-play-tweak-json=""
              style={{
                margin: 0,
                padding: 10,
                overflowX: "auto",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.08)",
                whiteSpace: "pre-wrap",
              }}
            >
              {json}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(json);
                  setCopied(true);
                }}
              >
                {copied ? "Copied" : "Copy JSON"}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(DEFAULT_TUTORIAL_HOW_TO_PLAY_TWEAKS);
                  setCopied(false);
                }}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
      </aside>
    </>
  );
}
