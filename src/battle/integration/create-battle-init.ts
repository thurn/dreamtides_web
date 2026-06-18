import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type { BattleModifier, QuestState, SiteState } from "../../types/quest";
import type { RunPoolContext } from "../../data/quest-content";
import { DEFAULT_POOL_VARIANT } from "../../draft/pool/types";
import { applyDeckEntryCardModification } from "../../card-type-change";
import { applyTransfigurationToCard } from "../../transfiguration/transfiguration-logic";
import { createBattleRngStreams, deriveBattleSeed } from "../random";
import type { BattleRng } from "../random";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { buildAiStarterDeck } from "../ai/deck";
import {
  buildOpponentDeck,
  buildOpponentDreamsigns,
  logOpponentDeckConstructed,
  resolveBattleAffiliation,
  resolveRunLayerCount,
  selectOpponentDreamcaller,
  type OpponentDeckBuild,
} from "./opponent-deck";
import type {
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleDreamsignSummary,
  BattleEnemyDescriptor,
  BattleInit,
  BattleQuestDeckEntry,
  DreamwellCardDefinition,
} from "../types";
import type { DreamwellCard } from "../../data/dreamwell-database";

/**
 * Minimum quest deck size for a battle. A deck below this is padded with
 * whole-deck copies until it reaches the threshold, so a player who has not
 * drafted much still has a workable battle deck.
 */
const MIN_BATTLE_DECK_SIZE = 25;

/**
 * Pads a quest deck up to `MIN_BATTLE_DECK_SIZE` for battle by repeating
 * whole-deck copies (e.g. a 9-card deck becomes 27). Padded entries reuse the
 * original entry references, so they share `sourceDeckEntryId` with the quest
 * deck entry they copy. Decks at or above the threshold (and empty decks) are
 * returned unchanged.
 */
function padBattleDeck(
  deck: readonly QuestState["deck"][number][],
): QuestState["deck"][number][] {
  if (deck.length === 0 || deck.length >= MIN_BATTLE_DECK_SIZE) {
    return [...deck];
  }
  const padded = [...deck];
  while (padded.length < MIN_BATTLE_DECK_SIZE) {
    padded.push(...deck);
  }
  return padded;
}

export interface CreateBattleInitInput {
  battleEntryKey: string;
  site: SiteState;
  state: Pick<
    QuestState,
    | "atlas"
    | "battleModifiers"
    | "completionLevel"
    | "currentDreamscape"
    | "deck"
    | "dreamcaller"
    | "dreamsigns"
    | "resolvedPackage"
    | "seed"
  >;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamcallers: readonly DreamcallerContent[];
  /**
   * Dreamscape definitions, used to resolve the affiliation backing the
   * dreamscape this battle takes place in so the opponent deck can lean toward
   * it. Optional so battle-engine tests can omit it; an absent list (or a
   * neutral dreamscape) yields an unbiased opponent build.
   */
  dreamscapes?: readonly DreamscapeContent[];
  /**
   * Thematic affiliations backing dreamscapes (`data/tabula/affiliations.toml`).
   * Resolved together with {@link dreamscapes} to bias the opponent deck toward
   * the battle's affiliation. Optional, mirroring {@link dreamscapes}.
   */
  affiliations?: readonly AffiliationContent[];
  /**
   * The shared Dreamwell card catalog (`data/tabula/dreamwell.toml`). Built into
   * the per-battle Dreamwell deck both players draw from. Optional so
   * battle-engine tests can omit it; an empty list yields an empty Dreamwell
   * deck (energy then stays at its starting value).
   */
  dreamwellCards?: readonly DreamwellCard[];
  /**
   * Dreamsign templates used to give the opponent concrete Dreamsigns.
   * Optional so battle-engine tests can omit it; production always passes
   * the run's templates.
   */
  dreamsignTemplates?: readonly DreamsignTemplate[];
  /**
   * The run's pool context (decklist corpus + name index, plus the selected
   * `poolVariant`). Used to build the enemy deck from the run's pool strategy —
   * by default the `idf3` strategy, which yields a real-decklist pool matching
   * the enemy Dreamcaller's signature. Optional: when absent (or when
   * the resolved decklist is empty, as non-`idf3` strategies produce no starter
   * deck) the enemy deck falls back to a sample of draftable cards from the card
   * database.
   */
  poolContext?: RunPoolContext;
  seedOverride?: number | null;
  /**
   * When true, the enemy deck is built from the AI Starter deck
   * ({@link buildAiStarterDeck}) instead of the run's steered pool. Used by the
   * `?ai=1` runtime mode that pits the player against the battle AI opponent.
   */
  aiMode?: boolean;
}

