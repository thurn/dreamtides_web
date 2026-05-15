// Effect-catalog scaffolding for journeys.
//
// This file holds the predicate types, target resolvers, bane / site type /
// transfiguration vocabularies, and transfiguration eligibility logic that
// every shape, template, and predicate consumes. Future tasks layer the full
// effect catalog, operations, manifest contract, and validation on top of
// this base.
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type {
  CardContent,
  ContentBundle,
  DreamsignContent,
  TideId,
} from "../content/types";
import type { QuestStateProjection } from "./context";

export type CardTargetPredicate = {
  source?: "catalog" | "deck" | "draftPool";
  ids?: readonly string[];
  names?: readonly string[];
  cardType?: string;
  subtype?: string;
  energyCost?: number | "*";
  minEnergyCost?: number;
  maxEnergyCost?: number;
  rarity?: string;
  isFast?: boolean;
  spark?: number;
  renderedTextIncludes?: readonly string[] | string;
  tideOverlap?: readonly TideId[] | "selected";
  starter?: boolean;
  minCopies?: number;
  maxCopies?: number;
  minAbilityCount?: number;
  hasMultipleAbilities?: boolean;
};

export type DreamsignTargetPredicate = {
  source?: "catalog" | "active" | "pool";
  ids?: readonly string[];
  names?: readonly string[];
  kind?: DreamsignContent["kind"];
  orientation?: NonNullable<DreamsignContent["orientation"]>;
  tideOverlap?: readonly TideId[] | "selected";
};

export const BANE_NAMES = Object.freeze([
  "Nightmare",
  "Despair",
  "Oblivion",
  "Betrayal",
  "Envy",
  "Doubt",
  "Silence",
  "Paranoia",
  "Burden",
  "Paralysis",
  "Lethargy",
] as const);

export type BaneName = (typeof BANE_NAMES)[number];

export const SITE_TYPES = Object.freeze([
  "Battle",
  "Draft",
  "Essence",
  "Shop",
  "Specialty Shop",
  "Purge",
  "Transfiguration",
  "Dreamsign Offering",
  "Dreamsign Draft",
  "Dream Journey",
  "Duplication",
] as const);

// Site types that can be replaced by a random Journey reward.
// Excludes "Battle" (every dreamscape has exactly one) and "Draft" (draft-site
// counts are deterministic per completion level, so replacement breaks
// pacing).
export const JOURNEY_REPLACEABLE_SITE_TYPES: readonly string[] = Object.freeze(
  SITE_TYPES.filter((t) => t !== "Battle" && t !== "Draft"),
);

// Site types a random Journey reward may add, replace into, or boost as a
// destination. Drops "Dream Journey" on top of the replaceable list because
// adding or boosting neutral Journey sites is not a clear reward.
export const JOURNEY_REWARDABLE_SITE_TYPES: readonly string[] = Object.freeze(
  JOURNEY_REPLACEABLE_SITE_TYPES.filter((t) => t !== "Dream Journey"),
);

// The canonical eight named transfigurations, per `docs/quests.md`
// § Transfiguration. Random Journey reward generation picks named
// transfigurations exclusively from this set.
export const JOURNEY_TRANSFIGURATIONS = Object.freeze([
  "Viridian",
  "Golden",
  "Scarlet",
  "Magenta",
  "Azure",
  "Bronze",
  "Rose",
  "Prismatic",
] as const);

