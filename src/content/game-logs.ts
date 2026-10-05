// Storage tunables for each browser's local games.
//
// `GAME_LOGS` budgets the journey logs kept for local games: when the stored
// logs together exceed the budget, the logs of the games written least recently
// are deleted first; the open game's log is kept.
//
// `GAME_EVENT_PERSISTENCE` paces the retries of a failed event write. A failed
// batch is retried on its own after a delay that doubles with each consecutive
// failure, up to the maximum, until a write succeeds or the game closes.

export const GAME_LOGS = {
  // Total stored JSONL characters across every game's log (about 32 MB).
  maxStoredCharacters: 32_000_000,
} as const;

export const GAME_EVENT_PERSISTENCE = {
  // Delay before retrying after the first consecutive failed write.
  retryInitialDelayMs: 250,
  // Factor applied to the delay for each further consecutive failure.
  retryBackoffFactor: 2,
  // Longest delay between retries.
  retryMaxDelayMs: 8_000,
} as const;
