// Reward templates.
//
// Ported from the CLI's `src/journey/shared/rewards.ts`. Every template
// implements the `Reward<P>` contract from `./types`: rollParams, cec,
// viable, and render. The viability audit (Task 9) walked every template
// and tightened `viable` where the CLI shipped a stand-in. The applied
// upgrades, by smell pattern:
//
//   - Deck-scope leak (catalog vs. deck): predicate-keyed rewards that
//     mutate deck state (purge_*, duplicate_*, transform_*, modify_*,
//     make_*, apply_named_transfiguration_to_(chosen|random|all)_predicate_
//     cards) routed through `deckContainsPredicate(ctx, predicateId, N)`,
//     which pins `source: "deck"`. The CLI shipped
//     `cardMatches(ctx, predicate.cardPredicate ?? {}).length >= N`, which
//     silently resolved over the catalog when the predicate omitted
//     `source`.
//   - Named-card lookup: rewards whose params name a SPECIFIC deck card
//     (duplicate_named_card_X, transform_card_in_deck_into_named,
//     make_card_reclaim, opening_hand_grant_for_X_battles,
//     temporary_card_copy_for_X_battles, change_card_to_become_type,
//     purge_named_starter) routed through `deckContainsCardByName`. The
//     CLI shipped `cardMatches(ctx, { source: "deck" }).length >= 1`
//     (or `starterCardCount >= 1`), which surfaced a no-op option when
//     the deck held different cards.
//   - Transfiguration eligibility: rewards applying a SPECIFIC
//     transfiguration to a named card require an untransfigured named entry
//     that passes the transfiguration's per-card eligibility filter. Predicate
//     random/all apply rewards gate on the same eligible untransfigured
//     concrete deck entries that apply mutates; choice paths keep the
//     `predicateAdmitsTransfiguration` soundness check for player selection.
//   - Random-cards-from-deck rewards (modify_random_cards_to_types,
//     make_random_cards_fast): CLI used `ctx.content.cards.length >= N`
//     (catalog). Upgraded to `deckHasMinSize(ctx, N)` so the option is
//     hidden when the deck is too small to act on.
//   - `apply_chosen_transfiguration_to_chosen_card`: CLI used
//     `ctx.content.cards.length > 0`. Upgraded to `deckHasMinSize(ctx, 1)`
//     because the player picks a card from the deck.
//   - Dreamsign-pool scope: gain_random_dreamsign, gain_named_dreamsign,
//     choose_1_of_X_dreamsigns, transform_dreamsign_to_named, and
//     temporary_dreamsign_for_X_battles consult
//     `ctx.state.quest.dreamsignPoolIds` rather than the full
//     `dreamsignMatches(ctx)` catalog. A reward that gains a dreamsign
//     from the catalog when the pool is empty would offer a non-fulfillable
//     option.
//   - Dreamwell-keyed templates (set_starting_dreamwell_positive,
//     shuffle_positive_dreamwell_cards): gate on
//     `POSITIVE_DREAMWELL_CARDS.length >= 1`. With dreamwell content a
//     stub (Task 17), these templates correctly hide themselves until
//     content lands. Mirrors the Task 8 treatment of the negative-side
//     dreamwell costs.
//   - Deck-size-N rewards (duplicate_chosen_cards, draw_X_and_duplicate_
//     chosen, make_random_cards_reclaim): inline `deck.summary.totalCards >=
//     N` upgraded to `deckHasMinSize` for consistency with the audit helpers.
//     apply_random_transfigurations_to_random_cards counts untransfigured
//     concrete deck entries so viability matches the apply target set.
//   - Resource and route/shop rewards: viable = `() => true`, matching the
//     CLI's stance. card_cost_reduction_for_X_battles is "always viable in
//     kind" — the discount applies even with an empty deck.

import type { DrawContext } from "../../util/rng";
import { drawInt, weightedChoice } from "../../util/rng";
import type { JourneyMutations } from "../../apply/JourneyMutations";
import { logSkippedVisualTemplate } from "../../apply/skipLog";
import type { DreamsignContent } from "../../content/types";
import type { JourneyContext } from "../context";
import { CARD_CEC, STAGE_MULTIPLIER, cardPoolCEC } from "./cec";
import {
  JOURNEY_REPLACEABLE_SITE_TYPES,
  JOURNEY_REWARDABLE_SITE_TYPES,
  JOURNEY_TRANSFIGURATIONS,
  baneCount,
  cardMatches,
  essenceAmount,
  isCardEligibleForTransfiguration,
  maxEssence,
  pickFromList,
  starterCardCount,
  transfigurationsEligibleForPredicate,
} from "./content";
import {
  findDeckEntriesByName,
  findDeckEntriesByPredicate,
  findFirstDeckEntryIdByCardName,
  findFirstStarterDeckEntryId,
  findProjectedDeckEntry,
  findUntransfiguredDeckEntriesByName,
  findUntransfiguredDeckEntriesByPredicate,
  findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration,
  findUntransfiguredDeckEntryIds,
  projectedDeckEntries,
} from "./deckEntries";
import { pickUniqueCardIds } from "./costs";
import { POSITIVE_DREAMWELL_CARDS } from "./dreamwell";
import { PREDICATES, getPredicate } from "./predicates";
import { quoteName } from "./text";
import type { Predicate, PredicateKind, Reward, TemplateParams } from "./types";
import {
  deckContainsCardByName,
  deckContainsPredicate,
  deckContainsUntransfiguredCardByName,
  deckContainsUntransfiguredPredicate,
  deckHasUntransfiguredMinSize,
  deckHasMinSize,
} from "./viability";

const POSITIVE_TEMPORARY_BATTLE_MIN = 3;
const POSITIVE_TEMPORARY_BATTLE_MAX = 3;
const BOOST_SITE_DURATION_DREAMSCAPES = 3;

type DreamsignForApply = Parameters<JourneyMutations["addDreamsign"]>[0];
type SiteTypeForApply = Parameters<JourneyMutations["addSiteToDreamscape"]>[1];
type TransfigurationForApply = Exclude<
  Parameters<JourneyMutations["transfigureDeckEntry"]>[1],
  null
>;
type CardTypeChangeForApply = Parameters<JourneyMutations["changeDeckEntryType"]>[1];

function applyDrawContext(ctx: JourneyContext): DrawContext {
  return {
    seed: ctx.state.quest.seed,
    contentVersion: ctx.contentVersion,
    rootJourneyIndex: 0,
  };
}

function rollPositiveTemporaryBattles(draw: DrawContext, label: string): number {
  return drawInt(draw, label, POSITIVE_TEMPORARY_BATTLE_MIN, POSITIVE_TEMPORARY_BATTLE_MAX);
}

function sentenceCase(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function indefiniteArticleFor(text: string): "a" | "an" {
  return /^[aeiou]/iu.test(text.trim()) ? "an" : "a";
}

function onlyActiveDreamsignName(ctx: JourneyContext): string | undefined {
  if (ctx.state.quest.activeDreamsigns.length !== 1) return undefined;
  const [{ dreamsignId }] = ctx.state.quest.activeDreamsigns;
  return ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === dreamsignId)?.name;
}

function poolDreamsignsById(ctx: JourneyContext) {
  const byId = new Map(ctx.content.dreamsigns.map((dreamsign) => [dreamsign.id, dreamsign]));
  return ctx.state.quest.dreamsignPoolIds.flatMap((id) => {
    const dreamsign = byId.get(id);
    return dreamsign ? [dreamsign] : [];
  });
}

function inactivePoolDreamsigns(ctx: JourneyContext) {
  const activeIds = new Set(ctx.state.quest.activeDreamsigns.map((entry) => entry.dreamsignId));
  return poolDreamsignsById(ctx).filter((dreamsign) => !activeIds.has(dreamsign.id));
}

function pickUniqueDreamsignIds(
  draw: DrawContext,
  label: string,
  pool: readonly DreamsignContent[],
  count: number,
): string[] {
  const remaining = [...pool];
  const picked: string[] = [];

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const dreamsign = pickFromList(draw, `${label}:${String(i)}`, remaining);
    picked.push(dreamsign.id);
    remaining.splice(
      remaining.findIndex((candidate) => candidate.id === dreamsign.id),
      1,
    );
  }

  return picked;
}

// Pull a string off a DreamsignContent's `raw` payload when present. The
// content bridge stores image fields conditionally (omitted when the source
// template has no value), so the lookup must tolerate both missing keys and
// non-string values.
function rawString(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === "string" ? value : undefined;
}

// Convert a journey-internal `DreamsignContent` into the quest-prototype's
// `Dreamsign` shape that `JourneyMutations.addDreamsign` expects. The
// `effectDescription` field maps from `renderedText` (which the content bridge
// itself sourced from the prototype's `effectDescription`). Optional image
// fields, if present in the source's `raw` payload, are forwarded; otherwise
// they are left undefined to match the prototype's optional-field convention.
function projectDreamsignForApply(source: DreamsignContent): DreamsignForApply {
  const imageName = rawString(source.raw, "image-name");
  const imageAlt = rawString(source.raw, "image-alt");
  return {
    id: source.id,
    name: source.name,
    effectDescription: source.renderedText,
    ...(imageName === undefined ? {} : { imageName }),
    ...(imageAlt === undefined ? {} : { imageAlt }),
    isBane: false,
  };
}

// Roll a transfiguration that is compatible with the given predicate's match
// set. Falls back to the canonical set when no transfiguration is applicable;
// the surrounding `viable` check filters out impossible combinations in that
// case.
function pickTransfigurationForPredicate(
  ctx: JourneyContext,
  draw: DrawContext,
  label: string,
  predicateId: string,
): string {
  const predicate = getPredicate(predicateId);
  const eligible = transfigurationsEligibleForPredicate(ctx, predicate.cardPredicate ?? {});
  const pool = eligible.length > 0 ? eligible : JOURNEY_TRANSFIGURATIONS;
  return pickFromList(draw, label, pool);
}

function pickUniqueDeckEntryIds(
  draw: DrawContext,
  label: string,
  entryIds: readonly string[],
  count: number,
): string[] {
  const remaining = [...entryIds];
  const picked: string[] = [];

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const entryId = pickFromList(draw, `${label}:${i}`, remaining);
    picked.push(entryId);
    remaining.splice(remaining.indexOf(entryId), 1);
  }

  return picked;
}

function transfigurationForApply(transfiguration: string): TransfigurationForApply {
  return transfiguration as TransfigurationForApply;
}

const SITE_TYPE_FOR_APPLY_BY_JOURNEY_LABEL: ReadonlyMap<string, SiteTypeForApply> = new Map([
  ["Battle", "Battle"],
  ["Draft", "Draft"],
  ["Essence", "Essence"],
  ["Shop", "Shop"],
  ["Specialty Shop", "SpecialtyShop"],
  ["SpecialtyShop", "SpecialtyShop"],
  ["Purge", "Purge"],
  ["Transfiguration", "Transfiguration"],
  ["Dreamsign Offering", "DreamsignOffering"],
  ["DreamsignOffering", "DreamsignOffering"],
  ["Dreamsign Draft", "DreamsignDraft"],
  ["DreamsignDraft", "DreamsignDraft"],
  ["Dream Journey", "DreamJourney"],
  ["DreamJourney", "DreamJourney"],
  ["Duplication", "Duplication"],
  ["Reward", "Reward"],
  ["Cleanse", "Cleanse"],
]);

function siteTypeForApply(templateId: string, siteLabel: string): SiteTypeForApply | undefined {
  const siteType = SITE_TYPE_FOR_APPLY_BY_JOURNEY_LABEL.get(siteLabel);
  if (siteType === undefined) {
    console.warn(
      `[journeys/apply] ${templateId} skipped: unknown site type ${JSON.stringify(siteLabel)}`,
    );
  }
  return siteType;
}

function pickRandomTransfigurationForEntry(
  ctx: JourneyContext,
  draw: DrawContext,
  templateId: string,
  label: string,
  entryId: string,
): TransfigurationForApply | undefined {
  const projected = findProjectedDeckEntry(ctx, entryId);
  const card = projected?.card;
  if (card === undefined) {
    warnSkippedCardApply(
      templateId,
      `catalog card for deck entry ${JSON.stringify(entryId)} was not found`,
    );
    return undefined;
  }
  const eligible = JOURNEY_TRANSFIGURATIONS.filter((transfiguration) =>
    isCardEligibleForTransfiguration(transfiguration, card),
  );
  if (eligible.length === 0) {
    warnSkippedCardApply(
      templateId,
      `no eligible transfigurations for deck entry ${JSON.stringify(entryId)}`,
    );
    return undefined;
  }
  return transfigurationForApply(pickFromList(draw, label, eligible));
}

function predicateAdmitsTransfiguration(
  ctx: JourneyContext,
  predicateId: string,
  transfiguration: string,
): boolean {
  // Every card matching the predicate must be eligible for the
  // transfiguration; otherwise the player could pick a card from the
  // predicate's pool that cannot legally receive the transfiguration.
  const predicate = getPredicate(predicateId);
  const matches = cardMatches(ctx, predicate.cardPredicate ?? {});
  if (matches.length === 0) {
    // Empty pool — let the outer viability check decide.
    return true;
  }
  return matches.every((card) => isCardEligibleForTransfiguration(transfiguration, card));
}

function resolveCardIdByName(ctx: JourneyContext, name: string): string | undefined {
  return ctx.content.cards.find((card) => card.name === name)?.id;
}

function warnSkippedCardApply(templateId: string, reason: string): void {
  console.warn(`[journeys/apply] ${templateId} skipped: ${reason}`);
}

function cardTypeChangeFromPredicate(
  predicateId: string,
): CardTypeChangeForApply | undefined {
  const predicate = getPredicate(predicateId);
  const cardType = predicate.cardPredicate?.cardType;
  if (cardType !== "Character" && cardType !== "Event") {
    return undefined;
  }
  return {
    predicateId,
    cardType,
    subtype: predicate.cardPredicate?.subtype ?? "",
    label: predicate.text.singular,
  };
}

function warnSkippedDreamsignApply(templateId: string, reason: string): void {
  console.warn(`[journeys/apply] ${templateId} skipped: ${reason}`);
}

function isJourneyTransfiguration(value: string): boolean {
  return JOURNEY_TRANSFIGURATIONS.includes(
    value as (typeof JOURNEY_TRANSFIGURATIONS)[number],
  );
}

function untransfiguredDeckEntriesEligibleForTransfiguration(
  ctx: JourneyContext,
  transfiguration: string,
): string[] {
  return findUntransfiguredDeckEntryIds(ctx).filter((entryId) => {
    const entry = findProjectedDeckEntry(ctx, entryId);
    return entry !== undefined && isCardEligibleForTransfiguration(transfiguration, entry.card);
  });
}

function eligibleTransfigurationsForUntransfiguredDeck(
  ctx: JourneyContext,
): TransfigurationForApply[] {
  return JOURNEY_TRANSFIGURATIONS.filter(
    (transfiguration) =>
      untransfiguredDeckEntriesEligibleForTransfiguration(ctx, transfiguration).length > 0,
  ).map(transfigurationForApply);
}

