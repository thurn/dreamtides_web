import type { EffectStep } from "../../rules/battle/effect-step";
import type { DreamwellCardId } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Dreamwell effect script
// ---------------------------------------------------------------------------

export interface DreamwellEffectScript {
  id: DreamwellCardId;
  steps: EffectStep[];
}
