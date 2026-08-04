// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  ExplorationSiteScreen,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";

const reducedMotionPreference = vi.hoisted(() => ({ value: true }));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      layout?: unknown;
      onAnimationComplete?: () => void;
    }
  >(function MotionElement(
    {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      onAnimationComplete,
      ...props
    },
    ref,
  ) {
    return React.createElement("div", {
      ...props,
      ref,
      onContextMenu: onAnimationComplete,
    });
  });
  return {
    motion: {
      div: MotionElement,
      img: MotionElement,
      main: MotionElement,
      section: MotionElement,
    },
    useReducedMotion: () => reducedMotionPreference.value,
  };
});

function makeCard(): CardData {
  return {
    id: asCardId("00000000-0000-4000-8000-000000000017"),
    name: asCardName("Exploration Fixture"),
    cardNumber: 17,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: 17,
    artOwned: true,
  };
}

function view(resolved = false): ExplorationSiteView {
  const selected = makeCard();
  return {
    siteId: "exploration-site",
    scene: null,
    guide: {
      id: "layaway",
      name: '"Layaway"',
      line: "Every card dreams, choom. Draw one, and we'll step inside.",
      art: artRef.dreamGuide("layaway"),
    },
    card: {
      cardId: selected.id,
      displaySnapshot: selected,
    },
    fullArt: artRef.explorationCard(selected.imageNumber),
    narrative: "A synthetic encounter waits in the dark.",
    actions: [
      {
        id: "choice-a",
        label: "Choose A",
        effectText: "Gain the fixture.",
        responseText: "The fixture answers.",
        followup: { kind: "none" },
        available: true,
      },
      {
        id: "choice-b",
        label: "Choose B",
        effectText: "Change the fixture.",
        responseText: "The fixture changes.",
        followup: { kind: "none" },
        available: true,
      },
    ],
    response: resolved
      ? { actionLabel: "Choose A", text: "The fixture answers." }
      : null,
  };
}

function stubMatchMedia(): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width"),
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

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  reducedMotionPreference.value = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ExplorationSiteScreen", () => {
  it("breaks the selected card's licensed art into a dismissible fullscreen layer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onChannel = vi.fn();
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={onChannel}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    const cardSlot = container.querySelector<HTMLElement>(
      "[data-exploration-card-slot]",
    );
    const channel = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-channel"]',
    );
    expect(
      container.querySelector('[data-testid="cumulus-exploration-panel"]'),
    ).toBeNull();
    expect(container.querySelector("[data-guide-gallery-guide]")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-speech"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Channel A Possibility");
    expect(container.textContent).not.toContain(
      "A single thread rises from your deck.",
    );
    expect(cardSlot?.dataset.cardId).toBe(view().card.cardId);
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-revealed-card"]')
        ?.getAttribute("data-card-id"),
    ).toBe(view().card.cardId);
    expect(channel?.textContent).toContain("Delve");
    expect(channel?.dataset.glassVariant).toBe("accent");
    expect(channel?.dataset.glassPlacement).toBe("onMedia");

    act(() => channel?.click());
    expect(onChannel).toHaveBeenCalledOnce();
    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationFrameBreakPhase).toBe("open");
    expect(frameBreak?.dataset.explorationFullArtImageNumber).toBe("17");
    expect(
      frameBreak
        ?.querySelector("[data-exploration-full-art]")
        ?.getAttribute("src"),
    ).toContain("/exploration/17.jpg");
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    const returnButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Return to Exploration"]',
    );
    act(() => returnButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("shows the authored narrative and resolves a direct choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      )?.textContent,
    ).toBe("A synthetic encounter waits in the dark.");
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-narrative-panel"]')
        ?.querySelector("[data-glass-panel-header]"),
    ).toBeNull();
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a");
    act(() => root.unmount());
  });

  it("collects a card follow-up before resolving the choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: "Choose a Fixture",
            subtitle: "Choose one card.",
            cards: [
              { entryId: "entry-fixture", model: base.card, isBane: false },
            ],
            mode: "single",
            selectionKey: "entryIds",
            min: 1,
            max: 1,
          },
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={onResolve}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    expect(
      container.querySelector('[data-exploration-followup="cards"]'),
    ).not.toBeNull();
    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-fixture"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-followup-confirm"]',
        )
        ?.click(),
    );
    expect(onResolve).toHaveBeenCalledWith("choice-a", {
      entryIds: ["entry-fixture"],
    });
    act(() => root.unmount());
  });

  it("lets the player undo the purge target in a purge-and-copy follow-up", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          followup: {
            kind: "cards",
            title: "Exchange Familiar Forms",
            subtitle: "Choose a card to purge, then a card to copy.",
            cards: [
              { entryId: "entry-a", model: base.card, isBane: false },
              { entryId: "entry-b", model: base.card, isBane: false },
            ],
            mode: "purge-and-copy",
            selectionKey: "entryIds",
            min: 2,
            max: 2,
          },
        },
        base.actions[1],
      ],
    };
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={followupView}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-choice-0"]',
        )
        ?.click(),
    );
    const purgeCard = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-exploration-card-entry-a"]',
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-followup-confirm"]',
    );
    act(() => purgeCard?.click());
    expect(confirm?.textContent).toContain("Choose a card to copy");

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-entry-a"]',
        )
        ?.click(),
    );
    expect(confirm?.textContent).toContain("Choose a card to purge");
    act(() => root.unmount());
  });

  it("collapses the art and returns the card to the deck before leaving", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view(true)}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const exitButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-continue"]',
    );
    expect(exitButton?.textContent).toContain("Continue");

    act(() => exitButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container
        .querySelector("[data-exploration-frame-break]")
        ?.getAttribute("data-exploration-frame-break-phase"),
    ).toBe("collapsing");

    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    const cardReturn = container.querySelector(
      "[data-exploration-card-return]",
    );
    expect(cardReturn?.getAttribute("data-exploration-destination")).toBe(
      "journey-deck",
    );
    expect(
      cardReturn?.querySelector('[data-card-back=""]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages a face-down-to-face-up travel from the bottom-right deck anchor", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);

    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onResolve={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    const travel = container.querySelector("[data-exploration-card-travel]");
    expect(travel?.getAttribute("data-exploration-source")).toBe(
      "journey-deck",
    );
    expect(travel?.querySelector("[data-card-back]")).not.toBeNull();
    expect(
      travel?.querySelector(`[data-card-id="${view().card.cardId}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-exploration-channel-state]")
        ?.getAttribute("data-exploration-channel-state"),
    ).toBe("waiting");

    act(() => root.unmount());
  });
});