function selectedTransfiguration(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Reward["apply"]>[3],
): TransfigurationForApply | undefined {
  if (chooserResolution?.kind !== "transfiguration") {
    warnSkippedCardApply(templateId, "missing transfiguration chooser resolution");
    return undefined;
  }

  if (!isJourneyTransfiguration(chooserResolution.type)) {
    warnSkippedCardApply(
      templateId,
      `unknown transfiguration ${JSON.stringify(chooserResolution.type)}`,
    );
    return undefined;
  }

  if (untransfiguredDeckEntriesEligibleForTransfiguration(ctx, chooserResolution.type).length === 0) {
    warnSkippedCardApply(
      templateId,
      `no untransfigured deck entries are eligible for ${JSON.stringify(chooserResolution.type)}`,
    );
    return undefined;
  }

  return transfigurationForApply(chooserResolution.type);
}

function selectedExactDeckEntryIds(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Reward["apply"]>[3],
  count: number,
  eligibleEntryIds: readonly string[],
): string[] | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply(templateId, "missing card chooser resolution");
    return undefined;
  }

  if (chooserResolution.entryIds.length !== count) {
    warnSkippedCardApply(
      templateId,
      `expected exactly ${String(count)} selected card entries, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.cardIds !== undefined && chooserResolution.cardIds.length !== count) {
    warnSkippedCardApply(
      templateId,
      `expected exactly ${String(count)} selected card ids, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const uniqueEntryIds = new Set(chooserResolution.entryIds);
  if (uniqueEntryIds.size !== chooserResolution.entryIds.length) {
    warnSkippedCardApply(templateId, "card chooser resolution included duplicate entries");
    return undefined;
  }

  const eligible = new Set(eligibleEntryIds);
  const selectedEntryIds: string[] = [];
  for (const [index, entryId] of chooserResolution.entryIds.entries()) {
    const entry = findProjectedDeckEntry(ctx, entryId);
    if (entry === undefined) {
      warnSkippedCardApply(templateId, `deck entry ${JSON.stringify(entryId)} was not found`);
      return undefined;
    }

    const selectedCardId = chooserResolution.cardIds?.[index];
    if (selectedCardId !== undefined && selectedCardId !== entry.card.id) {
      warnSkippedCardApply(
        templateId,
        `chooser card ${JSON.stringify(selectedCardId)} did not match deck entry ${JSON.stringify(entryId)}`,
      );
      return undefined;
    }

    if (!eligible.has(entryId)) {
      warnSkippedCardApply(
        templateId,
        `deck entry ${JSON.stringify(entryId)} was not eligible for this chooser`,
      );
      return undefined;
    }

    selectedEntryIds.push(entryId);
  }

  return selectedEntryIds;
}

function selectedBoundedDeckEntryIds(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Reward["apply"]>[3],
  minCount: number,
  maxCount: number,
  eligibleEntryIds: readonly string[],
): string[] | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply(templateId, "missing card chooser resolution");
    return undefined;
  }

  if (
    chooserResolution.entryIds.length < minCount
    || chooserResolution.entryIds.length > maxCount
  ) {
    warnSkippedCardApply(
      templateId,
      `expected ${String(minCount)}-${String(maxCount)} selected card entries, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (
    chooserResolution.cardIds !== undefined
    && chooserResolution.cardIds.length !== chooserResolution.entryIds.length
  ) {
    warnSkippedCardApply(
      templateId,
      `expected ${String(chooserResolution.entryIds.length)} selected card ids, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const uniqueEntryIds = new Set(chooserResolution.entryIds);
  if (uniqueEntryIds.size !== chooserResolution.entryIds.length) {
    warnSkippedCardApply(templateId, "card chooser resolution included duplicate entries");
    return undefined;
  }

  const eligible = new Set(eligibleEntryIds);
  const selectedEntryIds: string[] = [];
  for (const [index, entryId] of chooserResolution.entryIds.entries()) {
    const entry = findProjectedDeckEntry(ctx, entryId);
    if (entry === undefined) {
      warnSkippedCardApply(templateId, `deck entry ${JSON.stringify(entryId)} was not found`);
      return undefined;
    }

    const selectedCardId = chooserResolution.cardIds?.[index];
    if (selectedCardId !== undefined && selectedCardId !== entry.card.id) {
      warnSkippedCardApply(
        templateId,
        `chooser card ${JSON.stringify(selectedCardId)} did not match deck entry ${JSON.stringify(entryId)}`,
      );
      return undefined;
    }

    if (!eligible.has(entryId)) {
      warnSkippedCardApply(
        templateId,
        `deck entry ${JSON.stringify(entryId)} was not eligible for this chooser`,
      );
      return undefined;
    }

    selectedEntryIds.push(entryId);
  }

  return selectedEntryIds;
}

function selectedExactRolledCardIds(
  templateId: string,
  chooserResolution: Parameters<Reward["apply"]>[3],
  count: number,
  rolledCardIds: readonly string[],
): string[] | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply(templateId, "missing card chooser resolution");
    return undefined;
  }

  if (chooserResolution.entryIds.length !== count) {
    warnSkippedCardApply(
      templateId,
      `expected exactly ${String(count)} selected card entries, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.cardIds !== undefined && chooserResolution.cardIds.length !== count) {
    warnSkippedCardApply(
      templateId,
      `expected exactly ${String(count)} selected card ids, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const uniqueEntryIds = new Set(chooserResolution.entryIds);
  if (uniqueEntryIds.size !== chooserResolution.entryIds.length) {
    warnSkippedCardApply(templateId, "card chooser resolution included duplicate entries");
    return undefined;
  }

  const selectedCardIds: string[] = [];
  for (const [resolutionIndex, selectedEntryId] of chooserResolution.entryIds.entries()) {
    const rolledMatch = /^rolled:([^:]+):(\d+)$/.exec(selectedEntryId);
    if (rolledMatch === null) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser entry ${JSON.stringify(selectedEntryId)} was malformed`,
      );
      return undefined;
    }

    const [, encodedCardId, rolledIndexText] = rolledMatch;
    const rolledIndex = Number.parseInt(rolledIndexText, 10);
    const cardId = rolledCardIds[rolledIndex];
    if (cardId === undefined) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser index ${String(rolledIndex)} was not found`,
      );
      return undefined;
    }

    if (cardId !== encodedCardId) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser card ${JSON.stringify(encodedCardId)} did not match rolled index ${String(rolledIndex)}`,
      );
      return undefined;
    }

    const selectedCardId = chooserResolution.cardIds?.[resolutionIndex];
    if (selectedCardId !== undefined && selectedCardId !== cardId) {
      warnSkippedCardApply(
        templateId,
        `chooser card ${JSON.stringify(selectedCardId)} did not match rolled card ${JSON.stringify(cardId)}`,
      );
      return undefined;
    }

    selectedCardIds.push(cardId);
  }

  return selectedCardIds;
}

function selectedBoundedRolledCardIds(
  templateId: string,
  chooserResolution: Parameters<Reward["apply"]>[3],
  minCount: number,
  maxCount: number,
  rolledCardIds: readonly string[],
): string[] | undefined {
  if (chooserResolution?.kind !== "card") {
    warnSkippedCardApply(templateId, "missing card chooser resolution");
    return undefined;
  }

  if (
    chooserResolution.entryIds.length < minCount
    || chooserResolution.entryIds.length > maxCount
  ) {
    warnSkippedCardApply(
      templateId,
      `expected ${String(minCount)}-${String(maxCount)} selected card entries, got ${String(chooserResolution.entryIds.length)}`,
    );
    return undefined;
  }

  if (
    chooserResolution.cardIds !== undefined
    && chooserResolution.cardIds.length !== chooserResolution.entryIds.length
  ) {
    warnSkippedCardApply(
      templateId,
      `expected ${String(chooserResolution.entryIds.length)} selected card ids, got ${String(chooserResolution.cardIds.length)}`,
    );
    return undefined;
  }

  const uniqueEntryIds = new Set(chooserResolution.entryIds);
  if (uniqueEntryIds.size !== chooserResolution.entryIds.length) {
    warnSkippedCardApply(templateId, "card chooser resolution included duplicate entries");
    return undefined;
  }

  const selectedCardIds: string[] = [];
  for (const [resolutionIndex, selectedEntryId] of chooserResolution.entryIds.entries()) {
    const rolledMatch = /^rolled:([^:]+):(\d+)$/.exec(selectedEntryId);
    if (rolledMatch === null) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser entry ${JSON.stringify(selectedEntryId)} was malformed`,
      );
      return undefined;
    }

    const [, encodedCardId, rolledIndexText] = rolledMatch;
    const rolledIndex = Number.parseInt(rolledIndexText, 10);
    const cardId = rolledCardIds[rolledIndex];
    if (cardId === undefined) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser index ${String(rolledIndex)} was not found`,
      );
      return undefined;
    }

    if (cardId !== encodedCardId) {
      warnSkippedCardApply(
        templateId,
        `rolled chooser card ${JSON.stringify(encodedCardId)} did not match rolled index ${String(rolledIndex)}`,
      );
      return undefined;
    }

    const selectedCardId = chooserResolution.cardIds?.[resolutionIndex];
    if (selectedCardId !== undefined && selectedCardId !== cardId) {
      warnSkippedCardApply(
        templateId,
        `chooser card ${JSON.stringify(selectedCardId)} did not match rolled card ${JSON.stringify(cardId)}`,
      );
      return undefined;
    }

    selectedCardIds.push(cardId);
  }

  return selectedCardIds;
}

function selectedRolledDreamsignIds(
  templateId: string,
  chooserResolution: Parameters<Reward["apply"]>[3],
  minCount: number,
  maxCount: number,
  rolledDreamsignIds: readonly string[],
): string[] | undefined {
  if (chooserResolution?.kind !== "dreamsign") {
    warnSkippedDreamsignApply(templateId, "missing dreamsign chooser resolution");
    return undefined;
  }

  if (
    chooserResolution.indices.length < minCount
    || chooserResolution.indices.length > maxCount
  ) {
    warnSkippedDreamsignApply(
      templateId,
      `expected ${String(minCount)}-${String(maxCount)} selected dreamsign indices, got ${String(chooserResolution.indices.length)}`,
    );
    return undefined;
  }

  if (
    chooserResolution.dreamsignIds !== undefined
    && chooserResolution.dreamsignIds.length !== chooserResolution.indices.length
  ) {
    warnSkippedDreamsignApply(
      templateId,
      `expected ${String(chooserResolution.indices.length)} selected dreamsign ids, got ${String(chooserResolution.dreamsignIds.length)}`,
    );
    return undefined;
  }

  const uniqueIndices = new Set(chooserResolution.indices);
  if (uniqueIndices.size !== chooserResolution.indices.length) {
    warnSkippedDreamsignApply(templateId, "dreamsign chooser resolution included duplicate indices");
    return undefined;
  }

  const selectedDreamsignIds: string[] = [];
  for (const [resolutionIndex, selectedIndex] of chooserResolution.indices.entries()) {
    if (!Number.isInteger(selectedIndex)) {
      warnSkippedDreamsignApply(
        templateId,
        "dreamsign chooser resolution included a malformed index",
      );
      return undefined;
    }

    const dreamsignId = rolledDreamsignIds[selectedIndex];
    if (dreamsignId === undefined) {
      warnSkippedDreamsignApply(
        templateId,
        `rolled dreamsign index ${String(selectedIndex)} was not found`,
      );
      return undefined;
    }

    const selectedDreamsignId = chooserResolution.dreamsignIds?.[resolutionIndex];
    if (selectedDreamsignId !== undefined && selectedDreamsignId !== dreamsignId) {
      warnSkippedDreamsignApply(
        templateId,
        `chooser dreamsign ${JSON.stringify(selectedDreamsignId)} did not match rolled dreamsign ${JSON.stringify(dreamsignId)}`,
      );
      return undefined;
    }

    selectedDreamsignIds.push(dreamsignId);
  }

  return selectedDreamsignIds;
}

function selectedActiveDreamsignIndex(
  templateId: string,
  ctx: JourneyContext,
  chooserResolution: Parameters<Reward["apply"]>[3],
): number | undefined {
  if (chooserResolution?.kind !== "dreamsign") {
    warnSkippedDreamsignApply(templateId, "missing dreamsign chooser resolution");
    return undefined;
  }

  if (chooserResolution.indices.length !== 1) {
    warnSkippedDreamsignApply(
      templateId,
      `expected exactly one selected dreamsign index, got ${String(chooserResolution.indices.length)}`,
    );
    return undefined;
  }

  if (chooserResolution.dreamsignIds !== undefined && chooserResolution.dreamsignIds.length !== 1) {
    warnSkippedDreamsignApply(
      templateId,
      `expected exactly one selected dreamsign id, got ${String(chooserResolution.dreamsignIds.length)}`,
    );
    return undefined;
  }

  const index = chooserResolution.indices[0];
  if (!Number.isInteger(index)) {
    warnSkippedDreamsignApply(templateId, "dreamsign chooser resolution did not include an index");
    return undefined;
  }

  const activeDreamsign = ctx.state.quest.activeDreamsigns[index];
  if (activeDreamsign === undefined) {
    warnSkippedDreamsignApply(templateId, `active dreamsign index ${String(index)} was not found`);
    return undefined;
  }

  const expectedDreamsignId = chooserResolution.dreamsignIds?.[0];
  if (expectedDreamsignId !== undefined && activeDreamsign.dreamsignId !== expectedDreamsignId) {
    warnSkippedDreamsignApply(
      templateId,
      `active dreamsign index ${String(index)} is ${JSON.stringify(activeDreamsign.dreamsignId)}, not ${JSON.stringify(expectedDreamsignId)}`,
    );
    return undefined;
  }

  return index;
}

function pickedDrawDuplicateEntryIds(ctx: JourneyContext, drawCount: number): string[] {
  return pickUniqueDeckEntryIds(
    applyDrawContext(ctx),
    "draw_X_and_duplicate_chosen:entry",
    projectedDeckEntries(ctx).map((entry) => entry.entryId),
    drawCount,
  );
}

function resolveDrawDuplicateEntryId(
  ctx: JourneyContext,
  drawCount: number,
  chooserResolution: Parameters<Reward["apply"]>[3],
): string | undefined {
  const pickedEntryIds = pickedDrawDuplicateEntryIds(ctx, drawCount);
  const cardIdByEntryId = new Map(
    projectedDeckEntries(ctx).map((entry) => [entry.entryId, entry.card.id]),
  );
  const rolledCardIds = pickedEntryIds.flatMap((entryId) => {
    const cardId = cardIdByEntryId.get(entryId);
    return cardId === undefined ? [] : [cardId];
  });
  if (rolledCardIds.length < drawCount) {
    warnSkippedCardApply(
      "draw_X_and_duplicate_chosen",
      `only ${String(rolledCardIds.length)} rolled deck entries were available for drawCount=${String(drawCount)}`,
    );
    return undefined;
  }

  const rolledCardIdsSelected = selectedExactRolledCardIds(
    "draw_X_and_duplicate_chosen",
    chooserResolution,
    1,
    rolledCardIds,
  );
  if (rolledCardIdsSelected === undefined) return undefined;

  const selectedEntryId = chooserResolution?.kind === "card" ? chooserResolution.entryIds[0] : "";
  const rolledMatch = /^rolled:[^:]+:(\d+)$/.exec(selectedEntryId ?? "");
  const rolledIndex = rolledMatch === null ? -1 : Number.parseInt(rolledMatch[1], 10);
  const entryId = pickedEntryIds[rolledIndex];
  if (entryId === undefined) {
    warnSkippedCardApply(
      "draw_X_and_duplicate_chosen",
      `rolled chooser index ${String(rolledIndex)} was not found`,
    );
    return undefined;
  }

  return entryId;
}

function pickedReplaceStarterEntryId(ctx: JourneyContext): string | undefined {
  return pickUniqueDeckEntryIds(
    applyDrawContext(ctx),
    "replace_starter_via_draft:starter",
    findDeckEntriesByPredicate(ctx, "starter"),
    1,
  )[0];
}

function pickedReplaceStarterDraftCardIds(ctx: JourneyContext): string[] {
  return pickUniqueCardIds(
    applyDrawContext(ctx),
    "replace_starter_via_draft:draft",
    ctx.content.cards,
    4,
  );
}

// Inclusive integer roll for resource-range apply. Wave 1 does not plumb a
// deterministic RNG through the apply path; the option-level seed governs
// rollParams (generation), and apply is a one-shot resolution event. A future
// task can swap this for a labeled-RNG roll if determinism at apply time
// becomes a requirement; the surrounding tests assert the rolled value lies
// in [min, max] rather than pinning a literal.
function rollIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

type GainEssenceParams = { x: number };
const gainEssence: Reward<GainEssenceParams> = {
  id: "gain_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: 50 + 5 * drawInt(draw, "gain_essence:x", 0, 30) }),
  cec: (p) => p.x * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} essence`,
  apply: (p, _ctx, mut) => {
    mut.changeEssence(p.x, "dream_journey:gain_essence");
  },
};

