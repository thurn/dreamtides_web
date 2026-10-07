// Pure view-model construction for a resolved Exploration action: the reward
// and deck-modification presentation shown after the player resolves an offer.

import { resolveDeckEntryCard } from "../../card-type-change";
import type { DreamscapeSiteModel } from "../../cumulus/components/dreamscape/SiteNode";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  ExplorationActionView,
  ExplorationKeywordChangeView,
  ExplorationSiteView,
  ExplorationTransfigurationChangeView,
} from "../../cumulus/screens/ExplorationSiteScreen";
import type { ExplorationActionContent } from "../../data/exploration";
import {
  cardById,
  explorationOfferPlan,
  hasStarterCardRole,
  hasUsableCompoundActionPreparation,
  hasUsableDisclosedDeckTargetPreparation,
  hasUsableMultiCardReplacementPreparation,
  hasUsableMultiCardTransfigurationPreparation,
  hasUsableRandomDeckTargetPreparation,
  hasUsableStarterCardTransfigurationPreparation,
  sameOrderedIds,
} from "../../exploration/offer-usability";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import { parseCardId } from "../../types/card-identity";
import type {
  DreamscapeNode,
  ExplorationSiteRuntime,
  JourneyState,
  TransfigurationType,
} from "../../types/journey";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { transfigurationForm } from "../../data/transfiguration-data";
import type { CardId } from "../../types/card-identity";
import type { DeckEntryId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { annotatedTextValue } from "../../runtime/text";
import {
  dreamsignById,
  avatarById,
  modelForCard,
  deckCardChoice,
  dreamsignChoices,
  authoredEssencePerSpark,
  templateArgumentNames,
} from "./exploration-choices";

function unpreparedEffect(
  message: ExplorationActionContent["effectText"],
): string {
  if (message === undefined || templateArgumentNames(message).length > 0) {
    return "Exploration effect resolved";
  }
  return message;
}

function persistedSelectionIds(
  resolution: NonNullable<ExplorationSiteRuntime["resolution"]>,
): readonly DeckEntryId[] | null {
  const entryIds = resolution.selection?.entryIds;
  return Array.isArray(entryIds) &&
    entryIds.every((entryId): entryId is string => typeof entryId === "string")
    ? entryIds.map(parseDeckEntryId)
    : null;
}

function persistedSelectionCardIds(
  resolution: NonNullable<ExplorationSiteRuntime["resolution"]>,
): readonly CardId[] | null {
  const cardIds = resolution.selection?.cardIds;
  return Array.isArray(cardIds) &&
    cardIds.every((cardId): cardId is string => typeof cardId === "string") &&
    new Set(cardIds).size === cardIds.length
    ? cardIds.map(parseCardId)
    : null;
}

function resolvedTransfigurationViews(
  mappings: NonNullable<
    NonNullable<ExplorationSiteRuntime["resolution"]>["cardTransfigurations"]
  >,
  state: JourneyState,
  content: JourneyContent,
): readonly ExplorationTransfigurationChangeView[] | null {
  if (
    new Set(mappings.map((mapping) => mapping.entryId)).size !== mappings.length
  ) {
    return null;
  }
  const views = mappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      base.id !== mapping.cardId ||
      mapping.beforeTransfiguration !== null ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  return views.length === mappings.length ? views : null;
}

function compoundActionRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  const preparation = explorationOfferPlan(offer, "compound-action");
  if (
    resolution === null ||
    offer === undefined ||
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    resolution.selectionSignature !== preparation.planSignature ||
    offer.selectionSignature !== preparation.planSignature ||
    resolution.selectionRulesVersion !== preparation.selectionRulesVersion ||
    resolution.selectionContentRevision !== preparation.selectionContentRevision
  ) {
    return null;
  }

  const transfigurationMappings = resolution.cardTransfigurations ?? [];
  const transfigurations = resolvedTransfigurationViews(
    transfigurationMappings,
    state,
    content,
  );
  if (transfigurations === null) return null;

  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const purged = purgedSnapshots.flatMap((entry) => {
    const card = deckCardChoice(entry, content);
    return card === null ? [] : [card];
  });
  if (
    purged.length !== purgedSnapshots.length ||
    purged.some((card) =>
      state.deck.some((entry) => entry.entryId === card.entryId),
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.entryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.model.cardId),
      resolution.purgedCardIds,
    )
  ) {
    return null;
  }
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...purgedSnapshots],
  };
  if (
    !hasUsableCompoundActionPreparation(action, offer, stateBefore, content)
  ) {
    return null;
  }

  const keywordMappings = resolution.cardKeywordChanges ?? [];
  const keywordChanges = keywordMappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entry === undefined ||
      base === undefined ||
      base.id !== mapping.cardId ||
      JSON.stringify(entry.keywordModification ?? null) !==
        JSON.stringify(mapping.after)
    ) {
      return [];
    }
    const before = deckCardChoice(
      { ...entry, keywordModification: mapping.before },
      content,
    );
    const after = deckCardChoice(entry, content);
    return before === null || after === null
      ? []
      : [
          {
            entryId: mapping.entryId,
            cardId: mapping.cardId,
            beforeKeywordModification: mapping.before,
            afterKeywordModification: mapping.after,
            before,
            after,
          } satisfies ExplorationKeywordChangeView,
        ];
  });
  if (
    keywordChanges.length !== keywordMappings.length ||
    new Set(keywordChanges.map((mapping) => mapping.entryId)).size !==
      keywordChanges.length
  ) {
    return null;
  }

  const nightmareMappings = resolution.nightmareGains ?? [];
  const nightmares = nightmareMappings.flatMap((mapping) => {
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const card = entry === undefined ? null : deckCardChoice(entry, content);
    return card !== null &&
      mapping.cardId === NIGHTMARE_CARD_ID &&
      card.model.cardId === NIGHTMARE_CARD_ID
      ? [card]
      : [];
  });
  if (
    nightmares.length !== nightmareMappings.length ||
    new Set(nightmares.map((card) => card.entryId)).size !== nightmares.length
  ) {
    return null;
  }

  const copyMappings = resolution.cardCopies ?? [];
  const copies = copyMappings.flatMap((mapping) => {
    const sourceEntry = state.deck.find(
      (entry) => entry.entryId === mapping.sourceEntryId,
    );
    const copyEntry = state.deck.find(
      (entry) => entry.entryId === mapping.mintedEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const copy =
      copyEntry === undefined ? null : deckCardChoice(copyEntry, content);
    return source !== null &&
      copy !== null &&
      source.model.cardId === mapping.sourceCardId &&
      copy.model.cardId === mapping.mintedCardId &&
      source.model.cardId === copy.model.cardId
      ? [{ source, copy }]
      : [];
  });
  if (
    copies.length !== copyMappings.length ||
    new Set(copies.map((pair) => pair.copy.entryId)).size !== copies.length
  ) {
    return null;
  }

  const hasExactSelectionKeys = (expected: readonly string[]) => {
    if (resolution.selection === undefined) return false;
    const keys = Object.keys(resolution.selection).sort();
    return sameOrderedIds(keys, [...expected].sort());
  };
  const matchesPreparedTransfigurations = (
    targets: readonly {
      readonly entryId: DeckEntryId;
      readonly cardId: CardId;
      readonly transfiguration: TransfigurationType;
    }[],
  ) =>
    transfigurationMappings.length === targets.length &&
    transfigurationMappings.every((mapping, index) => {
      const target = targets[index];
      return (
        target !== undefined &&
        mapping.entryId === target.entryId &&
        mapping.cardId === target.cardId &&
        mapping.afterTransfiguration === target.transfiguration
      );
    });
  const matchesNightmareGains = () =>
    sameOrderedIds(
      nightmares.map((card) => card.entryId),
      resolution.gainedEntryIds ?? [],
    ) &&
    sameOrderedIds(
      nightmares.map((card) => card.model.cardId),
      resolution.gainedCardIds,
    );

  switch (action.effectKind) {
    case "transfigure-all-cards":
      return preparation.kind === "all-card-transfiguration" &&
        hasExactSelectionKeys([]) &&
        purged.length === 0 &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 0 &&
        matchesPreparedTransfigurations(preparation.targets) &&
        sameOrderedIds(
          transfigurations.map((mapping) => mapping.entryId),
          resolution.affectedEntryIds,
        ) &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], []) &&
        sameOrderedIds(resolution.gainedCardIds, [])
        ? {
            kind: "multi-card-transfiguration",
            sourceKind: "transfigure-all-cards",
            transfigurations,
          }
        : null;
    case "purge-disclosed-and-transfigure-same-type": {
      const selectedIds = persistedSelectionIds(resolution);
      return preparation.kind === "purge-disclosed-transfigure-same-type" &&
        preparation.target !== null &&
        hasExactSelectionKeys(["entryIds"]) &&
        selectedIds !== null &&
        sameOrderedIds(selectedIds, [preparation.target.entryId]) &&
        purged.length === 1 &&
        purged[0]?.entryId === preparation.target.entryId &&
        purged[0]?.model.cardId === preparation.target.cardId &&
        matchesPreparedTransfigurations(preparation.companionTargets) &&
        sameOrderedIds(resolution.affectedEntryIds, [
          preparation.target.entryId,
          ...preparation.companionTargets.map((target) => target.entryId),
        ]) &&
        resolution.resolvedCardType === preparation.target.effectiveCardType &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 0 &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], []) &&
        sameOrderedIds(resolution.gainedCardIds, [])
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    case "make-predicate-fast-and-gain-nightmares":
      return preparation.kind === "predicate-fast-nightmares" &&
        hasExactSelectionKeys([]) &&
        resolution.resolvedPredicate === preparation.predicate &&
        purged.length === 0 &&
        transfigurations.length === 0 &&
        keywordChanges.length === preparation.targets.length &&
        keywordMappings.every((mapping, index) => {
          const target = preparation.targets[index];
          return (
            target !== undefined &&
            mapping.entryId === target.entryId &&
            mapping.cardId === target.cardId &&
            JSON.stringify(mapping.after) ===
              JSON.stringify({ ...(mapping.before ?? {}), fast: true })
          );
        }) &&
        sameOrderedIds(
          resolution.affectedEntryIds,
          preparation.targets.map((target) => target.entryId),
        ) &&
        nightmares.length === preparation.nightmareCount &&
        matchesNightmareGains() &&
        copies.length === 0
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    case "take-transfigured-cards-and-gain-nightmares": {
      const selectedCardIds = persistedSelectionCardIds(resolution);
      const selectedPrepared =
        preparation.kind === "take-transfigured-nightmares" &&
        selectedCardIds !== null
          ? selectedCardIds.flatMap((cardId) => {
              const prepared = preparation.offeredCards.find(
                (offer) => offer.cardId === cardId,
              );
              return prepared === undefined ? [] : [prepared];
            })
          : [];
      return preparation.kind === "take-transfigured-nightmares" &&
        hasExactSelectionKeys(["cardIds"]) &&
        selectedCardIds !== null &&
        selectedPrepared.length === selectedCardIds.length &&
        transfigurationMappings.length === selectedPrepared.length &&
        transfigurationMappings.every((mapping, index) => {
          const prepared = selectedPrepared[index];
          return (
            prepared !== undefined &&
            mapping.cardId === prepared.cardId &&
            mapping.afterTransfiguration === prepared.transfiguration
          );
        }) &&
        resolution.resolvedPredicate === preparation.predicate &&
        sameOrderedIds(
          resolution.affectedEntryIds,
          transfigurations.map((mapping) => mapping.entryId),
        ) &&
        purged.length === 0 &&
        keywordChanges.length === 0 &&
        nightmares.length === preparation.nightmareCount &&
        sameOrderedIds(resolution.gainedEntryIds ?? [], [
          ...transfigurations.map((mapping) => mapping.entryId),
          ...nightmares.map((card) => card.entryId),
        ]) &&
        sameOrderedIds(resolution.gainedCardIds, [
          ...selectedCardIds,
          ...nightmares.map((card) => card.model.cardId),
        ]) &&
        copies.length === 0
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    case "purge-one-transfigure-and-copy-others": {
      const selectedIds = persistedSelectionIds(resolution);
      const selectedId = selectedIds?.[0];
      const companionTargets =
        preparation.kind === "purge-transfigure-copy"
          ? preparation.targets.filter(
              (target) => target.entryId !== selectedId,
            )
          : [];
      return preparation.kind === "purge-transfigure-copy" &&
        hasExactSelectionKeys(["entryIds"]) &&
        selectedIds?.length === 1 &&
        preparation.targets.some((target) => target.entryId === selectedId) &&
        purged.length === 1 &&
        purged[0]?.entryId === selectedId &&
        purged[0]?.model.cardId ===
          preparation.targets.find((target) => target.entryId === selectedId)
            ?.cardId &&
        matchesPreparedTransfigurations(companionTargets) &&
        sameOrderedIds(resolution.affectedEntryIds, [
          selectedId,
          ...companionTargets.map((target) => target.entryId),
        ]) &&
        keywordChanges.length === 0 &&
        nightmares.length === 0 &&
        copies.length === 3 &&
        copyMappings.every((mapping, index) => {
          const target = companionTargets[index];
          return (
            target !== undefined &&
            mapping.sourceEntryId === target.entryId &&
            mapping.sourceCardId === target.cardId &&
            mapping.mintedCardId === target.cardId
          );
        }) &&
        sameOrderedIds(
          resolution.gainedEntryIds ?? [],
          copyMappings.map((mapping) => mapping.mintedEntryId),
        ) &&
        sameOrderedIds(
          resolution.gainedCardIds,
          companionTargets.map((target) => target.cardId),
        )
        ? {
            kind: "compound-card-mutation",
            sourceKind: action.effectKind,
            purged,
            transfigurations,
            keywordChanges,
            nightmares,
            copies,
          }
        : null;
    }
    default:
      return null;
  }
}

function multiCardReplacementRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "replace-selected" ||
    (action.count ?? 1) <= 1
  ) {
    return null;
  }
  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...purgedSnapshots],
  };
  if (
    !hasUsableMultiCardReplacementPreparation(
      action,
      offer,
      stateBefore,
      content,
    )
  ) {
    return null;
  }
  const persisted = resolution.cardReplacements ?? [];
  const selectedIds = persistedSelectionIds(resolution);
  const sourceIds = persisted.map((mapping) => mapping.sourceEntryId);
  const replacementIds = persisted.map((mapping) => mapping.replacementEntryId);
  if (
    selectedIds === null ||
    persisted.length === 0 ||
    persisted.length > (action.count ?? 0) ||
    persisted.length !== purgedSnapshots.length ||
    new Set(sourceIds).size !== sourceIds.length ||
    new Set(replacementIds).size !== replacementIds.length ||
    !sameOrderedIds(sourceIds, selectedIds) ||
    !sameOrderedIds(
      purgedSnapshots.map((snapshot) => snapshot.entryId),
      selectedIds,
    ) ||
    !sameOrderedIds(selectedIds, resolution.affectedEntryIds) ||
    !sameOrderedIds(selectedIds, resolution.purgedEntryIds ?? []) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.sourceCardId),
      resolution.purgedCardIds,
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.replacementEntryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.replacementCardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  const snapshotsByEntryId = new Map(
    purgedSnapshots.map((entry) => [entry.entryId, entry]),
  );
  const preparedByEntryId = new Map(
    explorationOfferPlan(offer, "multi-card-replacement")?.bindings.map(
      (binding) => [binding.sourceEntryId, binding],
    ),
  );
  const replacements = persisted.flatMap((mapping) => {
    const prepared = preparedByEntryId.get(mapping.sourceEntryId);
    const sourceEntry = snapshotsByEntryId.get(mapping.sourceEntryId);
    const replacementEntry = state.deck.find(
      (entry) => entry.entryId === mapping.replacementEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const replacement =
      replacementEntry === undefined
        ? null
        : deckCardChoice(replacementEntry, content);
    if (
      prepared === undefined ||
      source === null ||
      replacement === null ||
      prepared.sourceCardId !== mapping.sourceCardId ||
      prepared.replacementCardId !== mapping.replacementCardId ||
      source.model.cardId !== mapping.sourceCardId ||
      replacement.model.cardId !== mapping.replacementCardId
    ) {
      return [];
    }
    return [{ purged: source, gained: replacement }];
  });
  return replacements.length === persisted.length
    ? {
        kind: "card-replacements",
        sourceKind: "replace-selected",
        replacements,
      }
    : null;
}

function randomFixedCardReplacementRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "replace-random-with-card" ||
    action.cardId === undefined ||
    action.predicate === undefined
  ) {
    return null;
  }
  const snapshots = resolution.purgedEntrySnapshots ?? [];
  const stateBefore: JourneyState = {
    ...state,
    deck: [...state.deck, ...snapshots],
  };
  if (
    !hasUsableRandomDeckTargetPreparation(action, offer, stateBefore, content)
  ) {
    return null;
  }
  const preparation = explorationOfferPlan(offer, "random-deck-target");
  const target = preparation?.targets[0];
  const mapping = resolution.cardReplacements?.[0];
  const sourceSnapshot = snapshots[0];
  if (
    preparation === undefined ||
    preparation.targets.length !== 1 ||
    target === undefined ||
    resolution.cardReplacements?.length !== 1 ||
    mapping === undefined ||
    snapshots.length !== 1 ||
    sourceSnapshot === undefined ||
    resolution.selection === undefined ||
    Object.keys(resolution.selection).length !== 0 ||
    mapping.sourceEntryId !== target.entryId ||
    mapping.sourceCardId !== target.cardId ||
    mapping.replacementCardId !== action.cardId ||
    sourceSnapshot.entryId !== mapping.sourceEntryId ||
    !sameOrderedIds(resolution.affectedEntryIds, [mapping.sourceEntryId]) ||
    !sameOrderedIds(resolution.purgedEntryIds ?? [], [mapping.sourceEntryId]) ||
    !sameOrderedIds(resolution.purgedCardIds, [mapping.sourceCardId]) ||
    !sameOrderedIds(resolution.gainedEntryIds ?? [], [
      mapping.replacementEntryId,
    ]) ||
    !sameOrderedIds(resolution.gainedCardIds, [mapping.replacementCardId])
  ) {
    return null;
  }
  const replacementEntry = state.deck.find(
    (entry) => entry.entryId === mapping.replacementEntryId,
  );
  const purged = deckCardChoice(sourceSnapshot, content);
  const gained =
    replacementEntry === undefined
      ? null
      : deckCardChoice(replacementEntry, content);
  if (
    purged === null ||
    gained === null ||
    purged.model.cardId !== mapping.sourceCardId ||
    gained.model.cardId !== mapping.replacementCardId
  ) {
    return null;
  }
  return {
    kind: "card-replacements",
    sourceKind: "replace-random-with-card",
    replacements: [{ purged, gained }],
  };
}

function randomCardCopiesRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    resolution === null ||
    offer === undefined ||
    action.effectKind !== "copy-random-cards" ||
    !hasUsableRandomDeckTargetPreparation(action, offer, state, content)
  ) {
    return null;
  }
  const preparation = explorationOfferPlan(offer, "random-deck-target");
  const mappings = resolution.cardCopies ?? [];
  if (
    preparation === undefined ||
    mappings.length !== action.count ||
    new Set(mappings.map((mapping) => mapping.mintedEntryId)).size !==
      mappings.length ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.sourceEntryId),
      preparation.targets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.sourceEntryId),
      resolution.affectedEntryIds,
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.mintedEntryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.mintedCardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  const pairs = mappings.flatMap((mapping, index) => {
    const target = preparation.targets[index];
    const sourceEntry = state.deck.find(
      (entry) => entry.entryId === mapping.sourceEntryId,
    );
    const copyEntry = state.deck.find(
      (entry) => entry.entryId === mapping.mintedEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const copy =
      copyEntry === undefined ? null : deckCardChoice(copyEntry, content);
    if (
      target === undefined ||
      source === null ||
      copy === null ||
      target.cardId !== mapping.sourceCardId ||
      source.model.cardId !== mapping.sourceCardId ||
      copy.model.cardId !== mapping.mintedCardId ||
      mapping.sourceCardId !== mapping.mintedCardId
    ) {
      return [];
    }
    return [{ source, copy }];
  });
  return pairs.length === mappings.length
    ? { kind: "card-copies-multiple", pairs, count: pairs.length }
    : null;
}

function cardTypeChangesRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  const isDisclosed =
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "offered";
  const isChosen =
    action.effectKind === "change-card-type-selected" &&
    action.deckTarget === "chosen";
  if (
    resolution === null ||
    offer === undefined ||
    (!isDisclosed && !isChosen) ||
    (isDisclosed &&
      !hasUsableDisclosedDeckTargetPreparation(
        action,
        offer,
        state,
        content,
        true,
      ))
  ) {
    return null;
  }
  const mappings = resolution.cardTypeChanges ?? [];
  let preparedTargets: Array<{ entryId: DeckEntryId; cardId: CardId }>;
  if (isDisclosed) {
    const disclosedTarget = explorationOfferPlan(
      offer,
      "disclosed-deck-target",
    )?.target;
    if (disclosedTarget === undefined || disclosedTarget === null) return null;
    preparedTargets = [disclosedTarget];
  } else {
    preparedTargets = mappings.map((mapping) => ({
      entryId: mapping.entryId,
      cardId: mapping.cardId,
    }));
  }
  const expectedCount = 1;
  if (
    action.cardType === undefined ||
    resolution.resolvedCardType !== action.cardType ||
    mappings.length !== expectedCount ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.entryId),
      preparedTargets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      mappings.map((mapping) => mapping.entryId),
      resolution.affectedEntryIds,
    )
  ) {
    return null;
  }
  const changes = mappings.flatMap((mapping, index) => {
    const target = preparedTargets[index];
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      target === undefined ||
      entry === undefined ||
      base === undefined ||
      target.cardId !== mapping.cardId ||
      base.id !== mapping.cardId ||
      mapping.beforeCardType === mapping.afterCardType ||
      mapping.afterCardType !== action.cardType ||
      mapping.afterTypeChange.cardType !== mapping.afterCardType ||
      JSON.stringify(entry.typeChange ?? null) !==
        JSON.stringify(mapping.afterTypeChange)
    ) {
      return [];
    }
    const before = deckCardChoice(
      { ...entry, typeChange: mapping.beforeTypeChange },
      content,
    );
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.displaySnapshot.cardType !== mapping.beforeCardType ||
      after.model.displaySnapshot.cardType !== mapping.afterCardType
    ) {
      return [];
    }
    return [{ ...mapping, before, after }];
  });
  return changes.length === mappings.length
    ? {
        kind: "card-type-changes",
        sourceKind: "change-card-type-selected",
        changes,
      }
    : null;
}

function multiCardTransfigurationRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (
    resolution === null ||
    !(
      (action.effectKind === "transfigure-selected" &&
        (action.count ?? 1) > 1) ||
      (action.effectKind === "transfigure-fixed-selected" &&
        (action.count ?? 1) > 1) ||
      action.effectKind === "transfigure-random-cards" ||
      action.effectKind === "transfigure-fixed-random-cards"
    )
  ) {
    return null;
  }
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    offer === undefined ||
    !hasUsableMultiCardTransfigurationPreparation(action, offer, state, content)
  ) {
    return null;
  }
  const preparation = explorationOfferPlan(offer, "multi-card-transfiguration");
  const persisted = resolution.cardTransfigurations ?? [];
  const authoredCount = action.count ?? 0;
  const persistedEntryIds = persisted.map((mapping) => mapping.entryId);
  const chosenMode =
    preparation?.mode === "chosen-flexible" ||
    preparation?.mode === "chosen-fixed";
  const selectedIds = chosenMode ? persistedSelectionIds(resolution) : null;
  if (
    preparation === undefined ||
    persisted.length !== authoredCount ||
    persisted.length === 0 ||
    new Set(persistedEntryIds).size !== persistedEntryIds.length ||
    (chosenMode &&
      (selectedIds === null ||
        !sameOrderedIds(persistedEntryIds, selectedIds))) ||
    !sameOrderedIds(persistedEntryIds, resolution.affectedEntryIds) ||
    (preparation.mode !== "chosen-flexible" &&
      preparation.mode !== "chosen-fixed" &&
      (!sameOrderedIds(
        persisted.map((mapping) => mapping.entryId),
        preparation.targets.map((target) => target.entryId),
      ) ||
        persisted.some((mapping, index) => {
          const target = preparation.targets[index];
          return (
            target === undefined ||
            mapping.cardId !== target.cardId ||
            mapping.afterTransfiguration !== target.transfiguration
          );
        }))) ||
    (preparation.mode === "chosen-fixed" &&
      persisted.some(
        (mapping) => mapping.afterTransfiguration !== action.transfiguration,
      ))
  ) {
    return null;
  }
  const eligibleByEntryId = new Map(
    preparation.eligibleCards.map((binding) => [binding.entryId, binding]),
  );
  const transfigurations = persisted.flatMap((mapping) => {
    const binding = eligibleByEntryId.get(mapping.entryId);
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      binding === undefined ||
      entry === undefined ||
      base === undefined ||
      mapping.cardId !== binding.cardId ||
      mapping.cardId !== base.id ||
      mapping.beforeTransfiguration !== null ||
      !binding.transfigurations.includes(mapping.afterTransfiguration) ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  if (transfigurations.length !== persisted.length) return null;
  return {
    kind: "multi-card-transfiguration",
    sourceKind: action.effectKind,
    transfigurations,
  };
}

function starterCardTransfigurationRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  if (
    action.effectKind !== "transfigure-random-starter-cards" &&
    action.effectKind !== "transfigure-all-starter-cards"
  ) {
    return null;
  }
  const offer = runtime.actionOffers.find(
    (candidate) => candidate.actionId === action.id,
  );
  if (
    offer === undefined ||
    !hasUsableStarterCardTransfigurationPreparation(
      action,
      offer,
      state,
      content,
    )
  ) {
    return null;
  }
  const preparation = explorationOfferPlan(
    offer,
    "starter-card-transfiguration",
  );
  const persisted = resolution.starterCardTransfigurations ?? [];
  if (
    preparation === undefined ||
    preparation.unavailableReason !== undefined ||
    persisted.length === 0 ||
    persisted.length !== preparation.targets.length ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.entryId),
      preparation.targets.map((target) => target.entryId),
    ) ||
    !sameOrderedIds(
      persisted.map((mapping) => mapping.entryId),
      resolution.affectedEntryIds,
    )
  ) {
    return null;
  }
  const transfigurations = persisted.flatMap((mapping, index) => {
    const target = preparation.targets[index];
    const entry = state.deck.find(
      (candidate) => candidate.entryId === mapping.entryId,
    );
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      target === undefined ||
      entry === undefined ||
      base === undefined ||
      !hasStarterCardRole(base) ||
      mapping.cardId !== base.id ||
      mapping.cardId !== target.cardId ||
      mapping.beforeTransfiguration !== null ||
      mapping.afterTransfiguration !== target.transfiguration ||
      entry.transfiguration !== mapping.afterTransfiguration
    ) {
      return [];
    }
    const before = deckCardChoice({ ...entry, transfiguration: null }, content);
    const after = deckCardChoice(entry, content);
    if (
      before === null ||
      after === null ||
      before.model.cardId !== mapping.cardId ||
      after.model.cardId !== mapping.cardId ||
      before.model.transfiguration !== undefined ||
      after.model.transfiguration?.type !== mapping.afterTransfiguration
    ) {
      return [];
    }
    return [
      {
        ...mapping,
        before,
        after: {
          ...after,
          model: {
            ...after.model,
            transfiguration: after.model.transfiguration,
          },
        },
      },
    ];
  });
  if (transfigurations.length !== persisted.length) return null;
  return {
    kind: "starter-card-transfiguration",
    sourceKind: action.effectKind,
    transfigurations,
  };
}

