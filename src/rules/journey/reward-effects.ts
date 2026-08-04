import { mergeCardKeywordModification } from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import type { JourneyContent } from "../../data/journey-content";
import { isNightmareCardId } from "../../data/nightmare";
import { deriveEntryIdCounter } from "../../state/deck-entry-ids";
import { addSiteToCurrentDreamscape } from "../../state/journey-state-actions";
import type { DreamsignTemplate } from "../../types/content";
import type {
  CardKeywordModification,
  CardTypeChange,
  DeckEntry,
  JourneyState,
  SiteType,
  TransfigurationType,
} from "../../types/journey";

/** A validated, concrete journey-state mutation produced by a site reward. */
export type JourneyRewardEffect =
  | {
      kind: "add_catalog_card";
      cardUuid: string;
      cardNumber: number;
      transfiguration?: TransfigurationType;
    }
  | {
      kind: "add_dreamsign";
      dreamsignId: string;
      dreamsignTemplate: DreamsignTemplate;
    }
  | {
      kind: "transfigure_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      transfiguration: TransfigurationType;
    }
  | {
      kind: "duplicate_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
    }
  | {
      kind: "remove_deck_entry";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
    }
  | {
      kind: "change_deck_entry_keywords";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      keywords: CardKeywordModification;
    }
  | {
      kind: "change_deck_entry_type";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      typeChange: CardTypeChange;
    }
  | {
      kind: "add_deck_entry_spark_bonus";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      amount: number;
    }
  | {
      kind: "reduce_deck_entry_energy_cost";
      entryId: string;
      cardUuid: string;
      cardNumber: number;
      amount: number;
    }
  | {
      kind: "add_essence";
      amount: number;
    }
  | {
      kind: "add_site";
      siteType: SiteType;
    }
  | {
      kind: "composite";
      children: readonly JourneyRewardEffect[];
    };

interface EntryIdAllocator {
  next(): string;
}

function createEntryIdAllocator(
  deck: readonly DeckEntry[],
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => string,
): EntryIdAllocator {
  if (mintEntryId !== undefined) {
    let index = 0;
    return {
      next() {
        const id = mintEntryId(deck, index);
        index += 1;
        return id;
      },
    };
  }
  let highWater = deriveEntryIdCounter(deck);
  return {
    next() {
      highWater += 1;
      return `deck-${String(highWater)}`;
    },
  };
}

function validateCatalogCard(
  journeyContent: JourneyContent,
  cardUuid: string,
  cardNumber: number,
): boolean {
  const card = journeyContent.cardDatabase.get(cardNumber);
  return card !== undefined && card.id === cardUuid;
}

function validateDeckTarget(
  state: JourneyState,
  journeyContent: JourneyContent,
  effect: { entryId: string; cardUuid: string; cardNumber: number },
): DeckEntry | null {
  const entry = state.deck.find(
    (candidate) => candidate.entryId === effect.entryId,
  );
  if (entry === undefined || entry.cardNumber !== effect.cardNumber)
    return null;
  return validateCatalogCard(journeyContent, effect.cardUuid, effect.cardNumber)
    ? entry
    : null;
}

function applyEffect(
  state: JourneyState,
  journeyContent: JourneyContent,
  effect: JourneyRewardEffect,
  entryIds: EntryIdAllocator,
): JourneyState | null {
  switch (effect.kind) {
    case "add_catalog_card": {
      if (
        !validateCatalogCard(journeyContent, effect.cardUuid, effect.cardNumber)
      ) {
        return null;
      }
      return {
        ...state,
        deck: [
          ...state.deck,
          {
            entryId: entryIds.next(),
            cardNumber: effect.cardNumber,
            transfiguration: effect.transfiguration ?? null,
            isBane: isNightmareCardId(effect.cardUuid),
          },
        ],
      };
    }
    case "add_dreamsign": {
      const template = journeyContent.dreamsignTemplates.find(
        (candidate) => candidate.id === effect.dreamsignId,
      );
      if (
        template === undefined ||
        template.id !== effect.dreamsignTemplate.id
      ) {
        return null;
      }
      return {
        ...state,
        dreamsigns: [...state.dreamsigns, createDreamsign(template, false)],
      };
    }
    case "transfigure_deck_entry": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, transfiguration: effect.transfiguration }
            : entry,
        ),
      };
    }
    case "duplicate_deck_entry": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null) return null;
      return {
        ...state,
        deck: [...state.deck, { ...target, entryId: entryIds.next() }],
      };
    }
    case "remove_deck_entry": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.filter((entry) => entry.entryId !== effect.entryId),
      };
    }
    case "change_deck_entry_keywords": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null) return null;
      const keywordModification = mergeCardKeywordModification(
        target.keywordModification,
        effect.keywords,
      );
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, keywordModification }
            : entry,
        ),
      };
    }
    case "change_deck_entry_type": {
      if (validateDeckTarget(state, journeyContent, effect) === null)
        return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, typeChange: effect.typeChange }
            : entry,
        ),
      };
    }
    case "add_deck_entry_spark_bonus": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null || !Number.isFinite(effect.amount)) return null;
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, sparkBonus: (entry.sparkBonus ?? 0) + effect.amount }
            : entry,
        ),
      };
    }
    case "reduce_deck_entry_energy_cost": {
      const target = validateDeckTarget(state, journeyContent, effect);
      if (target === null || !Number.isFinite(effect.amount) || effect.amount <= 0) {
        return null;
      }
      const keywordModification = mergeCardKeywordModification(
        target.keywordModification,
        { energyCostReduction: effect.amount },
      );
      return {
        ...state,
        deck: state.deck.map((entry) =>
          entry.entryId === effect.entryId
            ? { ...entry, keywordModification }
            : entry,
        ),
      };
    }
    case "add_essence":
      return Number.isFinite(effect.amount)
        ? { ...state, essence: state.essence + effect.amount }
        : null;
    case "add_site":
      return addSiteToCurrentDreamscape(
        state,
        effect.siteType,
        effect.siteType,
      );
    case "composite": {
      let next: JourneyState | null = state;
      for (const child of effect.children) {
        next = applyEffect(next, journeyContent, child, entryIds);
        if (next === null) return null;
      }
      return next;
    }
  }
}

/** Apply a site-neutral reward effect atomically to journey state. */
export function applyJourneyRewardEffect({
  state,
  journeyContent,
  effect,
  mintEntryId,
}: {
  state: JourneyState;
  journeyContent: JourneyContent;
  effect: JourneyRewardEffect;
  mintEntryId?: (deck: readonly DeckEntry[], index: number) => string;
}): JourneyState | null {
  return applyEffect(
    state,
    journeyContent,
    effect,
    createEntryIdAllocator(state.deck, mintEntryId),
  );
}
