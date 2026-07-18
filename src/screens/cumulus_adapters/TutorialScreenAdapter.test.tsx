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

vi.mock("../../cumulus/screens/TutorialScreen", () => ({
  TutorialScreen: (props: TutorialScreenProps) => {
    adapterMocks.props = props;
    return <main data-tutorial-screen />;
  },
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
  adapterMocks.props = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreenAdapter", () => {
  it("logs the standalone tutorial battle presentation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreenAdapter />
        </CumulusRoot>,
      );
    });

    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_screen_presented",
          battleId: "tutorial-battle",
          activeSide: "enemy",
          phase: "day",
          playerDeckSize: 30,
          enemyDeckSize: 30,
          dialogueSpeaker: "Mira",
          dialogueText: "Welcome, Dreamer.",
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onDreamcallerArrivalComplete?.(
        "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
      );
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_dreamcaller_arrived",
          battleId: "tutorial-battle",
          dreamcallerId: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
          abilityActive: false,
        }),
      ]),
    );

    act(() => {
      adapterMocks.props?.onDialogueReplacementComplete?.();
    });
    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: "tutorial_dialogue_replaced",
          battleId: "tutorial-battle",
          dreamcallerId: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
          dialogueSpeaker: "Mira",
          dialogueText:
            "You are called to stand against the power of Nightmare.",
        }),
      ]),
    );

    act(() => root.unmount());
    container.remove();
  });
});
