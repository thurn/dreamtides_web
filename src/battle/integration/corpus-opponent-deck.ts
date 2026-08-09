// Corpus opponent-deck algorithm: deck SELECTION (Stage A) + layer TUNING
// (Stage B).
//
// Stage A picks a single known-good decklist from the corpus to base an
// opponent deck on. Selection blends two signals: how well a deck matches the
// opponent DreamAvatar's SIGNATURE cards (the primary axis) and how well it
// matches the dreamscape AFFILIATION's signature cards (a smaller secondary
// nudge, weighted by `AFFILIATION_WEIGHT`). A seeded sample over the top-ranked
// window keeps the same `poolSeed` deterministic while giving variety across
// seeds.
//
// Stage B then tunes the selected base deck to the opponent's completion level
// (`layer`), running a fixed deterministic pipeline IN ORDER: legendary
// suppression/replacement, starter dilution (cut least-synergistic non-starter
// cards, add Starters), dreamsign assignment, and ability activation. The
// per-layer schedule is `STAGE_B_LAYER_SPEC`, derived from the module
// constants below.
//
// Identity is ALWAYS the lowercased cards_v2 UUID — never the display name.
// Twenty-four cards share a display name, so every Map/Set is keyed on the
// lowercased UUID and names are treated as display-only. Card numbers are
// display-only too; this module resolves CardData records out of the card
// database keyed by card number, but candidacy, fit, selection, cuts, and
// replacements are all computed on UUIDs.

import {
  buildCooccurrence,
  synergyAscending,
} from "../../draft/deck-cooccurrence.ts";
import {
  buildIdfStats,
  computeAffinity,
  meanAffinity,
  signatureFit,
} from "../../draft/idf-fit.ts";
import type { IdfCorpus, IdfDeck } from "../../draft/idf-fit.ts";
import { logEvent } from "../../logging.ts";
import { createBattleRng } from "../random.ts";
import { opponentAbilityIsActive } from "./opponent-deck.ts";
import type { OpponentsData } from "../../types/opponents-data.ts";

import type {
  KnownGoodDecklist,
  DreamsignSignature,
} from "../../data/journey-content.ts";
import type { CardData } from "../../types/cards.ts";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamsignTemplate,
} from "../../types/content.ts";

/**
 * Weight applied to a deck's affiliation fit when blending it with its
 * (primary) signature fit. Kept small so the signature axis dominates: a deck
 * with a much higher signature fit cannot be overtaken by affiliation alone.
 * Tunable — do NOT pin this value in tests.
 */

/**
 * Size of the top-ranked window the seeded sampler picks from. The selection
 * always comes from the highest-`combined` candidates, but sampling across the
 * window gives the same DreamAvatar different opponent decks across seeds.
 * Tunable — do NOT pin this value in tests.
 */

// ---------------------------------------------------------------------------
// Stage B layer-schedule constants (all tunable; do NOT pin in tests).
//
// `layer` is the opponent's `completionLevel` (0-indexed). The schedule
// descriptor `STAGE_B_LAYER_SPEC` is DERIVED from these constants so tests can
// drive off the schedule shape without hardcoding individual values.
// ---------------------------------------------------------------------------

/** From this layer on, Legendary cards in the base deck are retained. */
/**
 * Number of Starters folded into the deck (replacing the least-synergistic
 * non-starter cards) at each early layer, indexed by `layer`. Layers past the
 * array length add zero Starters.
 */

/**
 * One layer's tuning schedule. Derived from the constants above and exposed so
 * tests assert the SCHEDULE (ordering, monotonicity, size preservation)
 * without pinning specific constant values.
 */
export interface StageBLayerSpec {
  layer: number;
  abilityActive: boolean;
  legendaryAllowed: boolean;
  startersAdded: number;
  dreamsignAssigned: boolean;
}

/**
 * The Stage B per-layer schedule through the highest authored unlock or
 * dilution entry. Index by `completionLevel`; later dilution entries resolve to
 * zero in the builder.
 */
export function buildStageBLayerSpec(
  progression: OpponentsData["progression"],
): readonly StageBLayerSpec[] {
  const highest = Math.max(
    progression.abilityActiveFromLayer,
    progression.legendariesFromLayer,
    progression.dreamsignsFromLayer,
    progression.starterDilution.length - 1,
  );
  const spec: StageBLayerSpec[] = [];
  for (let layer = 0; layer <= highest; layer += 1) {
    spec.push({
      layer,
      abilityActive: opponentAbilityIsActive(
        layer,
        progression.abilityActiveFromLayer,
      ),
      legendaryAllowed: layer >= progression.legendariesFromLayer,
      startersAdded: progression.starterDilution[layer] ?? 0,
      dreamsignAssigned: layer >= progression.dreamsignsFromLayer,
    });
  }
  return spec;
}

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

