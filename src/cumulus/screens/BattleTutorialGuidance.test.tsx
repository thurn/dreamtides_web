// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { renderInCumulus } from "../testing/render";
import {
  BattleTutorialGuidance,
  type BattleTutorialGuidanceView,
} from "./BattleTutorialGuidance";
import {
  parseBattleCardId,
  parsePresentationId,
  type PresentationId,
  type TutorialTriggerId,
} from "../../types/identifiers";
import {
  testCardId,
  testDreamwellCardId,
  testTutorialTriggerId,
} from "../../types/test-identities";

class ResizeObserverStub {
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

function guidanceView(
  presentationId: PresentationId,
  triggerId: TutorialTriggerId,
  text: string,
  fields: Partial<BattleTutorialGuidanceView> &
    Pick<BattleTutorialGuidanceView, "source">,
): BattleTutorialGuidanceView {
  return {
    presentationId,
    triggerId,
    messageIndex: 0,
    messageCount: 1,
    duration: 3,
    dialogue: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text,
    },
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 700,
    ...fields,
  };
}

const DREAMWELL_ID = testDreamwellCardId("03e4e701-4720-4278-8198-9b7e0514d4cf");

const dreamwellSource: BattleTutorialGuidanceView["source"] = {
  kind: "dreamwell",
  side: "player",
  model: {
    cardId: DREAMWELL_ID,
    displaySnapshot: {
      id: DREAMWELL_ID,
      name: "Shadow Passage",
      renderedText: "Erode 3.",
      energyAdded: 1,
      imageNumber: 3,
    },
  },
};

function cardSnapshot(
  cardId: CardData["id"],
  name: string,
  cardNumber: number,
): CardData {
  return {
    id: cardId,
    name: parseCardName(name),
    cardNumber,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: true,
    energyCost: 1,
    spark: 2,
    isFast: false,
    renderedText: "Support.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function guidance(
  view: BattleTutorialGuidanceView | null,
  callbacks: {
    readonly onDismiss?: () => void;
    readonly onDurationComplete?: () => void;
  } = {},
) {
  return (
    <BattleTutorialGuidance
      view={view}
      onDismiss={callbacks.onDismiss ?? (() => undefined)}
      onDurationComplete={callbacks.onDurationComplete ?? (() => undefined)}
    />
  );
}

/** Replaces `HTMLElement.animate`, recording keyframes and finish listeners. */
function stubAnimate(finishImmediately: boolean) {
  const finishListeners: Array<() => void> = [];
  const animations: Keyframe[][] = [];
  HTMLElement.prototype.animate = vi.fn(
    (keyframes: Keyframe[] | PropertyIndexedKeyframes | null) => {
      animations.push(keyframes as Keyframe[]);
      return {
        addEventListener: (
          type: string,
          listener: EventListenerOrEventListenerObject,
        ) => {
          if (type !== "finish") return;
          const finish = () => {
            if (typeof listener === "function") {
              listener(new Event("finish"));
            } else {
              listener.handleEvent(new Event("finish"));
            }
          };
          if (finishImmediately) finish();
          else finishListeners.push(finish);
        },
        cancel: vi.fn(),
      } as unknown as Animation;
    },
  );
  return { animations, finishListeners };
}

const animateDescriptor = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "animate",
);

