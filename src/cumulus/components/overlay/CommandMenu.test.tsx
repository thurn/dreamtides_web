// @vitest-environment jsdom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasInjectedDisplayCutout } from "../../../runtime/device-frame";
import { GLYPHS } from "../../primitives/glyph";
import { renderInCumulus } from "../../testing/render";
import { CommandMenu, type CommandMenuItem } from "./CommandMenu";
import { click, stubMatchMedia } from "./overlay.fixtures";

vi.mock("../../../runtime/device-frame", () => ({
  hasInjectedDisplayCutout: vi.fn(() => false),
}));

function keydown(target: EventTarget | null | undefined, key: string): void {
  act(() => {
    target?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

beforeEach(() => {
  vi.mocked(hasInjectedDisplayCutout).mockReturnValue(false);
  stubMatchMedia(false);
});

function commandActions(onLoad: () => void): readonly CommandMenuItem[] {
  return [
    {
      kind: "action",
      id: "save",
      label: "Save",
      glyph: GLYPHS.check,
      onCommand: () => undefined,
    },
    { kind: "divider", id: "divider" },
    {
      kind: "group",
      id: "more",
      label: "More",
      glyph: GLYPHS.chevronRight,
      actions: [
        {
          kind: "action",
          id: "load",
          label: "Load",
          glyph: GLYPHS.arrowRight,
          onCommand: onLoad,
        },
      ],
    },
  ];
}

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes(text),
  );
}

describe("CommandMenu", () => {
  beforeEach(() => {
    stubMatchMedia(true);
  });

  it("opens app-chrome actions, dismisses on Escape, and invokes a submenu leaf", () => {
    const command = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "appChrome",
          trigger: { glyph: GLYPHS.menu, label: "Open", corner: "topStart" },
          actions: commandActions(command),
        }}
      />,
    );
    const open = () =>
      click(document.querySelector<HTMLButtonElement>('[aria-label="Open"]'));
    open();
    expect(buttonWithText("Save")).toBeDefined();
    keydown(window, "Escape");
    expect(buttonWithText("Save")).toBeUndefined();
    open();
    click(buttonWithText("More"));
    click(buttonWithText("Load"));
    expect(command).toHaveBeenCalledTimes(1);
  });

  it("presents narrow context commands in a root-level dialog", () => {
    stubMatchMedia(false);
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          actions: commandActions(() => undefined),
          anchor: { x: 12, y: 12 },
          onDismiss: () => undefined,
        }}
      />,
    );
    expect(document.querySelector('[role="dialog"]')?.parentElement).toBe(
      document.body,
    );
    expect(document.querySelector("[data-command-menu-context]")).toBeNull();
  });

  it("navigates a wide context menu by keyboard and dismisses on Escape", () => {
    const onDismiss = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          subtitle: "Player",
          actions: commandActions(() => undefined),
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    expect(
      document.querySelector("[data-command-menu-context]")?.parentElement,
    ).toBe(document.body);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    keydown(menu, "ArrowDown");
    keydown(menu, "Enter");
    expect(buttonWithText("Load")).toBeDefined();
    keydown(menu, "Escape");
    keydown(menu, "Escape");
    expect(onDismiss).toHaveBeenCalled();
  });

  it("validates and commits signed whole-number field commands", () => {
    const onCommand = vi.fn<(value: number) => void>();
    const onDismiss = vi.fn();
    renderInCumulus(
      <CommandMenu
        model={{
          kind: "context",
          title: "Card",
          actions: [
            {
              kind: "group",
              id: "spark",
              label: "Add Spark",
              glyph: GLYPHS.edit,
              actions: [
                {
                  kind: "signed-integer",
                  id: "spark-amount",
                  label: "Amount",
                  placeholder: "+3 or -2",
                  commitLabel: "Apply",
                  onCommand,
                },
              ],
            },
          ],
          anchor: { x: 12, y: 12 },
          onDismiss,
        }}
      />,
    );
    click(buttonWithText("Add Spark"));
    const input = document.querySelector<HTMLInputElement>(
      '[data-testid="command-menu-signed-integer-input"]',
    );
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    const submit = (value: string) => {
      act(() => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set?.call(input, value);
        input?.dispatchEvent(new Event("input", { bubbles: true }));
        buttonWithText("Apply")?.click();
      });
    };
    submit("1.5");
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(onCommand).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    submit("-4");
    expect(onCommand).toHaveBeenCalledWith(-4);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
