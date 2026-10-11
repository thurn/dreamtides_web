// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { Select, type SelectOption } from "./Select";
import { click, keydown } from "./controls.fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Select", () => {
  const OPTIONS: SelectOption[] = Array.from({ length: 10 }, (_, index) => ({
    value: String(index),
    label: `Option ${String(index + 1)}`,
  }));

  function openWithTrigger(top: number, bottom: number): HTMLElement | null {
    const { container } = renderInCumulus(
      <Select options={OPTIONS} value="" ariaLabel="Action" />,
    );
    const trigger = container.querySelector<HTMLButtonElement>("button")!;
    trigger.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 13, y: top, width: 314, height: bottom - top });
    click(trigger);
    return document.body.querySelector<HTMLElement>('[role="listbox"]');
  }

  it("fits the menu above or below its trigger within the viewport height", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(720);

    const above = openWithTrigger(632, 674);
    expect(above?.style.top).toBe("");
    expect(above?.style.bottom).toBe("94px");
    expect(above?.style.maxHeight).toBe("626px");
    expect(above?.querySelectorAll('[role="option"]')).toHaveLength(10);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });

    const below = openWithTrigger(100, 142);
    expect(below?.style.top).toBe("148px");
    expect(below?.style.bottom).toBe("");
    expect(below?.style.maxHeight).toBe("572px");
  });

  it("stays open on menu and sibling scrolls, and closes on ancestor and page scrolls", () => {
    const menu = openWithTrigger(100, 142)!;
    const trigger = document.querySelector('[aria-haspopup="listbox"]')!;
    const sibling = document.createElement("input");
    trigger.parentElement!.append(sibling);
    act(() => {
      sibling.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBe(menu);
    act(() => {
      menu.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBe(menu);
    act(() => {
      trigger.parentElement!.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
    click(trigger);
    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBeNull();
  });

  it("navigates enabled options from the keyboard and reports a pick", () => {
    const onChange = vi.fn();
    const options: SelectOption[] = [
      { value: "first", label: "First" },
      { value: "second", label: "Second", disabled: true },
      { value: "third", label: "Third" },
    ];
    const { container } = renderInCumulus(
      <Select
        options={options}
        value="first"
        ariaLabel="Tide"
        onChange={onChange}
      />,
    );
    keydown(container.querySelector("button"), "ArrowDown");
    const menuOptions = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    expect(menuOptions[0]).toBe(document.activeElement);
    expect(menuOptions[1]?.disabled).toBe(true);
    keydown(menuOptions[0], "ArrowDown");
    expect(menuOptions[2]).toBe(document.activeElement);
    click(menuOptions[2]);
    expect(onChange).toHaveBeenCalledWith("third");
  });
});
