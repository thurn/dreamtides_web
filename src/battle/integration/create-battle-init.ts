import type { CardData, Rarity } from "../../types/cards";
import type { JourneySeed } from "../../types/journey-seed";
import type {
  AffiliationContent,
  AvatarContent,
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
  AvatarId,
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
import {
  buildOpponentDreamsigns,
  resolveBattleAffiliation,
  selectOpponentAvatar,
} from "./opponent-deck";
import { buildTideOpponentDeck } from "./tide-opponent-deck";
import { selectSignatureCards } from "./signature-cards";
import { createEngineBattleInit, padBattleDeck } from "./engine-battle-init";
import { logEvent } from "../../logging";
import type {
  BattleDeckCardDefinition,
  BattleAvatarSummary,
  BattleDreamsignSummary,
  BattleEnemyDescriptor,
  BattleSignatureCard,
  DreamwellCardDefinition,
} from "../types";
import type { DreamwellCard } from "../../data/dreamwell-database";
import type { EconomyData } from "../../types/economy-data";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type { OpponentsData } from "../../types/opponents-data";
import { opponentAbilityIsActive } from "./opponent-deck";
import type { Tides4DecksJson } from "../../draft/pool/tides4-io";
import type { Tides4Tuning } from "../../types/draft-data";
import type { JourneyBattleInit } from "../../rules/battle/fold";
import type { BattleStart } from "../../rules/battle/journey-battle";
import { parseOpponentId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";

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
    | "avatar"
    | "dreamsigns"
    | "seed"
  >;
  cardDatabase: ReadonlyMap<number, CardData>;
  avatars: readonly AvatarContent[];
  /**
   * Dreamscape definitions, used to resolve the affiliation backing the
   * dreamscape this battle takes place in so the opponent deck can lean toward
   * it. Optional so battle-engine tests can omit it; an absent list (or a
   * neutral dreamscape) yields an unbiased opponent build.
   */
  dreamscapes?: readonly DreamscapeContent[];
  /**
   * Thematic affiliations backing dreamscapes (`src/content/affiliations.ts`).
   * Resolved together with {@link dreamscapes} to bias the opponent deck toward
   * the battle's affiliation. Optional, mirroring {@link dreamscapes}.
   */
  affiliations?: readonly AffiliationContent[];
  /**
   * The shared Dreamwell card catalog (`src/content/dreamwell/`) the engine
   * builds the battle's Dreamwell deck from. Optional so battle tests can
   * omit it; an empty list yields an empty Dreamwell deck.
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
   * Logging hand-off for the opponent build's reconstruction events
   * (`corpus_opponent_avatar_selected` +
   * `corpus_opponent_deck_constructed`). When omitted,
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
      case "temporary_nightmare_grant":
      case "opening_hand_bonus":
      case "opening_hand_event_draw":
      case "starting_energy_bonus":
      case "smaller_hand_and_cost_discount":
        break;
    }

    reward = Math.max(0, reward);
  }

  return reward;
}

/**
 * A journey battle at `input.site`: its journey init and the engine init of
 * the same battle. Every random choice comes from `BattleRng` streams keyed
 * by the battle seed, so the same journey and site always build the same
 * battle.
 */
export function createBattleInit(input: CreateBattleInitInput): BattleStart {
  const {
    battleEntryKey,
    site,
    state,
    cardDatabase,
    avatars,
    dreamsignTemplates = [],
    seedOverride,
  } = input;
  const opponentsData = input.opponentsData;
  const seed = resolveSeed(battleEntryKey, state.seed, seedOverride);
  const streams = createBattleRngStreams(seed);
  const playerBattleEnergyCostReduction = state.battleModifiers.reduce(
    (total, modifier) =>
      modifier.kind === "smaller_hand_and_cost_discount" &&
      modifier.battlesRemaining > 0
        ? total + modifier.energyCostReduction
        : total,
    0,
  );
  // The display definitions of the player's deck: the journey deck padded up
  // to the minimum battle deck size, in a seeded shuffled order.
  const playerCardDefinitions = streams.playerDeckOrder
    .shuffle(padBattleDeck(state.deck, opponentsData.battle.minimumDeckSize))
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
  // The opponent is built by emulating its Avatar's journey to the
  // equivalent run depth (journeys doc "Battle"): a deterministic opponent
  // Avatar drawn from the dreamscape's residents, a single dreamsign from
  // the configured layer onward, and a deck selected from that avatar's exact
  // Tides4 pool using the shared Tide-affinity ranking.
  const completionLevelAtStart = state.completionLevel;
  const currentNode =
    state.currentDreamscape === null
      ? null
      : (state.atlas.nodes[state.currentDreamscape] ?? null);
  // The opponent Avatar is one of the dreamscape's residents. A neutral or
  // starter dreamscape, or a
  // battle whose dreamscape content is absent, has no residents and the full
  // roster is used. Resolved before selection so it narrows the pick pool.
  const residentAvatarIds = resolveDreamscapeResidentIds(
    currentNode,
    input.dreamscapes ?? [],
  );
  const opponentAvatar = selectOpponentAvatar(
    avatars,
    state.avatar?.id ?? null,
    streams.enemyDescriptor,
    residentAvatarIds,
  );
  const battleAffiliation = resolveBattleAffiliation(
    currentNode,
    input.dreamscapes ?? [],
    input.affiliations ?? [],
  );
  const poolSeed = deriveEnemyPoolSeed(seed);

  // Build the production opponent deck. Its reconstruction log is captured
  // so it fires with the rest of the opponent reconstruction logs, deferred to
  // transaction-commit in multiplayer.
  let emitTideDeckLog: (() => void) | null = null;
  const tideBuild =
    input.tides4Decks === undefined ||
    input.tides4Tuning === undefined
      ? null
      : buildTideOpponentDeck({
          opponentAvatar,
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
    opponentAvatar,
    opponentDreamsigns,
    streams.enemyDescriptor.nextFloat,
  );

  const chosenCards = tideBuild?.finalCards ?? null;
  const enemyDeckDefinition = finalizeEnemyDeck(
    chosenCards,
    cardDatabase,
    streams.enemyDeckOrder,
    opponentsData,
  ).map(freezeBattleDeckCardDefinition);

  // The opponent's signature cards: the three deck cards most representative of
  // its Avatar's ability, shown on the Battle Start screen. Resolved from
  // the finalized enemy deck back to the catalog `CardData` so the selection can
  // weigh rules text, rarity, and cost. `selectSignatureCards` excludes
  // Legendary cards and prefers non-starter ones, falling back to starters only
  // when the deck has too few non-starter cards.
  const signatureCandidates = enemyDeckDefinition
    .map((definition) => cardDatabase.get(definition.cardNumber))
    .filter((card): card is CardData => card !== undefined);
  const signatureSelections = selectSignatureCards({
    abilityText: opponentAvatar?.renderedText ?? "",
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
    // shares with the Avatar's ability (idf-weighted across the deck).
    logEvent("opponent_signature_cards_selected", {
      battleEntryKey: battleEntryKey,
      dreamscapeId: state.currentDreamscape,
      completionLevel: completionLevelAtStart,
      avatarId: opponentAvatar?.id ?? null,
      avatarName: opponentAvatar?.name ?? null,
      abilityText: opponentAvatar?.renderedText ?? null,
      signatureCards: signatureSelections.map((selection) => ({
        cardId: selection.cardId,
        cardNumber: selection.cardNumber,
        name: selection.name,
        matchedTerms: selection.matchedTerms,
        score: selection.score,
      })),
    });
    if (tideBuild === null) return;
    logEvent("tide_opponent_avatar_selected", {
      battleEntryKey: battleEntryKey,
      dreamscapeId: state.currentDreamscape,
      completionLevel: completionLevelAtStart,
      restrictedToDreamscapeResidents:
        residentAvatarIds != null && residentAvatarIds.length > 0,
      eligibleAvatarIds: residentAvatarIds ?? [],
      selectedAvatarId: opponentAvatar?.id ?? null,
      selectedAvatarName: opponentAvatar?.name ?? null,
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
  const opponentAbilityActive = opponentAbilityIsActive(
    completionLevelAtStart,
    opponentsData.progression.abilityActiveFromLayer,
  );
  // The opening dreamscape (completion level 0) is a shorter, gentler
  // introduction won at 10 points; every later dreamscape is played to 25.
  const scoreTargetIndex = Math.min(
    Math.max(0, completionLevelAtStart),
    opponentsData.battle.scoreTargets.length - 1,
  );

  const init: JourneyBattleInit = Object.freeze({
    battleId: parseBattleId(
      input.battleInstanceId ?? `battle:${battleEntryKey}`,
    ),
    siteId: site.id,
    nodeId: state.currentDreamscape,
    completionLevelAtStart,
    essenceReward,
    opponentAbilityActive,
    enemyDescriptor,
    avatarSummary: freezeBattleAvatarSummary(state.avatar),
    cardDefinitions: Object.freeze([
      ...playerCardDefinitions,
      ...enemyDeckDefinition,
    ]),
  });
  const engineInit = createEngineBattleInit({
    seed,
    scoreToWin: opponentsData.battle.scoreTargets[scoreTargetIndex],
    startingSide: opponentsData.battle.startingSide,
    journey: state,
    enemy: {
      deck: enemyDeckDefinition.map((definition) => definition.cardId),
      avatar: opponentAbilityActive
        ? (enemyDescriptor.avatarId ?? null)
        : null,
      dreamsigns: enemyDescriptor.dreamsigns.map((dreamsign) => dreamsign.id),
    },
    cardDatabase,
    transfigurationData: input.transfigurationData,
    minimumDeckSize: opponentsData.battle.minimumDeckSize,
    dreamwell: (input.dreamwellCards ?? []).map((card) => card.id),
  });
  return { init, engineInit };
}

/** The display definition of a Dreamwell card. */
export function dreamwellCardDefinition(
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
  };
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
 * the chosen opponent Avatar's identity and ability text, plus the concrete
 * dreamsigns it carries (none before the run midpoint, one from the midpoint on).
 * The dreamsigns are resolved by the caller via
 * {@link buildOpponentDreamsigns} so the midpoint gating lives in one place;
 * this only renders them for display. Falls back to a synthetic descriptor when
 * no opponent Avatar is available.
 */
export function buildEnemyDescriptor(
  opponentAvatar: AvatarContent | null,
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

  if (opponentAvatar === null) {
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
    id: parseOpponentId(`enemy:${opponentAvatar.id}:${String(portraitSeed)}`),
    avatarId: opponentAvatar.id,
    name: opponentAvatar.name,
    // The Avatar's title (e.g. "Wreckoner") rides the descriptor as its
    // subtitle so the Battle Start name plate and the in-battle side summary can
    // show it under the name.
    subtitle: opponentAvatar.title,
    imageNumber: opponentAvatar.imageNumber,
    portraitSeed,
    abilityText: opponentAvatar.renderedText,
    dreamsigns,
    // Filled in by the caller once the enemy deck is built.
    signatureCards: [],
  };
}

/**
 * The resident Avatar ids of the dreamscape this battle takes place in, so
 * the opponent is one of the region's own rivals (corpus algorithm). Returns
 * `null` when the battle has no dreamscape node, the node's dreamscape content
 * is absent (e.g. battle-engine tests omit `dreamscapes`), or the dreamscape is
 * the residentless starter — in which case selection draws from the full roster.
 */
function resolveDreamscapeResidentIds(
  node: DreamscapeNode | null,
  dreamscapes: readonly DreamscapeContent[],
): readonly AvatarId[] | null {
  const dreamscapeId = node?.dreamscapeId;
  if (dreamscapeId == null) return null;
  const dreamscape = dreamscapes.find((d) => d.id === dreamscapeId);
  const residents = dreamscape?.avatarIds ?? null;
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
 * Turns the opponent build's chosen cards (or the fixture path) into the
 * concrete enemy battle deck: the chosen cards padded up to
 * `MIN_BATTLE_DECK_SIZE` and shuffled into the enemy draw order. When
 * `chosenCards` is `null` or empty (minimal test content), the deck uses a
 * shuffled sample of draftable cards (non-starter, numeric cost) so the enemy
 * always has a non-empty deck.
 */
function finalizeEnemyDeck(
  chosenCards: readonly CardData[] | null,
  cardDatabase: ReadonlyMap<number, CardData>,
  rng: BattleRng,
  opponentsData: OpponentsData,
): BattleDeckCardDefinition[] {
  let chosen: CardData[] = chosenCards ? [...chosenCards] : [];

  if (chosen.length === 0) {
    chosen = rng.shuffle(
      Array.from(cardDatabase.values()).filter(
        (card) => isEnemyFillerCard(card) && card.energyCost !== null,
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
        isEnemyFillerCard(card) &&
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

/**
 * Rarities that identify authored-flow cards (Starter, Tutorial, Special:
 * Nightmares, Contemplation, the tutorial cards), which never enter a normal
 * draft pool and so never fill an opponent deck.
 */
const NON_POOL_RARITIES: ReadonlySet<Rarity> = new Set(["Starter", "Tutorial", "Special"]);

/** Whether a catalog card may fill a short opponent deck: a draftable, non-starter card. */
function isEnemyFillerCard(card: CardData): boolean {
  return !card.isStarter && (card.rarity === undefined || !NON_POOL_RARITIES.has(card.rarity));
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
    // Carry multi-cost orb labels through only when present (the folded battle
    // state must stay JSON-safe, with no explicit `undefined`). A transfiguration
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
    // the rendered image). Omitted when absent: this definition is part of the
    // folded battle state, which must stay JSON-safe (no explicit `undefined`).
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

function freezeBattleAvatarSummary(
  avatar: JourneyState["avatar"],
): BattleAvatarSummary | null {
  if (avatar === null) {
    return null;
  }

  return Object.freeze({
    id: avatar.id,
    name: avatar.name,
    title: avatar.title,
    renderedText: avatar.renderedText,
    imageNumber: avatar.imageNumber,
    ...(avatar.portraitFocus === undefined
      ? {}
      : {
          portraitFocus: Object.freeze({ ...avatar.portraitFocus }),
        }),
  });
}
