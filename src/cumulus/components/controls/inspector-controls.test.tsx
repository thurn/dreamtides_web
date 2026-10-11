// @vitest-environment jsdom

// Inspector controls: NumberStepper, DisclosureSection, TextField, and
// CardOrderEditor.
import { act, useState, type ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../../testing/render";
import { CardOrderEditor } from "./CardOrderEditor";
import { DisclosureSection } from "./DisclosureSection";
import { NumberStepper } from "./NumberStepper";
import { TextField } from "./TextField";
import { click, keydown } from "./controls.fixtures";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
