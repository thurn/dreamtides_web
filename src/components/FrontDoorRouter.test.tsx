// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FrontDoorRouter } from "./FrontDoorRouter";

const stateMocks = vi.hoisted<{
  frontDoor: {
    phase: "main" | "mainExiting" | "loading" | "tutorial";
    journeyId: string | null;
  };
}>(() => ({
  frontDoor: { phase: "main", journeyId: null },
}));

vi.mock("../state/front-door-context", () => ({
  useFrontDoor: () => ({ state: stateMocks.frontDoor }),
}));

vi.mock("../screens/cumulus_adapters/MainMenuScreenAdapter", () => ({
  MainMenuScreenAdapter: () => <main data-main-menu />,
}));

vi.mock("../screens/cumulus_adapters/LoadingScreenAdapter", () => ({
  LoadingScreenAdapter: () => <main data-loading-screen />,
}));

vi.mock("../screens/cumulus_adapters/TutorialScreenAdapter", () => ({
  TutorialScreenAdapter: () => <main data-tutorial-screen />,
}));

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => {});
  window.history.replaceState(null, "", "/main?game=room42#shared");
  stateMocks.frontDoor = { phase: "main", journeyId: null };
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

    act(() => root.render(<FrontDoorRouter />));
    expect(container.querySelector("[data-main-menu]")).not.toBeNull();

    stateMocks.frontDoor = { phase: "loading", journeyId: "event:1" };
    act(() => root.render(<FrontDoorRouter />));
    expect(container.querySelector("[data-loading-screen]")).not.toBeNull();
    expect(window.location.pathname).toBe("/loading");
    expect(window.location.search).toBe("?game=room42");
    expect(window.location.hash).toBe("#shared");

    stateMocks.frontDoor = { phase: "tutorial", journeyId: "event:1" };
    act(() => root.render(<FrontDoorRouter />));
    expect(container.querySelector("[data-tutorial-screen]")).not.toBeNull();
    expect(window.location.pathname).toBe("/tutorial");

    act(() => root.unmount());
  });
});
