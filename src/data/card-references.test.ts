// Guards the UUID-keyed card-reference systems against drift. Every place that
// names cards in data — the `signature-cards` in `dreamcallers_v2.toml`, the pool
// metadata in `cards-v2-metadata.ts`, the build-around metadata in
// `buildaround_support.json`, and the real-decklist corpora under
// `docs/drafts_anon` / `docs/drafts_dt` — references cards by their stable `id`
// UUID from `cards_v2.toml`. These tests fail if any reference points at a UUID
// that is not a real card, so renaming a card can never silently desynchronize
// one of these files.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { CARDS_V2_POOL_METADATA } from "./cards-v2-metadata";
import buildaroundSupport from "../../data/buildaround_support.json" with { type: "json" };

const ROOT = process.cwd();
const TABULA = join(ROOT, "data", "tabula");

const CARD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface RawCard {
  id: string;
  name: string;
}
interface RawDreamcaller {
  name: string;
  "signature-cards"?: string[];
}

const cards = (
  parseToml(readFileSync(join(TABULA, "cards_v2.toml"), "utf8")) as {
    cards?: RawCard[];
  }
).cards ?? [];
const idToName = new Map(cards.map((c) => [c.id, c.name]));

/** Assert a reference is a UUID that resolves to a real card; return its name. */
function expectCard(label: string, ref: string): string {
  expect(CARD_ID_RE.test(ref), `${label}: ${ref} is not a UUID`).toBe(true);
  const name = idToName.get(ref);
  expect(name, `${label}: ${ref} is not a card in cards_v2.toml`).toBeDefined();
  return name as string;
}

describe("card references resolve to real cards", () => {
  it("every signature card is a real card UUID", () => {
    const dreamcallers = (
      parseToml(
        readFileSync(join(TABULA, "dreamcallers_v2.toml"), "utf8"),
      ) as { dreamcaller?: RawDreamcaller[] }
    ).dreamcaller ?? [];
    let checked = 0;
    for (const dc of dreamcallers) {
      for (const ref of dc["signature-cards"] ?? []) {
        expectCard(`signature[${dc.name}]`, ref);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("every pool-metadata key is a real card UUID", () => {
    const keys = Object.keys(CARDS_V2_POOL_METADATA);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expectCard("cards-v2-metadata.ts", key);
  });

  it("every build-around key is a real card UUID with a current name", () => {
    const entries = Object.entries(
      buildaroundSupport.cards as Record<string, { name?: string }>,
    );
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, entry] of entries) {
      const name = expectCard("buildaround_support.json", key);
      // The name field is the lookup key idf4 / the experiment harness use, so it
      // must match the current card name (refreshed by setup-assets on build).
      expect(entry.name, `buildaround_support.json[${key}] name drifted`).toBe(
        name,
      );
    }
  });

  it("every corpus deck line is a real card UUID", () => {
    let checked = 0;
    for (const dir of ["drafts_anon", "drafts_dt"]) {
      const corpusDir = join(ROOT, "docs", dir);
      for (const file of readdirSync(corpusDir)) {
        if (!file.endsWith(".txt")) continue;
        const lines = readFileSync(join(corpusDir, file), "utf8").split("\n");
        for (const line of lines) {
          const hash = line.indexOf("#");
          const token = (hash === -1 ? line : line.slice(0, hash)).trim();
          if (token.length === 0) continue;
          expectCard(`${dir}/${file}`, token);
          checked += 1;
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
