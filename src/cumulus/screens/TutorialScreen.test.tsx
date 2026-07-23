// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import type { CharacterDialogueProps } from "../components/overlay/CharacterDialogue";
import { TutorialScreen, type TutorialView } from "./TutorialScreen";
import type {
  MobileBattleScreenProps,
  MobileBattleView,
} from "./MobileBattleScreen";
import { asCardId, asCardName } from "../../types/card-identity";

interface ScreenMockState {
  props: MobileBattleScreenProps | null;
  dialogueProps: CharacterDialogueProps | null;
  sceneInitial: unknown;
  sceneAnimate: unknown;
  sceneTransition: unknown;
  sceneAnimationComplete: (() => void) | null;
  arrivalInitial: unknown;
  arrivalAnimate: unknown;
  arrivalTransition: unknown;
  arrivalAnimationComplete: (() => void) | null;
  cardInitial: unknown;
  cardAnimate: unknown;
  cardTransition: unknown;
  cardAnimationComplete: (() => void) | null;
  cardFullAnimate: unknown;
  cardFullTransition: unknown;
  cardBattlefieldAnimate: unknown;
  cardBattlefieldTransition: unknown;
}

const screenMocks = vi.hoisted<ScreenMockState>(() => ({
  props: null as MobileBattleScreenProps | null,
  dialogueProps: null as CharacterDialogueProps | null,
  sceneInitial: null,
  sceneAnimate: null,
  sceneTransition: null,
  sceneAnimationComplete: null as (() => void) | null,
  arrivalInitial: null,
  arrivalAnimate: null,
  arrivalTransition: null,
  arrivalAnimationComplete: null as (() => void) | null,
  cardInitial: null,
  cardAnimate: null,
  cardTransition: null,
  cardAnimationComplete: null as (() => void) | null,
  cardFullAnimate: null,
  cardFullTransition: null,
  cardBattlefieldAnimate: null,
  cardBattlefieldTransition: null,
}));

interface MotionMainStubInput {
  readonly animate?: unknown;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly "data-tutorial-screen"?: string;
  readonly initial?: unknown;
  readonly onAnimationComplete?: () => void;
  readonly ref?: Ref<HTMLElement>;
  readonly style?: CSSProperties;
  readonly transition?: unknown;
}

interface MotionDivStubInput {
  readonly animate?: unknown;
  readonly children?: ReactNode;
  readonly "data-tutorial-dreamcaller-arrival"?: string;
  readonly "data-tutorial-card-battlefield-layer"?: string;
  readonly "data-tutorial-card-full-layer"?: string;
  readonly "data-tutorial-opponent-card-play"?: string;
  readonly initial?: unknown;
  readonly onAnimationComplete?: () => void;
  readonly style?: CSSProperties;
  readonly transition?: unknown;
}

vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
  motion: {
    main: ({
      animate,
      children,
      initial,
      onAnimationComplete,
      transition,
      ...elementProps
    }: MotionMainStubInput) => {
      screenMocks.sceneInitial = initial;
      screenMocks.sceneAnimate = animate;
      screenMocks.sceneTransition = transition;
      screenMocks.sceneAnimationComplete = onAnimationComplete ?? null;
      return <main {...elementProps}>{children}</main>;
    },
    div: ({
      animate,
      children,
      initial,
      onAnimationComplete,
      transition,
      ...elementProps
    }: MotionDivStubInput) => {
      if (elementProps["data-tutorial-opponent-card-play"] !== undefined) {
        screenMocks.cardInitial = initial;
        screenMocks.cardAnimate = animate;
        screenMocks.cardTransition = transition;
        screenMocks.cardAnimationComplete = onAnimationComplete ?? null;
      } else if (elementProps["data-tutorial-card-full-layer"] !== undefined) {
        screenMocks.cardFullAnimate = animate;
        screenMocks.cardFullTransition = transition;
      } else if (
        elementProps["data-tutorial-card-battlefield-layer"] !== undefined
      ) {
        screenMocks.cardBattlefieldAnimate = animate;
        screenMocks.cardBattlefieldTransition = transition;
      } else {
        screenMocks.arrivalInitial = initial;
        screenMocks.arrivalAnimate = animate;
        screenMocks.arrivalTransition = transition;
        screenMocks.arrivalAnimationComplete = onAnimationComplete ?? null;
      }
      return <div {...elementProps}>{children}</div>;
    },
  },
}));

