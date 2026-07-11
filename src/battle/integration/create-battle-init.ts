import type { CardData } from "../../types/cards";
import type {
  AffiliationContent,
  DreamcallerContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type {
  BattleModifier,
  DreamscapeNode,
  QuestState,
  SiteState,
} from "../../types/quest";
import type { RunPoolContext } from "../../data/quest-content";
import type { DraftRecord } from "../../data/cards-v2-database";
import type { FitModel } from "../../draft/replay/fit-model";
import { DEFAULT_POOL_VARIANT } from "../../draft/pool/types";
import {
  applyCardStatOverride,
  applyDeckEntryCardModification,
  resolveDeckEntryCard,
} from "../../card-type-change";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
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
  type OpponentDeckLogArgs,
} from "./opponent-deck";
import { buildCorpusOpponentDeck } from "./corpus-opponent-deck";
import { selectSignatureCards } from "./signature-cards";
import type {
  KnownGoodDecklist,
  DreamsignSignature,
} from "../../data/quest-content";
import { logEvent } from "../../logging";
import type {
  BattleDeckCardDefinition,
  BattleDreamcallerSummary,
  BattleDreamsignSummary,
  BattleEnemyDescriptor,
  BattleInit,
  BattleQuestDeckEntry,
  BattleSignatureCard,
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
   * `poolVariant`). Used to resolve the dreamscape affiliation's probe affinities
   * for opponent construction. Optional: when absent the opponent deck is built
   * without affiliation steering (neutral).
   */
  poolContext?: RunPoolContext;
  /**
   * The corpus of known-good human decklists the opponent deck is selected from
   * (corpus algorithm). When present, the opponent deck is a known-good decklist
   * chosen for the opponent Dreamcaller's signature cards and the dreamscape
   * affiliation, then tuned to the run position. Optional: when absent the
   * opponent deck falls back to the coherent draft simulation.
   */
  knownGoodDecklists?: readonly KnownGoodDecklist[];
  /**
   * Dreamsign signatures (tailored / neutral) the corpus algorithm scores a
   * tuned deck against when assigning the opponent's dreamsign. Optional: when
   * absent the corpus build falls back to a seeded neutral dreamsign.
   */
  dreamsignSignatures?: ReadonlyMap<string, DreamsignSignature>;
  /**
   * The corpus-trained deck-fit model, shared across battles in a session. Drives
   * the opponent's coherent draft, which builds the opponent deck when no
   * {@link knownGoodDecklists} corpus is available. Optional: when absent the
   * enemy deck falls back to a sample of draftable cards from the card database.
   */
  fitModel?: FitModel;
  /**
   * The adapted draft-record corpus. Supplies the real pack structures the
   * coherent-draft fallback picks from. Optional: when empty the enemy deck
   * falls back to a sample of draftable cards from the card database.
   */
  draftRecords?: readonly DraftRecord[];
  seedOverride?: number | null;
  /**
   * When true, the enemy deck is built from the AI Starter deck
   * ({@link buildAiStarterDeck}) instead of the run's steered pool. Used by the
   * `?ai=1` runtime mode that pits the player against the battle AI opponent.
   */
  aiMode?: boolean;
  /**
   * Logging hand-off for the opponent build's reconstruction events
   * (`corpus_opponent_dreamcaller_selected` + `corpus_opponent_deck_constructed`,
   * or the coherent / fallback `opponent_deck_constructed`). When omitted,
   * {@link createBattleInit} emits the events inline at construction time. The
   * battle-fold provider passes a callback that captures the emit thunk and
   * fires it only once the deterministic init is committed to the log, so the
   * log records exactly one opponent deck per battle rather than one per client
   * that speculatively computed an init.
   */
  deferOpponentLog?: (emit: () => void) => void;
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
  // Dreamcaller drawn from the dreamscape's residents, a single dreamsign from
  // the run midpoint onward, and a deck selected by the corpus algorithm — a
  // known-good human decklist matching the Dreamcaller's signature cards and the
  // dreamscape affiliation, tuned to the run position. When no known-good corpus
  // is supplied the deck falls back to the coherent-draft simulation.
  const completionLevelAtStart = state.completionLevel;
  const layerCount = resolveRunLayerCount(state.atlas.layers);
  const currentNode =
    state.currentDreamscape === null
      ? null
      : state.atlas.nodes[state.currentDreamscape] ?? null;
  // The opponent Dreamcaller is one of the dreamscape's RESIDENTS (the corpus
  // algorithm fields native rivals); a neutral / starter dreamscape, or a
  // battle whose dreamscape content is absent, has no residents and the full
  // roster is used. Resolved before selection so it narrows the pick pool.
  const residentDreamcallerIds = resolveDreamscapeResidentIds(
    currentNode,
    input.dreamscapes ?? [],
  );
  const opponentDreamcaller = selectOpponentDreamcaller(
    dreamcallers,
    state.dreamcaller?.id ?? null,
    streams.enemyDescriptor,
    residentDreamcallerIds,
  );
  const opponentDreamsigns = buildOpponentDreamsigns(
    completionLevelAtStart,
    layerCount,
    dreamsignTemplates,
    streams.enemyDescriptor,
  );
  const battleAffiliation = resolveBattleAffiliation(
    currentNode,
    input.dreamscapes ?? [],
    input.affiliations ?? [],
  );
  const enemyDescriptorBase = buildEnemyDescriptor(
    opponentDreamcaller,
    opponentDreamsigns,
    streams.enemyDescriptor.nextFloat,
  );
  const poolSeed = deriveEnemyPoolSeed(seed);
  const aiMode = input.aiMode ?? false;

  // Corpus build (the production opponent algorithm). Its
  // `corpus_opponent_deck_constructed` log is captured into `emitCorpusDeckLog`
  // so it fires with the rest of the opponent reconstruction logs, deferred to
  // transaction-commit in multiplayer.
  let emitCorpusDeckLog: (() => void) | null = null;
  const corpusBuild =
    aiMode || input.knownGoodDecklists === undefined
      ? null
      : buildCorpusOpponentDeck({
          opponentDreamcaller,
          knownGoodDecklists: input.knownGoodDecklists,
          affiliation: battleAffiliation,
          cardDatabase,
          dreamsignSignatures: input.dreamsignSignatures,
          dreamsignTemplates,
          completionLevel: completionLevelAtStart,
          layerCount,
          poolSeed,
          battleEntryKey,
          deferLog: (emit) => {
            emitCorpusDeckLog = emit;
          },
        });

  // Coherent-draft fallback: only when the corpus algorithm produced no deck
  // (no known-good corpus, e.g. tests / minimal content). `null` in aiMode and
  // whenever the corpus build succeeded.
  const coherentBuild =
    aiMode || corpusBuild !== null
      ? null
      : buildOpponentDeck({
          opponentDreamcaller,
          fitModel: input.fitModel,
          draftRecords: input.draftRecords ?? [],
          poolContext: input.poolContext,
          cardDatabase,
          affiliation: battleAffiliation,
          completionLevel: completionLevelAtStart,
          layerCount,
          poolSeed,
        });

  const chosenCards = corpusBuild?.finalCards ?? coherentBuild?.cards ?? null;
  const enemyDeckDefinition = finalizeEnemyDeck(
    chosenCards,
    cardDatabase,
    streams.enemyDeckOrder,
    aiMode,
  ).map(freezeBattleDeckCardDefinition);

  // The opponent's signature cards: the three deck cards most representative of
  // its Dreamcaller's ability, shown on the Battle Start screen. Resolved from
  // the finalized enemy deck back to the catalog `CardData` so the selection can
  // weigh rules text, rarity, and cost. `selectSignatureCards` excludes
  // Legendary cards and prefers non-starter ones, falling back to starters only
  // when the deck has too few non-starter cards (e.g. the AI's all-starter deck
  // in `aiMode`).
  const signatureCandidates = enemyDeckDefinition
    .map((definition) => cardDatabase.get(definition.cardNumber))
    .filter((card): card is CardData => card !== undefined);
  const signatureSelections = selectSignatureCards({
    abilityText: opponentDreamcaller?.renderedText ?? "",
    candidates: signatureCandidates,
    count: 3,
  });
  const enemyDescriptor = freezeBattleEnemyDescriptor({
    ...enemyDescriptorBase,
    signatureCards: signatureSelections.map(
      (selection): BattleSignatureCard => ({
        cardId: selection.cardId,
        cardNumber: selection.cardNumber,
        name: selection.name,
      }),
    ),
  });

  // Assemble the deferred opponent reconstruction logs. The corpus path records
  // the dreamscape-restricted Dreamcaller pick plus the corpus deck build; the
  // fallback / aiMode path records the coherent `opponent_deck_constructed`.
  const emitOpponentLogs = (): void => {
    // The signature-card pick is independent of which opponent-deck algorithm
    // ran, so it is recorded for every battle. `matchedTerms` / `score` make the
    // pick reconstructable: each card is chosen for the glossary keywords it
    // shares with the Dreamcaller's ability (idf-weighted across the deck).
    logEvent("opponent_signature_cards_selected", {
      battleEntryKey,
      dreamscapeId: state.currentDreamscape,
      completionLevel: completionLevelAtStart,
      dreamcallerId: opponentDreamcaller?.id ?? null,
      dreamcallerName: opponentDreamcaller?.name ?? null,
      abilityText: opponentDreamcaller?.renderedText ?? null,
      signatureCards: signatureSelections.map((selection) => ({
        cardId: selection.cardId,
        cardNumber: selection.cardNumber,
        name: selection.name,
        matchedTerms: selection.matchedTerms,
        score: selection.score,
      })),
    });
    if (corpusBuild !== null) {
      logEvent("corpus_opponent_dreamcaller_selected", {
        battleEntryKey,
        dreamscapeId: state.currentDreamscape,
        completionLevel: completionLevelAtStart,
        restrictedToDreamscapeResidents:
          residentDreamcallerIds != null &&
          residentDreamcallerIds.length > 0,
        eligibleDreamcallerIds: residentDreamcallerIds ?? [],
        selectedDreamcallerId: opponentDreamcaller?.id ?? null,
        selectedDreamcallerName: opponentDreamcaller?.name ?? null,
      });
      emitCorpusDeckLog?.();
      return;
    }
    const opponentDeckLogArgs: OpponentDeckLogArgs = {
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
      build: coherentBuild,
      fallbackDeckSize: enemyDeckDefinition.length,
    };
    logOpponentDeckConstructed(opponentDeckLogArgs);
  };
  // Defer the reconstruction logs to the caller when it wants to gate logging on
  // the committed init (multiplayer ensure path); otherwise emit inline so
  // single-call sites and tests still record the events.
  if (input.deferOpponentLog) {
    input.deferOpponentLog(emitOpponentLogs);
  } else {
    emitOpponentLogs();
  }
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
  const definition: DreamwellCardDefinition = {
    id: card.id,
    name: card.name,
    renderedText: card.renderedText,
    energyAdded: card.energyAdded,
    order: card.order,
    cardNumber: card.cardNumber,
    imageNumber: card.imageNumber ?? 0,
  };
  // Firebase rejects `undefined` property values, so only attach `art` when the
  // card has actually been framed. Unframed cards omit the key entirely.
  if (card.art !== undefined) {
    definition.art = card.art;
  }
  return definition;
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
      signatureCards: [],
    };
  }

  const portraitSeed = Math.floor(random() * 1_000_000);
  return {
    id: `enemy:${opponentDreamcaller.id}:${String(portraitSeed)}`,
    name: opponentDreamcaller.name,
    // The Dreamcaller's title (e.g. "Wreckoner") rides the descriptor as its
    // subtitle so the Battle Start name plate and the in-battle side summary can
    // show it under the name.
    subtitle: opponentDreamcaller.title,
    imageNumber: opponentDreamcaller.imageNumber,
    portraitSeed,
    abilityText: opponentDreamcaller.renderedText,
    dreamsigns,
    // Filled in by the caller once the enemy deck is built.
    signatureCards: [],
  };
}

