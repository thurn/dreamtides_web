// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { DreamscapeQuestMenu } from "./DreamscapeQuestMenu";

vi.mock("../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../logging", () => ({
  downloadLog: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../runtime/build-info", () => ({
  BUILD_GIT_SHA: "abc123def456",
}));

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

function renderMenu() {
  return mount(
    <DreamscapeQuestMenu
      onOpenDeckViewer={vi.fn()}
      onOpenGlossary={vi.fn()}
      onOpenPoolViewer={vi.fn()}
      onOpenDebugScreen={vi.fn()}
      onOpenQuestEditor={vi.fn()}
      hasDraftData={false}
    />,
  );
}

function mockDesktop(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockDesktop(false);
  vi.mocked(useQuest).mockReturnValue({
    state: {},
  } as ReturnType<typeof useQuest>);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamscapeQuestMenu", () => {
  it("renders a glass gear menu trigger on desktop", () => {
    mockDesktop(true);
    const { container, root } = renderMenu();

    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );

    // The desktop trigger is the circular glass gear button — icon only, no label.
    expect(menuButton?.textContent).toBe("");
    expect(menuButton?.querySelector("i")?.className).toBe("bxf bx-cog");

    act(() => {
      root.unmount();
    });
  });

  it("renders the hamburger menu trigger on mobile", () => {
    const { container, root } = renderMenu();

    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );

    expect(menuButton?.querySelector("i")?.className).toBe("bxf bx-menu");

    act(() => {
      root.unmount();
    });
  });

  it("shows the build Git SHA from the menu", () => {
    const { container, root } = renderMenu();

    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );
    act(() => {
      menuButton?.click();
    });

    const buildShaButton = Array.from(
      container.querySelectorAll<HTMLElement>('[data-testid="dreamscape-menu"] div'),
    ).find((element) => element.textContent === "Build SHA");

    expect(buildShaButton).toBeDefined();
    act(() => {
      buildShaButton?.click();
    });

    expect(container.querySelector('[data-testid="dreamscape-menu"]')).toBeNull();
    expect(container.textContent).toContain("Build Git SHA: abc123def456");
    expect(logEvent).toHaveBeenCalledWith("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: "abc123def456",
    });

    act(() => {
      root.unmount();
    });
  });

  it("bounds long menus to the viewport and scrolls their contents", () => {
    const { container, root } = renderMenu();
    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );
    act(() => menuButton?.click());

    const menu = container.querySelector<HTMLElement>(
      '[data-testid="dreamscape-menu"]',
    );
    expect(menu?.style.maxHeight).toContain("100dvh");
    expect(menu?.style.overflowY).toBe("auto");

    act(() => root.unmount());
  });
});
