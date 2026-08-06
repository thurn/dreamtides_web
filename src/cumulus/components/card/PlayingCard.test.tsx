// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { PlayingCard, WagerPrizeCard } from "./PlayingCard";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function renderCard(card: Parameters<typeof PlayingCard>[0]): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CumulusRoot>
        <PlayingCard {...card} />
      </CumulusRoot>,
    ),
  );
  const rendered = host.querySelector<HTMLDivElement>("[data-playing-card]");
  if (rendered === null) throw new Error("expected playing card");
  return rendered;
}

describe("PlayingCard", () => {
  // Visual values are tuned through browser QA. Keep this suite on the stable
  // semantic and accessibility contract exposed to consumers and players.
  it("renders a three-character ten and exposes the complete accessible value", () => {
    const card = renderCard({ rank: "10", suit: "hearts" });

    expect(card.getAttribute("aria-label")).toBe("10 of hearts");
    expect(card.textContent).toBe("10♥");
    expect(card.dataset.playingCardRank).toBe("10");
    expect(card.dataset.playingCardSuit).toBe("hearts");
    expect(card.dataset.playingCardSize).toBe("standard");
  });

  it.each([
    ["clubs", "♣"],
    ["diamonds", "♦"],
    ["hearts", "♥"],
    ["spades", "♠"],
  ] as const)("renders the %s suit's conventional glyph", (suit, glyph) => {
    const card = renderCard({ rank: "Q", suit });

    expect(card.getAttribute("aria-label")).toBe(`Q of ${suit}`);
    expect(card.textContent).toBe(`Q${glyph}`);
    expect(card.dataset.playingCardSuit).toBe(suit);
  });

  it("renders the three focused front variants", () => {
    const rank = renderCard({
      rank: "7",
      suit: "hearts",
      variant: "rank-display",
    });
    const suit = renderCard({
      rank: "7",
      suit: "hearts",
      variant: "suit-display",
    });
    const target = renderCard({
      rank: "7",
      suit: "spades",
      variant: "rank-target",
    });
    expect(rank.dataset.playingCardVariant).toBe("rank-display");
    expect(rank.getAttribute("aria-label")).toBe("Rank 7");
    expect(rank.textContent).toBe("7");
    expect(rank.querySelector("[data-playing-card-suit-glyph]")).toBeNull();

    expect(suit.dataset.playingCardVariant).toBe("suit-display");
    expect(suit.getAttribute("aria-label")).toBe("hearts");
    expect(suit.textContent).toBe("♥");
    expect(suit.querySelector("[data-playing-card-rank-glyph]")).toBeNull();

    expect(target.dataset.playingCardVariant).toBe("rank-target");
    expect(target.getAttribute("aria-label")).toBe("Rank target 7 or higher");
    expect(target.textContent).toBe("7+");
    expect(
      target.querySelector("[data-playing-card-target-glyph]")?.textContent,
    ).toBe("+");
  });

  it("exposes the selected named size without changing card identity", () => {
    const card = renderCard({
      rank: "7",
      suit: "diamonds",
      size: "compact",
    });

    expect(card.dataset.playingCardSize).toBe("compact");
    expect(card.getAttribute("aria-label")).toBe("7 of diamonds");
    expect(card.textContent).toBe("7♦");
  });

  it("keeps the jackpot reward in one sentence and flips into the drawn card", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const dreamsign = {
      id: "00000000-0000-4000-8000-000000000051",
      name: "Bezoar",
      imageName: "bezoar.png",
      effectDescription: "Foresee 1.",
      isNegative: false,
    };

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="jack"
            targetLabel="J-A"
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
    expect(description?.textContent).toBe("Win 200 and Bezoar");
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
            targetLabel="J-A"
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
    expect(revealed?.getAttribute("aria-label")).toBe("Q of hearts");

    act(() => root.unmount());
  });

  it("uses the same prize face for a Dreamsign-only Ladder Climb reward", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="ladder-climb"
            targetLabel="Q-A"
            essenceReward={null}
            rewardDreamsign={{
              id: "00000000-0000-4000-8000-000000000052",
              name: "Crystal Wand",
              imageName: "crystal-wand.png",
              effectDescription: "Your first card costs 1 less.",
              isNegative: false,
            }}
          />
        </CumulusRoot>,
      );
    });

    const prize = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    expect(
      prize?.querySelector<HTMLElement>("[data-wager-prize-copy]")?.style.gap,
    ).toBe("var(--space-s)");
    expect(prize?.dataset.wagerPrizeCard).toBe("ladder-climb");
    expect(prize?.querySelector("[data-wager-prize-title]")).not.toBeNull();
    expect(
      prize?.querySelector("[data-wager-prize-dreamsign-name]"),
    ).not.toBeNull();
    expect(
      prize?.querySelector("[data-wager-prize-dreamsign-source]"),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("renders and emphasizes a Starway Stairs minimum draw prize", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <CumulusRoot>
          <WagerPrizeCard
            prizeId="starway-1"
            presentation="draw-minimum"
            targetLabel="3+"
            essenceReward={60}
            rewardDreamsign={null}
            emphasis="current"
          />
        </CumulusRoot>,
      );
    });

    const prize = host.querySelector<HTMLElement>("[data-wager-prize-card]");
    expect(prize?.dataset.wagerPrizePresentation).toBe("draw-minimum");
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
            presentation="draw-minimum"
            targetLabel="3+"
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
