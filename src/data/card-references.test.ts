// Guards the UUID-keyed card-reference systems against drift. Every hand-authored
// place that names cards in data — the `signature-cards` in
// `dream_avatars.toml` and the tutorial journey pool reference cards by stable
// UUID from
// `cards.toml`. These tests fail if any reference points at a UUID that is not
// a real card, so renaming a card can never silently desynchronize one of these
// files.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml } from "smol-toml";

const ROOT = process.cwd();
const DATA_DIR = join(ROOT, "data");

const CARD_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

interface RawCard {
  id: string;
  name: string;
  tags?: string[];
  "card-number": number;
  roles?: string[];
}
interface RawDreamAvatar {
  name: string;
  "signature-cards"?: string[];
}

const cards = (
  parseToml(readFileSync(join(DATA_DIR, "cards.toml"), "utf8")) as {
    cards?: RawCard[];
  }
).cards ?? [];
const idToName = new Map(cards.map((c) => [c.id, c.name]));
const idToCard = new Map(cards.map((card) => [card.id, card]));

/** Assert a reference is a UUID that resolves to a real card; return its name. */
function expectCard(label: string, ref: string): string {
  expect(CARD_ID_RE.test(ref), `${label}: ${ref} is not a UUID`).toBe(true);
  const name = idToName.get(ref);
  expect(name, `${label}: ${ref} is not a card in cards.toml`).toBeDefined();
  return name as string;
}

describe("card references resolve to real cards", () => {
  it("every signature card is a real card UUID", () => {
    const dreamAvatars = (
      parseToml(
        readFileSync(join(DATA_DIR, "dream_avatars.toml"), "utf8"),
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
      readFileSync(join(DATA_DIR, "tutorial_journey_pool.toml"), "utf8"),
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
      expectCard("tutorial_journey_pool.toml", id);
      expect(idToCard.get(id)?.roles ?? []).not.toContain("starter-deck");
    }

    const taggedCardIds = new Set(
      cards
        .filter((card) => card.tags?.includes("tutorial") === true)
        .map((card) => card.id),
    );
    expect(taggedCardIds).toEqual(poolCardIds);

    const tagRegistry = parseToml(
      readFileSync(
        join(DATA_DIR, "internal", "internal_card_metadata.toml"),
        "utf8",
      ),
    ) as { tags?: Array<{ name?: string }> };
    expect(tagRegistry.tags?.some((tag) => tag.name === "tutorial")).toBe(true);
  });
});