type GainOmensParams = { x: number };
const gainOmens: Reward<GainOmensParams> = {
  id: "gain_omens",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ x: drawInt(draw, "gain_omens:x", 1, 3) }),
  cec: (p) => p.x * 40 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.x} omen${p.x === 1 ? "" : "s"}`,
  apply: (p, _ctx, mut) => {
    mut.changeOmens(p.x, "dream_journey:gain_omens");
  },
};

type SetEssencePctParams = { percent: number };
const setEssenceToPercentOfMax: Reward<SetEssencePctParams> = {
  id: "set_essence_to_percent_of_max",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const choices = [50, 75, 125];
    return { percent: choices[drawInt(draw, "set_essence_pct:i", 0, choices.length - 1)] };
  },
  cec: (p, ctx) =>
    Math.max(0, (maxEssence(ctx) * p.percent) / 100 - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Set essence to ${p.percent}% of your maximum essence`,
  apply: (p, ctx, mut) => {
    const target = Math.floor((maxEssence(ctx) * p.percent) / 100);
    mut.setEssence(target, "dream_journey:set_essence_to_percent_of_max");
  },
};

type GainEssenceRangeParams = { min: number; max: number };
const gainEssenceRandomRange: Reward<GainEssenceRangeParams> = {
  id: "gain_essence_random_range",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const base = 30 + 10 * drawInt(draw, "essence_range:base", 0, 12);
    const spread = 30 + 10 * drawInt(draw, "essence_range:spread", 0, 6);
    return { min: base, max: base + spread };
  },
  cec: (p) => ((p.min + p.max) / 2) * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Gain ${p.min}-${p.max} essence (random roll)`,
  apply: (p, _ctx, mut) => {
    const roll = rollIntInclusive(p.min, p.max);
    mut.changeEssence(roll, "dream_journey:gain_essence_random_range");
  },
};

type GainEssenceToMaxParams = Record<string, never>;
const gainEssenceToMax: Reward<GainEssenceToMaxParams> = {
  id: "gain_essence_to_max",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(0, maxEssence(ctx) - essenceAmount(ctx)) * STAGE_MULTIPLIER,
  viable: () => true,
  render: () => "Gain essence up to your maximum",
  apply: (_p, ctx, mut) => {
    mut.setEssence(maxEssence(ctx), "dream_journey:gain_essence_to_max");
  },
};

// `kinds` restricts the roll to predicates whose `kind` is in the allow-list.
// Random-gain rewards (e.g. "Gain N random <plural>") pass
// `["ability", "card-type"]` so cost/spark buckets ("cards with cost 2 or less",
// "cards with spark 4 or more") never appear as the predicate; draft rewards
// omit the filter and roll across every predicate kind.
function rollPredicate(
  draw: DrawContext,
  label: string,
  kinds?: readonly PredicateKind[],
  excludedIds: readonly string[] = [],
): Predicate {
  const excluded = new Set(excludedIds);
  const pool = kinds === undefined
    ? PREDICATES.filter((p) => !excluded.has(p.id))
    : PREDICATES.filter((p) => kinds.includes(p.kind) && !excluded.has(p.id));
  return weightedChoice(
    draw,
    label,
    pool.map((p) => ({ item: p, weight: 1 })),
  );
}

const RANDOM_GAIN_PREDICATE_KINDS: readonly PredicateKind[] = ["ability", "card-type"];
const CARD_ADDITION_EXCLUDED_PREDICATE_IDS = ["starter"] as const;

function rollCardAdditionPredicate(
  draw: DrawContext,
  label: string,
  kinds?: readonly PredicateKind[],
): Predicate {
  return rollPredicate(draw, label, kinds, CARD_ADDITION_EXCLUDED_PREDICATE_IDS);
}

function namedCardGainPool(ctx: JourneyContext) {
  return ctx.content.cards.filter((card) => card.rarity !== "Starter");
}

// Predicates whose match pool spans a huge portion of the card universe
// (~half the cards each). Drafting from such a pool offers little selection
// pressure, so draft-from-pool rewards keyed on these predicates are valued
// at a fixed flat CEC rather than the usual breadth-scaled formula.
const FLAT_DRAFT_PREDICATE_IDS = new Set(["low_spark", "high_spark"]);
const FLAT_DRAFT_CEC = 25;

function isFlatDraftPredicate(predicateId: string): boolean {
  return FLAT_DRAFT_PREDICATE_IDS.has(predicateId);
}

function draftPredicatePool(
  ctx: JourneyContext,
  predicateId: string,
  transfiguration?: string,
) {
  const pool = cardMatches(ctx, getPredicate(predicateId).cardPredicate ?? {});
  if (transfiguration === undefined) return pool;
  return pool.filter((card) => isCardEligibleForTransfiguration(transfiguration, card));
}

function pickedDraftPredicateCardIds(
  ctx: JourneyContext,
  predicateId: string,
  label: string,
  count: number,
  transfiguration?: string,
): string[] {
  return pickUniqueCardIds(
    applyDrawContext(ctx),
    label,
    draftPredicatePool(ctx, predicateId, transfiguration),
    count,
  );
}

type GainRandomCardsParams = { predicateId: string; count: number };
const gainRandomPredicateCards: Reward<GainRandomCardsParams> = {
  id: "gain_random_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(
      draw,
      "gain_random_predicate:pred",
      RANDOM_GAIN_PREDICATE_KINDS,
    ).id,
    count: drawInt(draw, "gain_random_predicate:count", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC, p.count, getPredicate(p.predicateId)),
  // Gain-from-catalog rewards: the player receives N cards drawn from the
  // catalog matching the predicate. Catalog scope is correct here — the
  // viability check asks "are there N cards in the universe to grant?".
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.count,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Gain ${p.count} random ${noun}`;
  },
  apply: (p, ctx, mut) => {
    const predicate = getPredicate(p.predicateId);
    const pool = cardMatches(ctx, predicate.cardPredicate ?? {});
    const cardIds = pickUniqueCardIds(
      applyDrawContext(ctx),
      "gain_random_predicate_cards:card",
      pool,
      p.count,
    );
    if (cardIds.length < p.count) {
      warnSkippedCardApply(
        "gain_random_predicate_cards",
        `only ${cardIds.length} cards matched predicate ${JSON.stringify(p.predicateId)} for count=${p.count}`,
      );
    }
    for (const cardId of cardIds) {
      mut.addCardById(cardId, "dream_journey:gain_random_predicate_cards");
    }
  },
};

type DraftPredicateParams = { predicateId: string };
const draftPredicateCardsFrom4: Reward<DraftPredicateParams> = {
  id: "draft_predicate_cards_from_4",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(draw, "draft_predicate:pred").id,
  }),
  cec: (p) =>
    isFlatDraftPredicate(p.predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.5, 1, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) => `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural}`,
  choosePlan: (p, ctx, planning) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_predicate_cards_from_4:card",
      4,
    );
    if (rolledCardIds.length < 4) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to draft",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_predicate_cards_from_4:card",
      4,
    );
    if (rolledCardIds.length < 4) {
      warnSkippedCardApply(
        "draft_predicate_cards_from_4",
        `only ${String(rolledCardIds.length)} draft cards were available`,
      );
      return;
    }

    const selectedCardId = selectedExactRolledCardIds(
      "draft_predicate_cards_from_4",
      chooserResolution,
      1,
      rolledCardIds,
    )?.[0];
    if (selectedCardId === undefined) return;

    mut.addCardById(selectedCardId, "dream_journey:draft_predicate_cards_from_4");
  },
};

type TakeAnyParams = { predicateId: string; choices: number };
const takeAnyFromPredicateChoices: Reward<TakeAnyParams> = {
  id: "take_any_from_predicate_choices",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(
      draw,
      "take_any:pred",
      RANDOM_GAIN_PREDICATE_KINDS,
    ).id,
    choices: drawInt(draw, "take_any:choices", 3, 5),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, p.choices / 2, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= p.choices,
  render: (p) =>
    `Take any number of ${getPredicate(p.predicateId).text.plural} from ${p.choices} choices`,
  choosePlan: (p, ctx, planning) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "take_any_from_predicate_choices:card",
      p.choices,
    );
    if (rolledCardIds.length < p.choices) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 0,
      maxPicks: p.choices,
      title: "Choose cards to take",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "take_any_from_predicate_choices:card",
      p.choices,
    );
    if (rolledCardIds.length < p.choices) {
      warnSkippedCardApply(
        "take_any_from_predicate_choices",
        `only ${String(rolledCardIds.length)} draft cards were available`,
      );
      return;
    }

    const selectedCardIds = selectedBoundedRolledCardIds(
      "take_any_from_predicate_choices",
      chooserResolution,
      0,
      p.choices,
      rolledCardIds,
    );
    if (selectedCardIds === undefined) return;

    for (const cardId of selectedCardIds) {
      mut.addCardById(cardId, "dream_journey:take_any_from_predicate_choices");
    }
  },
};

type GainNamedCardParams = { name: string };
const gainNamedCard: Reward<GainNamedCardParams> = {
  id: "gain_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = namedCardGainPool(ctx);
    if (pool.length === 0) return { name: "Placeholder Card" };
    const card = pickFromList(draw, "gain_named_card:card", pool);
    return { name: card.name };
  },
  cec: () => CARD_CEC * STAGE_MULTIPLIER,
  viable: (_p, ctx) => namedCardGainPool(ctx).length > 0,
  render: (p) => `Gain ${quoteName(p.name)}`,
  apply: (p, ctx, mut) => {
    const cardId = resolveCardIdByName(ctx, p.name);
    if (cardId === undefined) {
      warnSkippedCardApply(
        "gain_named_card",
        `catalog card named ${JSON.stringify(p.name)} was not found`,
      );
      return;
    }
    mut.addCardById(cardId, "dream_journey:gain_named_card");
  },
};

const CARD_TYPE_PREDICATE_IDS = ["warriors", "survivors", "spirit_animals"] as const;

type ApplyChosenTransfigChosenCardParams = Record<string, never>;
const applyChosenTransfigurationToChosenCard: Reward<ApplyChosenTransfigChosenCardParams> = {
  id: "apply_chosen_transfiguration_to_chosen_card",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.5,
  // Player picks both the transfiguration and the target card. The reward is
  // fulfillable when a current untransfigured deck entry can receive at least
  // one journey transfiguration.
  viable: (_p, ctx) => eligibleTransfigurationsForUntransfiguredDeck(ctx).length > 0,
  render: () => "Apply a transfiguration of your choice to a chosen card",
  choosePlan: (_p, ctx, planning) => {
    const slot0RequestId = planning.requestIdForSlot(0);
    const transfigurationResolution = planning.resolutions.get(slot0RequestId);
    if (transfigurationResolution === undefined) {
      const eligibleTransfigurations = eligibleTransfigurationsForUntransfiguredDeck(ctx);
      if (eligibleTransfigurations.length === 0) return undefined;
      return {
        kind: "transfiguration",
        requestId: slot0RequestId,
        eligibleTransfigurations,
        title: "Choose a transfiguration",
      };
    }

    if (transfigurationResolution.kind !== "transfiguration") return undefined;
    const transfiguration = transfigurationResolution.type;
    const eligibleEntryIds = untransfiguredDeckEntriesEligibleForTransfiguration(
      ctx,
      transfiguration,
    );
    if (
      !isJourneyTransfiguration(transfiguration)
      || eligibleEntryIds.length === 0
    ) {
      return undefined;
    }

    return {
      kind: "card",
      requestId: planning.requestIdForSlot(1),
      poolKind: "deck",
      deckFilter: { entryIds: eligibleEntryIds },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transfigure",
    };
  },
  apply: (_p, ctx, mut, chooserResolution, chooserContext) => {
    const transfiguration = selectedTransfiguration(
      "apply_chosen_transfiguration_to_chosen_card",
      ctx,
      chooserResolution,
    );
    if (transfiguration === undefined) return;

    const cardResolution = chooserContext?.resolutions.get(
      chooserContext.requestIdForSlot(1),
    );
    const entryIds = selectedExactDeckEntryIds(
      "apply_chosen_transfiguration_to_chosen_card",
      ctx,
      cardResolution,
      1,
      untransfiguredDeckEntriesEligibleForTransfiguration(ctx, transfiguration),
    );
    const entryId = entryIds?.[0];
    if (entryId === undefined) return;

    mut.transfigureDeckEntry(
      entryId,
      transfiguration,
      "dream_journey:apply_chosen_transfiguration_to_chosen_card",
    );
  },
};

type ApplyNamedTransfigPredCardsParams = {
  transfiguration: string;
  predicateId: string;
  count: number;
};
const applyNamedTransfigurationToChosenPredicateCards: Reward<ApplyNamedTransfigPredCardsParams> =
  {
    id: "apply_named_transfiguration_to_chosen_predicate_cards",
    weight: 1.0,
    rollParams: (ctx, draw) => {
      const predicateId = rollPredicate(draw, "named_transfig_chosen:p").id;
      return {
        transfiguration: pickTransfigurationForPredicate(
          ctx,
          draw,
          "named_transfig_chosen:t",
          predicateId,
        ),
        predicateId,
        count: drawInt(draw, "named_transfig_chosen:n", 1, 3),
      };
    },
    cec: (p) => cardPoolCEC(CARD_CEC * 0.8, p.count, getPredicate(p.predicateId)),
    viable: (p, ctx) =>
      deckContainsUntransfiguredPredicate(
        ctx,
        p.predicateId,
        p.count,
        p.transfiguration,
      ),
    render: (p) => {
      const pred = getPredicate(p.predicateId);
      const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
      return `Apply ${p.transfiguration} to ${p.count} chosen ${noun}`;
    },
    choosePlan: (p, ctx, planning) => {
      if (!isJourneyTransfiguration(p.transfiguration)) return undefined;
      const entryIds = findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
        ctx,
        p.predicateId,
        p.transfiguration,
      );
      if (entryIds.length < p.count) return undefined;
      return {
        kind: "card",
        requestId: planning.requestIdForSlot(0),
        poolKind: "deck",
        deckFilter: { predicateId: p.predicateId, entryIds },
        minPicks: p.count,
        maxPicks: p.count,
        title: p.count === 1 ? "Choose a card to transfigure" : "Choose cards to transfigure",
      };
    },
    apply: (p, ctx, mut, chooserResolution) => {
      if (!isJourneyTransfiguration(p.transfiguration)) {
        warnSkippedCardApply(
          "apply_named_transfiguration_to_chosen_predicate_cards",
          `unknown transfiguration ${JSON.stringify(p.transfiguration)}`,
        );
        return;
      }

      const entryIds = selectedExactDeckEntryIds(
        "apply_named_transfiguration_to_chosen_predicate_cards",
        ctx,
        chooserResolution,
        p.count,
        findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
          ctx,
          p.predicateId,
          p.transfiguration,
        ),
      );
      if (entryIds === undefined) return;

      for (const entryId of entryIds) {
        mut.transfigureDeckEntry(
          entryId,
          transfigurationForApply(p.transfiguration),
          "dream_journey:apply_named_transfiguration_to_chosen_predicate_cards",
        );
      }
    },
  };

