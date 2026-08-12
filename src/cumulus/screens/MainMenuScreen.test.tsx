// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localizationTodo } from "@trox/runtime";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import {
  MainMenuScreen,
  type MainMenuView,
} from "./MainMenuScreen";

const VIEW: MainMenuView = {
  title: localizationTodo("Dreamtides"),
  background: artRef.mainMenuBackground(),
  actions: [
    { id: "new-journey", label: localizationTodo("New Journey") },
    { id: "dream-codex", label: localizationTodo("Dream Codex") },
    { id: "settings", label: localizationTodo("Settings") },
    { id: "about", label: localizationTodo("About") },
    { id: "quit", label: localizationTodo("Quit") },
  ],
  socials: [
    { id: "github", label: localizationTodo("GitHub"), glyph: GLYPHS.github },
    { id: "discord", label: localizationTodo("Discord"), glyph: GLYPHS.discord },
    { id: "reddit", label: localizationTodo("Reddit"), glyph: GLYPHS.reddit },
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

    expect(container.querySelector("[data-main-menu-title]")?.textContent).toBeTruthy();
    expect(menu?.style.backgroundSize).toBe("cover");
    expect(menu?.style.backgroundImage).toContain("/main-menu/background.jpg");
    expect(
      Array.from(container.querySelectorAll("[data-main-menu-actions] button")),
    ).toHaveLength(VIEW.actions.length);
    expect(
      Array.from(container.querySelectorAll("[data-main-menu-actions] button")).every(
        (button) => Boolean(button.textContent),
      ),
    ).toBe(true);
    expect(
      container.querySelector('[data-testid="main-menu-social-github"] i')
        ?.className,
    ).toContain("bxl-github");
    expect(
      container.querySelector('[data-testid="main-menu-social-discord"] i')
        ?.className,
    ).toContain("bxl-discord-alt");
    expect(
      container.querySelector('[data-testid="main-menu-social-reddit"] i')
        ?.className,
    ).toContain("bxl-reddit");
    expect(
      container.querySelector<HTMLElement>("[data-main-menu-socials]")?.style
        .flexDirection,
    ).toBe("column");
    expect(
      container.querySelector<HTMLElement>("[data-main-menu-actions]")?.style
        .bottom,
    ).toBe(
      "max(var(--safe-area-inset-bottom), var(--space-6xl))",
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-main-menu-action]"),
      ).map((action) => action.style.marginTop),
    ).toEqual([
      "0px",
      "calc(-1 * var(--space-l))",
      "calc(-1 * var(--space-l))",
      "calc(-1 * var(--space-l))",
      "calc(-1 * var(--space-l))",
    ]);

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
          '[data-testid="main-menu-social-reddit"]',
        )
        ?.click(),
    );

    expect(onAction).toHaveBeenCalledWith("dream-codex");
    expect(onSocial).toHaveBeenCalledWith("reddit");
    act(() => root.unmount());
  });

  it("uses the approved framed composition and neutral glass treatments", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(min-width: 900px)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const { container, root } = mount(
      <MainMenuScreen view={VIEW} onAction={() => {}} onSocial={() => {}} />,
    );
    const menu = container.querySelector<HTMLElement>("[data-main-menu]");
    const title = container.querySelector<HTMLElement>("[data-main-menu-title]");
    const actions = container.querySelector<HTMLElement>(
      "[data-main-menu-actions]",
    );
    const stack = container.querySelector<HTMLElement>(
      "[data-main-menu-action-stack]",
    );

    expect(menu?.style.backgroundPosition).toBe("54% 49%");
    expect(title?.style.top).toBe("var(--space-4xl)");
    expect(actions?.style.left).toBe("var(--space-6xl)");
    expect(actions?.style.bottom).toBe("var(--space-5xl)");
    expect(actions?.style.width).toBe("280px");
    expect(stack?.style.gap).toBe("0px");
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-main-menu-action]"),
      ).map((action) => action.style.marginTop),
    ).toEqual(["0px", "0px", "0px", "0px", "0px"]);
    expect(
      container.querySelector<HTMLElement>("[data-main-menu-socials]")?.style
        .flexDirection,
    ).toBe("row");
    expect(
      container.querySelector<HTMLElement>("[data-main-menu-button-glass]")
        ?.style.background,
    ).not.toContain("--accent-bright");
    act(() => root.unmount());
  });
});
