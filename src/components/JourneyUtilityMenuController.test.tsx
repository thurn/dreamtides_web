// @vitest-environment jsdom

import { act } from "react";
import { localizationTodo } from "@trox/runtime";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
} from "../state/journey-save-files";
import { useJourney } from "../state/journey-context";
import {
  buildJourneyUtilityMenuViewModel,
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuViewModel,
} from "./JourneyUtilityMenuController";
import { CumulusRoot } from "../cumulus/CumulusRoot";

vi.mock("../state/journey-context", () => ({ useJourney: vi.fn() }));
vi.mock("../logging", () => ({ downloadLog: vi.fn(), logEvent: vi.fn() }));
vi.mock("../runtime/build-info", () => ({ BUILD_GIT_SHA: "abc123def456" }));
vi.mock("../state/journey-save-files", () => ({
  chooseJourneySaveFile: vi.fn(),
  downloadJourneySaveFile: vi.fn(),
}));

let latest: JourneyUtilityMenuViewModel | null = null;
const loadJourneyState = vi.fn();

function Probe(): null {
  latest = useJourneyUtilityMenuController({
    actions: [],
    builtIns: ["saveJourney", "loadJourney", "buildSha", "downloadLog"],
    saveSource: "menu-save",
    loadSource: "menu-load",
    onLoadJourneyState: loadJourneyState,
  });
  return null;
}

function actionFor(id: string) {
  const action = latest?.actions.find((item) => item.kind === "action" && item.id === id);
  if (action?.kind !== "action") throw new Error(`Missing action ${id}`);
  return action;
}

beforeEach(() => {
  latest = null;
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.mocked(useJourney).mockReturnValue({
    state: { screen: { type: "atlas" } },
  } as ReturnType<typeof useJourney>);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("buildJourneyUtilityMenuViewModel", () => {
  it("constructs typed root actions without presentation data", () => {
    const model = buildJourneyUtilityMenuViewModel({
      actions: [{ kind: "action", id: "deck", label: localizationTodo("View Deck"), glyph: GLYPHS.affiliationRow, onCommand: vi.fn() }],
      builtIns: ["saveJourney", "loadJourney", "buildSha", "downloadLog"],
      canLoadJourney: true,
      status: { kind: "raw", value: "Saved journey." },
      onSaveJourney: vi.fn(),
      onLoadJourney: vi.fn(),
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });

    expect(model.status).toEqual({ kind: "raw", value: "Saved journey." });
    expect(model.actions.map((item) => item.id)).toEqual([
      "deck", "saveJourney", "loadJourney", "buildSha", "downloadLog",
    ]);
    const load = model.actions.find((item) => item.id === "loadJourney");
    expect(load).toMatchObject({ kind: "action", glyph: GLYPHS.folderOpen });
  });

  it("omits load when the current context cannot replace journey state", () => {
    const model = buildJourneyUtilityMenuViewModel({
      actions: [],
      builtIns: ["loadJourney"],
      canLoadJourney: false,
      status: null,
      onSaveJourney: vi.fn(),
      onLoadJourney: vi.fn(),
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });

    expect(model.actions).toEqual([]);
  });
});

describe("useJourneyUtilityMenuController", () => {
  it("downloads a named journey file and reports the result", () => {
    vi.spyOn(window, "prompt").mockReturnValue("before atlas");
    vi.mocked(downloadJourneySaveFile).mockReturnValue({
      fileName: "dreamtides-journey-before-atlas.json",
      save: {
        format: "dreamtides-journey",
        version: 1,
        name: "before atlas",
        savedAt: "2026-07-29T12:00:00.000Z",
        buildGitSha: "abc123",
        journeyState: { screen: { type: "atlas" } },
      } as ReturnType<typeof downloadJourneySaveFile>["save"],
    });
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <Probe />
        </CumulusRoot>,
      ),
    );

    act(() => actionFor("saveJourney").onCommand());

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
    expect(latest?.status).toMatchObject({ kind: "message" });
    act(() => root.unmount());
  });

  it("loads a selected file through the shared journey mutation", async () => {
    vi.mocked(chooseJourneySaveFile).mockResolvedValue({
      fileName: "before-atlas.json",
      name: "before atlas",
      savedAt: "2026-07-29T12:00:00.000Z",
      buildGitSha: "abc123",
      journeyState: { screen: { type: "atlas" } },
    } as Awaited<ReturnType<typeof chooseJourneySaveFile>>);
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <Probe />
        </CumulusRoot>,
      ),
    );

    await act(async () => {
      actionFor("loadJourney").onCommand();
      await Promise.resolve();
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
    expect(latest?.status).toMatchObject({ kind: "message" });
    act(() => root.unmount());
  });

  it("keeps build-SHA logging and transient status in the app-shell controller", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <Probe />
        </CumulusRoot>,
      ),
    );

    act(() => actionFor("buildSha").onCommand());

    expect(logEvent).toHaveBeenCalledWith("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: "abc123def456",
    });
    expect(latest?.status).toMatchObject({ kind: "message" });
    act(() => root.unmount());
  });
});
