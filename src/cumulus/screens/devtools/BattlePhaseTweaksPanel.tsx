import type { ChangeEvent } from "react";

export interface BattlePhaseTweaks {
  readonly iconSizePx: number;
  readonly verticalOffsetPx: number;
}

export const BATTLE_PHASE_TWEAK_DEFAULTS: BattlePhaseTweaks = {
  iconSizePx: 20,
  verticalOffsetPx: 0,
};

interface BattlePhaseTweaksPanelProps {
  readonly value: BattlePhaseTweaks;
  readonly onChange: (value: BattlePhaseTweaks) => void;
}

/** Temporary developer controls for tuning the battle phase marker in context. */
export function BattlePhaseTweaksPanel({
  value,
  onChange,
}: BattlePhaseTweaksPanelProps) {
  const update =
    (key: keyof BattlePhaseTweaks) =>
    (event: ChangeEvent<HTMLInputElement>): void => {
      onChange({ ...value, [key]: Number(event.currentTarget.value) });
    };

  return (
    <aside
      data-battle-phase-tweaks=""
      style={{
        position: "fixed",
        top: "50%",
        left: 8,
        zIndex: 100,
        width: "min(240px, calc(100vw - 16px))",
        transform: "translateY(-50%)",
        boxSizing: "border-box",
        padding: 12,
        color: "#fff",
        background: "rgba(6, 4, 16, 0.92)",
        border: "1px solid rgba(192, 132, 252, 0.8)",
        borderRadius: 10,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
      }}
    >
      <strong style={{ display: "block", marginBottom: 10, fontSize: 13 }}>
        Phase indicator tweaks
      </strong>
      <label style={{ display: "grid", gap: 4, marginBottom: 10 }}>
        <span>
          Icon size: <output>{value.iconSizePx}px</output>
        </span>
        <input
          data-battle-phase-tweak="icon-size"
          type="range"
          min={12}
          max={32}
          step={1}
          value={value.iconSizePx}
          onChange={update("iconSizePx")}
        />
      </label>
      <label style={{ display: "grid", gap: 4 }}>
        <span>
          Vertical offset: <output>{value.verticalOffsetPx}px</output>
        </span>
        <input
          data-battle-phase-tweak="vertical-offset"
          type="range"
          min={-12}
          max={24}
          step={1}
          value={value.verticalOffsetPx}
          onChange={update("verticalOffsetPx")}
        />
      </label>
      <pre
        data-battle-phase-tweak-values=""
        style={{
          margin: "10px 0 0",
          padding: 8,
          overflowX: "auto",
          color: "#d8b4fe",
          background: "rgba(0, 0, 0, 0.35)",
          borderRadius: 6,
          fontSize: 10,
          lineHeight: 1.35,
        }}
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </aside>
  );
}