function starterCardRewardForResolution(
  action: ExplorationActionContent,
  runtime: ExplorationSiteRuntime,
  state: JourneyState,
  content: JourneyContent,
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const sourceKind = action.effectKind;
  if (
    sourceKind !== "purge-starter-card" &&
    sourceKind !== "purge-random-starter-card" &&
    sourceKind !== "purge-random-starter-and-gain-card" &&
    sourceKind !== "replace-all-starter-cards"
  ) {
    return null;
  }
  const purgedSnapshots = resolution.purgedEntrySnapshots ?? [];
  const purged = purgedSnapshots.flatMap((entry) => {
    const choice = deckCardChoice(entry, content);
    return choice === null ? [] : [choice];
  });
  if (
    purged.length !== purgedSnapshots.length ||
    !sameOrderedIds(
      purged.map((card) => card.entryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      purged.map((card) => card.model.cardId),
      resolution.purgedCardIds,
    )
  ) {
    return null;
  }
  const persistedPairs = resolution.starterCardReplacements ?? [];
  if (
    sourceKind === "purge-starter-card" ||
    sourceKind === "purge-random-starter-card"
  ) {
    if (purged.length !== 1 || persistedPairs.length !== 0) return null;
    return {
      kind: "starter-card-mutation",
      sourceKind,
      mode: "purge",
      purged,
      replacements: [],
    };
  }
  if (
    persistedPairs.length !== purged.length ||
    (sourceKind === "purge-random-starter-and-gain-card" &&
      persistedPairs.length !== 1)
  ) {
    return null;
  }
  const purgedByEntryId = new Map(purged.map((card) => [card.entryId, card]));
  const replacements = persistedPairs.flatMap((pair) => {
    const purgedCard = purgedByEntryId.get(pair.purgedEntryId);
    const gainedEntry = state.deck.find(
      (entry) => entry.entryId === pair.gainedEntryId,
    );
    const gainedCard =
      gainedEntry === undefined ? null : deckCardChoice(gainedEntry, content);
    if (
      purgedCard === undefined ||
      purgedCard.model.cardId !== pair.purgedCardId ||
      gainedCard === null ||
      gainedCard.model.cardId !== pair.gainedCardId
    ) {
      return [];
    }
    return [{ purged: purgedCard, gained: gainedCard }];
  });
  if (
    replacements.length !== persistedPairs.length ||
    !sameOrderedIds(
      persistedPairs.map((pair) => pair.purgedEntryId),
      resolution.purgedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      persistedPairs.map((pair) => pair.purgedCardId),
      resolution.purgedCardIds,
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.purged.entryId),
      persistedPairs.map((pair) => pair.purgedEntryId),
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.gained.entryId),
      resolution.gainedEntryIds ?? [],
    ) ||
    !sameOrderedIds(
      replacements.map((pair) => pair.gained.model.cardId),
      resolution.gainedCardIds,
    )
  ) {
    return null;
  }
  return {
    kind: "starter-card-mutation",
    sourceKind,
    mode: "replace",
    purged,
    replacements,
  };
}

