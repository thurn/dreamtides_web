// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldState } from "../rules/fold-state";
import { JourneyCardTutorialController } from "./JourneyCardTutorialController";

const mocks = vi.hoisted(() => ({
  open: vi.fn(() => Promise.resolve(1)),
  select: vi.fn(),
  state: {
    cardTutorialPresentation: null,
    cardTutorialScreenKeysSeen: [],
    tutorialTriggerIdsSeen: [],
    journey: {
      screen: { type: "dreamscape" },
    },
  } as unknown as FoldState,
}));

vi.mock("../coop/hooks", () => ({
  useActions: () => ({
    openCardTutorialGuidance: mocks.open,
    completeCardTutorialGuidance: vi.fn(() => Promise.resolve(1)),
  }),
  useConfirmedGameState: () => mocks.state,
  useGameState: () => mocks.state,
}));

vi.mock("../state/journey-context", () => ({
  useJourney: () => ({
    cardDatabase: new Map(),
    journeyContent: {},
  }),
}));

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

vi.mock("../coop/providers/card-tutorial-guidance-provider", () => ({
  createCardTutorialGuidanceContentProvider: () => ({
    triggers: [],
    cardById: () => undefined,
  }),
}));

vi.mock("../rules/card-tutorial-guidance", () => ({
  cardIdsMatchCurrentDraftOffer: () => true,
  currentCardTutorialScreenKey: () => "journey:1:site:site-1",
  selectCardTutorialGuidance: (...args: unknown[]) => {
    const result: unknown = mocks.select(...args);
    return result;
  },
}));

vi.mock(
  "../screens/cumulus_adapters/card-tutorial-guidance-view-model",
  () => ({
    buildCardTutorialGuidanceView: () => null,
  }),
);

vi.mock("../cumulus/screens/BattleTutorialGuidance", () => ({
  BattleTutorialGuidance: () => (
    <div data-card-tutorial-guidance="">
      <div data-game-card-source="" data-card-id="overlay-card" />
    </div>
  ),
}));

function Harness({ cardIds }: { readonly cardIds: readonly string[] }) {
  const stageRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={stageRef}>
      {cardIds.map((cardId) => (
        <div
          key={cardId}
          data-game-card-source=""
          data-card-id={cardId}
        />
      ))}
      <JourneyCardTutorialController stageRef={stageRef} />
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0,
    y: 0,
    width: 160,
    height: 224,
    top: 0,
    right: 160,
    bottom: 224,
    left: 0,
    toJSON: () => ({}),
  });
  mocks.open.mockClear();
  mocks.select.mockReset();
  mocks.select.mockImplementation(
    (_provider: unknown, cardIds: readonly string[]) => ({
      card: { id: cardIds[0] },
      trigger: { id: "support" },
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("JourneyCardTutorialController", () => {
  it("submits visible source cards immediately and ignores its overlay card", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness cardIds={["card-a", "card-b"]} />);
      await Promise.resolve();
    });

    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.select.mock.calls[0]?.[1]).toEqual(["card-a", "card-b"]);
    expect(mocks.open).toHaveBeenCalledWith(
      "journey:1:site:site-1",
      ["card-a", "card-b"],
    );

    await act(async () => {
      container.querySelector("[data-card-id=card-a]")?.append(
        document.createElement("span"),
      );
      await Promise.resolve();
    });
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledOnce();

    await act(async () => {
      container
        .querySelector("[data-card-id=card-a]")
        ?.setAttribute("data-card-id", "card-c");
      await Promise.resolve();
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.select.mock.calls[1]?.[1]).toEqual(["card-c", "card-b"]);
    expect(mocks.open).toHaveBeenLastCalledWith(
      "journey:1:site:site-1",
      ["card-c", "card-b"],
    );

    act(() => root.unmount());
  });
});
