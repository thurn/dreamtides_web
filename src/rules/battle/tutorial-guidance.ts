import { extractGlossaryTerms } from "../../data/glossary-terms";
import type {
  TutorialTriggerDefinition,
  TutorialTriggerEvent,
} from "../../types/tutorial";
import type { BattleCardKind } from "../../battle/types";

export interface TutorialGuidanceMatchInput {
  readonly event: TutorialTriggerEvent;
  readonly renderedText: string;
  readonly cardKind?: BattleCardKind;
  readonly seenTriggerIds: ReadonlySet<string>;
}

/** Resolve every unseen TOML tutorial matching one authoritative battle edge. */
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
        case "any":
          return true;
      }
    })
    .sort(
      (left, right) =>
        left.trigger.priority - right.trigger.priority ||
        left.sourceIndex - right.sourceIndex,
    )
    .map(({ trigger }) => trigger);
}