vi.mock("../components/overlay/CharacterDialogue", () => ({
  CharacterDialogue: (props: CharacterDialogueProps) => {
    screenMocks.dialogueProps = props;
    return (
      <section data-character-dialogue={props.dialogue.speakerName}>
        <div data-character-dialogue-portrait-frame="" />
        <div>
          <aside />
        </div>
      </section>
    );
  },
}));

vi.mock("./MobileBattleScreen", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./MobileBattleScreen")>();
  return {
    ...original,
    MobileBattleScreen: (props: MobileBattleScreenProps) => {
      screenMocks.props = props;
      const enemyStatus = props.view.enemy?.status;
      const playerStatus = props.view.player?.status;
      return (
        <div data-battle-mobile={props.view.battleId}>
          {(props.view.farHand?.cardIds ?? []).map((cardId) => (
            <div
              key={cardId}
              data-battle-card-id={cardId}
              data-battle-card-zone="far-hand"
            />
          ))}
          <div data-battle-rank="enemy-back">
            {props.view.enemy?.backRank?.map((slot) => (
              <div key={slot.id} data-battle-slot-id={slot.id} />
            ))}
          </div>
          <div data-battle-rank="enemy-front">
            {props.view.enemy?.frontRank?.map((slot) => (
              <div key={slot.id} data-battle-slot-id={slot.id} />
            ))}
          </div>
          <div data-battle-rank="player-front">
            {props.view.player?.frontRank?.map((slot) => (
              <div key={slot.id} data-battle-slot-id={slot.id} />
            ))}
          </div>
          <div data-testid="enemy-battle-status">
            {enemyStatus?.dreamcaller === undefined ||
            enemyStatus.dreamcaller === null ? (
              <div data-battle-status-dreamcaller-placeholder="" />
            ) : (
              <span
                data-dreamcaller-source={enemyStatus.dreamcallerProfile?.id}
              />
            )}
          </div>
          <div data-testid="player-battle-status">
            {playerStatus?.dreamcaller === undefined ||
            playerStatus.dreamcaller === null ? (
              <div data-battle-status-dreamcaller-placeholder="" />
            ) : (
              <span
                data-dreamcaller-source={playerStatus.dreamcallerProfile?.id}
              />
            )}
          </div>
        </div>
      );
    },
  };
});

const TUTORIAL_DREAMCALLERS: TutorialView["dreamcallers"] = {
  player: {
    visual: {
      imageNumber: "0029",
      name: "Tensho",
      title: "Daimyo of Lacquered Fury",
      portraitFocus: { x: 0.5, y: 0.22 },
    },
    profile: {
      id: "BFC40414-5264-41BF-86E1-A0F41EE4F5B5",
      ability: "Dreamcaller ability is not active",
      unavailable: true,
    },
    settled: false,
  },
  enemy: {
    visual: {
      imageNumber: "0087",
      name: "Vrakmoth",
      title: "Ashbroker",
      portraitFocus: { x: 0.49, y: 0.18 },
    },
    profile: {
      id: "86026206-1B11-4F38-A24E-FD3C697F5353",
      ability: "Dreamcaller ability is not active",
      unavailable: true,
    },
    settled: false,
  },
};

const TUTORIAL_OPPONENT_CARD: MobileBattleView["enemyHand"][number] = {
  id: "tutorial-enemy-deck-1",
  model: {
    cardId: asCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
    displaySnapshot: {
      id: asCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
      name: asCardName("Tutorial Opponent Card"),
      cardNumber: 519,
      cardType: "Character",
      subtype: "Musician",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "",
      imageNumber: 1792373848,
      artOwned: false,
    },
  },
  exhausted: true,
  figment: false,
  figmentTitleBar: false,
  figmentCount: 0,
  storedTime: 0,
  showPlayableOutline: false,
};

class ResizeObserverStub {
  static callbacks: ResizeObserverCallback[] = [];

  static flush(): void {
    for (const callback of ResizeObserverStub.callbacks) {
      callback([], {} as ResizeObserver);
    }
  }

