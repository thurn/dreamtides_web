// @vitest-environment jsdom

import { act } from "react";
import { assertLocalized } from "@trox/runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandMenu, type CommandMenuItem } from "./CommandMenu";
import { GLYPHS } from "../../primitives/glyph";
import { CumulusRoot } from "../../CumulusRoot";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const actions: readonly CommandMenuItem[] = [
  {
    kind: "action",
    id: "save",
    label: assertLocalized("Save"),
    glyph: GLYPHS.check,
    onCommand: () => undefined,
  },
  { kind: "divider", id: "divider" },
  {
    kind: "group",
    id: "more",
    label: assertLocalized("More"),
    glyph: GLYPHS.chevronRight,
    actions: [
      {
        kind: "action",
        id: "load",
        label: assertLocalized("Load"),
        glyph: GLYPHS.arrowRight,
        onCommand: () => undefined,
      },
    ],
  },
];

function mount(node: React.ReactNode): {
  root: Root;
  container: HTMLDivElement;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{node}</CumulusRoot>));
  return { root, container };
}

beforeEach(() => {
  window.matchMedia = (media: string) => ({
    matches: media.includes("min-width"),
    media,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("CommandMenu app-chrome model", () => {
  it("opens root actions, drills into a submenu, and invokes a leaf", () => {
    const command = vi.fn();
    const opened = vi.fn();
    const { root } = mount(
      <CommandMenu
        model={{
          kind: "appChrome",
          trigger: {
            glyph: GLYPHS.menu,
            label: assertLocalized("Open utilities"),
            corner: "topStart",
          },
          actions: [
            ...actions.slice(0, 2),
            {
              kind: "group",
              id: "more",
              label: assertLocalized("More"),
              glyph: GLYPHS.chevronRight,
              onOpen: opened,
              actions: [
                {
                  kind: "action",
                  id: "load",
                  label: assertLocalized("Load"),
                  glyph: GLYPHS.arrowRight,
                  onCommand: command,
                },
              ],
            },
          ],
        }}
      />,
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Open utilities"]')
        ?.click(),
    );
    expect(document.body.textContent).toContain("Save");
    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("More"))
        ?.click(),
    );
    expect(opened).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain("Load");
    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((button) => button.textContent?.includes("Load"))
        ?.click(),
    );
    expect(command).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });

  it("dismisses on Escape", async () => {
    const { root } = mount(
      <CommandMenu
        model={{
          kind: "appChrome",
          trigger: {
            glyph: GLYPHS.menu,
            label: assertLocalized("Open utilities"),
            corner: "topEnd",
          },
          actions,
        }}
      />,
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Open utilities"]')
        ?.click(),
    );
    await act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(document.body.textContent).not.toContain("Save");
    act(() => root.unmount());
  });
});

describe("CommandMenu context model", () => {
  it("presents narrow context commands in a root-level dialog", () => {
    window.matchMedia = (media: string) => ({
      matches: false,
      media,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    });
    const { root } = mount(
      <CommandMenu
        model={{
          kind: "context",
          title: assertLocalized("Card"),
          actions,
          anchor: { x: 12, y: 12 },
          onDismiss: () => undefined,
        }}
      />,
    );
    expect(document.querySelector('[role="dialog"]')?.parentElement).toBe(
      document.body,
    );
    expect(document.querySelector("[data-command-menu-context]")).toBeNull();
    act(() => root.unmount());
  });

  it("owns outside dismissal and keyboard submenu navigation", async () => {
    const onDismiss = vi.fn();
    const { root } = mount(
      <CommandMenu
        model={{
          kind: "context",
          title: assertLocalized("Card"),
          subtitle: assertLocalized("Player · Hand"),
          actions,
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    expect(
      document.querySelector("[data-command-menu-context]")?.parentElement,
    ).toBe(document.body);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    await act(() =>
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      ),
    );
    await act(() =>
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      ),
    );
    expect(document.body.textContent).toContain("Load");
    await act(() =>
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    await act(() =>
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    expect(onDismiss).toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("validates and commits signed whole-number field commands", () => {
    const onCommand = vi.fn<(value: number) => void>();
    const onDismiss = vi.fn();
    const integerActions: readonly CommandMenuItem[] = [
      {
        kind: "group",
        id: "spark",
        label: assertLocalized("Add Spark"),
        glyph: GLYPHS.edit,
        actions: [
          {
            kind: "signed-integer",
            id: "spark-amount",
            label: assertLocalized("Amount"),
            placeholder: assertLocalized("+3 or -2"),
            commitLabel: assertLocalized("Apply"),
            onCommand,
          },
        ],
      },
    ];
    const { root } = mount(
      <CommandMenu
        model={{
          kind: "context",
          title: assertLocalized("Card"),
          actions: integerActions,
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
        .find((button) => button.textContent?.includes("Add Spark"))
        ?.click(),
    );

    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="command-menu-signed-integer-input"]',
    );
    const apply = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Apply");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "1.5");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      apply?.click();
    });
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      "Enter a non-zero whole number.",
    );
    expect(onCommand).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(input, "-4");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      apply?.click();
    });
    expect(onCommand).toHaveBeenCalledWith(-4);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    act(() => root.unmount());
  });
});
