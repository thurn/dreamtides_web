import type { EffectStep } from "../../rules/battle/effect-step";

// ---------------------------------------------------------------------------
// Dreamwell effect script
// ---------------------------------------------------------------------------

export interface DreamwellEffectScript {
  id: string; // Dreamwell card UUID
  steps: EffectStep[];
}
