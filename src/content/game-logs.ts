// Storage budget for the journey logs each browser keeps for its local games.
// When the stored logs together exceed the budget, the logs of the games
// written least recently are deleted first; the open game's log is kept.

export const GAME_LOGS = {
  // Total stored JSONL characters across every game's log (about 32 MB).
  maxStoredCharacters: 32_000_000,
} as const;
