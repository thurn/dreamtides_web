// Core battle setup rules shared by player and opponent controllers.

export const BATTLE = {
  // Minimum number of cards prepared battle decks must contain. Short player
  // decks repeat their whole deck; short opponent decks add distinct cards.
  minimumDeckSize: 25,
  // Number of cards dealt to the player at the start of a battle, before any
  // active journey modifiers adjust the player's hand.
  playerOpeningHandSize: 5,
  // Number of cards dealt to the opponent at the start of a battle.
  enemyOpeningHandSize: 5,
  // Points needed to win at each zero-indexed Atlas completion level. Battles
  // beyond the last listed level continue using the final target.
  scoreTargets: [10, 25],
  // Highest numbered battle round. Advancing beyond it without a winner ends
  // the battle in a draw.
  turnLimit: 50,
  // Maximum energy available to either side under the standard energy ramp.
  energyCap: 10,
  // Maximum cards a side keeps when end-of-turn automation discards excess
  // cards from its hand.
  handLimit: 10,
  // Consecutive automatic game actions after which a battle that no player can
  // stop ends in a draw (rules § Mandatory Loops).
  resolutionCap: 100000,
  // Whether a prompt with exactly one legal answer (a forced choice) is
  // answered automatically instead of being asked; the answer is recorded.
  autoAnswerForcedPrompts: true,
  // Side that takes the first turn. Valid values are `Player` and `Enemy`.
  startingSide: "player",
  // Whether the player omits the normal Draw phase on their first turn.
  skipPlayerOpeningDraw: true,
  // Number of representative opponent deck cards featured on the Battle Start
  // screen as that Avatar's signature cards.
  opponentSignatureCardCount: 3,
  reward: {
    baseEssence: 100,
    essencePerCompletionLevel: 50,
    minimumEssence: 0,
  },
};
