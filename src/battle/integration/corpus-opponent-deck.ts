// Corpus opponent-deck algorithm, Stage A: deck SELECTION.
//
// Picks a single known-good decklist from the corpus to base an opponent deck
// on. Selection blends two signals: how well a deck matches the opponent
// Dreamcaller's SIGNATURE cards (the primary axis) and how well it matches the
// dreamscape AFFILIATION's signature cards (a smaller secondary nudge,
// weighted by `AFFILIATION_WEIGHT`). A seeded sample over the top-ranked
// window keeps the same `poolSeed` deterministic while giving variety across
// seeds.
//
// Identity is ALWAYS the lowercased cards_v2 UUID — never the display name.
// Twenty-four cards share a display name, so every Map/Set is keyed on the
// lowercased UUID and names are treated as display-only. Card numbers are
// display-only too; this module resolves CardData records out of the card
// database keyed by card number, but candidacy, fit, and selection are all
// computed on UUIDs.
//
// Stage B (a later task) fills layer tuning: legendary removal/replacement,
// card cuts, starter additions, dreamsign selection, and ability activation.
// This Stage A build leaves those slots in their selection-only state
// (`finalCards = baseCards`, empty modifications, `dreamsign = null`,
// `abilityActive = true`). The Stage B arguments are part of the signature so
// Stage B does not have to change it; Stage A ignores them.

import {
  buildIdfStats,
  computeAffinity,
  meanAffinity,
  signatureFit,
} from "../../draft/idf-fit.ts";
import { createBattleRng } from "../random.ts";

import type { KnownGoodDecklist, DreamsignSignature } from "../../data/quest-content.ts";
import type { CardData } from "../../types/cards.ts";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamsignTemplate,
} from "../../types/content.ts";

/**
 * Weight applied to a deck's affiliation fit when blending it with its
 * (primary) signature fit. Kept small so the signature axis dominates: a deck
 * with a much higher signature fit cannot be overtaken by affiliation alone.
 * Tunable — do NOT pin this value in tests.
 */
const AFFILIATION_WEIGHT = 0.25;

/**
 * Size of the top-ranked window the seeded sampler picks from. The selection
 * always comes from the highest-`combined` candidates, but sampling across the
 * window gives the same Dreamcaller different opponent decks across seeds.
 * Tunable — do NOT pin this value in tests.
 */
const TOP_K = 8;

export interface CorpusOpponentDeckBuild {
  source: { id: string; name: string; sourceFile?: string };
  signatureFit: number;
  affiliationFit: number;
  combined: number;
  candidateCount: number;
  topK: { id: string; name: string; combined: number }[];
  baseCards: CardData[];
  finalCards: CardData[];
  modifications: {
    legendariesRemoved: CardData[];
    legendaryReplacements: CardData[];
    cardsCut: CardData[];
    startersAdded: CardData[];
  };
  dreamsign: { id: string; name: string; fit: number } | null;
  abilityActive: boolean;
}

/** Lowercase an opaque identifier for UUID-keyed comparison. */
function lc(value: string): string {
  return value.toLowerCase();
}

/** Finite-or-zero guard so empty probes never leak NaN/Infinity downstream. */
function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** One candidate deck with its index into the corpus and its scores. */
interface ScoredDeck {
  index: number;
  id: string;
  name: string;
  signatureFit: number;
  affiliationFit: number;
  combined: number;
}

/**
 * Select a known-good decklist (Stage A) for a corpus opponent deck.
 *
 * Returns `null` only when `knownGoodDecklists` is empty. When the opponent
 * has signature cards but none of them appear in any deck, selection falls
 * back to the full corpus rather than returning `null`, so a non-empty corpus
 * always yields a build.
 */
