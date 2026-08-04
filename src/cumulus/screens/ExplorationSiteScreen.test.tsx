// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP } from "../components/hud/JourneyStatusBar";
import { artRef } from "../primitives/art";
import { token } from "../primitives/tokens";
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
      line: "Every card dreams, friend. Draw one, and we'll step inside.",
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
        followup: { kind: "none" },
        available: true,
      },
      {
        id: "choice-b",
        label: "Choose B",
        effectText: "Change the fixture.",
        followup: { kind: "none" },
        available: true,
      },
    ],
    resolvedActionId: resolved ? "choice-a" : null,
    reward: null,
  };
}

function twoCardRewardView(): ExplorationSiteView {
  const base = view(true);
  const second = {
    ...base.card,
    cardId: asCardId("00000000-0000-4000-8000-000000000018"),
    displaySnapshot: {
      ...base.card.displaySnapshot,
      id: asCardId("00000000-0000-4000-8000-000000000018"),
      name: asCardName("Second Survivor Fixture"),
      cardNumber: 18,
      imageNumber: 18,
    },
  };
  return {
    ...base,
    reward: { cards: [base.card, second], dreamsigns: [] },
  };
}

function dreamsignRewardView(): ExplorationSiteView {
  return {
    ...view(true),
    reward: {
      cards: [],
      dreamsigns: [
        {
          id: "reward-dreamsign-id",
          name: "Reward Dreamsign",
          effectDescription: "A synthetic reward sign.",
          imageName: "reward-dreamsign.webp",
          imageAlt: "Reward Dreamsign art",
          isBane: false,
        },
      ],
    },
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
  vi.useRealTimers();
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
    expect(
      container.querySelector("[data-guide-gallery-guide]"),
    ).not.toBeNull();
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
    const tutorialAnchor = container.querySelector(
      '[data-tutorial-guidance-concept="exploration-actions"]',
    );
    expect(
      tutorialAnchor?.hasAttribute("data-tutorial-guidance-obstacle"),
    ).toBe(true);
    expect(tutorialAnchor?.hasAttribute("data-tutorial-guidance-anchor")).toBe(
      true,
    );
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

  it("reveals a referenced entity without resolving its surrounding choice", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const referencedCard = makeCard();
    const referencedView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          effectText: `Gain ${referencedCard.name}.`,
          effectParts: [
            { kind: "text", text: "Gain " },
            {
              kind: "entity",
              entity: { kind: "card", card: referencedCard },
            },
            { kind: "text", text: "." },
          ],
        },
        base.actions[1],
      ],
    };
    const onResolve = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={referencedView}
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
    const source = container.querySelector<HTMLElement>(
      '[data-entity-reference="card"]',
    );
    expect(source?.textContent).toBe(referencedCard.name);
    expect(source?.dataset.entityReferenceId).toBe(referencedCard.id);
    expect(source?.dataset.revealPrimaryVariant).toBe("gameCard");
    expect(source?.style.textDecoration).toBe("underline");
    act(() => source?.focus());
    expect(source?.dataset.revealActive).toBe("true");
    act(() => source?.click());
    expect(onResolve).not.toHaveBeenCalled();
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
    const followup = container.querySelector<HTMLElement>(
      '[data-exploration-followup="cards"]',
    );
    expect(followup).not.toBeNull();
    expect(followup?.style.bottom).toBe(
      `calc(${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE_OP} + ${token("--space-9")})`,
    );
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

  it("presents four offered cards in the centered Augury choice grid without a Back button", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      new DOMRect(100, 100, 240, 336),
    );
    const base = view();
    const offeredCards = [
      "offered-a",
      "offered-b",
      "offered-c",
      "offered-d",
    ].map((entryId) => ({ entryId, model: base.card, isBane: false }));
    const followupView: ExplorationSiteView = {
      ...base,
      actions: [
        {
          ...base.actions[0],
          label: "Choose a Guide",
          followup: {
            kind: "cards",
            title: "Choose a Guide",
            subtitle: "Choose one offered card.",
            cards: offeredCards,
            mode: "single",
            selectionKey: "cardIds",
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

    const offer = container.querySelector<HTMLElement>(
      "[data-exploration-card-offer]",
    );
    expect(offer).not.toBeNull();
    expect(
      offer
        ?.querySelector("[data-card-choice-grid]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("4");
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-card-followup"]',
      ),
    ).toBeNull();
    expect(
      [...container.querySelectorAll("button")].some(
        (button) => button.textContent?.trim() === "Back",
      ),
    ).toBe(false);

    act(() =>
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-exploration-card-offered-c"]',
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
      cardIds: ["offered-c"],
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

  it("returns immediately after a choice without a tangible reward", () => {
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
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
    expect(
      container.querySelector(
        '[data-testid="cumulus-exploration-narrative-copy"]',
      ),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).toBeNull();

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
    expect(cardReturn?.querySelector('[data-card-back=""]')).not.toBeNull();
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

  it("shows a two-card reward at reading size and flies both cards to the deck", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          const offset = this.dataset.explorationRewardId?.endsWith("18")
            ? 660
            : 390;
          return new DOMRect(offset, 180, 240, 336);
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
        view={twoCardRewardView()}
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

    expect(
      container.querySelectorAll('[data-exploration-reward-object="card"]'),
    ).toHaveLength(2);
    expect(container.querySelector("[data-exploration-narrative]")).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-continue"]'),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flights = container.querySelectorAll(
      '[data-exploration-reward-flight="card"]',
    );
    expect(flights).toHaveLength(2);
    expect(
      [...flights].map((flight) =>
        flight.getAttribute("data-exploration-destination"),
      ),
    ).toEqual(["journey-deck", "journey-deck"]);
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      for (const flight of flights) {
        flight.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
      }
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("flies a gained Dreamsign to its UUID-matched HUD dock", () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this.hasAttribute("data-exploration-reward-object")) {
          return new DOMRect(520, 190, 240, 240);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const dreamsignTarget = document.createElement("span");
    dreamsignTarget.dataset.dreamsignId = "reward-dreamsign-id";
    dreamsignTarget.getBoundingClientRect = () =>
      new DOMRect(1140, 730, 58, 58);
    document.body.append(dreamsignTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={dreamsignRewardView()}
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
    expect(
      container.querySelector('[data-exploration-reward-object="dreamsign"]'),
    ).not.toBeNull();
    expect(dreamsignTarget.style.visibility).toBe("hidden");

    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    const flight = container.querySelector(
      '[data-exploration-reward-flight="dreamsign"]',
    );
    expect(flight?.getAttribute("data-exploration-destination")).toBe(
      "journey-dreamsign",
    );
    act(() => {
      flight?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(dreamsignTarget.style.visibility).toBe("");
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
