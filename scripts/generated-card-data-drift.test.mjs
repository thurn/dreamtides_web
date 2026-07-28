// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkGeneratedCardData, expectedCardDataFromToml } from "./generated-card-data-drift.mjs";

function writeFixtureToml(rootDir, rarityLine = 'rarity = "Legendary"\n') {
  const tabulaDir = join(rootDir, "data", "tabula");
  mkdirSync(tabulaDir, { recursive: true });
  writeFileSync(
    join(tabulaDir, "cards_v2.toml"),
    `[[cards]]
name = "Knowledge Restored"
id = "ded25ef2-3c3f-4012-8717-8dec3def1854"
tides = ["card_flow", "event_chain"]
rendered-text = "Draw 3 cards."
energy-cost = 5
card-type = "Event"
subtype = ""
${rarityLine}is-fast = false
spark = ""
image-number = 1786390157
art-owned = false
card-number = 113
`,
  );
}

describe("checkGeneratedCardData", () => {
  it("passes when generated card data matches the TOML source", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "journey-card-drift-"));
    mkdirSync(join(rootDir, "public"), { recursive: true });
    writeFixtureToml(rootDir);
    writeFileSync(
      join(rootDir, "public", "card-data.json"),
      JSON.stringify(expectedCardDataFromToml({ rootDir }), null, 2) + "\n",
    );

    expect(checkGeneratedCardData({ rootDir }).ok).toBe(true);
  });

  it("reports the first stale rarity field", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "journey-card-drift-"));
    mkdirSync(join(rootDir, "public"), { recursive: true });
    writeFixtureToml(rootDir);
    const staleCards = expectedCardDataFromToml({ rootDir });
    writeFileSync(
      join(rootDir, "public", "card-data.json"),
      JSON.stringify(staleCards, null, 2) + "\n",
    );

    writeFixtureToml(rootDir, "");

    const result = checkGeneratedCardData({ rootDir });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("card 113 Knowledge Restored");
    expect(result.message).toContain("rarity");
    expect(result.message).toContain("TOML produces <omitted>");
    expect(result.message).toContain('public/card-data.json has "Legendary"');
  });
});
