// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Select, type SelectOption } from "./Select";
import { renderInCumulus } from "../../testing/render";

const OPTIONS: SelectOption[] = Array.from({ length: 10 }, (_, index) => ({
  value: String(index),
  label: assertLocalized(`Option ${String(index + 1)}`),
}));

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
    const { container, root } = renderInCumulus(
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
    const { container, root } = renderInCumulus(
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
    const { container } = renderInCumulus(
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
    const { container } = renderInCumulus(
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
  });
});
