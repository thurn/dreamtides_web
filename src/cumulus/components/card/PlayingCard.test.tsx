// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { CumulusRoot } from "../../CumulusRoot";
import {
  PLAYING_CARD_DESIGN,
  PlayingCard,
  WagerPrizeCard,
} from "./PlayingCard";
import { localizedDreamsignFixture } from "../../test-helpers/dreamsign-fixture";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("WagerPrizeCard", () => {
  it("keeps the jackpot reward in one sentence and flips into the drawn card", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dreamsign = localizedDreamsignFixture({
      id: "00000000-0000-4000-8000-000000000051",
      name: "Bezoar",
      imageName: "bezoar.png",
      effectDescription: "Foresee 1.",
    });

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="jack"
            targetLabel={assertLocalized("J-A")}
            essenceReward={200}
            rewardDreamsign={dreamsign}
            size="wagerCompact"
            drawnCard={{ rank: "Q", suit: "hearts" }}
          />
        </CumulusRoot>,
      );
    });

    const prize = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    const description = prize?.querySelector<HTMLElement>(
      "[data-wager-prize-description]",
    );
    expect(
      prize?.querySelector<HTMLElement>("[data-wager-prize-copy]")?.style.gap,
    ).toBe("var(--space-xs)");
    expect(description?.textContent).toContain("200");
    expect(description?.textContent).toContain("Bezoar");
    expect(
      description?.querySelector("[data-wager-prize-dreamsign-name]"),
    ).not.toBeNull();
    const dreamsignSource = prize?.querySelector<HTMLElement>(
      "[data-wager-prize-dreamsign-source]",
    );
    expect(dreamsignSource?.dataset.revealEntityType).toBe("dreamsign");
    expect(dreamsignSource?.dataset.revealPrimaryVariant).toBe("object");
    const descriptionId = dreamsignSource?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(descriptionId)?.textContent).toContain(
      "Look at the top card of your deck",
    );
    expect(dreamsignSource?.querySelector("[data-wager-prize-title]"))
      .not.toBeNull();
    expect(dreamsignSource?.querySelector("[data-wager-prize-description]"))
      .not.toBeNull();
    expect(prize?.dataset.wagerPrizeCardState).toBe("prize");
    expect(prize?.dataset.playingCard).toBeUndefined();

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="jack"
            targetLabel={assertLocalized("J-A")}
            essenceReward={200}
            rewardDreamsign={dreamsign}
            size="wagerCompact"
            drawnCard={{ rank: "Q", suit: "hearts" }}
            revealDrawnCard
          />
        </CumulusRoot>,
      );
    });

    const revealed = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    expect(revealed?.dataset.wagerPrizeCardState).toBe("drawn");
    expect(revealed?.dataset.playingCard).toBe("Q-hearts");
    expect(revealed?.getAttribute("aria-label")).toContain("Q");
    expect(revealed?.getAttribute("aria-label")).toContain("hearts");

    act(() => root.unmount());
  });

  it("renders the official outlined four-suit variant and flips to its result", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <PlayingCard
            variant="fourSuit"
            size="wagerCompact"
            drawnCard={{ rank: "7", suit: "clubs" }}
          />
        </CumulusRoot>,
      );
    });

    const card = host.querySelector<HTMLElement>(
      '[data-playing-card-variant="fourSuit"]',
    );
    expect(card?.dataset.playingCardState).toBe("concealed");
    const suitMarks = Array.from(
      card?.querySelectorAll<HTMLElement>(
        "[data-playing-card-four-suit-face] [data-playing-card-suit-mark]",
      ) ?? [],
    );
    expect(suitMarks.map((element) => element.dataset.playingCardSuitMark))
      .toEqual(["spades", "hearts", "diamonds", "clubs"]);
    expect(suitMarks.every((element) =>
      element.querySelector<HTMLElement>("[data-playing-card-suit-glyph]")
        ?.style.webkitTextStroke.includes(
          PLAYING_CARD_DESIGN.colors.characterOutline,
        ) === true
    )).toBe(true);

    act(() => {
      root.render(
        <CumulusRoot>
          <PlayingCard
            variant="fourSuit"
            size="wagerCompact"
            drawnCard={{ rank: "7", suit: "clubs" }}
            revealDrawnCard
          />
        </CumulusRoot>,
      );
    });

    expect(card?.dataset.playingCardState).toBe("drawn");
    expect(card?.dataset.playingCard).toBe("7-clubs");

    act(() => root.unmount());
  });

  it("keeps a committed dealer card concealed until it flips", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <PlayingCard
            variant="faceDown"
            size="wagerCompact"
            drawnCard={{ rank: "A", suit: "spades" }}
          />
        </CumulusRoot>,
      );
    });
    const card = host.querySelector<HTMLElement>(
      '[data-playing-card-variant="faceDown"]',
    );
    expect(card?.querySelector("[data-playing-card-face-down]")).not.toBeNull();

    act(() => {
      root.render(
        <CumulusRoot>
          <PlayingCard
            variant="faceDown"
            size="wagerCompact"
            drawnCard={{ rank: "A", suit: "spades" }}
            revealDrawnCard
          />
        </CumulusRoot>,
      );
    });
    expect(card?.dataset.playingCardState).toBe("drawn");

    act(() => root.unmount());
  });

  it("renders and emphasizes a Starway Stairs prize", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="starway-1"
            targetLabel={assertLocalized("3+")}
            essenceReward={60}
            rewardDreamsign={null}
            drawnCard={null}
            emphasis="current"
          />
        </CumulusRoot>,
      );
    });

    const prize = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    expect(prize?.dataset.wagerPrizeTarget).toBe("3+");
    expect(prize?.dataset.wagerPrizeCardEmphasis).toBe("current");
    expect(prize?.querySelector("path")?.getAttribute("stroke"))
      .toBe("var(--border-accent-glass)");
    expect(prize?.querySelector("path")?.getAttribute("stroke-width"))
      .toBe("5");
    expect(
      prize?.querySelector<HTMLElement>("[data-wager-prize-face]")?.style
        .background,
    ).toContain("var(--accent-bright)");

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="starway-1"
            targetLabel={assertLocalized("3+")}
            essenceReward={60}
            rewardDreamsign={null}
            drawnCard={{ rank: "3", suit: "clubs" }}
            revealDrawnCard
            emphasis="muted"
          />
        </CumulusRoot>,
      );
    });

    const mutedPrize = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    expect(mutedPrize?.style.opacity).toBe("");
    expect(mutedPrize?.style.filter).toBe("");
    expect(
      mutedPrize?.querySelector<HTMLElement>("[data-wager-prize-copy]")?.style
        .color,
    ).toBe("var(--text-on-glass-muted)");
    expect(
      mutedPrize?.querySelector<HTMLElement>("[data-wager-drawn-card-content]")
        ?.style.filter,
    ).toBe("grayscale(1)");

    act(() => root.unmount());
  });
});
