import { describe, expect, it } from "vitest";

import { checkTides5, formatStaleMessage } from "./lib/tides5-check.mjs";

// Blocks a commit (via `npm test`) when the committed data/tides5.jsonc does not
// match a fresh `npm run bake-tides5`. This re-bakes from the current source —
// it never asserts hardcoded card content — so editing a TOML never fails it on
// its own; only forgetting to regenerate the artifact (or hand-editing its card
// lists) does. On failure the assertion message is the full remedy, including how
// to use the data/tides5-overrides.jsonc override system for curated changes.
describe("tides5 artifact freshness", () => {
  it("data/tides5.jsonc is up to date with `npm run bake-tides5`", () => {
    const result = checkTides5();
    // `formatStaleMessage` only accepts the failure shape; guard before calling.
    expect(result.ok, result.ok ? "" : formatStaleMessage(result)).toBe(true);
  }, 60_000);
});
