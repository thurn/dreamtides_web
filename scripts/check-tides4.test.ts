import { describe, expect, it } from "vitest";

import { checkTides4, formatStaleMessage } from "./lib/tides4-check.mjs";

// Blocks a commit (via `npm test`) when the committed data/tides4.jsonc does not
// match a fresh `npm run bake-tides4`. This re-bakes from the current source —
// it never asserts hardcoded card content — so editing a TOML never fails it on
// its own; only forgetting to regenerate the artifact (or hand-editing its card
// lists) does. On failure the assertion message is the full remedy, including how
// to use the data/tides4-overrides.jsonc override system for curated changes.
describe("tides4 artifact freshness", () => {
  it("data/tides4.jsonc is up to date with `npm run bake-tides4`", () => {
    const result = checkTides4();
    // `formatStaleMessage` only accepts the failure shape; guard before calling.
    expect(result.ok, result.ok ? "" : formatStaleMessage(result)).toBe(true);
  }, 60_000);
});