function applyBattleRewardModifiers(
  baseReward: number,
  modifiers: readonly BattleModifier[],
): number {
  let reward = baseReward;

  for (const modifier of modifiers) {
    if (modifier.battlesRemaining <= 0) {
      continue;
    }

    switch (modifier.kind) {
      case "reward_reduction_flat":
        reward -= modifier.amount;
        break;
      case "reward_reduction_percent":
        reward = Math.floor((reward * (100 - modifier.percent)) / 100);
        break;
      case "temporary_bane_grant":
        break;
    }

    reward = Math.max(0, reward);
  }

  return reward;
}

export function createBattleInit(input: CreateBattleInitInput): BattleInit {
  const {
    battleEntryKey,
    site,
    state,
    cardDatabase,
    dreamcallers,
    dreamsignTemplates = [],
    seedOverride,
  } = input;
  const seed = resolveSeed(battleEntryKey, state.seed, seedOverride);
  const streams = createBattleRngStreams(seed);
  const questDeckEntries: readonly BattleQuestDeckEntry[] = Object.freeze(
    state.deck.map((entry) => Object.freeze({
      entryId: entry.entryId,
      cardNumber: entry.cardNumber,
      transfiguration: entry.transfiguration,
      ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
      ...(entry.keywordModification == null
        ? {}
        : { keywordModification: entry.keywordModification }),
      isBane: entry.isBane,
    })),
  );
  // The quest deck is padded up to the minimum battle deck size before being
  // shuffled into the battle draw order. `questDeckEntries` above still
  // mirrors the unpadded quest deck.
  const battleDeck = padBattleDeck(state.deck);
  const playerDeckOrder = streams.playerDeckOrder
    .shuffle(battleDeck)
    .map((entry) => {
      const card = cardDatabase.get(entry.cardNumber);
      if (card === undefined) {
        throw new Error(`Missing card data for quest deck entry #${String(entry.cardNumber)}`);
      }
      return freezeBattleDeckCardDefinition(normalizePlayerDeckCard(entry, card));
    });
  // The opponent is built by emulating its Dreamcaller's journey to the
  // equivalent run depth (quests doc "Battle"): a deterministic opponent
  // Dreamcaller, a single dreamsign from the run midpoint onward, and a deck
  // simulated from that Dreamcaller's tides, biased toward the dreamscape's
  // affiliation and scaled by run progress.
  const completionLevelAtStart = state.completionLevel;
  const layerCount = resolveRunLayerCount(state.atlas.layers);
  const opponentDreamcaller = selectOpponentDreamcaller(
    dreamcallers,
    state.dreamcaller?.id ?? null,
    streams.enemyDescriptor,
  );
  const opponentDreamsigns = buildOpponentDreamsigns(
    completionLevelAtStart,
    layerCount,
    dreamsignTemplates,
    streams.enemyDescriptor,
  );
  const currentNode =
    state.currentDreamscape === null
      ? null
      : state.atlas.nodes[state.currentDreamscape] ?? null;
  const battleAffiliation = resolveBattleAffiliation(
    currentNode,
    input.dreamscapes ?? [],
    input.affiliations ?? [],
  );
  const enemyDescriptor = freezeBattleEnemyDescriptor(
    buildEnemyDescriptor(
      opponentDreamcaller,
      opponentDreamsigns,
      streams.enemyDescriptor.nextFloat,
    ),
  );
  const poolSeed = deriveEnemyPoolSeed(seed);
  const aiMode = input.aiMode ?? false;
  const opponentBuild = aiMode
    ? null
    : buildOpponentDeck({
        opponentDreamcaller,
        poolContext: input.poolContext,
        cardDatabase,
        affiliation: battleAffiliation,
        completionLevel: completionLevelAtStart,
        layerCount,
        poolSeed,
        rng: streams.enemyDeckOrder,
      });
  const enemyDeckDefinition = finalizeEnemyDeck(
    opponentBuild,
    cardDatabase,
    streams.enemyDeckOrder,
    aiMode,
  ).map(freezeBattleDeckCardDefinition);
  logOpponentDeckConstructed({
    battleEntryKey,
    opponentDreamcaller,
    poolVariant: aiMode
      ? "ai_starter"
      : input.poolContext?.poolVariant ?? DEFAULT_POOL_VARIANT,
    poolSeed,
    completionLevel: completionLevelAtStart,
    layerCount,
    affiliation: battleAffiliation,
    dreamsigns: opponentDreamsigns,
    build: opponentBuild,
    fallbackDeckSize: enemyDeckDefinition.length,
  });
  const dreamwellDeck = buildDreamwellDeck(
    input.dreamwellCards ?? [],
    streams.dreamwellDeck,
  ).map((definition) => Object.freeze(definition));
  const dreamcallerSummary = freezeBattleDreamcallerSummary(state.dreamcaller);
  const dreamsignSummaries = state.dreamsigns.map(freezeBattleDreamsignSummary);
  const essenceReward = applyBattleRewardModifiers(
    100 + completionLevelAtStart * 50,
    state.battleModifiers,
  );

  // Phase 2 runtime invariants (B-6, C-10): the player always starts and
  // skips the round-one draw. The `BattleInit` field types are widened to
  // `BattleSide` / `boolean` (bug-039) so tests can exercise the no-skip and
  // enemy-first paths without lying to the type system; the runtime values
  // here enforce the phase's invariant.
  const startingSide: BattleInit["startingSide"] = "player";
  const playerDrawSkipsTurnOne: BattleInit["playerDrawSkipsTurnOne"] = true;

  return Object.freeze({
    // bug-032: battleId and battleEntryKey were previously the same string,
    // which conflated the cache-bucket identity (entry key) with the
    // session-scope identity (battleId used for logs and completion tracking).
    // A `battle:` prefix keeps them semantically distinct even though they
    // remain 1:1 today; callers should not rely on string equality.
    battleId: `battle:${battleEntryKey}`,
    battleEntryKey,
    seed,
    siteId: site.id,
    dreamscapeId: state.currentDreamscape,
    completionLevelAtStart,
    isMiniboss: completionLevelAtStart === 3,
    isFinalBoss: completionLevelAtStart === 6,
    essenceReward,
    openingHandSize: 5,
    // The opening dreamscape (completion level 0) is a shorter, gentler
    // introduction won at 10 points; every later dreamscape is played to 25.
    scoreToWin: completionLevelAtStart === 0 ? 10 : 25,
    turnLimit: 50,
    maxEnergyCap: 10,
    startingSide,
    playerDrawSkipsTurnOne,
    questDeckEntries,
    playerDeckOrder: Object.freeze(playerDeckOrder),
    dreamwellDeck: Object.freeze(dreamwellDeck),
    enemyDescriptor,
    enemyDeckDefinition: Object.freeze(enemyDeckDefinition),
    dreamcallerSummary,
    dreamsignSummaries: Object.freeze(dreamsignSummaries),
    atlasSnapshot: freezeAtlasSnapshot(state.atlas),
  });
}

