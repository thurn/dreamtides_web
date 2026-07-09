// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DesktopDeckViewer } from "./DesktopDeckViewer";

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
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
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DesktopDeckViewer", () => {
  it("selects sort direction from a two-arrow segmented control", () => {
    const { container, root } = mount(
      <DesktopDeckViewer
        view={{ cards: [], dreamcaller: null, dreamsigns: [] }}
        onClose={vi.fn()}
      />,
    );

    const ascending = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort ascending"]',
    );
    const descending = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Sort descending"]',
    );

    expect(ascending?.textContent).toBe("↑");
    expect(descending?.textContent).toBe("↓");
    expect(ascending?.getAttribute("aria-selected")).toBe("true");
    expect(descending?.getAttribute("aria-selected")).toBe("false");

    act(() => {
      descending?.click();
    });

    expect(ascending?.getAttribute("aria-selected")).toBe("false");
    expect(descending?.getAttribute("aria-selected")).toBe("true");

    act(() => {
      root.unmount();
    });
  });
});
