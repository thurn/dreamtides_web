// Guards the UUID-keyed card-reference systems against drift. Every hand-authored
// place that names cards in data — the `signature-cards` in
// `dream_avatars_v2.toml`, the tutorial quest pool, the pool metadata in
// `cards-v2-metadata.ts`, and the build-around metadata in
// `buildaround_support.json` — references cards by their stable `id` UUID from
// `cards_v2.toml`. These tests fail if any reference points at a UUID that is not
// a real card, so renaming a card can never silently desynchronize one of these
// files. (The adapted draft records in
// `docs/draft_records_adapted` are imported data, not a maintained reference: the
// asset build resolves them tolerantly and drops tokens for cards no longer in
// the catalog, so they are not guarded here.)

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";
import { CARDS_V2_POOL_METADATA } from "./cards-v2-metadata";
import { STARTER_CARD_NUMBERS } from "./starter-cards";
import buildaroundSupport from "../../data/buildaround_support.json" with { type: "json" };

const ROOT = process.cwd();
const TABULA = join(ROOT, "data", "tabula");

const CARD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface RawCard {
  id: string;
  name: string;
  tags?: string[];
  "card-number": number;
}
interface RawDreamAvatar {
  name: string;
  "signature-cards"?: string[];
}

const cards = (
  parseToml(readFileSync(join(TABULA, "cards_v2.toml"), "utf8")) as {
    cards?: RawCard[];
  }
).cards ?? [];
const idToName = new Map(cards.map((c) => [c.id, c.name]));
const idToCard = new Map(cards.map((card) => [card.id, card]));

/** Assert a reference is a UUID that resolves to a real card; return its name. */
function expectCard(label: string, ref: string): string {
  expect(CARD_ID_RE.test(ref), `${label}: ${ref} is not a UUID`).toBe(true);
  const name = idToName.get(ref);
  expect(name, `${label}: ${ref} is not a card in cards_v2.toml`).toBeDefined();
  return name as string;
}

describe("card references resolve to real cards", () => {
  it("every signature card is a real card UUID", () => {
    const dreamAvatars = (
      parseToml(
        readFileSync(join(TABULA, "dream_avatars_v2.toml"), "utf8"),
      ) as { dreamAvatar?: RawDreamAvatar[] }
    ).dreamAvatar ?? [];
    let checked = 0;
    for (const dc of dreamAvatars) {
      for (const ref of dc["signature-cards"] ?? []) {
        expectCard(`signature[${dc.name}]`, ref);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the tutorial tag identifies exactly the UUID-authored tutorial pool", () => {
    const tutorialPool = parseToml(
      readFileSync(join(TABULA, "tutorial_quest_pool.toml"), "utf8"),
    ) as {
      tides?: Array<{ cards?: Array<{ id: string }> }>;
    };
    const poolCardIds = new Set(
      (tutorialPool.tides ?? []).flatMap((tide) =>
        (tide.cards ?? []).map((card) => card.id),
      ),
    );
    expect(poolCardIds.size).toBeGreaterThan(0);
    for (const id of poolCardIds) {
      expectCard("tutorial_quest_pool.toml", id);
      expect(STARTER_CARD_NUMBERS).not.toContain(
        idToCard.get(id)?.["card-number"],
      );
    }

    const taggedCardIds = new Set(
      cards
        .filter((card) => card.tags?.includes("tutorial") === true)
        .map((card) => card.id),
    );
    expect(taggedCardIds).toEqual(poolCardIds);

    const tagRegistry = parseToml(
      readFileSync(join(TABULA, "cards_v2.tags.toml"), "utf8"),
    ) as { tags?: Array<{ name?: string }> };
    expect(tagRegistry.tags?.some((tag) => tag.name === "tutorial")).toBe(true);
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
});
