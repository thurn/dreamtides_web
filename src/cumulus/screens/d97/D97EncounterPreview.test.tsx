// @vitest-environment jsdom
// D97EncounterPreview contract: the stats, signature cards and both antes
// render with their hooks; a collection at its floor shows no player ante
// card; Fight and Not now report the player's choice.

import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { parseDreamAnchorId } from "../../../types/identifiers";
import { testAvatarId, testCardId } from "../../../types/test-identities";
import { renderInCumulus } from "../../testing/render";
import { D97EncounterPreview, type D97EncounterPreviewView, type D97PreviewCardView } from "./D97EncounterPreview";

function card(seed: string): D97PreviewCardView {
  const cardId = testCardId(seed);
  return {
    cardId,
    model: {
      cardId,
      displaySnapshot: { id: cardId, cardNumber: 1, name: seed, renderedText: "", rarity: "Common", cardType: "Character", subtype: "", energyCost: 1, spark: 1, isFast: false, imageNumber: 1 } as never,
    },
  };
}

const VIEW: D97EncounterPreviewView = {
  anchorId: parseDreamAnchorId("d9700000-0000-4000-8000-000000000006"),
  role: "challenger",
  avatar: { id: testAvatarId("a"), name: "A", title: "T", ability: null, abilityActive: false },
  tier: 4,
  scoreToWin: 15,
  headStarts: { player: 0, opponent: 0 },
  signatureCards: [card("s1"), card("s2"), card("s3")],
  playerAnte: card("p"),
  opponentAnte: card("o"),
  extraEssence: 10,
};

describe("D97EncounterPreview", () => {
  it("renders the encounter and reports Fight and Not now", () => {
    const onFight = vi.fn();
    const onNotNow = vi.fn();
    renderInCumulus(<D97EncounterPreview view={VIEW} onFight={onFight} onNotNow={onNotNow} />);
    const root = document.querySelector(`[data-d97-encounter-preview="${VIEW.anchorId}"]`);
    expect(root).not.toBeNull();
    expect(root?.querySelectorAll("[data-d97-preview-stat]")).toHaveLength(4);
    expect(document.querySelectorAll('[data-testid="d97-preview-signature-cards"] [data-d97-preview-card]')).toHaveLength(3);
    expect(document.querySelector('[data-testid="d97-preview-player-ante"]')).not.toBeNull();
    expect(document.querySelector("[data-d97-preview-extra]")).not.toBeNull();
    act(() => document.querySelector<HTMLElement>('[data-testid="d97-preview-fight"]')?.click());
    act(() => document.querySelector<HTMLElement>('[data-testid="d97-preview-not-now"]')?.click());
    expect(onFight).toHaveBeenCalledTimes(1);
    expect(onNotNow).toHaveBeenCalled();
  });

  it("shows no player ante card at the collection floor", () => {
    renderInCumulus(<D97EncounterPreview view={{ ...VIEW, playerAnte: null, extraEssence: null }} onFight={() => undefined} onNotNow={() => undefined} />);
    expect(document.querySelector('[data-testid="d97-preview-player-ante"]')).toBeNull();
    expect(document.querySelector("[data-d97-preview-extra]")).toBeNull();
  });
});
