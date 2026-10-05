// @vitest-environment jsdom

import { act, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../../primitives/glyph";
import { transfigurationPresentationFixture } from "../../test-helpers/transfiguration-fixture";
import { renderInCumulus } from "../../testing/render";
import { CardOrderEditor } from "./CardOrderEditor";
import { DisclosureSection } from "./DisclosureSection";
import { GlassButton } from "./GlassButton";
import { IconButton } from "./IconButton";
import { MainMenuButton } from "./MainMenuButton";
import { NumberStepper } from "./NumberStepper";
import { Select, type SelectOption } from "./Select";
import { StandaloneGlyph } from "./StandaloneGlyph";
import { TextField } from "./TextField";
import { TransfigurationButton } from "./TransfigurationButton";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function click(element: Element | null | undefined): void {
  act(() => {
    (element as HTMLElement | null | undefined)?.click();
  });
}

function keydown(element: Element | null | undefined, key: string): void {
  act(() => {
    element?.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true }),
    );
  });
}

function pointer(
  type: "pointerdown" | "pointerup" | "pointerover",
  pointerType: "mouse" | "touch",
  pointerId: number,
  timeStamp = 0,
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    clientX: 120,
    clientY: 80,
  });
  Object.defineProperties(event, {
    pointerType: { value: pointerType },
    pointerId: { value: pointerId },
    timeStamp: { value: timeStamp },
  });
  return event;
}

