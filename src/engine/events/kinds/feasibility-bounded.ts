import type { PromptPurpose } from "../../prompts/types";
import type { Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/**
 * A play-time prompt withheld `unproven` answers because the search for a
 * feasible continuation from each ran out of its budget
 * (`BattleConfig.feasibilitySearchRuns`) before finding one. The prompt
 * offers only proven answers, so this records where the bound, not the
 * rules, narrowed a choice. Only the answering side sees it: before the
 * commit point the play is not yet public.
 */
export interface FeasibilityBoundedEvent {
  readonly kind: "feasibilityBounded";
  readonly side: Side;
  readonly purpose: PromptPurpose;
  readonly unproven: number;
}

export const feasibilityBounded: EventDefinition<FeasibilityBoundedEvent> = {
  kind: "feasibilityBounded",
  privateTo: (event) => event.side,
};
