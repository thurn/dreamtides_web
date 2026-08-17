// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { getLogEntries, resetLog } from "../../logging";
import { MainMenuScreenAdapter } from "./MainMenuScreenAdapter";
import type {
  MainMenuActionId,
  MainMenuScreenProps,
  MainMenuSocialId,
} from "../../cumulus/screens/MainMenuScreen";
import type { JourneyId } from "../../types/identifiers";
import { testJourneyId } from "../../types/test-identities";

const screenMocks = vi.hoisted(() => ({
  onAction: null as null | ((actionId: MainMenuActionId) => void),
  onExitComplete: null as null | (() => void),
  onSocial: null as null | ((socialId: MainMenuSocialId) => void),
}));

const coopMocks = vi.hoisted<{
  frontDoor: { phase: string; journeyId: JourneyId | null };
  frontDoorAction: ReturnType<typeof vi.fn>;
  advanceFrontDoor: ReturnType<typeof vi.fn>;
}>(() => ({
  frontDoor: { phase: "main", journeyId: null },
  frontDoorAction: vi.fn().mockResolvedValue(1),
  advanceFrontDoor: vi.fn().mockResolvedValue(2),
}));

vi.mock("../../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: coopMocks.frontDoor,
    mutations: {
      action: coopMocks.frontDoorAction,
      advance: coopMocks.advanceFrontDoor,
    },
  }),
}));

vi.mock("../../cumulus/screens/MainMenuScreen", () => ({
  MainMenuScreen: ({
    onAction,
    onExitComplete,
    onSocial,
    transitionPhase,
  }: {
    onAction: (actionId: MainMenuActionId) => void;
    onExitComplete?: () => void;
    onSocial: (socialId: MainMenuSocialId) => void;
    transitionPhase?: MainMenuScreenProps["transitionPhase"];
  }) => {
    screenMocks.onAction = onAction;
    screenMocks.onExitComplete = onExitComplete ?? null;
    screenMocks.onSocial = onSocial;
    return <div data-main-menu data-main-menu-phase={transitionPhase} />;
  },
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.history.replaceState(null, "", "/main");
  screenMocks.onAction = null;
  screenMocks.onExitComplete = null;
  screenMocks.onSocial = null;
  coopMocks.frontDoor = { phase: "main", journeyId: null };
  coopMocks.frontDoorAction.mockClear();
  coopMocks.advanceFrontDoor.mockClear();
  resetLog();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("MainMenuScreenAdapter", () => {
  it("submits New Journey, logs the restored controls, and advances the shared exit transition", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <MainMenuScreenAdapter />
        </CumulusRoot>,
      ),
    );

    act(() => screenMocks.onAction?.("new-journey"));
    act(() => screenMocks.onAction?.("dream-codex"));
    expect(coopMocks.frontDoorAction).toHaveBeenCalledWith(
      "main",
      "new-journey",
    );

    coopMocks.frontDoor = {
      phase: "mainExiting",
      journeyId: testJourneyId("event:1"),
    };
    act(() =>
      root.render(
        <CumulusRoot>
          <MainMenuScreenAdapter />
        </CumulusRoot>,
      ),
    );
    expect(
      container.querySelector("[data-main-menu-phase='exiting']"),
    ).not.toBeNull();
    act(() => screenMocks.onSocial?.("reddit"));
    act(() => screenMocks.onExitComplete?.());
    expect(coopMocks.frontDoorAction).toHaveBeenCalledTimes(1);
    expect(coopMocks.advanceFrontDoor).toHaveBeenCalledWith(
      "mainExiting",
      "event:1",
    );

    expect(getLogEntries()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "main_menu_presented" }),
        expect.objectContaining({
          event: "main_menu_action_pressed",
          actionId: "new-journey",
        }),
        expect.objectContaining({
          event: "main_menu_action_pressed",
          actionId: "dream-codex",
        }),
        expect.objectContaining({
          event: "main_menu_social_pressed",
          socialId: "reddit",
        }),
      ]),
    );

    act(() => root.unmount());
  });
});
