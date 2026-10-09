// Storage tunables for each browser's local games.
//
// `GAME_LOGS` budgets the journey logs kept for local games: when the stored
// logs together exceed the budget, the logs of the games written least recently
// are deleted first. When the open game's log alone exceeds the budget, its
// oldest lines are deleted until it fits the retained share of the budget. A
// failed log write is retried on its own after a delay that doubles with each
// consecutive failure, up to the maximum, for at most the given number of
// retries; the next captured record, flush, or close tries again after that.
//
// `GAME_EVENT_PERSISTENCE` paces the retries of a failed event write. A failed
// batch is retried on its own after a delay that doubles with each consecutive
// failure, up to the maximum, until a write succeeds or the game closes.

export const GAME_LOGS = {
  // Total stored JSONL characters across every game's log (about 32 MB).
  maxStoredCharacters: 32_000_000,
  // Share of the budget the open game's log keeps when it alone exceeds the
  // budget. The headroom spaces trims apart, since each trim reads the log.
  trimRetainedFraction: 0.75,
  // Delay before retrying after the first consecutive failed write.
  retryInitialDelayMs: 250,
  // Factor applied to the delay for each further consecutive failure.
  retryBackoffFactor: 2,
  // Longest delay between retries.
  retryMaxDelayMs: 8_000,
  // Retries after a failed write before waiting for the next record.
  maxRetries: 8,
} as const;

export const GAME_EVENT_PERSISTENCE = {
  // Delay before retrying after the first consecutive failed write.
  retryInitialDelayMs: 250,
  // Factor applied to the delay for each further consecutive failure.
  retryBackoffFactor: 2,
  // Longest delay between retries.
  retryMaxDelayMs: 8_000,
} as const;
