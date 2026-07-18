// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CornerUtilityMenu, ContextActionMenu, type CommandMenuItem } from "./CommandMenus";
import { GLYPHS } from "../../primitives/glyph";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const actions: readonly CommandMenuItem[] = [
  { kind: "action", id: "save", label: "Save", glyph: GLYPHS.check, onCommand: () => undefined },
  { kind: "divider", id: "divider" },
  { kind: "group", id: "more", label: "More", glyph: GLYPHS.chevronRight, actions: [
    { kind: "action", id: "load", label: "Load", glyph: GLYPHS.arrowRight, onCommand: () => undefined },
  ] },
  { kind: "action", id: "disabled", label: "Unavailable", glyph: GLYPHS.lock, disabled: true, onCommand: () => undefined },
];

function mount(node: React.ReactNode): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { root, container };
}

afterEach(() => { document.body.innerHTML = ""; });

describe("CornerUtilityMenu", () => {
  it("opens root actions, drills into a submenu, and invokes a leaf", () => {
    const command = vi.fn();
    const opened = vi.fn();
    const { root } = mount(<CornerUtilityMenu trigger={{ glyph: GLYPHS.menu, label: "Open utilities", corner: "topStart" }} actions={[
      ...actions.slice(0, 2),
      { kind: "group", id: "more", label: "More", glyph: GLYPHS.chevronRight, onOpen: opened, actions: [{ kind: "action", id: "load", label: "Load", glyph: GLYPHS.arrowRight, onCommand: command }] },
    ]} />);
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Open utilities"]')?.click());
    expect(document.body.textContent).toContain("Save");
    act(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("More"))?.click());
    expect(opened).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Load");
    act(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Load"))?.click());
    expect(command).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("dismisses on Escape and keeps disabled commands inert", async () => {
    const command = vi.fn();
    const { root } = mount(<CornerUtilityMenu trigger={{ glyph: GLYPHS.menu, label: "Open utilities", corner: "topEnd" }} actions={[{ kind: "action", id: "disabled", label: "Unavailable", glyph: GLYPHS.lock, disabled: true, onCommand: command }]} />);
    act(() => document.querySelector<HTMLButtonElement>('[aria-label="Open utilities"]')?.click());
    act(() => [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent?.includes("Unavailable"))?.click());
    expect(command).not.toHaveBeenCalled();
    await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.body.textContent).not.toContain("Unavailable");
    act(() => root.unmount());
  });
});

describe("ContextActionMenu", () => {
  it("owns outside dismissal and keyboard submenu navigation", async () => {
    const onDismiss = vi.fn();
    const { root } = mount(<ContextActionMenu title="Card" subtitle="Player · Hand" actions={actions} anchor={{ kind: "point", x: 12, y: 12 }} onDismiss={onDismiss} />);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    await act(() => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await act(() => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(document.body.textContent).toContain("Load");
    await act(() => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    await act(() => menu?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onDismiss).toHaveBeenCalled();
    act(() => root.unmount());
  });
});