type ApplyNamedTransfigCardNameParams = { transfiguration: string; cardName: string };
const applyNamedTransfigurationToCardName: Reward<ApplyNamedTransfigCardNameParams> = {
  id: "apply_named_transfiguration_to_card_name",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    const transfiguration = pickFromList(
      draw,
      "named_transfig_named:t",
      JOURNEY_TRANSFIGURATIONS,
    );
    // Pair the chosen transfiguration with a deck card actually eligible
    // for it. If no deck card is eligible (e.g. Bronze rolled but the deck
    // has no events) fall back to any deck card; `viable` will reject the
    // case so the reward is filtered out of the offer pool.
    const eligibleDeckCards = deckCards.filter((card) =>
      isCardEligibleForTransfiguration(transfiguration, card),
    );
    const pool = eligibleDeckCards.length > 0 ? eligibleDeckCards : deckCards;
    return {
      transfiguration,
      cardName: pool.length > 0
        ? pickFromList(draw, "named_transfig_named:c", pool).name
        : "Placeholder Card",
    };
  },
  cec: () => CARD_CEC * 0.8,
  // The named card must have an untransfigured concrete entry that can receive
  // the requested transfiguration; viability mirrors the apply target filter.
  viable: (p, ctx) =>
    deckContainsUntransfiguredCardByName(ctx, p.cardName, p.transfiguration),
  render: (p) => `Apply ${p.transfiguration} to ${quoteName(p.cardName)}`,
  apply: (p, ctx, mut) => {
    const entryId = findUntransfiguredDeckEntriesByName(
      ctx,
      p.cardName,
      (card) => isCardEligibleForTransfiguration(p.transfiguration, card),
    )[0];
    if (entryId === undefined) {
      warnSkippedCardApply(
        "apply_named_transfiguration_to_card_name",
        `untransfigured deck entry for card name ${JSON.stringify(p.cardName)} was not found`,
      );
      return;
    }
    mut.transfigureDeckEntry(
      entryId,
      transfigurationForApply(p.transfiguration),
      "dream_journey:apply_named_transfiguration_to_card_name",
    );
  },
};

type ApplyNamedTransfigRandomPredParams = {
  transfiguration: string;
  predicateId: string;
  count: number;
};
const applyNamedTransfigurationToRandomPredicateCards: Reward<ApplyNamedTransfigRandomPredParams> =
  {
    id: "apply_named_transfiguration_to_random_predicate_cards",
    weight: 1.0,
    rollParams: (ctx, draw) => {
      const predicateId = rollCardAdditionPredicate(draw, "named_transfig_random:p").id;
      return {
        transfiguration: pickTransfigurationForPredicate(
          ctx,
          draw,
          "named_transfig_random:t",
          predicateId,
        ),
        predicateId,
        count: drawInt(draw, "named_transfig_random:n", 1, 3),
      };
    },
    cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
    // Viability mirrors the concrete eligible entries used by apply.
    viable: (p, ctx) =>
      deckContainsUntransfiguredPredicate(ctx, p.predicateId, p.count, p.transfiguration),
    render: (p) => {
      const pred = getPredicate(p.predicateId);
      const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
      return `Apply ${p.transfiguration} to ${p.count} random ${noun}`;
    },
    apply: (p, ctx, mut) => {
      const entryIds = findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
        ctx,
        p.predicateId,
        p.transfiguration,
      );
      if (entryIds.length === 0) {
        warnSkippedCardApply(
          "apply_named_transfiguration_to_random_predicate_cards",
          `no untransfigured deck entries matched predicate ${JSON.stringify(p.predicateId)}`,
        );
        return;
      }
      const pickedEntryIds = pickUniqueDeckEntryIds(
        applyDrawContext(ctx),
        "apply_named_transfiguration_to_random_predicate_cards:entry",
        entryIds,
        p.count,
      );
      if (pickedEntryIds.length < p.count) {
        warnSkippedCardApply(
          "apply_named_transfiguration_to_random_predicate_cards",
          `only ${pickedEntryIds.length} deck entries matched predicate ${JSON.stringify(p.predicateId)} for count=${p.count}`,
        );
      }
      for (const entryId of pickedEntryIds) {
        mut.transfigureDeckEntry(
          entryId,
          transfigurationForApply(p.transfiguration),
          "dream_journey:apply_named_transfiguration_to_random_predicate_cards",
        );
      }
    },
  };

type TransfigureRandomStartersParams = { count: number };
const transfigureRandomStarters: Reward<TransfigureRandomStartersParams> = {
  id: "transfigure_random_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_random_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.7 * p.count,
  viable: (p, ctx) => deckContainsUntransfiguredPredicate(ctx, "starter", p.count),
  render: (p) =>
    p.count === 1
      ? "Apply a random transfiguration to 1 random starter card"
      : `Apply random transfigurations to ${p.count} random starter cards`,
  apply: (p, ctx, mut) => {
    const entryIds = findUntransfiguredDeckEntriesByPredicate(ctx, "starter");
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "transfigure_random_starters",
        "untransfigured starter deck entries were not found",
      );
      return;
    }
    const draw = applyDrawContext(ctx);
    const pickedEntryIds = pickUniqueDeckEntryIds(
      draw,
      "transfigure_random_starters:entry",
      entryIds,
      p.count,
    );
    if (pickedEntryIds.length < p.count) {
      warnSkippedCardApply(
        "transfigure_random_starters",
        `only ${pickedEntryIds.length} starter deck entries available for count=${p.count}`,
      );
    }
    pickedEntryIds.forEach((entryId, index) => {
      const transfiguration = pickRandomTransfigurationForEntry(
        ctx,
        draw,
        "transfigure_random_starters",
        `transfigure_random_starters:transfiguration:${index}`,
        entryId,
      );
      if (transfiguration === undefined) return;
      mut.transfigureDeckEntry(
        entryId,
        transfiguration,
        "dream_journey:transfigure_random_starters",
      );
    });
  },
};

type TransfigureAllStartersParams = Record<string, never>;
const transfigureAllStarters: Reward<TransfigureAllStartersParams> = {
  id: "transfigure_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.7 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => deckContainsUntransfiguredPredicate(ctx, "starter"),
  render: () => "Apply a random transfiguration to each starter card",
  apply: (_p, ctx, mut) => {
    const entryIds = findUntransfiguredDeckEntriesByPredicate(ctx, "starter");
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "transfigure_all_starters",
        "untransfigured starter deck entries were not found",
      );
      return;
    }
    const draw = applyDrawContext(ctx);
    entryIds.forEach((entryId, index) => {
      const transfiguration = pickRandomTransfigurationForEntry(
        ctx,
        draw,
        "transfigure_all_starters",
        `transfigure_all_starters:transfiguration:${index}`,
        entryId,
      );
      if (transfiguration === undefined) return;
      mut.transfigureDeckEntry(
        entryId,
        transfiguration,
        "dream_journey:transfigure_all_starters",
      );
    });
  },
};

type ChangeCardBecomeTypeParams = { cardName: string; cardTypePredicateId: string };
const changeCardToBecomeType: Reward<ChangeCardBecomeTypeParams> = {
  id: "change_card_to_become_type",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "change_become:c", deckCards).name
        : "Placeholder Card",
      cardTypePredicateId: pickFromList(draw, "change_become:t", CARD_TYPE_PREDICATE_IDS),
    };
  },
  cec: () => CARD_CEC * 0.6,
  // Named-card smell: the rolled `cardName` must still be in the deck.
  // CLI shipped `cardMatches(ctx, { source: "deck" }).length >= 1`, which
  // surfaces a no-op when the deck holds a different card.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  render: (p) => {
    const singular = getPredicate(p.cardTypePredicateId).text.singular;
    const article = /^[aeiou]/i.test(singular) ? "an" : "a";
    return `Change ${quoteName(p.cardName)} to become ${article} ${singular}`;
  },
  apply: (p, ctx, mut) => {
    const entryId = findFirstDeckEntryIdByCardName(ctx, p.cardName);
    if (entryId === undefined) {
      warnSkippedCardApply(
        "change_card_to_become_type",
        `deck entry for card name ${JSON.stringify(p.cardName)} was not found`,
      );
      return;
    }
    const typeChange = cardTypeChangeFromPredicate(p.cardTypePredicateId);
    if (typeChange === undefined) {
      warnSkippedCardApply(
        "change_card_to_become_type",
        `card type predicate ${JSON.stringify(p.cardTypePredicateId)} was not applicable`,
      );
      return;
    }
    mut.changeDeckEntryType(
      entryId,
      typeChange,
      "dream_journey:change_card_to_become_type",
    );
  },
};

type ModifyRandomCardsToTypesParams = { count: number; cardTypePredicateId: string };
const modifyRandomCardsToTypes: Reward<ModifyRandomCardsToTypesParams> = {
  id: "modify_random_cards_to_types",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "modify_random_types:n", 1, 3),
    cardTypePredicateId: pickFromList(draw, "modify_random_types:t", CARD_TYPE_PREDICATE_IDS),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  // Deck-scope leak: CLI used `ctx.content.cards.length >= count`. The
  // reward modifies N RANDOM deck cards, so viability must look at the
  // deck.
  viable: (p, ctx) => deckHasMinSize(ctx, p.count),
  render: (p) => {
    const predicate = getPredicate(p.cardTypePredicateId);
    const noun = p.count === 1 ? "card" : "cards";
    const typeName = p.count === 1 ? predicate.text.singular : predicate.text.plural;
    const article = p.count === 1 ? `${indefiniteArticleFor(typeName)} ` : "";
    return `Modify ${p.count} random ${noun} to become ${article}${typeName}`;
  },
  apply: (p, ctx, mut) => {
    const typeChange = cardTypeChangeFromPredicate(p.cardTypePredicateId);
    if (typeChange === undefined) {
      warnSkippedCardApply(
        "modify_random_cards_to_types",
        `card type predicate ${JSON.stringify(p.cardTypePredicateId)} was not applicable`,
      );
      return;
    }
    const entryIds = projectedDeckEntries(ctx).map((entry) => entry.entryId);
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "modify_random_cards_to_types",
        "deck entries were not found",
      );
      return;
    }
    const picked = pickUniqueDeckEntryIds(
      applyDrawContext(ctx),
      "modify_random_cards_to_types:entry",
      entryIds,
      p.count,
    );
    picked.forEach((entryId) => {
      mut.changeDeckEntryType(
        entryId,
        typeChange,
        "dream_journey:modify_random_cards_to_types",
      );
    });
  },
};

type MakeRandomCardsFastParams = { count: number };
const makeRandomCardsFast: Reward<MakeRandomCardsFastParams> = {
  id: "make_random_cards_fast",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "make_random_fast:n", 2, 4) }),
  cec: (p) => CARD_CEC * 0.5 * p.count,
  // Deck-scope leak: CLI used `ctx.content.cards.length >= count`.
  viable: (p, ctx) => deckHasMinSize(ctx, p.count),
  render: (p) => `Change ${p.count} random card${p.count === 1 ? "" : "s"} to have fast`,
  apply: () => {
    logSkippedVisualTemplate("make_random_cards_fast", "visual");
  },
};

type PurgeChosenPredCardsParams = { predicateId: string; count: number };
const purgeChosenPredicateCards: Reward<PurgeChosenPredCardsParams> = {
  id: "purge_chosen_predicate_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_chosen_pred:p").id,
    count: drawInt(draw, "purge_chosen_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.3, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) => findDeckEntriesByPredicate(ctx, p.predicateId).length >= 1,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return p.count === 1 ? `Purge a chosen ${noun}` : `Purge up to ${p.count} chosen ${noun}`;
  },
  choosePlan: (p, ctx, planning) => {
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    const maxPicks = Math.min(p.count, entryIds.length);
    if (maxPicks < 1) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { predicateId: p.predicateId, entryIds },
      minPicks: 1,
      maxPicks,
      title: p.count === 1 ? "Choose a card to purge" : "Choose cards to purge",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const eligibleEntryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    const entryIds = selectedBoundedDeckEntryIds(
      "purge_chosen_predicate_cards",
      ctx,
      chooserResolution,
      1,
      Math.min(p.count, eligibleEntryIds.length),
      eligibleEntryIds,
    );
    if (entryIds === undefined) return;

    for (const entryId of entryIds) {
      mut.removeDeckEntry(entryId, "dream_journey:purge_chosen_predicate_cards");
    }
  },
};

type PurgeChosenPredWithReplParams = { predicateId: string; count: number };
const purgeChosenPredicateWithReplacement: Reward<PurgeChosenPredWithReplParams> = {
  id: "purge_chosen_predicate_with_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "purge_repl:p").id,
    count: drawInt(draw, "purge_repl:n", 1, 2),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.6, p.count, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    findDeckEntriesByPredicate(ctx, p.predicateId).length >= 1
    && cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    if (p.count === 1) {
      return `Transform a chosen ${pred.text.singular} into a random ${pred.text.singular}`;
    }
    return `Transform up to ${p.count} chosen ${pred.text.plural} into random ${pred.text.plural}`;
  },
  choosePlan: (p, ctx, planning) => {
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    const replacementPool = cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {});
    const maxPicks = Math.min(p.count, entryIds.length, replacementPool.length);
    if (maxPicks < 1) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { predicateId: p.predicateId, entryIds },
      minPicks: 1,
      maxPicks,
      title: p.count === 1 ? "Choose a card to transform" : "Choose cards to transform",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const eligibleEntryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    const replacementPool = cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {});
    const entryIds = selectedBoundedDeckEntryIds(
      "purge_chosen_predicate_with_replacement",
      ctx,
      chooserResolution,
      1,
      Math.min(p.count, eligibleEntryIds.length, replacementPool.length),
      eligibleEntryIds,
    );
    if (entryIds === undefined) return;

    const replacementCardIds = pickUniqueCardIds(
      applyDrawContext(ctx),
      "purge_chosen_predicate_with_replacement:card",
      replacementPool,
      entryIds.length,
    );
    if (replacementCardIds.length < entryIds.length) {
      warnSkippedCardApply(
        "purge_chosen_predicate_with_replacement",
        `only ${String(replacementCardIds.length)} cards matched predicate ${JSON.stringify(p.predicateId)} for count=${String(entryIds.length)}`,
      );
      return;
    }

    entryIds.forEach((entryId, index) => {
      mut.removeDeckEntry(entryId, "dream_journey:purge_chosen_predicate_with_replacement");
      mut.addCardById(
        replacementCardIds[index],
        "dream_journey:purge_chosen_predicate_with_replacement",
      );
    });
  },
};

