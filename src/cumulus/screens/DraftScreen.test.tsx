// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { DraftScreen, type DraftView } from "./DraftScreen";
import { CumulusRoot } from "../CumulusRoot";

function card(cardNumber: number): CardData {
  return {
    name: asCardName(`Card ${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: (cardNumber % 4) + 1,
    spark: 1,
    isFast: false,
    renderedText: "Text.",
    imageNumber: cardNumber,
    artOwned: false,
  };
}

function view(offer: number[]): DraftView {
  return {
    scene: null,
    offer: offer.map((cardNumber) => {
      const displaySnapshot = card(cardNumber);
      return { cardId: displaySnapshot.id, displaySnapshot };
    }),
    offerKey: offer.join(","),
    pickNumber: 1,
    pickTotal: 5,
  };
}

/** Stub matchMedia (jsdom lacks it; Pressable reads the reduced-motion query). */
function stubMatchMedia({
  desktop = false,
  wideDraft = desktop,
}: {
  desktop?: boolean;
  wideDraft?: boolean;
} = {}): void {
  window.matchMedia = (query: string) => ({
    matches:
      (desktop && query.includes("min-width: 900px")) ||
      (wideDraft && query.includes("min-width: 1260px")),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

describe("Cumulus DraftScreen", () => {
  it("shows Mira after one second and retires her with the first Draft pick", () => {
    vi.useFakeTimers();
    const onPick = vi.fn();
    const onTutorialShown = vi.fn();
    const tutorialView: DraftView = {
      ...view([101, 102, 103, 104]),
      tutorial: {
        id: "run-a:first-visit:draft-a:Draft",
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "At a [purple]Draft[/purple] site you choose cards.",
        },
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
      },
    };
    const { container, root } = mount(
      <DraftScreen
        view={tutorialView}
        onPick={onPick}
        onTutorialShown={onTutorialShown}
      />,
    );

    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector('[data-testid="site-tutorial-dialogue"]')
        ?.textContent,
    ).toContain("At a Draft site");
    expect(onTutorialShown).toHaveBeenCalledOnce();
    expect(container.querySelectorAll("[data-draft-offer-card]")).toHaveLength(4);

    const firstCard = container.querySelector<HTMLElement>(
      '[data-draft-offer-card="101"] [role="button"]',
    );
    act(() => {
      firstCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPick).toHaveBeenCalledWith(101);
    expect(container.querySelector("[data-site-tutorial-guidance]")).toBeNull();

    act(() => root.unmount());
  });

  it("renders the mobile offer as the shipped 2x2 grid", () => {
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const grid = container.querySelector<HTMLElement>("[data-draft-offer-grid]");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(2, auto)");
    expect(grid?.style.gridTemplateRows).toBe("repeat(2, auto)");
    const stage = container.querySelector<HTMLElement>("[data-draft-offer-stage]");
    expect(stage?.style.justifyContent).toBe("flex-start");
    expect(stage?.style.paddingLeft).toBe("var(--space-2)");
    expect(stage?.style.paddingRight).toBe("var(--space-2)");
    expect(grid?.style.gap).toBe("var(--space-2)");
    const firstCard = container.querySelector<HTMLElement>(
      '[data-draft-offer-card="101"]',
    );
    expect(firstCard?.style.width).toContain("var(--space-2)");

    act(() => {
      root.unmount();
    });
  });

  it("renders the desktop offer as one row of four cards", () => {
    stubMatchMedia({ desktop: true });
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const grid = container.querySelector<HTMLElement>("[data-draft-offer-grid]");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(4, auto)");
    expect(grid?.style.gridTemplateRows).toBe("repeat(1, auto)");
    const firstCard = container.querySelector<HTMLElement>(
      '[data-draft-offer-card="101"]',
    );
    expect(firstCard?.style.width).toContain("300px");
    const stage = container.querySelector<HTMLElement>("[data-draft-offer-stage]");
    expect(stage?.style.justifyContent).toBe("center");
    expect(stage?.style.paddingLeft).toBe("var(--space-5)");
    expect(grid?.style.gap).toBe("var(--space-5)");

    act(() => {
      root.unmount();
    });
  });

  it("reflows a narrow desktop offer into two columns", () => {
    stubMatchMedia({ desktop: true, wideDraft: false });
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const grid = container.querySelector<HTMLElement>("[data-draft-offer-grid]");
    expect(grid?.style.gridTemplateColumns).toBe("repeat(2, auto)");
    expect(grid?.style.gridTemplateRows).toBe("repeat(2, auto)");
    expect(
      container.querySelector<HTMLElement>('[data-draft-offer-card="101"]')
        ?.style.width,
    ).toContain("300px");

    act(() => root.unmount());
  });

  it("renders one offer cell per card in the pack and nothing else", () => {
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={vi.fn()} />,
    );

    const cells = container.querySelectorAll("[data-draft-offer-card]");
    expect(cells).toHaveLength(4);
    for (const cardNumber of [101, 102, 103, 104]) {
      expect(
        container.querySelector(`[data-draft-offer-card="${String(cardNumber)}"]`),
      ).not.toBeNull();
    }
    // The one label: a floating "Draft (n/total)" pick counter.
    const counter = container.querySelector("[data-draft-pick-counter]");
    expect(counter?.textContent).toBe("Draft (1/5)");

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the card's number when a card is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={onPick} />,
    );

    const target = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="102"] [role="button"]`,
    );
    if (target === null) {
      throw new Error("Missing pressable card");
    }
    act(() => {
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith(102);

    act(() => {
      root.unmount();
    });
  });

  it("renders the reroll control beside the top-right journey menu and dispatches it", () => {
    const onReroll = vi.fn();
    const { container, root } = mount(
      <DraftScreen
        view={view([101, 102, 103, 104])}
        onPick={vi.fn()}
        onReroll={onReroll}
      />,
    );

    const reroll = container.querySelector<HTMLElement>(
      '[data-testid="reroll-draft-offer"]',
    );
    expect(reroll).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-draft-reroll-control]")?.style
        .right,
    ).toContain("safe-area-inset-right");

    act(() => {
      reroll?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onReroll).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("latches the first pick so a second card cannot be picked in the same pack", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <DraftScreen view={view([101, 102, 103, 104])} onPick={onPick} />,
    );

    const first = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="101"] [role="button"]`,
    );
    const second = container.querySelector<HTMLElement>(
      `[data-draft-offer-card="102"] [role="button"]`,
    );
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    act(() => {
      second?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(101);

    act(() => {
      root.unmount();
    });
  });
});
