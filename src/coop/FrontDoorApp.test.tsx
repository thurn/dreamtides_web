// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { JourneyContent } from "../data/journey-content";
import FrontDoorApp from "./FrontDoorApp";

const mocks = vi.hoisted(() => ({
  loadJourneyContent: vi.fn<() => Promise<JourneyContent>>(),
  loadTutorialConfiguration: vi.fn(() => Promise.resolve({
    actions: [],
    triggers: [],
    battle: { playerDraws: [], enemyDraws: [], dreamwellDraws: [] },
  })),
  registerGameProviders: vi.fn(),
}));

vi.mock("../data/journey-content", () => ({
  loadJourneyContent: mocks.loadJourneyContent,
}));
vi.mock("../data/tutorial-actions", () => ({
  loadTutorialConfiguration: mocks.loadTutorialConfiguration,
}));
vi.mock("./providers/register-game-providers", () => ({
  registerGameProviders: mocks.registerGameProviders,
}));
vi.mock("../firebase/app-config", () => ({
  getFirebaseDatabase: vi.fn(() => ({})),
}));
vi.mock("./RoomGate", () => ({
  RoomGate: ({ children }: { children: (context: unknown) => ReactNode }) => (
    <div data-room-gate="">{children({})}</div>
  ),
}));
vi.mock("./hooks", () => ({
  CoopProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../state/front-door-context", () => ({
  FrontDoorProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../components/FrontDoorRouter", () => ({
  FrontDoorRouter: ({
    directTutorialBattle,
    previewTutorialVictory,
  }: {
    directTutorialBattle?: boolean;
    previewTutorialVictory?: boolean;
  }) => (
    <div
      data-front-door-router={
        previewTutorialVictory
          ? "victory"
          : directTutorialBattle
            ? "direct"
            : "standard"
      }
    />
  ),
}));

describe("FrontDoorApp provider bootstrap", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    mocks.loadJourneyContent.mockReset();
    mocks.loadTutorialConfiguration.mockClear();
    mocks.registerGameProviders.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers content providers before mounting the room fold", async () => {
    let resolveContent!: (content: JourneyContent) => void;
    mocks.loadJourneyContent.mockReturnValue(new Promise((resolve) => {
      resolveContent = resolve;
    }));

    act(() => {
      root.render(
        <FrontDoorApp
          runtimeConfig={{ seedOverride: null, aiMode: false, gameId: null, databaseMode: "emulator" }}
          entry="tutorial"
          directTutorialBattle
        />,
      );
    });
    expect(container.querySelector("[data-room-gate]")).toBeNull();

    await act(async () => {
      resolveContent({} as JourneyContent);
      await Promise.resolve();
    });

    expect(mocks.registerGameProviders).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-room-gate]")).not.toBeNull();
    expect(container.querySelector("[data-front-door-router=direct]")).not.toBeNull();
  });

  it("threads the direct victory preview into the front-door router", async () => {
    mocks.loadJourneyContent.mockResolvedValue({} as JourneyContent);

    await act(async () => {
      root.render(
        <FrontDoorApp
          runtimeConfig={{ seedOverride: null, aiMode: false, gameId: null, databaseMode: "emulator" }}
          entry="tutorial"
          previewTutorialVictory
        />,
      );
      await Promise.resolve();
    });

    expect(
      container.querySelector("[data-front-door-router=victory]"),
    ).not.toBeNull();
  });
});