type PurgeNamedStarterParams = { cardName: string };
const purgeNamedStarter: Reward<PurgeNamedStarterParams> = {
  id: "purge_named_starter",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const starters = cardMatches(ctx, { starter: true });
    return {
      cardName: starters.length > 0
        ? pickFromList(draw, "purge_named_starter:c", starters).name
        : "Placeholder Starter",
    };
  },
  cec: () => CARD_CEC * 0.4,
  // Named-card smell: the rolled starter name must still be a deck card.
  // CLI shipped `cardMatches(ctx, { starter: true }).length >= 1`, which
  // would surface a no-op option whenever the deck has at least one
  // starter even if the specific named one was already purged.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  render: (p) => `Purge ${quoteName(p.cardName)}`,
  apply: (p, ctx, mut) => {
    const entryId = findDeckEntriesByName(
      ctx,
      p.cardName,
      (card) => card.rarity === "Starter",
    )[0];
    if (entryId === undefined) {
      warnSkippedCardApply(
        "purge_named_starter",
        `starter deck entry for card name ${JSON.stringify(p.cardName)} was not found`,
      );
      return;
    }
    mut.removeDeckEntry(entryId, "dream_journey:purge_named_starter");
  },
};

type PurgeRandomStarterParams = Record<string, never>;
const purgeRandomStarter: Reward<PurgeRandomStarterParams> = {
  id: "purge_random_starter",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 0.4,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge a random starter card",
  apply: (_p, ctx, mut) => {
    const entryIds = findDeckEntriesByPredicate(ctx, "starter");
    if (entryIds.length === 0) {
      warnSkippedCardApply("purge_random_starter", "starter deck entry was not found");
      return;
    }
    const entryId = pickFromList(
      applyDrawContext(ctx),
      "purge_random_starter:entry",
      entryIds,
    );
    mut.removeDeckEntry(entryId, "dream_journey:purge_random_starter");
  },
};

type PurgeRandomStarterReplParams = { predicateId: string };
const purgeRandomStarterWithPredicateReplacement: Reward<PurgeRandomStarterReplParams> = {
  id: "purge_random_starter_with_predicate_replacement",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(draw, "purge_starter_repl:p").id,
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.7, 1, getPredicate(p.predicateId)),
  // The replacement card is drawn from the catalog (intentional catalog scope:
  // see `transformChosenPredicateIntoNamed` for the matching pattern). Both a
  // starter to consume AND a catalog match for the replacement predicate are
  // required, otherwise the reward is non-fulfillable.
  viable: (p, ctx) =>
    starterCardCount(ctx) >= 1
    && cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 1,
  render: (p) =>
    `Transform a random starter card into a random ${getPredicate(p.predicateId).text.singular}`,
  apply: (p, ctx, mut) => {
    const starterEntryIds = findDeckEntriesByPredicate(ctx, "starter");
    if (starterEntryIds.length === 0) {
      warnSkippedCardApply(
        "purge_random_starter_with_predicate_replacement",
        "starter deck entry was not found",
      );
      return;
    }

    const replacementPool = cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {});
    if (replacementPool.length === 0) {
      warnSkippedCardApply(
        "purge_random_starter_with_predicate_replacement",
        `catalog card for predicate ${JSON.stringify(p.predicateId)} was not found`,
      );
      return;
    }

    const draw = applyDrawContext(ctx);
    const entryId = pickFromList(
      draw,
      "purge_random_starter_with_predicate_replacement:entry",
      starterEntryIds,
    );
    const cardId = pickFromList(
      draw,
      "purge_random_starter_with_predicate_replacement:card",
      replacementPool,
    ).id;
    mut.removeDeckEntry(entryId, "dream_journey:purge_random_starter_with_predicate_replacement");
    mut.addCardById(cardId, "dream_journey:purge_random_starter_with_predicate_replacement");
  },
};

type TransformStarterParams = { newCardName: string };
const transformStarterIntoNamedCard: Reward<TransformStarterParams> = {
  id: "transform_starter_into_named_card",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_starter:c", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: () => CARD_CEC * 0.8,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1 && ctx.content.cards.length > 0,
  render: (p) => `Choose a starter card to transform into ${quoteName(p.newCardName)}`,
  apply: (p, ctx, mut) => {
    const entryId = findFirstStarterDeckEntryId(ctx);
    if (entryId === undefined) {
      warnSkippedCardApply("transform_starter_into_named_card", "starter deck entry was not found");
      return;
    }
    const cardId = resolveCardIdByName(ctx, p.newCardName);
    if (cardId === undefined) {
      warnSkippedCardApply(
        "transform_starter_into_named_card",
        `catalog card named ${JSON.stringify(p.newCardName)} was not found`,
      );
      return;
    }
    mut.removeDeckEntry(entryId, "dream_journey:transform_starter_into_named_card");
    mut.addCardById(cardId, "dream_journey:transform_starter_into_named_card");
  },
};

type TransformDeckCardParams = { oldCardName: string; newCardName: string };
const transformCardInDeckIntoNamed: Reward<TransformDeckCardParams> = {
  id: "transform_card_in_deck_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      oldCardName: deckCards.length > 0
        ? pickFromList(draw, "xform_deck:old", deckCards).name
        : "Placeholder Card A",
      newCardName: ctx.content.cards.length > 0
        ? pickFromList(draw, "xform_deck:new", ctx.content.cards).name
        : "Placeholder Card B",
    };
  },
  cec: () => CARD_CEC,
  // Named-card smell on `oldCardName`. CLI shipped
  // `cardMatches(ctx, { source: "deck" }).length >= 1 && content.cards.length > 0`.
  viable: (p, ctx) =>
    deckContainsCardByName(ctx, p.oldCardName) && ctx.content.cards.length > 0,
  render: (p) => `Transform ${quoteName(p.oldCardName)} into ${quoteName(p.newCardName)}`,
  apply: (p, ctx, mut) => {
    const entryId = findFirstDeckEntryIdByCardName(ctx, p.oldCardName);
    if (entryId === undefined) {
      warnSkippedCardApply(
        "transform_card_in_deck_into_named",
        `deck entry for card name ${JSON.stringify(p.oldCardName)} was not found`,
      );
      return;
    }
    const cardId = resolveCardIdByName(ctx, p.newCardName);
    if (cardId === undefined) {
      warnSkippedCardApply(
        "transform_card_in_deck_into_named",
        `catalog card named ${JSON.stringify(p.newCardName)} was not found`,
      );
      return;
    }
    mut.removeDeckEntry(entryId, "dream_journey:transform_card_in_deck_into_named");
    mut.addCardById(cardId, "dream_journey:transform_card_in_deck_into_named");
  },
};

type TransformPredCardParams = { predicateId: string; newCardName: string };
const transformChosenPredicateIntoNamed: Reward<TransformPredCardParams> = {
  id: "transform_chosen_predicate_into_named",
  weight: 1.0,
  rollParams: (ctx, draw) => ({
    predicateId: rollPredicate(draw, "xform_pred:pred").id,
    newCardName: ctx.content.cards.length > 0
      ? pickFromList(draw, "xform_pred:new", ctx.content.cards).name
      : "Placeholder Card",
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 1.2, 1, getPredicate(p.predicateId)),
  // Deck-scope leak fix.
  viable: (p, ctx) => deckContainsPredicate(ctx, p.predicateId) && ctx.content.cards.length > 0,
  render: (p) =>
    `Transform a chosen ${getPredicate(p.predicateId).text.singular} into ${quoteName(p.newCardName)}`,
  choosePlan: (p, ctx, planning) => {
    if (resolveCardIdByName(ctx, p.newCardName) === undefined) return undefined;
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    if (entryIds.length < 1) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { predicateId: p.predicateId, entryIds },
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to transform",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const targetCardId = resolveCardIdByName(ctx, p.newCardName);
    if (targetCardId === undefined) {
      warnSkippedCardApply(
        "transform_chosen_predicate_into_named",
        `catalog card named ${JSON.stringify(p.newCardName)} was not found`,
      );
      return;
    }

    const entryId = selectedExactDeckEntryIds(
      "transform_chosen_predicate_into_named",
      ctx,
      chooserResolution,
      1,
      findDeckEntriesByPredicate(ctx, p.predicateId),
    )?.[0];
    if (entryId === undefined) return;

    mut.removeDeckEntry(entryId, "dream_journey:transform_chosen_predicate_into_named");
    mut.addCardById(targetCardId, "dream_journey:transform_chosen_predicate_into_named");
  },
};

type DupNamedCardParams = {
  cardName?: string;
  count?: number;
  name?: string;
  copies?: number;
};

function duplicateNamedCardName(p: DupNamedCardParams): string {
  return p.cardName ?? p.name ?? "";
}

function duplicateNamedCardCount(p: DupNamedCardParams): number {
  return p.count ?? p.copies ?? 0;
}

const duplicateNamedCardX: Reward<DupNamedCardParams> = {
  id: "duplicate_named_card_X",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "dup_named:c", deckCards).name
        : "Placeholder Card",
      count: drawInt(draw, "dup_named:n", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * duplicateNamedCardCount(p),
  // Named-card smell. CLI shipped
  // `cardMatches(ctx, { source: "deck" }).length >= 1`.
  viable: (p, ctx) => deckContainsCardByName(ctx, duplicateNamedCardName(p)),
  render: (p) =>
    `Create ${duplicateNamedCardCount(p)} duplicate${duplicateNamedCardCount(p) === 1 ? "" : "s"} of ${quoteName(duplicateNamedCardName(p))}`,
  apply: (p, ctx, mut) => {
    const cardName = duplicateNamedCardName(p);
    const entryId = findDeckEntriesByName(ctx, cardName)[0];
    if (entryId === undefined) {
      warnSkippedCardApply(
        "duplicate_named_card_X",
        `deck entry for card name ${JSON.stringify(cardName)} was not found`,
      );
      return;
    }
    for (let i = 0; i < duplicateNamedCardCount(p); i += 1) {
      mut.duplicateDeckEntry(entryId, "dream_journey:duplicate_named_card_X");
    }
  },
};

type DupChosenParams = { count: number };
const duplicateChosenCards: Reward<DupChosenParams> = {
  id: "duplicate_chosen_cards",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "dup_chosen:n", 1, 3) }),
  cec: (p) => CARD_CEC * 1.1 * p.count,
  // Deck-size-N: inline upgraded to the helper.
  viable: (p, ctx) => deckHasMinSize(ctx, p.count),
  render: (p) => `Duplicate ${p.count} chosen card${p.count === 1 ? "" : "s"}`,
  choosePlan: (p, ctx, planning) => {
    const entryIds = projectedDeckEntries(ctx).map((entry) => entry.entryId);
    if (entryIds.length < p.count) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { entryIds },
      minPicks: p.count,
      maxPicks: p.count,
      title: p.count === 1 ? "Choose a card to duplicate" : "Choose cards to duplicate",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const entryIds = selectedExactDeckEntryIds(
      "duplicate_chosen_cards",
      ctx,
      chooserResolution,
      p.count,
      projectedDeckEntries(ctx).map((entry) => entry.entryId),
    );
    if (entryIds === undefined) return;

    for (const entryId of entryIds) {
      mut.duplicateDeckEntry(entryId, "dream_journey:duplicate_chosen_cards");
    }
  },
};

type DupRandomPredParams = { predicateId: string; count: number };
const duplicateRandomPredicate: Reward<DupRandomPredParams> = {
  id: "duplicate_random_predicate",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(
      draw,
      "dup_random_pred:p",
      RANDOM_GAIN_PREDICATE_KINDS,
    ).id,
    count: drawInt(draw, "dup_random_pred:n", 1, 3),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.9, p.count, getPredicate(p.predicateId)),
  // Deck-scope leak fix.
  viable: (p, ctx) => deckContainsPredicate(ctx, p.predicateId, p.count),
  render: (p) => {
    const pred = getPredicate(p.predicateId);
    const noun = p.count === 1 ? pred.text.singular : pred.text.plural;
    return `Duplicate ${p.count} random ${noun}`;
  },
  apply: (p, ctx, mut) => {
    const entryIds = findDeckEntriesByPredicate(ctx, p.predicateId);
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "duplicate_random_predicate",
        `no deck entries matched predicate ${JSON.stringify(p.predicateId)}`,
      );
      return;
    }
    const pickedEntryIds = pickUniqueDeckEntryIds(
      applyDrawContext(ctx),
      "duplicate_random_predicate:entry",
      entryIds,
      p.count,
    );
    if (pickedEntryIds.length < p.count) {
      warnSkippedCardApply(
        "duplicate_random_predicate",
        `only ${pickedEntryIds.length} deck entries matched predicate ${JSON.stringify(p.predicateId)} for count=${p.count}`,
      );
    }
    for (const entryId of pickedEntryIds) {
      mut.duplicateDeckEntry(entryId, "dream_journey:duplicate_random_predicate");
    }
  },
};

type DrawDupParams = { drawCount: number };
const drawXAndDuplicateChosen: Reward<DrawDupParams> = {
  id: "draw_X_and_duplicate_chosen",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ drawCount: drawInt(draw, "draw_dup:n", 2, 4) }),
  cec: () => CARD_CEC * 1.0,
  // Deck-size-N: inline upgraded to the helper.
  viable: (p, ctx) => deckHasMinSize(ctx, p.drawCount),
  render: (p) =>
    `Draw ${p.drawCount} cards from your deck and duplicate one of them of your choice`,
  choosePlan: (p, ctx, planning) => {
    const pickedEntryIds = pickedDrawDuplicateEntryIds(ctx, p.drawCount);
    if (pickedEntryIds.length < p.drawCount) return undefined;

    const cardIdByEntryId = new Map(
      projectedDeckEntries(ctx).map((entry) => [entry.entryId, entry.card.id]),
    );
    const rolledCardIds = pickedEntryIds.flatMap((entryId) => {
      const cardId = cardIdByEntryId.get(entryId);
      return cardId === undefined ? [] : [cardId];
    });
    if (rolledCardIds.length < p.drawCount) return undefined;

    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a drawn card to duplicate",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const entryId = resolveDrawDuplicateEntryId(ctx, p.drawCount, chooserResolution);
    if (entryId === undefined) return;
    mut.duplicateDeckEntry(entryId, "dream_journey:draw_X_and_duplicate_chosen");
  },
};

type PurgeXBanesParams = { count: number };
const purgeXBanes: Reward<PurgeXBanesParams> = {
  id: "purge_X_banes",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "purge_banes:n", 1, 3) }),
  cec: (p) => p.count * 30,
  viable: (p, ctx) => baneCount(ctx) >= p.count,
  render: (p) => `Purge ${p.count} bane card${p.count === 1 ? "" : "s"}`,
  apply: (p, _ctx, mut) => {
    mut.purgeRandomBaneCards(p.count, "dream_journey:purge_X_banes");
  },
};

type PurgeAllBanesParams = Record<string, never>;
const purgeAllBanes: Reward<PurgeAllBanesParams> = {
  id: "purge_all_banes",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => Math.max(1, baneCount(ctx)) * 30,
  viable: (_p, ctx) => baneCount(ctx) >= 1,
  render: () => "Purge all bane cards",
  apply: (_p, _ctx, mut) => {
    mut.purgeAllBaneCards("dream_journey:purge_all_banes");
  },
};