/** Locale-free string comparison using JavaScript code-unit order. */
export function compareCodeUnits(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Finite-or-zero guard so empty probes never leak NaN/Infinity downstream. */
function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** Round a score for compact, stable log output (mirrors opponent-deck.ts). */
function round4(value: number): number {
  return Number(value.toFixed(4));
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
  opponentDreamAvatar: DreamAvatarContent | null;
  knownGoodDecklists: readonly KnownGoodDecklist[];
  affiliation: AffiliationContent | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamsignSignatures: ReadonlyMap<string, DreamsignSignature> | undefined;
  dreamsignTemplates: readonly DreamsignTemplate[];
  completionLevel: number;
  layerCount: number;
  poolSeed: number;
  opponentsContentHash: string;
  progression: OpponentsData["progression"];
  selectionConfig: OpponentsData["corpusSelection"];
  /**
   * The battle entry key the deck is built for, recorded in
   * `corpus_opponent_deck_constructed` so a production battle's opponent deck
   * greps out of `logs/journey-log.jsonl` by entry key (matching the coherent
   * algorithm's `opponent_deck_constructed`). Omitted by callers without an
   * entry key (e.g. unit tests).
   */
  battleEntryKey?: string;
  /**
   * Logging hand-off. The builder constructs the
   * `corpus_opponent_deck_constructed` record into an `emit` thunk and passes it
   * here. The default emits immediately (the debug tool and tests log inline);
   * the battle-fold provider passes a callback that captures the thunk and
   * fires it only once the deterministic init is committed to the log, so the
   * log records exactly one opponent deck per battle.
   */
  deferLog?: (emit: () => void) => void;
}): CorpusOpponentDeckBuild | null {
  const {
    opponentDreamAvatar,
    knownGoodDecklists,
    affiliation,
    cardDatabase,
    dreamsignSignatures,
    dreamsignTemplates,
    completionLevel,
    layerCount,
    poolSeed,
    battleEntryKey,
    deferLog = (emit) => {
      emit();
    },
  } = args;
  const { opponentsContentHash, progression, selectionConfig } = args;

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

  // Signature probe: the opponent DreamAvatar's signature card UUIDs. Empty
  // for a null DreamAvatar or one with no signature cards.
  const sigSet = new Set((opponentDreamAvatar?.signatureCardIds ?? []).map(lc));

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
      combined: sig + selectionConfig.affiliationWeight * aff,
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
    const gated = scored.filter((s) => hasOverlap(deckSets[s.index], sigSet));
    candidates = gated.length > 0 ? gated : scored;
  }

  // Rank by combined DESC; deterministic tie-break by higher `id` string so
  // ties resolve identically across runs for reproducibility.
  const ranked = [...candidates].sort((a, b) => {
    if (b.combined !== a.combined) return b.combined - a.combined;
    return compareCodeUnits(b.id, a.id);
  });

  const window = ranked.slice(
    0,
    Math.min(selectionConfig.topRankedSamplingWindow, ranked.length),
  );
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

  // -------------------------------------------------------------------------
  // Stage B: layer tuning. Run a fixed deterministic pipeline on the base deck
  // IN ORDER: legendary suppression/replacement, starter dilution, dreamsign
  // assignment, ability activation. All identity is by lowercased UUID.
  // -------------------------------------------------------------------------
  const layer = completionLevel;
  // Dedicated RNG stream for Stage B tie-breaks, independent of Stage A
  // sampling, so Stage A variety and Stage B determinism are stable separately.
  const stageBRng = createBattleRng(poolSeed, "enemyDeckOrder");

  // Corpus co-occurrence over the known-good decks (UUID-keyed, directional).
  const cooc = buildCooccurrence(deckSets);

  // Starter lookup, derived from the RON-authored gameplay role.
  const startersByNumber = new Map<number, CardData>();
  for (const card of cardDatabase.values()) {
    if (card.isStarter) {
      startersByNumber.set(card.cardNumber, card);
    }
  }
  const starterUuids = new Set<string>();
  for (const card of startersByNumber.values()) starterUuids.add(lc(card.id));
  const isStarterCard = (card: CardData): boolean =>
    starterUuids.has(lc(card.id));
  const isLegendaryCard = (card: CardData): boolean =>
    card.rarity === "Legendary";

  // Working deck: an ordered list of CardData keyed by UUID.
  let deck: CardData[] = [...baseCards];
  const uuidOf = (card: CardData): string => lc(card.id);
  const deckUuidSet = (): Set<string> => new Set(deck.map(uuidOf));

  const legendariesRemoved: CardData[] = [];
  const legendaryReplacements: CardData[] = [];
  const cardsCut: CardData[] = [];
  const startersAdded: CardData[] = [];

  // Step 1 — Legendary suppression. Below the allowed layer, remove every
  // Legendary card and REPLACE each to preserve size. The replacement is the
  // highest mean-co-occurrence non-legendary card to the CURRENT deck, drawn
  // from the union of the TOP-K window decks' card UUIDs that are not already
  // in the deck, not legendary, and not already used as a replacement.
  const legendaryAllowed = layer >= progression.legendariesFromLayer;
  if (!legendaryAllowed) {
    // Candidate pool: union of the TOP-K window decks' card UUIDs.
    const windowPool = new Set<string>();
    for (const member of window) {
      for (const rawId of knownGoodDecklists[member.index].mainboardIds) {
        windowPool.add(lc(rawId));
      }
    }

    const usedReplacements = new Set<string>();
    const legendaries = deck.filter(isLegendaryCard);
    for (const legendary of legendaries) {
      // Remove the legendary from the working deck.
      deck = deck.filter((c) => uuidOf(c) !== uuidOf(legendary));
      legendariesRemoved.push(legendary);

      // Find the best non-legendary replacement by mean co-occurrence to the
      // CURRENT deck.
      const currentUuids = deck.map(uuidOf);
      const candidatesForReplace: { uuid: string; mean: number }[] = [];
      const inDeck = deckUuidSet();
      for (const cand of windowPool) {
        if (inDeck.has(cand)) continue;
        if (usedReplacements.has(cand)) continue;
        const card = byUuid.get(cand);
        if (card === undefined) continue;
        if (isLegendaryCard(card)) continue;
        candidatesForReplace.push({
          uuid: cand,
          mean: meanCooc(cand, currentUuids, cooc),
        });
      }
      if (candidatesForReplace.length === 0) continue; // guard: drop, no replace

      // Highest mean co-occurrence wins; seeded tie-break for determinism.
      const best = pickBest(
        candidatesForReplace,
        (c) => c.mean,
        (c) => c.uuid,
        stageBRng,
      );
      const replacement = byUuid.get(best.uuid);
      if (replacement !== undefined) {
        deck.push(replacement);
        legendaryReplacements.push(replacement);
        usedReplacements.add(best.uuid);
      }
    }
  }

  // Build an IdfDeck view of the (post-legendary) deck for fit scoring.
  const tunedIdfDeck = (): IdfDeck => makeIdfDeck(deckUuidSet(), corpus);

  // Step 2 — Starter dilution. Cut exactly `count` least-synergistic
  // NON-starter cards and add exactly `count` Starters, preserving deck size.
  // `count` is the minimum of (a) the desired dilution for this layer, (b) the
  // number of non-starter cards available to cut, and (c) the number of Starters
  // not already present in the deck. This three-way cap ensures
  // `startersAdded.length === cardsCut.length` in all edge cases (fewer
  // non-starters than desired N, deck already containing some Starters, etc.).
  //
  // At layer 0 the desired count is "all Starters"; at other layers it is the
  // layer's scheduled dilution count.  Starters are chosen by highest
  // signatureFit (seeded tie-break), not-already-in-deck.
  const starterCount = progression.starterDilution[layer] ?? 0;
  if (starterCount > 0) {
    // Determine which Starters are addable (not already in deck) BEFORE cuts,
    // because the pre-cut deck is the authoritative state for duplicate checks.
    const inDeckBefore = deckUuidSet();
    const idfDeckForFit = tunedIdfDeck();
    const addableStarters = [...startersByNumber.values()].filter(
      (s) => !inDeckBefore.has(uuidOf(s)),
    );

    // Choose which addable Starters to add: layer 0 → all, otherwise top-N by
    // signatureFit with seeded tie-break. We select up to `starterCount` here;
    // the final `count` cap below may trim further.
    let candidateStarters: CardData[];
    if (layer === 0) {
      candidateStarters = addableStarters;
    } else {
      const scoredStarters = addableStarters.map((s) => ({
        card: s,
        fit: finiteOrZero(
          signatureFit(new Set([uuidOf(s)]), idfDeckForFit, corpus),
        ),
      }));
      candidateStarters = pickTopN(
        scoredStarters,
        starterCount,
        (s) => s.fit,
        (s) => uuidOf(s.card),
        stageBRng,
      ).map((s) => s.card);
    }

    // Enumerate non-starter cards available to cut (ascending synergy order).
    const ascending = synergyAscending(deck.map(uuidOf), cooc);
    const cuttableUuids: string[] = [];
    for (const uuid of ascending) {
      const card = byUuid.get(uuid);
      if (card === undefined) continue;
      if (isStarterCard(card)) continue; // never cut a starter
      cuttableUuids.push(uuid);
    }

    // Three-way cap: can't cut more than we have; can't add more than are
    // addable; can't exceed the layer's desired dilution count.
    const count = Math.min(
      starterCount,
      cuttableUuids.length,
      candidateStarters.length,
    );

    const cutUuids = cuttableUuids.slice(0, count);
    const cutSet = new Set(cutUuids);
    for (const uuid of cutUuids) {
      const card = byUuid.get(uuid);
      if (card !== undefined) cardsCut.push(card);
    }
    deck = deck.filter((c) => !cutSet.has(uuidOf(c)));

    const chosenStarters = candidateStarters.slice(0, count);
    for (const s of chosenStarters) {
      deck.push(s);
      startersAdded.push(s);
    }
  }

  // Step 3 — Dreamsign assignment. From DREAMSIGN_FROM_LAYER on, assign exactly
  // one dreamsign: the highest-fit tailored dreamsign whose signatures overlap
  // the tuned deck (fit > 0), else a seeded neutral dreamsign.
  let dreamsign: { id: string; name: string; fit: number } | null = null;
  if (layer >= progression.dreamsignsFromLayer) {
    const templateName = new Map<string, string>();
    for (const tpl of dreamsignTemplates)
      templateName.set(lc(tpl.id), tpl.name);
    const nameFor = (id: string): string => templateName.get(lc(id)) ?? id;

    const idfDeckForFit = tunedIdfDeck();

    // Best-fitting tailored dreamsign (fit > 0).
    let bestTailored: { id: string; fit: number } | null = null;
    if (dreamsignSignatures !== undefined) {
      const tailoredScored: { id: string; fit: number }[] = [];
      for (const sig of dreamsignSignatures.values()) {
        if (sig.category !== "tailored") continue;
        const probe = new Set(sig.signatureCardIds.map(lc));
        if (probe.size === 0) continue;
        const fit = finiteOrZero(signatureFit(probe, idfDeckForFit, corpus));
        if (fit > 0) tailoredScored.push({ id: lc(sig.id), fit });
      }
      if (tailoredScored.length > 0) {
        const best = pickBest(
          tailoredScored,
          (t) => t.fit,
          (t) => t.id,
          stageBRng,
        );
        bestTailored = best;
      }
    }

    if (bestTailored !== null) {
      dreamsign = {
        id: bestTailored.id,
        name: nameFor(bestTailored.id),
        fit: bestTailored.fit,
      };
    } else {
      // Fall back to a seeded neutral dreamsign: a template whose signature is
      // neutral or absent from `dreamsignSignatures`.
      const neutralIds: string[] = [];
      for (const tpl of dreamsignTemplates) {
        const id = lc(tpl.id);
        const sig = dreamsignSignatures?.get(id);
        if (sig === undefined || sig.category === "neutral") {
          neutralIds.push(id);
        }
      }
      if (neutralIds.length > 0) {
        const sorted = [...neutralIds].sort(compareCodeUnits);
        const chosen = sorted[stageBRng.nextInt(sorted.length)];
        dreamsign = { id: chosen, name: nameFor(chosen), fit: 0 };
      }
    }
  }

  // Step 4 — Ability flag.
  const abilityActive = opponentAbilityIsActive(
    layer,
    progression.abilityActiveFromLayer,
  );

  const finalCards = deck;

  // Provenance logging (UUID-keyed) so a battle's opponent deck and the layer
  // tuning that built it can be reconstructed from `logs/journey-log.jsonl`.
  const cardSummary = (card: CardData): { id: string; name: string } => ({
    id: lc(card.id),
    name: card.name,
  });
  deferLog(() => {
    logEvent("corpus_opponent_deck_constructed", {
      ...(battleEntryKey === undefined ? {} : { battleEntryKey }),
      sourceId: picked.id,
      sourceName: picked.name,
      signatureFit: round4(picked.signatureFit),
      affiliationFit: round4(picked.affiliationFit),
      combined: round4(picked.combined),
      candidateCount: candidates.length,
      topK: topK.map((t) => ({ id: t.id, combined: round4(t.combined) })),
      poolSeed,
      completionLevel,
      layerCount,
      opponentsContentHash,
      progression,
      selectionConfig,
      legendariesRemoved: legendariesRemoved.map(cardSummary),
      legendaryReplacements: legendaryReplacements.map(cardSummary),
      cardsCut: cardsCut.map(cardSummary),
      startersAdded: startersAdded.map(cardSummary),
      dreamsign:
        dreamsign === null
          ? null
          : {
              id: dreamsign.id,
              name: dreamsign.name,
              fit: round4(dreamsign.fit),
            },
      abilityActive,
      finalCardIds: finalCards.map(uuidOf),
    });
  });

  return {
    source: { id: picked.id, name: picked.name, sourceFile: picked.id },
    signatureFit: picked.signatureFit,
    affiliationFit: picked.affiliationFit,
    combined: picked.combined,
    candidateCount: candidates.length,
    topK,
    baseCards,
    finalCards,
    modifications: {
      legendariesRemoved,
      legendaryReplacements,
      cardsCut,
      startersAdded,
    },
    dreamsign,
    abilityActive,
  };
}

