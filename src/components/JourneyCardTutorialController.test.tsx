// @vitest-environment jsdom

import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FoldState } from "../rules/fold-state";
import { JourneyCardTutorialController } from "./JourneyCardTutorialController";
import type { CardId } from "../types/card-identity";
import { parseCardTutorialScreenKey } from "../types/identifiers";
import { testCardId } from "../types/test-identities";

const CARD_A = testCardId("10000000-0000-4000-8000-000000000001");
const CARD_B = testCardId("10000000-0000-4000-8000-000000000002");
const CARD_C = testCardId("10000000-0000-4000-8000-000000000003");

const mocks = vi.hoisted(() => {
  const context = {
    screenKey: "journey:1:site:site-1" as unknown,
    event: "card-seen" as "card-seen" | "transfiguration-seen",
    visibilityGate: undefined as "exploration-actions" | undefined,
  };
  return {
    open: vi.fn(() => Promise.resolve(1)),
    select: vi.fn(),
    buildView: vi.fn(),
    context,
    state: {
      cardTutorialPresentation: null,
      cardTutorialScreenKeysSeen: [],
      tutorialTriggerIdsSeen: [],
      journey: {
        screen: { type: "dreamscape" },
      },
    } as unknown as FoldState,
  };
});

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
    hasVisibleTransfigurationReward: () => false,
  }),
}));

vi.mock("../rules/card-tutorial-guidance", () => ({
  cardIdsMatchCurrentDraftOffer: () => true,
  currentCardTutorialContext: () => mocks.context,
  selectCardTutorialGuidance: (...args: unknown[]) => {
    const result: unknown = mocks.select(...args);
    return result;
  },
}));

vi.mock(
  "../screens/cumulus_adapters/card-tutorial-guidance-view-model",
  () => ({
    buildCardTutorialGuidanceView: (...args: unknown[]) => {
      const result: unknown = mocks.buildView(...args);
      return result;
    },
  }),
);

vi.mock("../cumulus/screens/BattleTutorialGuidance", () => ({
  BattleTutorialGuidance: ({ view }: { view: unknown }) => (
    <div
      data-card-tutorial-guidance=""
      data-guidance-view={view === null ? "hidden" : "visible"}
    >
      <div data-game-card-source="" data-card-id="overlay-card" />
    </div>
  ),
}));

function Harness({ cardIds }: { readonly cardIds: readonly CardId[] }) {
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
  mocks.buildView.mockReset();
  mocks.buildView.mockImplementation((presentation: unknown) =>
    presentation == null ? null : { presentation },
  );
  (
    mocks.state as unknown as { cardTutorialPresentation: unknown }
  ).cardTutorialPresentation = null;
  mocks.context = {
    screenKey: parseCardTutorialScreenKey("journey:1:site:site-1"),
    event: "card-seen",
    visibilityGate: undefined,
  };
  mocks.select.mockReset();
  mocks.select.mockImplementation(
    (_provider: unknown, cardIds: readonly CardId[]) => ({
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
      root.render(
        <Harness cardIds={[CARD_A, CARD_B]} />,
      );
      await Promise.resolve();
    });

    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.select.mock.calls[0]?.[1]).toEqual([CARD_A, CARD_B]);
    expect(mocks.open).toHaveBeenCalledWith(
      "journey:1:site:site-1",
      [CARD_A, CARD_B],
    );

    await act(async () => {
      container.querySelector(`[data-card-id="${CARD_A}"]`)?.append(
        document.createElement("span"),
      );
      await Promise.resolve();
    });
    expect(mocks.select).toHaveBeenCalledOnce();
    expect(mocks.open).toHaveBeenCalledOnce();

    await act(async () => {
      container
        .querySelector(`[data-card-id="${CARD_A}"]`)
        ?.setAttribute("data-card-id", CARD_C);
      await Promise.resolve();
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.select.mock.calls[1]?.[1]).toEqual([CARD_C, CARD_B]);
    expect(mocks.open).toHaveBeenLastCalledWith(
      "journey:1:site:site-1",
      [CARD_C, CARD_B],
    );

    act(() => root.unmount());
  });

  it("submits a visible site concept without waiting for a GameCard", async () => {
    mocks.context = {
      screenKey: parseCardTutorialScreenKey(
        "journey:1:site:augury:concept:transfiguration",
      ),
      event: "transfiguration-seen",
      visibilityGate: undefined,
    };
    mocks.select.mockImplementation(() => ({
      card: null,
      trigger: { id: "transfiguration" },
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness cardIds={[]} />);
      await Promise.resolve();
    });

    expect(mocks.select).toHaveBeenCalledWith(
      expect.anything(),
      [],
      new Set(),
      "transfiguration-seen",
    );
    expect(mocks.open).toHaveBeenCalledWith(
      "journey:1:site:augury:concept:transfiguration",
      [],
    );

    act(() => root.unmount());
  });

  it("waits until Exploration presents its action offers", async () => {
    mocks.context = {
      screenKey: parseCardTutorialScreenKey(
        "journey:1:site:exploration:concept:transfiguration",
      ),
      event: "transfiguration-seen",
      visibilityGate: "exploration-actions",
    };
    mocks.select.mockImplementation(() => ({
      card: null,
      trigger: { id: "transfiguration" },
    }));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness cardIds={[]} />);
      await Promise.resolve();
    });
    expect(mocks.open).not.toHaveBeenCalled();

    await act(async () => {
      const source = document.createElement("section");
      source.dataset.tutorialGuidanceConcept = "exploration-actions";
      container.firstElementChild?.append(source);
      await Promise.resolve();
    });
    expect(mocks.open).toHaveBeenCalledWith(
      "journey:1:site:exploration:concept:transfiguration",
      [],
    );

    act(() => root.unmount());
  });

  it("withholds a shared Exploration presentation until the local action surface is visible", async () => {
    mocks.context = {
      screenKey: parseCardTutorialScreenKey(
        "journey:1:site:exploration:concept:transfiguration",
      ),
      event: "transfiguration-seen",
      visibilityGate: "exploration-actions",
    };
    (
      mocks.state as unknown as { cardTutorialPresentation: unknown }
    ).cardTutorialPresentation = {
      screenKey: mocks.context.screenKey,
      triggerId: "transfiguration",
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<Harness cardIds={[]} />);
      await Promise.resolve();
    });
    expect(
      container.querySelector("[data-guidance-view]")?.getAttribute(
        "data-guidance-view",
      ),
    ).toBe("hidden");

    await act(async () => {
      const source = document.createElement("section");
      source.dataset.tutorialGuidanceConcept = "exploration-actions";
      container.firstElementChild?.append(source);
      await Promise.resolve();
    });
    expect(
      container.querySelector("[data-guidance-view]")?.getAttribute(
        "data-guidance-view",
      ),
    ).toBe("visible");

    act(() => root.unmount());
  });
});
