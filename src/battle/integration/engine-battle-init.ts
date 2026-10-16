// Builds the engine `BattleInit` of a journey battle (D39), which owns the
// battle's game parameters: the seed, both decks, the Dreamwell, the score
// target, the starting side, and the next-battle effects. The journey's
// deck, Avatar, Dreamsigns, and next-battle modifiers are read from folded
// journey state; the opponent's deck, Avatar, and Dreamsigns come from the
// opponent `createBattleInit` built for the same battle.
//
// Every input is a UUID; card names never reach the engine.

import { isDeckEntryTransfigurationRecord } from "../../transfiguration/deck-entry-transfigurations";
import { copyTransfigurationApplications } from "../../engine/transfiguration-application-data";
import type {
  BattleInit as EngineBattleInit,
  DeckEntry as EngineDeckEntry,
  NextBattleEffects,
} from "../../engine";
import { deckModsOf } from "../deck-mods";
import { battleSeed } from "../../engine/state/ids";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { AvatarId, DreamsignId, DreamwellCardId } from "../../types/identifiers";
import type { BattleModifier, DeckEntry, JourneyState } from "../../types/journey";
import type { TransfigurationData } from "../../types/transfiguration-data";
import { journeyOpeningHandGuarantees } from "../../rules/journey/journey-battle-init";
import { journeyModifierRegistry } from "../../rules/journey/modifier-registry";

export interface EngineBattleInitInput {
  /** The battle seed `createBattleInit` resolved. */
  readonly seed: number;
  readonly scoreToWin: number;
  readonly startingSide: NonNullable<EngineBattleInit["startingSide"]>;
  readonly journey: Pick<JourneyState, "deck" | "avatar" | "dreamsigns" | "battleModifiers"> & Partial<Pick<JourneyState, "draftState" | "resolvedPackage" | "typeRemap">>;
  /** The opponent `createBattleInit` built for this battle. */
  readonly enemy: EngineBattleOpponent;
  readonly cardDatabase: ReadonlyMap<number, CardData>;
  readonly transfigurationData: TransfigurationData;
  /** Battle tuning: a shorter journey deck repeats until it reaches this size. */
  readonly minimumDeckSize: number;
  /** The Dreamwell catalog the shared Dreamwell deck is built from. */
  readonly dreamwell: readonly DreamwellCardId[];
}

/** The opponent of a journey battle, by UUID. */
export interface EngineBattleOpponent {
  /** The opponent's deck, in its seeded order. */
  readonly deck: readonly CardId[];
  /** The opponent's Avatar while its ability is active at this layer, else `null`. */
  readonly avatar: AvatarId | null;
  readonly dreamsigns: readonly DreamsignId[];
  /** The full generated fixed pool, independent of the selected opponent deck. */
  readonly draftPool?: readonly CardId[];
}

/**
 * The engine init for a journey battle:
 *
 * - the seed, the score target, and the starting side;
 * - the player's deck: the journey deck padded to the minimum deck size, each
 *   entry with its full variant (amplified flag, transfiguration, deck-entry
 *   modifications);
 * - the opponent's deck, Avatar, and Dreamsigns;
 * - the player's Avatar and Dreamsigns;
 * - the shared Dreamwell;
 * - the player's next-battle effects, from the journey's battle modifiers.
 */
export function createEngineBattleInit(input: EngineBattleInitInput): EngineBattleInit {
  const { journey, enemy } = input;
  const playerDeck = padBattleDeck(journey.deck, input.minimumDeckSize).map((entry) =>
    ({ ...engineDeckEntry(entry, cardOf(input.cardDatabase, entry.cardNumber), input.transfigurationData),
      ...(journey.typeRemap === undefined ? {} : { typeRemap: journey.typeRemap }) }),
  );
  const nextBattle = nextBattleEffects(journey.battleModifiers);
  const guaranteedOpeningHand = journeyOpeningHandGuarantees(journey, (id) => journeyModifierRegistry.lookup(id));
  return {
    seed: battleSeed(String(input.seed)),
    scoreToWin: input.scoreToWin,
    startingSide: input.startingSide,
    decks: {
      player: playerDeck,
      enemy: enemy.deck.map((cardId) => ({ cardId })),
    },
    draftPools: { player: fixedDraftPool(input), enemy: [...(enemy.draftPool ?? [])] },
    dreamwell: [...input.dreamwell],
    avatars: {
      ...(journey.avatar === null ? {} : { player: journey.avatar.id }),
      ...(enemy.avatar === null ? {} : { enemy: enemy.avatar }),
    },
    dreamsigns: {
      player: journey.dreamsigns.map((dreamsign) => dreamsign.id),
      enemy: [...enemy.dreamsigns],
    },
    ...(nextBattle === null ? {} : { nextBattle: { player: nextBattle } }),
    ...(guaranteedOpeningHand.length === 0 ? {} : { guaranteedOpeningHand: { player: guaranteedOpeningHand } }),
  };
}