/**
 * The resident Dreamcaller ids of the dreamscape this battle takes place in, so
 * the opponent is one of the region's own rivals (corpus algorithm). Returns
 * `null` when the battle has no dreamscape node, the node's dreamscape content
 * is absent (e.g. battle-engine tests omit `dreamscapes`), or the dreamscape is
 * the residentless starter — in which case selection draws from the full roster.
 */
function resolveDreamscapeResidentIds(
  node: DreamscapeNode | null,
  dreamscapes: readonly DreamscapeContent[],
): readonly string[] | null {
  const dreamscapeId = node?.dreamscapeId;
  if (dreamscapeId == null) return null;
  const dreamscape = dreamscapes.find((d) => d.id === dreamscapeId);
  const residents = dreamscape?.dreamcallerIds ?? null;
  return residents !== null && residents.length > 0 ? residents : null;
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
 * Turns the opponent build's chosen cards (or the AI-mode / fallback path) into
 * the concrete enemy battle deck: the chosen cards padded up to
 * `MIN_BATTLE_DECK_SIZE` and shuffled into the enemy draw order.
 *
 *  - In `aiMode` the deck is the fixed AI Starter deck (3 copies of each
 *    starter), shuffled through the enemy-deck RNG stream.
 *  - Otherwise the corpus (or coherent fallback) build's cards are used. When
 *    `chosenCards` is `null` or empty (no corpus, no fitModel — the simulated
 *    pool resolved to no cards) the deck falls back to a shuffled sample of
 *    draftable cards (non-starter, numeric cost) so the enemy always has a
 *    non-empty deck.
 */
function finalizeEnemyDeck(
  chosenCards: readonly CardData[] | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
  aiMode: boolean,
): BattleDeckCardDefinition[] {
  if (aiMode) {
    return rng
      .shuffle(buildAiStarterDeck(cardDatabase))
      .map(cloneBattleDeckCardDefinition);
  }

  let chosen: CardData[] = chosenCards ? [...chosenCards] : [];

  if (chosen.length === 0) {
    chosen = rng.shuffle(
      Array.from(cardDatabase.values()).filter(
        (card) => !card.isStarter && card.energyCost !== null,
      ),
    );
  }

  const padded = padEnemyDeck(chosen, cardDatabase, rng);

  return rng
    .shuffle(padded.map(createBaseBattleDeckCardDefinition))
    .map(cloneBattleDeckCardDefinition);
}

/**
 * Builds the final enemy deck from a chosen card list: deduplicated so the
 * enemy never runs duplicate cards, and topped up to `MIN_BATTLE_DECK_SIZE`
 * with distinct draftable cards not already present (rather than repeating
 * existing cards) when the chosen list is short. A deduplicated list already at
 * or above the threshold is returned as-is.
 */
function padEnemyDeck(
  cards: readonly CardData[],
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
): CardData[] {
  const seen = new Set<number>();
  const deck: CardData[] = [];
  for (const card of cards) {
    if (seen.has(card.cardNumber)) continue;
    seen.add(card.cardNumber);
    deck.push(card);
  }
  if (deck.length >= MIN_BATTLE_DECK_SIZE) {
    return deck;
  }
  // Top up with distinct draftable cards the deck does not already hold, so the
  // padded deck stays free of duplicates.
  const filler = rng.shuffle(
    Array.from(cardDatabase.values()).filter(
      (card) =>
        !card.isStarter &&
        card.energyCost !== null &&
        !seen.has(card.cardNumber),
    ),
  );
  for (const card of filler) {
    if (deck.length >= MIN_BATTLE_DECK_SIZE) break;
    seen.add(card.cardNumber);
    deck.push(card);
  }
  return deck;
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
  // Resolve the deck entry so the battle card carries the modified cost, spark,
  // and rules text (transfiguration, type/keyword changes, then debug stat
  // overrides) rather than the printed base values.
  const effectiveCard = resolveDeckEntryCard(card, entry);
  const transfigurationDisplay = (() => {
    if (entry.transfiguration === null) return undefined;
    const transfigured = buildTransfigurationDisplay(card, entry.transfiguration);
    const markedCard = applyCardStatOverride(
      applyDeckEntryCardModification(
        { ...transfigured.card, renderedText: transfigured.display.markedText },
        { typeChange: entry.typeChange, keywords: entry.keywordModification },
      ),
      entry.statOverride,
    );
    return { ...transfigured.display, markedText: markedCard.renderedText };
  })();
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
    // Carry multi-cost orb labels through only when present (Firebase rejects an
    // explicit `undefined` in the serialized battle state). A transfiguration
    // that changes the energy cost clears this on the source `CardData`, so the
    // recomputed single orb is shown instead of stale multi-cost orbs.
    ...(effectiveCard.energyCosts ? { energyCosts: effectiveCard.energyCosts } : {}),
    printedSpark: effectiveCard.spark ?? 0,
    isFast: effectiveCard.isFast,
    timing: effectiveCard.isFast ? "fast" : "standard",
    reclaimCost: effectiveCard.reclaimCost ?? null,
    renderedText: effectiveCard.renderedText,
    imageNumber: card.imageNumber,
    // Curated art crop pairs with the printed `imageNumber`, so it is sourced
    // from the base catalog card (a transfiguration can change cost/text but not
    // the rendered image). Omitted when absent: this definition is serialized
    // into the shared battle state, and Firebase rejects an explicit `undefined`.
    ...(card.art ? { art: card.art } : {}),
    transfiguration: entry.transfiguration,
    ...(transfigurationDisplay === undefined ? {} : { transfigurationDisplay }),
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
    ...(definition.transfigurationDisplay === undefined
      ? {}
      : { transfigurationDisplay: Object.freeze({ ...definition.transfigurationDisplay }) }),
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
    signatureCards: Object.freeze(
      descriptor.signatureCards.map((card) => Object.freeze({ ...card })),
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
    imageName: dreamsign.imageName,
    imageAlt: dreamsign.imageAlt,
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
