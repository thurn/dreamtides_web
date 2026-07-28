// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import { useJourney } from "../state/journey-context";
import {
  buildJourneyUtilityMenuViewModel,
  useJourneyUtilityMenuController,
  type JourneyUtilityMenuViewModel,
} from "./JourneyUtilityMenuController";

vi.mock("../state/journey-context", () => ({ useJourney: vi.fn() }));
vi.mock("../logging", () => ({ downloadLog: vi.fn(), logEvent: vi.fn() }));
vi.mock("../runtime/build-info", () => ({ BUILD_GIT_SHA: "abc123def456" }));

let latest: JourneyUtilityMenuViewModel | null = null;

function Probe(): null {
  latest = useJourneyUtilityMenuController({
    actions: [],
    builtIns: ["saveJourney", "loadJourney", "buildSha", "downloadLog"],
    saveSource: "menu-save",
    loadSource: "menu-load",
    onLoadJourneyState: vi.fn(),
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
  vi.mocked(useJourney).mockReturnValue({ state: {} } as ReturnType<typeof useJourney>);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("buildJourneyUtilityMenuViewModel", () => {
  it("constructs typed root and loading submenu commands without presentation data", () => {
    const model = buildJourneyUtilityMenuViewModel({
      actions: [{ kind: "action", id: "deck", label: "View Deck", glyph: GLYPHS.affiliationRow, onCommand: vi.fn() }],
      builtIns: ["saveJourney", "loadJourney", "buildSha", "downloadLog"],
      canLoadJourney: true,
      loadState: { kind: "loading" },
      status: "Saved journey.",
      onSaveJourney: vi.fn(),
      onOpenLoadMenu: vi.fn(),
      onSelectSavedJourney: vi.fn(),
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });

    expect(model.status).toBe("Saved journey.");
    expect(model.actions.map((item) => item.id)).toEqual([
      "deck", "saveJourney", "loadJourney", "buildSha", "downloadLog",
    ]);
    const load = model.actions.find((item) => item.id === "loadJourney");
    expect(load).toMatchObject({ kind: "group", glyph: GLYPHS.folderOpen });
    expect(load?.kind === "group" ? load.actions : []).toMatchObject([
      { id: "loadJourney:loading", glyph: GLYPHS.folderOpen, disabled: true },
    ]);
  });

  it("keeps each saved journey's display data in a typed selectable command", () => {
    const select = vi.fn();
    const save = { name: "before-atlas", screenType: "atlas", savedAt: "2026-07-18T10:00:00.000Z" };
    const model = buildJourneyUtilityMenuViewModel({
      actions: [],
      builtIns: ["loadJourney"],
      canLoadJourney: true,
      loadState: { kind: "ready", saves: [save] },
      status: null,
      onSaveJourney: vi.fn(),
      onOpenLoadMenu: vi.fn(),
      onSelectSavedJourney: select,
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });
    const load = model.actions[0];
    if (load?.kind !== "group") throw new Error("Load Journey must be a group");
    const savedJourney = load.actions[0];
    expect(savedJourney).toMatchObject({ kind: "action", id: "loadJourney:before-atlas", glyph: GLYPHS.folderOpen });
    if (savedJourney?.kind !== "action") throw new Error("Saved journey must be an action");
    savedJourney.onCommand();
    expect(select).toHaveBeenCalledWith(save);
  });
});

describe("useJourneyUtilityMenuController", () => {
  it("keeps build-SHA logging and transient status in the app-shell controller", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root: Root = createRoot(container);
    act(() => root.render(<Probe />));

    act(() => actionFor("buildSha").onCommand());

    expect(logEvent).toHaveBeenCalledWith("build_sha_viewed", {
      source: "dreamscape_menu",
      gitSha: "abc123def456",
    });
    expect(latest?.status).toBe("Build Git SHA: abc123def456");
    act(() => root.unmount());
  });
});