const DREAMSIGN_CEC = 80;

type GainRandomDreamsignParams = Record<string, never>;
const gainRandomDreamsign: Reward<GainRandomDreamsignParams> = {
  id: "gain_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC,
  // Pool-scope: dreamsigns are gained FROM the quest's dreamsign pool, not
  // the full catalog. CLI shipped `dreamsignMatches(ctx).length >= 1`,
  // which leaked to the catalog. Quests that have already drained their
  // pool would otherwise surface a non-fulfillable "Gain a random
  // Dreamsign" option.
  viable: (_p, ctx) => ctx.state.quest.dreamsignPoolIds.length >= 1,
  render: () => "Gain a random Dreamsign",
  apply: (_p, ctx, mut) => {
    const pool = poolDreamsignsById(ctx);
    if (pool.length === 0) {
      console.warn(
        "[dream-journey] gain_random_dreamsign: dreamsign pool is empty",
      );
      return;
    }
    const source = pickFromList(
      applyDrawContext(ctx),
      "gain_random_dreamsign:dreamsign",
      pool,
    );
    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:gain_random_dreamsign",
      undefined,
    );
  },
};

type GainNamedDreamsignParams = { name: string };
const gainNamedDreamsign: Reward<GainNamedDreamsignParams> = {
  id: "gain_named_dreamsign",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = poolDreamsignsById(ctx);
    return {
      name: pool.length > 0
        ? pickFromList(draw, "gain_named_ds:c", pool).name
        : "Placeholder Dreamsign",
    };
  },
  cec: () => DREAMSIGN_CEC,
  // Pool-scope fix.
  viable: (_p, ctx) => ctx.state.quest.dreamsignPoolIds.length >= 1,
  render: (p) => `Gain ${quoteName(p.name)}`,
  apply: (p, ctx, mut) => {
    const source = ctx.content.dreamsigns.find((dreamsign) => dreamsign.name === p.name);
    if (source === undefined) {
      console.warn(
        `[dream-journey] gain_named_dreamsign: no content dreamsign matches name '${p.name}'`,
      );
      return;
    }
    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:gain_named_dreamsign",
      undefined,
    );
  },
};

type Choose1OfXDreamsignsParams = { choices: number };
const choose1OfXDreamsigns: Reward<Choose1OfXDreamsignsParams> = {
  id: "choose_1_of_X_dreamsigns",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ choices: drawInt(draw, "choose_ds:n", 2, 4) }),
  cec: (p) => DREAMSIGN_CEC * (1 + Math.log2(p.choices)),
  // Pool-scope fix.
  viable: (p, ctx) => ctx.state.quest.dreamsignPoolIds.length >= p.choices,
  render: (p) => `Choose 1 of ${p.choices} Dreamsigns to gain`,
  choosePlan: (p, ctx, planning) => {
    const pool = poolDreamsignsById(ctx);
    const rolledDreamsignIds = pickUniqueDreamsignIds(
      applyDrawContext(ctx),
      "choose_1_of_X_dreamsigns:dreamsign",
      pool,
      p.choices,
    );
    if (rolledDreamsignIds.length < p.choices) return undefined;
    return {
      kind: "dreamsign",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledDreamsignIds,
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to gain",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const pool = poolDreamsignsById(ctx);
    const rolledDreamsignIds = pickUniqueDreamsignIds(
      applyDrawContext(ctx),
      "choose_1_of_X_dreamsigns:dreamsign",
      pool,
      p.choices,
    );
    if (rolledDreamsignIds.length < p.choices) {
      warnSkippedDreamsignApply(
        "choose_1_of_X_dreamsigns",
        `only ${String(rolledDreamsignIds.length)} dreamsigns were available`,
      );
      return;
    }

    const selectedDreamsignId = selectedRolledDreamsignIds(
      "choose_1_of_X_dreamsigns",
      chooserResolution,
      1,
      1,
      rolledDreamsignIds,
    )?.[0];
    if (selectedDreamsignId === undefined) return;

    const source = ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === selectedDreamsignId);
    if (source === undefined) {
      warnSkippedDreamsignApply(
        "choose_1_of_X_dreamsigns",
        `no content dreamsign matches id ${JSON.stringify(selectedDreamsignId)}`,
      );
      return;
    }

    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:choose_1_of_X_dreamsigns",
      undefined,
    );
  },
};

type GainCopyRandomDreamsignParams = Record<string, never>;
const gainCopyOfRandomDreamsign: Reward<GainCopyRandomDreamsignParams> = {
  id: "gain_copy_of_random_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 2.5,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: (_p, ctx) => {
    const name = onlyActiveDreamsignName(ctx);
    return name
      ? `Gain a copy of ${quoteName(name)}`
      : "Gain a copy of one of your Dreamsigns chosen at random";
  },
  apply: (_p, ctx, mut) => {
    const active = ctx.state.quest.activeDreamsigns;
    if (active.length === 0) {
      console.warn(
        "[dream-journey] gain_copy_of_random_dreamsign: no active dreamsigns to copy",
      );
      return;
    }
    const entry = pickFromList(
      applyDrawContext(ctx),
      "gain_copy_of_random_dreamsign:active",
      active,
    );
    const source = ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === entry.dreamsignId);
    if (source === undefined) {
      console.warn(
        `[dream-journey] gain_copy_of_random_dreamsign: no content dreamsign matches id '${entry.dreamsignId}'`,
      );
      return;
    }
    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:gain_copy_of_random_dreamsign",
      undefined,
    );
  },
};

type GainCopyChosenDreamsignParams = Record<string, never>;
const gainCopyOfChosenDreamsign: Reward<GainCopyChosenDreamsignParams> = {
  id: "gain_copy_of_chosen_dreamsign",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => DREAMSIGN_CEC * 3.0,
  viable: (_p, ctx) => ctx.state.quest.activeDreamsigns.length >= 1,
  render: (_p, ctx) => {
    const name = onlyActiveDreamsignName(ctx);
    return name
      ? `Gain a copy of ${quoteName(name)}`
      : "Gain a copy of one of your Dreamsigns of your choice";
  },
  choosePlan: (_p, ctx, planning) => {
    if (ctx.state.quest.activeDreamsigns.length < 1) return undefined;
    return {
      kind: "dreamsign",
      requestId: planning.requestIdForSlot(0),
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to copy",
    };
  },
  apply: (_p, ctx, mut, chooserResolution) => {
    const index = selectedActiveDreamsignIndex(
      "gain_copy_of_chosen_dreamsign",
      ctx,
      chooserResolution,
    );
    if (index === undefined) return;

    const entry = ctx.state.quest.activeDreamsigns[index];
    const source = ctx.content.dreamsigns.find((dreamsign) => dreamsign.id === entry.dreamsignId);
    if (source === undefined) {
      warnSkippedDreamsignApply(
        "gain_copy_of_chosen_dreamsign",
        `no content dreamsign matches id ${JSON.stringify(entry.dreamsignId)}`,
      );
      return;
    }

    mut.addDreamsign(
      projectDreamsignForApply(source),
      "dream_journey:gain_copy_of_chosen_dreamsign",
      undefined,
    );
  },
};

type AddSiteParams = { siteType: string };
const addSiteToDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site:t", JOURNEY_REWARDABLE_SITE_TYPES),
  }),
  cec: () => 100,
  viable: () => true,
  render: (p) =>
    `Add ${indefiniteArticleFor(p.siteType)} ${p.siteType} site to this dreamscape`,
  apply: (p, _ctx, mut) => {
    const siteType = siteTypeForApply("add_site_to_dreamscape", p.siteType);
    if (siteType === undefined) return;
    mut.addSiteToDreamscape(
      "current",
      siteType,
      "dream_journey:add_site_to_dreamscape",
    );
  },
};

const addSiteToNextDreamscape: Reward<AddSiteParams> = {
  id: "add_site_to_next_dreamscape",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "add_site_next:t", JOURNEY_REWARDABLE_SITE_TYPES),
  }),
  cec: () => 75,
  viable: () => true,
  render: (p) =>
    `Add ${indefiniteArticleFor(p.siteType)} ${p.siteType} site to the next dreamscape you visit`,
  apply: (p, _ctx, mut) => {
    const siteType = siteTypeForApply("add_site_to_next_dreamscape", p.siteType);
    if (siteType === undefined) return;
    mut.addSiteToDreamscape(
      "next",
      siteType,
      "dream_journey:add_site_to_next_dreamscape",
    );
  },
};

type StartingDreamwellPosParams = { cardName: string };
const setStartingDreamwellPositive: Reward<StartingDreamwellPosParams> = {
  id: "set_starting_dreamwell_positive",
  weight: 0.25,
  rollParams: (_ctx, draw) => ({
    cardName: POSITIVE_DREAMWELL_CARDS.length > 0
      ? pickFromList(draw, "start_dw_pos:c", POSITIVE_DREAMWELL_CARDS)
      : "Placeholder Dreamwell Card",
  }),
  cec: () => 60,
  // Dreamwell-keyed templates self-hide until `POSITIVE_DREAMWELL_CARDS`
  // lands (Task 17). Mirrors the Task 8 treatment of the negative-side
  // dreamwell costs; the CLI shipped `() => true`, which would surface a
  // "Placeholder Dreamwell Card" option until content arrived.
  viable: () => POSITIVE_DREAMWELL_CARDS.length >= 1,
  render: (p) => `Your starting dreamwell card is ${quoteName(p.cardName)}`,
  apply: () => {
    logSkippedVisualTemplate("set_starting_dreamwell_positive", "dreamwell");
  },
};

type ShufflePosDreamwellParams = { cardName: string; count: number };
const shufflePositiveDreamwellCards: Reward<ShufflePosDreamwellParams> = {
  id: "shuffle_positive_dreamwell_cards",
  weight: 0.25,
  rollParams: (_ctx, draw) => ({
    cardName: POSITIVE_DREAMWELL_CARDS.length > 0
      ? pickFromList(draw, "shuffle_dw_pos:c", POSITIVE_DREAMWELL_CARDS)
      : "Placeholder Dreamwell Card",
    count: drawInt(draw, "shuffle_dw_pos:n", 1, 3),
  }),
  cec: (p) => 25 * p.count,
  viable: () => POSITIVE_DREAMWELL_CARDS.length >= 1,
  render: (p) =>
    `Shuffle ${p.count} ${quoteName(p.cardName)}${p.count === 1 ? "" : " copies"} into your dreamwell`,
  apply: () => {
    logSkippedVisualTemplate("shuffle_positive_dreamwell_cards", "dreamwell");
  },
};

type NextRerollsParams = { count: number };
const nextXShopRerollsFree: Reward<NextRerollsParams> = {
  id: "next_X_shop_rerolls_free",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "rerolls:n", 1, 3) }),
  cec: (p) => 15 * p.count,
  viable: () => true,
  render: (p) =>
    `Your next ${p.count} shop reroll${p.count === 1 ? "" : "s"} ${p.count === 1 ? "is" : "are"} free`,
  apply: (p, _ctx, mut) => {
    mut.grantFreeShopRerolls(p.count, "dream_journey:next_X_shop_rerolls_free");
  },
};

type IncreaseMaxEssenceParams = { amount: number };
const increaseMaxEssence: Reward<IncreaseMaxEssenceParams> = {
  id: "increase_max_essence",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ amount: 25 + 25 * drawInt(draw, "inc_max_essence:a", 0, 4) }),
  cec: (p) => p.amount * 0.5 * STAGE_MULTIPLIER,
  viable: () => true,
  render: (p) => `Increase your maximum essence by ${p.amount}`,
  apply: (p, _ctx, mut) => {
    mut.changeMaxEssence(p.amount, "dream_journey:increase_max_essence");
  },
};

type Draft2PredicateParams = { predicateId: string };
const draft2PredicateCardsFrom4: Reward<Draft2PredicateParams> = {
  id: "draft_2_predicate_cards_from_4",
  weight: 0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(draw, "draft2_predicate:pred").id,
  }),
  cec: (p) =>
    isFlatDraftPredicate(p.predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.4, 2, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) => `Draft 2 of 4 ${getPredicate(p.predicateId).text.plural}`,
  choosePlan: (p, ctx, planning) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_2_predicate_cards_from_4:card",
      4,
    );
    if (rolledCardIds.length < 4) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 2,
      maxPicks: 2,
      title: "Choose cards to draft",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_2_predicate_cards_from_4:card",
      4,
    );
    if (rolledCardIds.length < 4) {
      warnSkippedCardApply(
        "draft_2_predicate_cards_from_4",
        `only ${String(rolledCardIds.length)} draft cards were available`,
      );
      return;
    }

    const selectedCardIds = selectedExactRolledCardIds(
      "draft_2_predicate_cards_from_4",
      chooserResolution,
      2,
      rolledCardIds,
    );
    if (selectedCardIds === undefined) return;

    for (const cardId of selectedCardIds) {
      mut.addCardById(cardId, "dream_journey:draft_2_predicate_cards_from_4");
    }
  },
};

type DraftPredicateCardWithCopiesParams = { predicateId: string; copies: number };
const draftPredicateCardWithCopies: Reward<DraftPredicateCardWithCopiesParams> = {
  id: "draft_predicate_card_with_copies",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollCardAdditionPredicate(draw, "draft_pred_copies:pred").id,
    copies: drawInt(draw, "draft_pred_copies:n", 2, 3),
  }),
  cec: (p) =>
    isFlatDraftPredicate(p.predicateId)
      ? FLAT_DRAFT_CEC
      : cardPoolCEC(CARD_CEC * 1.3, p.copies, getPredicate(p.predicateId)),
  viable: (p, ctx) =>
    cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length >= 4,
  render: (p) =>
    `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural} and gain ${p.copies} copies of it`,
  choosePlan: (p, ctx, planning) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_predicate_card_with_copies:card",
      4,
    );
    if (rolledCardIds.length < 4) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a card to draft",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const rolledCardIds = pickedDraftPredicateCardIds(
      ctx,
      p.predicateId,
      "draft_predicate_card_with_copies:card",
      4,
    );
    if (rolledCardIds.length < 4) {
      warnSkippedCardApply(
        "draft_predicate_card_with_copies",
        `only ${String(rolledCardIds.length)} draft cards were available`,
      );
      return;
    }

    const selectedCardId = selectedExactRolledCardIds(
      "draft_predicate_card_with_copies",
      chooserResolution,
      1,
      rolledCardIds,
    )?.[0];
    if (selectedCardId === undefined) return;

    for (let i = 0; i < p.copies; i += 1) {
      mut.addCardById(selectedCardId, "dream_journey:draft_predicate_card_with_copies");
    }
  },
};

