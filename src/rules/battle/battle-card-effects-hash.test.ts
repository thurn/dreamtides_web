// DELIBERATE NARROW EXCEPTION to the project rule "do not write tests which
// fail when I change my production TOML / game-design data". This test is
// scoped to ONLY the handful of card UUIDs registered in `BATTLE_CARD_EFFECTS`
// — the cards whose rules text is automated by a hand-written script. Its whole
// purpose is to fail when one of those specific cards' `renderedText` drifts
// away from the script that automates it, so the automation can be re-verified.
//
// A failure here means: a REGISTERED card's rules text changed. The fix is to
// re-read that card's automation script in `battle-card-effects-table.ts`,
// confirm the script still matches the new text, and update the entry's stored
// `textHash` (`fnv1aHex` of the new `renderedText`). It is NOT a reason to
// delete or loosen this test. This guard asserts nothing about unregistered
// cards, so editing any other card's TOML leaves it untouched.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { collectAutomationHashDrift } from "./battle-card-effects-table";
import type { CardData } from "../../types/cards";
import type { CardId } from "../../types/card-identity";

const REPO_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

/** Loads the real runtime card catalog the battle screen reads at runtime. */
function loadCardsById(): Map<CardId, string> {
  const json = readFileSync(
    join(REPO_ROOT, "public", "cards_v2-data.json"),
    "utf8",
  );
  const cards = JSON.parse(json) as CardData[];
  return new Map(cards.map((card) => [card.id, card.renderedText]));
}

describe("battle-card automation hash drift", () => {
  it("every registered automation script matches its card's live rules text", () => {
    const drift = collectAutomationHashDrift(loadCardsById());
    expect(
      drift,
      `Registered automated card(s) drifted from their script's stored hash. ` +
        `Re-verify each card's script in battle-card-effects-table.ts and update ` +
        `its textHash. Drift: ${JSON.stringify(drift)}`,
    ).toEqual([]);
  });
});
