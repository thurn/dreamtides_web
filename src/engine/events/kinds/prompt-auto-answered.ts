import type { PromptKind, PromptPurpose } from "../../prompts/types";
import type { Side } from "../../state/ids";
import type { EventDefinition } from "../types";

/**
 * A prompt with exactly one legal answer was answered automatically
 * (`BattleConfig.autoAnswerForcedPrompts`), so the presentation can tell its
 * side what happened. Only the answering side sees it, with the purpose as
 * that side may see it (`purposeView`). Every run of the step emits it at
 * the same place, whether the forced answer is chosen or replayed.
 */
export interface PromptAutoAnsweredEvent {
  readonly kind: "promptAutoAnswered";
  readonly side: Side;
  readonly prompt: PromptKind;
  readonly purpose: PromptPurpose;
}

export const promptAutoAnswered: EventDefinition<PromptAutoAnsweredEvent> = {
  kind: "promptAutoAnswered",
  privateTo: (event) => event.side,
};
