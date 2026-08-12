// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useJourney } from "../state/journey-context";
import { logEvent } from "../logging";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";

vi.mock("../state/journey-context", () => ({
  useJourney: vi.fn(),
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
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

function renderMenu() {
  return mount(
    <DreamscapeJourneyMenu
      onOpenDeckViewer={vi.fn()}
      onOpenPoolViewer={vi.fn()}
      onOpenDebugScreen={vi.fn()}
      onOpenJourneyEditor={vi.fn()}
      onToggleCardSourceOverlay={vi.fn()}
      hasDraftData={false}
      hasCardSourceDebug={false}
      isCardSourceOverlayOpen={false}
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
  vi.mocked(useJourney).mockReturnValue({
    state: {},
  } as ReturnType<typeof useJourney>);
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamscapeJourneyMenu", () => {
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
      container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
    ).find((element) => element.dataset.commandMenuActionId === "buildSha");

    expect(buildShaButton).toBeDefined();
    act(() => {
      buildShaButton?.click();
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="dreamscape-menu-status"]')?.textContent)
      .not.toBe("");
    expect(logEvent).toHaveBeenCalledWith("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: "abc123def456",
    });

    act(() => {
      root.unmount();
    });
  });

  it("uses the Cumulus-owned viewport-bounded menu surface", () => {
    const { container, root } = renderMenu();
    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );
    act(() => menuButton?.click());

    const menu = container.querySelector<HTMLElement>('[role="menu"]');
    expect(menu?.style.maxHeight).toContain("100vh");
    expect(menu?.style.overflowY).toBe("auto");

    act(() => root.unmount());
  });

  it("omits the glossary action", () => {
    const { container, root } = renderMenu();
    const menuButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="dreamscape-menu-button"]',
    );
    act(() => menuButton?.click());

    expect(container.textContent).not.toContain("Glossary");

    act(() => root.unmount());
  });
});
