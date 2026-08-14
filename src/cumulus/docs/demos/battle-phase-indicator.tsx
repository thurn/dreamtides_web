import { useState } from "react";
import { BattlePhaseIndicator } from "../../components/battle/BattlePhaseIndicator";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoSelect } from "./promotion-demo-controls";
const phases = ["dawn", "day", "dusk", "night", "challenge"] as const;
function Demo() {
  const [phase, setPhase] = useState<
    "dawn" | "day" | "dusk" | "night" | "challenge"
  >("day");
  const [side, setSide] = useState<"near" | "far">("near");
  return (
    <div style={{ width: "100%", maxWidth: 520, display: "grid", gap: 24 }}>
      <DemoControls>
        <DemoSelect
          label="Phase"
          value={phase}
          values={phases}
          onChange={(value) => setPhase(value as typeof phase)}
        />
        <DemoSelect
          label="Side"
          value={side}
          values={["near", "far"]}
          onChange={(value) => setSide(value as "near" | "far")}
        />
        <button
          type="button"
          onClick={() =>
            setPhase(
              phases[(phases.indexOf(phase) + 1) % phases.length] ?? "dawn",
            )
          }
        >
          Cycle phase
        </button>
      </DemoControls>
      <div
        style={{
          position: "relative",
          height: 56,
          borderTop: "2px solid rgba(255,255,255,.35)",
        }}
      >
        <BattlePhaseIndicator phase={phase} side={side} />
      </div>
    </div>
  );
}
export const battlePhaseIndicatorDemo: CumulusComponent = {
  id: "battle-phase-indicator",
  title: "Battle Phase Indicator",
  blurb:
    "A controlled, oriented comet marker for the five presentation-level battle phases.",
  callout:
    "Advance battle state outside this indicator and pass the current phase and viewer-relative side.",
  details: [
    "Track position, glyph, motion, reduced-motion treatment, and accessible naming stay component-owned.",
  ],
  group: "Battle",
  docName: "BattlePhaseIndicator",
  Component: Demo,
  usage: [{ code: `<BattlePhaseIndicator phase={phase} side="near" />` }],
  demo: { defaultArgs: {} },
};
