// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import {
  MainMenuScreen,
  type MainMenuView,
} from "./MainMenuScreen";

const VIEW: MainMenuView = {
  title: "Dreamtides",
  background: artRef.mainMenuBackground(),
  actions: [
    { id: "new-journey", label: "New Journey" },
    { id: "dream-codex", label: "Dream Codex" },
    { id: "settings", label: "Settings" },
    { id: "about", label: "About" },
    { id: "quit", label: "Quit" },
  ],
  socials: [
    { id: "github", label: "GitHub", glyph: GLYPHS.github },
    { id: "discord", label: "Discord", glyph: GLYPHS.discord },
  ],
};

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Cumulus MainMenuScreen", () => {
  it("renders the title, ordered actions, full-bleed art, and brand controls", () => {
    const { container, root } = mount(
      <MainMenuScreen view={VIEW} onAction={() => {}} onSocial={() => {}} />,
    );
    const menu = container.querySelector<HTMLElement>("[data-main-menu]");

    expect(container.querySelector("[data-main-menu-title]")?.textContent).toBe(
      "Dreamtides",
    );
    expect(menu?.style.backgroundSize).toBe("cover");
    expect(menu?.style.backgroundImage).toContain("shutterstock_1891048579");
    expect(
      Array.from(container.querySelectorAll("[data-main-menu-actions] button")).map(
        (button) => button.textContent,
      ),
    ).toEqual(["New Journey", "Dream Codex", "Settings", "About", "Quit"]);
    expect(
      container.querySelector('[data-testid="main-menu-social-github"] i')
        ?.className,
    ).toContain("bxl-github");
    expect(
      container.querySelector('[data-testid="main-menu-social-discord"] i')
        ?.className,
    ).toContain("bxl-discord-alt");

    act(() => root.unmount());
  });

  it("reports menu and social activation by stable ids", () => {
    const onAction = vi.fn();
    const onSocial = vi.fn();
    const { container, root } = mount(
      <MainMenuScreen view={VIEW} onAction={onAction} onSocial={onSocial} />,
    );

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="main-menu-action-dream-codex"]',
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="main-menu-social-discord"]',
        )
        ?.click(),
    );

    expect(onAction).toHaveBeenCalledWith("dream-codex");
    expect(onSocial).toHaveBeenCalledWith("discord");
    act(() => root.unmount());
  });

  it("keeps design alternatives in a collapsible development panel", () => {
    const { container, root } = mount(
      <MainMenuScreen view={VIEW} onAction={() => {}} onSocial={() => {}} />,
    );
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-testid="main-menu-tweaks-toggle"]',
    );
    act(() => toggle?.click());

    const hoverSelect = container.querySelector<HTMLSelectElement>(
      '[data-testid="main-menu-tweak-hover-style"]',
    );
    expect(hoverSelect).not.toBeNull();
    act(() => {
      if (hoverSelect === null) return;
      hoverSelect.value = "popover";
      hoverSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-main-menu-actions] button")?.getAttribute(
        "data-main-menu-button-variant",
      ),
    ).toBe("popover");
    expect(
      container.querySelector('[data-testid="main-menu-tweaks-json"]')?.textContent,
    ).toContain('"hoverStyle": "popover"');

    act(() => root.unmount());
  });
});
