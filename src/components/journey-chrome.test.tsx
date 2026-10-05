// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderInCumulus } from "../cumulus/testing/render";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import {
  LocalGameControlsContext,
  type LocalGameControls,
} from "../session/game-controls";
import { createDefaultState, useJourney } from "../state/journey-context";
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
} from "../state/journey-save-files";
import { parseBuildGitSha } from "../types/build-identity";
import { parseDeckEntryId } from "../types/identifiers";
import { parseJourneyMutationSource } from "../types/journey-source";
import { testAvatarId, testDreamsignId } from "../types/test-identities";
import { CumulusJourneyChrome } from "./CumulusJourneyChrome";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";
import {
  buildJourneyUtilityMenuViewModel,
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuViewModel,
} from "./JourneyUtilityMenuController";

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

function stubViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockJourneyState(state: unknown): void {
  vi.mocked(useJourney).mockReturnValue({
    state,
    mutations: {},
    cardDatabase: new Map(),
    journeyContent: {},
  } as ReturnType<typeof useJourney>);
}

const MENU_BUTTON = '[data-testid="dreamscape-menu-button"]';
const STATUS_BAR = "[data-journey-status-bar-anchor]";

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

describe("CumulusJourneyChrome", () => {
  beforeEach(() => {
    const state = createDefaultState();
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

describe("buildJourneyUtilityMenuViewModel", () => {
  const handlers = {
    onSaveJourney: vi.fn(),
    onLoadJourney: vi.fn(),
    onExportLog: vi.fn(),
    onViewBuildSha: vi.fn(),
  };

  it("orders screen actions before the built-in utility actions", () => {
    const model = buildJourneyUtilityMenuViewModel({
      ...handlers,
      actions: [
        {
          kind: "action",
          id: "deck",
          label: "Fixture",
          glyph: GLYPHS.affiliationRow,
          onCommand: vi.fn(),
        },
      ],
      builtIns: ["saveJourney", "loadJourney", "buildSha", "exportLog"],
      canLoadJourney: true,
      canExportLog: true,
      status: "Fixture status.",
    });

    expect(model.status).not.toBe("");
    expect(model.actions.map((item) => item.id)).toEqual([
      "deck",
      "saveJourney",
      "loadJourney",
      "buildSha",
      "exportLog",
    ]);
  });

  it("omits load and export when the context cannot support them", () => {
    const model = buildJourneyUtilityMenuViewModel({
      ...handlers,
      actions: [],
      builtIns: ["loadJourney", "exportLog"],
      canLoadJourney: false,
      canExportLog: false,
      status: null,
    });
    expect(model.actions).toEqual([]);
  });
});

describe("useJourneyUtilityMenuController", () => {
  let latest: JourneyUtilityMenuViewModel | null = null;
  const loadJourneyState = vi.fn();

  const gameControls: LocalGameControls = {
    exportLog: vi.fn(() => Promise.resolve(3)),
    recover: vi.fn(() => Promise.resolve()),
  };

  function Probe(): null {
    latest = useJourneyUtilityMenuController({
      actions: [],
      builtIns: ["saveJourney", "loadJourney", "buildSha", "exportLog"],
      saveSource: parseJourneyMutationSource("menu-save"),
      loadSource: parseJourneyMutationSource("menu-load"),
      onLoadJourneyState: loadJourneyState,
    });
    return null;
  }

  function command(
    id: "saveJourney" | "loadJourney" | "exportLog",
  ): () => void {
    renderInCumulus(
      <LocalGameControlsContext.Provider value={gameControls}>
        <Probe />
      </LocalGameControlsContext.Provider>,
    );
    const action = latest?.actions.find(
      (item) => item.kind === "action" && item.id === id,
    );
    if (action?.kind !== "action") throw new Error(`Missing action ${id}`);
    return action.onCommand;
  }

  beforeEach(() => {
    latest = null;
  });

  it("downloads a named journey file and reports the result", () => {
    vi.spyOn(window, "prompt").mockReturnValue("before atlas");
    vi.mocked(downloadJourneySaveFile).mockReturnValue({
      fileName: "dreamtides-journey-before-atlas.json",
      save: {
        format: "dreamtides-journey",
        version: 1,
        name: "before atlas",
        savedAt: "2026-07-29T12:00:00.000Z",
        buildGitSha: parseBuildGitSha("abc123"),
        journeyState: { screen: { type: "atlas" } },
      } as ReturnType<typeof downloadJourneySaveFile>["save"],
    });

    const save = command("saveJourney");
    act(() => save());

    expect(downloadJourneySaveFile).toHaveBeenCalledWith(
      "before atlas",
      expect.objectContaining({ screen: { type: "atlas" } }),
    );
    expect(logEvent).toHaveBeenCalledWith(
      "debug_journey_saved",
      expect.objectContaining({
        source: "menu-save",
        name: "before atlas",
        fileName: "dreamtides-journey-before-atlas.json",
        formatVersion: 1,
      }),
    );
    expect(latest?.status).not.toBe("");
  });

  it("exports the open game's log and reports the result", async () => {
    const exportLog = command("exportLog");
    await act(async () => {
      exportLog();
      await Promise.resolve();
    });
    expect(gameControls.exportLog).toHaveBeenCalledWith({ source: "game_menu" });
    expect(latest?.status).not.toBeNull();
  });

  it("loads a selected file through the shared journey mutation", async () => {
    vi.mocked(chooseJourneySaveFile).mockResolvedValue({
      fileName: "before-atlas.json",
      name: "before atlas",
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: parseBuildGitSha("abc123"),
      journeyState: { screen: { type: "atlas" } },
    });

    const load = command("loadJourney");
    await act(async () => {
      load();
      await vi.waitFor(() => expect(loadJourneyState).toHaveBeenCalled());
    });

    expect(loadJourneyState).toHaveBeenCalledWith(
      expect.objectContaining({ screen: { type: "atlas" } }),
      "menu-load",
    );
    expect(logEvent).toHaveBeenCalledWith(
      "debug_journey_loaded",
      expect.objectContaining({
        source: "menu-load",
        name: "before atlas",
        fileName: "before-atlas.json",
      }),
    );
    expect(latest?.status).not.toBe("");
  });

  it("logs save and load failure diagnostics and reports a status", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("before atlas");
    vi.mocked(downloadJourneySaveFile).mockImplementation(() => {
      throw new Error("storage quota exhausted");
    });
    vi.mocked(chooseJourneySaveFile).mockRejectedValue(
      new Error("save file is corrupt"),
    );

    const save = command("saveJourney");
    act(() => save());
    expect(logEvent).toHaveBeenCalledWith("debug_journey_save_failed", {
      source: "menu-save",
      errorKind: "Error",
      message: "storage quota exhausted",
    });
    expect(latest?.status).not.toBe("");

    const load = command("loadJourney");
    await act(async () => {
      load();
      await Promise.resolve();
    });
    expect(logEvent).toHaveBeenCalledWith("debug_journey_load_failed", {
      source: "menu-load",
      errorKind: "Error",
      message: "save file is corrupt",
    });
  });
});
