// Guards the UUID-keyed card-reference systems against drift. Every
// hand-authored place that names cards in the content modules (Avatar
// signature cards and the tutorial journey pool) references cards by stable
// UUID. These tests fail if any reference points at a UUID that is not a real
// card, so renaming a card can never silently desynchronize one of them.

import { describe, expect, it } from "vitest";
import { AVATARS } from "../content/avatars";
import { CARDS } from "../content/cards";
import { TUTORIAL_JOURNEY_POOL } from "../content/tutorial-journey-pool";

const cardById = new Map<string, (typeof CARDS)[number]>(
  CARDS.map((card) => [card.id, card]),
);

function expectCard(label: string, ref: string): void {
  expect(cardById.has(ref), `${label}: ${ref} is not a card`).toBe(true);
}

describe("card references resolve to real cards", () => {
  it("every signature card is a real card UUID", () => {
    let checked = 0;
    for (const avatar of AVATARS) {
      for (const ref of avatar.signatureCardIds ?? []) {
        expectCard(`signature[${avatar.id}]`, ref);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("the tutorial tag identifies exactly the UUID-authored tutorial pool", () => {
    const poolCardIds = new Set(
      TUTORIAL_JOURNEY_POOL.tides.flatMap((tide) =>
        tide.cards.map((card) => card.id),
      ),
    );
    expect(poolCardIds.size).toBeGreaterThan(0);
    for (const id of poolCardIds) {
      expectCard("tutorial journey pool", id);
      expect(cardById.get(id)?.roles ?? []).not.toContain("starter-deck");
    }
    const taggedCardIds = new Set(
      CARDS.filter((card) => card.tags.includes("tutorial")).map(
        (card) => card.id,
      ),
    );
    expect(taggedCardIds).toEqual(poolCardIds);
  });
});
