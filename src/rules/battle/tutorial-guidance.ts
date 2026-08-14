import { extractGlossaryTerms } from "../../data/glossary-terms";
import type {
  TutorialTriggerDefinition,
  TutorialTriggerEvent,
} from "../../types/tutorial";
import type { BattleCardKind } from "../../battle/types";
import type { CardId } from "../../types/card-identity";
import type {
  DreamwellCardId,
  TutorialTriggerId,
} from "../../types/identifiers";

export interface TutorialGuidanceMatchInput {
  readonly event: TutorialTriggerEvent;
  readonly cardId?: CardId | DreamwellCardId;
  readonly renderedText: string;
  readonly cardKind?: BattleCardKind;
  readonly seenTriggerIds: ReadonlySet<TutorialTriggerId>;
}

/**
 * Select the highest-priority unseen TOML tutorial matching one authoritative
 * battle edge. Source order breaks priority ties deterministically.
 */
export function matchTutorialGuidance(
  triggers: readonly TutorialTriggerDefinition[],
  input: TutorialGuidanceMatchInput,
): readonly TutorialTriggerDefinition[] {
  const glossaryIds = new Set(
    extractGlossaryTerms(input.renderedText).map((entry) => entry.id),
  );
  return triggers
    .map((trigger, sourceIndex) => ({ trigger, sourceIndex }))
    .filter(({ trigger }) => {
      if (
        input.seenTriggerIds.has(trigger.id) ||
        !trigger.on.includes(input.event)
      ) {
        return false;
      }
      switch (trigger.match.kind) {
        case "glossary":
          return glossaryIds.has(trigger.match.id);
        case "card-type":
          return input.cardKind === trigger.match.cardType;
        case "card-id":
          return input.cardId === trigger.match.cardId;
        case "any":
          return true;
      }
    })
    .sort(
      (left, right) =>
        left.trigger.priority - right.trigger.priority ||
        left.sourceIndex - right.sourceIndex,
    )
    .slice(0, 1)
    .map(({ trigger }) => trigger);
}
