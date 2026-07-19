// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { TutorialScreenAdapter } from "./TutorialScreenAdapter";
import type { TutorialScreenProps } from "../../cumulus/screens/TutorialScreen";

const adapterMocks = vi.hoisted(() => ({
  props: null as TutorialScreenProps | null,
}));

const mocks = vi.hoisted(() => ({
  beginTutorial: vi.fn(() => Promise.resolve(1)),
  completeTutorialAction: vi.fn(() => Promise.resolve(2)),
  state: {
    phase: "tutorial" as const,
    journeyId: "genesis:test",
    tutorial: {
      runId: "event:1",
      currentActionIndex: 1,
      actions: [
        {
          id: "welcome",
          action: "display-speech-bubble" as const,
          text: "Adapter fixture.",
          wait: 3,
        },
        {
          id: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait" as const,
          owner: "player" as const,
          pause: 1,
          duration: 0.6,
          wait: 0,
        },
        {
          id: "nightmare-call",
          action: "display-speech-bubble" as const,
          text: "A follow-up.",
          wait: 3,
        },
      ],
    },
  },
}));

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: mocks.state,
    mutations: {
      beginTutorial: mocks.beginTutorial,
      completeTutorialAction: mocks.completeTutorialAction,
    },
  }),
}));

vi.mock("../../data/tutorial-actions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../data/tutorial-actions")>();
  return {
    ...original,
    loadTutorialActions: vi.fn(() => Promise.resolve(mocks.state.tutorial.actions)),
  };
});

vi.mock("../../cumulus/screens/TutorialScreen", () => ({
  TutorialScreen: (props: TutorialScreenProps) => {
    adapterMocks.props = props;
    return <main data-tutorial-screen />;
  },
}));

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  mocks.beginTutorial.mockClear();
  mocks.completeTutorialAction.mockClear();
  resetLog();
  adapterMocks.props = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreenAdapter", () => {
  it("loads authored actions and logs the shared action presentation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter />
        </CumulusRoot>,
      );
      await Promise.resolve();
    });

    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_actions_loaded",
          actionCount: 3,
          actionIds: ["welcome", "dreamcaller-arrival", "nightmare-call"],
        }),
        expect.objectContaining({
          event: "tutorial_action_presented",
          runId: "event:1",
          actionId: "dreamcaller-arrival",
          action: "animate-dreamcaller-portrait",
          dialogueVisible: true,
          dialogueText: "Adapter fixture.",
          owner: "player",
          portraitPauseSeconds: 1,
          portraitTravelSeconds: 0.6,
          waitSeconds: 0,
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onDreamcallerArrivalComplete?.(
        "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
        "player",
      );
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_dreamcaller_arrived",
          battleId: "tutorial-battle",
          dreamcallerId: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
          owner: "player",
          actionId: "dreamcaller-arrival",
          abilityActive: false,
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });
});
