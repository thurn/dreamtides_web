import { resolveDeckEntryCard } from "../../card-type-change";
import { createDreamsign } from "../../data/dreamsigns";
import { toJourneyDreamAvatar } from "../../data/dream-avatar-selection";
import {
  EXPLORATION_ESSENCE_PER_SPARK,
  explorationActionUsesSpecialVariable,
  explorationEncounterForCard,
  type ExplorationActionContent,
  type ExplorationPredicate,
} from "../../data/exploration";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import {
  hashStringToSeed,
  type JourneyContent,
} from "../../data/journey-content";
import { offeredTransfigurationForms } from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type {
  DeckEntry,
  Dreamsign,
  ExplorationActionOfferRuntime,
  ExplorationResolution,
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { mintEntryId } from "../../rules/journey/deck";
import {
  applyJourneyRewardEffect,
  type JourneyRewardEffect,
} from "../../rules/journey/reward-effects";

interface ExplorationSelection {
  entryIds?: unknown;
  transfiguration?: unknown;
  purgeEntryId?: unknown;
  copyEntryId?: unknown;
  cardIds?: unknown;
  packIndex?: unknown;
  subtype?: unknown;
  replacedDreamsignId?: unknown;
  dreamsignId?: unknown;
  dreamAvatarId?: unknown;
}

function idIndex(content: JourneyContent): ReadonlyMap<string, CardData> {
  return new Map(
    [...content.cardDatabase.values()].map((card) => [card.id.toLowerCase(), card]),
  );
}

function matchesPredicate(card: CardData, predicate: ExplorationPredicate): boolean {
  switch (predicate) {
    case "character":
      return card.cardType === "Character";
    case "event":
      return card.cardType === "Event";
    case "cheap-character":
      return card.cardType === "Character" && card.energyCost !== null && card.energyCost <= 2;
    case "spirit-animal":
      return card.cardType === "Character" && card.subtype === "Spirit Animal";
    case "survivor":
      return card.cardType === "Character" && card.subtype === "Survivor";
    case "warrior":
      return card.cardType === "Character" && card.subtype === "Warrior";
  }
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function catalogCandidates(
  content: JourneyContent,
  predicate: ExplorationPredicate,
  excludedCardId: string,
): CardData[] {
  const customCardIds = new Set(
    (content.exploration?.customCards ?? []).map((card) => card.id.toLowerCase()),
  );
  return [...content.cardDatabase.values()]
    .filter(
      (card) =>
        !customCardIds.has(card.id.toLowerCase()) &&
        card.id.toLowerCase() !== excludedCardId.toLowerCase() &&
        matchesPredicate(card, predicate),
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

function resolvedDeckCards(
  journey: JourneyState,
  content: JourneyContent,
): Array<{ entry: DeckEntry; card: CardData }> {
  return journey.deck.flatMap((entry) => {
    const base = content.cardDatabase.get(entry.cardNumber);
    return base === undefined
      ? []
      : [{ entry, card: resolveDeckEntryCard(base, entry) }];
  });
}

function usesDeckCardVariable(action: ExplorationActionContent): boolean {
  return explorationActionUsesSpecialVariable(action, "$DECK_CARD");
}

function isEligibleDeckCardVariableTarget(
  action: ExplorationActionContent,
  entry: DeckEntry,
  card: CardData,
): boolean {
  if (action.predicate !== undefined && !matchesPredicate(card, action.predicate)) {
    return false;
  }
  switch (action.effectKind) {
    case "change-subtype-selected":
      return (
        action.subtype !== undefined &&
        card.cardType === "Character" &&
        card.subtype !== action.subtype
      );
    case "transfigure-fixed-selected":
      return (
        entry.transfiguration === null &&
        action.transfiguration !== undefined &&
        offeredTransfigurationForms(card, null).some(
          (form) => form.type === action.transfiguration,
        )
      );
    case "transfigure-selected":
      return (
        entry.transfiguration === null &&
        offeredTransfigurationForms(card, null).length > 0
      );
    default:
      return true;
  }
}

function emptyOffer(actionId: string): ExplorationActionOfferRuntime {
  return {
    actionId,
    offeredCardIds: [],
    offeredDreamsignIds: [],
    offeredDeckEntryIds: [],
    offeredDreamAvatarIds: [],
    packCardIds: [],
    replacementCardIdByEntryId: {},
    transfigurationByEntryId: {},
  };
}

function buildActionOffer(
  action: ExplorationActionContent,
  journey: JourneyState,
  content: JourneyContent,
  rng: () => number,
  encounterCardId: string,
): ExplorationActionOfferRuntime {
  const offer = emptyOffer(action.id);
  if (action.effectKind === "gain-random-dreamsign") {
    const availableIds = new Set(
      content.dreamsignTemplates.map((dreamsign) => dreamsign.id.toLowerCase()),
    );
    const candidates = journey.remainingDreamsignPool.filter((id) =>
      availableIds.has(id.toLowerCase()),
    );
    const selected = shuffled(candidates, rng)[0];
    if (selected !== undefined) offer.offeredDreamsignIds = [selected];
    return offer;
  }
  if (action.effectKind === "copy-offered-deck-card") {
    offer.offeredDeckEntryIds = shuffled(journey.deck, rng)
      .slice(0, action.offerCount ?? 4)
      .map((entry) => entry.entryId);
    return offer;
  }
  if (action.effectKind === "choose-dream-avatar") {
    const currentId = journey.dreamAvatar?.id.toLowerCase();
    const candidates = content.dreamAvatars
      .filter((dreamAvatar) => dreamAvatar.id.toLowerCase() !== currentId)
      .sort((left, right) => left.id.localeCompare(right.id));
    offer.offeredDreamAvatarIds = shuffled(candidates, rng)
      .slice(0, action.offerCount ?? 3)
      .map((dreamAvatar) => dreamAvatar.id);
    return offer;
  }
  if (usesDeckCardVariable(action)) {
    const target = shuffled(
      resolvedDeckCards(journey, content).filter(
        ({ entry, card }) =>
          card.id.toLowerCase() !== encounterCardId.toLowerCase() &&
          isEligibleDeckCardVariableTarget(action, entry, card),
      ),
      rng,
    )[0];
    if (target !== undefined) offer.offeredDeckEntryIds = [target.entry.entryId];
    return offer;
  }
  if (action.predicate === undefined) return offer;

  const candidates = catalogCandidates(
    content,
    action.predicate,
    encounterCardId,
  );
  if (
    action.effectKind === "gain-offered-card" ||
    action.effectKind === "draft-card" ||
    action.effectKind === "take-cards" ||
    action.effectKind === "gain-random-cards"
  ) {
    const offerCount =
      action.effectKind === "gain-offered-card"
        ? 1
        : action.effectKind === "gain-random-cards"
          ? action.count ?? 1
          : action.offerCount ?? 4;
    offer.offeredCardIds = shuffled(candidates, rng)
      .slice(0, offerCount)
      .map((card) => card.id);
  } else if (action.effectKind === "choose-pack") {
    const ordered = shuffled(candidates, rng);
    const packCount = action.packCount ?? 2;
    const packSize = action.packSize ?? 3;
    offer.packCardIds = Array.from({ length: packCount }, (_, packIndex) =>
      ordered
        .slice(packIndex * packSize, (packIndex + 1) * packSize)
        .map((card) => card.id),
    ).filter((pack) => pack.length > 0);
  } else if (action.effectKind === "replace-selected") {
    const deckCards = resolvedDeckCards(journey, content).filter(({ card }) =>
      matchesPredicate(card, action.predicate as ExplorationPredicate),
    );
    for (const { entry, card } of deckCards) {
      const replacements = shuffled(
        candidates.filter((candidate) => candidate.id !== card.id),
        rng,
      );
      const replacement = replacements[0];
      if (replacement !== undefined) {
        offer.replacementCardIdByEntryId[entry.entryId] = replacement.id;
      }
    }
  }
  return offer;
}

/** Build the shared source-card encounter and every randomized follow-up offer. */
export function buildExplorationRuntime(
  journey: JourneyState,
  site: SiteState,
  content: JourneyContent,
  rng: () => number,
  encounterCardId?: string | null,
): ExplorationSiteRuntime | null {
  if (content.exploration === undefined) return null;
  const availableEncounters = content.exploration.encounters.filter(
    (encounter) => idIndex(content).has(encounter.cardId.toLowerCase()),
  );
  if (availableEncounters.length === 0) return null;
  const encounter =
    encounterCardId === undefined || encounterCardId === null
      ? availableEncounters[
          hashStringToSeed(`${journey.seed}:${site.id}:exploration-card`) %
            availableEncounters.length
        ]
      : availableEncounters.find(
          (candidate) =>
            candidate.cardId.toLowerCase() === encounterCardId.toLowerCase(),
        );
  if (encounter === undefined) return null;
  return {
    kind: "exploration",
    encounterCardId: encounter.cardId,
    actionOffers: encounter.actions.map((action) =>
      buildActionOffer(action, journey, content, rng, encounter.cardId),
    ),
    resolution: null,
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    return null;
  }
  const strings = value as string[];
  return new Set(strings).size === strings.length ? strings : null;
}

function cardForEntry(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): { entry: DeckEntry; card: CardData } | null {
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;
  const base = content.cardDatabase.get(entry.cardNumber);
  return base === undefined ? null : { entry, card: resolveDeckEntryCard(base, entry) };
}

function cardIdForEntry(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): string | null {
  return cardForEntry(journey, content, entryId)?.card.id ?? null;
}

function addCardEffect(
  content: JourneyContent,
  cardId: string,
): JourneyRewardEffect | null {
  const card = idIndex(content).get(cardId.toLowerCase());
  if (card === undefined) return null;
  return {
    kind: "add_catalog_card",
    cardUuid: card.id,
    cardNumber: card.cardNumber,
  };
}

function deckTarget(
  journey: JourneyState,
  content: JourneyContent,
  entryId: string,
): { entryId: string; cardUuid: string; cardNumber: number } | null {
  const entry = journey.deck.find((candidate) => candidate.entryId === entryId);
  if (entry === undefined) return null;
  const card = content.cardDatabase.get(entry.cardNumber);
  return card === undefined
    ? null
    : { entryId, cardUuid: card.id, cardNumber: card.cardNumber };
}

function addDreamsign(
  journey: JourneyState,
  content: JourneyContent,
  dreamsignId: string,
  replacedDreamsignId: string | null,
): JourneyState | null {
  const custom = content.exploration?.customDreamsigns.find(
    (dreamsign) => dreamsign.id?.toLowerCase() === dreamsignId.toLowerCase(),
  );
  const template = content.dreamsignTemplates.find(
    (dreamsign) => dreamsign.id.toLowerCase() === dreamsignId.toLowerCase(),
  );
  const reward: Dreamsign | null =
    custom ?? (template === undefined ? null : createDreamsign(template));
  if (reward === null) return null;

  let dreamsigns: Dreamsign[];
  if (journey.dreamsigns.length >= journey.maxDreamsigns) {
    if (replacedDreamsignId === null) return null;
    const index = journey.dreamsigns.findIndex(
      (dreamsign) => dreamsign.id === replacedDreamsignId,
    );
    if (index < 0) return null;
    dreamsigns = journey.dreamsigns.map((dreamsign, candidateIndex) =>
      candidateIndex === index ? reward : dreamsign,
    );
  } else {
    dreamsigns = [...journey.dreamsigns, reward];
  }
  return {
    ...journey,
    dreamsigns,
    remainingDreamsignPool: journey.remainingDreamsignPool.filter(
      (id) => id.toLowerCase() !== dreamsignId.toLowerCase(),
    ),
  };
}

function typeChange(subtype: string) {
  return {
    predicateId: `exploration:subtype:${subtype.toLowerCase().split(" ").join("-")}`,
    cardType: "Character" as const,
    subtype,
    label: subtype,
  };
}

function baseResolution(actionId: string): ExplorationResolution {
  return {
    actionId,
    selection: {},
    gainedCardIds: [],
    gainedEntryIds: [],
    gainedDreamsignIds: [],
    purgedCardIds: [],
    purgedEntryIds: [],
    purgedEntrySnapshots: [],
    purgedDreamsignIds: [],
    affectedEntryIds: [],
    essenceGained: 0,
  };
}

function withResolution(
  journey: JourneyState,
  siteId: string,
  runtime: ExplorationSiteRuntime,
  resolution: ExplorationResolution,
): JourneyState {
  return {
    ...journey,
    siteRuntime: {
      ...journey.siteRuntime,
      [siteId]: { ...runtime, resolution },
    },
  };
}

/** Apply one selected action atomically while keeping the site open for its response. */
export function resolveExplorationChoice(input: {
  journey: JourneyState;
  site: SiteState;
  payload: Record<string, unknown>;
  seq: number;
  content: JourneyContent;
}): JourneyState | null {
  const { journey, site, payload, seq, content } = input;
  if (site.type !== "Exploration" || journey.visitedSites.includes(site.id)) return null;
  const runtime = journey.siteRuntime[site.id];
  if (runtime?.kind !== "exploration" || runtime.resolution !== null) return null;
  if (content.exploration === undefined) return null;
  const actionId = stringValue(payload.actionId);
  if (actionId === null) return null;
  const encounter = explorationEncounterForCard(content.exploration, runtime.encounterCardId);
  const action = encounter?.actions.find((candidate) => candidate.id === actionId);
  const offer = runtime.actionOffers.find((candidate) => candidate.actionId === actionId);
  if (action === undefined || offer === undefined) return null;
  const selection =
    typeof payload.selection === "object" && payload.selection !== null
      ? (payload.selection as ExplorationSelection)
      : {};
  if (usesDeckCardVariable(action)) {
    const entryIds = stringArray(selection.entryIds);
    if (
      entryIds === null ||
      entryIds.length !== 1 ||
      offer.offeredDeckEntryIds?.length !== 1 ||
      entryIds[0] !== offer.offeredDeckEntryIds[0]
    ) {
      return null;
    }
  }
  const result = baseResolution(actionId);
  let next = journey;
  let mintIndex = 0;

  const applyReward = (effect: JourneyRewardEffect): boolean => {
    const applied = applyJourneyRewardEffect({
      state: next,
      journeyContent: content,
      effect,
      mintEntryId: (deck) => mintEntryId(deck, seq, mintIndex++),
    });
    if (applied === null) return false;
    next = applied;
    return true;
  };

  const addCardIds = (cardIds: readonly string[]): boolean => {
    const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
    const children = cardIds.map((cardId) => addCardEffect(content, cardId));
    if (children.some((child) => child === null)) return false;
    if (!applyReward({
      kind: "composite",
      children: children as JourneyRewardEffect[],
    })) return false;
    result.gainedCardIds.push(...cardIds);
    result.gainedEntryIds?.push(
      ...next.deck
        .filter((entry) => !beforeEntryIds.has(entry.entryId))
        .map((entry) => entry.entryId),
    );
    return true;
  };

  const duplicateEntry = (entryId: string, count: number): boolean => {
    if (!Number.isInteger(count) || count <= 0) return false;
    const target = deckTarget(next, content, entryId);
    const cardId = cardIdForEntry(next, content, entryId);
    if (target === null || cardId === null) return false;
    const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
    if (
      !applyReward({
        kind: "composite",
        children: Array.from({ length: count }, () => ({
          kind: "duplicate_deck_entry" as const,
          ...target,
        })),
      })
    ) {
      return false;
    }
    result.gainedCardIds.push(...Array.from({ length: count }, () => cardId));
    result.gainedEntryIds?.push(
      ...next.deck
        .filter((entry) => !beforeEntryIds.has(entry.entryId))
        .map((entry) => entry.entryId),
    );
    result.affectedEntryIds.push(entryId);
    return true;
  };

  switch (action.effectKind) {
    case "copy-selected-card": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate)) ||
        !duplicateEntry(entryIds[0], action.count ?? 1)
      ) {
        return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "copy-selected-cards": {
      const entryIds = stringArray(selection.entryIds);
      const count = action.count ?? 2;
      if (
        entryIds === null ||
        !Number.isInteger(count) ||
        count <= 0 ||
        entryIds.length !== count
      ) {
        return null;
      }
      for (const entryId of entryIds) {
        if (!duplicateEntry(entryId, 1)) return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "copy-offered-deck-card": {
      const entryIds = stringArray(selection.entryIds);
      if (
        entryIds === null ||
        entryIds.length !== 1 ||
        !(offer.offeredDeckEntryIds ?? []).includes(entryIds[0]) ||
        !duplicateEntry(entryIds[0], 1)
      ) {
        return null;
      }
      result.selection = { entryIds };
      break;
    }
    case "next-battle-opening-hand": {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count <= 0) return null;
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "opening_hand_bonus",
            count,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "opening-hand",
        amount: count,
        battlesRemaining: 1,
      };
      break;
    }
    case "next-battle-starting-energy": {
      const count = action.count ?? 1;
      if (!Number.isInteger(count) || count <= 0) return null;
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "starting_energy_bonus",
            count,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "starting-energy",
        amount: count,
        battlesRemaining: 1,
      };
      break;
    }
    case "next-battle-smaller-hand-and-cost-discount": {
      next = {
        ...next,
        battleModifiers: [
          ...next.battleModifiers,
          {
            kind: "smaller_hand_and_cost_discount",
            openingHandDelta: -1,
            energyCostReduction: 1,
            battlesRemaining: 1,
            source: `exploration:${site.id}:${action.id}`,
          },
        ],
      };
      result.battleModifier = {
        kind: "smaller-hand-and-cost-discount",
        openingHandDelta: -1,
        energyCostReduction: 1,
        battlesRemaining: 1,
      };
      break;
    }
    case "choose-dream-avatar": {
      const dreamAvatarId = stringValue(selection.dreamAvatarId);
      if (
        dreamAvatarId === null ||
        !(offer.offeredDreamAvatarIds ?? []).includes(dreamAvatarId)
      ) {
        return null;
      }
      const dreamAvatar = content.dreamAvatars.find(
        (candidate) => candidate.id.toLowerCase() === dreamAvatarId.toLowerCase(),
      );
      if (dreamAvatar === undefined) return null;
      result.previousDreamAvatarId = next.dreamAvatar?.id;
      result.chosenDreamAvatarId = dreamAvatar.id;
      result.selection = { dreamAvatarId: dreamAvatar.id };
      next = {
        ...next,
        dreamAvatar: toJourneyDreamAvatar(dreamAvatar),
        resolvedPackage:
          next.resolvedPackage === null
            ? null
            : { ...next.resolvedPackage, dreamAvatar },
      };
      break;
    }
    case "purge-duplicates-and-grant-reclaim": {
      const resolved = resolvedDeckCards(next, content);
      const counts = new Map<string, number>();
      for (const { card } of resolved) {
        const key = card.id.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      const purged = resolved.filter(
        ({ card }) => (counts.get(card.id.toLowerCase()) ?? 0) > 1,
      );
      const survivors = resolved.filter(
        ({ card }) => (counts.get(card.id.toLowerCase()) ?? 0) === 1,
      );
      const purgeTargets = purged.map(({ entry }) =>
        deckTarget(next, content, entry.entryId),
      );
      const survivorTargets = survivors.map(({ entry }) =>
        deckTarget(next, content, entry.entryId),
      );
      if (
        purgeTargets.some((target) => target === null) ||
        survivorTargets.some((target) => target === null)
      ) {
        return null;
      }
      const reclaimCostByEntryId = Object.fromEntries(
        survivors.map(({ entry, card }) => [
          entry.entryId,
          Math.max(0, card.energyCost ?? 0),
        ]),
      );
      if (
        !applyReward({
          kind: "composite",
          children: [
            ...(purgeTargets as Array<NonNullable<(typeof purgeTargets)[number]>>).map(
              (target) => ({ kind: "remove_deck_entry" as const, ...target }),
            ),
            ...(survivorTargets as Array<NonNullable<(typeof survivorTargets)[number]>>).map(
              (target) => ({
                kind: "change_deck_entry_keywords" as const,
                ...target,
                keywords: { setReclaim: reclaimCostByEntryId[target.entryId] },
              }),
            ),
          ],
        })
      ) {
        return null;
      }
      result.purgedCardIds.push(...purged.map(({ card }) => card.id));
      result.purgedEntryIds?.push(...purged.map(({ entry }) => entry.entryId));
      result.affectedEntryIds.push(...survivors.map(({ entry }) => entry.entryId));
      result.reclaimCostByEntryId = reclaimCostByEntryId;
      break;
    }
    case "purge-and-copy": {
      const purgeEntryId = stringValue(selection.purgeEntryId);
      const copyEntryId = stringValue(selection.copyEntryId);
      if (purgeEntryId === null || copyEntryId === null || purgeEntryId === copyEntryId) return null;
      const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
      const purged = next.deck.find((entry) => entry.entryId === purgeEntryId);
      const purgeCardId = cardIdForEntry(next, content, purgeEntryId);
      const copied = next.deck.find((entry) => entry.entryId === copyEntryId);
      const copiedCardId = cardIdForEntry(next, content, copyEntryId);
      const purgeTarget = deckTarget(next, content, purgeEntryId);
      const copyTarget = deckTarget(next, content, copyEntryId);
      if (
        purged === undefined ||
        purgeCardId === null ||
        copied === undefined ||
        copiedCardId === null ||
        purgeTarget === null ||
        copyTarget === null ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...purgeTarget },
            { kind: "duplicate_deck_entry", ...copyTarget },
          ],
        })
      ) return null;
      result.purgedCardIds.push(purgeCardId);
      result.purgedEntryIds?.push(purgeEntryId);
      result.purgedEntrySnapshots?.push(purged);
      result.gainedCardIds.push(copiedCardId);
      result.gainedEntryIds?.push(
        ...next.deck
          .filter((entry) => !beforeEntryIds.has(entry.entryId))
          .map((entry) => entry.entryId),
      );
      result.affectedEntryIds.push(copyEntryId);
      result.selection = { purgeEntryId, copyEntryId };
      break;
    }
    case "gain-dreamsign": {
      if (action.dreamsignId === undefined) return null;
      const added = addDreamsign(
        next,
        content,
        action.dreamsignId,
        stringValue(selection.replacedDreamsignId),
      );
      if (added === null) return null;
      next = added;
      result.gainedDreamsignIds.push(action.dreamsignId);
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      result.selection =
        replacedDreamsignId === null ? {} : { replacedDreamsignId };
      break;
    }
    case "gain-random-dreamsign": {
      const dreamsignId = offer.offeredDreamsignIds?.[0];
      if (dreamsignId === undefined) return null;
      const added = addDreamsign(
        next,
        content,
        dreamsignId,
        stringValue(selection.replacedDreamsignId),
      );
      if (added === null) return null;
      next = added;
      result.gainedDreamsignIds.push(dreamsignId);
      const replacedDreamsignId = stringValue(selection.replacedDreamsignId);
      result.selection =
        replacedDreamsignId === null ? {} : { replacedDreamsignId };
      break;
    }
    case "gain-card": {
      if (action.cardId === undefined || !addCardIds([action.cardId])) return null;
      break;
    }
    case "gain-offered-card": {
      const cardIds = stringArray(selection.cardIds);
      const copies = action.count ?? 1;
      if (
        cardIds === null ||
        cardIds.length !== 1 ||
        !offer.offeredCardIds.includes(cardIds[0]) ||
        !Number.isInteger(copies) ||
        copies <= 0 ||
        !addCardIds(Array.from({ length: copies }, () => cardIds[0]))
      ) {
        return null;
      }
      result.selection = { cardIds };
      break;
    }
    case "transfigure-selected": {
      const entryIds = stringArray(selection.entryIds);
      const required = action.count ?? 1;
      if (required !== 1 || entryIds === null || entryIds.length !== 1) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (selected === null) return null;
      if (
        action.predicate !== undefined &&
        !matchesPredicate(selected.card, action.predicate)
      ) return null;
      const transfiguration = offeredTransfigurationForms(
        selected.card,
        selected.entry.transfiguration,
      ).find((form) => form.type === selection.transfiguration)?.type;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        transfiguration === undefined ||
        target === null ||
        !applyReward({
          kind: "transfigure_deck_entry",
          ...target,
          transfiguration,
        })
      ) return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenTransfiguration = transfiguration;
      break;
    }
    case "purge-selected": {
      const entryIds = stringArray(selection.entryIds);
      const required = action.count ?? 1;
      if (entryIds === null || entryIds.length !== required) return null;
      const predicate = action.predicate;
      const selected = entryIds.map((entryId) => cardForEntry(next, content, entryId));
      if (selected.some((entry) =>
        entry === null ||
        (predicate !== undefined && !matchesPredicate(entry.card, predicate)))) return null;
      const targets = entryIds.map((entryId) => deckTarget(next, content, entryId));
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (targets as Array<NonNullable<(typeof targets)[number]>>).map(
            (target) => ({ kind: "remove_deck_entry", ...target }),
          ),
        })
      ) return null;
      result.purgedCardIds.push(...selected.map((entry) => (entry as { card: CardData }).card.id));
      result.purgedEntryIds?.push(...entryIds);
      result.selection = { entryIds };
      break;
    }
    case "choose-pack": {
      const packIndex = selection.packIndex;
      if (typeof packIndex !== "number" || !Number.isInteger(packIndex)) return null;
      const pack = offer.packCardIds[packIndex];
      if (pack === undefined || !addCardIds(pack)) return null;
      break;
    }
    case "draft-card": {
      const cardIds = stringArray(selection.cardIds);
      if (cardIds === null || cardIds.length !== 1 || !offer.offeredCardIds.includes(cardIds[0])) return null;
      const copies = action.count ?? 1;
      if (!Number.isInteger(copies) || copies <= 0) return null;
      if (!addCardIds(Array.from({ length: copies }, () => cardIds[0]))) return null;
      result.selection = { cardIds };
      break;
    }
    case "purge-dreamsign-for-essence": {
      const dreamsignId = stringValue(selection.dreamsignId);
      if (dreamsignId === null || action.essence === undefined) return null;
      const targetIndex = next.dreamsigns.findIndex(
        (dreamsign) => dreamsign.id?.toLowerCase() === dreamsignId.toLowerCase(),
      );
      if (targetIndex < 0 || !Number.isFinite(action.essence) || action.essence <= 0) {
        return null;
      }
      next = {
        ...next,
        dreamsigns: next.dreamsigns.filter((_dreamsign, index) => index !== targetIndex),
      };
      if (!applyReward({ kind: "add_essence", amount: action.essence })) return null;
      result.purgedDreamsignIds = [
        ...(result.purgedDreamsignIds ?? []),
        dreamsignId,
      ];
      result.essenceGained = action.essence;
      result.selection = { dreamsignId };
      break;
    }
    case "purge-for-essence": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (selected === null) return null;
      const essenceGained =
        Math.max(0, selected.card.spark ?? 0) *
        (action.essencePerSpark ?? EXPLORATION_ESSENCE_PER_SPARK);
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...target },
            { kind: "add_essence", amount: essenceGained },
          ],
        })
      ) return null;
      result.purgedCardIds.push(selected.card.id);
      result.purgedEntryIds?.push(entryIds[0]);
      result.purgedEntrySnapshots?.push(selected.entry);
      result.essenceGained = essenceGained;
      result.selection = { entryIds };
      break;
    }
    case "change-subtype-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1 || action.subtype === undefined) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        selected.card.cardType !== "Character" ||
        selected.card.subtype === action.subtype ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate))
      ) return null;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "change_deck_entry_type",
          ...target,
          typeChange: typeChange(action.subtype),
        })
      ) return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenSubtype = action.subtype;
      result.selection = { entryIds };
      break;
    }
    case "change-subtype-all": {
      const subtype = stringValue(selection.subtype);
      if (subtype === null || !action.subtypeOptions?.includes(subtype)) return null;
      const affected = resolvedDeckCards(next, content)
        .filter(({ card }) => card.cardType === "Character")
        .map(({ entry }) => entry.entryId);
      const targets = affected.map((entryId) => deckTarget(next, content, entryId));
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (targets as Array<NonNullable<(typeof targets)[number]>>).map(
            (target) => ({
              kind: "change_deck_entry_type",
              ...target,
              typeChange: typeChange(subtype),
            }),
          ),
        })
      ) return null;
      result.affectedEntryIds.push(...affected);
      result.chosenSubtype = subtype;
      break;
    }
    case "take-cards": {
      const cardIds = stringArray(selection.cardIds);
      if (cardIds === null || cardIds.some((cardId) => !offer.offeredCardIds.includes(cardId))) return null;
      if (!addCardIds(cardIds)) return null;
      result.selection = { cardIds };
      break;
    }
    case "replace-selected-with-card": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1 || action.cardId === undefined) {
        return null;
      }
      const selected = cardForEntry(next, content, entryIds[0]);
      const target = deckTarget(next, content, entryIds[0]);
      const replacement = addCardEffect(content, action.cardId);
      if (
        selected === null ||
        target === null ||
        replacement === null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate))
      ) {
        return null;
      }
      const beforeEntryIds = new Set(next.deck.map((entry) => entry.entryId));
      if (
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...target },
            replacement,
          ],
        })
      ) {
        return null;
      }
      result.purgedCardIds.push(selected.card.id);
      result.purgedEntryIds?.push(entryIds[0]);
      result.gainedCardIds.push(action.cardId);
      result.gainedEntryIds?.push(
        ...next.deck
          .filter((entry) => !beforeEntryIds.has(entry.entryId))
          .map((entry) => entry.entryId),
      );
      result.selection = { entryIds };
      break;
    }
    case "replace-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1) return null;
      const replacementId = offer.replacementCardIdByEntryId[entryIds[0]];
      const purgedCardId = cardIdForEntry(next, content, entryIds[0]);
      const target = deckTarget(next, content, entryIds[0]);
      const replacement = replacementId === undefined
        ? null
        : addCardEffect(content, replacementId);
      if (
        replacementId === undefined ||
        purgedCardId === null ||
        target === null ||
        replacement === null ||
        !applyReward({
          kind: "composite",
          children: [
            { kind: "remove_deck_entry", ...target },
            replacement,
          ],
        })
      ) return null;
      result.purgedCardIds.push(purgedCardId);
      result.gainedCardIds.push(replacementId);
      break;
    }
    case "gain-nightmare-and-card": {
      if (action.cardId === undefined) return null;
      const nightmares = Array.from(
        { length: action.nightmareCount ?? 1 },
        () => NIGHTMARE_CARD_ID,
      );
      if (!addCardIds(nightmares) || !addCardIds([action.cardId])) return null;
      break;
    }
    case "gain-random-cards": {
      if (offer.offeredCardIds.length === 0 || !addCardIds(offer.offeredCardIds)) return null;
      break;
    }
    case "transfigure-fixed-selected": {
      const entryIds = stringArray(selection.entryIds);
      if (entryIds === null || entryIds.length !== 1 || action.transfiguration === undefined) return null;
      const selected = cardForEntry(next, content, entryIds[0]);
      if (
        selected === null ||
        selected.entry.transfiguration !== null ||
        (action.predicate !== undefined &&
          !matchesPredicate(selected.card, action.predicate)) ||
        !offeredTransfigurationForms(selected.card, null).some(
          (form) => form.type === action.transfiguration,
        )
      ) return null;
      const target = deckTarget(next, content, entryIds[0]);
      if (
        target === null ||
        !applyReward({
          kind: "transfigure_deck_entry",
          ...target,
          transfiguration: action.transfiguration,
        })
      ) return null;
      result.affectedEntryIds.push(entryIds[0]);
      result.chosenTransfiguration = action.transfiguration;
      result.selection = { entryIds };
      break;
    }
    case "transfigure-next-draft-or-shop": {
      const modifier = {
        kind: "transfigure-next-draft-or-shop" as const,
        sourceSiteId: site.id,
        sourceActionId: action.id,
      };
      next = {
        ...next,
        siteOfferModifiers: [...next.siteOfferModifiers, modifier],
      };
      result.siteOfferModifier = modifier;
      break;
    }
    case "gain-essence-per-card": {
      if (action.predicate === undefined || action.essencePerCard === undefined) {
        return null;
      }
      const matchingCards = resolvedDeckCards(next, content).filter(({ card }) =>
        matchesPredicate(card, action.predicate as ExplorationPredicate),
      );
      const essenceGained = matchingCards.length * action.essencePerCard;
      if (!applyReward({ kind: "add_essence", amount: essenceGained })) return null;
      result.affectedEntryIds.push(
        ...matchingCards.map(({ entry }) => entry.entryId),
      );
      result.essenceGained = essenceGained;
      break;
    }
    case "increase-spark-all": {
      const sparkBonus = action.sparkBonus ?? 1;
      const affectedEntryIds = resolvedDeckCards(next, content)
        .filter(({ card }) => card.cardType === "Character")
        .map(({ entry }) => entry.entryId);
      const targets = affectedEntryIds.map((entryId) => deckTarget(next, content, entryId));
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (targets as Array<NonNullable<(typeof targets)[number]>>).map(
            (target) => ({
              kind: "add_deck_entry_spark_bonus",
              ...target,
              amount: sparkBonus,
            }),
          ),
        })
      ) return null;
      result.affectedEntryIds.push(...affectedEntryIds);
      break;
    }
    case "make-fast-all": {
      const targets = next.deck.map((entry) => deckTarget(next, content, entry.entryId));
      if (
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: (targets as Array<NonNullable<(typeof targets)[number]>>).map(
            (target) => ({
              kind: "change_deck_entry_keywords",
              ...target,
              keywords: { fast: true },
            }),
          ),
        })
      ) return null;
      result.affectedEntryIds.push(...next.deck.map((entry) => entry.entryId));
      break;
    }
    case "reduce-cost-all-and-gain-nightmares": {
      if (
        action.energyCostReduction === undefined ||
        action.nightmareCount === undefined ||
        !Number.isInteger(action.nightmareCount) ||
        action.nightmareCount <= 0
      ) return null;
      const affectedEntryIds = next.deck.map((entry) => entry.entryId);
      const targets = affectedEntryIds.map((entryId) => deckTarget(next, content, entryId));
      const nightmare = addCardEffect(content, NIGHTMARE_CARD_ID);
      if (
        nightmare === null ||
        targets.some((target) => target === null) ||
        !applyReward({
          kind: "composite",
          children: [
            ...(targets as Array<NonNullable<(typeof targets)[number]>>).map(
              (target) => ({
                kind: "reduce_deck_entry_energy_cost" as const,
                ...target,
                amount: action.energyCostReduction as number,
              }),
            ),
            ...Array.from({ length: action.nightmareCount }, () => nightmare),
          ],
        })
      ) return null;
      result.affectedEntryIds.push(...affectedEntryIds);
      result.gainedCardIds.push(
        ...Array.from({ length: action.nightmareCount }, () => NIGHTMARE_CARD_ID),
      );
      break;
    }
  }

  return withResolution(next, site.id, runtime, result);
}
