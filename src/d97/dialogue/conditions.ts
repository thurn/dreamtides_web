// Dialogue condition evaluation (decision P17): pure reads of the run's
// quest state, flags, act, beaten anchors, carried items and collection.

import type {
  D97CardTrait,
  D97DialogueCondition,
  D97QuestDefinition,
} from "../../content/d97/dialogue/schema";
import type { D97Collection } from "../collection/types";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { D97FlagId, DreamAnchorId } from "../../types/identifiers";
import { questStatus, questStepStatus, type D97QuestCatalog } from "../quests/quests";
import type { D97QuestState } from "../quests/types";

/** The card facts trait conditions read. */
export type D97CardFacts = Pick<CardData, "rarity" | "cardType" | "subtype" | "energyCost">;

/** Everything a condition can read. */
export interface D97DialogueContext {
  readonly quests: D97QuestState;
  readonly questCatalog: D97QuestCatalog;
  readonly flags: readonly D97FlagId[];
  readonly act: number;
  readonly beatenAnchorIds: readonly DreamAnchorId[];
  readonly collection: D97Collection;
  /** A card's facts by UUID, or null for an unknown card. */
  readonly cardFacts: (cardId: CardId) => D97CardFacts | null;
}

function withinBounds(value: number, min: number | undefined, max: number | undefined): boolean {
  return (min === undefined || value >= min) && (max === undefined || value <= max);
}

/** Whether a card with `facts` has `trait`. */
export function cardHasTrait(facts: D97CardFacts, trait: D97CardTrait): boolean {
  switch (trait.kind) {
    case "rarity":
      return facts.rarity === trait.rarity;
    case "cardType":
      return facts.cardType === trait.cardType;
    case "subtype":
      return facts.subtype === trait.subtype;
    case "cost":
      return facts.energyCost !== null && withinBounds(facts.energyCost, trait.min, trait.max);
  }
}

function quest(context: D97DialogueContext, id: D97QuestDefinition["id"]): D97QuestDefinition | null {
  return context.questCatalog.get(id) ?? null;
}

/** Whether `condition` holds in `context`; an unknown quest never matches. */
export function evaluateCondition(condition: D97DialogueCondition, context: D97DialogueContext): boolean {
  switch (condition.kind) {
    case "all":
      return condition.conditions.every((part) => evaluateCondition(part, context));
    case "any":
      return condition.conditions.some((part) => evaluateCondition(part, context));
    case "not":
      return !evaluateCondition(condition.condition, context);
    case "quest": {
      const definition = quest(context, condition.questId);
      return definition !== null && questStatus(context.quests, definition) === condition.status;
    }
    case "questStep": {
      const definition = quest(context, condition.questId);
      return (
        definition !== null &&
        questStepStatus(context.quests, definition, condition.stepId) === condition.status
      );
    }
    case "questHeld":
      return (context.quests.active !== null) === condition.held;
    case "flag":
      return context.flags.includes(condition.flagId) === condition.set;
    case "act":
      return withinBounds(context.act, condition.min, condition.max);
    case "anchorBeaten":
      return context.beatenAnchorIds.includes(condition.anchorId) === condition.beaten;
    case "hasItem":
      return context.quests.items.includes(condition.itemId) === condition.held;
    case "collection": {
      let count = 0;
      for (const copy of context.collection.copies) {
        const facts = context.cardFacts(copy.cardId);
        if (facts !== null && cardHasTrait(facts, condition.trait)) count += 1;
      }
      return count >= condition.atLeast;
    }
  }
}

/** Whether an optional condition holds (an absent one always does). */
export function holds(condition: D97DialogueCondition | undefined, context: D97DialogueContext): boolean {
  return condition === undefined || evaluateCondition(condition, context);
}
