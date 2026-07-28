// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestContent } from "../data/quest-content";
import FrontDoorApp from "./FrontDoorApp";

const mocks = vi.hoisted(() => ({
  loadQuestContent: vi.fn<() => Promise<QuestContent>>(),
  loadTutorialConfiguration: vi.fn(() => Promise.resolve({
    actions: [],
    triggers: [],
    battle: { playerDraws: [], enemyDraws: [], dreamwellDraws: [] },
  })),
  registerGameProviders: vi.fn(),
}));

vi.mock("../data/quest-content", () => ({
  loadQuestContent: mocks.loadQuestContent,
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
    mocks.loadQuestContent.mockReset();
    mocks.loadTutorialConfiguration.mockClear();
    mocks.registerGameProviders.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("registers content providers before mounting the room fold", async () => {
    let resolveContent!: (content: QuestContent) => void;
    mocks.loadQuestContent.mockReturnValue(new Promise((resolve) => {
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
      resolveContent({} as QuestContent);
      await Promise.resolve();
    });

    expect(mocks.registerGameProviders).toHaveBeenCalledOnce();
    expect(container.querySelector("[data-room-gate]")).not.toBeNull();
    expect(container.querySelector("[data-front-door-router=direct]")).not.toBeNull();
  });

  it("threads the direct victory preview into the front-door router", async () => {
    mocks.loadQuestContent.mockResolvedValue({} as QuestContent);

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
