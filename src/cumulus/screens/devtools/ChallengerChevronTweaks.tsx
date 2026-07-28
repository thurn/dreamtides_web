import type { ReactElement } from "react";
import {
  DEFAULT_CHALLENGER_CHEVRON_SETTINGS,
  type ChallengerChevronSettings,
} from "../challenger-chevron";

const DEFAULT_COLOR_PICKER_VALUE = "#f09837";

type NumericSetting = Exclude<
  keyof ChallengerChevronSettings,
  "enabled" | "color"
>;

const NUMERIC_TWEAKS: readonly {
  readonly key: NumericSetting;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly suffix: string;
}[] = [
  {
    key: "widthPercent",
    label: "Horizontal size",
    min: 20,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "heightPercent",
    label: "Vertical size",
    min: 5,
    max: 60,
    step: 1,
    suffix: "%",
  },
  {
    key: "horizontalPositionPercent",
    label: "Horizontal position",
    min: 0,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "verticalPositionPercent",
    label: "Vertical position",
    min: -20,
    max: 100,
    step: 1,
    suffix: "%",
  },
  {
    key: "strokeWidth",
    label: "Chevron thickness",
    min: 2,
    max: 24,
    step: 1,
    suffix: "",
  },
  {
    key: "outlineWidth",
    label: "Outline thickness",
    min: 0,
    max: 16,
    step: 1,
    suffix: "",
  },
  {
    key: "opacity",
    label: "Opacity",
    min: 0.1,
    max: 1,
    step: 0.05,
    suffix: "",
  },
];

export function ChallengerChevronTweaksPanel({
  settings,
  onChange,
  onClose,
}: {
  readonly settings: ChallengerChevronSettings;
  readonly onChange: (settings: ChallengerChevronSettings) => void;
  readonly onClose: () => void;
}): ReactElement {
  return (
    <aside
      data-battle-challenger-chevron-tweaks=""
      style={{
        position: "absolute",
        zIndex: 80,
        top: 64,
        right: 16,
        width: "min(320px, calc(100vw - 32px))",
        maxHeight: "calc(100dvh - 80px)",
        overflowY: "auto",
        boxSizing: "border-box",
        padding: 16,
        border: "1px solid rgba(255, 255, 255, 0.18)",
        borderRadius: 12,
        background: "rgba(18, 14, 28, 0.96)",
        boxShadow: "0 18px 48px rgba(0, 0, 0, 0.45)",
        color: "#fff8ec",
        font: "13px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <strong style={{ fontSize: 15 }}>Challenger Chevron Tweaks</strong>
        <button
          type="button"
          aria-label="Close challenger chevron tweaks"
          onClick={onClose}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "4px 9px",
            background: "rgba(255, 255, 255, 0.12)",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span>Display chevrons</span>
        <input
          type="checkbox"
          aria-label="Display challenger chevrons"
          checked={settings.enabled}
          onChange={(event) =>
            onChange({ ...settings, enabled: event.currentTarget.checked })
          }
        />
      </label>

      {NUMERIC_TWEAKS.map((tweak) => (
        <label
          key={tweak.key}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "5px 12px",
            marginBottom: 12,
          }}
        >
          <span>{tweak.label}</span>
          <output>
            {String(settings[tweak.key])}
            {tweak.suffix}
          </output>
          <input
            type="range"
            aria-label={tweak.label}
            data-challenger-chevron-tweak={tweak.key}
            min={tweak.min}
            max={tweak.max}
            step={tweak.step}
            value={settings[tweak.key]}
            onChange={(event) =>
              onChange({
                ...settings,
                [tweak.key]: Number(event.currentTarget.value),
              })
            }
            style={{ gridColumn: "1 / -1", width: "100%" }}
          />
        </label>
      ))}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <span>Chevron color</span>
        <input
          type="color"
          aria-label="Chevron color"
          value={
            settings.color.startsWith("#")
              ? settings.color
              : DEFAULT_COLOR_PICKER_VALUE
          }
          onChange={(event) =>
            onChange({
              ...settings,
              color: event.currentTarget.value,
            })
          }
        />
      </label>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          onClick={() => onChange(DEFAULT_CHALLENGER_CHEVRON_SETTINGS)}
          style={{
            border: "1px solid rgba(255, 255, 255, 0.18)",
            borderRadius: 8,
            padding: "7px 10px",
            background: "rgba(255, 255, 255, 0.08)",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Reset
        </button>
      </div>

      <pre
        data-battle-challenger-chevron-tweaks-json=""
        data-cumulus-selectable=""
        style={{
          margin: 0,
          padding: 10,
          overflowX: "auto",
          borderRadius: 8,
          background: "rgba(0, 0, 0, 0.32)",
          whiteSpace: "pre-wrap",
        }}
      >
        {JSON.stringify(settings, null, 2)}
      </pre>
    </aside>
  );
}
