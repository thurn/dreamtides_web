// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontDoorRouter } from "./FrontDoorRouter";
import type { JourneyId } from "../types/identifiers";
import { parseJourneyId } from "../types/identifiers";

const stateMocks = vi.hoisted<{
  frontDoor: {
    phase: "main" | "mainExiting" | "loading" | "tutorial" | "journey";
    journeyId: JourneyId | null;
  };
  battle?: { mode?: { kind: "tutorial" | "journey" } } | null;
}>(() => ({
  frontDoor: { phase: "main", journeyId: null },
}));
const adapterMocks = vi.hoisted(() => ({
  mainSpeed: null as number | null,
  loadingSpeed: null as number | null,
  tutorialSpeed: null as number | null,
  tutorialDirectLive: null as boolean | null,
  tutorialVictoryPreview: null as boolean | null,
}));
const AVATARS = [] as const;

vi.mock("../state/front-door-context", () => ({
  useFrontDoor: () => ({
    state: stateMocks.frontDoor,
    battle: stateMocks.battle,
  }),
}));

vi.mock("../screens/cumulus_adapters/MainMenuScreenAdapter", () => ({
  MainMenuScreenAdapter: ({ playbackSpeed }: { playbackSpeed: number }) => {
    adapterMocks.mainSpeed = playbackSpeed;
    return <main data-main-menu />;
  },
}));

vi.mock("../screens/cumulus_adapters/LoadingScreenAdapter", () => ({
  LoadingScreenAdapter: ({ playbackSpeed }: { playbackSpeed: number }) => {
    adapterMocks.loadingSpeed = playbackSpeed;
    return <main data-loading-screen />;
  },
}));

vi.mock("../screens/cumulus_adapters/TutorialScreenAdapter", () => ({
  TutorialScreenAdapter: ({
    playbackSpeed,
    directLive,
  }: {
    playbackSpeed: number;
    directLive?: boolean;
  }) => {
    adapterMocks.tutorialSpeed = playbackSpeed;
    adapterMocks.tutorialDirectLive = directLive ?? false;
    return <main data-tutorial-screen />;
  },
}));

vi.mock("../screens/cumulus_adapters/TutorialBattleScreenAdapter", () => ({
  TutorialBattleScreenAdapter: ({
    previewVictory,
  }: {
    previewVictory?: boolean;
  }) => {
    adapterMocks.tutorialVictoryPreview = previewVictory ?? false;
    return <main data-tutorial-live-battle />;
  },
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.history.replaceState(null, "", "/main?game=room42#shared");
  stateMocks.frontDoor = { phase: "main", journeyId: null };
  stateMocks.battle = null;
  adapterMocks.mainSpeed = null;
  adapterMocks.loadingSpeed = null;
  adapterMocks.tutorialSpeed = null;
  adapterMocks.tutorialDirectLive = null;
  adapterMocks.tutorialVictoryPreview = null;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("FrontDoorRouter", () => {
  it("renders and reflects the room's shared scene while preserving its room URL", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() =>
      root.render(
        <FrontDoorRouter
          avatars={AVATARS}
          tutorialPlaybackSpeed={4}
        />,
      ),
    );
    expect(container.querySelector("[data-main-menu]")).not.toBeNull();
    expect(adapterMocks.mainSpeed).toBe(4);

    stateMocks.frontDoor = { phase: "loading", journeyId: parseJourneyId("event:1") };
    act(() =>
      root.render(
        <FrontDoorRouter
          avatars={AVATARS}
          tutorialPlaybackSpeed={4}
        />,
      ),
    );
    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(adapterMocks.loadingSpeed).toBe(4);
    expect(window.location.pathname).toBe("/loading");
    expect(window.location.search).toBe("?game=room42");
    expect(window.location.hash).toBe("#shared");

    stateMocks.frontDoor = { phase: "tutorial", journeyId: parseJourneyId("event:1") };
    act(() =>
      root.render(
        <FrontDoorRouter
          avatars={AVATARS}
          tutorialPlaybackSpeed={4}
        />,
      ),
    );
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(adapterMocks.tutorialSpeed).toBe(4);
    expect(window.location.pathname).toBe("/tutorial");

    stateMocks.battle = { mode: { kind: "tutorial" } };
    act(() =>
      root.render(
        <FrontDoorRouter
          avatars={AVATARS}
          tutorialPlaybackSpeed={4}
        />,
      ),
    );
    expect(
      container.querySelector("[data-tutorial-live-battle]"),
    ).not.toBeNull();

    stateMocks.frontDoor = { phase: "journey", journeyId: parseJourneyId("event:1") };
    act(() =>
      root.render(
        <FrontDoorRouter
          avatars={AVATARS}
          tutorialPlaybackSpeed={4}
          journey={<main data-journey-screen />}
        />,
      ),
    );
    expect(container.querySelector("[data-journey-screen]")).not.toBeNull();

    act(() => root.unmount());
  });

  it("passes the direct tutorial-battle route flag only to the authored tutorial adapter", () => {
    stateMocks.frontDoor = { phase: "tutorial", journeyId: parseJourneyId("event:direct") };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <FrontDoorRouter avatars={AVATARS} directTutorialBattle />,
      ),
    );
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(adapterMocks.tutorialDirectLive).toBe(true);
    act(() => root.unmount());
  });

  it("starts the live tutorial handoff and previews victory for its direct route", () => {
    stateMocks.frontDoor = { phase: "tutorial", journeyId: parseJourneyId("event:direct") };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() =>
      root.render(
        <FrontDoorRouter avatars={AVATARS} previewTutorialVictory />,
      ),
    );
    expect(adapterMocks.tutorialDirectLive).toBe(true);

    stateMocks.battle = { mode: { kind: "tutorial" } };
    act(() =>
      root.render(
        <FrontDoorRouter avatars={AVATARS} previewTutorialVictory />,
      ),
    );
    expect(adapterMocks.tutorialVictoryPreview).toBe(true);

    act(() => root.unmount());
  });
});