type DraftPredicateCardWithTransfigurationParams = {
  predicateId: string;
  transfiguration: string;
};
const draftPredicateCardWithTransfiguration: Reward<DraftPredicateCardWithTransfigurationParams> =
  {
    id: "draft_predicate_card_with_transfiguration",
    weight: 1.0,
    rollParams: (ctx, draw) => {
      const predicateId = rollCardAdditionPredicate(draw, "draft_pred_xfig:pred").id;
      return {
        predicateId,
        transfiguration: pickTransfigurationForPredicate(
          ctx,
          draw,
          "draft_pred_xfig:t",
          predicateId,
        ),
      };
    },
    cec: (p) =>
      isFlatDraftPredicate(p.predicateId)
        ? FLAT_DRAFT_CEC
        : cardPoolCEC(CARD_CEC * 1.8, 1, getPredicate(p.predicateId)),
    viable: (p, ctx) =>
      isJourneyTransfiguration(p.transfiguration)
      && draftPredicatePool(ctx, p.predicateId, p.transfiguration).length >= 4
      && predicateAdmitsTransfiguration(ctx, p.predicateId, p.transfiguration),
    render: (p) =>
      `Draft 1 of 4 ${getPredicate(p.predicateId).text.plural} and apply ${p.transfiguration} to it`,
    choosePlan: (p, ctx, planning) => {
      if (!isJourneyTransfiguration(p.transfiguration)) return undefined;
      const rolledCardIds = pickedDraftPredicateCardIds(
        ctx,
        p.predicateId,
        "draft_predicate_card_with_transfiguration:card",
        4,
        p.transfiguration,
      );
      if (rolledCardIds.length < 4) return undefined;
      return {
        kind: "card",
        requestId: planning.requestIdForSlot(0),
        poolKind: "rolled",
        rolledCardIds,
        minPicks: 1,
        maxPicks: 1,
        title: "Choose a card to draft",
      };
    },
    apply: (p, ctx, mut, chooserResolution) => {
      if (!isJourneyTransfiguration(p.transfiguration)) {
        warnSkippedCardApply(
          "draft_predicate_card_with_transfiguration",
          `unknown transfiguration ${JSON.stringify(p.transfiguration)}`,
        );
        return;
      }

      const rolledCardIds = pickedDraftPredicateCardIds(
        ctx,
        p.predicateId,
        "draft_predicate_card_with_transfiguration:card",
        4,
        p.transfiguration,
      );
      if (rolledCardIds.length < 4) {
        warnSkippedCardApply(
          "draft_predicate_card_with_transfiguration",
          `only ${String(rolledCardIds.length)} draft cards were available`,
        );
        return;
      }

      const selectedCardId = selectedExactRolledCardIds(
        "draft_predicate_card_with_transfiguration",
        chooserResolution,
        1,
        rolledCardIds,
      )?.[0];
      if (selectedCardId === undefined) return;

      const selectedCard = ctx.content.cards.find((card) => card.id === selectedCardId);
      if (
        selectedCard === undefined
        || !isCardEligibleForTransfiguration(p.transfiguration, selectedCard)
      ) {
        warnSkippedCardApply(
          "draft_predicate_card_with_transfiguration",
          `selected card ${JSON.stringify(selectedCardId)} was not eligible for ${JSON.stringify(p.transfiguration)}`,
        );
        return;
      }

      mut.addCardByIdWithTransfiguration(
        selectedCardId,
        transfigurationForApply(p.transfiguration),
        "dream_journey:draft_predicate_card_with_transfiguration",
      );
    },
  };

type MakeCardReclaimParams = { cardName: string; count: number };
const makeCardReclaim: Reward<MakeCardReclaimParams> = {
  id: "make_card_reclaim",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "make_reclaim:c", deckCards).name
        : "Placeholder Card",
      count: drawInt(draw, "make_reclaim:n", 1, 3),
    };
  },
  cec: (p) => CARD_CEC * 0.5 * p.count,
  // Named-card smell.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  render: (p) => `Add Reclaim ${p.count} to ${quoteName(p.cardName)}`,
  apply: () => {
    logSkippedVisualTemplate("make_card_reclaim", "visual");
  },
};

type MakeRandomCardsReclaimParams = { count: number; reclaim: number };
const makeRandomCardsReclaim: Reward<MakeRandomCardsReclaimParams> = {
  id: "make_random_cards_reclaim",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    count: drawInt(draw, "make_random_reclaim:n", 1, 3),
    reclaim: drawInt(draw, "make_random_reclaim:r", 1, 2),
  }),
  cec: (p) => CARD_CEC * 0.5 * p.count * p.reclaim,
  // Deck-size-N: inline upgraded to helper.
  viable: (p, ctx) => deckHasMinSize(ctx, p.count),
  render: (p) =>
    `Add Reclaim ${p.reclaim} to ${p.count} random card${p.count === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("make_random_cards_reclaim", "visual");
  },
};

type OpeningHandGrantParams = { cardName: string; battles: number };
const openingHandGrantForXBattles: Reward<OpeningHandGrantParams> = {
  id: "opening_hand_grant_for_X_battles",
  weight: 0.5,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "oh_grant:c", deckCards).name
        : "Placeholder Card",
      battles: rollPositiveTemporaryBattles(draw, "oh_grant:b"),
    };
  },
  cec: (p) => CARD_CEC * 0.3 * p.battles,
  // Named-card smell.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  render: (p) =>
    `Your opening hand contains ${quoteName(p.cardName)} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("opening_hand_grant_for_X_battles", "battle_window");
  },
};

type TemporaryCardCopyParams = { cardName: string; battles: number };
const temporaryCardCopyForXBattles: Reward<TemporaryCardCopyParams> = {
  id: "temporary_card_copy_for_X_battles",
  weight: 0.25,
  rollParams: (ctx, draw) => {
    const deckCards = cardMatches(ctx, { source: "deck" });
    return {
      cardName: deckCards.length > 0
        ? pickFromList(draw, "temp_copy:c", deckCards).name
        : "Placeholder Card",
      battles: rollPositiveTemporaryBattles(draw, "temp_copy:b"),
    };
  },
  cec: (p) => CARD_CEC * 0.25 * p.battles,
  // Named-card smell.
  viable: (p, ctx) => deckContainsCardByName(ctx, p.cardName),
  render: (p) =>
    `Gain a temporary copy of ${quoteName(p.cardName)} for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("temporary_card_copy_for_X_battles", "battle_window");
  },
};

type CostReductionParams = { predicateId: string; amount: number; battles: number };
const cardCostReductionForXBattles: Reward<CostReductionParams> = {
  id: "card_cost_reduction_for_X_battles",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    predicateId: rollPredicate(draw, "cost_red:p").id,
    amount: drawInt(draw, "cost_red:a", 1, 2),
    battles: rollPositiveTemporaryBattles(draw, "cost_red:b"),
  }),
  cec: (p) => cardPoolCEC(CARD_CEC * 0.3 * p.amount * p.battles, 1, getPredicate(p.predicateId)),
  // "Always viable in kind": the discount applies even with an empty deck —
  // the player accepts the temporary effect on future cards.
  viable: () => true,
  render: (p) =>
    `${sentenceCase(getPredicate(p.predicateId).text.plural)} cost ${p.amount} less for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("card_cost_reduction_for_X_battles", "visual");
  },
};

type ApplyNamedTransfigAllPredParams = { transfiguration: string; predicateId: string };
const applyNamedTransfigurationToAllPredicateCards: Reward<ApplyNamedTransfigAllPredParams> = {
  id: "apply_named_transfiguration_to_all_predicate_cards",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const predicateId = rollPredicate(draw, "named_transfig_all:p").id;
    return {
      transfiguration: pickTransfigurationForPredicate(
        ctx,
        draw,
        "named_transfig_all:t",
        predicateId,
      ),
      predicateId,
    };
  },
  cec: (p, ctx) => {
    const matches = cardMatches(ctx, getPredicate(p.predicateId).cardPredicate ?? {}).length;
    return CARD_CEC * 0.6 * Math.max(1, matches) * getPredicate(p.predicateId).multiplier;
  },
  // Viability mirrors the concrete eligible entries used by apply.
  viable: (p, ctx) =>
    deckContainsUntransfiguredPredicate(ctx, p.predicateId, 1, p.transfiguration),
  render: (p) =>
    `Apply ${p.transfiguration} to all ${getPredicate(p.predicateId).text.plural}`,
  apply: (p, ctx, mut) => {
    const entryIds = findUntransfiguredDeckEntriesByPredicateEligibleForTransfiguration(
      ctx,
      p.predicateId,
      p.transfiguration,
    );
    if (entryIds.length === 0) {
      warnSkippedCardApply(
        "apply_named_transfiguration_to_all_predicate_cards",
        `no untransfigured deck entries matched predicate ${JSON.stringify(p.predicateId)}`,
      );
      return;
    }
    for (const entryId of entryIds) {
      mut.transfigureDeckEntry(
        entryId,
        transfigurationForApply(p.transfiguration),
        "dream_journey:apply_named_transfiguration_to_all_predicate_cards",
      );
    }
  },
};

type TransfigureChosenStartersParams = { count: number };
const transfigureChosenStarters: Reward<TransfigureChosenStartersParams> = {
  id: "transfigure_chosen_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "transfig_chosen_starters:n", 1, 2) }),
  cec: (p) => CARD_CEC * 0.9 * p.count,
  viable: (p, ctx) => deckContainsUntransfiguredPredicate(ctx, "starter", p.count),
  render: (p) =>
    p.count === 1
      ? "Apply a random transfiguration to 1 chosen starter card"
      : `Apply random transfigurations to ${p.count} chosen starter cards`,
  choosePlan: (p, ctx, planning) => {
    const entryIds = findUntransfiguredDeckEntriesByPredicate(ctx, "starter");
    if (entryIds.length < p.count) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { starterOnly: true, entryIds },
      minPicks: p.count,
      maxPicks: p.count,
      title: p.count === 1
        ? "Choose a starter card to transfigure"
        : "Choose starter cards to transfigure",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const entryIds = selectedExactDeckEntryIds(
      "transfigure_chosen_starters",
      ctx,
      chooserResolution,
      p.count,
      findUntransfiguredDeckEntriesByPredicate(ctx, "starter"),
    );
    if (entryIds === undefined) return;

    const draw = applyDrawContext(ctx);
    const transfigurations = entryIds.map((entryId, index) =>
      pickRandomTransfigurationForEntry(
        ctx,
        draw,
        "transfigure_chosen_starters",
        `transfigure_chosen_starters:transfiguration:${index}`,
        entryId,
      ),
    );
    if (transfigurations.some((transfiguration) => transfiguration === undefined)) return;

    entryIds.forEach((entryId, index) => {
      mut.transfigureDeckEntry(
        entryId,
        transfigurations[index]!,
        "dream_journey:transfigure_chosen_starters",
      );
    });
  },
};

type PurgeChosenStartersParams = { count: number };
const purgeChosenStarters: Reward<PurgeChosenStartersParams> = {
  id: "purge_chosen_starters",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "purge_chosen_starters:n", 1, 3) }),
  cec: (p) => CARD_CEC * 0.45 * p.count,
  viable: (_p, ctx) => findDeckEntriesByPredicate(ctx, "starter").length >= 1,
  render: (p) =>
    p.count === 1 ? "Purge a chosen starter card" : `Purge up to ${p.count} chosen starter cards`,
  choosePlan: (p, ctx, planning) => {
    const entryIds = findDeckEntriesByPredicate(ctx, "starter");
    const maxPicks = Math.min(p.count, entryIds.length);
    if (maxPicks < 1) return undefined;
    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "deck",
      deckFilter: { starterOnly: true, entryIds },
      minPicks: 1,
      maxPicks,
      title: p.count === 1 ? "Choose a starter card to purge" : "Choose starter cards to purge",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const eligibleEntryIds = findDeckEntriesByPredicate(ctx, "starter");
    const entryIds = selectedBoundedDeckEntryIds(
      "purge_chosen_starters",
      ctx,
      chooserResolution,
      1,
      Math.min(p.count, eligibleEntryIds.length),
      eligibleEntryIds,
    );
    if (entryIds === undefined) return;

    for (const entryId of entryIds) {
      mut.removeDeckEntry(entryId, "dream_journey:purge_chosen_starters");
    }
  },
};

type PurgeAllStartersParams = Record<string, never>;
const purgeAllStarters: Reward<PurgeAllStartersParams> = {
  id: "purge_all_starters",
  weight: 1.0,
  rollParams: () => ({}),
  cec: (_p, ctx) => CARD_CEC * 0.6 * Math.max(1, starterCardCount(ctx)),
  viable: (_p, ctx) => starterCardCount(ctx) >= 1,
  render: () => "Purge all starter cards",
  apply: (_p, ctx, mut) => {
    const entryIds = findDeckEntriesByPredicate(ctx, "starter");
    if (entryIds.length === 0) {
      warnSkippedCardApply("purge_all_starters", "starter deck entries were not found");
      return;
    }
    for (const entryId of entryIds) {
      mut.removeDeckEntry(entryId, "dream_journey:purge_all_starters");
    }
  },
};

type ReplaceStarterViaDraftParams = Record<string, never>;
const replaceStarterViaDraft: Reward<ReplaceStarterViaDraftParams> = {
  id: "replace_starter_via_draft",
  weight: 1.0,
  rollParams: () => ({}),
  cec: () => CARD_CEC * 1.0,
  viable: (_p, ctx) => starterCardCount(ctx) >= 1 && ctx.content.cards.length >= 4,
  render: () => "Replace a random starter card with 1 of 4 drafted cards",
  choosePlan: (_p, ctx, planning) => {
    const starterEntryId = pickedReplaceStarterEntryId(ctx);
    if (starterEntryId === undefined) return undefined;

    const rolledCardIds = pickedReplaceStarterDraftCardIds(ctx);
    if (rolledCardIds.length < 4) return undefined;

    return {
      kind: "card",
      requestId: planning.requestIdForSlot(0),
      poolKind: "rolled",
      rolledCardIds,
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a replacement card",
    };
  },
  apply: (_p, ctx, mut, chooserResolution) => {
    const starterEntryId = pickedReplaceStarterEntryId(ctx);
    if (starterEntryId === undefined) {
      warnSkippedCardApply("replace_starter_via_draft", "starter deck entry was not found");
      return;
    }

    const rolledCardIds = pickedReplaceStarterDraftCardIds(ctx);
    if (rolledCardIds.length < 4) {
      warnSkippedCardApply(
        "replace_starter_via_draft",
        `only ${String(rolledCardIds.length)} draft cards were available`,
      );
      return;
    }

    const selectedCardId = selectedExactRolledCardIds(
      "replace_starter_via_draft",
      chooserResolution,
      1,
      rolledCardIds,
    )?.[0];
    if (selectedCardId === undefined) return;

    if (!ctx.content.cards.some((card) => card.id === selectedCardId)) {
      warnSkippedCardApply(
        "replace_starter_via_draft",
        `catalog card ${JSON.stringify(selectedCardId)} was not found`,
      );
      return;
    }

    mut.removeDeckEntry(starterEntryId, "dream_journey:replace_starter_via_draft");
    mut.addCardById(selectedCardId, "dream_journey:replace_starter_via_draft");
  },
};

