// Counts how often each card appears in the deck lists of the adapted draft
// record corpus, keyed by the card's stable cards_v2 UUID.
//
// The adapted draft records (`docs/draft_records_adapted/*.jsonc`) record each
// seat's built deck in its `mainboard` array, one `<uuid>` string per card with
// an inline `// <Card Name>` comment. "Popularity" is the number of mainboard
// appearances of a card's UUID across every seat of every record — a direct
// measure of how often players run that card in their finished decks.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CARD_ID_RE, stripJsonComments } from "./card-refs.mjs";

/** Repository-relative location of the adapted draft record corpus. */
export const DEFAULT_DRAFT_RECORDS_DIR = join("docs", "draft_records_adapted");

// The corpus is static at runtime, so the per-directory tally is computed once
// and memoized by its absolute path; every editor card load reuses the result.
const popularityCache = new Map();

/**
 * Tally mainboard appearances by card UUID across every adapted draft record in
 * `dir` (an absolute path). Returns a `Map<uuid, count>`; a card absent from the
 * corpus simply has no entry. A missing directory yields an empty map so callers
 * (such as test fixtures without a corpus) degrade to zero popularity rather than
 * throwing. Files that fail to parse are skipped so one malformed record cannot
 * sink the whole tally.
 */
export function readCardPopularity(dir) {
  const cached = popularityCache.get(dir);
  if (cached !== undefined) {
    return cached;
  }

  const counts = new Map();
  if (existsSync(dir)) {
    for (const filename of readdirSync(dir)
      .filter((file) => file.endsWith(".jsonc"))
      .sort()) {
      let record;
      try {
        record = JSON.parse(
          stripJsonComments(readFileSync(join(dir, filename), "utf8")),
        );
      } catch {
        continue;
      }
      if (!Array.isArray(record.seats)) {
        continue;
      }
      for (const seat of record.seats) {
        if (!Array.isArray(seat.mainboard)) {
          continue;
        }
        for (const token of seat.mainboard) {
          if (typeof token === "string" && CARD_ID_RE.test(token)) {
            counts.set(token, (counts.get(token) ?? 0) + 1);
          }
        }
      }
    }
  }

  popularityCache.set(dir, counts);
  return counts;
}
