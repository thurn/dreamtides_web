// Builds the engine `BattleInit` of a journey battle (D39). The journey's
// deck, Avatar, Dreamsigns, and next-battle modifiers are read from folded
// journey state; the opponent's deck, Avatar, and Dreamsigns and the score
// target come from the prototype init `createBattleInit` built for the same
// battle, so both inits describe one opponent.
//
// Every input is a UUID; card names never reach the engine.

import type { BattleInit as EngineBattleInit, DeckEntry as EngineDeckEntry, NextBattleEffects } from "../../engine";
import type { DeckMods } from "../../engine/dsl/types";
import { battleSeed } from "../../engine/state/ids";
import { eligibleTransfigurations } from "../../transfiguration/transfiguration-logic";
import type { CardData } from "../../types/cards";
import type { DreamwellCardId } from "../../types/identifiers";
import type { BattleModifier, DeckEntry, JourneyState } from "../../types/journey";
import type { TransfigurationData } from "../../types/transfiguration-data";
import type { BattleInit } from "../types";
import { padBattleDeck } from "./create-battle-init";

export interface EngineBattleInitInput {
  /** The prototype init `createBattleInit` built for this battle. */
  readonly init: BattleInit;
  readonly journey: Pick<JourneyState, "deck" | "avatar" | "dreamsigns" | "battleModifiers">;
  readonly cardDatabase: ReadonlyMap<number, CardData>;
  readonly transfigurationData: TransfigurationData;
  /** Battle tuning: a shorter journey deck repeats until it reaches this size. */
  readonly minimumDeckSize: number;
  /** The Dreamwell catalog the shared Dreamwell deck is built from. */
  readonly dreamwell: readonly DreamwellCardId[];
}

/**
 * The engine init for a journey battle:
 *
 * - the player's deck: the journey deck padded to the minimum deck size, each
 *   entry with its full variant (amplified flag, transfiguration, deck-entry
 *   modifications);
 * - the opponent's deck, Avatar (when its ability is active at this layer),
 *   and Dreamsigns, from the prototype init;
 * - the player's Avatar and Dreamsigns;
 * - the shared Dreamwell, the score target, and the starting side;
 * - the player's next-battle effects, from the journey's battle modifiers.
 */
export function createEngineBattleInit(input: EngineBattleInitInput): EngineBattleInit {
  const { init, journey } = input;
  const playerDeck = padBattleDeck(journey.deck, input.minimumDeckSize).map((entry) =>
    engineDeckEntry(entry, cardOf(input.cardDatabase, entry.cardNumber), input.transfigurationData),
  );
  const enemyAvatar = init.opponentAbilityActive ? init.enemyDescriptor.avatarId : undefined;
  const nextBattle = nextBattleEffects(journey.battleModifiers);
  return {
    seed: battleSeed(String(init.seed)),
    scoreToWin: init.scoreToWin,
    startingSide: init.startingSide,
    decks: {
      player: playerDeck,
      enemy: init.enemyDeckDefinition.map((definition) => ({ cardId: definition.cardId })),
    },
    dreamwell: [...input.dreamwell],
    avatars: {
      ...(journey.avatar === null ? {} : { player: journey.avatar.id }),
      ...(enemyAvatar === undefined ? {} : { enemy: enemyAvatar }),
    },
    dreamsigns: {
      player: journey.dreamsigns.map((dreamsign) => dreamsign.id),
      enemy: init.enemyDescriptor.dreamsigns.map((dreamsign) => dreamsign.id),
    },
    ...(nextBattle === null ? {} : { nextBattle: { player: nextBattle } }),
  };
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

/** The deck-entry modifications of a journey deck entry, or `null` when it has none. */
function deckModsOf(entry: DeckEntry): DeckMods | null {
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
