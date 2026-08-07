/** Rank in the standard 52-card deck shared by Gravok's casino games. */
export type StandardPlayingCardRank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

/** Suit in the standard 52-card deck shared by Gravok's casino games. */
export type StandardPlayingCardSuit =
  | "clubs"
  | "diamonds"
  | "hearts"
  | "spades";

/** One rank-and-suit entry in a standard playing-card deck. */
export interface StandardPlayingCard {
  rank: StandardPlayingCardRank;
  suit: StandardPlayingCardSuit;
}

/** The three wager choices in Gravok's Three-Gate Wager. */
export type GravokGateId = "six" | "nine" | "jack";

/** Stable game ids persisted by Gamble site runtimes. */
export type GambleGameId =
  | "gravok-three-gate-wager"
  | "tidemark-ladder-climb"
  | "starway-stairs"
  | "four-suit-reprise"
  | "blackjack";

/** One-based attempt number in Tidemark Ladder Climb. */
export type TidemarkLadderClimbAttemptNumber = 1 | 2 | 3 | 4;

/** One-based tier number in Starway Stairs. */
export type StarwayStairsTierNumber = 1 | 2 | 3;