/**
 * Number of cards drawn per `order` group (1-4) in each Dreamwell deck cycle.
 * The order-0 starting cards lead the first cycle in addition to these.
 */
const DREAMWELL_CARDS_PER_ORDER = 5;

/** Order groups, lowest first, that fill each Dreamwell deck cycle. */
const DREAMWELL_CYCLE_ORDERS = [1, 2, 3, 4] as const;

/**
 * Minimum length of the pre-built Dreamwell deck. Both players draw one card
 * per turn, and a battle runs at most `turnLimit` (50) turns, so a deck this
 * long is never exhausted in practice; the draw edit still recycles safely if
 * it somehow reaches the end.
 */
const DREAMWELL_DECK_MIN_LENGTH = 62;

/**
 * Builds the shared Dreamwell deck (rules §The Dreamwell and Energy):
 *
 *  - The first cycle leads with every order-0 card (the per-player starting
 *    cards), then five random cards from each of orders 1-4.
 *  - Each later cycle drops the order-0 cards and again takes five random cards
 *    from each of orders 1-4.
 *
 * Cards are grouped by `order` and shuffled within each group via the seeded
 * `dreamwellDeck` RNG stream, so the deck is reproducible per battle seed while
 * keeping same-order cards randomized. Cycles repeat until the deck is at least
 * {@link DREAMWELL_DECK_MIN_LENGTH} long (a length never reached in a real
 * battle). A group smaller than {@link DREAMWELL_CARDS_PER_ORDER} contributes
 * however many cards it has, so the builder tolerates Dreamwell TOML edits.
 */
