import type { CardData } from "../../types/cards";
import type {
  DreamcallerContent,
  DreamsignTemplate,
} from "../../types/content";
import type { BattleModifier, QuestState, SiteState } from "../../types/quest";
import type { RunPoolContext } from "../../data/quest-content";
import { generatePoolFromData } from "../../draft/pool/generate";
import { applyDeckEntryCardModification } from "../../card-type-change";
import { applyTransfigurationToCard } from "../../transfiguration/transfiguration-logic";
import { createBattleRngStreams, deriveBattleSeed } from "../random";
import type { BattleRng } from "../random";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import type {
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleDreamsignSummary,
  BattleEnemyDescriptor,
  BattleInit,
  BattleQuestDeckEntry,
} from "../types";

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
   * Dreamsign templates used to give the opponent concrete Dreamsigns.
   * Optional so battle-engine tests can omit it; production always passes
   * the run's templates.
   */
  dreamsignTemplates?: readonly DreamsignTemplate[];
  /**
   * The run's pool context (decklist corpus + name index). Used to build the
   * enemy deck from an idf3-steered `drafts_anon` decklist matching the enemy
   * Dreamcaller's signature. Optional: when absent (or when the resolved
   * decklist is empty) the enemy deck falls back to a sample of draftable cards
   * from the card database.
   */
  poolContext?: RunPoolContext;
  seedOverride?: number | null;
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
  const { descriptor: rawEnemyDescriptor, signatureCards: enemySignatureCards } =
    createEnemyDescriptor(
      dreamcallers,
      dreamsignTemplates,
      streams.enemyDescriptor.nextFloat,
    );
  const enemyDescriptor = freezeBattleEnemyDescriptor(rawEnemyDescriptor);
  const enemyDeckDefinition = createEnemyDeckDefinition(
    enemySignatureCards,
    input.poolContext,
    cardDatabase,
    streams.enemyDeckOrder,
    seed,
  ).map(freezeBattleDeckCardDefinition);
  const dreamcallerSummary = freezeBattleDreamcallerSummary(state.dreamcaller);
  const dreamsignSummaries = state.dreamsigns.map(freezeBattleDreamsignSummary);
  const completionLevelAtStart = state.completionLevel;
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
    // Victory grants 1-3 omens, scaling with completed dreamscapes.
    omenReward: Math.min(3, 1 + Math.floor(completionLevelAtStart / 2)),
    openingHandSize: 5,
    scoreToWin: 25,
    turnLimit: 50,
    maxEnergyCap: 10,
    startingSide,
    playerDrawSkipsTurnOne,
    questDeckEntries,
    playerDeckOrder: Object.freeze(playerDeckOrder),
    enemyDescriptor,
    enemyDeckDefinition: Object.freeze(enemyDeckDefinition),
    dreamcallerSummary,
    dreamsignSummaries: Object.freeze(dreamsignSummaries),
    atlasSnapshot: freezeAtlasSnapshot(state.atlas),
  });
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

export function createEnemyDescriptor(
  dreamcallers: readonly DreamcallerContent[],
  dreamsignTemplates: readonly DreamsignTemplate[],
  random: () => number,
): { descriptor: BattleEnemyDescriptor; signatureCards: readonly string[] } {
  if (dreamcallers.length === 0) {
    return {
      descriptor: {
        id: "enemy:fallback",
        name: "Spectral Rival",
        subtitle: "Battlefield Projection",
        imageNumber: "001",
        portraitSeed: 0,
        packageTides: Object.freeze([]),
        abilityText: "A synthetic opponent assembled for prototype combat.",
        dreamsigns: Object.freeze([]),
      },
      signatureCards: [],
    };
  }

  const template = pickRandom(dreamcallers, random);
  const dreamsignCount = Math.floor(random() * 3) + 1;
  const portraitSeed = Math.floor(random() * 1_000_000);

  // The opponent's Dreamsigns are concrete: drawn from the templates adjacent
  // to the enemy's mandatory tides, so they can be shown before the battle.
  const enemyTides = new Set(template.mandatoryTides);
  const adjacentTemplates = dreamsignTemplates.filter((candidate) =>
    candidate.packageTides.some((tide) => enemyTides.has(tide)),
  );
  const dreamsignPool =
    adjacentTemplates.length > 0 ? adjacentTemplates : dreamsignTemplates;
  const dreamsigns: BattleDreamsignSummary[] = [];
  const usedDreamsignIds = new Set<string>();
  let attempts = 0;
  while (
    dreamsigns.length < dreamsignCount &&
    dreamsignPool.length > 0 &&
    attempts < dreamsignPool.length * 4
  ) {
    attempts += 1;
    const candidate = pickRandom(dreamsignPool, random);
    if (usedDreamsignIds.has(candidate.id)) {
      continue;
    }
    usedDreamsignIds.add(candidate.id);
    dreamsigns.push({
      name: candidate.name,
      effectDescription: candidate.effectDescription,
      isBane: false,
    });
  }

  return {
    descriptor: {
      id: `enemy:${template.id}:${String(portraitSeed)}`,
      name: template.name,
      subtitle: "",
      imageNumber: template.imageNumber,
      portraitSeed,
      // The tide field stays on the type for now but is always empty; the enemy
      // deck is steered by `signatureCards` instead.
      packageTides: Object.freeze([]),
      abilityText: template.renderedText,
      dreamsigns,
    },
    signatureCards: template.signatureCards ?? [],
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
 * Builds the enemy battle deck from an idf3 pool steered by the enemy
 * Dreamcaller's signature cards, mirroring how the player's draft pool is built.
 *
 * With a `poolContext`, an idf3 pool is generated from the run's decklist corpus
 * steered by `enemySignatureCards`; the chosen anchor decklist's card names are
 * resolved to V2 card numbers via the name index, then to `CardData` via the
 * card database (unresolved/missing entries are dropped). When `poolContext` is
 * absent — or the resolved list is empty — the deck falls back to a shuffled
 * sample of draftable cards (non-starter, numeric cost) so the enemy always has
 * a non-empty deck. The chosen cards are padded up to `MIN_BATTLE_DECK_SIZE`,
 * then shuffled into the enemy draw order.
 */
function createEnemyDeckDefinition(
  enemySignatureCards: readonly string[],
  poolContext: RunPoolContext | undefined,
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
  battleSeed: number,
): BattleDeckCardDefinition[] {
  let chosen: CardData[] = [];

  if (poolContext !== undefined) {
    const pool = generatePoolFromData(
      poolContext.poolData,
      deriveEnemyPoolSeed(battleSeed),
      /* seedArchetypes */ undefined,
      "idf3",
      /* themeArchetypes */ undefined,
      /* targetSize */ undefined,
      enemySignatureCards,
    );
    for (const name of pool.starterDeck ?? []) {
      const cardNumber = poolContext.nameIndex.get(name);
      if (cardNumber === undefined) {
        continue;
      }
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        continue;
      }
      chosen.push(card);
    }
  }

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
    tides: [...definition.tides],
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
    tides: [...card.tides],
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
    tides: Object.freeze([...definition.tides]),
  });
}

function freezeBattleEnemyDescriptor(
  descriptor: BattleEnemyDescriptor,
): BattleEnemyDescriptor {
  return Object.freeze({
    ...descriptor,
    packageTides: Object.freeze([...descriptor.packageTides]),
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

function pickRandom<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)];
}
