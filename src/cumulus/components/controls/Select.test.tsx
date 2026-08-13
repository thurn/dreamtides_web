// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { Select, type SelectOption } from "./Select";

const OPTIONS: SelectOption[] = Array.from({ length: 10 }, (_, index) => ({
  value: String(index),
  label: assertLocalized(`Option ${String(index + 1)}`),
}));

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

function rect({ top, bottom }: { top: number; bottom: number }): DOMRect {
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
    window.matchMedia = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    });
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
      <Select
        options={OPTIONS}
        value=""
        ariaLabel={assertLocalized("Action")}
      />,
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
      <Select
        options={OPTIONS}
        value=""
        ariaLabel={assertLocalized("Action")}
      />,
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

  it("keeps the menu open while its options scroll", () => {
    const { container, root } = mount(
      <Select
        options={OPTIONS}
        value=""
        ariaLabel={assertLocalized("Action")}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button");
    if (trigger === null) throw new Error("Select trigger did not render");

    act(() => trigger.click());
    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    if (menu === null) throw new Error("Select menu did not render");

    act(() => {
      menu.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBe(menu);

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();

    act(() => root.unmount());
  });

  it("navigates enabled options from the keyboard", () => {
    const options: SelectOption[] = [
      { value: "first", label: assertLocalized("First tide") },
      {
        value: "second",
        label: assertLocalized("Second tide"),
        disabled: true,
      },
      { value: "third", label: assertLocalized("Third tide") },
    ];
    const { container, root } = mount(
      <Select
        options={options}
        value="first"
        ariaLabel={assertLocalized("Tide")}
      />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button");
    if (trigger === null) throw new Error("Select trigger did not render");

    act(() => {
      trigger.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    const menu = document.body.querySelector<HTMLElement>('[role="listbox"]');
    const menuOptions = [
      ...(menu?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []),
    ];
    expect(menuOptions[0]).toBe(document.activeElement);
    expect(menuOptions[1]?.disabled).toBe(true);

    act(() => {
      menuOptions[0]?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });
    expect(menuOptions[2]).toBe(document.activeElement);

    act(() => root.unmount());
  });
});
