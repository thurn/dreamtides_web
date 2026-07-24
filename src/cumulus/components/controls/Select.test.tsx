// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Select, type SelectOption } from "./Select";

const OPTIONS: SelectOption[] = Array.from({ length: 10 }, (_, index) => ({
  value: String(index),
  label: `Option ${String(index + 1)}`,
}));

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

function rect({
  top,
  bottom,
}: {
  top: number;
  bottom: number;
}): DOMRect {
  return {
    top,
    bottom,
    left: 13,
    right: 327,
    width: 314,
    height: bottom - top,
    x: 13,
    y: top,
    toJSON: () => ({}),
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Select", () => {
  it("opens above a trigger near the bottom of the viewport", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    const { container, root } = mount(
      <Select options={OPTIONS} value="" ariaLabel="Action" />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button");
    if (trigger === null) throw new Error("Select trigger did not render");
    trigger.getBoundingClientRect = () => rect({ top: 632, bottom: 674 });

    act(() => trigger.click());

    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    expect(menu?.style.top).toBe("");
    expect(menu?.style.bottom).toBe("94px");
    expect(menu?.style.maxHeight).toBe("626px");
    expect(menu?.style.overflowY).toBe("auto");
    expect(menu?.querySelectorAll('[role="option"]')).toHaveLength(10);

    act(() => root.unmount());
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("constrains a downward menu to the available viewport height", () => {
    const originalInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });
    const { container, root } = mount(
      <Select options={OPTIONS} value="" ariaLabel="Action" />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button");
    if (trigger === null) throw new Error("Select trigger did not render");
    trigger.getBoundingClientRect = () => rect({ top: 100, bottom: 142 });

    act(() => trigger.click());

    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    expect(menu?.style.top).toBe("148px");
    expect(menu?.style.bottom).toBe("");
    expect(menu?.style.maxHeight).toBe("572px");

    act(() => root.unmount());
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });
});
