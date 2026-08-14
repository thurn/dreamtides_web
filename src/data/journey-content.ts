import { loadDreamsignTemplates } from "./dreamsigns";
import { logEvent } from "../logging";
import {
  type DreamAvatarContent,
  type DreamsignTemplate,
  type ResolvedDreamAvatarPackage,
  type Tides4CardProvenance,
  type Tides4ProvenanceSummary,
  type Tides4TideSummary,
} from "../types/content";
import { asCardId, asCardName, type CardId } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type {
  GeneratedPool,
  PoolData,
  PoolVariant,
} from "../draft/pool/types.ts";
import { generatePoolFromData } from "../draft/pool/generate.ts";
import { buildPoolData } from "../draft/pool/pool-data";
import { loadFigmentDatabase } from "./figment-database";
import { loadExplorationContent, type ExplorationContent } from "./exploration";
import {
  buildRewardSelectionData,
  type RewardSelectionData,
} from "./reward-selection-data";
import { loadAuguryData, type AuguryData } from "./augury-data";
import {
  buildIdIndex,
  loadCardsV2Database,
  loadTides4Decks,
  resolvePool,
} from "./cards-v2-database";
import { loadDreamAvatarsV2 } from "./dream-avatars-v2-database";
import { loadDreamwellCards, type DreamwellCard } from "./dreamwell-database";
import {
  loadAffiliations,
  loadApollyonIncarnations,
  loadDreamGuides,
  loadDreamscapes,
} from "./dreamscapes";
import { loadAtlasData } from "./atlas-data";
import { loadSitesData } from "./sites-data";
import { loadEconomyData } from "./economy-data";
import { loadGambleData } from "./gamble-data";
import { loadTransfigurationData } from "./transfiguration-data";
import { loadDraftData } from "./draft-data";
import { loadOpponentsData } from "./opponents-data";
import type { EconomyData } from "../types/economy-data";
import type { DraftData } from "../types/draft-data";
import type { OpponentsData } from "../types/opponents-data";
import type { SitesData } from "../types/sites-data";
import type { GambleData } from "../types/gamble-data";
import type { TransfigurationData } from "../types/transfiguration-data";
import type {
  AffiliationContent,
  ApollyonIncarnationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";
import type { AtlasData } from "../types/journey";
import { resolveCatalogStarterCardNumbers } from "./card-roles";
import type { TutorialConfiguration } from "../types/tutorial";
import {
  TUTORIAL_JOURNEY_POOL,
  type TutorialJourneyPool,
} from "./tutorial-journey-pool";
import type { DreamsignId, TideId } from "../types/identifiers";
import { asDreamAvatarId } from "../types/identifiers";

export interface JourneyContent {
  cardDatabase: Map<number, CardData>;
  /** Authored Exploration encounters and their site-specific reward content. */
  exploration?: ExplorationContent;
  /** Selector tuning assembled from the Tides, Augury, and Sites catalogs. */
  rewardSelectionData: RewardSelectionData;
  /** Augury composition, archetype weights, policies, and quantities. */
  auguryData: AuguryData;
  dreamAvatars: DreamAvatarContent[];
  /** The shared Dreamwell deck source, drawn from during battle. */
  dreamwellCards: readonly DreamwellCard[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /** Complete normalized tutorial scenario loaded from tutorial.toml. */
  tutorial?: TutorialConfiguration;
  /** Fixed three-tide draft pool used by the tutorial journey handoff. */
  tutorialJourneyPool?: TutorialJourneyPool;
  /**
   * Dreamscape definitions the Atlas generator assigns to nodes, loaded from
   * `public/dreamscapes-data.json`.
   */
  dreamscapes: readonly DreamscapeContent[];
  /**
   * Thematic affiliations backing non-starter dreamscapes, loaded from
   * `public/affiliations-data.json`. Each dreamscape's `affiliationId` resolves to
   * one of these; its three authored tides contribute to opponent affinity.
   */
  affiliations: readonly AffiliationContent[];
  /**
   * Dream Guide definitions, loaded from `public/dream-guides-data.json`. Each
   * guide tends one site type (its home dreamscape's signature site) and carries
   * the dialog and `homeSpecialty` copy the guide frame presents at that site.
   */
  guides: readonly DreamGuideContent[];
  /**
   * Dream Atlas generation tuning, loaded from `public/atlas-data.json`.
   */
  atlasData: AtlasData;
  /** Canonical cross-site metadata and fold-relevant site rules. */
  sitesData: SitesData;
  /** Validated draft rules loaded before room folding begins. */
  draftData: DraftData;
  /** Validated direct economy tuning loaded before room folding begins. */
  economyData: EconomyData;
  /** Fold-relevant Gamble rules, economy, and authored presentation. */
  gambleData: GambleData;
  /** Fold-relevant Transfiguration rules, tuning, and authored presentation. */
  transfigurationData: TransfigurationData;
  /** Fold-relevant opponent and battle tuning loaded before room entry. */
  opponentsData: OpponentsData;
  /**
   * Apollyon's ten incarnations, loaded from
   * `public/apollyon-incarnations-data.json`. Atlas generation picks one per run
   * to present the boss node; the Atlas UI resolves the chosen incarnation's
   * title and description by `DreamAtlas.bossIncarnationId`.
   */
  apollyonIncarnations?: readonly ApollyonIncarnationContent[];
  poolContext?: RunPoolContext;
}

/**
 * Inputs shared across every DreamAvatar package build for a single journey run:
 * the prebuilt pool data, the card-name -> card-number index, and the run's
 * dreamsign pool ids.
 */
export interface RunPoolContext {
  poolData: PoolData;
  /** RON-role starter deck resolved from UUIDs in authored catalog order. */
  starterCardNumbers: readonly number[];
  /**
   * Stable card UUID (lowercased) -> card-number index — the single,
   * collision-free identity index every pool resolves through. A pool's
   * `counts` and provenance are keyed by {@link CardId}, so
   * resolving them here (rather than through a display-name index) keeps two
   * distinct cards that share a display name as two separate card numbers.
   * Display names are read from {@link PoolData.cardNameById} only at the render
   * boundary.
   */
  idIndex: ReadonlyMap<CardId, number>;
  /** Per-card rarity copy-cap overrides compiled from draft.toml. */
  poolCopyCapsByCardNumber?: ReadonlyMap<number, number>;
  /** Default pool copy cap for cards without a rarity override. */
  defaultPoolCopyCap?: number;
  allDreamsignPoolIds: DreamsignId[];
  /**
   * Pool-construction algorithm for this run.
   */
  poolVariant?: PoolVariant;
  /** Production tides4 tuning compiled from draft.toml. */
  tides4Tuning?: DraftData["pool"]["tides4"];
}

/**
 * FNV-1a hash of a string into a 32-bit unsigned integer, used to derive the
 * tides4 generator's numeric seed from the journey seed and DreamAvatar id so each
 * run's pool is reproducible.
 */
export function hashStringToSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Generate the tides4 draft pool for one DreamAvatar, pinned to the run's
 * deterministic seed. This is the single source of pool generation for both the
 * draft package and its provenance summary, so they always describe the same
 * pool.
 */
function generateDreamAvatarPool(
  dreamAvatar: DreamAvatarContent,
  ctx: RunPoolContext,
  journeySeed: string,
): GeneratedPool {
  return generatePoolFromData(
    ctx.poolData,
    hashStringToSeed(`${journeySeed}:${dreamAvatar.id}`),
    dreamAvatar.id,
    ctx.tides4Tuning,
  );
}

/**
 * Emit `draft_pool_constructed`, the "why is my pool shaped like this" record,
 * captured at the one point the freshly built {@link GeneratedPool} and its
 * provenance are in hand. The algorithm, seed, tuning, and selected tide ids
 * make the pool construction reconstructable from the production log.
 */
function logPoolConstructed(
  dreamAvatar: DreamAvatarContent,
  pool: GeneratedPool,
): void {
  logEvent("draft_pool_constructed", {
    dreamAvatarId: dreamAvatar.id,
    algo: pool.variant,
    seed: pool.seed,
    poolSize: pool.size,
    distinctCardCount: pool.counts.size,
    tideDeckIds: pool.tideDeckIds,
    tides4Tuning: {
      dealSize: pool.tides4Provenance.dealSize,
      copyCap: pool.tides4Provenance.cap,
      maxFacets: pool.tides4Provenance.maxFacets,
    },
  });
}

/**
 * Build the draft package for one DreamAvatar by generating its pool with the
 * tides4, resolving it against the run's UUID index, and excluding starter
 * cards. Deterministic per `(journeySeed, dreamAvatar.id)`.
 */
export function buildDreamAvatarPackage(
  dreamAvatar: DreamAvatarContent,
  ctx: RunPoolContext,
  journeySeed: string,
): ResolvedDreamAvatarPackage {
  const pool = generateDreamAvatarPool(dreamAvatar, ctx, journeySeed);
  logPoolConstructed(dreamAvatar, pool);

  const {
    draftPoolCopiesByCard,
    unresolvedIds,
    collidedCardNumbers,
    cappedCardNumbers,
  } = resolvePool(
    pool,
    ctx.idIndex,
    ctx.defaultPoolCopyCap,
    ctx.poolCopyCapsByCardNumber,
  );
  if (unresolvedIds.length > 0) {
    // A pool card whose UUID is not in the catalog id index (a card dropped from
    // the catalog). Logged so a production pool stays reconstructable: the
    // variant emitted these ids and the resolver left them out.
    logEvent("build_dream_avatar_package_unresolved_ids", {
      dreamAvatarId: dreamAvatar.id,
      algo: pool.variant,
      unresolvedCount: unresolvedIds.length,
      unresolvedIds,
    });
  }
  if (collidedCardNumbers.length > 0) {
    // Two distinct pool ids resolved to one card number — impossible under the
    // collision-free id index, so this records a data anomaly (a stale or
    // duplicate id) rather than the same-name merge the id-keyed pool prevents.
    logEvent("build_dream_avatar_package_id_collision", {
      dreamAvatarId: dreamAvatar.id,
      algo: pool.variant,
      collidedCardNumbers,
    });
  }
  if (cappedCardNumbers.length > 0) {
    logEvent("build_dream_avatar_package_rarity_capped", {
      dreamAvatarId: dreamAvatar.id,
      cappedCount: cappedCardNumbers.length,
      cappedCardNumbers,
    });
  }
  for (const starter of ctx.starterCardNumbers) {
    delete draftPoolCopiesByCard[String(starter)];
  }

  const draftPoolSize = countDraftPoolSize(draftPoolCopiesByCard);
  const doubledCardCount = countDoubledCards(draftPoolCopiesByCard);

  return {
    dreamAvatar,
    joinedTideIds: pool.tides4Provenance.tides
      .filter((tide) => tide.joined)
      .map((tide) => tide.id),
    draftPoolCopiesByCard,
    dreamsignPoolIds: [...ctx.allDreamsignPoolIds],
    mandatoryOnlyPoolSize: draftPoolSize,
    draftPoolSize,
    doubledCardCount,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}

/**
 * Recompute the full `tides4` tide provenance for one DreamAvatar's pool,
 * resolved against the run's name index so per-card entries and per-tide
 * decklists are keyed by card number. Reproduces the exact pool
 * {@link buildDreamAvatarPackage} built (same seed and inputs), so the Pool
 * Viewer can show each individual tide deck and the "Why Cards" surface can
 * attribute every offered card to its source tide without the provenance ever
 * being persisted. Returns `null` for non-`tides4` pools. Starter cards (never
 * draftable) are dropped from both the per-tide decklists and the per-card map,
 * and each tide's `contributedCardCount` is recounted over the dropped-starter
 * pool so it matches what a player actually sees.
 */
export function buildDreamAvatarTides4Provenance(
  dreamAvatar: DreamAvatarContent,
  ctx: RunPoolContext,
  journeySeed: string,
): Tides4ProvenanceSummary | null {
  const pool = generateDreamAvatarPool(dreamAvatar, ctx, journeySeed);
  const provenance = pool.tides4Provenance;
  if (provenance === undefined) return null;

  const starterSet = new Set(ctx.starterCardNumbers);
  // Resolve a tide's decklist of card ids to card numbers through the id index,
  // dropping starter cards and de-duplicating, so a tide deck shows the same
  // draftable cards a player sees.
  const toNumbers = (ids: readonly CardId[]): number[] => {
    const out: number[] = [];
    const seen = new Set<number>();
    for (const id of ids) {
      const cardNumber = ctx.idIndex.get(id);
      if (cardNumber === undefined) continue;
      if (starterSet.has(cardNumber)) continue;
      if (seen.has(cardNumber)) continue;
      seen.add(cardNumber);
      out.push(cardNumber);
    }
    return out;
  };

  const cardProvenanceByNumber: Record<string, Tides4CardProvenance> = {};
  const contributionByTide = new Map<TideId, number>();
  for (const [key, entry] of Object.entries(provenance.cardProvenanceById)) {
    const cardNumber = ctx.idIndex.get(asCardId(key));
    if (cardNumber === undefined) continue;
    if (starterSet.has(cardNumber)) continue;
    cardProvenanceByNumber[String(cardNumber)] = {
      copies: entry.copies,
      tideIds: [...entry.tideIds],
      primaryTideId: entry.primaryTideId,
    };
    contributionByTide.set(
      entry.primaryTideId,
      (contributionByTide.get(entry.primaryTideId) ?? 0) + 1,
    );
  }

  const tides: Tides4TideSummary[] = provenance.tides.map((tide) => ({
    id: tide.id,
    displayName: tide.displayName,
    displayDescription: tide.displayDescription,
    role: tide.role,
    selection: tide.selection,
    joined: tide.joined,
    cardNumbers: toNumbers(tide.cardIds),
    contributedCardCount: contributionByTide.get(tide.id) ?? 0,
  }));

  return {
    dreamAvatarId: provenance.dreamAvatarId,
    signatureless: provenance.signatureless,
    borrowedArchetypeName: provenance.borrowedArchetypeName,
    dealSize: provenance.dealSize,
    cap: provenance.cap,
    maxFacets: provenance.maxFacets,
    facetDrawnCount: provenance.facetDrawnCount,
    facetAvailableCount: provenance.facetAvailableCount,
    tides,
    cardProvenanceByNumber,
  };
}

/**
 * Loads journey content and the Tides4 run-pool context.
 */
export async function loadJourneyContent(): Promise<JourneyContent> {
  const draftData = await loadDraftData();
  const [
    cardDatabase,
    exploration,
    auguryData,
    draftDreamAvatars,
    dreamwellCards,
    dreamsignTemplates,
    tides4Decks,
    dreamscapes,
    affiliations,
    guides,
    atlasData,
    sitesData,
    economyData,
    gambleData,
    transfigurationData,
    opponentsData,
    apollyonIncarnations,
    _figmentCatalog,
  ] = await Promise.all([
    loadCardsV2Database(),
    loadExplorationContent(),
    loadAuguryData(),
    loadDreamAvatarsV2(),
    loadDreamwellCards(),
    loadDreamsignTemplates(),
    loadTides4Decks(),
    // Dreamscape definitions and Atlas generation tuning are small and always
    // loaded so the 7-layer Atlas generator can assign and tune nodes.
    loadDreamscapes(),
    // Affiliations are small and always loaded so affiliated card draws can
    // reweight toward a dreamscape's faction.
    loadAffiliations(),
    // Dream Guides are small and always loaded so guide-bearing site screens can
    // present the resident guide and their home specialty.
    loadDreamGuides(),
    loadAtlasData(),
    loadSitesData(),
    loadEconomyData(),
    loadGambleData(),
    loadTransfigurationData(),
    loadOpponentsData(),
    // Apollyon's incarnations are small and always loaded so the Atlas can
    // present a per-run guise for the boss node.
    loadApollyonIncarnations(),
    // Complete this small load before publishing journey content so every
    // GameCard registers its materialized-figment preview from the authored
    // UUID, rules, and art on the first render. Failure remains non-fatal: the
    // fixed rules catalog still provides gameplay defaults.
    loadFigmentDatabase().catch(() => undefined),
  ]);

  const draftPoolCards = [...cardDatabase.values()];
  for (const customCard of exploration.customCards) {
    if (cardDatabase.has(customCard.cardNumber)) {
      throw new Error(
        `Exploration custom card number collision: ${String(customCard.cardNumber)}`,
      );
    }
    cardDatabase.set(customCard.cardNumber, customCard);
  }

  const dreamAvatars: DreamAvatarContent[] = draftDreamAvatars.map((dc) => ({
    id: asDreamAvatarId(dc.id),
    name: dc.name,
    title: dc.title,
    renderedText: dc.renderedText,
    imageNumber: dc.imageNumber,
    portraitFocus: dc.portraitFocus,
    startingEssence:
      dc.startingEssence ?? economyData.journey.defaultStartingEssence,
    signatureCards: (dc.signatureCards ?? []).map(asCardName),
    signatureCardIds: [...(dc.signatureCardIds ?? [])],
  }));

  // Build the collision-free id index once; every pool resolves through it.
  const idIndex = buildIdIndex(cardDatabase);
  const rarityCopyCapByRarity = new Map(
    draftData.rarityCaps.map((cap) => [cap.rarity, cap.poolCopyCap]),
  );
  const poolCopyCapsByCardNumber = new Map<number, number>();
  for (const card of cardDatabase.values()) {
    if (card.rarity === undefined) continue;
    const cap = rarityCopyCapByRarity.get(card.rarity);
    if (cap !== undefined) poolCopyCapsByCardNumber.set(card.cardNumber, cap);
  }

  if (tides4Decks === null) throw new Error("Missing Tides4 catalog");
  const poolData = buildPoolData(draftPoolCards);
  poolData.tides4Decks = tides4Decks;
  const rewardSelectionData = buildRewardSelectionData({
    tides: tides4Decks,
    augury: auguryData,
    sites: sitesData,
  });

  const poolContext: RunPoolContext = {
    poolData,
    idIndex,
    starterCardNumbers: resolveCatalogStarterCardNumbers(draftPoolCards),
    poolCopyCapsByCardNumber,
    defaultPoolCopyCap: draftData.pool.tides4.copyCap,
    allDreamsignPoolIds: dreamsignTemplates.map((template) => template.id),
    poolVariant: draftData.pool.defaultStrategy,
    tides4Tuning: draftData.pool.tides4,
  };

  return {
    cardDatabase,
    exploration,
    rewardSelectionData,
    auguryData,
    dreamAvatars,
    dreamwellCards,
    dreamsignTemplates,
    tutorialJourneyPool: TUTORIAL_JOURNEY_POOL,
    dreamscapes,
    affiliations,
    guides,
    atlasData,
    sitesData,
    draftData,
    economyData,
    gambleData,
    transfigurationData,
    opponentsData,
    apollyonIncarnations,
    poolContext,
  };
}

function countDraftPoolSize(
  draftPoolCopiesByCard: Record<string, number>,
): number {
  return Object.values(draftPoolCopiesByCard).reduce(
    (total, copies) => total + copies,
    0,
  );
}

function countDoubledCards(
  draftPoolCopiesByCard: Record<string, number>,
): number {
  return Object.values(draftPoolCopiesByCard).filter((copies) => copies === 2)
    .length;
}