export function buildDreamwellDeck(
  cards: readonly DreamwellCard[],
  rng: BattleRng,
): DreamwellCardDefinition[] {
  const byOrder = new Map<number, DreamwellCardDefinition[]>();
  for (const card of cards) {
    const definition = toDreamwellCardDefinition(card);
    const group = byOrder.get(definition.order);
    if (group === undefined) {
      byOrder.set(definition.order, [definition]);
    } else {
      group.push(definition);
    }
  }

  const deck: DreamwellCardDefinition[] = [];
  let firstCycle = true;
  while (deck.length < DREAMWELL_DECK_MIN_LENGTH) {
    const lengthBeforeCycle = deck.length;
    if (firstCycle) {
      deck.push(...rng.shuffle(byOrder.get(0) ?? []));
      firstCycle = false;
    }
    for (const order of DREAMWELL_CYCLE_ORDERS) {
      const group = byOrder.get(order) ?? [];
      deck.push(...rng.shuffle(group).slice(0, DREAMWELL_CARDS_PER_ORDER));
    }
    // No order 1-4 cards (and no order-0 cards on the first pass) means the deck
    // cannot grow; stop rather than loop forever on a sparse catalog.
    if (deck.length === lengthBeforeCycle) {
      break;
    }
  }
  return deck;
}

function toDreamwellCardDefinition(card: DreamwellCard): DreamwellCardDefinition {
  return {
    id: card.id,
    name: card.name,
    renderedText: card.renderedText,
    energyAdded: card.energyAdded,
    order: card.order,
    cardNumber: card.cardNumber,
    imageNumber: card.imageNumber ?? 0,
  };
}

/**
 * Resolves the session seed, validating `seedOverride` so only non-negative
 * safe integers are accepted (bug-008). Unexpected values (NaN, Infinity,
 * negatives, floats) are loud errors — silent fallback would mask caller bugs
 * in tests and future programmatic entry points.
 */
function resolveSeed(
  battleEntryKey: string,
  questSeed: string,
  seedOverride: number | null | undefined,
): number {
  if (seedOverride === undefined || seedOverride === null) {
    return deriveBattleSeed(`${questSeed}:${battleEntryKey}`);
  }
  if (
    !Number.isFinite(seedOverride) ||
    !Number.isInteger(seedOverride) ||
    seedOverride < 0 ||
    seedOverride > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(
      `createBattleInit: seedOverride must be a non-negative safe integer, received ${String(seedOverride)}`,
    );
  }
  return seedOverride;
}

