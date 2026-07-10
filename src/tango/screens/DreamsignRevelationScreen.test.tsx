// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dreamsign } from "../../types/quest";
import { artRef } from "../primitives/art";
import {
  DreamsignRevelationScreen,
  type DreamsignRevelationView,
} from "./DreamsignRevelationScreen";
import { QUEST_STATUS_BAR_CLEARANCE_OP } from "../components/hud/QuestStatusBar";

function dreamsign(id: string, imageName: string): Dreamsign {
  return {
    id,
    name: `Dreamsign ${id}`,
    effectDescription: "A test effect.",
    imageName,
    imageAlt: `Art for ${id}`,
    isBane: false,
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
    hud: {
      essence: 200,
      deck: 30,
      dreamsigns: [],
    },
    purge: null,
  };
}

function stubMatchMedia(matches = false): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
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
    root.render(element);
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
  document.body.innerHTML = "";
});

describe("DreamsignRevelationScreen", () => {
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
      `calc(${QUEST_STATUS_BAR_CLEARANCE_OP})`,
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
    expect(offer?.style.gap).toBe("var(--space-12)");
    expect(decline?.style.borderColor).toBe("");

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

    act(() => {
      center?.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });

    expect(center?.style.filter).toBe("none");
    expect(center?.style.transform).toBe("scale(0.9)");

    act(() => {
      center?.dispatchEvent(new Event("pointerup", { bubbles: true }));
      root.unmount();
    });
  });
});
