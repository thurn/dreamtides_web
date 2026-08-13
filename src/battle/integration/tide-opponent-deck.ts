import { generatePoolFromData } from "../../draft/pool/generate";
import { makeRng } from "../../draft/pool/rng";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import type { Tides4Tuning } from "../../types/draft-data";
import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamsignTemplate,
} from "../../types/content";
import type { OpponentsData } from "../../types/opponents-data";
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

interface RankedCard {
  card: CardData;
  rank: number[];
  affinity: number;
  rarity: number;
}

interface RankedDreamsign {
  dreamsign: DreamsignTemplate;
  rank: number[];
  affinity: number;
  rarity: number;
}

export interface TideOpponentDeckBuild {
  baseCards: CardData[];
  finalCards: CardData[];
  joinedTideIds: string[];
  dreamsign: DreamsignTemplate | null;
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
  context: ReadonlyMap<string, number>;
  bandFraction: number;
  bandMinimum: number;
  rng: () => number;
}): DreamsignTemplate | null {
  const ranked: RankedDreamsign[] = args.templates.map((dreamsign) => {
    const vector = new Map<string, number>();
    addTideIds(vector, dreamsign.tideIds ?? []);
    const affinity = cosineAffinity(vector, args.context);
    const rarity = rarityStrength(dreamsign.rarity);
    return { dreamsign, affinity, rarity, rank: [affinity, rarity] };
  });
  ranked.sort((left, right) =>
    compareRanks(left.rank, right.rank) || codeUnits(left.dreamsign.id, right.dreamsign.id),
  );
  return sampleSelectionBand(
    ranked,
    selectionBandSize(ranked.length, args.bandFraction, args.bandMinimum),
    args.rng,
  )?.dreamsign ?? null;
}

function iterativeDeck(args: {
  candidates: readonly CardData[];
  context: Map<string, number>;
  targetSize: number;
  bandFraction: number;
  bandMinimum: number;
  rng: () => number;
  index: ReturnType<typeof buildTideAffinityIndex>;
}): CardData[] {
  const remaining = new Map(args.candidates.map((card) => [card.id, card]));
  const selected: CardData[] = [];
  while (selected.length < args.targetSize && remaining.size > 0) {
    const ranked: RankedCard[] = [...remaining.values()].map((card) => {
      const affinity = cardAffinity(card.id, args.context, args.index);
      const rarity = rarityStrength(card.rarity);
      return { card, affinity, rarity, rank: [affinity, rarity] };
    });
    ranked.sort((left, right) =>
      compareRanks(left.rank, right.rank) || codeUnits(left.card.id, right.card.id),
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
  opponentDreamAvatar: DreamAvatarContent | null;
  affiliation: AffiliationContent | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamsignTemplates: readonly DreamsignTemplate[];
  completionLevel: number;
  poolSeed: number;
  battleEntryKey?: string;
  opponentsContentHash: string;
  progression: OpponentsData["progression"];
  deckSize: number;
  tides4Decks: Tides4DecksJson;
  tides4Tuning: Tides4Tuning;
  deferLog?: (emit: () => void) => void;
}): TideOpponentDeckBuild | null {
  if (args.opponentDreamAvatar === null) return null;
  const cardNameById = new Map(
    [...args.cardDatabase.values()].map((card) => [card.id, card.name]),
  );
  const generated = generatePoolFromData(
    { tides4Decks: args.tides4Decks, cardNameById },
    args.poolSeed,
    args.opponentDreamAvatar.id,
    args.tides4Tuning,
  );
  const index = buildTideAffinityIndex(args.tides4Decks);
  const cardById = new Map(
    [...args.cardDatabase.values()].map((card) => [card.id, card]),
  );
  const joinedTideIds = generated.tides4Provenance.tides
    .filter((tide) => tide.joined)
    .map((tide) => tide.id);
  const context = new Map<string, number>();
  addTideIds(context, joinedTideIds);
  addTideIds(context, args.affiliation?.tideIds ?? []);
  const rng = makeRng((args.poolSeed ^ 0x9e3779b9) >>> 0);
  const dreamsign = args.completionLevel >= args.progression.dreamsignsFromLayer
    ? chooseDreamsign({
        templates: args.dreamsignTemplates,
        context,
        bandFraction: args.tides4Decks.selection.bandFraction,
        bandMinimum: args.tides4Decks.selection.bandMinimum,
        rng,
      })
    : null;
  addTideIds(context, dreamsign?.tideIds ?? []);

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
  const baseCards = iterativeDeck({
    candidates,
    context,
    targetSize: args.deckSize,
    bandFraction: args.tides4Decks.selection.bandFraction,
    bandMinimum: args.tides4Decks.selection.bandMinimum,
    rng,
    index,
  });

  const starterCount = Math.min(
    args.progression.starterDilution[args.completionLevel] ?? 0,
    baseCards.length,
  );
  const cutRanked = baseCards
    .map((card) => ({ card, affinity: cardAffinity(card.id, context, index) }))
    .sort((left, right) => left.affinity - right.affinity || codeUnits(left.card.id, right.card.id));
  const cardsCut = cutRanked.slice(0, starterCount).map(({ card }) => card);
  const cutIds = new Set(cardsCut.map((card) => card.id));
  const startersAdded = [...args.cardDatabase.values()]
    .filter((card) => card.isStarter || card.rarity === "Starter")
    .sort((left, right) => codeUnits(left.id, right.id))
    .map((card) => ({ card, key: rng() }))
    .sort((left, right) => left.key - right.key || codeUnits(left.card.id, right.card.id))
    .slice(0, starterCount)
    .map(({ card }) => card);
  const finalCards = [
    ...baseCards.filter((card) => !cutIds.has(card.id)),
    ...startersAdded,
  ];
  const build: TideOpponentDeckBuild = {
    baseCards,
    finalCards,
    joinedTideIds,
    dreamsign,
    modifications: { startersAdded, cardsCut, legendariesSuppressed },
    abilityActive: args.completionLevel >= args.progression.abilityActiveFromLayer,
  };
  const emit = (): void => {
    logEvent("tide_opponent_deck_constructed", {
      battleEntryKey: args.battleEntryKey ?? null,
      algorithm: "unified-tide-affinity-v1",
      opponentsContentHash: args.opponentsContentHash,
      poolSeed: args.poolSeed,
      dreamAvatarId: args.opponentDreamAvatar?.id ?? null,
      affiliationId: args.affiliation?.id ?? null,
      affiliationTideIds: args.affiliation?.tideIds ?? [],
      joinedTideIds,
      dreamsignId: dreamsign?.id ?? null,
      targetDeckSize: args.deckSize,
      completionLevel: args.completionLevel,
      bandFraction: args.tides4Decks.selection.bandFraction,
      bandMinimum: args.tides4Decks.selection.bandMinimum,
      baseCardIds: baseCards.map((card) => card.id),
      finalCardIds: finalCards.map((card) => card.id),
      starterCardIds: startersAdded.map((card) => card.id),
      cutCardIds: cardsCut.map((card) => card.id),
      legendariesSuppressed,
    });
  };
  (args.deferLog ?? ((callback) => callback()))(emit);
  return build;
}
