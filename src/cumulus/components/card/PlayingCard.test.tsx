// @vitest-environment jsdom

// PlayingCard and PlayingCardPrize: reveal semantics and the flip.
import { describe, expect, it } from "vitest";
import { testDreamsignId } from "../../../types/test-identities";
import { dreamsignViewFixture } from "../../test-helpers/dreamsign-fixture";
import { renderInCumulus } from "../../testing/render";
import { PlayingCard, PlayingCardPrize } from "./PlayingCard";
import { describedText } from "./card-components.fixtures";

describe("PlayingCard", () => {
  it("keeps related Dreamsign reveal semantics and flips the prize into the drawn card", () => {
    const dreamsign = dreamsignViewFixture({
      id: testDreamsignId("00000000-0000-4000-8000-000000000051"),
      name: "Bezoar",
      imageName: "bezoar.png",
      effectDescription: "Foresee 1.",
    });
    const prize = (revealDrawnCard: boolean) => (
      <PlayingCardPrize
        objectId="fixture-prize"
        title={"Fixture prize"}
        description={"Fixture reward"}
        accessibilityLabel={"Fixture prize and reward"}
        relatedDreamsign={dreamsign}
        size="compact"
        drawnCard={{ rank: "Q", suit: "hearts" }}
        revealDrawnCard={revealDrawnCard}
      />
    );
    const { container, rerender } = renderInCumulus(prize(false));
    const root = () =>
      container.querySelector<HTMLElement>("[data-playing-card-prize]");
    const dreamsignSource = root()?.querySelector<HTMLElement>(
      "[data-playing-card-prize-dreamsign-source]",
    );
    expect(dreamsignSource?.dataset.revealEntityType).toBe("dreamsign");
    expect(describedText(dreamsignSource)).not.toBe("");
    expect(root()?.dataset.playingCardPrizeState).toBe("prize");
    expect(root()?.dataset.playingCard).toBeUndefined();

    rerender(prize(true));
    expect(root()?.dataset.playingCardPrizeState).toBe("drawn");
    expect(root()?.dataset.playingCard).toBe("Q-hearts");
  });

  it("keeps four-suit and face-down cards concealed until they flip", () => {
    for (const variant of ["fourSuit", "faceDown"] as const) {
      const playing = (revealDrawnCard: boolean) => (
        <PlayingCard
          variant={variant}
          size="compact"
          drawnCard={{ rank: "7", suit: "clubs" }}
          revealDrawnCard={revealDrawnCard}
        />
      );
      const { container, rerender, unmount } = renderInCumulus(playing(false));
      const cardElement = container.querySelector<HTMLElement>(
        `[data-playing-card-variant="${variant}"]`,
      );
      expect(cardElement?.dataset.playingCardState).toBe("concealed");
      rerender(playing(true));
      expect(cardElement?.dataset.playingCardState).toBe("drawn");
      expect(cardElement?.dataset.playingCard).toBe("7-clubs");
      unmount();
    }
  });
});
