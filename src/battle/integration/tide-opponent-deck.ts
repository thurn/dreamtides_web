import { generatePoolFromData } from "../../draft/pool/generate";
import { makeRng } from "../../draft/pool/rng";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import type { Tides4Tuning } from "../../types/draft-data";
import type { CardData, Rarity } from "../../types/cards";
import type {
  AffiliationContent,
  ApollyonIncarnationContent,
  AvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { OpponentsData } from "../../types/opponents-data";
import type { ContentHash } from "../../types/content-hash";
import { logEvent } from "../../logging";
import {
  addCardVector,
  addTideIds,
  buildTideAffinityIndex,
  cardAffinity,
  compareRanks,
  cosineAffinity,
  rarityStrength,
  sampleSelectionBand,
  selectionBandSize,
} from "../../selection/tide-affinity";
import type { BattleEntryKey, TideId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type {
  TideAffinityIndex,
  TideVector,
} from "../../selection/tide-affinity";

interface RankedDreamsign {
  dreamsign: DreamsignTemplate;
  rank: number[];
  affinity: number;
  rarity: number;
}

export interface TideOpponentDeckBuild {
  /** The full fixed generated multiset, before choosing or modifying a deck. */
  readonly draftPool: readonly CardId[];
  baseCards: CardData[];
  finalCards: CardData[];
  joinedTideIds: TideId[];
  dreamsign: DreamsignTemplate | null;
  /** Authored boss Dreamsigns, independent of ordinary progression selection. */
  curatedDreamsigns?: readonly DreamsignTemplate[];
  modifications: {
    startersAdded: CardData[];
    cardsCut: CardData[];
    legendariesSuppressed: number;
  };
  abilityActive: boolean;
}

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function chooseDreamsign(args: {
  templates: readonly DreamsignTemplate[];
  context: TideVector;
  bandFraction: number;
  bandMinimum: number;
  rng: () => number;
}): DreamsignTemplate | null {
  const ranked: RankedDreamsign[] = args.templates.map((dreamsign) => {
    const vector = new Map<TideId, number>();
    addTideIds(vector, dreamsign.tideIds ?? []);
    const affinity = cosineAffinity(vector, args.context);
    const rarity = rarityStrength(dreamsign.rarity);
    return { dreamsign, affinity, rarity, rank: [affinity, rarity] };
  });
  ranked.sort(
    (left, right) =>
      compareRanks(left.rank, right.rank) ||
      codeUnits(left.dreamsign.id, right.dreamsign.id),
  );
  return (
    sampleSelectionBand(
      ranked,
      selectionBandSize(ranked.length, args.bandFraction, args.bandMinimum),
      args.rng,
    )?.dreamsign ?? null
  );
}

/** A card the iterative affinity picker can rank: its UUID and rarity. */
export interface AffinityPickCandidate {
  readonly id: CardId;
  readonly rarity?: Rarity;
}

interface RankedCandidate<Card extends AffinityPickCandidate> {
  card: Card;
  rank: number[];
}

/**
 * The unified tide affinity picker: rank the remaining candidates by
 * [cosine affinity to `context`, rarity] (ties by card UUID), draw uniformly
 * from the top band, add the pick's tide vector to `context`, and repeat until
 * `targetSize` cards are chosen or the candidates run out. `context` is
 * mutated to include every pick (and every `initial` card).
 */
export function iterativeAffinityPicks<Card extends AffinityPickCandidate>(args: {
  candidates: readonly Card[];
  context: Map<TideId, number>;
  targetSize: number;
  bandFraction: number;
  bandMinimum: number;
  rng: () => number;
  index: TideAffinityIndex;
  initial?: readonly Card[];
}): Card[] {
  const remaining = new Map(args.candidates.map((card) => [card.id, card]));
  const selected = [...(args.initial ?? [])];
  for (const card of selected) {
    remaining.delete(card.id);
    addCardVector(args.context, card.id, args.index);
  }
  while (selected.length < args.targetSize && remaining.size > 0) {
    const ranked: RankedCandidate<Card>[] = [...remaining.values()].map((card) => {
      const affinity = cardAffinity(card.id, args.context, args.index);
      const rarity = rarityStrength(card.rarity);
      return { card, rank: [affinity, rarity] };
    });
    ranked.sort(
      (left, right) =>
        compareRanks(left.rank, right.rank) ||
        codeUnits(left.card.id, right.card.id),
    );
    const picked = sampleSelectionBand(
      ranked,
      selectionBandSize(ranked.length, args.bandFraction, args.bandMinimum),
      args.rng,
    )?.card;
    if (picked === undefined) break;
    selected.push(picked);
    remaining.delete(picked.id);
    addCardVector(args.context, picked.id, args.index);
  }
  return selected;
}

export function buildTideOpponentDeck(args: {
  opponentAvatar: AvatarContent | null;
  affiliation: AffiliationContent | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamsignTemplates: readonly DreamsignTemplate[];
  completionLevel: number;
  poolSeed: number;
  battleEntryKey?: BattleEntryKey;
  opponentsContentHash: ContentHash;
  progression: OpponentsData["progression"];
  deckSize: number;
  tides4Decks: Tides4DecksJson;
  tides4Tuning: Tides4Tuning;
  curated?: Pick<ApollyonIncarnationContent, "deckRecipe" | "dreamsignIds">;
  deferLog?: (emit: () => void) => void;
}): TideOpponentDeckBuild | null {
  if (args.opponentAvatar === null) {
    if (args.curated !== undefined) throw new Error("Missing Apollyon pool Avatar");
    return null;
  }
  const cardById = new Map([...args.cardDatabase.values()].map((card) => [card.id, card]));
  const recipe = args.curated?.deckRecipe;
  const signatures = (recipe?.signatureCardIds ?? []).map((id) => {
    const card = cardById.get(id);
    if (card === undefined) throw new Error(`Unknown Apollyon signature ${id}`);
    return card;
  });
  if (recipe !== undefined) {
    if (recipe.poolAvatarId !== args.opponentAvatar.id || args.tides4Decks.tidePoolByAvatar[recipe.poolAvatarId] === undefined) {
      throw new Error(`Unknown Apollyon pool ${recipe.poolAvatarId}`);
    }
    if (signatures.length > 10 || signatures.length > args.deckSize || new Set(recipe.signatureCardIds).size !== signatures.length) {
      throw new Error("Invalid Apollyon signature recipe");
    }
    for (const id of recipe.archetypeTideIds) {
      if (!args.tides4Decks.tides.some((tide) => tide.id === id)) throw new Error(`Unknown Apollyon tide ${id}`);
    }
  }
  const curatedDreamsigns = args.curated?.dreamsignIds.map((id) => {
    const sign = args.dreamsignTemplates.find((candidate) => candidate.id === id);
    if (sign === undefined) throw new Error(`Unknown Apollyon Dreamsign ${id}`);
    return sign;
  });
  if (curatedDreamsigns !== undefined && (curatedDreamsigns.length < 1 || curatedDreamsigns.length > 2 || new Set(args.curated?.dreamsignIds).size !== curatedDreamsigns.length)) {
    throw new Error("Invalid Apollyon Dreamsign recipe");
  }
  const cardNameById = new Map(
    [...args.cardDatabase.values()].map((card) => [card.id, card.name]),
  );
  const generated = generatePoolFromData(
    { tides4Decks: args.tides4Decks, cardNameById },
    args.poolSeed,
    args.opponentAvatar.id,
    args.tides4Tuning,
  );
  const index = buildTideAffinityIndex(args.tides4Decks);
  const joinedTideIds = generated.tides4Provenance.tides
    .filter((tide) => tide.joined)
    .map((tide) => tide.id);
  const context = new Map<TideId, number>();
  addTideIds(context, joinedTideIds);
  addTideIds(context, args.affiliation?.tideIds ?? []);
  addTideIds(context, recipe?.archetypeTideIds ?? []);
  const rng = makeRng((args.poolSeed ^ 0x9e3779b9) >>> 0);
  const dreamsign =
    curatedDreamsigns !== undefined ? null : args.completionLevel >= args.progression.dreamsignsFromLayer
      ? chooseDreamsign({
          templates: args.dreamsignTemplates,
          context,
          bandFraction: args.tides4Decks.selection.bandFraction,
          bandMinimum: args.tides4Decks.selection.bandMinimum,
          rng,
        })
      : null;
  addTideIds(context, dreamsign?.tideIds ?? []);
  for (const sign of curatedDreamsigns ?? []) addTideIds(context, sign.tideIds ?? []);

  let legendariesSuppressed = 0;
  const candidates = [...generated.counts.keys()].flatMap((cardId) => {
    const card = cardById.get(cardId);
    if (card === undefined || card.isStarter) return [];
    if (
      args.completionLevel < args.progression.legendariesFromLayer &&
      card.rarity === "Legendary"
    ) {
      legendariesSuppressed += 1;
      return [];
    }
    return [card];
  });
  const baseCards = iterativeAffinityPicks({
    candidates,
    context,
    targetSize: args.deckSize,
    bandFraction: args.tides4Decks.selection.bandFraction,
    bandMinimum: args.tides4Decks.selection.bandMinimum,
    rng,
    index,
    initial: signatures,
  });

  const starterCount = Math.min(
    args.progression.starterDilution[args.completionLevel] ?? 0,
    baseCards.length - signatures.length,
  );
  const signatureIds = new Set(recipe?.signatureCardIds ?? []);
  const cutRanked = baseCards.filter((card) => !signatureIds.has(card.id))
    .map((card) => ({ card, affinity: cardAffinity(card.id, context, index) }))
    .sort(
      (left, right) =>
        left.affinity - right.affinity ||
        codeUnits(left.card.id, right.card.id),
    );
  const cardsCut = cutRanked.slice(0, starterCount).map(({ card }) => card);
  const cutIds = new Set(cardsCut.map((card) => card.id));
  const startersAdded = [...args.cardDatabase.values()]
    .filter((card) => card.isStarter || card.rarity === "Starter")
    .sort((left, right) => codeUnits(left.id, right.id))
    .map((card) => ({ card, key: rng() }))
    .sort(
      (left, right) =>
        left.key - right.key || codeUnits(left.card.id, right.card.id),
    )
    .slice(0, starterCount)
    .map(({ card }) => card);
  const finalCards = [
    ...baseCards.filter((card) => !cutIds.has(card.id)),
    ...startersAdded,
  ];
  const build: TideOpponentDeckBuild = {
    draftPool: [...generated.counts].flatMap(([cardId, copies]) => Array.from({ length: copies }, () => cardId)).sort(),
    baseCards,
    finalCards,
    joinedTideIds,
    dreamsign,
    ...(curatedDreamsigns === undefined ? {} : { curatedDreamsigns }),
    modifications: { startersAdded, cardsCut, legendariesSuppressed },
    abilityActive:
      args.completionLevel >= args.progression.abilityActiveFromLayer,
  };
  const emit = (): void => {
    logEvent("tide_opponent_deck_constructed", {
      battleEntryKey: args.battleEntryKey ?? null,
      algorithm: "unified-tide-affinity-v1",
      opponentsContentHash: args.opponentsContentHash,
      poolSeed: args.poolSeed,
      avatarId: args.opponentAvatar?.id ?? null,
      affiliationId: args.affiliation?.id ?? null,
      affiliationTideIds: args.affiliation?.tideIds ?? [],
      joinedTideIds,
      ...(recipe === undefined ? {} : { archetypeTideIds: recipe.archetypeTideIds, signatureCardIds: recipe.signatureCardIds, dreamsignIds: args.curated?.dreamsignIds }),
      dreamsignId: dreamsign?.id ?? null,
      targetDeckSize: args.deckSize,
      completionLevel: args.completionLevel,
      bandFraction: args.tides4Decks.selection.bandFraction,
      bandMinimum: args.tides4Decks.selection.bandMinimum,
      baseCardIds: baseCards.map((card) => card.id),
      draftPoolCardIds: [...build.draftPool],
      finalCardIds: finalCards.map((card) => card.id),
      starterCardIds: startersAdded.map((card) => card.id),
      cutCardIds: cardsCut.map((card) => card.id),
      legendariesSuppressed,
    });
  };
  (args.deferLog ?? ((callback) => callback()))(emit);
  return build;
}