describe("BattleTutorialGuidance", () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverStub;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width"),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (animateDescriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    } else {
      Object.defineProperty(HTMLElement.prototype, "animate", animateDescriptor);
    }
    document.body.innerHTML = "";
  });

  it("floats the source and dismissible Mira dialogue without modal chrome", () => {
    vi.useFakeTimers();
    const onContinue = vi.fn();
    const { container } = renderInCumulus(
      guidance(
        guidanceView(
          parsePresentationId("guidance:erode"),
          testTutorialTriggerId("erode"),
          "[yellow]Erode[/yellow] sends cards to the void. Score 3⍟ for each missing card.",
          {
            horizontalOffset: 30,
            verticalOffset: 20,
            bubbleWidth: 300,
            source: dreamwellSource,
          },
        ),
        { onDismiss: onContinue, onDurationComplete: onContinue },
      ),
    );

    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("[yellow]");
    expect(container.querySelector("[data-inline-glyph]")).not.toBeNull();
    const guidanceRoot = container.querySelector<HTMLElement>(
      "[data-battle-tutorial-guidance]",
    );
    expect(guidanceRoot?.getAttribute("aria-modal")).toBeNull();
    expect(guidanceRoot?.getAttribute("role")).toBeNull();
    expect(
      container.querySelector('[data-testid="card-tutorial-scrim"]'),
    ).toBeNull();
    const dialogue = container.querySelector<HTMLElement>(
      '[data-testid="battle-tutorial-dismiss"]',
    );
    expect(dialogue?.parentElement?.style.maxWidth).toBe("300px");
    expect(dialogue?.parentElement?.style.transform).toBe(
      "translate(30px, 20px)",
    );
    expect(
      container.querySelector('[data-testid="battle-tutorial-continue"]'),
    ).toBeNull();
    act(() => dialogue?.click());
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("waits for the authored delay before showing dialogue and starting its dwell", () => {
    vi.useFakeTimers();
    const onDurationComplete = vi.fn();
    const { container } = renderInCumulus(
      guidance(
        guidanceView(
          parsePresentationId("guidance:erode"),
          testTutorialTriggerId("erode"),
          "Erode sends cards to the void.",
          { delay: 1, source: dreamwellSource },
        ),
        { onDurationComplete },
      ),
    );

    const dialogue = container.querySelector(
      '[data-testid="battle-tutorial-dialogue"]',
    );
    const visible = () =>
      dialogue?.getAttribute("data-character-dialogue-visible");
    expect(visible()).toBe("false");
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(visible()).toBe("false");
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(visible()).toBe("true");
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(onDurationComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDurationComplete).toHaveBeenCalledOnce();
  });

  it("renders companion-free Challenge guidance as a battle tutorial", () => {
    const { container } = renderInCumulus(
      guidance(
        guidanceView(
          parsePresentationId("guidance:spark-tie"),
          testTutorialTriggerId("spark-tie"),
          "If spark values tie, both characters are dissolved.",
          { bubbleWidth: 500, source: { kind: "battle" } },
        ),
      ),
    );

    expect(
      container.querySelector("[data-battle-tutorial-guidance]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="battle-tutorial-dialogue"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="battle-tutorial-card"]'),
    ).toBeNull();
  });

  it("carries one battle-card identity from its source into guidance and on to its destination", () => {
    const battleCardId = "battle-card-1";
    const cardId = testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af");
    const view = guidanceView(
      parsePresentationId("guidance:support"),
      testTutorialTriggerId("support"),
      "Support helps the character in front.",
      {
        source: {
          kind: "card",
          battleCardId: parseBattleCardId(battleCardId),
          model: {
            cardId,
            displaySnapshot: cardSnapshot(cardId, "Fixture Traveler", 7),
          },
          figment: false,
        },
      },
    );
    const source = document.createElement("div");
    source.dataset.battleCardId = battleCardId;
    document.body.append(source);
    let sourceRect = DOMRect.fromRect({ x: 40, y: 600, width: 120, height: 168 });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.battleCardId === battleCardId) return sourceRect;
        if (this.dataset.battleTutorialSource !== undefined) {
          return DOMRect.fromRect({ x: 400, y: 180, width: 240, height: 336 });
        }
        return DOMRect.fromRect();
      },
    );
    const { animations, finishListeners } = stubAnimate(false);

    const { container, rerender } = renderInCumulus(guidance(view));

    const journey = container.querySelector<HTMLElement>(
      "[data-battle-tutorial-guidance]",
    );
    expect(source.style.visibility).toBe("hidden");
    expect(source.dataset.tutorialGuidanceJourneyHidden).toBe("source");
    expect(journey?.dataset.tutorialGuidanceJourney).toBe("entering");
    expect(animations[0]?.[0]?.transform).toContain("translate(");
    act(() => finishListeners.shift()?.());
    expect(journey?.dataset.tutorialGuidanceJourney).toBe("dwelling");

    rerender(
      guidance({
        ...view,
        triggerId: testTutorialTriggerId("event-card"),
        messageIndex: 1,
        messageCount: 2,
        dialogue: {
          ...view.dialogue,
          text: "The same card stays here for the next explanation.",
        },
      }),
    );
    expect(animations).toHaveLength(1);
    expect(container.textContent).toContain(
      "The same card stays here for the next explanation.",
    );

    sourceRect = DOMRect.fromRect({ x: 700, y: 420, width: 90, height: 126 });
    rerender(guidance(null));

    expect(source.dataset.tutorialGuidanceJourneyHidden).toBe("destination");
    expect(source.style.opacity).toBe("0");
    expect(
      container.querySelector<HTMLElement>("[data-battle-tutorial-guidance]")
        ?.dataset.tutorialGuidanceJourney,
    ).toBe("settling");
    expect(animations[1]?.[1]?.transform).toContain("scale(0.375)");
    expect(animations[1]?.[1]?.opacity).toBe(0);
    expect(animations[2]).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    act(() => finishListeners.shift()?.());
    expect(source.style.visibility).toBe("");
    expect(source.style.opacity).toBe("");
    expect(
      container.querySelector("[data-battle-tutorial-guidance]"),
    ).toBeNull();
  });

  it("keeps journey cards in place and positions only Mira's dialogue outside them", () => {
    vi.useFakeTimers();
    const cardId = testCardId("card-a");
    const source = document.createElement("div");
    source.dataset.gameCardSource = "";
    source.dataset.cardId = cardId;
    document.body.append(source);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.dataset.cardId === cardId) {
          return DOMRect.fromRect({ x: 40, y: 500, width: 180, height: 252 });
        }
        if (this.dataset.cardTutorialDialogueLayout !== undefined) {
          return DOMRect.fromRect({ width: 700, height: 100 });
        }
        return DOMRect.fromRect();
      },
    );
    const { animations } = stubAnimate(true);
    const onDurationComplete = vi.fn();

    const { container, rerender } = renderInCumulus(
      guidance(
        guidanceView(
          parsePresentationId("card-tutorial:fixture"),
          testTutorialTriggerId("support"),
          "Support helps the character in front.",
          {
            source: {
              kind: "journey-card",
              cardId,
              model: {
                cardId,
                displaySnapshot: cardSnapshot(cardId, "Fixture Offer", 8),
              },
            },
          },
        ),
        { onDurationComplete },
      ),
    );

    const sourceUntouched = () => {
      expect(source.style.visibility).toBe("");
      expect(source.style.opacity).toBe("");
    };
    sourceUntouched();
    expect(source.dataset.tutorialGuidanceJourneyHidden).toBeUndefined();
    expect(
      container.querySelector("[data-card-tutorial-guidance]"),
    ).not.toBeNull();
    for (const absent of [
      "[data-battle-tutorial-guidance]",
      '[data-testid="card-tutorial-card"]',
      '[data-testid="card-tutorial-scrim"]',
      '[data-testid="card-tutorial-dismiss"]',
    ]) {
      expect(container.querySelector(absent)).toBeNull();
    }
    expect(
      container.querySelector('[data-testid="card-tutorial-dialogue"]'),
    ).not.toBeNull();
    const dialogueLayout = container.querySelector<HTMLElement>(
      "[data-card-tutorial-dialogue-layout]",
    );
    expect(dialogueLayout?.style.visibility).toBe("visible");
    expect(dialogueLayout?.style.width).toContain("560px");
    expect(
      Number.parseFloat(dialogueLayout?.style.top ?? "") + 100,
    ).toBeLessThanOrEqual(500);
    expect(animations).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onDurationComplete).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-card-tutorial-guidance]"),
    ).not.toBeNull();

    rerender(guidance(null));
    sourceUntouched();
    act(() => {
      vi.runAllTimers();
    });
    sourceUntouched();
    expect(container.querySelector("[data-card-tutorial-guidance]")).toBeNull();
  });

  it("dismisses site guidance after its authored visible duration", () => {
    vi.useFakeTimers();
    const onDurationComplete = vi.fn();
    renderInCumulus(
      guidance(
        guidanceView(
          parsePresentationId("site-tutorial:transfiguration"),
          testTutorialTriggerId("transfiguration"),
          "Cards can be transfigured.",
          {
            delay: 1,
            bubbleWidth: 500,
            duration: 5,
            source: { kind: "journey-site" },
          },
        ),
        { onDurationComplete },
      ),
    );

    act(() => {
      vi.advanceTimersByTime(5_999);
    });
    expect(onDurationComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDurationComplete).toHaveBeenCalledOnce();
  });
});