export function buildCorpusOpponentDeck(args: {
  opponentDreamcaller: DreamcallerContent | null;
  knownGoodDecklists: readonly KnownGoodDecklist[];
  affiliation: AffiliationContent | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamsignSignatures: ReadonlyMap<string, DreamsignSignature> | undefined;
  dreamsignTemplates: readonly DreamsignTemplate[];
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
}): CorpusOpponentDeckBuild | null {
  const {
    opponentDreamcaller,
    knownGoodDecklists,
    affiliation,
    cardDatabase,
    poolSeed,
  } = args;
  // Stage A ignores: dreamsignSignatures, dreamsignTemplates, completionLevel,
  // layerCount. They drive Stage B.

  if (knownGoodDecklists.length === 0) return null;

  // UUID -> CardData lookup, lowercased at the boundary. Twenty-four cards
  // share a name, so this is the only safe key.
  const byUuid = new Map<string, CardData>();
  for (const card of cardDatabase.values()) {
    byUuid.set(lc(card.id), card);
  }

  // Deck UUID sets, index-aligned with `knownGoodDecklists`. The corpus
  // preserves this index order, so `corpus.decks[i]` zips with
  // `knownGoodDecklists[i]` and `deckSets[i]`.
  const deckSets: Set<string>[] = knownGoodDecklists.map(
    (deck) => new Set(deck.mainboardIds.map(lc)),
  );
  const corpus = buildIdfStats(deckSets);

  // Signature probe: the opponent Dreamcaller's signature card UUIDs. Empty
  // for a null Dreamcaller or one with no signature cards.
  const sigSet = new Set(
    (opponentDreamcaller?.signatureCardIds ?? []).map(lc),
  );

  // Affiliation affinity over the corpus. Absent affiliation -> 0 everywhere.
  const affinity =
    affiliation === null
      ? null
      : computeAffinity(corpus, new Set(affiliation.signatureCards.map(lc)));

  const scored: ScoredDeck[] = knownGoodDecklists.map((deck, i) => {
    const sig =
      sigSet.size === 0
        ? 0
        : finiteOrZero(signatureFit(sigSet, corpus.decks[i], corpus));
    const aff =
      affinity === null ? 0 : finiteOrZero(meanAffinity(deckSets[i], affinity));
    return {
      index: i,
      id: deck.id,
      name: deck.name,
      signatureFit: sig,
      affiliationFit: aff,
      combined: sig + AFFILIATION_WEIGHT * aff,
    };
  });

  // Candidate gating. With signature cards, only decks overlapping ≥1
  // signature UUID are candidates; if NONE overlap, fall back to the full
  // corpus so a non-empty corpus never fails for lack of candidates. Without
  // signature cards, every deck is a candidate (ranking is then driven by
  // affiliationFit, or seeded-random when affiliation is also absent and all
  // combined are 0).
  let candidates: ScoredDeck[];
  if (sigSet.size === 0) {
    candidates = scored;
  } else {
    const gated = scored.filter((s) =>
      hasOverlap(deckSets[s.index], sigSet),
    );
    candidates = gated.length > 0 ? gated : scored;
  }

  // Rank by combined DESC; deterministic tie-break by higher `id` string so
  // ties resolve identically across runs (matching the codebase's
  // string-localeCompare deterministic tie-break convention).
  const ranked = [...candidates].sort((a, b) => {
    if (b.combined !== a.combined) return b.combined - a.combined;
    return b.id.localeCompare(a.id);
  });

  const window = ranked.slice(0, Math.min(TOP_K, ranked.length));
  const topK = window.map((s) => ({
    id: s.id,
    name: s.name,
    combined: s.combined,
  }));

  // Seeded sample ONE deck from the window. The same `poolSeed` always picks
  // the same deck; different seeds give variety across the window.
  const rng = createBattleRng(poolSeed, "enemyDescriptor");
  const picked = window[rng.nextInt(window.length)];

  const pickedDecklist = knownGoodDecklists[picked.index];

  // Resolve the selected deck's DISTINCT cards via UUID, deduping by UUID and
  // defensively dropping UUIDs absent from the database.
  const seen = new Set<string>();
  const baseCards: CardData[] = [];
  for (const rawId of pickedDecklist.mainboardIds) {
    const uuid = lc(rawId);
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    const card = byUuid.get(uuid);
    if (card !== undefined) baseCards.push(card);
  }

  return {
    source: { id: picked.id, name: picked.name, sourceFile: picked.id },
    signatureFit: picked.signatureFit,
    affiliationFit: picked.affiliationFit,
    combined: picked.combined,
    candidateCount: candidates.length,
    topK,
    baseCards,
    finalCards: baseCards,
    modifications: {
      legendariesRemoved: [],
      legendaryReplacements: [],
      cardsCut: [],
      startersAdded: [],
    },
    dreamsign: null,
    abilityActive: true,
  };
}

/** Whether `deck` shares at least one UUID with `probe`. */
function hasOverlap(
  deck: ReadonlySet<string>,
  probe: ReadonlySet<string>,
): boolean {
  // Iterate the smaller set for cheaper membership checks.
  const [small, large] = deck.size <= probe.size ? [deck, probe] : [probe, deck];
  for (const key of small) {
    if (large.has(key)) return true;
  }
  return false;
}