/**
 * Assembles the enemy descriptor shown before the battle (quests doc "Battle"):
 * the chosen opponent Dreamcaller's identity and ability text, plus the concrete
 * dreamsigns it carries (none before the run midpoint, one from the midpoint on).
 * The dreamsigns are resolved by the caller via
 * {@link buildOpponentDreamsigns} so the midpoint gating lives in one place;
 * this only renders them for display. Falls back to a synthetic descriptor when
 * no opponent Dreamcaller is available.
 */
export function buildEnemyDescriptor(
  opponentDreamcaller: DreamcallerContent | null,
  dreamsignTemplates: readonly DreamsignTemplate[],
  random: () => number,
): BattleEnemyDescriptor {
  const dreamsigns: BattleDreamsignSummary[] = dreamsignTemplates.map(
    (template) => ({
      name: template.name,
      effectDescription: template.effectDescription,
      isBane: false,
    }),
  );

  if (opponentDreamcaller === null) {
    return {
      id: "enemy:fallback",
      name: "Spectral Rival",
      subtitle: "Battlefield Projection",
      imageNumber: "001",
      portraitSeed: 0,
      abilityText: "A synthetic opponent assembled for prototype combat.",
      dreamsigns,
    };
  }

  const portraitSeed = Math.floor(random() * 1_000_000);
  return {
    id: `enemy:${opponentDreamcaller.id}:${String(portraitSeed)}`,
    name: opponentDreamcaller.name,
    subtitle: "",
    imageNumber: opponentDreamcaller.imageNumber,
    portraitSeed,
    abilityText: opponentDreamcaller.renderedText,
    dreamsigns,
  };
}

/**
 * Mixes the battle seed into a distinct stream for the enemy pool draw so the
 * enemy deck is reproducible per battle seed without colliding with the other
 * battle RNG streams.
 */
function deriveEnemyPoolSeed(seed: number): number {
  // XOR with an arbitrary large bit-mixing constant to derive a distinct but fully deterministic sub-seed from the battle seed.
  return (seed ^ 0x5f3759df) >>> 0;
}

/**
 * Turns an {@link OpponentDeckBuild} (or the AI-mode / fallback path) into the
 * concrete enemy battle deck: the chosen cards padded up to
 * `MIN_BATTLE_DECK_SIZE` and shuffled into the enemy draw order.
 *
 *  - In `aiMode` the deck is the fixed AI Starter deck (3 copies of each
 *    starter), shuffled through the enemy-deck RNG stream.
 *  - Otherwise the simulated-journey build's cards are used. When the build is
 *    `null` (no `poolContext`, or the simulated pool resolved to no cards) the
 *    deck falls back to a shuffled sample of draftable cards (non-starter,
 *    numeric cost) so the enemy always has a non-empty deck.
 */
function finalizeEnemyDeck(
  build: OpponentDeckBuild | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
  aiMode: boolean,
): BattleDeckCardDefinition[] {
  if (aiMode) {
    return rng
      .shuffle(buildAiStarterDeck(cardDatabase))
      .map(cloneBattleDeckCardDefinition);
  }

  let chosen: CardData[] = build?.cards ?? [];

  if (chosen.length === 0) {
    chosen = rng.shuffle(
      Array.from(cardDatabase.values()).filter(
        (card) => !card.isStarter && card.energyCost !== null,
      ),
    );
  }

  const padded = padEnemyDeck(chosen);

  return rng
    .shuffle(padded.map(createBaseBattleDeckCardDefinition))
    .map(cloneBattleDeckCardDefinition);
}

/**
 * Pads a chosen enemy card list up to `MIN_BATTLE_DECK_SIZE` by repeating
 * whole-list copies (mirroring {@link padBattleDeck}). A list at or above the
 * threshold, or an empty list, is returned unchanged.
 */
