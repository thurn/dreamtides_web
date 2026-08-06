// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCssTokens } from "./lib/cumulus-css-tokens.mjs";

const TOKEN_SOURCE = readFileSync(
  new URL("../src/cumulus/primitives/cumulus-tokens.css", import.meta.url),
  "utf8",
);

describe("Cumulus corner radius vocabulary", () => {
  it("contains exactly the five canonical radius values", () => {
    const radii = parseCssTokens(TOKEN_SOURCE).filter(({ name }) =>
      name.startsWith("radius-"),
    );

    expect(radii).toEqual([
      { name: "radius-compact", value: "8px" },
      { name: "radius-control", value: "14px" },
      { name: "radius-panel", value: "18px" },
      { name: "radius-large", value: "24px" },
      { name: "radius-pill", value: "999px" },
    ]);
  });
});
