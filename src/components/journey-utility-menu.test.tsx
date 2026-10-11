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
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
} from "../state/journey-save-files";
import { parseBuildGitSha } from "../types/build-identity";
import { parseJourneyMutationSource } from "../types/journey-source";
import { DreamscapeJourneyMenu } from "./DreamscapeJourneyMenu";
import {
  buildJourneyUtilityMenuViewModel,
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuViewModel,
} from "./JourneyUtilityMenuController";
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

describe("buildJourneyUtilityMenuViewModel", () => {
  const handlers = {
    onSaveJourney: vi.fn(),
    onLoadJourney: vi.fn(),
    onExportLog: vi.fn(),
    onRequestNewJourney: vi.fn(),
    onViewBuildSha: vi.fn(),
    newJourneyConfirmation: null,
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
      builtIns: [
        "newJourney",
        "saveJourney",
        "loadJourney",
        "buildSha",
        "exportLog",
      ],
      canLoadJourney: true,
      canExportLog: true,
      canStartNewJourney: true,
      status: "Fixture status.",
    });

    expect(model.status).not.toBe("");
    expect(model.actions.map((item) => item.id)).toEqual([
      "deck",
      "newJourney",
      "saveJourney",
      "loadJourney",
      "buildSha",
      "exportLog",
    ]);
  });

  it("omits load, export, and New Journey when the context cannot support them", () => {
    const model = buildJourneyUtilityMenuViewModel({
      ...handlers,
      actions: [],
      builtIns: ["loadJourney", "exportLog", "newJourney"],
      canLoadJourney: false,
      canExportLog: false,
      canStartNewJourney: false,
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
    startNewGame: vi.fn(),
  };

  function Probe(): null {
    latest = useJourneyUtilityMenuController({
      actions: [],
      builtIns: [
        "saveJourney",
        "loadJourney",
        "buildSha",
        "exportLog",
        "newJourney",
      ],
      saveSource: parseJourneyMutationSource("menu-save"),
      loadSource: parseJourneyMutationSource("menu-load"),
      onLoadJourneyState: loadJourneyState,
    });
    return null;
  }

  function command(
    id: "saveJourney" | "loadJourney" | "exportLog" | "newJourney",
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

  it("starts a new game only after New Journey is confirmed", () => {
    const request = command("newJourney");
    expect(latest?.newJourneyConfirmation).toBeNull();

    act(() => request());
    expect(gameControls.startNewGame).not.toHaveBeenCalled();
    const confirmation = latest?.newJourneyConfirmation;
    if (confirmation == null) throw new Error("Missing confirmation");

    act(() => confirmation.onConfirm());
    expect(gameControls.startNewGame).toHaveBeenCalledTimes(1);
    expect(gameControls.startNewGame).toHaveBeenCalledWith({
      source: "game_menu",
    });
    expect(latest?.newJourneyConfirmation).toBeNull();
  });

  it("declining New Journey leaves the open game in place", () => {
    const request = command("newJourney");
    act(() => request());
    const confirmation = latest?.newJourneyConfirmation;
    if (confirmation == null) throw new Error("Missing confirmation");

    act(() => confirmation.onCancel());
    expect(latest?.newJourneyConfirmation).toBeNull();
    expect(gameControls.startNewGame).not.toHaveBeenCalled();
    expect(logEvent).toHaveBeenCalledWith("new_journey_declined", {
      source: "game_menu",
    });
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

  it("confirms New Journey in a dialog before starting a new game", () => {
    stubViewport(true);
    const controls: LocalGameControls = {
      exportLog: vi.fn(() => Promise.resolve(0)),
      recover: vi.fn(() => Promise.resolve()),
      startNewGame: vi.fn(),
    };
    const { container } = renderInCumulus(
      <LocalGameControlsContext.Provider value={controls}>
        <DreamscapeJourneyMenu
          onOpenDeckViewer={vi.fn()}
          onOpenPoolViewer={vi.fn()}
          onOpenDebugScreen={vi.fn()}
          onOpenJourneyEditor={vi.fn()}
          onToggleCardSourceOverlay={vi.fn()}
          hasDraftData={false}
          hasCardSourceDebug={false}
          isCardSourceOverlayOpen={false}
        />
      </LocalGameControlsContext.Provider>,
    );
    const dialog = () =>
      container.querySelector("[data-new-journey-confirmation]");
    const press = (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)?.click());
    const requestNewJourney = () => {
      press(MENU_BUTTON);
      press('[role="menuitem"][data-command-menu-action-id="newJourney"]');
    };

    requestNewJourney();
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(dialog()).not.toBeNull();
    press('[data-testid="new-journey-cancel"]');
    expect(dialog()).toBeNull();
    expect(controls.startNewGame).not.toHaveBeenCalled();

    requestNewJourney();
    press('[data-testid="new-journey-confirm"]');
    expect(dialog()).toBeNull();
    expect(controls.startNewGame).toHaveBeenCalledWith({ source: "game_menu" });
  });
});