/** The reward presentation for an Exploration site's resolved action, or null while unresolved. */
export function rewardForResolution(
  runtime: ExplorationSiteRuntime,
  siteId: SiteId,
  state: JourneyState,
  content: JourneyContent,
  sceneNode: DreamscapeNode | null,
  actions: readonly ExplorationActionContent[],
  actionViews: readonly ExplorationActionView[],
): ExplorationSiteView["reward"] {
  const resolution = runtime.resolution;
  if (resolution === null) return null;
  const resolvedAction = actions.find(
    (action) => action.id === resolution.actionId,
  );
  const resolvedActionView = actionViews.find(
    (action) => action.id === resolution.actionId,
  );
  const resolvedEffectAnnouncement =
    resolvedActionView === undefined && resolvedAction === undefined
      ? "Exploration effect resolved"
      : resolvedActionView !== undefined
        ? annotatedTextValue(resolvedActionView.effectText)
        : unpreparedEffect(resolvedAction?.effectText ?? "");
  if (
    resolvedAction?.effectKind === "add-fixed-site" ||
    resolvedAction?.effectKind === "choose-site-type"
  ) {
    const insertion = resolution.siteInsertion;
    const targetNode =
      insertion === undefined
        ? undefined
        : state.atlas.nodes[insertion.targetNodeId];
    const insertedSite =
      insertion === undefined || targetNode === undefined
        ? undefined
        : targetNode.sites[insertion.insertionIndex];
    const siblingSiteIdsAfter =
      insertion === undefined || targetNode === undefined
        ? []
        : targetNode.sites
            .filter((_, index) => index !== insertion.insertionIndex)
            .map((site) => site.id);
    const selectedSiteType =
      resolvedAction.effectKind === "add-fixed-site"
        ? resolvedAction.siteType
        : resolution.selection?.siteType;
    const preparedChoice =
      resolvedAction.effectKind === "choose-site-type"
        ? explorationOfferPlan(
            runtime.actionOffers.find(
              (offer) => offer.actionId === resolvedAction.id,
            ),
            "site-type-choice",
          )?.choices.find((choice) => choice.siteType === selectedSiteType)
        : undefined;
    if (
      insertion === undefined ||
      typeof selectedSiteType !== "string" ||
      sceneNode === null ||
      sceneNode.id !== insertion.targetNodeId ||
      state.currentDreamscape !== insertion.targetNodeId ||
      targetNode !== sceneNode ||
      insertedSite === undefined ||
      targetNode.sites.length !== insertion.siblingSiteIdsBefore.length + 1 ||
      !sameOrderedIds(siblingSiteIdsAfter, insertion.siblingSiteIdsBefore) ||
      JSON.stringify(insertedSite) !== JSON.stringify(insertion.insertedSite) ||
      insertedSite.type !== selectedSiteType ||
      (resolvedAction.effectKind === "choose-site-type" &&
        (preparedChoice === undefined ||
          JSON.stringify(preparedChoice.insertedSite) !==
            JSON.stringify(insertion.insertedSite))) ||
      insertedSite.isEnhanced ||
      insertedSite.isVisited
    ) {
      return null;
    }
    const model: DreamscapeSiteModel = {
      id: insertedSite.id,
      type: insertedSite.type,
      isVisited: insertedSite.isVisited,
      pos: { x: 50, y: 50 },
      index: insertion.insertionIndex,
      isBattle: false,
      isLocked: false,
      isInteractive: false,
      label: siteTypeName(content.sitesData, insertedSite.type),
      blurb: siteTypeDescription(content.sitesData, insertedSite.type),
      icon: glyph(siteTypeIcon(content.sitesData, insertedSite.type)),
    };
    return {
      kind: "site-insertion",
      sourceKind: resolvedAction.effectKind,
      targetNodeId: insertion.targetNodeId,
      insertionIndex: insertion.insertionIndex,
      siblingSiteIdsBefore: insertion.siblingSiteIdsBefore,
      model,
    };
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "transfigure-all-cards" ||
      resolvedAction.effectKind ===
        "purge-disclosed-and-transfigure-same-type" ||
      resolvedAction.effectKind === "make-predicate-fast-and-gain-nightmares" ||
      resolvedAction.effectKind ===
        "take-transfigured-cards-and-gain-nightmares" ||
      resolvedAction.effectKind === "purge-one-transfigure-and-copy-others")
  ) {
    return compoundActionRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction !== undefined &&
    ((resolvedAction.effectKind === "transfigure-selected" &&
      (resolvedAction.count ?? 1) > 1) ||
      (resolvedAction.effectKind === "transfigure-fixed-selected" &&
        (resolvedAction.count ?? 1) > 1) ||
      resolvedAction.effectKind === "transfigure-random-cards" ||
      resolvedAction.effectKind === "transfigure-fixed-random-cards")
  ) {
    return multiCardTransfigurationRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "replace-selected" &&
    (resolvedAction.count ?? 1) > 1
  ) {
    return multiCardReplacementRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (resolvedAction?.effectKind === "replace-random-with-card") {
    return randomFixedCardReplacementRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (resolvedAction?.effectKind === "copy-random-cards") {
    return randomCardCopiesRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (resolvedAction?.effectKind === "change-card-type-selected") {
    return cardTypeChangesRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "purge-starter-card" ||
    resolvedAction?.effectKind === "purge-random-starter-card" ||
    resolvedAction?.effectKind === "purge-random-starter-and-gain-card" ||
    resolvedAction?.effectKind === "replace-all-starter-cards"
  ) {
    return starterCardRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction?.effectKind === "transfigure-random-starter-cards" ||
    resolvedAction?.effectKind === "transfigure-all-starter-cards"
  ) {
    return starterCardTransfigurationRewardForResolution(
      resolvedAction,
      runtime,
      state,
      content,
    );
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "gain-nightmare-and-dreamsign" ||
      resolvedAction.effectKind === "gain-nightmare-and-offered-dreamsign" ||
      resolvedAction.effectKind === "gain-offered-dreamsign" ||
      resolvedAction.effectKind === "replace-selected-dreamsign-with-offered" ||
      resolvedAction.effectKind === "replace-all-dreamsigns-random" ||
      resolvedAction.effectKind ===
        "purge-selected-dreamsign-and-gain-random") &&
    resolution.dreamsignMutation !== undefined
  ) {
    const mutation = resolution.dreamsignMutation;
    const replacements = mutation.replacements.flatMap((pair) => {
      const removed = dreamsignById(content, pair.removedDreamsignId);
      const gained = dreamsignById(content, pair.gainedDreamsignId);
      if (removed?.id === undefined || gained?.id === undefined) {
        return [];
      }
      return [
        {
          removed: toDreamsignView(removed),
          gained: toDreamsignView(gained),
        },
      ];
    });
    const dreamsignMutation = {
      before: dreamsignChoices(mutation.beforeIds, content),
      after: dreamsignChoices(mutation.afterIds, content),
      offered: dreamsignChoices(mutation.offeredIds, content),
      gained: dreamsignChoices(mutation.gainedIds, content),
      purged: dreamsignChoices(mutation.purgedIds, content),
      replacements,
      poolRegenerated: mutation.poolRegenerated,
    };
    if (
      resolvedAction.effectKind === "gain-nightmare-and-dreamsign" ||
      resolvedAction.effectKind === "gain-nightmare-and-offered-dreamsign"
    ) {
      const nightmareEntryIds = resolution.gainedEntryIds ?? [];
      const nightmares = nightmareEntryIds.flatMap((entryId) => {
        const entry = state.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        if (entry === undefined) return [];
        const card = deckCardChoice(entry, content);
        return card?.model.cardId === NIGHTMARE_CARD_ID ? [card] : [];
      });
      const persistedNightmareCount = resolution.gainedCardIds.filter(
        (cardId) => cardId === NIGHTMARE_CARD_ID,
      ).length;
      if (
        nightmares.length === persistedNightmareCount &&
        nightmares.length === resolvedAction.nightmareCount
      ) {
        return {
          kind: "nightmare-dreamsign-bundle",
          sourceKind: resolvedAction.effectKind,
          nightmares,
          ...dreamsignMutation,
        };
      }
      return null;
    }
    return {
      kind: "dreamsign-mutation",
      sourceKind: resolvedAction.effectKind,
      ...dreamsignMutation,
    };
  }
  if (
    resolvedAction !== undefined &&
    (resolvedAction.effectKind === "gain-essence" ||
      resolvedAction.effectKind === "gain-random-essence" ||
      resolvedAction.effectKind === "double-essence") &&
    resolution.essenceBefore !== undefined &&
    resolution.essenceAfter !== undefined
  ) {
    return {
      kind: "direct-essence",
      sourceKind: resolvedAction.effectKind,
      essenceBefore: resolution.essenceBefore,
      essenceGained: resolution.essenceGained,
      essenceAfter: resolution.essenceAfter,
      ...(resolution.essencePreparation === undefined
        ? {}
        : {
            minimumEssence: resolution.essencePreparation.minimumEssence,
            maximumEssence: resolution.essencePreparation.maximumEssence,
          }),
    };
  }
  if (resolvedAction?.effectKind === "purge-and-copy") {
    const purgedEntry = resolution.purgedEntrySnapshots?.[0];
    const purgedCard =
      purgedEntry === undefined ? null : deckCardChoice(purgedEntry, content);
    const sourceEntryId = resolution.affectedEntryIds[0];
    const sourceEntry = state.deck.find(
      (candidate) => candidate.entryId === sourceEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const cards = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (
      purgedCard !== null &&
      sourceEntryId !== undefined &&
      source !== null &&
      cards.length > 0
    ) {
      return {
        kind: "purge-and-copy",
        purgedCard,
        sourceEntryId,
        source,
        cards,
        count: cards.length,
      };
    }
  }
  if (resolvedAction?.effectKind === "copy-selected-cards") {
    const sources = resolution.affectedEntryIds.flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return [];
      const source = deckCardChoice(entry, content);
      return source === null ? [] : [source];
    });
    const copies = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return [];
      const copy = deckCardChoice(entry, content);
      return copy === null ? [] : [copy];
    });
    if (sources.length > 0 && sources.length === copies.length) {
      return {
        kind: "card-copies-multiple",
        pairs: sources.map((source, index) => ({
          source,
          copy: copies[index],
        })),
        count: copies.length,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "copy-selected-card" ||
    resolvedAction?.effectKind === "copy-offered-deck-card"
  ) {
    const sourceEntryId = resolution.affectedEntryIds[0];
    const sourceEntry = state.deck.find(
      (candidate) => candidate.entryId === sourceEntryId,
    );
    const source =
      sourceEntry === undefined ? null : deckCardChoice(sourceEntry, content);
    const cards = (resolution.gainedEntryIds ?? []).flatMap((entryId) => {
      const entry = state.deck.find(
        (candidate) => candidate.entryId === entryId,
      );
      if (entry === undefined) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (sourceEntryId !== undefined && source !== null && cards.length > 0) {
      return {
        kind: "card-copies",
        sourceEntryId,
        source,
        cards,
        count: cards.length,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "next-battle-opening-hand" ||
    resolvedAction?.effectKind === "next-battle-starting-energy"
  ) {
    const modifier = resolution.battleModifier;
    if (
      modifier !== undefined &&
      modifier.kind !== "smaller-hand-and-cost-discount"
    ) {
      return {
        kind: "battle-modifier",
        modifier: modifier.kind,
        amount: modifier.amount,
        battlesRemaining: modifier.battlesRemaining,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "next-battle-smaller-hand-and-cost-discount"
  ) {
    const modifier = resolution.battleModifier;
    if (modifier?.kind === "smaller-hand-and-cost-discount") {
      return {
        kind: "smaller-hand-and-cost-discount",
        openingHandDelta: modifier.openingHandDelta,
        energyCostReduction: modifier.energyCostReduction,
        battlesRemaining: modifier.battlesRemaining,
      };
    }
  }
  if (resolvedAction?.effectKind === "choose-avatar") {
    const currentId = resolution.chosenAvatarId;
    const current =
      currentId === undefined ? null : avatarById(content, currentId);
    const previous =
      resolution.previousAvatarId === undefined
        ? null
        : avatarById(content, resolution.previousAvatarId);
    if (current !== null) {
      return { kind: "avatar", previous, current };
    }
  }
  if (
    resolvedAction?.effectKind === "transfigure-next-draft-or-shop" &&
    resolution.siteOfferModifier !== undefined
  ) {
    return {
      kind: "site-offer-modifier",
      modifier: resolution.siteOfferModifier.kind,
      sourceSiteId: resolution.siteOfferModifier.sourceSiteId,
      sourceActionId: resolution.siteOfferModifier.sourceActionId,
    };
  }
  if (
    (resolvedAction?.effectKind === "free-next-shop" ||
      resolvedAction?.effectKind === "lose-half-essence-and-free-purchases") &&
    resolution.shopModifier !== undefined &&
    resolution.shopModifier.sourceSiteId === siteId &&
    resolution.shopModifier.sourceActionId === resolvedAction.id
  ) {
    if (
      resolvedAction.effectKind === "free-next-shop" &&
      resolution.shopModifier.kind === "free-next-shop"
    ) {
      return {
        kind: "shop-modifier",
        modifier: "free-next-shop",
        sourceSiteId: resolution.shopModifier.sourceSiteId,
        sourceActionId: resolution.shopModifier.sourceActionId,
      };
    }
    if (
      resolvedAction.effectKind === "lose-half-essence-and-free-purchases" &&
      resolution.shopModifier.kind === "free-purchases" &&
      resolution.shopModifier.initialCount === resolvedAction.count &&
      resolution.shopModifier.remainingCount === resolvedAction.count &&
      resolution.essenceBefore !== undefined &&
      resolution.essenceAfter !== undefined &&
      resolution.essenceSpent !== undefined &&
      resolution.essenceSpent === Math.floor(resolution.essenceBefore / 2) &&
      resolution.essenceAfter ===
        resolution.essenceBefore - resolution.essenceSpent
    ) {
      return {
        kind: "shop-modifier",
        modifier: "free-purchases",
        sourceSiteId: resolution.shopModifier.sourceSiteId,
        sourceActionId: resolution.shopModifier.sourceActionId,
        freePurchaseCount: resolution.shopModifier.initialCount,
        essenceBefore: resolution.essenceBefore,
        essenceSpent: resolution.essenceSpent,
        essenceAfter: resolution.essenceAfter,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "transfigure-selected" ||
    (resolvedAction?.effectKind === "transfigure-fixed-selected" &&
      (resolvedAction.count ?? 1) === 1)
  ) {
    const entryId = resolution.affectedEntryIds[0];
    const entry = state.deck.find((candidate) => candidate.entryId === entryId);
    const type =
      resolution.chosenTransfiguration ?? resolvedAction.transfiguration;
    const base =
      entry === undefined
        ? undefined
        : content.cardDatabase.get(entry.cardNumber);
    if (
      entryId !== undefined &&
      entry !== undefined &&
      type !== undefined &&
      base !== undefined
    ) {
      const before = resolveDeckEntryCard(content.transfigurationData, base, {
        ...entry,
        transfiguration: null,
      });
      const after = resolveDeckEntryCard(content.transfigurationData, base, {
        ...entry,
        transfiguration: type,
      });
      const display = buildTransfigurationDisplay(
        content.transfigurationData,
        base,
        type,
      ).display;
      return {
        kind: "transfiguration",
        entryId,
        before: modelForCard(before),
        after: {
          cardId: after.id,
          displaySnapshot: after,
          transfiguration: display,
        },
      };
    }
  }
  if (resolvedAction?.effectKind === "purge-dreamsign-for-essence") {
    const purgedDreamsignId = resolution.purgedDreamsignIds?.[0];
    const purgedDreamsign =
      purgedDreamsignId === undefined
        ? null
        : dreamsignById(content, purgedDreamsignId);
    if (purgedDreamsign !== null) {
      return {
        kind: "purged-dreamsign-essence",
        dreamsign: toDreamsignView(purgedDreamsign),
        totalEssence: resolution.essenceGained,
      };
    }
  }
  if (resolvedAction?.effectKind === "purge-for-essence") {
    const purgedEntry = resolution.purgedEntrySnapshots?.[0];
    const card =
      purgedEntry === undefined ? null : deckCardChoice(purgedEntry, content);
    if (card !== null) {
      return {
        kind: "purged-card-essence",
        card,
        spark: Math.max(0, card.model.displaySnapshot.spark ?? 0),
        essencePerSpark: authoredEssencePerSpark(resolvedAction),
        totalEssence: resolution.essenceGained,
      };
    }
  }
  if (
    resolvedAction?.effectKind === "gain-essence-per-card" &&
    resolvedAction.essencePerCard !== undefined &&
    resolvedAction.predicate !== undefined
  ) {
    return {
      kind: "essence",
      cards: resolution.affectedEntryIds.flatMap((entryId) => {
        const entry = state.deck.find(
          (candidate) => candidate.entryId === entryId,
        );
        if (entry === undefined) return [];
        const card = deckCardChoice(entry, content);
        return card === null ? [] : [card];
      }),
      predicate: resolvedAction.predicate,
      essencePerCard: resolvedAction.essencePerCard,
      totalEssence: resolution.essenceGained,
    };
  }
  const deckModification = (() => {
    if (resolvedAction === undefined) return null;
    const affectedEntryIds = new Set(resolution.affectedEntryIds);
    const cards = state.deck.flatMap((entry) => {
      if (!affectedEntryIds.has(entry.entryId)) return [];
      const card = deckCardChoice(entry, content);
      return card === null ? [] : [card];
    });
    if (cards.length === 0) return null;
    switch (resolvedAction.effectKind) {
      case "increase-spark-all":
      case "purge-random-subtype-and-increase-spark":
        return {
          kind: "spark" as const,
          amount: resolvedAction.sparkBonus ?? 1,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "make-fast-all":
        return {
          kind: "fast" as const,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "reduce-cost-all-and-gain-nightmares":
        return {
          kind: "energy-cost" as const,
          amount: resolvedAction.energyCostReduction ?? 0,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "change-subtype-all":
      case "change-subtype-selected":
        return {
          kind: "subtype" as const,
          subtype: resolution.chosenSubtype ?? null,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      case "purge-duplicates-and-grant-reclaim":
        return {
          kind: "reclaim" as const,
          announcement: resolvedEffectAnnouncement,
          cards,
          reclaimCostByEntryId: resolution.reclaimCostByEntryId ?? {},
        };
      case "transfigure-all-for-essence": {
        const transfiguration =
          resolution.chosenTransfiguration ?? resolvedAction.transfiguration;
        if (transfiguration === undefined) return null;
        return {
          kind: "transfiguration" as const,
          transfiguration,
          formName: transfigurationForm(
            content.transfigurationData,
            transfiguration,
          ).name,
          essenceSpent: resolution.essenceSpent ?? 0,
          announcement: resolvedEffectAnnouncement,
          cards,
        };
      }
      default:
        return null;
    }
  })();
  const cards = resolution.gainedCardIds.flatMap((cardId) => {
    const card = cardById(content, cardId);
    return card === null ? [] : [modelForCard(card)];
  });
  const purgedCards =
    resolvedAction?.effectKind === "purge-selected" ||
    resolvedAction?.effectKind === "purge-random-subtype-and-increase-spark"
      ? (resolution.purgedEntrySnapshots ?? []).flatMap((entry) => {
          const card = deckCardChoice(entry, content);
          return card === null ? [] : [card];
        })
      : resolvedAction?.effectKind === "purge-and-copy" ||
          resolvedAction?.effectKind === "purge-duplicates-and-grant-reclaim" ||
          resolvedAction?.effectKind === "replace-selected" ||
          resolvedAction?.effectKind === "replace-selected-with-card"
        ? resolution.purgedCardIds.flatMap((cardId, index) => {
            const card = cardById(content, cardId);
            if (card === null) return [];
            return [
              {
                entryId: parseDeckEntryId(
                  resolution.purgedEntryIds?.[index] ??
                    `purged:${String(index)}:${card.id}`,
                ),
                model: modelForCard(card),
                isBane: false,
              },
            ];
          })
        : [];
  const dreamsigns = resolution.gainedDreamsignIds.flatMap((dreamsignId) => {
    const dreamsign = state.dreamsigns.find(
      (candidate) => candidate.id === dreamsignId,
    );
    return dreamsign === undefined ? [] : [toDreamsignView(dreamsign)];
  });
  const semanticKind =
    resolvedAction?.effectKind === "purge-selected"
      ? "card-purge"
      : resolvedAction?.effectKind === "replace-selected" ||
          resolvedAction?.effectKind === "replace-selected-with-card"
        ? "card-replacement"
        : resolvedAction?.effectKind === "gain-offered-card" ||
            resolvedAction?.effectKind === "draft-card" ||
            resolvedAction?.effectKind === "take-cards" ||
            resolvedAction?.effectKind === "copy-selected-cards"
          ? "card-acquisition"
          : "objects";
  return cards.length === 0 &&
    purgedCards.length === 0 &&
    dreamsigns.length === 0 &&
    deckModification === null &&
    semanticKind === "objects"
    ? null
    : {
        semanticKind,
        objects: { cards, purgedCards: purgedCards, dreamsigns },
        deckModification,
      };
}
