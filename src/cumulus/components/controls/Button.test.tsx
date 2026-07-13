// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Button } from "./Button";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Button", () => {
  it("owns centered label alignment when a caller stretches its width", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Button full label="Begin Your Dream" />);
    });

    const button = container.querySelector<HTMLButtonElement>("button");
    expect(button?.style.width).toBe("100%");
    expect(button?.style.justifyContent).toBe("center");
    expect(button?.style.textAlign).toBe("center");

    act(() => root.unmount());
  });
});
