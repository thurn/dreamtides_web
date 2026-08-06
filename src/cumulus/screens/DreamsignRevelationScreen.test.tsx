// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dreamsign } from "../../types/journey";
import { artRef } from "../primitives/art";
import {
  DreamsignRevelationScreen,
  type DreamsignRevelationView,
} from "./DreamsignRevelationScreen";
import { JOURNEY_STATUS_BAR_CLEARANCE_OP } from "../components/hud/JourneyStatusBar";
import { CumulusRoot } from "../CumulusRoot";

function dreamsign(id: string, imageName: string): Dreamsign {
  return {
    id,
    name: `Dreamsign ${id}`,
    effectDescription: "A test effect.",
    imageName,
    imageAlt: `Art for ${id}`,
    isNegative: false,
  };
}

function view(): DreamsignRevelationView {
  return {
    scene: null,
    guide: {
      id: "sigrun",
      name: "Sigrun",
      line: "Choose one sign.",
      art: artRef.dreamGuide("sigrun"),
    },
    offer: [
      dreamsign("left", "eye_3.png"),
      dreamsign("center", "book_11.png"),
      dreamsign("right", "rosemary.png"),
    ],
    offerReady: true,
    purge: null,
  };
}

function stubMatchMedia(matches = false): void {
  window.matchMedia = (query: string) => ({
    matches,
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

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
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

describe("DreamsignRevelationScreen", () => {
  it("waits one second before revealing Mira below the desktop app chrome", () => {
    vi.useFakeTimers();
    stubMatchMedia(true);
    const onTutorialShown = vi.fn();
    const tutorialView: DreamsignRevelationView = {
      ...view(),
      tutorial: {
        id: "run-a:first-visit:revelation-a:DreamsignRevelation",
        model: {
          portrait: { kind: "character-portrait", characterId: "mira" },
          portraitAlt: "Mira",
          speakerName: "Mira",
          text: "A [purple]Dreamsign[/purple] gives ongoing benefits.",
        },
        delaySeconds: 1,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 600,
      },
    };
    const { container, root } = mount(
      <DreamsignRevelationScreen
        view={tutorialView}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
        onTutorialShown={onTutorialShown}
      />,
    );

    expect(
      container.querySelector('[data-testid="revelation-site-tutorial-dialogue"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="revelation-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="revelation-speech-bubble"]')
        ?.textContent,
    ).toContain("Choose one sign.");
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(
      container.querySelector('[data-testid="revelation-site-tutorial-dialogue"]'),
    ).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector('[data-testid="revelation-site-tutorial-dialogue"]')
        ?.textContent,
    ).toContain("A Dreamsign gives ongoing benefits.");
    expect(
      container.querySelector<HTMLElement>("[data-revelation-site-tutorial]")
        ?.style.top,
    ).toBe("var(--space-s)");
    expect(onTutorialShown).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[data-testid="revelation-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="revelation-speech-bubble"]')
        ?.textContent,
    ).toContain("Choose one sign.");
    expect(container.querySelectorAll("[data-revelation-option]")).toHaveLength(3);

    act(() => root.unmount());
  });

  it("keeps unavailable choices focusable and revealable while suppressing keyboard activation", () => {
    const onClaim = vi.fn();
    const { container, root } = mount(
      <DreamsignRevelationScreen view={view()} claimedIndex={0} onClaim={onClaim} onSkip={vi.fn()} onPurge={vi.fn()} onCancelPurge={vi.fn()} />,
    );
    const source = container.querySelector<HTMLElement>('[data-testid="dreamsign-revelation-art-1"]')!;
    expect(source.tabIndex).toBe(0);
    expect(source.getAttribute("aria-disabled")).toBe("true");
    act(() => source.focus());
    expect(source.dataset.revealActive).toBe("true");
    act(() => { source.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onClaim).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("centers the mobile decline action between the offer and status bar", () => {
    const { container, root } = mount(
      <DreamsignRevelationScreen
        view={view()}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    const region = container.querySelector<HTMLElement>(
      "[data-revelation-mobile-offer-region]",
    );
    const offer = container.querySelector<HTMLElement>(
      "[data-revelation-offer]",
    );
    const declineSlot = container.querySelector<HTMLElement>(
      "[data-revelation-decline-slot]",
    );

    expect(region?.style.bottom).toBe(
      `calc(${JOURNEY_STATUS_BAR_CLEARANCE_OP})`,
    );
    expect(offer?.style.gridTemplateRows).toBe("auto minmax(0, 1fr)");
    expect(offer?.style.height).toBe("100%");
    expect(declineSlot?.style.placeItems).toBe("center");

    act(() => {
      root.unmount();
    });
  });

  it("uses a neutral decline action with the desktop spacing step", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <DreamsignRevelationScreen
        view={view()}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    const offer = container.querySelector<HTMLElement>(
      "[data-revelation-offer]",
    );
    const decline = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Decline Offer"),
    );
    expect(offer?.style.gap).toBe("var(--space-6xl)");
    expect(decline?.style.borderColor).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("uses purple accent glass actions for dreamsign replacement", () => {
    const replacementView: DreamsignRevelationView = {
      ...view(),
      purge: {
        pendingDreamsign: dreamsign("pending", "aurora.png"),
        currentDreamsigns: [dreamsign("owned", "eye_3.png")],
        maxDreamsigns: 1,
      },
    };
    const { container, root } = mount(
      <DreamsignRevelationScreen
        view={replacementView}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    const replace = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Replace",
    );
    expect(replace?.dataset.glassVariant).toBe("accent");

    act(() => {
      root.unmount();
    });
  });

  it("renders offer dreamsigns without the revelation shadow", () => {
    const { container, root } = mount(
      <DreamsignRevelationScreen
        view={view()}
        claimedIndex={null}
        onClaim={vi.fn()}
        onSkip={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    const center = container.querySelector<HTMLElement>(
      '[data-testid="dreamsign-revelation-art-1"]',
    );
    expect(center).not.toBeNull();
    expect(center?.style.filter).toBe("none");

    expect(center?.style.filter).toBe("none");
    expect(center?.dataset.revealFeedback).toBe("measured");

    act(() => {
      root.unmount();
    });
  });
});
