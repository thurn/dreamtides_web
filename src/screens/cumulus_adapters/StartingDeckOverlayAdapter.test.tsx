// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartingDeckOverlayAdapter } from "./StartingDeckOverlayAdapter";
import { logEvent } from "../../logging";
import { useQuest } from "../../state/quest-context";
import type { QuestContent } from "../../data/quest-content";
import type {
  QuestContextValue,
  QuestMutations,
} from "../../state/quest-context";
import type { CardData } from "../../types/cards";
import type { QuestState } from "../../types/quest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { StartingDeckView } from "../../cumulus/screens/StartingDeckOverlay";

vi.mock("../../state/quest-context", () => ({
  useQuest: vi.fn(),
}));

vi.mock("../../logging", () => ({
  logEvent: vi.fn(),
}));

// Stub the overlay so the adapter's wiring (view + onClose) is observable
// without mounting the real glass chrome. Records the props of each render so a
// test can inspect the built view and invoke the wired `onClose`.
interface OverlayMockProps {
  isOpen: boolean;
  view: StartingDeckView;
  onClose: () => void;
}
const overlayMock = vi.fn<(props: OverlayMockProps) => null>((props) => {
  void props;
  return null;
});
vi.mock("../../cumulus/screens/StartingDeckOverlay", () => ({
  StartingDeckOverlay: (props: OverlayMockProps) => overlayMock(props),
}));

function lastOverlayProps(): OverlayMockProps {
  const calls = overlayMock.mock.calls;
  const last = calls[calls.length - 1];
  if (last === undefined) throw new Error("overlay was never rendered");
  return last[0];
}

function makeCardDatabase(): Map<number, CardData> {
  return new Map([
    [
      1,
      {
        name: asCardName("Archive Sentry"),
        id: asCardId("archive-sentry"),
        cardNumber: 1,
        cardType: "Character",
        subtype: "",
        isStarter: false,
        energyCost: 3,
        spark: 1,
        isFast: false,
        renderedText: "Hold the line.",
        imageNumber: 1,
        artOwned: true,
      },
    ],
  ]);
}

function makeState(): QuestState {
  return {
    deck: [
      { entryId: "entry-1", cardNumber: 1, transfiguration: null, isBane: false },
    ],
  } as unknown as QuestState;
}

function setQuestContext(): void {
  const cardDatabase = makeCardDatabase();
  vi.mocked(useQuest).mockReturnValue({
    state: makeState(),
    mutations: {} as QuestMutations,
    cardDatabase,
    questContent: { cardDatabase } as QuestContent,
  } as QuestContextValue);
}

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  setQuestContext();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("StartingDeckOverlayAdapter", () => {
  it("builds the view from live state and logs the open once per open session", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <StartingDeckOverlayAdapter isOpen={false} onClose={onClose} />,
    );
    expect(logEvent).not.toHaveBeenCalled();
    expect(lastOverlayProps().isOpen).toBe(false);

    act(() => {
      root.render(
        <StartingDeckOverlayAdapter isOpen={true} onClose={onClose} />,
      );
    });

    const props = lastOverlayProps();
    expect(props.isOpen).toBe(true);
    expect(props.view.cards).toHaveLength(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenLastCalledWith("starting_deck_modal_opened", {
      cardCount: 1,
    });

    // A state refresh while open does not re-log the open.
    setQuestContext();
    act(() => {
      root.render(
        <StartingDeckOverlayAdapter isOpen={true} onClose={onClose} />,
      );
    });
    expect(logEvent).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("logs the close with a duration and calls onClose when dismissed", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <StartingDeckOverlayAdapter isOpen={true} onClose={onClose} />,
    );
    vi.mocked(logEvent).mockClear();

    act(() => {
      lastOverlayProps().onClose();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledTimes(1);
    const [event, payload] = vi.mocked(logEvent).mock.calls[0] ?? [];
    expect(event).toBe("starting_deck_modal_closed");
    expect(payload).toHaveProperty("durationMs");
    expect(typeof (payload as { durationMs: number }).durationMs).toBe("number");

    act(() => {
      root.unmount();
    });
  });
});
