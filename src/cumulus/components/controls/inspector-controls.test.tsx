// @vitest-environment jsdom

import { localizationTodo } from "@trox/runtime";
import { act, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardOrderEditor } from "./CardOrderEditor";
import { DisclosureSection } from "./DisclosureSection";
import { NumberStepper } from "./NumberStepper";
import { TextField } from "./TextField";
import { CumulusRoot } from "../../CumulusRoot";

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));
});

afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("inspector Cumulus controls", () => {
  it("exposes labeled NumberStepper actions and formatted output", () => {
    const decrement = vi.fn();
    const increment = vi.fn();
    const { container, root } = mount(<NumberStepper label={localizationTodo("Energy")} value={2} displayValue={localizationTodo("2/4")} resource="energy" decrementLabel={localizationTodo("Decrease energy")} incrementLabel={localizationTodo("Increase energy")} onDecrement={decrement} onIncrement={increment} />);
    expect(container.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe("Energy");
    expect(container.querySelector("i.bxf.bx-fire-alt")).not.toBeNull();
    act(() => { (container.querySelector('button[aria-label="Decrease energy"]') as HTMLButtonElement).click(); (container.querySelector('button[aria-label="Increase energy"]') as HTMLButtonElement).click(); });
    expect(decrement).toHaveBeenCalledOnce();
    expect(increment).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("keeps DisclosureSection controlled", () => {
    function Fixture(): ReactElement { const [open, setOpen] = useState(false); return <DisclosureSection title={localizationTodo("Details")} expanded={open} onExpandedChange={setOpen}><span>Hidden body</span></DisclosureSection>; }
    const { container, root } = mount(<Fixture />);
    expect(container.textContent).not.toContain("Hidden body");
    act(() => (container.querySelector("button") as HTMLButtonElement).click());
    expect(container.textContent).toContain("Hidden body");
    act(() => root.unmount());
  });

  it("owns placement-aware DisclosureSection surface chrome", () => {
    const { container, root } = mount(<DisclosureSection title={localizationTodo("Details")} expanded={false} onExpandedChange={vi.fn()} placement="onGlass"><span>Hidden body</span></DisclosureSection>);
    const section = container.querySelector<HTMLElement>("section");
    expect(section?.dataset.glassPlacement).toBe("onGlass");
    expect(section?.style.background).toContain("var(--glass-on-glass-fill)");
    expect(section?.style.border).toContain("var(--glass-on-glass-rim)");
    act(() => root.unmount());
  });

  it("labels TextField and reports changes", () => {
    const onChange = vi.fn();
    const { container, root } = mount(<TextField label={localizationTodo("Search cards")} kind="search" value="moth" onChange={onChange} />);
    const input = container.querySelector("input") as HTMLInputElement;
    expect(input.type).toBe("search");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, "moon");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith("moon");
    act(() => root.unmount());
  });

  it("returns card instance ids from CardOrderEditor keyboard reordering", () => {
    const onOrderChange = vi.fn();
    const { container, root } = mount(<CardOrderEditor label="Deck order" items={[{ id: "instance-a", label: "A" }, { id: "instance-b", label: "B" }]} onOrderChange={onOrderChange} />);
    const handle = container.querySelector<HTMLButtonElement>('[data-card-order-drag-handle="instance-b"]');
    expect(handle?.querySelector("i.fa-grip-vertical")).not.toBeNull();
    act(() => {
      handle?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    });
    expect(onOrderChange).toHaveBeenCalledWith(["instance-b", "instance-a"]);
    act(() => root.unmount());
  });

  it("owns standalone CardOrderEditor surface chrome by default", () => {
    const { container, root } = mount(<CardOrderEditor label="Deck order" items={[{ id: "instance-a", label: "A" }]} onOrderChange={vi.fn()} />);
    const editor = container.querySelector<HTMLElement>('[role="list"]');
    expect(editor?.dataset.glassPlacement).toBe("onMedia");
    expect(editor?.style.background).toContain("var(--glass-fill)");
    expect(editor?.style.border).toContain("var(--glass-rim)");
    act(() => root.unmount());
  });
});
