/**
 * The single source of truth for the AI deck's card-number families. The deck is
 * fixed and hand-encoded (`battle_ai.md` §"The AI Deck"), so these static sets
 * are exact and every AI module classifies cards by importing them rather than
 * re-declaring the literals.
 *
 * - {@link CHARACTER_CARD_NUMBERS} (510–515): the six Starter CHARACTERS. Playing
 *   one materializes a body into a reserve slot.
 * - {@link EVENT_CARD_NUMBERS} (516–519): the four Starter EVENTS, resolved via
 *   their card model's `chooseTargets` + `play` and sent to the void.
 */
export const CHARACTER_CARD_NUMBERS: ReadonlySet<number> = new Set([
  510, // Nocturne Strummer
  511, // Ringwatcher
  512, // Marked Direwolf
  513, // Runebound Champion
  514, // Final Witness
  515, // Rusted Colossus
]);

export const EVENT_CARD_NUMBERS: ReadonlySet<number> = new Set([
  516, // Flashpoint Detonation
  517, // Glimpse of What Was
  518, // Sign of Arrival
  519, // Worlds Await
]);
