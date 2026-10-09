import type { PromptPurpose } from "../../prompts/types";
import type { Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/**
 * A play-time prompt withheld answers only because its step's feasibility
 * budget (`BattleConfig.feasibilitySearchRuns`) ran out before a search
 * proved them. The prompt offers only proven answers, so this records where
 * the bound, not the rules, narrowed a choice. Only the answering side sees
 * it, and its purpose is as that side may see it (`purposeView`): before
 * the commit point the play is not yet public, so a source card the
 * answering side cannot identify is `null`.
 */
export interface FeasibilityBoundedEvent {
  readonly kind: "feasibilityBounded";
  readonly side: Side;
  readonly purpose: PromptPurpose;
  /** Answers the guard examined whose search ran out before it settled them. */
  readonly unproven: number;
  /** The guard stopped before examining every answer: more answers are withheld, uncounted. */
  readonly truncated: boolean;
}

export const feasibilityBounded: EventDefinition<FeasibilityBoundedEvent> = {
  kind: "feasibilityBounded",
  privateTo: (event) => event.side,
};