// Eligibility filters for each named transfiguration. A transfiguration may
// only be applied to a card that satisfies its filter. Source of truth:
// `docs/quests.md` § Transfiguration. Filters not listed are unrestricted
// (the transfiguration applies to any card).
//
// - `Viridian`: cost > 0 (50% cost reduction; cannot apply to cost-0 cards).
// - `Golden`: applies to cards whose TOML defines a golden variant; for
//   generator purposes treated as unrestricted because the generator does
//   not have visibility into the per-card TOML data.
// - `Scarlet`: characters only (doubles base spark).
// - `Bronze`: events only (adds Reclaim).
// - `Azure`: events only (appends "draw a card").
// - `Rose`: cards with an energy-cost activated ability (`N●...:` pattern).
// - `Magenta`: cards with a `materialized`, `judgment`, or `once per turn`
//   trigger.
// - `Prismatic`: applies to any card eligible for 2 or more other
//   transfigurations; conservatively treated as unrestricted at generation
//   time and validated against the underlying pool at apply time.
export function isCardEligibleForTransfiguration(
  transfiguration: string,
  card: CardContent,
): boolean {
  switch (transfiguration) {
    case "Viridian":
      return typeof card.energyCost === "number" && card.energyCost > 0;
    case "Scarlet":
      return card.cardType === "Character";
    case "Bronze":
    case "Azure":
      return card.cardType === "Event";
    case "Rose":
      return cardHasEnergyCostActivatedAbility(card);
    case "Magenta":
      return cardHasMagentaTrigger(card);
    default:
      return true;
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function cardRenderedText(card: CardContent): string {
  return asString(card.raw["rendered-text"]) || asString(card.raw.renderedText);
}

function cardHasEnergyCostActivatedAbility(card: CardContent): boolean {
  // Activated abilities with an energy cost render with a leading `N●`
  // (optionally followed by additional costs) before a colon, for example
  // `2●: Draw a card` or `2●, Banish another card in your void: Reclaim this
  // character.` Detect that pattern conservatively.
  return /\d●[^:\n]*:/u.test(cardRenderedText(card));
}

function cardHasMagentaTrigger(card: CardContent): boolean {
  // Magenta increases the frequency of `materialized`, `judgment`, and `once
  // per turn` triggers, so a card is eligible if any of those phrases appear
  // in its rendered text.
  const text = cardRenderedText(card).toLowerCase();
  return (
    text.includes("materialized") ||
    text.includes("judgment") ||
    text.includes("once per turn")
  );
}

function normalizeKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function idOrNameMatches(
  value: { id: string; name: string },
  references?: readonly string[],
): boolean {
  if (!references || references.length === 0) {
    return true;
  }

  const id = normalizeKey(value.id);
  const name = normalizeKey(value.name);

  return references.some((reference) => {
    const normalized = normalizeKey(reference);
    return normalized === id || normalized === name;
  });
}

function contentById<T extends { id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function selectedTideSet(
  quest: QuestStateProjection,
  tideOverlap: readonly TideId[] | "selected",
): Set<string> {
  const tides = tideOverlap === "selected" ? quest.selectedTides : tideOverlap;
  return new Set(tides.map(normalizeKey));
}

function hasTideOverlap(
  sourceTides: readonly TideId[],
  wantedTides: Set<string>,
): boolean {
  return sourceTides.some((tide) => wantedTides.has(normalizeKey(tide)));
}

function isFast(card: CardContent): boolean {
  return card.raw["is-fast"] === true || card.raw.isFast === true;
}

function subtypeMatches(card: CardContent, subtype: string | undefined): boolean {
  if (subtype === undefined) {
    return true;
  }
  return asString(card.raw.subtype).toLowerCase() === subtype.toLowerCase();
}

function renderedTextMatches(
  card: CardContent,
  renderedTextIncludes: readonly string[] | string | undefined,
): boolean {
  if (renderedTextIncludes === undefined) {
    return true;
  }

  const requiredText: readonly string[] = Array.isArray(renderedTextIncludes)
    ? renderedTextIncludes
    : [renderedTextIncludes];
  const renderedText = cardRenderedText(card).toLowerCase();

  return requiredText.every((text) => renderedText.includes(text.toLowerCase()));
}

function abilityCount(card: CardContent): number {
  const renderedText = cardRenderedText(card);
  const markerMatches = [...renderedText.matchAll(/▸\s*([^:]+):/gu)];

  if (markerMatches.length === 0) {
    return renderedText.trim().length > 0 ? 1 : 0;
  }

  return markerMatches.reduce((total, match) => {
    const labels = match[1]
      ?.split(",")
      .map((label) => label.trim())
      .filter((label) => label.length > 0);

    return total + Math.max(1, labels?.length ?? 1);
  }, 0);
}

function numericCostMatches(card: CardContent, predicate: CardTargetPredicate): boolean {
  if (predicate.energyCost !== undefined && card.energyCost !== predicate.energyCost) {
    return false;
  }

  if (typeof card.energyCost !== "number") {
    return predicate.minEnergyCost === undefined && predicate.maxEnergyCost === undefined;
  }

  if (predicate.minEnergyCost !== undefined && card.energyCost < predicate.minEnergyCost) {
    return false;
  }

  if (predicate.maxEnergyCost !== undefined && card.energyCost > predicate.maxEnergyCost) {
    return false;
  }

  return true;
}

function cardCopiesInSource(
  card: CardContent,
  quest: QuestStateProjection,
  predicate: CardTargetPredicate,
): number {
  if (predicate.source === "deck" || predicate.starter === true) {
    return quest.deck.entries.find((entry) => entry.cardId === card.id)?.copies ?? 0;
  }

  if (predicate.source === "draftPool") {
    return quest.draftPool.find((entry) => entry.cardId === card.id)?.copies ?? 0;
  }

  return 1;
}

function copyCountMatches(
  card: CardContent,
  quest: QuestStateProjection,
  predicate: CardTargetPredicate,
): boolean {
  const copies = cardCopiesInSource(card, quest, predicate);

  if (predicate.minCopies !== undefined && copies < predicate.minCopies) {
    return false;
  }

  if (predicate.maxCopies !== undefined && copies > predicate.maxCopies) {
    return false;
  }

  return true;
}

function abilityCountMatches(card: CardContent, predicate: CardTargetPredicate): boolean {
  const count = abilityCount(card);

  if (predicate.minAbilityCount !== undefined && count < predicate.minAbilityCount) {
    return false;
  }

  if (predicate.hasMultipleAbilities === true && count < 2) {
    return false;
  }

  if (predicate.hasMultipleAbilities === false && count >= 2) {
    return false;
  }

  return true;
}

function candidateCards(
  content: ContentBundle,
  quest: QuestStateProjection,
  predicate: CardTargetPredicate,
): CardContent[] {
  if (predicate.source === "deck" || predicate.starter === true) {
    const cardsById = contentById(content.cards);
    return quest.deck.entries.flatMap((entry) => {
      const card = cardsById.get(entry.cardId);
      return card ? [card] : [];
    });
  }

  if (predicate.source === "draftPool") {
    const cardsById = contentById(content.cards);
    return quest.draftPool.flatMap((entry) => {
      const card = cardsById.get(entry.cardId);
      return card ? [card] : [];
    });
  }

  return [...content.cards];
}

export function resolveCardTargets(
  content: ContentBundle,
  quest: QuestStateProjection,
  predicate: CardTargetPredicate = {},
): CardContent[] {
  const tideOverlap =
    predicate.tideOverlap === undefined
      ? null
      : selectedTideSet(quest, predicate.tideOverlap);

  return candidateCards(content, quest, predicate)
    .filter((card) => idOrNameMatches(card, predicate.ids))
    .filter((card) => idOrNameMatches(card, predicate.names))
    .filter((card) => predicate.cardType === undefined || card.cardType === predicate.cardType)
    .filter((card) => subtypeMatches(card, predicate.subtype))
    .filter((card) => numericCostMatches(card, predicate))
    .filter((card) => predicate.rarity === undefined || card.rarity === predicate.rarity)
    .filter((card) => predicate.isFast === undefined || isFast(card) === predicate.isFast)
    .filter((card) => predicate.spark === undefined || card.spark === predicate.spark)
    .filter((card) => renderedTextMatches(card, predicate.renderedTextIncludes))
    .filter((card) => !predicate.starter || card.rarity === "Starter")
    .filter((card) => tideOverlap === null || hasTideOverlap(card.tides, tideOverlap))
    .filter((card) => copyCountMatches(card, quest, predicate))
    .filter((card) => abilityCountMatches(card, predicate))
    .sort((left, right) => {
      const cardNumberComparison = left.cardNumber - right.cardNumber;
      if (cardNumberComparison !== 0) {
        return cardNumberComparison;
      }
      return left.id.localeCompare(right.id, "en-US");
    });
}

function candidateDreamsigns(
  content: ContentBundle,
  quest: QuestStateProjection,
  predicate: DreamsignTargetPredicate,
): DreamsignContent[] {
  const dreamsignsById = contentById(content.dreamsigns);

  if (predicate.source === "active") {
    return quest.activeDreamsigns.flatMap((entry) => {
      const dreamsign = dreamsignsById.get(entry.dreamsignId);
      return dreamsign ? [dreamsign] : [];
    });
  }

  if (predicate.source === "pool") {
    return quest.dreamsignPoolIds.flatMap((dreamsignId) => {
      const dreamsign = dreamsignsById.get(dreamsignId);
      return dreamsign ? [dreamsign] : [];
    });
  }

  return [...content.dreamsigns];
}

export function resolveDreamsignTargets(
  content: ContentBundle,
  quest: QuestStateProjection,
  predicate: DreamsignTargetPredicate = {},
): DreamsignContent[] {
  const tideOverlap =
    predicate.tideOverlap === undefined
      ? null
      : selectedTideSet(quest, predicate.tideOverlap);

  return candidateDreamsigns(content, quest, predicate)
    .filter((dreamsign) => idOrNameMatches(dreamsign, predicate.ids))
    .filter((dreamsign) => idOrNameMatches(dreamsign, predicate.names))
    .filter((dreamsign) => predicate.kind === undefined || dreamsign.kind === predicate.kind)
    .filter(
      (dreamsign) =>
        predicate.orientation === undefined || dreamsign.orientation === predicate.orientation,
    )
    .filter((dreamsign) => tideOverlap === null || hasTideOverlap(dreamsign.tides, tideOverlap))
    .sort((left, right) => left.name.localeCompare(right.name, "en-US"));
}
