import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml } from "smol-toml";

interface RawCard {
  name?: string;
  "rendered-text"?: string;
}

const TABULA_DIR = join(__dirname, "..", "..", "data", "tabula");

/**
 * Loads every card's name + rendered-text from `data/tabula/rendered-cards.toml`.
 */
function loadRawCards(): { name: string; text: string }[] {
  const raw = readFileSync(join(TABULA_DIR, "rendered-cards.toml"), "utf8");
  const parsed = parseToml(raw) as { cards?: RawCard[] };
  const out: { name: string; text: string }[] = [];
  for (const card of parsed.cards ?? []) {
    const name = card.name ?? "";
    const text = card["rendered-text"] ?? "";
    if (name !== "" && text !== "") {
      out.push({ name, text });
    }
  }
  return out;
}

/**
 * `src/components/RulesText.tsx` splits rendered text into ability paragraphs
 * on a blank line (`\n\s*\n`). Inside a single paragraph, an interior `\n`
 * stays as part of the same block.
 *
 * Cross-ability single-`\n` separators therefore render as one squashed
 * paragraph with two abilities running together on the same line. The
 * canonical separator is `\n\n`.
 *
 * Bulleted lists inside an ability (e.g. `Choose One:\n• 2●: ...\n• 3●: ...`)
 * legitimately keep single-`\n` separators because every continuation line
 * starts with `• `. This check allows that case and flags anything else.
 */
function findCrossAbilityRunOns(
  cards: { name: string; text: string }[],
): { name: string; paragraph: string }[] {
  const offenders: { name: string; paragraph: string }[] = [];
  for (const card of cards) {
    const body = card.text.trim();
    const paragraphs = body.split(/\n\s*\n/);
    for (const paragraph of paragraphs) {
      const trimmed = paragraph.trim();
      if (!trimmed.includes("\n")) continue;
      const lines = trimmed.split("\n");
      // Allow paragraphs whose only interior newlines introduce bullet items.
      // The first line may be a `Choose One:`-style intro that ends with `:`,
      // and every subsequent line must start with the bullet character `•`.
      const isBulletedList = lines.every((line, i) => {
        const t = line.trim();
        if (t.startsWith("•")) return true;
        if (i === 0 && t.endsWith(":")) return true;
        return false;
      });
      if (!isBulletedList) {
        offenders.push({ name: card.name, paragraph: trimmed });
      }
    }
  }
  return offenders;
}

describe("rendered-cards.toml ability separators", () => {
  it("uses a blank line between distinct abilities (no single-\\n run-ons)", () => {
    const cards = loadRawCards();
    const offenders = findCrossAbilityRunOns(cards);
    expect(
      offenders,
      offenders
        .map((o) => `${o.name}:\n${o.paragraph}`)
        .join("\n\n---\n\n"),
    ).toEqual([]);
  });
});
