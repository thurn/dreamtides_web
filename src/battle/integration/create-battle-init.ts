import type { CardData } from "../../types/cards";
import type { JourneySeed } from "../../types/journey-seed";
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type {
  BattleModifier,
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type {
  BattleEntryKey,
  BattleId,
  DreamAvatarId,
} from "../../types/identifiers";
import {
  applyCardKeywordModification,
  applyCardSparkBonus,
  applyCardStatOverride,
  applyDeckEntryCardModification,
  resolveDeckEntryCard,
} from "../../card-type-change";
import { buildTransfigurationDisplay } from "../../transfiguration/transfiguration-logic";
import { createBattleRngStreams, deriveBattleSeed } from "../random";
import type { BattleRng } from "../random";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { buildAiConfiguredDeck } from "../ai/deck";
import {
  buildOpponentDreamsigns,
  resolveBattleAffiliation,
  resolveRunLayerCount,
  selectOpponentDreamAvatar,
} from "./opponent-deck";
import { buildTideOpponentDeck } from "./tide-opponent-deck";
import { selectSignatureCards } from "./signature-cards";
import { logEvent } from "../../logging";
import type {
  BattleDeckCardDefinition,
  BattleDreamAvatarSummary,
  BattleDreamsignSummary,
  BattleEnemyDescriptor,
  BattleInit,
  BattleJourneyDeckEntry,
  BattleSignatureCard,
  DreamwellCardDefinition,
} from "../types";
import type { DreamwellCard } from "../../data/dreamwell-database";
import type { TutorialTriggerDefinition } from "../../types/tutorial";
import type { EconomyData } from "../../types/economy-data";
import type { TransfigurationData } from "../../types/transfiguration-data";
import {
  resolveBattleAiConfiguration,
  type OpponentsData,
} from "../../types/opponents-data";
import { opponentAbilityIsActive } from "./opponent-deck";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import type { Tides4Tuning } from "../../types/draft-data";
import { parseOpponentId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { serializeSourceTransport } from "../../runtime/localization/runtime";

/**
 * Minimum journey deck size for a battle. A deck below this is padded with
 * whole-deck copies until it reaches the threshold, so a player who has not
 * drafted much still has a workable battle deck.
 */
/**
 * Pads a journey deck up to `MIN_BATTLE_DECK_SIZE` for battle by repeating
 * whole-deck copies (e.g. a 9-card deck becomes 27). Padded entries reuse the
 * original entry references, so they share `sourceDeckEntryId` with the journey
 * deck entry they copy. Decks at or above the threshold (and empty decks) are
 * returned unchanged.
 */
function padBattleDeck(
  deck: readonly JourneyState["deck"][number][],
  minimumDeckSize: number,
): JourneyState["deck"][number][] {
  if (deck.length === 0 || deck.length >= minimumDeckSize) {
    return [...deck];
  }
  const padded = [...deck];
  while (padded.length < minimumDeckSize) {
    padded.push(...deck);
  }
  return padded;
}

export interface CreateBattleInitInput {
  /** Complete authored opponent and battle tuning for this folded battle. */
  opponentsData: OpponentsData;
  /** Authoritative Transfiguration rules and presentation catalog. */
  transfigurationData: TransfigurationData;
  /** Direct battle payout tuning. Omitted only by historical engine fixtures. */
  economyData?: EconomyData;
  battleEntryKey: BattleEntryKey;
  /** Run-scoped identity for logs and automatic intent keys. */
  battleInstanceId?: BattleId;
  site: SiteState;
  state: Pick<
    JourneyState,
    | "atlas"
    | "battleModifiers"
    | "completionLevel"
    | "currentDreamscape"
    | "deck"
    | "dreamAvatar"
    | "dreamsigns"
    | "resolvedPackage"
    | "seed"
  >;
  cardDatabase: ReadonlyMap<number, CardData>;
  dreamAvatars: readonly DreamAvatarContent[];
  /**
   * Dreamscape definitions, used to resolve the affiliation backing the
   * dreamscape this battle takes place in so the opponent deck can lean toward
   * it. Optional so battle-engine tests can omit it; an absent list (or a
   * neutral dreamscape) yields an unbiased opponent build.
   */
  dreamscapes?: readonly DreamscapeContent[];
  /**
   * Thematic affiliations backing dreamscapes (`data/affiliations.toml`).
   * Resolved together with {@link dreamscapes} to bias the opponent deck toward
   * the battle's affiliation. Optional, mirroring {@link dreamscapes}.
   */
  affiliations?: readonly AffiliationContent[];
  /**
   * The shared generated Dreamwell card catalog (`data/dreamwell.toml`). Built into
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
  /** Canonical tide catalog used to build the opponent's Tides4 pool. */
  tides4Decks?: Tides4DecksJson;
  /** Production Tides4 pool tuning. */
  tides4Tuning?: Tides4Tuning;
  seedOverride?: number | null;
  /**
   * When true, the enemy deck is built from the configured journey AI deck.
   * Used by the `?ai=1` runtime mode that pits the player against the battle AI
   * opponent.
   */
  aiMode?: boolean;
  /**
   * Logging hand-off for the opponent build's reconstruction events
   * (`corpus_opponent_dream_avatar_selected` +
   * `corpus_opponent_deck_constructed`). When omitted,
   * {@link createBattleInit} emits the events inline at construction time. The
   * battle-fold provider passes a callback that captures the emit thunk and
   * fires it only once the deterministic init is committed to the log, so the
   * log records exactly one opponent deck per battle rather than one per client
   * that speculatively computed an init.
   */
  deferOpponentLog?: (emit: () => void) => void;
  tutorialTriggers?: readonly TutorialTriggerDefinition[];
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
      case "temporary_nightmare_grant":
      case "opening_hand_bonus":
      case "starting_energy_bonus":
      case "smaller_hand_and_cost_discount":
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
    dreamAvatars,
    dreamsignTemplates = [],
    seedOverride,
  } = input;
  const opponentsData = input.opponentsData;
  const seed = resolveSeed(battleEntryKey, state.seed, seedOverride);
  const streams = createBattleRngStreams(seed);
  const journeyDeckEntries: readonly BattleJourneyDeckEntry[] = Object.freeze(
    state.deck.map((entry) =>
      Object.freeze({
        entryId: entry.entryId,
        cardNumber: entry.cardNumber,
        transfiguration: entry.transfiguration,
        ...(entry.typeChange == null ? {} : { typeChange: entry.typeChange }),
        ...(entry.keywordModification == null
          ? {}
          : { keywordModification: entry.keywordModification }),
        isBane: entry.isBane,
      }),
    ),
  );
  const playerBattleEnergyCostReduction = state.battleModifiers.reduce(
    (total, modifier) =>
      modifier.kind === "smaller_hand_and_cost_discount" &&
      modifier.battlesRemaining > 0
        ? total + modifier.energyCostReduction
        : total,
    0,
  );
  // The journey deck is padded up to the minimum battle deck size before being
  // shuffled into the battle draw order. `journeyDeckEntries` above still
  // mirrors the unpadded journey deck.
  const battleDeck = padBattleDeck(
    state.deck,
    opponentsData.battle.minimumDeckSize,
  );
  const playerDeckOrder = streams.playerDeckOrder
    .shuffle(battleDeck)
    .map((entry) => {
      const card = cardDatabase.get(entry.cardNumber);
      if (card === undefined) {
        throw new Error(
          `Missing card data for journey deck entry #${String(entry.cardNumber)}`,
        );
      }
      return freezeBattleDeckCardDefinition(
        normalizePlayerDeckCard(
          input.transfigurationData,
          entry,
          card,
          playerBattleEnergyCostReduction,
        ),
      );
    });
  // The opponent is built by emulating its DreamAvatar's journey to the
  // equivalent run depth (journeys doc "Battle"): a deterministic opponent
  // DreamAvatar drawn from the dreamscape's residents, a single dreamsign from
  // the configured layer onward, and a deck selected from that avatar's exact
  // Tides4 pool using the shared Tide-affinity ranking.
  const completionLevelAtStart = state.completionLevel;
  const layerCount = resolveRunLayerCount(state.atlas.layers);
  const currentNode =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  // The opponent DreamAvatar is one of the dreamscape's residents. A neutral or
  // starter dreamscape, or a
  // battle whose dreamscape content is absent, has no residents and the full
  // roster is used. Resolved before selection so it narrows the pick pool.
  const residentDreamAvatarIds = resolveDreamscapeResidentIds(
    currentNode,
    input.dreamscapes ?? [],
  );
  const opponentDreamAvatar = selectOpponentDreamAvatar(
    dreamAvatars,
    state.dreamAvatar?.id ?? null,
    streams.enemyDescriptor,
    residentDreamAvatarIds,
  );
  const battleAffiliation = resolveBattleAffiliation(
    currentNode,
    input.dreamscapes ?? [],
    input.affiliations ?? [],
  );
  const poolSeed = deriveEnemyPoolSeed(seed);
  const aiMode = input.aiMode ?? false;

  // Build the production opponent deck. Its reconstruction log is captured
  // so it fires with the rest of the opponent reconstruction logs, deferred to
  // transaction-commit in multiplayer.
  let emitTideDeckLog: (() => void) | null = null;
  const tideBuild =
    aiMode ||
    input.tides4Decks === undefined ||
    input.tides4Tuning === undefined
      ? null
      : buildTideOpponentDeck({
          opponentDreamAvatar,
          affiliation: battleAffiliation,
          cardDatabase,
          dreamsignTemplates,
          completionLevel: completionLevelAtStart,
          poolSeed,
          battleEntryKey: battleEntryKey,
          opponentsContentHash: opponentsData.contentHash,
          progression: opponentsData.progression,
          deckSize: opponentsData.opponentDeckSize,
          tides4Decks: input.tides4Decks,
          tides4Tuning: input.tides4Tuning,
          deferLog: (emit) => {
            emitTideDeckLog = emit;
          },
        });

  const opponentDreamsigns =
    tideBuild?.dreamsign === undefined || tideBuild?.dreamsign === null
      ? buildOpponentDreamsigns(
          completionLevelAtStart,
          opponentsData.progression.dreamsignsFromLayer,
          dreamsignTemplates,
          streams.enemyDescriptor,
        )
      : [tideBuild.dreamsign];
  const enemyDescriptorBase = buildEnemyDescriptor(
    opponentDreamAvatar,
    opponentDreamsigns,
    streams.enemyDescriptor.nextFloat,
  );

  const chosenCards = tideBuild?.finalCards ?? null;
  const enemyDeckDefinition = finalizeEnemyDeck(
    chosenCards,
    cardDatabase,
    streams.enemyDeckOrder,
    aiMode,
    opponentsData,
  ).map(freezeBattleDeckCardDefinition);

  // The opponent's signature cards: the three deck cards most representative of
  // its DreamAvatar's ability, shown on the Battle Start screen. Resolved from
  // the finalized enemy deck back to the catalog `CardData` so the selection can
  // weigh rules text, rarity, and cost. `selectSignatureCards` excludes
  // Legendary cards and prefers non-starter ones, falling back to starters only
  // when the deck has too few non-starter cards (e.g. the AI's all-starter deck
  // in `aiMode`).
  const signatureCandidates = enemyDeckDefinition
    .map((definition) => cardDatabase.get(definition.cardNumber))
    .filter((card): card is CardData => card !== undefined);
  const signatureSelections = selectSignatureCards({
    abilityText: opponentDreamAvatar?.renderedText ?? "",
    candidates: signatureCandidates,
    count: opponentsData.battle.opponentSignatureCardCount,
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

  // Assemble the deferred opponent reconstruction logs.
  const emitOpponentLogs = (): void => {
    // The signature-card pick is independent of opponent deck construction
    // ran, so it is recorded for every battle. `matchedTerms` / `score` make the
    // pick reconstructable: each card is chosen for the glossary keywords it
    // shares with the DreamAvatar's ability (idf-weighted across the deck).
    logEvent("opponent_signature_cards_selected", {
      battleEntryKey: battleEntryKey,
      dreamscapeId: state.currentDreamscape,
      completionLevel: completionLevelAtStart,
      dreamAvatarId: opponentDreamAvatar?.id ?? null,
      dreamAvatarName: opponentDreamAvatar?.name ?? null,
      abilityText: opponentDreamAvatar?.renderedText ?? null,
      signatureCards: signatureSelections.map((selection) => ({
        cardId: selection.cardId,
        cardNumber: selection.cardNumber,
        name: selection.name,
        matchedTerms: selection.matchedTerms,
        score: selection.score,
      })),
    });
    if (tideBuild === null) return;
    logEvent("tide_opponent_dream_avatar_selected", {
      battleEntryKey: battleEntryKey,
      dreamscapeId: state.currentDreamscape,
      completionLevel: completionLevelAtStart,
      restrictedToDreamscapeResidents:
        residentDreamAvatarIds != null && residentDreamAvatarIds.length > 0,
      eligibleDreamAvatarIds: residentDreamAvatarIds ?? [],
      selectedDreamAvatarId: opponentDreamAvatar?.id ?? null,
      selectedDreamAvatarName: opponentDreamAvatar?.name ?? null,
    });
    emitTideDeckLog?.();
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
    opponentsData.dreamwell,
  ).map((definition) => Object.freeze(definition));
  const dreamAvatarSummary = freezeBattleDreamAvatarSummary(state.dreamAvatar);
  const dreamsignSummaries = state.dreamsigns.map(freezeBattleDreamsignSummary);
  const battleReward = input.economyData?.battleReward ?? {
    baseEssence: 100,
    essencePerCompletionLevel: 50,
    minimumEssence: 0,
  };
  const essenceReward = Math.max(
    battleReward.minimumEssence,
    applyBattleRewardModifiers(
      battleReward.baseEssence +
        completionLevelAtStart * battleReward.essencePerCompletionLevel,
      state.battleModifiers,
    ),
  );
  const openingHandAdjustment = state.battleModifiers.reduce(
    (total, modifier) =>
      modifier.kind === "opening_hand_bonus" && modifier.battlesRemaining > 0
        ? total + modifier.count
        : modifier.kind === "smaller_hand_and_cost_discount" &&
            modifier.battlesRemaining > 0
          ? total + modifier.openingHandDelta
          : total,
    0,
  );
  const playerStartingEnergy = state.battleModifiers.reduce(
    (total, modifier) =>
      modifier.kind === "starting_energy_bonus" && modifier.battlesRemaining > 0
        ? total + modifier.count
        : total,
    0,
  );

  // Phase 2 runtime invariants (B-6, C-10): the player always starts and
  // skips the round-one draw. The `BattleInit` field types are widened to
  // `BattleSide` / `boolean` (bug-039) so tests can exercise the no-skip and
  // enemy-first paths without lying to the type system; the runtime values
  // here enforce the phase's invariant.
  const startingSide = opponentsData.battle.startingSide;
  const playerDrawSkipsTurnOne = opponentsData.battle.skipPlayerOpeningDraw;
  const scoreTargetIndex = Math.min(
    Math.max(0, completionLevelAtStart),
    opponentsData.battle.scoreTargets.length - 1,
  );
  const aiConfiguration = resolveBattleAiConfiguration(
    opponentsData,
    "journey",
  );

  return Object.freeze({
    // bug-032: battleId and battleEntryKey were previously the same string,
    // which conflated the cache-bucket identity (entry key) with the
    // session-scope identity (battleId used for logs and completion tracking).
    // A `battle:` prefix keeps them semantically distinct even though they
    // remain 1:1 today; callers should not rely on string equality.
    battleId: parseBattleId(input.battleInstanceId ?? `battle:${battleEntryKey}`),
    battleEntryKey: battleEntryKey,
    seed,
    siteId: site.id,
    dreamscapeId: state.currentDreamscape,
    completionLevelAtStart,
    isFinalBoss: completionLevelAtStart === layerCount - 1,
    essenceReward,
    openingHandSize: Math.max(
      0,
      opponentsData.battle.playerOpeningHandSize + openingHandAdjustment,
    ),
    enemyOpeningHandSize: opponentsData.battle.enemyOpeningHandSize,
    playerStartingEnergy,
    // The opening dreamscape (completion level 0) is a shorter, gentler
    // introduction won at 10 points; every later dreamscape is played to 25.
    scoreToWin: opponentsData.battle.scoreTargets[scoreTargetIndex],
    turnLimit: opponentsData.battle.turnLimit,
    maxEnergyCap: opponentsData.battle.energyCap,
    handLimit: opponentsData.battle.handLimit,
    opponentsContentHash: opponentsData.contentHash,
    opponentAbilityActive: opponentAbilityIsActive(
      completionLevelAtStart,
      opponentsData.progression.abilityActiveFromLayer,
    ),
    aiConfiguration: Object.freeze(aiConfiguration),
    startingSide,
    playerDrawSkipsTurnOne,
    ...(input.tutorialTriggers === undefined
      ? {}
      : {
          tutorialTriggers: Object.freeze([...input.tutorialTriggers]),
        }),
    journeyDeckEntries,
    playerDeckOrder: Object.freeze(playerDeckOrder),
    dreamwellDeck: Object.freeze(dreamwellDeck),
    enemyDescriptor,
    enemyDeckDefinition: Object.freeze(enemyDeckDefinition),
    dreamAvatarSummary,
    dreamsignSummaries: Object.freeze(dreamsignSummaries),
    atlasSnapshot: freezeAtlasSnapshot(state.atlas),
  });
}

/**
 * Number of cards drawn per `order` group (1-4) in each Dreamwell deck cycle.
 * The order-0 starting cards lead the first cycle in addition to these.
 */

/** Order groups, lowest first, that fill each Dreamwell deck cycle. */

/**
 * Minimum length of the pre-built Dreamwell deck. Both players draw one card
 * per turn, and a battle runs at most `turnLimit` (50) turns, so a deck this
 * long is never exhausted in practice; the draw edit still recycles safely if
 * it somehow reaches the end.
 */

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
  config: OpponentsData["dreamwell"],
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
  while (deck.length < config.minimumConstructedLength) {
    const lengthBeforeCycle = deck.length;
    if (firstCycle) {
      for (const order of config.openingOrders) {
        deck.push(...rng.shuffle(byOrder.get(order) ?? []));
      }
      firstCycle = false;
    }
    for (const order of config.recurringOrders) {
      const group = byOrder.get(order) ?? [];
      deck.push(...rng.shuffle(group).slice(0, config.cardsPerRecurringOrder));
    }
    // No order 1-4 cards (and no order-0 cards on the first pass) means the deck
    // cannot grow; stop rather than loop forever on a sparse catalog.
    if (deck.length === lengthBeforeCycle) {
      break;
    }
  }
  return deck;
}

function toDreamwellCardDefinition(
  card: DreamwellCard,
): DreamwellCardDefinition {
  const definition: DreamwellCardDefinition = {
    id: card.id,
    name: card.name,
    renderedText: card.renderedText,
    energyAdded: card.energyAdded,
    order: card.order,
    cardNumber: card.cardNumber,
    imageNumber: card.imageNumber ?? 0,
    automation: (card.automation ?? []).map((prompt) => ({
      ...prompt,
      title: serializeSourceTransport(prompt.title),
      subtitle: serializeSourceTransport(prompt.subtitle),
      instructions: serializeSourceTransport(prompt.instructions),
      ...(prompt.choices === undefined
        ? {}
        : {
            choices: prompt.choices.map((choice) => ({
              ...choice,
              label: serializeSourceTransport(choice.label),
            })),
          }),
    })),
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
  battleEntryKey: BattleEntryKey,
  journeySeed: JourneySeed,
  seedOverride: number | null | undefined,
): number {
  if (seedOverride === undefined || seedOverride === null) {
    return deriveBattleSeed(
      parseBattleEntryKey(`${journeySeed}:${battleEntryKey}`),
    );
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
 * Assembles the enemy descriptor shown before the battle (journeys doc "Battle"):
 * the chosen opponent DreamAvatar's identity and ability text, plus the concrete
 * dreamsigns it carries (none before the run midpoint, one from the midpoint on).
 * The dreamsigns are resolved by the caller via
 * {@link buildOpponentDreamsigns} so the midpoint gating lives in one place;
 * this only renders them for display. Falls back to a synthetic descriptor when
 * no opponent DreamAvatar is available.
 */
export function buildEnemyDescriptor(
  opponentDreamAvatar: DreamAvatarContent | null,
  dreamsignTemplates: readonly DreamsignTemplate[],
  random: () => number,
): BattleEnemyDescriptor {
  const dreamsigns: BattleDreamsignSummary[] = dreamsignTemplates.map(
    (template) => ({
      id: template.id,
      name: template.name,
      effectDescription: template.effectDescription,
      imageName: template.imageName,
      imageAlt: template.imageAlt,
    }),
  );

  if (opponentDreamAvatar === null) {
    return {
      id: parseOpponentId("enemy:fallback"),
      name: "Spectral Rival",
      subtitle: "Battlefield Projection",
      imageNumber: "001",
      portraitSeed: 0,
      abilityText: "A synthetic opponent assembled for a prototype battle.",
      dreamsigns,
      signatureCards: [],
    };
  }

  const portraitSeed = Math.floor(random() * 1_000_000);
  return {
    id: parseOpponentId(`enemy:${opponentDreamAvatar.id}:${String(portraitSeed)}`),
    name: opponentDreamAvatar.name,
    // The DreamAvatar's title (e.g. "Wreckoner") rides the descriptor as its
    // subtitle so the Battle Start name plate and the in-battle side summary can
    // show it under the name.
    subtitle: opponentDreamAvatar.title,
    imageNumber: opponentDreamAvatar.imageNumber,
    portraitSeed,
    abilityText: opponentDreamAvatar.renderedText,
    dreamsigns,
    // Filled in by the caller once the enemy deck is built.
    signatureCards: [],
  };
}

/**
 * The resident DreamAvatar ids of the dreamscape this battle takes place in, so
 * the opponent is one of the region's own rivals (corpus algorithm). Returns
 * `null` when the battle has no dreamscape node, the node's dreamscape content
 * is absent (e.g. battle-engine tests omit `dreamscapes`), or the dreamscape is
 * the residentless starter — in which case selection draws from the full roster.
 */
function resolveDreamscapeResidentIds(
  node: DreamscapeNode | null,
  dreamscapes: readonly DreamscapeContent[],
): readonly DreamAvatarId[] | null {
  const dreamscapeId = node?.dreamscapeId;
  if (dreamscapeId == null) return null;
  const dreamscape = dreamscapes.find((d) => d.id === dreamscapeId);
  const residents = dreamscape?.dreamAvatarIds ?? null;
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
 * Turns the opponent build's chosen cards (or the AI-mode / fixture path) into
 * the concrete enemy battle deck: the chosen cards padded up to
 * `MIN_BATTLE_DECK_SIZE` and shuffled into the enemy draw order.
 *
 *  - In `aiMode` the deck is the fixed AI Starter deck (3 copies of each
 *    starter), shuffled through the enemy-deck RNG stream.
 *  - Otherwise the selected corpus deck's cards are used. When `chosenCards`
 *    is `null` or empty (minimal test content), the deck uses a shuffled sample of
 *    draftable cards (non-starter, numeric cost) so the enemy always has a
 *    non-empty deck.
 */
function finalizeEnemyDeck(
  chosenCards: readonly CardData[] | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
  aiMode: boolean,
  opponentsData: OpponentsData,
): BattleDeckCardDefinition[] {
  if (aiMode) {
    return rng
      .shuffle(buildAiConfiguredDeck(cardDatabase, opponentsData.journeyAiDeck))
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

  const padded = padEnemyDeck(
    chosen,
    cardDatabase,
    rng,
    opponentsData.battle.minimumDeckSize,
  );

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
  minimumDeckSize: number,
): CardData[] {
  const seen = new Set<number>();
  const deck: CardData[] = [];
  for (const card of cards) {
    if (seen.has(card.cardNumber)) continue;
    seen.add(card.cardNumber);
    deck.push(card);
  }
  if (deck.length >= minimumDeckSize) {
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
    if (deck.length >= minimumDeckSize) break;
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
  transfigurationData: TransfigurationData,
  entry: JourneyState["deck"][number],
  card: CardData,
  battleEnergyCostReduction = 0,
): BattleDeckCardDefinition {
  // Resolve the deck entry so the battle card carries the modified cost, spark,
  // and rules text (transfiguration, type/keyword changes, persistent spark,
  // then debug stat overrides) rather than the printed base values.
  const effectiveCard = applyCardKeywordModification(
    resolveDeckEntryCard(transfigurationData, card, entry),
    battleEnergyCostReduction > 0
      ? { energyCostReduction: battleEnergyCostReduction }
      : undefined,
  );
  const transfigurationDisplay = (() => {
    if (entry.transfiguration === null) return undefined;
    const transfigured = buildTransfigurationDisplay(
      transfigurationData,
      card,
      entry.transfiguration,
    );
    const markedCard = applyCardStatOverride(
      applyCardSparkBonus(
        applyDeckEntryCardModification(
          {
            ...transfigured.card,
            renderedText: transfigured.display.markedText,
          },
          { typeChange: entry.typeChange, keywords: entry.keywordModification },
        ),
        entry.sparkBonus,
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
    battleCardKind:
      effectiveCard.cardType === "Character" ? "character" : "event",
    subtype: effectiveCard.subtype,
    energyCost: effectiveCard.energyCost ?? 0,
    printedEnergyCost: effectiveCard.energyCost,
    // Carry multi-cost orb labels through only when present (Firebase rejects an
    // explicit `undefined` in the serialized battle state). A transfiguration
    // that changes the energy cost clears this on the source `CardData`, so the
    // recomputed single orb is shown instead of stale multi-cost orbs.
    ...(effectiveCard.energyCosts
      ? { energyCosts: effectiveCard.energyCosts }
      : {}),
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
      : {
          transfigurationDisplay: Object.freeze({
            ...definition.transfigurationDisplay,
          }),
        }),
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

function freezeBattleDreamAvatarSummary(
  dreamAvatar: JourneyState["dreamAvatar"],
): BattleDreamAvatarSummary | null {
  if (dreamAvatar === null) {
    return null;
  }

  return Object.freeze({
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    title: dreamAvatar.title,
    renderedText: dreamAvatar.renderedText,
    imageNumber: dreamAvatar.imageNumber,
    ...(dreamAvatar.portraitFocus === undefined
      ? {}
      : {
          portraitFocus: Object.freeze({ ...dreamAvatar.portraitFocus }),
        }),
  });
}

function freezeBattleDreamsignSummary(
  dreamsign: JourneyState["dreamsigns"][number],
): BattleDreamsignSummary {
  return Object.freeze({
    id: dreamsign.id,
    name: dreamsign.name,
    effectDescription: dreamsign.effectDescription,
    imageName: dreamsign.imageName,
    imageAlt: dreamsign.imageAlt,
  });
}

function freezeAtlasSnapshot(
  atlas: JourneyState["atlas"],
): JourneyState["atlas"] {
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

  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}