function padEnemyDeck(cards: readonly CardData[]): CardData[] {
  if (cards.length === 0 || cards.length >= MIN_BATTLE_DECK_SIZE) {
    return [...cards];
  }
  const padded = [...cards];
  while (padded.length < MIN_BATTLE_DECK_SIZE) {
    padded.push(...cards);
  }
  return padded;
}

function cloneBattleDeckCardDefinition(
  definition: BattleDeckCardDefinition,
): BattleDeckCardDefinition {
  return {
    ...definition,
  };
}

function normalizePlayerDeckCard(
  entry: QuestState["deck"][number],
  card: CardData,
): BattleDeckCardDefinition {
  // Apply the deck entry's transfiguration so the battle card carries the
  // modified cost, spark, and rules text rather than the printed base values.
  const transfiguredCard =
    entry.transfiguration === null
      ? card
      : applyTransfigurationToCard(card, entry.transfiguration);
  const effectiveCard = applyDeckEntryCardModification(transfiguredCard, {
    typeChange: entry.typeChange,
    keywords: entry.keywordModification,
  });
  return {
    sourceDeckEntryId: entry.entryId,
    // The stable base-catalog UUID, kept even when the entry is transfigured or
    // modified: automation scripts and the rules-text hash key off the printed
    // card's identity. (None of the registered automation cards are
    // transfiguration targets today.)
    cardId: card.id,
    cardNumber: card.cardNumber,
    name: card.name,
    battleCardKind: effectiveCard.cardType === "Character" ? "character" : "event",
    subtype: effectiveCard.subtype,
    energyCost: effectiveCard.energyCost ?? 0,
    printedEnergyCost: effectiveCard.energyCost,
    printedSpark: effectiveCard.spark ?? 0,
    isFast: effectiveCard.isFast,
    timing: effectiveCard.isFast ? "fast" : "standard",
    reclaimCost: effectiveCard.reclaimCost ?? null,
    renderedText: effectiveCard.renderedText,
    imageNumber: card.imageNumber,
    transfiguration: entry.transfiguration,
    ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
    ...(entry.keywordModification == null
      ? {}
      : { keywordModification: entry.keywordModification }),
    isBane: entry.isBane,
  };
}

function freezeBattleDeckCardDefinition(
  definition: BattleDeckCardDefinition,
): BattleDeckCardDefinition {
  return Object.freeze({
    ...definition,
  });
}

function freezeBattleEnemyDescriptor(
  descriptor: BattleEnemyDescriptor,
): BattleEnemyDescriptor {
  return Object.freeze({
    ...descriptor,
    dreamsigns: Object.freeze(
      descriptor.dreamsigns.map((dreamsign) => Object.freeze({ ...dreamsign })),
    ),
  });
}

function freezeBattleDreamcallerSummary(
  dreamcaller: QuestState["dreamcaller"],
): BattleDreamcallerSummary | null {
  if (dreamcaller === null) {
    return null;
  }

  return Object.freeze({
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: dreamcaller.title,
    renderedText: dreamcaller.renderedText,
    imageNumber: dreamcaller.imageNumber,
  });
}

function freezeBattleDreamsignSummary(
  dreamsign: QuestState["dreamsigns"][number],
): BattleDreamsignSummary {
  return Object.freeze({
    name: dreamsign.name,
    effectDescription: dreamsign.effectDescription,
    isBane: dreamsign.isBane,
  });
}

function freezeAtlasSnapshot(atlas: QuestState["atlas"]): QuestState["atlas"] {
  return deepFreeze(structuredClone(atlas));
}

function deepFreeze<T>(value: T): T {
  // bug-033: never early-exit on a frozen parent. A caller that passes in a
  // partially-frozen graph (e.g. a `ReadonlyArray` literal whose elements are
  // still mutable objects) must still have its subtrees walked. `Object.freeze`
  // on an already-frozen value is a no-op.
  if (value === null || typeof value !== "object") {
    return value;
  }

  for (const key of Object.keys(value as object)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}