/** Mean co-occurrence of `candidate` to the current `deck` (other→candidate). */
function meanCooc(
  candidate: string,
  deck: readonly string[],
  cooc: ReadonlyMap<string, ReadonlyMap<string, number>>,
): number {
  if (deck.length === 0) return 0;
  let sum = 0;
  for (const d of deck) {
    sum += cooc.get(d)?.get(candidate) ?? 0;
  }
  return sum / deck.length;
}

/** Build an IdfDeck view from a set of UUIDs (norm = sqrt(Σ idf²) || 1). */
function makeIdfDeck(cards: Set<string>, corpus: IdfCorpus): IdfDeck {
  let sumSq = 0;
  for (const c of cards) {
    const w = corpus.idf.get(c) ?? 0;
    sumSq += w * w;
  }
  return { cards, norm: Math.sqrt(sumSq) || 1 };
}

/**
 * Pick the highest-scoring item, breaking ties with a seeded shuffle over the
 * tied group for deterministic-but-varied selection. `keyOf` is used only to
 * stabilize the tied group ordering before shuffling.
 */
function pickBest<T>(
  items: readonly T[],
  scoreOf: (item: T) => number,
  keyOf: (item: T) => string,
  rng: { nextInt: (n: number) => number },
): T {
  return pickTopN(items, 1, scoreOf, keyOf, rng)[0];
}

