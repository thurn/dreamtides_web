// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../cumulus/testing/render";
import { logEvent } from "../logging";
import { testJourneyState } from "../testing/journey-genesis";
import { parseDeckEntryId } from "../types/identifiers";
import { testAvatarId, testDreamsignId } from "../types/test-identities";
import { CumulusJourneyChrome } from "./CumulusJourneyChrome";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";
import {
  stubViewport,
  mockJourneyState,
  MENU_BUTTON,
} from "./journey-chrome-test-fixtures";

vi.mock("../state/journey-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/journey-context")>()),
  useJourney: vi.fn(),
}));

vi.mock("../logging", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../logging")>()),
  logEvent: vi.fn(),
}));

vi.mock("../runtime/build-info", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../runtime/build-info")>()),
  BUILD_GIT_SHA: "abc123def456",
}));

vi.mock("../state/journey-save-files", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/journey-save-files")>()),
  chooseJourneySaveFile: vi.fn(),
  downloadJourneySaveFile: vi.fn(),
}));

vi.mock("./JourneyCardTutorialController", () => ({
  JourneyCardTutorialController: () => null,
}));

beforeEach(() => {
  vi.clearAllMocks();
  stubViewport(true);
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  mockJourneyState({ screen: { type: "atlas" } });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const STATUS_BAR = "[data-journey-status-bar-anchor]";

describe("CumulusJourneyChrome", () => {
  beforeEach(() => {
    const state = testJourneyState();
    state.essence = 275;
    state.deck = Array.from({ length: 17 }, (_, index) => ({
      entryId: parseDeckEntryId(`entry-${String(index)}`),
      cardNumber: index + 1,
      transfiguration: null,
      isBane: false,
    }));
    state.avatar = {
      id: testAvatarId("00000000-0000-4000-8000-000000000001"),
      name: "Test Avatar",
      title: "Keeper of Chrome",
      renderedText: "Draw a card.",
      imageNumber: "0001",
      startingEssence: 200,
    };
    state.dreamsigns = Array.from({ length: 5 }, (_, index) => ({
      id: testDreamsignId(
        `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`,
      ),
      name: `Test Dreamsign ${String(index + 1)}`,
      effectDescription: "Fixture effect.",
      imageName: "bell.png",
    }));
    mockJourneyState(state);
  });

  it.each([
    { desktop: true, variant: "journey", statusBar: true, menu: true },
    { desktop: false, variant: "journey", statusBar: true, menu: true },
    { desktop: true, variant: "battle", statusBar: true, menu: false },
    { desktop: false, variant: "battle", statusBar: false, menu: false },
    { desktop: false, variant: "end", statusBar: false, menu: true },
  ] as const)(
    "docks status bar $statusBar and menu $menu for $variant (desktop $desktop)",
    ({ desktop, variant, statusBar, menu }) => {
      stubViewport(desktop);
      const { container } = renderInCumulus(
        <CumulusJourneyChrome
          variant={variant === "battle" ? "battle" : "journey"}
          showStatusBar={variant !== "end"}
        >
          <div data-testid="screen-content" />
        </CumulusJourneyChrome>,
      );

      expect(
        container.querySelector('[data-testid="screen-content"]'),
      ).not.toBeNull();
      expect(container.querySelector(STATUS_BAR) !== null).toBe(statusBar);
      expect(container.querySelector(MENU_BUTTON) !== null).toBe(menu);
    },
  );

  it("opens the deck from the journey status bar", () => {
    const onViewDeck = vi.fn();
    const { container } = renderInCumulus(
      <CumulusJourneyChrome handlers={{ onViewDeck }}>
        <div />
      </CumulusJourneyChrome>,
    );
    const deck = container.querySelector<HTMLButtonElement>(
      "[data-journey-deck-target]",
    );
    expect(deck?.getAttribute("aria-label")).not.toBe("");
    act(() => deck?.click());
    expect(onViewDeck).toHaveBeenCalledTimes(1);
  });

  it("shows only essence and dreamsigns, in a two-high grid, around a desktop battle", () => {
    const { container } = renderInCumulus(
      <CumulusJourneyChrome variant="battle">
        <div />
      </CumulusJourneyChrome>,
    );

    expect(
      container.querySelector('[data-journey-status-bar-variant="battle"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-essence]")?.textContent,
    ).toContain("275");
    expect(container.querySelector("[data-journey-deck-target]")).toBeNull();
    const placements = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-journey-status-dreamsign-columns="two-high"] [data-journey-status-dreamsign]',
      ),
    ).map((dreamsign) => [
      dreamsign.dataset.journeyStatusDreamsignColumn,
      dreamsign.dataset.journeyStatusDreamsignRow,
    ]);
    expect(placements).toEqual([
      ["3", "2"],
      ["3", "1"],
      ["2", "2"],
      ["2", "1"],
      ["1", "2"],
    ]);
  });
});

describe("DreamscapeJourneyMenu", () => {
  it("shows the build Git SHA from the menu and logs the view", () => {
    stubViewport(false);
    const { container } = renderInCumulus(
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

    act(() => container.querySelector<HTMLButtonElement>(MENU_BUTTON)?.click());
    const buildSha = container.querySelector<HTMLButtonElement>(
      '[role="menuitem"][data-command-menu-action-id="buildSha"]',
    );
    expect(buildSha).not.toBeNull();
    expect(
      container.querySelector('[data-command-menu-action-id="newJourney"]'),
    ).toBeNull();
    act(() => buildSha?.click());

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(
      container.querySelector('[data-testid="dreamscape-menu-status"]')
        ?.textContent,
    ).not.toBe("");
    expect(logEvent).toHaveBeenCalledWith("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: "abc123def456",
    });
  });
});
