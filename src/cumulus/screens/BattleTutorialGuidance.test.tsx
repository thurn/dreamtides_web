// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import {
  BattleTutorialGuidance,
  type BattleTutorialGuidanceView,
} from "./BattleTutorialGuidance";

class ResizeObserverStub {
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

function guidanceFields(
  text: string,
  options: {
    readonly horizontalOffset?: number;
    readonly verticalOffset?: number;
    readonly bubbleWidth?: number;
  } = {},
) {
  return {
    duration: 3,
    dialogue: {
      portrait: {
        kind: "character-portrait" as const,
        characterId: "mira" as const,
      },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text,
    },
    horizontalOffset: options.horizontalOffset ?? 0,
    verticalOffset: options.verticalOffset ?? 0,
    bubbleWidth: options.bubbleWidth ?? 700,
  };
}

describe("BattleTutorialGuidance", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
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
    document.body.innerHTML = "";
  });

  it("floats the source and dismissible Mira dialogue without modal chrome", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onContinue = vi.fn();
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={{
              presentationId: "guidance:erode",
              triggerId: "erode",
              messageIndex: 0,
              messageCount: 1,
              ...guidanceFields(
                "[yellow]Erode[/yellow] sends cards to the void. Score 3⍟ for each missing card.",
                {
                  horizontalOffset: 30,
                  verticalOffset: 20,
                  bubbleWidth: 300,
                },
              ),
              source: {
                kind: "dreamwell",
                side: "player",
                model: {
                  cardId: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                  displaySnapshot: {
                    id: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                    name: "Shadow Passage",
                    renderedText: "Erode 3.",
                    energyAdded: 1,
                    imageNumber: 3,
                  },
                },
              },
            }}
            onDismiss={onContinue}
            onDurationComplete={onContinue}
          />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-testid="battle-tutorial-dreamwell"]'),
    ).not.toBeNull();
    expect(container.textContent).toContain("Mira");
    expect(container.textContent).toContain("Erode");
    expect(
      container.querySelector('[aria-label="points"]'),
    ).not.toBeNull();
    const guidance = container.querySelector<HTMLElement>(
      "[data-battle-tutorial-guidance]",
    );
    expect(guidance?.getAttribute("aria-modal")).toBeNull();
    expect(guidance?.getAttribute("role")).toBeNull();
    expect(guidance?.style.background).toBe("");
    expect(
      container.querySelector('[data-testid="card-tutorial-scrim"]'),
    ).toBeNull();
    const dialogueLayout = container.querySelector<HTMLElement>(
      '[data-testid="battle-tutorial-dismiss"]',
    )?.parentElement;
    expect(dialogueLayout?.style.maxWidth).toBe("300px");
    expect(dialogueLayout?.style.transform).toBe("translate(30px, 20px)");
    expect(
      container.querySelector('[data-testid="battle-tutorial-continue"]'),
    ).toBeNull();
    const dialogue = container.querySelector<HTMLElement>(
      '[data-testid="battle-tutorial-dismiss"]',
    );
    act(() => dialogue?.click());
    expect(onContinue).toHaveBeenCalledOnce();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("starts the authored dwell timer when the guidance is mounted", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const onDurationComplete = vi.fn();
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={{
              presentationId: "guidance:erode",
              triggerId: "erode",
              messageIndex: 0,
              messageCount: 1,
              ...guidanceFields("Erode sends cards to the void."),
              source: {
                kind: "dreamwell",
                side: "player",
                model: {
                  cardId: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                  displaySnapshot: {
                    id: asCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
                    name: "Shadow Passage",
                    renderedText: "Erode 3.",
                    energyAdded: 1,
                    imageNumber: 3,
                  },
                },
              },
            }}
            onDismiss={() => {}}
            onDurationComplete={onDurationComplete}
          />
        </CumulusRoot>,
      );
    });

    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(onDurationComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDurationComplete).toHaveBeenCalledOnce();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("carries one battle-card identity from its source into guidance and on to its destination", () => {
    const battleCardId = "battle-card-1";
    const cardId = asCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af");
    const displaySnapshot: CardData = {
      id: cardId,
      name: asCardName("Fixture Traveler"),
      cardNumber: 7,
      cardType: "Character",
      subtype: "Fixture",
      isStarter: true,
      energyCost: 1,
      spark: 2,
      isFast: false,
      renderedText: "Support.",
      imageNumber: 7,
      artOwned: true,
    };
    const view: BattleTutorialGuidanceView = {
      presentationId: "guidance:support",
      triggerId: "support",
      messageIndex: 0,
      messageCount: 1,
      ...guidanceFields("Support helps the character in front."),
      source: {
        kind: "card",
        battleCardId,
        model: { cardId, displaySnapshot },
        figment: false,
      },
    };
    const source = document.createElement("div");
    source.dataset.battleCardId = battleCardId;
    document.body.append(source);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    let sourceRect = DOMRect.fromRect({
      x: 40,
      y: 600,
      width: 120,
      height: 168,
    });
    const boxSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.battleCardId === battleCardId) return sourceRect;
        if (this.dataset.battleTutorialSource !== undefined) {
          return DOMRect.fromRect({
            x: 400,
            y: 180,
            width: 240,
            height: 336,
          });
        }
        return DOMRect.fromRect();
      });
    const finishListeners: Array<() => void> = [];
    const animations: Keyframe[][] = [];
    const animateDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "animate",
    );
    HTMLElement.prototype.animate = vi.fn(
      (keyframes: Keyframe[] | PropertyIndexedKeyframes | null) => {
        animations.push(keyframes as Keyframe[]);
        return {
          addEventListener: (
            type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            if (type !== "finish") return;
            finishListeners.push(() => {
              if (typeof listener === "function") {
                listener(new Event("finish"));
              } else {
                listener.handleEvent(new Event("finish"));
              }
            });
          },
          cancel: vi.fn(),
        } as unknown as Animation;
      },
    );

    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={view}
            onDismiss={() => undefined}
            onDurationComplete={() => undefined}
          />
        </CumulusRoot>,
      );
    });

    const journey = container.querySelector<HTMLElement>(
      "[data-battle-tutorial-guidance]",
    );
    expect(source.style.visibility).toBe("hidden");
    expect(source.dataset.tutorialGuidanceJourneyHidden).toBe("source");
    expect(journey?.dataset.tutorialGuidanceJourney).toBe("entering");
    expect(animations[0]?.[0]?.transform).toContain("translate(");
    act(() => finishListeners.shift()?.());
    expect(journey?.dataset.tutorialGuidanceJourney).toBe("dwelling");

    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={{
              ...view,
              triggerId: "event-card",
              messageIndex: 1,
              messageCount: 2,
              dialogue: {
                ...view.dialogue,
                text: "The same card stays here for the next explanation.",
              },
            }}
            onDismiss={() => undefined}
            onDurationComplete={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(animations).toHaveLength(1);
    expect(container.textContent).toContain(
      "The same card stays here for the next explanation.",
    );

    sourceRect = DOMRect.fromRect({
      x: 700,
      y: 420,
      width: 90,
      height: 126,
    });
    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={null}
            onDismiss={() => undefined}
            onDurationComplete={() => undefined}
          />
        </CumulusRoot>,
      );
    });

    expect(source.dataset.tutorialGuidanceJourneyHidden).toBe("destination");
    expect(source.style.opacity).toBe("0");
    expect(
      container.querySelector<HTMLElement>(
        "[data-battle-tutorial-guidance]",
      )?.dataset.tutorialGuidanceJourney,
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

    act(() => root.unmount());
    if (animateDescriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    } else {
      Object.defineProperty(
        HTMLElement.prototype,
        "animate",
        animateDescriptor,
      );
    }
    boxSpy.mockRestore();
  });

  it("keeps journey cards in place and positions only Mira's dialogue outside them", () => {
    vi.useFakeTimers();
    const cardId = asCardId("card-a");
    const displaySnapshot: CardData = {
      id: cardId,
      name: asCardName("Fixture Offer"),
      cardNumber: 8,
      cardType: "Character",
      subtype: "Fixture",
      isStarter: false,
      energyCost: 2,
      spark: 3,
      isFast: false,
      renderedText: "Support.",
      imageNumber: 8,
      artOwned: true,
    };
    const source = document.createElement("div");
    source.dataset.gameCardSource = "";
    source.dataset.cardId = cardId;
    document.body.append(source);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const boxSpy = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        if (this.dataset.cardId === cardId) {
          return DOMRect.fromRect({
            x: 40,
            y: 500,
            width: 180,
            height: 252,
          });
        }
        if (this.dataset.cardTutorialDialogueLayout !== undefined) {
          return DOMRect.fromRect({
            width: 700,
            height: 100,
          });
        }
        return DOMRect.fromRect();
      });
    const animations: Keyframe[][] = [];
    const animateDescriptor = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "animate",
    );
    HTMLElement.prototype.animate = vi.fn(
      (keyframes: Keyframe[] | PropertyIndexedKeyframes | null) => {
        animations.push(keyframes as Keyframe[]);
        return {
          addEventListener: (
            type: string,
            listener: EventListenerOrEventListenerObject,
          ) => {
            if (type !== "finish") return;
            if (typeof listener === "function") listener(new Event("finish"));
          },
          cancel: vi.fn(),
        } as unknown as Animation;
      },
    );
    const view: BattleTutorialGuidanceView = {
      presentationId: "card-tutorial:fixture",
      triggerId: "support",
      messageIndex: 0,
      messageCount: 1,
      ...guidanceFields("Support helps the character in front."),
      source: {
        kind: "journey-card",
        cardId,
        model: { cardId, displaySnapshot },
      },
    };
    const onDurationComplete = vi.fn();

    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={view}
            onDismiss={() => undefined}
            onDurationComplete={onDurationComplete}
          />
        </CumulusRoot>,
      );
    });

    expect(source.style.visibility).toBe("");
    expect(source.style.opacity).toBe("");
    expect(source.dataset.tutorialGuidanceJourneyHidden).toBeUndefined();
    expect(container.querySelector("[data-card-tutorial-guidance]")).not.toBeNull();
    expect(container.querySelector("[data-battle-tutorial-guidance]")).toBeNull();
    expect(
      container.querySelector('[data-testid="card-tutorial-card"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="card-tutorial-scrim"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="card-tutorial-dialogue"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="card-tutorial-dismiss"]'),
    ).toBeNull();
    const dialogueLayout = container.querySelector<HTMLElement>(
      "[data-card-tutorial-dialogue-layout]",
    );
    expect(dialogueLayout?.style.visibility).toBe("visible");
    expect(dialogueLayout?.style.maxWidth).toBe("700px");
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

    act(() => {
      root.render(
        <CumulusRoot>
          <BattleTutorialGuidance
            view={null}
            onDismiss={() => undefined}
            onDurationComplete={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(source.style.visibility).toBe("");
    expect(source.style.opacity).toBe("");
    act(() => {
      vi.runAllTimers();
    });
    expect(source.style.visibility).toBe("");
    expect(source.style.opacity).toBe("");
    expect(
      container.querySelector("[data-card-tutorial-guidance]"),
    ).toBeNull();

    act(() => root.unmount());
    if (animateDescriptor === undefined) {
      Reflect.deleteProperty(HTMLElement.prototype, "animate");
    } else {
      Object.defineProperty(
        HTMLElement.prototype,
        "animate",
        animateDescriptor,
      );
    }
    boxSpy.mockRestore();
    vi.useRealTimers();
  });
});
