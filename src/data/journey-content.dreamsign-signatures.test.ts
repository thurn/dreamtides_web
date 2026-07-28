import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const signaturesPath = join(ROOT, "public", "dreamsign-signatures-data.json");
const catalogPath = join(ROOT, "public", "cards_v2-data.json");

interface SignatureEntry {
  id: string;
  category: string;
  signatureCardIds?: string[];
}

interface CardEntry {
  id: string;
}

describe("dreamsign-signatures-data.json structural invariants", () => {
  const entries = JSON.parse(
    readFileSync(signaturesPath, "utf8"),
  ) as SignatureEntry[];

  const catalogCards = JSON.parse(
    readFileSync(catalogPath, "utf8"),
  ) as CardEntry[];
  const catalogIds = new Set(catalogCards.map((c) => c.id.toLowerCase()));

  it("every entry has category 'neutral' or 'tailored'", () => {
    for (const entry of entries) {
      expect(
        ["neutral", "tailored"],
        `entry ${entry.id} has invalid category: ${entry.category}`,
      ).toContain(entry.category);
    }
  });

  it("every signatureCardIds entry is a lowercased UUID present in the card catalog", () => {
    for (const entry of entries) {
      const ids = entry.signatureCardIds ?? [];
      for (const cardId of ids) {
        expect(
          cardId,
          `signatureCardIds entry in dreamsign ${entry.id} is not lowercase`,
        ).toBe(cardId.toLowerCase());
        expect(
          catalogIds.has(cardId),
          `signatureCardIds entry ${cardId} in dreamsign ${entry.id} not found in card catalog`,
        ).toBe(true);
      }
    }
  });

  it("every neutral entry has an empty signatureCardIds", () => {
    for (const entry of entries) {
      if (entry.category === "neutral") {
        const ids = entry.signatureCardIds ?? [];
        expect(
          ids,
          `neutral dreamsign ${entry.id} should have empty signatureCardIds`,
        ).toHaveLength(0);
      }
    }
  });
});
