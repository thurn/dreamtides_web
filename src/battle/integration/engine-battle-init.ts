// Builds the engine `BattleInit` of a journey battle (D39), which owns the
// battle's game parameters: the seed, both decks, the Dreamwell, the score
// target, the starting side, and the next-battle effects. The journey's
// deck, Avatar, Dreamsigns, and next-battle modifiers are read from folded
// journey state; the opponent's deck, Avatar, and Dreamsigns come from the
// opponent `createBattleInit` built for the same battle.
//
// Every input is a UUID; card names never reach the engine.

import type {
  BattleInit as EngineBattleInit,
  DeckEntry as EngineDeckEntry,
  NextBattleEffects,
} from "../../engine";
import type { DeckMods } from "../../engine/dsl/types";
import { battleSeed } from "../../engine/state/ids";
import { eligibleTransfigurations } from "../../transfiguration/transfiguration-logic";
import type { CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { AvatarId, DreamsignId, DreamwellCardId } from "../../types/identifiers";
import type { BattleModifier, DeckEntry, JourneyState } from "../../types/journey";
import type { TransfigurationData } from "../../types/transfiguration-data";

export interface EngineBattleInitInput {
  /** The battle seed `createBattleInit` resolved. */
  readonly seed: number;
  readonly scoreToWin: number;
  readonly startingSide: NonNullable<EngineBattleInit["startingSide"]>;
  readonly journey: Pick<JourneyState, "deck" | "avatar" | "dreamsigns" | "battleModifiers">;
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
    engineDeckEntry(entry, cardOf(input.cardDatabase, entry.cardNumber), input.transfigurationData),
  );
  const nextBattle = nextBattleEffects(journey.battleModifiers);
  return {
    seed: battleSeed(String(input.seed)),
    scoreToWin: input.scoreToWin,
    startingSide: input.startingSide,
    decks: {
      player: playerDeck,
      enemy: enemy.deck.map((cardId) => ({ cardId })),
    },
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

/** A journey deck entry as the engine receives it: its card UUID and full variant (D39). */
export function engineDeckEntry(
  entry: DeckEntry,
  card: CardData,
  transfigurationData: TransfigurationData,
): EngineDeckEntry {
  const transfiguration = entry.transfiguration;
  const amplified =
    transfiguration === "Amplified" ||
    (transfiguration === "Perfected" && eligibleTransfigurations(transfigurationData, card).includes("Amplified"));
  const deckMods = deckModsOf(entry);
  return {
    cardId: card.id,
    ...(amplified ? { amplified } : {}),
    ...(transfiguration === null ? {} : { transfigurations: [transfiguration] }),
    ...(deckMods === null ? {} : { deckMods }),
  };
}

/**
 * The deck-entry modifications of a journey deck entry, or `null` when it has
 * none. A dealt card definition carries the same type and keyword changes, so
 * the battle screen reads its display variant through this too.
 */
export function deckModsOf(entry: Pick<DeckEntry, "sparkBonus" | "keywordModification" | "typeChange">): DeckMods | null {
  const keywords = entry.keywordModification ?? null;
  const reclaim = wholeOrNull(keywords?.setReclaim ?? keywords?.reclaim);
  const costReduction = Math.max(0, wholeOrNull(keywords?.energyCostReduction) ?? 0);
  const mods: DeckMods = {
    sparkBonus: wholeOrNull(entry.sparkBonus) ?? 0,
    costReduction,
    fast: keywords?.fast === true,
    reclaim: reclaim === null || reclaim < 0 ? null : reclaim,
    typeChange:
      entry.typeChange == null
        ? null
        : {
            cardType: entry.typeChange.cardType === "Character" ? "character" : "event",
            subtype: entry.typeChange.subtype,
          },
  };
  const modified =
    mods.sparkBonus !== 0 || mods.costReduction !== 0 || mods.fast || mods.reclaim !== null || mods.typeChange !== null;
  return modified ? mods : null;
}

function wholeOrNull(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : Math.trunc(value);
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