  constructor(callback: ResizeObserverCallback) {
    ResizeObserverStub.callbacks.push(callback);
  }
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

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
  globalThis.ResizeObserver = ResizeObserverStub;
  ResizeObserverStub.callbacks = [];
  screenMocks.props = null;
  screenMocks.dialogueProps = null;
  screenMocks.sceneInitial = null;
  screenMocks.sceneAnimate = null;
  screenMocks.sceneTransition = null;
  screenMocks.sceneAnimationComplete = null;
  screenMocks.arrivalInitial = null;
  screenMocks.arrivalAnimate = null;
  screenMocks.arrivalTransition = null;
  screenMocks.arrivalAnimationComplete = null;
  screenMocks.cardInitial = null;
  screenMocks.cardAnimate = null;
  screenMocks.cardTransition = null;
  screenMocks.cardAnimationComplete = null;
  screenMocks.cardFullAnimate = null;
  screenMocks.cardFullTransition = null;
  screenMocks.cardBattlefieldAnimate = null;
  screenMocks.cardBattlefieldTransition = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreen", () => {
  it("starts an action wait only after the scene has entered", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: {
                kind: "guide",
                model: {
                  portrait: { kind: "character-portrait", characterId: "mira" },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "Welcome, Dreamer.",
                },
              },
              playbackRunId: "event:1",
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                text: "Welcome, Dreamer.",
                wait: 3,
              },
              battle: { battleId: "tutorial-battle" } as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
      vi.advanceTimersByTime(10_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(2_999);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith("event:1", "welcome");

    act(() => root.unmount());
    container.remove();
  });

  it("fades in the battle before revealing CharacterDialogue", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: {
                kind: "guide",
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "Welcome, Dreamer.",
                },
              },
              playbackRunId: "event:1",
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                text: "Welcome, Dreamer.",
                wait: 3,
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: { backRank: [], frontRank: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
          />
        </CumulusRoot>,
      );
    });

    const tutorialScreen = container.querySelector<HTMLElement>(
      "[data-tutorial-screen]",
    );
    expect(tutorialScreen).not.toBeNull();
    expect(screenMocks.sceneInitial).toEqual({ opacity: 0 });
    expect(screenMocks.sceneAnimate).toEqual({ opacity: 1 });
    expect(screenMocks.sceneTransition).toEqual({ duration: 1.2 });
    expect(
      container.querySelector("[data-battle-mobile='tutorial-battle']"),
    ).not.toBeNull();
    expect(screenMocks.props?.inspectorDefault).toBe("collapsed");
    expect(screenMocks.props?.phaseNavigation).toBe("hidden");
    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.left).toBe("var(--gutter)");
    expect(dialogueAnchor?.style.top).toBe("0px");
    expect(dialogueAnchor?.style.bottom).toBe("");
    expect(dialogueAnchor?.style.justifyContent).toBe("flex-start");
    expect(
      container.querySelector("[data-character-dialogue='Mira']"),
    ).not.toBeNull();
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: {
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Welcome, Dreamer.",
      },
      size: "compact",
      visible: false,
    });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(screenMocks.dialogueProps?.visible).toBe(true);

    const dialogue = container.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    tutorialScreen!.style.setProperty("--space-6", "16px");
    tutorialScreen!.getBoundingClientRect = () =>
      DOMRect.fromRect({ width: 390, height: 844 });
    dialogue!.getBoundingClientRect = () =>
      DOMRect.fromRect({ width: 300, height: 64 });
    act(() => ResizeObserverStub.flush());
    expect(dialogueAnchor?.style.top).toBe("310px");

    act(() => root.unmount());
    container.remove();
  });

  it("finishes the portrait animation before applying its authored wait", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const onDreamcallerArrivalComplete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: {
                kind: "guide",
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "Welcome, Dreamer.",
                },
              },
              playbackRunId: "event:2",
              howToPlay: null,
              currentAction: {
                id: "dreamcaller-arrival",
                action: "animate-dreamcaller-portrait",
                owner: "player",
                pause: 1,
                duration: 0.6,
                wait: 0.5,
              },
              battle: {
                battleId: "tutorial-battle",
                player: {
                  status: {
                    dreamcaller: null,
                    currentEnergy: 0,
                    maxEnergy: 0,
                    points: 0,
                  },
                },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
            onDreamcallerArrivalComplete={onDreamcallerArrivalComplete}
          />
        </CumulusRoot>,
      );
    });

    const tutorialScreen = container.querySelector<HTMLElement>(
      "[data-tutorial-screen]",
    );
    const playerTarget = container.querySelector<HTMLElement>(
      '[data-testid="player-battle-status"] [data-battle-status-dreamcaller-placeholder]',
    );
    const dialoguePortrait = container.querySelector<HTMLElement>(
      "[data-character-dialogue-portrait-frame]",
    );
    tutorialScreen!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 844 });
    playerTarget!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 173, y: 700, width: 44, height: 44 });
    dialoguePortrait!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 18, y: 334, width: 176, height: 176 });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(
      container.querySelector("[data-tutorial-dreamcaller-arrival]"),
    ).not.toBeNull();
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: { text: "Welcome, Dreamer." },
      visible: true,
    });
    expect(screenMocks.arrivalInitial).toMatchObject({
      x: 173,
      y: 400,
      scale: 4,
    });
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 700],
      scale: [4, 4, 1],
    });
    const arrivalTransition = screenMocks.arrivalTransition as {
      readonly duration: number;
      readonly times: readonly number[];
    };
    expect(arrivalTransition.duration).toBeCloseTo(1.74);
    expect(arrivalTransition.times[0]).toBe(0);
    expect(arrivalTransition.times[1]).toBeCloseTo(1.14 / 1.74);
    expect(arrivalTransition.times[2]).toBe(1);
    expect(onActionComplete).not.toHaveBeenCalled();

    act(() => screenMocks.arrivalAnimationComplete?.());

    expect(onDreamcallerArrivalComplete).toHaveBeenCalledWith(
      TUTORIAL_DREAMCALLERS.player.profile.id,
      "player",
    );
    expect(screenMocks.props?.view.player.status).toMatchObject({
      dreamcaller: TUTORIAL_DREAMCALLERS.player.visual,
      dreamcallerProfile: TUTORIAL_DREAMCALLERS.player.profile,
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:2",
      "dreamcaller-arrival",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("animates the opponent portrait into the enemy battle status", () => {
    const onDreamcallerArrivalComplete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: null,
              playbackRunId: "event:3",
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-arrival",
                action: "animate-dreamcaller-portrait",
                owner: "enemy",
                pause: 1.5,
                duration: 0.6,
                wait: 0,
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: {
                  status: {
                    dreamcaller: null,
                    currentEnergy: 0,
                    maxEnergy: 0,
                    points: 0,
                  },
                },
                inspector: { opponentName: "Awaiting Dreamcaller" },
              } as MobileBattleView,
            }}
            onDreamcallerArrivalComplete={onDreamcallerArrivalComplete}
          />
        </CumulusRoot>,
      );
    });

    const tutorialScreen = container.querySelector<HTMLElement>(
      "[data-tutorial-screen]",
    );
    const enemyTarget = container.querySelector<HTMLElement>(
      '[data-testid="enemy-battle-status"] [data-battle-status-dreamcaller-placeholder]',
    );
    tutorialScreen!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 844 });
    enemyTarget!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 173, y: 100, width: 44, height: 44 });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(
      container.querySelector(
        '[data-tutorial-dreamcaller-arrival][data-tutorial-dreamcaller-owner="enemy"]',
      ),
    ).not.toBeNull();
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 100],
      scale: [1, 1, 1],
    });

    act(() => screenMocks.arrivalAnimationComplete?.());

    expect(onDreamcallerArrivalComplete).toHaveBeenCalledWith(
      TUTORIAL_DREAMCALLERS.enemy.profile.id,
      "enemy",
    );
    expect(screenMocks.props?.view.enemy.status).toMatchObject({
      dreamcaller: TUTORIAL_DREAMCALLERS.enemy.visual,
      dreamcallerProfile: TUTORIAL_DREAMCALLERS.enemy.profile,
    });
    expect(screenMocks.props?.view.inspector.opponentName).toBe("Vrakmoth");

    act(() => root.unmount());
    container.remove();
  });

  it("moves the opponent deck's top card face down into hand before completing the action", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: {
                kind: "dreamcaller",
                owner: "enemy",
                speakerName: "Vrakmoth",
                text: "For the Abyss!",
              },
              playbackRunId: "event:draw",
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-draw",
                action: "draw-opponent-card",
                wait: 0,
              },
              battle: {
                battleId: "tutorial-battle",
                enemyHandCardIds: [],
                enemyHand: [],
                farHand: {
                  owner: "enemy",
                  position: "far",
                  cardIds: [],
                  cards: [],
                },
                enemy: {
                  deckCardIds: [
                    "tutorial-enemy-deck-1",
                    "tutorial-enemy-deck-2",
                  ],
                },
                inspector: {
                  sides: {
                    enemy: { zones: { deck: 2, hand: 0 } },
                    player: { zones: {} },
                  },
                },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.props?.view.enemy.deckCardIds).toEqual([
      "tutorial-enemy-deck-1",
      "tutorial-enemy-deck-2",
    ]);
    expect(screenMocks.props?.view.enemyHandCardIds).toEqual([]);
    expect(screenMocks.props?.view.farHand.cardIds).toEqual([]);

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(screenMocks.props?.view.enemy.deckCardIds).toEqual([
      "tutorial-enemy-deck-2",
    ]);
    expect(screenMocks.props?.view.enemyHandCardIds).toEqual([
      "tutorial-enemy-deck-1",
    ]);
    expect(screenMocks.props?.view.farHand.cardIds).toEqual([
      "tutorial-enemy-deck-1",
    ]);
    expect(screenMocks.props?.view.enemyHand).toEqual([]);
    expect(screenMocks.props?.view.inspector.sides.enemy.zones).toMatchObject({
      deck: 1,
      hand: 1,
    });
    act(() => {
      vi.advanceTimersByTime(419);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:draw",
      "vrakmoth-draw",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("flips the UUID-backed hand card at the mirrored grid intersection, then plays it in the back-rank center", () => {
    vi.useFakeTimers();
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
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function rectForElement(this: HTMLElement) {
        if (this.matches("[data-tutorial-screen]")) {
          return DOMRect.fromRect({ width: 1920, height: 1080 });
        }
        if (this.matches('[data-battle-card-zone="far-hand"]')) {
          return DOMRect.fromRect({ x: 931, y: 0, width: 58, height: 81.2 });
        }
        const slotId = this.dataset.battleSlotId;
        const rank = this.parentElement?.dataset.battleRank;
        if (slotId !== undefined && rank !== undefined) {
          const slotParts = slotId.split("-");
          const index = Number(slotParts[slotParts.length - 1]);
          if (rank === "enemy-back") {
            return DOMRect.fromRect({
              x: 335.98 + index * 125.2,
              y: 205.2,
              width: 121.2,
              height: 121.2,
            });
          }
          return DOMRect.fromRect({
            x: 398.58 + index * 125.2,
            y: rank === "enemy-front" ? 330.4 : 455.6,
            width: 121.2,
            height: 121.2,
          });
        }
        return DOMRect.fromRect();
      },
    );
    const onActionComplete = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const emptySide = (owner: "enemy" | "player") => ({
      deckCardIds: [],
      banishedCardCount: 0,
      voidCards: [],
      backRank: Array.from({ length: 3 }, (_, index) => ({
        id: `${owner}-back-${String(index)}`,
        card: null,
      })),
      frontRank: Array.from({ length: 2 }, (_, index) => ({
        id: `${owner}-front-${String(index)}`,
        card: null,
      })),
      status: {
        dreamcaller: null,
        currentEnergy: 0,
        maxEnergy: 0,
        points: 0,
      },
    });

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: null,
              playbackRunId: "event:play",
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-reveal-and-play",
                action: "reveal-and-play-opponent-card",
                revealDuration: 2,
                wait: 0,
              },
              battle: {
                battleId: "tutorial-battle",
                enemyHandCardIds: [TUTORIAL_OPPONENT_CARD.id],
                enemyHand: [TUTORIAL_OPPONENT_CARD],
                farHand: {
                  owner: "enemy",
                  position: "far",
                  cardIds: [TUTORIAL_OPPONENT_CARD.id],
                  cards: [TUTORIAL_OPPONENT_CARD],
                },
                enemy: emptySide("enemy"),
                player: emptySide("player"),
                inspector: {
                  sides: {
                    enemy: { zones: { hand: 1, backRank: 0 } },
                    player: { zones: {} },
                  },
                },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
    });
    act(() => screenMocks.sceneAnimationComplete?.());

    expect(screenMocks.cardInitial).toMatchObject({
      x: 931,
      y: 0,
      width: 58,
      height: 81.2,
    });
    expect(screenMocks.cardAnimate).toEqual({
      x: [931, 1278.18, 1278.18, 836.78],
      y: [0, 285.6, 285.6, 205.2],
      width: [58, 240, 240, 121.2],
      height: [81.2, 336, 336, 121.2],
    });
    expect(screenMocks.cardTransition).toMatchObject({ duration: 2.84 });
    expect(screenMocks.cardFullAnimate).toEqual({ opacity: 0 });
    expect(screenMocks.cardFullTransition).toMatchObject({
      delay: 2.42,
      duration: 0.42,
    });
    expect(screenMocks.cardBattlefieldAnimate).toEqual({ opacity: 1 });
    expect(screenMocks.cardBattlefieldTransition).toMatchObject({
      delay: 2.42,
      duration: 0.42,
    });
    expect(
      container.querySelector(
        '[data-testid="tutorial-opponent-card-battlefield"][data-game-card-presentation="battlefield"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-card-battlefield-layer]",
      )?.style.filter,
    ).toBe("grayscale(0.5) brightness(0.62)");
    expect(
      container.querySelector(
        '[data-tutorial-card-id="229ab3a1-3720-41a2-924c-8fe112188f8e"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-battle-card-zone="far-hand"]')
        ?.style.visibility,
    ).toBe("hidden");

    act(() => screenMocks.cardAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screenMocks.props?.view.enemyHandCardIds).toEqual([]);
    expect(screenMocks.props?.view.farHand).toMatchObject({
      cardIds: [],
      cards: [],
    });
    expect(screenMocks.props?.view.enemy.backRank[4]?.card?.model.cardId).toBe(
      "229ab3a1-3720-41a2-924c-8fe112188f8e",
    );
    expect(screenMocks.props?.view.enemy.backRank[5]?.card).toBeNull();
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:play",
      "vrakmoth-reveal-and-play",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("opens the formatted How to Play dialog only after the first player turn announcement finishes and closes it from the X button", () => {
    vi.useFakeTimers();
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
    const onHowToPlayPresented = vi.fn();
    const onHowToPlayDismissed = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: null,
              playbackRunId: "event:player-turn",
              currentAction: null,
              howToPlay: {
                triggerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onHowToPlayPresented={onHowToPlayPresented}
            onHowToPlayDismissed={onHowToPlayDismissed}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog?.getAttribute("aria-label")).toBe("How to Play");
    expect(dialog?.getAttribute("data-glass-dialog-presentation")).toBe(
      "popup",
    );
    expect(dialog?.querySelector("header")).toBeNull();
    expect(dialog?.querySelector("h2")).toBeNull();
    expect(
      dialog?.querySelector("[data-glass-dialog-close-only]"),
    ).not.toBeNull();
    const content = dialog?.querySelector<HTMLElement>(
      "[data-tutorial-how-to-play-content]",
    );
    const paragraphs = [...(content?.querySelectorAll("p") ?? [])];
    expect(paragraphs).toHaveLength(2);
    expect(content?.style.gap).toBe("var(--space-7)");
    expect(content?.style.padding).toBe("var(--space-9)");
    expect(paragraphs[0]?.style.font).toBe(
      "var(--t-tutorial-instruction)",
    );
    expect(paragraphs[0]?.textContent).toContain(
      "Play characters and challenge with them to score",
    );
    expect(paragraphs[1]?.textContent?.replace(/\s+/g, " ")).toContain(
      "Score 10 to win this dream battle",
    );
    const challenge = paragraphs[0]?.querySelector("strong");
    expect(challenge?.textContent).toBe("challenge");
    expect(challenge?.style.color).toBe("var(--spark)");
    expect(dialog?.querySelectorAll('[aria-label="points"]')).toHaveLength(2);
    expect(dialog?.querySelector('[aria-label="points"]')?.className).toContain(
      "bxf bx-star-circle",
    );
    expect(dialog?.querySelector('[aria-label="spark"]')?.className).toContain(
      "bxf bx-sparkle",
    );
    expect(
      paragraphs[1]?.querySelector('[aria-label="points"]')?.parentElement
        ?.textContent,
    ).toBe("10");
    expect(
      paragraphs[1]?.querySelector<HTMLElement>('[aria-label="points"]')
        ?.parentElement?.style.columnGap,
    ).toBe("var(--space-2)");
    expect(
      paragraphs[0]?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-spark]",
      )?.style.verticalAlign,
    ).toBe("-0.14em");
    expect(
      document.querySelector("[data-tutorial-how-to-play-tweaks]"),
    ).toBeNull();
    expect(
      dialog?.querySelector<HTMLElement>("[data-glass-dialog-panel]")?.style
        .height,
    ).toBe("");
    expect(content?.style.width).toBe(
      "calc(500px - var(--space-5) - var(--space-5))",
    );
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:player-turn",
      "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    );

    act(() => {
      dialog
        ?.querySelector<HTMLButtonElement>(
          'button[aria-label="Close how to play"]',
        )
        ?.click();
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onHowToPlayDismissed).toHaveBeenCalledWith(
      "event:player-turn",
      "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("places opposing speech above all UI with a top-left pointer on the portrait rim", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function rectForElement(this: HTMLElement) {
        if (this.matches("[data-tutorial-screen]")) {
          return DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 844 });
        }
        if (this.matches("[data-dreamcaller-source]")) {
          return DOMRect.fromRect({ x: 173, y: 100, width: 44, height: 44 });
        }
        if (this.matches("[data-tutorial-dreamcaller-dialogue] aside")) {
          return DOMRect.fromRect({ x: 0, y: 0, width: 150, height: 90 });
        }
        return DOMRect.fromRect();
      },
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: {
                ...TUTORIAL_DREAMCALLERS,
                enemy: { ...TUTORIAL_DREAMCALLERS.enemy, settled: true },
              },
              dialogue: {
                kind: "dreamcaller",
                owner: "enemy",
                speakerName: "Vrakmoth",
                text: "For the Abyss!",
              },
              playbackRunId: "event:4",
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-taunt",
                action: "display-speech-bubble",
                speaker: "enemy",
                text: "For the Abyss!",
                wait: 3,
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: {
                  status: {
                    dreamcaller: TUTORIAL_DREAMCALLERS.enemy.visual,
                    dreamcallerProfile: TUTORIAL_DREAMCALLERS.enemy.profile,
                    currentEnergy: 0,
                    maxEnergy: 0,
                    points: 0,
                  },
                },
              } as MobileBattleView,
            }}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());

    const overlay = container.querySelector<HTMLElement>(
      '[data-tutorial-dreamcaller-dialogue-owner="enemy"]',
    );
    const bubble = container.querySelector<HTMLElement>(
      '[data-testid="tutorial-enemy-dreamcaller-speech-bubble"]',
    );
    const source = container.querySelector<HTMLElement>(
      "[data-dreamcaller-source]",
    );
    expect(source).not.toBeNull();
    expect(source?.getBoundingClientRect()).toMatchObject({
      x: 173,
      y: 100,
      width: 44,
      height: 44,
    });
    expect(bubble?.getBoundingClientRect()).toMatchObject({
      width: 150,
      height: 90,
    });
    expect(overlay?.style.width).toBe("max-content");
    expect(overlay?.style.maxWidth).toBe("220px");
    expect(bubble?.style.width).toBe("max-content");
    expect(bubble?.style.maxWidth).toBe("100%");
    expect(bubble?.querySelector("p")?.style.lineHeight).toBe("1.1");
    expect(overlay?.style.left).toBe("162px");
    expect(overlay?.style.top).toBe("142px");
    expect(overlay?.style.zIndex).toBe("var(--layer-reveal)");
    expect(overlay?.style.visibility).toBe("visible");
    expect(bubble?.dataset.speechBubblePointerPlacement).toBe("top-left");
    expect(bubble?.textContent).toContain("For the Abyss!");

    act(() => root.unmount());
    container.remove();
  });

  it("uses the prominent dialogue scale on desktop", () => {
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcallers: TUTORIAL_DREAMCALLERS,
              dialogue: {
                kind: "guide",
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "Welcome, Dreamer.",
                },
              },
              playbackRunId: "event:1",
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                text: "Welcome, Dreamer.",
                wait: 3,
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: { backRank: [], frontRank: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.dialogueProps?.size).toBe("prominent");

    act(() => root.unmount());
    container.remove();
  });
});