describe("GlassButton", () => {
  it("fires onPress, exposes pressed state, and blocks disabled presses", () => {
    const onPress = vi.fn();
    const { container, rerender } = renderInCumulus(
      <GlassButton label="Apply" pressed onPress={onPress} />,
    );
    const button = container.querySelector("button")!;
    expect(button.getAttribute("aria-pressed")).toBe("true");
    click(button);
    expect(onPress).toHaveBeenCalledOnce();

    rerender(<GlassButton label="Apply" disabled onPress={onPress} />);
    expect(button.getAttribute("aria-disabled")).toBe("true");
    click(button);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("renders an optional essence cost under a distinct accessible name", () => {
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label="Choose"
        essenceCost={50}
        accessibilityLabel="Choose for 50"
        onPress={() => {}}
      />,
    );
    const button = container.querySelector("button")!;
    expect(
      button.querySelector("[data-glass-button-essence-cost]")?.textContent,
    ).toContain("50");
    expect(button.getAttribute("aria-label")).toBe("Choose for 50");

    rerender(
      <GlassButton label="Choose" essenceCost={null} onPress={() => {}} />,
    );
    expect(
      container.querySelector("[data-glass-button-essence-cost]"),
    ).toBeNull();
  });

  it("keeps its width reservations stable while the label changes", () => {
    const reservations = [
      { label: "Decline", essenceCost: null },
      { label: "Purge 1", essenceCost: 40 },
      { label: "Purge 2", essenceCost: 100 },
    ] as const;
    const { container, rerender } = renderInCumulus(
      <GlassButton
        label="Decline"
        widthReservations={reservations}
        onPress={() => {}}
      />,
    );
    const read = () =>
      Array.from(
        container.querySelectorAll("[data-glass-button-width-reservation]"),
        (candidate) => candidate.textContent,
      );
    const initial = read();
    expect(initial).toHaveLength(reservations.length);
    rerender(
      <GlassButton
        label="Purge 2"
        essenceCost={100}
        widthReservations={reservations}
        onPress={() => {}}
      />,
    );
    expect(read()).toEqual(initial);
  });
});

describe("IconButton and MainMenuButton", () => {
  it("fire onPress and block disabled presses", () => {
    const onIcon = vi.fn();
    const onMenu = vi.fn();
    const { container, rerender } = renderInCumulus(
      <>
        <IconButton glyph={GLYPHS.close} label="Close" onPress={onIcon} />
        <MainMenuButton label="Menu" onPress={onMenu} />
      </>,
    );
    const [icon, menu] = container.querySelectorAll("button");
    expect(icon?.getAttribute("aria-label")).toBe("Close");
    click(icon);
    click(menu);
    expect(onIcon).toHaveBeenCalledOnce();
    expect(onMenu).toHaveBeenCalledOnce();

    rerender(
      <IconButton
        glyph={GLYPHS.close}
        label="Close"
        onPress={onIcon}
        disabled
      />,
    );
    const disabled = container.querySelector("button");
    expect(disabled?.getAttribute("aria-disabled")).toBe("true");
    click(disabled);
    expect(onIcon).toHaveBeenCalledOnce();
  });
});

describe("StandaloneGlyph", () => {
  it("uses an explicit label or hides a decorative mark", () => {
    const { container } = renderInCumulus(
      <>
        <StandaloneGlyph
          glyph={GLYPHS.bolt}
          color="text-primary"
          label="Fast"
        />
        <StandaloneGlyph glyph={GLYPHS.bolt} color="text-primary" />
      </>,
    );
    expect(
      container.querySelector('[role="img"]')?.getAttribute("aria-label"),
    ).toBe("Fast");
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe("TransfigurationButton", () => {
  const empowered = {
    type: "Empowered" as const,
    presentation: transfigurationPresentationFixture("Empowered"),
    pricing: { kind: "unpriced" as const },
  };

  it("reveals its glossary form on pointer inspection and reports its form type", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
      DOMRect.fromRect({ x: 100, y: 100, width: 248, height: 110 }),
    );
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationButton
        form={empowered}
        layout="compact"
        selected={false}
        onPress={onPress}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(button.dataset.revealEntityType).toBe("glossary-term");
    expect(button.dataset.revealEntityId).toBe(
      empowered.presentation.glossaryUuid,
    );
    expect(button.getAttribute("aria-label")?.trim()).not.toBe("");
    act(() => {
      button.dispatchEvent(pointer("pointerover", "mouse", 1));
    });
    await vi.waitFor(() =>
      expect(
        document.querySelector('[data-cumulus-reveal-card="primary"]'),
      ).not.toBeNull(),
    );
    click(button);
    expect(onPress).toHaveBeenCalledWith("Empowered");
  });

  it("blocks unaffordable priced activation", () => {
    const onPress = vi.fn();
    const { container } = renderInCumulus(
      <TransfigurationButton
        form={{
          ...empowered,
          pricing: { kind: "essence", amount: 40, affordable: false },
        }}
        layout="wide"
        selected
        onPress={onPress}
      />,
    );
    const button = container.querySelector<HTMLButtonElement>("button")!;
    expect(
      button.querySelector("[data-transfiguration-button-price]"),
    ).not.toBeNull();
    expect(button.getAttribute("aria-disabled")).toBe("true");
    click(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("inspector controls", () => {
  it("NumberStepper exposes labeled decrement and increment actions", () => {
    const decrement = vi.fn();
    const increment = vi.fn();
    const { container } = renderInCumulus(
      <NumberStepper
        label="Energy"
        value={2}
        decrementLabel="Decrease"
        incrementLabel="Increase"
        onDecrement={decrement}
        onIncrement={increment}
      />,
    );
    expect(
      container.querySelector('[role="group"]')?.getAttribute("aria-label"),
    ).toBe("Energy");
    click(container.querySelector('button[aria-label="Decrease"]'));
    click(container.querySelector('button[aria-label="Increase"]'));
    expect(decrement).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledOnce();
  });

  it("DisclosureSection stays controlled", () => {
    function Fixture(): ReactElement {
      const [open, setOpen] = useState(false);
      return (
        <DisclosureSection
          title="Details"
          expanded={open}
          onExpandedChange={setOpen}
        >
          <span data-testid="disclosure-body" />
        </DisclosureSection>
      );
    }
    const { container } = renderInCumulus(<Fixture />);
    const body = () =>
      container.querySelector('[data-testid="disclosure-body"]');
    expect(body()).toBeNull();
    click(container.querySelector("button"));
    expect(body()).not.toBeNull();
  });

  it("TextField reports changes and commits once on Enter and on blur", () => {
    const onChange = vi.fn();
    const onCommit = vi.fn();
    const { container } = renderInCumulus(
      <TextField
        label="Search"
        kind="search"
        value="draft"
        onChange={onChange}
        onCommit={onCommit}
      />,
    );
    const input = container.querySelector("input")!;
    expect(input.type).toBe("search");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "moon");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("moon");

    input.focus();
    keydown(input, "Enter");
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("draft");

    input.focus();
    act(() => {
      input.blur();
    });
    expect(onCommit).toHaveBeenCalledTimes(2);
  });

  it("CardOrderEditor returns card instance ids from keyboard reordering", () => {
    const onOrderChange = vi.fn();
    const { container } = renderInCumulus(
      <CardOrderEditor
        label="Deck order"
        items={[
          { id: "instance-a", label: "A" },
          { id: "instance-b", label: "B" },
        ]}
        onOrderChange={onOrderChange}
      />,
    );
    keydown(
      container.querySelector('[data-card-order-drag-handle="instance-b"]'),
      "ArrowUp",
    );
    expect(onOrderChange).toHaveBeenCalledWith(["instance-b", "instance-a"]);
  });
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

  it("stays open while its options scroll and closes on page scroll", () => {
    const menu = openWithTrigger(100, 142)!;
    act(() => {
      menu.dispatchEvent(new Event("scroll"));
    });
    expect(document.body.querySelector('[role="listbox"]')).toBe(menu);
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
