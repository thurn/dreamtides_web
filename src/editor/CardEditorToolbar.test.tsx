// @vitest-environment jsdom

import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardEditorToolbar from "./CardEditorToolbar";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import type { EditorDisplayState } from "./types";

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

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (valueDescriptor?.set === undefined) {
    throw new Error("Missing input value setter");
  }
  const setValue = valueDescriptor.set.bind(input);
  setValue(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  );
  if (valueDescriptor?.set === undefined) {
    throw new Error("Missing select value setter");
  }
  const setValue = valueDescriptor.set.bind(select);
  setValue(value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function StatefulToolbar({
  onChange,
}: {
  onChange?: (state: EditorDisplayState) => void;
}) {
  const [displayState, setDisplayState] = useState(DEFAULT_EDITOR_DISPLAY_STATE);

  return (
    <CardEditorToolbar
      displayState={displayState}
      subtypeOptions={["Guide", "Scout"]}
      availableTags={[]}
      availableTides={[]}
      onOpenManageTags={vi.fn()}
      onOpenManageTides={vi.fn()}
      visibleCount={2}
      totalCount={5}
      checkboxTagCount={0}
      onDisplayStateChange={(nextState) => {
        setDisplayState(nextState);
        onChange?.(nextState);
      }}
    />
  );
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("CardEditorToolbar", () => {
  it("renders toolbar controls and the filtered count", () => {
    const { container, root } = mount(
      <CardEditorToolbar
        displayState={DEFAULT_EDITOR_DISPLAY_STATE}
        subtypeOptions={["Guide", "Scout"]}
      availableTags={[]}
      availableTides={[]}
      onOpenManageTags={vi.fn()}
      onOpenManageTides={vi.fn()}
        visibleCount={2}
        totalCount={5}
        checkboxTagCount={0}
        onDisplayStateChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[aria-label="Search cards"]')).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Card editor controls"]')?.classList,
    ).toContain("card-editor-toolbar");
    expect(container.textContent).toContain("All");
    expect(container.textContent).toContain("Characters");
    expect(container.textContent).toContain("Events");
    expect(container.querySelector('[aria-label="Cost filter"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Subtype filter"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sort field"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Sort direction"]')).not.toBeNull();
    expect(container.textContent).toContain("Small");
    expect(container.textContent).toContain("Medium");
    expect(container.textContent).toContain("Large");
    expect(container.textContent).toContain("2 / 5 cards");

    act(() => {
      root.unmount();
    });
  });

  it("echoes typed search text immediately", () => {
    const onChange = vi.fn();
    const { container, root } = mount(<StatefulToolbar onChange={onChange} />);
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Search cards"]',
    );

    if (input === null) {
      throw new Error("Missing search input");
    }

    act(() => {
      setInputValue(input, "moon");
    });

    expect(input.value).toBe("moon");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      searchText: "moon",
    });

    act(() => {
      root.unmount();
    });
  });

  it("toggles glossary info cards on hover", () => {
    const onChange = vi.fn();
    const { container, root } = mount(<StatefulToolbar onChange={onChange} />);
    const checkbox = container.querySelector<HTMLInputElement>(
      '[aria-label="Show glossary info cards on hover"]',
    );

    if (checkbox === null) {
      throw new Error("Missing glossary hover checkbox");
    }

    act(() => checkbox.click());

    expect(checkbox.checked).toBe(true);
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      showGlossaryInfoOnHover: true,
    });

    act(() => root.unmount());
  });

  it("updates segmented, select, and direction controls", () => {
    const onChange = vi.fn();
    const { container, root } = mount(<StatefulToolbar onChange={onChange} />);
    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Type filter"]',
    );
    const costSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Cost filter"]',
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    const sortSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Sort field"]',
    );
    const directionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Sort direction"]',
    );
    const largeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Large",
    );

    if (
      typeSelect === null ||
      costSelect === null ||
      subtypeSelect === null ||
      sortSelect === null ||
      directionButton === null ||
      largeButton === undefined
    ) {
      throw new Error("Missing toolbar control");
    }

    act(() => {
      setSelectValue(typeSelect, "character");
    });
    expect(typeSelect.value).toBe("character");

    act(() => {
      setSelectValue(costSelect, "x");
    });
    act(() => {
      setSelectValue(subtypeSelect, "Scout");
    });
    act(() => {
      setSelectValue(sortSelect, "spark");
    });
    act(() => {
      directionButton.click();
    });
    act(() => {
      largeButton.click();
    });

    expect(costSelect.value).toBe("x");
    expect(subtypeSelect.value).toBe("Scout");
    expect(sortSelect.value).toBe("spark");
    expect(directionButton.getAttribute("aria-pressed")).toBe("true");
    expect(directionButton.getAttribute("title")).toBe("Descending");
    expect(largeButton.getAttribute("aria-pressed")).toBe("true");
    expect(onChange).toHaveBeenLastCalledWith({
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      type: "character",
      cost: "x",
      subtype: "Scout",
      sort: "spark",
      dir: "desc",
      size: "large",
    });

    act(() => {
      root.unmount();
    });
  });

  it("keeps the active subtype visible when it is not in loaded options", () => {
    const displayState = {
      ...DEFAULT_EDITOR_DISPLAY_STATE,
      subtype: "Visionary",
    };
    const { container, root } = mount(
      <CardEditorToolbar
        displayState={displayState}
        subtypeOptions={["Guide", "Scout"]}
      availableTags={[]}
      availableTides={[]}
      onOpenManageTags={vi.fn()}
      onOpenManageTides={vi.fn()}
        visibleCount={0}
        totalCount={5}
        checkboxTagCount={0}
        onDisplayStateChange={vi.fn()}
      />,
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );

    if (subtypeSelect === null) {
      throw new Error("Missing subtype filter");
    }

    expect(subtypeSelect.value).toBe("Visionary");
    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      "Visionary",
      "Guide",
      "Scout",
    ]);

    act(() => {
      root.unmount();
    });
  });

  it("omits blank loaded subtype options", () => {
    const { container, root } = mount(
      <CardEditorToolbar
        displayState={DEFAULT_EDITOR_DISPLAY_STATE}
        subtypeOptions={["", "Guide", "  ", "Scout"]}
        availableTags={[]}
        availableTides={[]}
        onOpenManageTags={vi.fn()}
        onOpenManageTides={vi.fn()}
        visibleCount={2}
        totalCount={5}
        checkboxTagCount={0}
        onDisplayStateChange={vi.fn()}
      />,
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );

    if (subtypeSelect === null) {
      throw new Error("Missing subtype filter");
    }

    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      "Guide",
      "Scout",
    ]);

    act(() => {
      root.unmount();
    });
  });
});