type ApplyRandomTransfigurationsToRandomCardsParams = { count: number };
const applyRandomTransfigurationsToRandomCards: Reward<ApplyRandomTransfigurationsToRandomCardsParams> =
  {
    id: "apply_random_transfigurations_to_random_cards",
    weight: 1.0,
    rollParams: (_ctx, draw) => ({ count: drawInt(draw, "random_transfig_random:n", 1, 3) }),
    cec: (p) => CARD_CEC * 0.5 * p.count,
    // Deck-size-N.
    viable: (p, ctx) => deckHasUntransfiguredMinSize(ctx, p.count),
    render: (p) =>
      p.count === 1
        ? "Apply a random transfiguration to 1 random card"
        : `Apply random transfigurations to ${p.count} random cards`,
    apply: (p, ctx, mut) => {
      const entryIds = findUntransfiguredDeckEntryIds(ctx);
      if (entryIds.length === 0) {
        warnSkippedCardApply(
          "apply_random_transfigurations_to_random_cards",
          "untransfigured deck entries were not found",
        );
        return;
      }
      const draw = applyDrawContext(ctx);
      const pickedEntryIds = pickUniqueDeckEntryIds(
        draw,
        "apply_random_transfigurations_to_random_cards:entry",
        entryIds,
        p.count,
      );
      if (pickedEntryIds.length < p.count) {
        warnSkippedCardApply(
          "apply_random_transfigurations_to_random_cards",
          `only ${pickedEntryIds.length} deck entries available for count=${p.count}`,
        );
      }
      pickedEntryIds.forEach((entryId, index) => {
        const transfiguration = pickRandomTransfigurationForEntry(
          ctx,
          draw,
          "apply_random_transfigurations_to_random_cards",
          `apply_random_transfigurations_to_random_cards:transfiguration:${index}`,
          entryId,
        );
        if (transfiguration === undefined) return;
        mut.transfigureDeckEntry(
          entryId,
          transfiguration,
          "dream_journey:apply_random_transfigurations_to_random_cards",
        );
      });
    },
  };

type TransformDreamsignToNamedParams = { name: string };
const transformDreamsignToNamed: Reward<TransformDreamsignToNamedParams> = {
  id: "transform_dreamsign_to_named",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const pool = inactivePoolDreamsigns(ctx);
    return {
      name: pool.length > 0
        ? pickFromList(draw, "xform_ds_named:c", pool).name
        : "Placeholder Dreamsign",
    };
  },
  cec: () => DREAMSIGN_CEC * 0.6,
  // Pool-scope fix: the destination dreamsign comes from the pool minus
  // those already active.
  viable: (_p, ctx) =>
    ctx.state.quest.activeDreamsigns.length >= 1 && inactivePoolDreamsigns(ctx).length >= 1,
  render: (p) => `Transform a chosen Dreamsign into ${quoteName(p.name)}`,
  choosePlan: (p, ctx, planning) => {
    if (!inactivePoolDreamsigns(ctx).some((dreamsign) => dreamsign.name === p.name)) {
      return undefined;
    }
    if (ctx.state.quest.activeDreamsigns.length < 1) return undefined;
    return {
      kind: "dreamsign",
      requestId: planning.requestIdForSlot(0),
      poolKind: "active",
      minPicks: 1,
      maxPicks: 1,
      title: "Choose a Dreamsign to transform",
    };
  },
  apply: (p, ctx, mut, chooserResolution) => {
    const target = inactivePoolDreamsigns(ctx).find((dreamsign) => dreamsign.name === p.name);
    if (target === undefined) {
      warnSkippedDreamsignApply(
        "transform_dreamsign_to_named",
        `no inactive pool dreamsign matches name ${JSON.stringify(p.name)}`,
      );
      return;
    }

    const index = selectedActiveDreamsignIndex(
      "transform_dreamsign_to_named",
      ctx,
      chooserResolution,
    );
    if (index === undefined) return;

    mut.addDreamsign(
      projectDreamsignForApply(target),
      "dream_journey:transform_dreamsign_to_named",
      index,
    );
  },
};

type TemporaryDreamsignParams = { battles: number };
const temporaryDreamsignForXBattles: Reward<TemporaryDreamsignParams> = {
  id: "temporary_dreamsign_for_X_battles",
  weight: 0.25,
  rollParams: (_ctx, draw) => ({ battles: rollPositiveTemporaryBattles(draw, "temp_ds:b") }),
  cec: (p) => 25 * (1 + (p.battles - 1) * 0.5),
  // Pool-scope fix: a temporary dreamsign comes from the pool.
  viable: (_p, ctx) => ctx.state.quest.dreamsignPoolIds.length >= 1,
  render: (p) =>
    `Gain a random Dreamsign for the next ${p.battles} battle${p.battles === 1 ? "" : "s"}`,
  apply: () => {
    logSkippedVisualTemplate("temporary_dreamsign_for_X_battles", "battle_window");
  },
};

type ReplaceSiteTypeParams = { fromType: string; toType: string };
const replaceSiteType: Reward<ReplaceSiteTypeParams> = {
  id: "replace_site_type",
  weight: 1.0,
  rollParams: (_ctx, draw) => {
    const fromType = pickFromList(draw, "replace_site:from", JOURNEY_REPLACEABLE_SITE_TYPES);
    const options = JOURNEY_REWARDABLE_SITE_TYPES.filter((t) => t !== fromType);
    const toType = options.length > 0
      ? pickFromList(draw, "replace_site:to", options)
      : fromType;
    return { fromType, toType };
  },
  cec: () => 35,
  viable: () => true,
  render: (p) =>
    `Replace ${indefiniteArticleFor(p.fromType)} ${p.fromType} site in this dreamscape with ${indefiniteArticleFor(p.toType)} ${p.toType} site`,
  apply: (p, _ctx, mut) => {
    const fromType = siteTypeForApply("replace_site_type", p.fromType);
    const toType = siteTypeForApply("replace_site_type", p.toType);
    if (fromType === undefined || toType === undefined) return;
    mut.replaceSiteType(
      fromType,
      toType,
      "dream_journey:replace_site_type",
    );
  },
};

type ShopEssenceDiscountParams = { percent: number };
const shopEssenceDiscount: Reward<ShopEssenceDiscountParams> = {
  id: "shop_essence_discount",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ percent: 10 + 10 * drawInt(draw, "shop_e_disc:p", 0, 4) }),
  cec: (p) => p.percent * 1.0,
  viable: () => true,
  render: (p) => `Shop essence costs are permanently reduced by ${p.percent}%`,
  apply: (p, _ctx, mut) => {
    mut.applyShopEssenceDiscount(p.percent, "dream_journey:shop_essence_discount");
  },
};

type ShopOmenDiscountParams = { count: number };
const shopOmenDiscount: Reward<ShopOmenDiscountParams> = {
  id: "shop_omen_discount",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({ count: drawInt(draw, "shop_o_disc:n", 1, 3) }),
  cec: (p) => p.count * 25,
  viable: () => true,
  render: (p) =>
    `Your next ${p.count} shop purchase${p.count === 1 ? "" : "s"} cost${p.count === 1 ? "s" : ""} 1 fewer omen`,
  apply: (p, _ctx, mut) => {
    mut.grantShopOmenDiscounts(p.count, "dream_journey:shop_omen_discount");
  },
};

const BOOST_SITE_TYPE_MULTIPLIER: Readonly<Record<string, number>> = Object.freeze({
  "Purge": 1.25,
  "Duplication": 1.25,
  "Dreamsign Draft": 1.25,
  "Essence": 0.75,
  "Shop": 0.75,
  "Specialty Shop": 0.75,
  "Transfiguration": 0.75,
  "Dreamsign Offering": 0.75,
});

function boostSiteCec(siteType: string, percent: number): number {
  const baseline = 75 + (percent - 20) * 2.5;
  const multiplier = BOOST_SITE_TYPE_MULTIPLIER[siteType] ?? 1.0;
  return baseline * multiplier;
}

type BoostSiteParams = { siteType: string; percent: number; dreamscapes?: number };
const boostSiteAppearanceChance: Reward<BoostSiteParams> = {
  id: "boost_site_appearance_chance",
  weight: 1.0,
  rollParams: (_ctx, draw) => ({
    siteType: pickFromList(draw, "boost_site:t", JOURNEY_REWARDABLE_SITE_TYPES),
    percent: 10 + 10 * drawInt(draw, "boost_site:p", 0, 4),
    dreamscapes: BOOST_SITE_DURATION_DREAMSCAPES,
  }),
  cec: (p) => boostSiteCec(p.siteType, p.percent),
  viable: () => true,
  render: (p) => {
    const dreamscapes = p.dreamscapes ?? BOOST_SITE_DURATION_DREAMSCAPES;
    return `${p.percent}% higher chance to see ${p.siteType} sites in the next ${dreamscapes} dreamscape${dreamscapes === 1 ? "" : "s"} you visit`;
  },
  apply: (p, _ctx, mut) => {
    const siteType = siteTypeForApply("boost_site_appearance_chance", p.siteType);
    if (siteType === undefined) return;
    mut.boostSiteAppearance(
      siteType,
      p.percent,
      p.dreamscapes ?? BOOST_SITE_DURATION_DREAMSCAPES,
      "dream_journey:boost_site_appearance_chance",
    );
  },
};

type MetaGain2Params = {
  subIds: readonly [string, string];
  subParams: readonly [TemplateParams, TemplateParams];
};

function nonMetaRewards(): readonly Reward[] {
  return REWARDS.filter((r) => !r.id.startsWith("meta_"));
}

const META_REWARD_INCOMPATIBLE_UNORDERED_PAIRS: ReadonlySet<string> = new Set([
  metaRewardPairKey("purge_all_starters", "transfigure_all_starters"),
  metaRewardPairKey("purge_all_banes", "purge_X_banes"),
]);

function metaRewardPairKey(firstId: string, secondId: string): string {
  return [firstId, secondId].sort().join("\0");
}

function metaRewardPairCompatible(firstId: string, secondId: string): boolean {
  return !META_REWARD_INCOMPATIBLE_UNORDERED_PAIRS.has(metaRewardPairKey(firstId, secondId));
}

function orderedCompatibleRewardPairs(pool: readonly Reward[]): readonly (readonly [Reward, Reward])[] {
  const pairs: (readonly [Reward, Reward])[] = [];
  for (let firstIndex = 0; firstIndex < pool.length; firstIndex += 1) {
    for (let secondIndex = 0; secondIndex < pool.length; secondIndex += 1) {
      if (firstIndex === secondIndex) continue;
      const first = pool[firstIndex];
      const second = pool[secondIndex];
      if (metaRewardPairCompatible(first.id, second.id)) {
        pairs.push([first, second] as const);
      }
    }
  }
  return pairs;
}

const metaGain2Rewards: Reward<MetaGain2Params> = {
  id: "meta_gain_2_rewards",
  weight: 1.0,
  rollParams: (ctx, draw) => {
    const allNonMeta = nonMetaRewards();
    // Restrict to sub-templates viable in the current state, so the meta
    // template is viable whenever it picks two sub-templates.
    const pool = allNonMeta.filter((r) => {
      const subDraw = { ...draw, selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 7 };
      const subParams = r.rollParams(ctx, subDraw);
      return r.viable(subParams, ctx);
    });
    const viablePairs = orderedCompatibleRewardPairs(pool);
    const allPairs = orderedCompatibleRewardPairs(allNonMeta);
    const usePairs = viablePairs.length > 0 ? viablePairs : allPairs;
    if (usePairs.length === 0) {
      const first = allNonMeta[0];
      return {
        subIds: [first.id, first.id] as readonly [string, string],
        subParams: [
          first.rollParams(ctx, draw),
          first.rollParams(ctx, draw),
        ] as readonly [TemplateParams, TemplateParams],
      };
    }
    const [first, second] = usePairs[drawInt(draw, "meta_gain_2:pair", 0, usePairs.length - 1)];
    return {
      subIds: [first.id, second.id] as readonly [string, string],
      subParams: [
        first.rollParams(ctx, {
          ...draw,
          selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 1,
        }),
        second.rollParams(ctx, {
          ...draw,
          selectionAttempt: (draw.selectionAttempt ?? 0) * 10 + 2,
        }),
      ] as readonly [TemplateParams, TemplateParams],
    };
  },
  cec: (p, ctx) => {
    const a = getReward(p.subIds[0]);
    const b = getReward(p.subIds[1]);
    return a.cec(p.subParams[0], ctx) + b.cec(p.subParams[1], ctx);
  },
  viable: (p, ctx) => {
    const a = getReward(p.subIds[0]);
    const b = getReward(p.subIds[1]);
    return metaRewardPairCompatible(p.subIds[0], p.subIds[1])
      && a.viable(p.subParams[0], ctx)
      && b.viable(p.subParams[1], ctx);
  },
  render: (p, ctx) => {
    const a = getReward(p.subIds[0]);
    const b = getReward(p.subIds[1]);
    return [a.render(p.subParams[0], ctx), b.render(p.subParams[1], ctx)].join(". ");
  },
  apply: (p, ctx, mut) => {
    const a = getReward(p.subIds[0]);
    const b = getReward(p.subIds[1]);
    a.apply(p.subParams[0], ctx, mut);
    b.apply(p.subParams[1], ctx, mut);
  },
};

export const REWARDS: readonly Reward[] = Object.freeze([
  gainEssence,
  gainOmens,
  setEssenceToPercentOfMax,
  gainEssenceRandomRange,
  gainEssenceToMax,
  gainRandomPredicateCards,
  draftPredicateCardsFrom4,
  takeAnyFromPredicateChoices,
  gainNamedCard,
  applyChosenTransfigurationToChosenCard,
  applyNamedTransfigurationToChosenPredicateCards,
  applyNamedTransfigurationToCardName,
  applyNamedTransfigurationToRandomPredicateCards,
  transfigureRandomStarters,
  transfigureAllStarters,
  changeCardToBecomeType,
  modifyRandomCardsToTypes,
  makeRandomCardsFast,
  purgeChosenPredicateCards,
  purgeChosenPredicateWithReplacement,
  purgeNamedStarter,
  purgeRandomStarter,
  purgeRandomStarterWithPredicateReplacement,
  transformStarterIntoNamedCard,
  transformCardInDeckIntoNamed,
  transformChosenPredicateIntoNamed,
  duplicateNamedCardX,
  duplicateChosenCards,
  duplicateRandomPredicate,
  drawXAndDuplicateChosen,
  purgeXBanes,
  purgeAllBanes,
  gainRandomDreamsign,
  gainNamedDreamsign,
  choose1OfXDreamsigns,
  gainCopyOfRandomDreamsign,
  gainCopyOfChosenDreamsign,
  addSiteToDreamscape,
  addSiteToNextDreamscape,
  setStartingDreamwellPositive,
  shufflePositiveDreamwellCards,
  nextXShopRerollsFree,
  boostSiteAppearanceChance,
  increaseMaxEssence,
  draft2PredicateCardsFrom4,
  draftPredicateCardWithCopies,
  draftPredicateCardWithTransfiguration,
  makeCardReclaim,
  makeRandomCardsReclaim,
  openingHandGrantForXBattles,
  temporaryCardCopyForXBattles,
  cardCostReductionForXBattles,
  applyNamedTransfigurationToAllPredicateCards,
  transfigureChosenStarters,
  purgeChosenStarters,
  purgeAllStarters,
  replaceStarterViaDraft,
  applyRandomTransfigurationsToRandomCards,
  transformDreamsignToNamed,
  temporaryDreamsignForXBattles,
  replaceSiteType,
  shopEssenceDiscount,
  shopOmenDiscount,
  metaGain2Rewards,
]);

const BY_ID = new Map(REWARDS.map((r) => [r.id, r]));

export function getReward(id: string): Reward {
  const found = BY_ID.get(id);
  if (!found) throw new Error(`Unknown reward template id: ${id}`);
  return found;
}

/**
 * Lookup variant that returns `undefined` for unknown ids rather than
 * throwing. The apply dispatch loop uses this to surface a `console.warn` and
 * continue processing the remaining envelopes when an envelope references a
 * templateId the catalog does not contain.
 */
export function findReward(id: string): Reward | undefined {
  return BY_ID.get(id);
}
