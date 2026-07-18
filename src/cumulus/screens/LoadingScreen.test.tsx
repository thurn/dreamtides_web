// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { LoadingScreen, type LoadingView } from "./LoadingScreen";

vi.mock("framer-motion", () => {
  function element(tag: string) {
    return ({
      animate,
      children,
      initial,
      onAnimationComplete: _onAnimationComplete,
      transition,
      ...props
    }: {
      readonly animate?: unknown;
      readonly children?: ReactNode;
      readonly initial?: unknown;
      readonly onAnimationComplete?: () => void;
      readonly transition?: unknown;
    }) =>
      createElement(
        tag,
        {
          ...props,
          "data-motion-animate": JSON.stringify(animate),
          "data-motion-initial": JSON.stringify(initial),
          "data-motion-transition": JSON.stringify(transition),
        },
        children,
      );
  }

  return {
    motion: {
      main: element("main"),
      blockquote: element("blockquote"),
      figcaption: element("figcaption"),
      span: element("span"),
    },
    useReducedMotion: () => false,
  };
});

const VIEW: LoadingView = {
  quote:
    "“I looked, and there before me was a pale horse, and its rider was named Death.”",
  attribution: "— Revelation 6:8",
  loadingLabel: "Loading",
};

let root: Root | null = null;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(min-width: 900px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("LoadingScreen", () => {
  it("renders the centered verse, delayed attribution, and repeating dots", () => {
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <CumulusRoot>
          <LoadingScreen view={VIEW} />
        </CumulusRoot>,
      ),
    );

    const screen = container.querySelector<HTMLElement>("[data-loading-screen]");
    const quote = container.querySelector<HTMLElement>("[data-loading-quote]");
    const quoteText = container.querySelector<HTMLElement>(
      "[data-loading-quote-text]",
    );
    const attribution = container.querySelector<HTMLElement>(
      "[data-loading-attribution]",
    );
    const indicator = container.querySelector<HTMLElement>(
      "[data-loading-indicator]",
    );

    expect(screen?.style.background).toBe("var(--bg-loading)");
    expect(JSON.parse(screen?.dataset.motionTransition ?? "{}"))
      .toMatchObject({ duration: 1.2 });
    expect(quote?.textContent).toBe(VIEW.quote);
    expect(quote?.style.textAlign).toBe("center");
    expect(quoteText?.style.fontStyle).toBe("italic");
    expect(attribution?.textContent).toBe(VIEW.attribution);
    expect(attribution?.style.textAlign).toBe("right");
    expect(JSON.parse(quote?.dataset.motionTransition ?? "{}"))
      .toMatchObject({ delay: 0, duration: 1.4 });
    expect(JSON.parse(attribution?.dataset.motionTransition ?? "{}"))
      .toMatchObject({ delay: 3.4, duration: 0.8 });
    expect(indicator?.getAttribute("aria-label")).toBe("Loading...");
    expect(container.querySelectorAll("[data-loading-dot]")).toHaveLength(3);
  });
});
