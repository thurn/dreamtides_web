// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import { useQuest } from "../state/quest-context";
import {
  buildQuestUtilityMenuViewModel,
  useQuestUtilityMenuController,
  type QuestUtilityMenuViewModel,
} from "./QuestUtilityMenuController";

vi.mock("../state/quest-context", () => ({ useQuest: vi.fn() }));
vi.mock("../logging", () => ({ downloadLog: vi.fn(), logEvent: vi.fn() }));
vi.mock("../runtime/build-info", () => ({ BUILD_GIT_SHA: "abc123def456" }));

let latest: QuestUtilityMenuViewModel | null = null;

function Probe(): null {
  latest = useQuestUtilityMenuController({
    actions: [],
    builtIns: ["saveQuest", "loadQuest", "buildSha", "downloadLog"],
    saveSource: "menu-save",
    loadSource: "menu-load",
    onLoadQuestState: vi.fn(),
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
  vi.mocked(useQuest).mockReturnValue({ state: {} } as ReturnType<typeof useQuest>);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("buildQuestUtilityMenuViewModel", () => {
  it("constructs typed root and loading submenu commands without presentation data", () => {
    const model = buildQuestUtilityMenuViewModel({
      actions: [{ kind: "action", id: "deck", label: "View Deck", glyph: GLYPHS.affiliationRow, onCommand: vi.fn() }],
      builtIns: ["saveQuest", "loadQuest", "buildSha", "downloadLog"],
      canLoadQuest: true,
      loadState: { kind: "loading" },
      status: "Saved quest.",
      onSaveQuest: vi.fn(),
      onOpenLoadMenu: vi.fn(),
      onSelectSavedQuest: vi.fn(),
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });

    expect(model.status).toBe("Saved quest.");
    expect(model.actions.map((item) => item.id)).toEqual([
      "deck", "saveQuest", "loadQuest", "buildSha", "downloadLog",
    ]);
    const load = model.actions.find((item) => item.id === "loadQuest");
    expect(load).toMatchObject({ kind: "group", glyph: GLYPHS.folderOpen });
    expect(load?.kind === "group" ? load.actions : []).toMatchObject([
      { id: "loadQuest:loading", glyph: GLYPHS.folderOpen, disabled: true },
    ]);
  });

  it("keeps each saved quest's display data in a typed selectable command", () => {
    const select = vi.fn();
    const save = { name: "before-atlas", screenType: "atlas", savedAt: "2026-07-18T10:00:00.000Z" };
    const model = buildQuestUtilityMenuViewModel({
      actions: [],
      builtIns: ["loadQuest"],
      canLoadQuest: true,
      loadState: { kind: "ready", saves: [save] },
      status: null,
      onSaveQuest: vi.fn(),
      onOpenLoadMenu: vi.fn(),
      onSelectSavedQuest: select,
      onDownloadLog: vi.fn(),
      onViewBuildSha: vi.fn(),
    });
    const load = model.actions[0];
    if (load?.kind !== "group") throw new Error("Load Quest must be a group");
    const savedQuest = load.actions[0];
    expect(savedQuest).toMatchObject({ kind: "action", id: "loadQuest:before-atlas", glyph: GLYPHS.folderOpen });
    if (savedQuest?.kind !== "action") throw new Error("Saved quest must be an action");
    savedQuest.onCommand();
    expect(select).toHaveBeenCalledWith(save);
  });
});

describe("useQuestUtilityMenuController", () => {
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
