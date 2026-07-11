// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { TangoRoot } from "../../tango/TangoRoot";
import type { JourneyCardObject } from "./offerPresentation";
import { JourneyCard } from "./JourneyCard";

const ID = asCardId("77777777-7777-4777-8777-777777777777");
const object: JourneyCardObject = {
  objectType: "catalogCard",
  cardUuid: ID,
  cardNumber: 7,
  displayName: "Journey Sentry",
  card: {
    id: ID, name: asCardName("Journey Sentry"), cardNumber: 7,
    cardType: "Character", subtype: "Guide", isStarter: false,
    energyCost: 1, spark: 2, isFast: false, renderedText: "Bane.",
    imageNumber: 7, artOwned: false,
  },
};

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  delete (globalThis as Partial<typeof globalThis>).ResizeObserver;
});

describe("JourneyCard", () => {
  it("uses the named GameCard coordinator path for reading and activation", () => {
    const activate = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<TangoRoot><JourneyCard object={object} widthPx={120} onClick={activate} testId="journey-card" /></TangoRoot>));
    const source = container.querySelector<HTMLElement>("[data-game-card-source]")!;
    expect(source.dataset.cardId).toBe(ID);
    expect(container.querySelector("[data-journey-card-zoom]")).toBeNull();
    void act(() => source.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse", pointerId: 1 })));
    expect(source.dataset.revealActive).toBe("true");
    act(() => source.click());
    expect(activate).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
