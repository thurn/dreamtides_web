// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TutorialAction } from "../types/tutorial";
import {
  useTutorialEditor,
  useTutorialReplay,
  type TutorialEditorState,
} from "./use-tutorial-editor";

const mocks = vi.hoisted(() => ({
  loadTutorialActions: vi.fn(),
  logEvent: vi.fn(),
}));

vi.mock("../data/tutorial-actions", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../data/tutorial-actions")>();
  return { ...original, loadTutorialActions: mocks.loadTutorialActions };
});

vi.mock("../logging", () => ({ logEvent: mocks.logEvent }));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.loadTutorialActions.mockReset();
  mocks.logEvent.mockReset();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useTutorialEditor", () => {
  it("replays the latest authored snapshot from a selected action", async () => {
    const actions: readonly TutorialAction[] = [
      {
        id: "welcome",
        action: "display-speech-bubble",
        text: "Welcome.",
        wait: 1,
      },
      {
        id: "tail-start",
        action: "draw-opponent-card",
        wait: 0,
      },
    ];
    const beginTutorial = vi.fn(() => Promise.resolve(3));
    let replay: ((startActionId?: string) => void) | null = null;

    function Probe(): null {
      replay = useTutorialReplay(actions, beginTutorial);
      return null;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    await act(async () => {
      replay?.("tail-start");
      await Promise.resolve();
    });

    expect(beginTutorial).toHaveBeenCalledWith(actions, {
      startActionId: "tail-start",
    });
    expect(mocks.logEvent).toHaveBeenCalledWith("tutorial_replay_requested", {
      actionCount: 2,
      actionIds: ["welcome", "tail-start"],
      startActionId: "tail-start",
      startActionIndex: 1,
    });

    act(() => root.unmount());
    container.remove();
  });

  it("keeps playback gated when authored actions fail to load", async () => {
    mocks.loadTutorialActions.mockRejectedValueOnce(
      new Error("invalid tutorial data"),
    );
    let state: TutorialEditorState | null = null;

    function Probe(): null {
      state = useTutorialEditor();
      return null;
    }

    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Probe />);
      await Promise.resolve();
    });

    expect(state).toMatchObject({
      actions: [],
      loaded: false,
      saveStatus: "error",
      saveError: "invalid tutorial data",
    });
    expect(mocks.logEvent).toHaveBeenCalledWith(
      "tutorial_actions_load_failed",
      {
        message: "invalid tutorial data",
      },
    );

    act(() => root.unmount());
    container.remove();
  });
});