/**
 * Select the top-`n` items by score (descending), breaking score ties with a
 * seeded shuffle of the tied group so selection is deterministic for a fixed
 * seed yet varies across seeds.
 */
function pickTopN<T>(
  items: readonly T[],
  n: number,
  scoreOf: (item: T) => number,
  keyOf: (item: T) => string,
  rng: { nextInt: (n: number) => number },
): T[] {
  // Group by score; within a group, stabilize by key then seeded-shuffle.
  const sorted = [...items].sort((a, b) => {
    const sa = scoreOf(a);
    const sb = scoreOf(b);
    if (sb !== sa) return sb - sa;
    return compareCodeUnits(keyOf(a), keyOf(b));
  });
  // Seeded shuffle WITHIN equal-score runs so ties resolve deterministically
  // for a fixed seed but vary across seeds.
  const result: T[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && scoreOf(sorted[j]) === scoreOf(sorted[i]))
      j += 1;
    const group = sorted.slice(i, j);
    if (group.length > 1) {
      for (let k = group.length - 1; k > 0; k -= 1) {
        const swap = rng.nextInt(k + 1);
        [group[k], group[swap]] = [group[swap], group[k]];
      }
    }
    result.push(...group);
    i = j;
  }
  return result.slice(0, n);
}

/** Whether `deck` shares at least one UUID with `probe`. */
function hasOverlap(
  deck: ReadonlySet<string>,
  probe: ReadonlySet<string>,
): boolean {
  // Iterate the smaller set for cheaper membership checks.
  const [small, large] =
    deck.size <= probe.size ? [deck, probe] : [probe, deck];
  for (const key of small) {
    if (large.has(key)) return true;
  }
  return false;
}