/**
 * Pads a journey deck up to `minimumDeckSize` for battle by repeating
 * whole-deck copies (e.g. a 9-card deck becomes 27). Padded entries reuse the
 * original entry references, so they share their entry id with the journey
 * deck entry they copy. Decks at or above the threshold (and empty decks) are
 * returned unchanged.
 */
export function padBattleDeck(
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

function cardOf(cardDatabase: ReadonlyMap<number, CardData>, cardNumber: number): CardData {
  const card = cardDatabase.get(cardNumber);
  if (card === undefined) {
    throw new Error(`Missing card data for journey deck entry #${String(cardNumber)}`);
  }
  return card;
}

/** Canonical fixed run copies, resolved by UUID; spent offer stock and journey deck variants are unrelated. */
function fixedDraftPool(input: EngineBattleInitInput): CardId[] {
  const pkg = input.journey.resolvedPackage;
  if (pkg == null) return [];
  const copiesByCard = pkg.draftPoolCopiesByCard;
  if (typeof copiesByCard !== "object" || copiesByCard === null || Array.isArray(copiesByCard)) throw new Error("Invalid fixed draft-pool copies");
  return Object.entries(copiesByCard).flatMap(([key, copies]) => {
    const cardNumber = Number(key);
    if (!Number.isSafeInteger(cardNumber) || String(cardNumber) !== key || !Number.isSafeInteger(copies) || copies < 0) throw new Error("Invalid fixed draft-pool copies");
    const card = input.cardDatabase.get(cardNumber);
    if (card === undefined) throw new Error(`Unknown draft-pool card number ${key}`);
    return Array.from({ length: copies }, () => card.id);
  }).sort();
}

/** A journey deck entry as the engine receives it: its card UUID and full variant (D39). */
export function engineDeckEntry(
  entry: DeckEntry,
  card: CardData,
  _transfigurationData: TransfigurationData,
): EngineDeckEntry {
  if ("transfigurationApplications" in entry) {
    if (!isDeckEntryTransfigurationRecord(entry) || card.cardNumber !== entry.cardNumber) throw new Error("Invalid journey transfiguration bridge record");
    const deckMods = deckModsOf(entry);
    return { cardId: card.id, transfigurationApplications: copyTransfigurationApplications(entry.transfigurationApplications!), ...(deckMods === null ? {} : { deckMods }) };
  }
  const transfiguration = entry.transfiguration;
  const amplified = transfiguration === "Amplified";
  const deckMods = deckModsOf(entry);
  return {
    cardId: card.id,
    ...(amplified ? { amplified } : {}),
    ...(transfiguration === null ? {} : { transfigurations: [transfiguration] }),
    ...(deckMods === null ? {} : { deckMods }),
  };
}

/**
 * The player's next-battle effects: the battle modifiers still active for
 * this battle. Victory decrements them (`END_BATTLE`), so each applies to the
 * battles it names and is then gone. `null` when none applies.
 */
export function nextBattleEffects(modifiers: readonly BattleModifier[]): NextBattleEffects | null {
  const active = modifiers.filter((modifier) => modifier.battlesRemaining > 0);
  const bonus = active.flatMap((modifier) =>
    modifier.kind === "opening_hand_bonus" ? [{ count: modifier.count, filter: null }] : [],
  );
  const events = active.flatMap((modifier) =>
    modifier.kind === "opening_hand_event_draw" ? [{ count: modifier.count, filter: { cardType: "event" as const } }] : [],
  );
  const startingEnergy = active.reduce(
    (total, modifier) => total + (modifier.kind === "starting_energy_bonus" ? modifier.count : 0),
    0,
  );
  const smallerHandAndCostDiscount = active.flatMap((modifier) =>
    modifier.kind === "smaller_hand_and_cost_discount"
      ? [{ openingHandDelta: modifier.openingHandDelta, costReduction: modifier.energyCostReduction }]
      : [],
  );
  const openingHand = [...bonus, ...events];
  if (openingHand.length === 0 && startingEnergy === 0 && smallerHandAndCostDiscount.length === 0) return null;
  return { openingHand, startingEnergy, smallerHandAndCostDiscount };
}
