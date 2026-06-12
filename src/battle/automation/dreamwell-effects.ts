import type { EffectStep } from "./effect-step";

// ---------------------------------------------------------------------------
// Dreamwell effect script
// ---------------------------------------------------------------------------

export interface DreamwellEffectScript {
  id: string; // Dreamwell card UUID
  steps: EffectStep[];
}
