// @vitest-environment jsdom

import { act, type CSSProperties, type ReactNode, type Ref } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { ENERGY_ICON_COLOR } from "../components/controls/GlowIcon";
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
  cardFlipAnimate: unknown;
  cardFlipTransition: unknown;
  cardBattlefieldAnimate: unknown;
  cardBattlefieldTransition: unknown;
  challengeRematerializedAnimationComplete: (() => void) | null;
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
  cardFlipAnimate: null,
  cardFlipTransition: null,
  cardBattlefieldAnimate: null,
  cardBattlefieldTransition: null,
  challengeRematerializedAnimationComplete: null as (() => void) | null,
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
  readonly "data-tutorial-card-flip-layer"?: string;
  readonly "data-tutorial-card-full-layer"?: string;
  readonly "data-tutorial-opponent-card-play"?: string;
  readonly "data-tutorial-challenge-rematerialized"?: string;
  readonly initial?: unknown;
  readonly onAnimationComplete?: () => void;
  readonly style?: CSSProperties;
  readonly transition?: unknown;
}

vi.mock("framer-motion", () => ({
  useReducedMotion: () => false,
  MotionConfig: ({ children }: { readonly children?: ReactNode }) => (
    <>{children}</>
  ),
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
      } else if (
        elementProps["data-tutorial-challenge-rematerialized"] !== undefined
      ) {
        screenMocks.challengeRematerializedAnimationComplete =
          onAnimationComplete ?? null;
      } else if (elementProps["data-tutorial-card-full-layer"] !== undefined) {
        screenMocks.cardFullAnimate = animate;
        screenMocks.cardFullTransition = transition;
      } else if (elementProps["data-tutorial-card-flip-layer"] !== undefined) {
        screenMocks.cardFlipAnimate = animate;
        screenMocks.cardFlipTransition = transition;
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
              <div
                key={slot.id}
                data-battle-slot-id={slot.id}
                data-battle-slot-filled={slot.card === null ? "false" : "true"}
              >
                {slot.card === null ? null : (
                  <div
                    data-battle-card-id={slot.card.id}
                    data-card-id={slot.card.model.cardId}
                  >
                    <div data-battle-card-motion="" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div data-battle-rank="enemy-front">
            {props.view.enemy?.frontRank?.map((slot) => (
              <div
                key={slot.id}
                data-battle-slot-id={slot.id}
                data-battle-slot-filled={slot.card === null ? "false" : "true"}
              >
                {props.preserveOccupiedSlotOutlines === true ? (
                  <div data-battle-slot-outline="" />
                ) : null}
                {slot.card === null ? null : (
                  <div
                    data-battle-card-id={slot.card.id}
                    data-card-id={slot.card.model.cardId}
                  >
                    <div data-battle-card-motion="" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div data-battle-rank="player-front">
            {props.view.player?.frontRank?.map((slot) => (
              <div
                key={slot.id}
                data-battle-slot-id={slot.id}
                data-battle-slot-filled={slot.card === null ? "false" : "true"}
              >
                {props.preserveOccupiedSlotOutlines === true ? (
                  <div data-battle-slot-outline="" />
                ) : null}
                {slot.card === null ? null : (
                  <div
                    data-battle-card-id={slot.card.id}
                    data-card-id={slot.card.model.cardId}
                  >
                    <div data-battle-card-motion="" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div data-battle-rank="player-back">
            {props.view.player?.backRank?.map((slot) => (
              <div
                key={slot.id}
                data-battle-slot-id={slot.id}
                data-battle-slot-filled={slot.card === null ? "false" : "true"}
              >
                {slot.card === null ? null : (
                  <div
                    data-battle-card-id={slot.card.id}
                    data-card-id={slot.card.model.cardId}
                  >
                    <div data-battle-card-motion="" />
                  </div>
                )}
              </div>
            ))}
          </div>
          <div data-battle-zone="enemy-void">
            <div data-battle-pile-frame="" />
          </div>
          <div data-battle-zone="player-void">
            <div data-battle-pile-frame="" />
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
          <div data-battle-mobile-row="enemy-zones">
            {props.view.dreamwell === null ||
            props.view.dreamwell === undefined ? null : (
              <div
                data-battle-dreamwell-layer=""
                data-battle-dreamwell-side={props.view.dreamwell.side}
              >
                <div
                  data-dreamwell-card={props.view.dreamwell.model.cardId}
                />
              </div>
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
      imageNumber: "0025",
      name: "Threxan",
      title: "the Resounding Wrath",
      portraitFocus: { x: 0.5, y: 0.2 },
    },
    profile: {
      id: "B99936CA-97F9-4930-AF5A-FA9EF92557EF",
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
      name: asCardName("Twilight Troubadour"),
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

const TUTORIAL_PLAYER_CARD: MobileBattleView["playerHand"][number] = {
  ...TUTORIAL_OPPONENT_CARD,
  id: "tutorial-player-deck-1",
  model: {
    ...TUTORIAL_OPPONENT_CARD.model,
    cardId: asCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
    displaySnapshot: {
      ...TUTORIAL_OPPONENT_CARD.model.displaySnapshot,
      id: asCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      name: asCardName("Marked Direwolf"),
      spark: 4,
    },
  },
  exhausted: false,
  showPlayableOutline: true,
};

const TUTORIAL_DREAMWELL_CARD: NonNullable<
  MobileBattleView["dreamwell"]
>["model"] = {
  cardId: asCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
  displaySnapshot: {
    id: asCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
    name: "Autumn Glade",
    renderedText: "Gain 2⍟.",
    energyAdded: 1,
    imageNumber: 1789989917,
  },
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
  screenMocks.cardFlipAnimate = null;
  screenMocks.cardFlipTransition = null;
  screenMocks.cardBattlefieldAnimate = null;
  screenMocks.cardBattlefieldTransition = null;
  screenMocks.challengeRematerializedAnimationComplete = null;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TutorialScreen", () => {
  it("applies an authored desktop width to guide speech", () => {
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
                verticalOffset: 0,
                bubbleWidth: 450,
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "A custom greeting.",
                },
              },
              playbackRunId: "event:width",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "greeting",
                action: "display-speech-bubble",
                speechBubble: {
                  speaker: "mira",
                  duration: 3,
                  verticalOffset: 0,
                  bubbleWidth: 450,
                  text: "A custom greeting.",
                },
                wait: 1,
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

    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-dialogue-anchor]",
      )?.style.maxWidth,
    ).toBe("450px");

    act(() => root.unmount());
    container.remove();
  });

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
                verticalOffset: 0,
                model: {
                  portrait: { kind: "character-portrait", characterId: "mira" },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "Welcome, Dreamer.",
                },
              },
              playbackRunId: "event:1",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                speechBubble: {
                  speaker: "mira",
                  duration: 3,
                  verticalOffset: 0,
                  bubbleWidth: 700,
                  text: "Welcome, Dreamer.",
                },
                wait: 0,
              },
              battle: { battleId: "tutorial-battle" } as MobileBattleView,
            }}
            playbackSpeed={4}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
      vi.advanceTimersByTime(10_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    expect(screenMocks.sceneTransition).toEqual({ duration: 0.3 });
    expect(screenMocks.props?.playbackSpeed).toBe(4);
    expect(screenMocks.dialogueProps?.playbackSpeed).toBe(4);
    expect(
      container.querySelector<HTMLElement>("[data-tutorial-screen]")?.style
        .getPropertyValue("--dur-slow"),
    ).toBe("0.105s");

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(749);
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
                verticalOffset: 100,
                bubbleWidth: 450,
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
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                speechBubble: {
                  speaker: "mira",
                  duration: 3,
                  verticalOffset: 0,
                  bubbleWidth: 700,
                  text: "Welcome, Dreamer.",
                },
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
    expect(screenMocks.props?.zoneLabels).toBe("voids");
    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.left).toBe("var(--gutter)");
    expect(dialogueAnchor?.style.top).toBe("100px");
    expect(dialogueAnchor?.style.bottom).toBe("");
    expect(dialogueAnchor?.style.justifyContent).toBe("flex-start");
    expect(dialogueAnchor?.style.maxWidth).toBe("");
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
    expect(dialogueAnchor?.style.top).toBe("410px");

    act(() => root.unmount());
    container.remove();
  });

  it("anchors reveal dialogue below the centered reading card on mobile", () => {
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
                verticalOffset: 0,
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "This card has a ▸Dawn ability.",
                },
              },
              playbackRunId: "event:reveal-dialogue",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "runebound-reveal",
                action: "reveal-and-play-opponent-card",
                cardId: "a28ad36d-fa74-4190-a463-7efd3a6233d0",
                revealDuration: 5,
                speechBubble: {
                  speaker: "mira",
                  duration: 5,
                  verticalOffset: 0,
                  bubbleWidth: 700,
                  text: "This card has a ▸Dawn ability.",
                },
                wait: 0,
              },
              battle: {
                battleId: "tutorial-battle",
                enemyHand: [],
                enemy: { backRank: [], frontRank: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
          />
        </CumulusRoot>,
      );
    });

    const dialogueAnchor = container.querySelector<HTMLElement>(
      "[data-tutorial-dialogue-anchor]",
    );
    expect(dialogueAnchor?.style.top).toBe("");
    expect(dialogueAnchor?.style.bottom).toBe(
      "calc(var(--safe-area-inset-bottom) + var(--space-12))",
    );
    expect(dialogueAnchor?.style.visibility).toBe("visible");

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
                verticalOffset: 0,
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
              endTurn: null,
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
      opacity: 1,
    });
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 700],
      scale: [4, 4, 1],
      opacity: 1,
    });
    const arrivalTransition = screenMocks.arrivalTransition as {
      readonly duration: number;
      readonly times: readonly number[];
    };
    expect(arrivalTransition.duration).toBeCloseTo(1.6);
    expect(arrivalTransition.times[0]).toBe(0);
    expect(arrivalTransition.times[1]).toBeCloseTo(1 / 1.6);
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
              endTurn: null,
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
    expect(screenMocks.props?.view.inspector.opponentName).toBe("Threxan");

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
                bubbleWidth: 450,
                speakerName: "Threxan",
                text: "For the Abyss!",
              },
              playbackRunId: "event:draw",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-draw",
                action: "draw-opponent-card",
                cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
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
              dialogue: {
                kind: "guide",
                verticalOffset: 0,
                model: {
                  portrait: {
                    kind: "character-portrait",
                    characterId: "mira",
                  },
                  portraitAlt: "Mira",
                  speakerName: "Mira",
                  text: "This card has a ▸Dawn ability.",
                },
              },
              playbackRunId: "event:play",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-reveal-and-play",
                action: "reveal-and-play-opponent-card",
                cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
                revealDuration: 2,
                speechBubble: {
                  speaker: "mira",
                  duration: 2,
                  verticalOffset: 0,
                  bubbleWidth: 700,
                  text: "This card has a ▸Dawn ability.",
                },
                wait: 0,
              },
              opponentCardToReveal: TUTORIAL_OPPONENT_CARD,
              battle: {
                battleId: "tutorial-battle",
                enemyHandCardIds: [TUTORIAL_OPPONENT_CARD.id],
                enemyHand: [],
                farHand: {
                  owner: "enemy",
                  position: "far",
                  cardIds: [TUTORIAL_OPPONENT_CARD.id],
                  cards: [],
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
      x: [931, 1278.18, 1278.18, 1278.18, 836.78],
      y: [0, 285.6, 285.6, 285.6, 205.2],
      width: [58, 240, 240, 240, 121.2],
      height: [81.2, 336, 336, 336, 121.2],
    });
    expect(screenMocks.cardTransition).toMatchObject({ duration: 3.26 });
    expect(screenMocks.cardFlipAnimate).toEqual({
      rotateY: [0, 0, 180, 180, 180],
    });
    expect(screenMocks.cardFlipTransition).toMatchObject({ duration: 3.26 });
    expect(screenMocks.cardFullAnimate).toEqual({ opacity: 0 });
    expect(screenMocks.cardFullTransition).toMatchObject({
      delay: 2.84,
      duration: 0.42,
    });
    expect(screenMocks.cardBattlefieldAnimate).toEqual({ opacity: 1 });
    expect(screenMocks.cardBattlefieldTransition).toMatchObject({
      delay: 2.84,
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
    expect(screenMocks.dialogueProps).toMatchObject({
      dialogue: { speakerName: "Mira", text: "This card has a ▸Dawn ability." },
      visible: false,
    });
    act(() => {
      vi.advanceTimersByTime(839);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1_999);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(true);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screenMocks.dialogueProps?.visible).toBe(false);

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

  it("plays the opponent card into the center mobile back-rank slot", () => {
    vi.useFakeTimers();
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
              playbackRunId: "event:mobile-play",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-reveal-and-play",
                action: "reveal-and-play-opponent-card",
                cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
                revealDuration: 0,
                wait: 0,
              },
              opponentCardToReveal: TUTORIAL_OPPONENT_CARD,
              battle: {
                battleId: "tutorial-battle",
                enemyHandCardIds: [TUTORIAL_OPPONENT_CARD.id],
                enemyHand: [],
                farHand: {
                  owner: "enemy",
                  position: "far",
                  cardIds: [TUTORIAL_OPPONENT_CARD.id],
                  cards: [],
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
          />
        </CumulusRoot>,
      );
    });
    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => screenMocks.cardAnimationComplete?.());

    expect(screenMocks.props?.view.enemy.backRank).toHaveLength(6);
    expect(screenMocks.props?.view.enemy.backRank[0]?.card).toBeNull();
    expect(screenMocks.props?.view.enemy.backRank[1]?.card).toBeNull();
    expect(screenMocks.props?.view.enemy.backRank[2]?.card?.model.cardId).toBe(
      "229ab3a1-3720-41a2-924c-8fe112188f8e",
    );
    expect(screenMocks.props?.view.enemy.backRank[3]?.card).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("repositions one opponent character without shifting an adjacent back-rank card", () => {
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
    const onActionComplete = vi.fn();
    const championCard = {
      ...TUTORIAL_OPPONENT_CARD,
      id: "tutorial-enemy-deck-2",
      model: {
        ...TUTORIAL_OPPONENT_CARD.model,
        cardId: asCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0"),
        displaySnapshot: {
          ...TUTORIAL_OPPONENT_CARD.model.displaySnapshot,
          id: asCardId("a28ad36d-fa74-4190-a463-7efd3a6233d0"),
          name: asCardName("Runebound Champion"),
        },
      },
    };
    const enemyBackRank = Array.from({ length: 3 }, (_, index) => ({
      id: `enemy-back-${String(index)}`,
      card: index === 1 ? championCard : null,
    }));
    const enemyFrontRank = Array.from({ length: 2 }, (_, index) => ({
      id: `enemy-front-${String(index)}`,
      card:
        index === 0
          ? { ...TUTORIAL_OPPONENT_CARD, layoutMotion: "travel" as const }
          : null,
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
              dialogue: null,
              playbackRunId: "event:reposition",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "opponent-character-advance",
                action: "reposition-opponent-character",
                cardId: TUTORIAL_OPPONENT_CARD.model.cardId,
                wait: 0,
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: {
                  backRank: enemyBackRank,
                  frontRank: enemyFrontRank,
                  deckCardIds: [],
                },
                player: {
                  backRank: [],
                  frontRank: [],
                  deckCardIds: [],
                },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    expect(screenMocks.props?.view.enemy.backRank).toHaveLength(10);
    expect(screenMocks.props?.view.enemy.backRank[4]?.card).toBeNull();
    expect(screenMocks.props?.view.enemy.backRank[5]?.card).toMatchObject({
      id: "tutorial-enemy-deck-2",
      model: { cardId: "a28ad36d-fa74-4190-a463-7efd3a6233d0" },
    });
    expect(screenMocks.props?.view.enemy.frontRank).toHaveLength(9);
    expect(screenMocks.props?.view.enemy.frontRank[4]?.card).toMatchObject({
      id: TUTORIAL_OPPONENT_CARD.id,
      layoutMotion: "travel",
    });
    expect(screenMocks.props?.view.enemy.frontRank[3]?.card).toBeNull();
    expect(onActionComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(419);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:reposition",
      "opponent-character-advance",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("opens the authored How to Play action after the player turn announcement and completes it from the X button", () => {
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
    const onActionComplete = vi.fn();
    const howToPlayText =
      "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦), or [yellow]accept[/yellow] a challenge.\n\nScore 12 ⍟ to win this configured battle.";
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
              endTurn: null,
              currentAction: {
                id: "how-to-play",
                action: "display-how-to-play",
                text: howToPlayText,
                wait: 0,
              },
              howToPlay: {
                actionId: "how-to-play",
                text: howToPlayText,
                wait: 0,
                trigger: "player-turn-announcement-complete",
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
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
      dialog?.querySelector("[data-glass-dialog-flowing-close]"),
    ).not.toBeNull();
    const content = dialog?.querySelector<HTMLElement>(
      "[data-tutorial-how-to-play-content]",
    );
    const paragraphs = [...(content?.querySelectorAll("p") ?? [])];
    expect(paragraphs).toHaveLength(2);
    expect(content?.style.paddingTop).toBe("var(--space-9)");
    expect(content?.style.paddingRight).toBe("var(--space-9)");
    expect(content?.style.paddingBottom).toBe("var(--space-9)");
    expect(content?.style.paddingLeft).toBe("var(--space-9)");
    expect(paragraphs[0]?.style.font).toBe(
      "var(--t-tutorial-instruction)",
    );
    expect(paragraphs[0]?.style.marginTop).toBe("0px");
    expect(paragraphs[1]?.style.marginTop).toBe("var(--space-7)");
    expect(paragraphs[0]?.textContent).toContain(
      "Play characters and challenge with them to score points () equal to their spark (), or accept a challenge",
    );
    expect(paragraphs[1]?.textContent?.replace(/\s+/g, " ")).toContain(
      "Score 12 to win this configured battle",
    );
    const highlights = [
      ...(paragraphs[0]?.querySelectorAll<HTMLElement>(
        '[data-tutorial-instruction-highlight="yellow"]',
      ) ?? []),
    ];
    expect(highlights.map((highlight) => highlight.textContent)).toEqual([
      "challenge",
      "accept",
    ]);
    expect(highlights.every((highlight) => highlight.style.color === "var(--spark)")).toBe(
      true,
    );
    expect(highlights.some((highlight) => highlight.textContent === "a challenge")).toBe(
      false,
    );
    expect(dialog?.querySelectorAll('[aria-label="points"]')).toHaveLength(1);
    expect(dialog?.querySelector('[aria-label="points"]')?.className).toContain(
      "bxf bx-star-circle",
    );
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-points-term] i",
      )?.className,
    ).toContain("bxf bx-star-circle");
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-spark-term] i",
      )?.className,
    ).toContain("bxf bx-sparkle");
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-points-term] i",
      )?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      paragraphs[0]?.querySelector(
        "[data-tutorial-how-to-play-spark-term] i",
      )?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      paragraphs[0]?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-spark-term]",
      )?.style.alignItems,
    ).toBe("center");
    expect(
      paragraphs[0]?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-spark-term]",
      )?.textContent,
    ).toBe("spark ()");
    expect(
      paragraphs[0]?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-points-term]",
      )?.textContent,
    ).toBe("points ()");
    expect(
      paragraphs[1]?.querySelector('[aria-label="points"]')?.className,
    ).toContain(
      "bxf bx-star-circle",
    );
    expect(
      paragraphs[1]?.querySelector('[aria-label="points"]')?.parentElement
        ?.textContent,
    ).toBe("12");
    expect(
      paragraphs[1]?.querySelector<HTMLElement>('[aria-label="points"]')
        ?.parentElement?.style.columnGap,
    ).toBe("var(--space-2)");
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
      "how-to-play",
      "player-turn-announcement-complete",
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
      "how-to-play",
      "player-turn-announcement-complete",
    );
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:player-turn",
      "how-to-play",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("opens a generalized How to Play action after the opponent turn announcement", () => {
    const onHowToPlayPresented = vi.fn();
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
              playbackRunId: "event:dreamwell",
              endTurn: null,
              currentAction: {
                id: "dreamwell-how-to-play",
                action: "display-how-to-play",
                trigger: "enemy-turn-announcement-complete",
                text: "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
                wait: 0,
              },
              howToPlay: {
                actionId: "dreamwell-how-to-play",
                text: "From turn 2, players draw dreamwell cards that increase their energy (●) production and have other effects.",
                wait: 0,
                trigger: "enemy-turn-announcement-complete",
              },
              battle: {
                battleId: "tutorial-battle",
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onHowToPlayPresented={onHowToPlayPresented}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    expect(
      container.querySelector('[role="dialog"]')?.textContent,
    ).toContain(
      "From turn 2, players draw dreamwell cards that increase their energy () production and have other effects.",
    );
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:dreamwell",
      "dreamwell-how-to-play",
      "enemy-turn-announcement-complete",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("emerges the Dreamwell card before pairing it with the immediate instruction", () => {
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
              playbackRunId: "event:dreamwell-pair",
              endTurn: null,
              currentAction: {
                id: "dreamwell-how-to-play",
                action: "display-how-to-play",
                trigger: "immediate",
                companion: "dreamwell-card",
                text: "From turn 2, players draw [yellow]dreamwell[/yellow] cards that increase their energy (●) production and have other effects.",
                wait: 0,
              },
              howToPlay: {
                actionId: "dreamwell-how-to-play",
                text: "From turn 2, players draw [yellow]dreamwell[/yellow] cards that increase their energy (●) production and have other effects.",
                wait: 0,
                trigger: "immediate",
                cardWidth: 650,
                companion: TUTORIAL_DREAMWELL_CARD,
              },
              battle: {
                battleId: "tutorial-battle",
                dreamwell: {
                  side: "enemy",
                  model: TUTORIAL_DREAMWELL_CARD,
                },
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onHowToPlayPresented={onHowToPlayPresented}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        "[data-battle-dreamwell-layer]",
      )?.dataset.tutorialDreamwellEmergence,
    ).toBe("emerging");
    const dreamwellSideZone = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-zones"]',
    );
    expect(
      dreamwellSideZone?.dataset.tutorialDreamwellEmergenceLayer,
    ).toBe("");
    expect(dreamwellSideZone?.style.zIndex).toBe("5");
    expect(screenMocks.props?.view.dreamwell?.model.cardId).toBe(
      TUTORIAL_DREAMWELL_CARD.cardId,
    );

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(onHowToPlayPresented).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
    expect(
      dialog?.querySelector<HTMLElement>(
        "[data-glass-dialog-companion-layout]",
      )?.dataset.glassDialogCompanionLayout,
    ).toBe("horizontal");
    expect(
      dialog?.querySelector("[data-dreamwell-card]")?.getAttribute(
        "data-dreamwell-card",
      ),
    ).toBe(TUTORIAL_DREAMWELL_CARD.cardId);
    expect(
      dialog?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-content]",
      )?.style.width,
    ).toBe("calc(650px - var(--space-5) - var(--space-5))");
    expect(
      dialog?.querySelector<HTMLElement>(
        "[data-tutorial-how-to-play-content]",
      )?.style.paddingTop,
    ).toBe("var(--space-9)");
    expect(
      dialog?.querySelector(
        "[data-tutorial-how-to-play-close-clearance]",
      ),
    ).toBeNull();
    const dreamwellTerm = dialog?.querySelector<HTMLElement>(
      '[data-tutorial-instruction-highlight="yellow"]',
    );
    expect(dreamwellTerm?.textContent).toBe("dreamwell");
    expect(dreamwellTerm?.style.color).toBe("var(--spark)");
    const energyTerm = dialog?.querySelector<HTMLElement>(
      "[data-tutorial-how-to-play-energy-term]",
    );
    const energyIcon = energyTerm?.querySelector<HTMLElement>(
      '[aria-label="energy"]',
    );
    expect(energyIcon?.className).toContain("bxf bx-fire-alt");
    const expectedEnergyColor = document.createElement("span");
    expectedEnergyColor.style.color = ENERGY_ICON_COLOR;
    expect(energyIcon?.style.color).toBe(expectedEnergyColor.style.color);
    expect(energyIcon?.parentElement?.style.verticalAlign).toBe("middle");
    expect(energyIcon?.parentElement?.style.transform).toBe(
      "translateY(-0.08em)",
    );
    expect(screenMocks.props?.view.dreamwell).toBeNull();
    expect(
      dreamwellSideZone?.dataset.tutorialDreamwellEmergenceLayer,
    ).toBeUndefined();
    expect(dreamwellSideZone?.style.zIndex).toBe("");
    expect(onHowToPlayPresented).toHaveBeenCalledWith(
      "event:dreamwell-pair",
      "dreamwell-how-to-play",
      "immediate",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("keeps a tutorial Dreamwell hidden until the opponent announcement completes", () => {
    vi.useFakeTimers();
    const onActionComplete = vi.fn();
    const cardId = asCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3");
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
              playbackRunId: "event:dreamwell",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "autumn-glade",
                action: "draw-dreamwell-card",
                owner: "enemy",
                cardId,
                wait: 0.5,
              },
              battle: {
                battleId: "tutorial-battle",
                dreamwell: {
                  side: "enemy",
                  model: {
                    cardId,
                    displaySnapshot: {
                      id: cardId,
                      name: "Autumn Glade",
                      renderedText: "Gain 2⍟.",
                      energyAdded: 1,
                      imageNumber: 1789989917,
                    },
                  },
                },
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    expect(screenMocks.props?.view.dreamwell).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("player");
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      screenMocks.props?.onTurnAnnouncementComplete?.("enemy");
    });
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(onActionComplete).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:dreamwell",
      "autumn-glade",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("bridges the tutorial hand card after the how-to-play action completes", () => {
    const onPlayerCardPlay = vi.fn();
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
              currentAction: {
                id: "end-turn",
                action: "end-turn",
                wait: 0,
              },
              howToPlay: null,
              endTurn: {
                actionId: "end-turn",
                triggerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
                ready: false,
              },
              battle: {
                battleId: "tutorial-battle",
                playerHand: [TUTORIAL_PLAYER_CARD],
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onPlayerCardPlay={onPlayerCardPlay}
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.props?.interactions).toMatchObject({
      canInteract: true,
      pendingCardId: null,
      pendingCardSource: null,
      pendingCardOwner: null,
    });

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "near-hand",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "near-hand",
      pendingCardOwner: "player",
    });

    act(() => {
      screenMocks.props?.interactions?.onSlotDrop({
        owner: "player",
        rank: "back",
        slotId: "B4",
      });
    });
    expect(onPlayerCardPlay).toHaveBeenCalledWith(
      "event:player-turn",
      TUTORIAL_PLAYER_CARD.id,
      TUTORIAL_PLAYER_CARD.model.cardId,
      "B4",
    );
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: null,
      pendingCardSource: null,
      pendingCardOwner: null,
    });

    act(() => root.unmount());
    container.remove();
  });

  it("places the played UUID-backed tutorial card in the fifth desktop back-rank slot", () => {
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
              dialogue: null,
              playbackRunId: "event:player-card-position",
              currentAction: {
                id: "end-turn",
                action: "end-turn",
                wait: 0,
              },
              howToPlay: null,
              endTurn: {
                actionId: "end-turn",
                triggerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
                ready: true,
              },
              battle: {
                battleId: "tutorial-battle",
                playerHand: [],
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: {
                  backRank: [
                    {
                      id: "player-back-0",
                      card: TUTORIAL_PLAYER_CARD,
                    },
                    { id: "player-back-1", card: null },
                    { id: "player-back-2", card: null },
                  ],
                  frontRank: [],
                },
              } as unknown as MobileBattleView,
            }}
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.props?.view.player.backRank).toHaveLength(10);
    expect(screenMocks.props?.view.player.backRank[4]?.card?.model.cardId).toBe(
      TUTORIAL_PLAYER_CARD.model.cardId,
    );
    expect(screenMocks.props?.view.player.backRank[5]?.card).toBeNull();

    act(() => root.unmount());
    container.remove();
  });

  it("highlights the opposing lane and bridges the guided player block", () => {
    const onPlayerCharacterReposition = vi.fn();
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
              playbackRunId: "event:block",
              currentAction: {
                id: "block-opponent",
                action: "reposition-player-character",
                cardId: TUTORIAL_PLAYER_CARD.model.cardId,
                opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
                wait: 0,
              },
              howToPlay: null,
              endTurn: null,
              playerReposition: {
                actionId: "block-opponent",
                cardInstanceId: TUTORIAL_PLAYER_CARD.id,
                cardId: TUTORIAL_PLAYER_CARD.model.cardId,
                opposingCardId: TUTORIAL_OPPONENT_CARD.model.cardId,
              },
              battle: {
                battleId: "tutorial-battle",
                playerHand: [],
                enemy: {
                  backRank: [],
                  frontRank: [
                    {
                      id: "enemy-front-0",
                      card: TUTORIAL_OPPONENT_CARD,
                    },
                  ],
                  deckCardIds: [],
                },
                player: {
                  backRank: [
                    {
                      id: "player-back-0",
                      card: TUTORIAL_PLAYER_CARD,
                    },
                  ],
                  frontRank: [
                    { id: "player-front-0", card: null },
                    { id: "player-front-1", card: null },
                  ],
                },
              } as unknown as MobileBattleView,
            }}
            onPlayerCharacterReposition={onPlayerCharacterReposition}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => ResizeObserverStub.flush());

    expect(screenMocks.props?.guidedSlotHighlight).toEqual({
      owner: "player",
      rank: "front",
      slotId: "player-front-0",
      label: "Drag Marked Direwolf to block Twilight Troubadour.",
    });

    act(() => {
      screenMocks.props?.interactions?.onCardDragStart(
        TUTORIAL_PLAYER_CARD.id,
        "battlefield",
      );
    });
    expect(screenMocks.props?.interactions).toMatchObject({
      pendingCardId: TUTORIAL_PLAYER_CARD.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
    });

    act(() => {
      screenMocks.props?.interactions?.onSlotDrop({
        owner: "player",
        rank: "front",
        slotId: "player-front-1",
      });
    });
    expect(onPlayerCharacterReposition).not.toHaveBeenCalled();

    act(() => {
      screenMocks.props?.interactions?.onSlotDrop({
        owner: "player",
        rank: "front",
        slotId: "player-front-0",
      });
    });
    expect(onPlayerCharacterReposition).toHaveBeenCalledWith(
      "event:block",
      "block-opponent",
      TUTORIAL_PLAYER_CARD.model.cardId,
      TUTORIAL_OPPONENT_CARD.model.cardId,
      "player-front-0",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("lifts the challenge pair, dissolves the lower-spark card, and completes after rematerialization", () => {
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
              dialogue: null,
              playbackRunId: "event:challenge",
              currentAction: {
                id: "resolve-challenge",
                action: "resolve-challenge",
                challengerCardId:
                  TUTORIAL_OPPONENT_CARD.model.cardId,
                defenderCardId: TUTORIAL_PLAYER_CARD.model.cardId,
                wait: 0,
              },
              howToPlay: null,
              endTurn: null,
              playerReposition: null,
              challenge: {
                actionId: "resolve-challenge",
                challenger: {
                  owner: "enemy",
                  card: TUTORIAL_OPPONENT_CARD,
                  spark: 2,
                },
                defender: {
                  owner: "player",
                  card: TUTORIAL_PLAYER_CARD,
                  spark: 4,
                },
                winnerOwner: "player",
                loserOwner: "enemy",
              },
              battle: {
                battleId: "tutorial-battle",
                phase: "challenge",
                playerHand: [],
                enemy: {
                  backRank: [],
                  frontRank: [
                    {
                      id: "enemy-front-0",
                      card: TUTORIAL_OPPONENT_CARD,
                    },
                  ],
                  deckCardIds: [],
                },
                player: {
                  backRank: [],
                  frontRank: [
                    {
                      id: "player-front-0",
                      card: TUTORIAL_PLAYER_CARD,
                    },
                  ],
                },
              } as unknown as MobileBattleView,
            }}
            onActionComplete={onActionComplete}
          />
        </CumulusRoot>,
      );
    });

    act(() => screenMocks.sceneAnimationComplete?.());
    act(() => {
      vi.advanceTimersByTime(500);
    });

    const animation = container.querySelector(
      "[data-tutorial-challenge-animation]",
    );
    expect(animation).not.toBeNull();
    expect(animation?.getAttribute("data-tutorial-challenge-winner-card-id"))
      .toBe(TUTORIAL_PLAYER_CARD.model.cardId);
    expect(animation?.getAttribute("data-tutorial-challenge-loser-card-id"))
      .toBe(TUTORIAL_OPPONENT_CARD.model.cardId);
    expect(
      container.querySelectorAll("[data-tutorial-challenge-mote]"),
    ).toHaveLength(24);
    expect(
      container.querySelector<HTMLElement>(
        '[data-battle-rank="enemy-front"] [data-battle-card-id]',
      )?.style.visibility,
    ).toBe("");
    expect(
      container.querySelector<HTMLElement>(
        '[data-battle-rank="player-front"] [data-battle-card-id]',
      )?.style.visibility,
    ).toBe("");
    expect(
      container.querySelector<HTMLElement>(
        '[data-battle-rank="enemy-front"] [data-battle-card-motion]',
      )?.style.visibility,
    ).toBe("hidden");
    expect(
      container.querySelector<HTMLElement>(
        '[data-battle-rank="player-front"] [data-battle-card-motion]',
      )?.style.visibility,
    ).toBe("hidden");
    expect(screenMocks.props?.preserveOccupiedSlotOutlines).toBe(true);
    expect(
      container.querySelector(
        '[data-battle-rank="enemy-front"] [data-battle-slot-id="enemy-front-0"] [data-battle-slot-outline]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        '[data-tutorial-challenge-card="enemy"]',
      )?.style.filter,
    ).toBe("");
    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-challenge-rematerialized]",
      )?.style.filter,
    ).toBe("");
    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-challenge-mote]",
      )?.style.background,
    ).toBe("var(--tutorial-dissolve-fragment)");
    expect(
      container.querySelector<HTMLElement>(
        "[data-tutorial-challenge-mote]",
      )?.style.outline,
    ).toBe("");
    expect(screenMocks.props?.view.phase).toBe("challenge");

    act(() => screenMocks.challengeRematerializedAnimationComplete?.());
    expect(onActionComplete).toHaveBeenCalledWith(
      "event:challenge",
      "resolve-challenge",
    );

    act(() => root.unmount());
    container.remove();
  });

  it("offers End Turn after the shared card play and submits the authored action", () => {
    const onEndTurn = vi.fn();
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
              currentAction: {
                id: "end-turn",
                action: "end-turn",
                wait: 0,
              },
              howToPlay: null,
              endTurn: {
                actionId: "end-turn",
                triggerCardId: TUTORIAL_PLAYER_CARD.model.cardId,
                ready: true,
              },
              battle: {
                battleId: "tutorial-battle",
                playerHand: [],
                enemy: { backRank: [], frontRank: [], deckCardIds: [] },
                player: { backRank: [], frontRank: [] },
              } as unknown as MobileBattleView,
            }}
            onEndTurn={onEndTurn}
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.props?.phaseNavigation).toBe("end-turn");
    expect(screenMocks.props?.interactions?.canInteract).toBe(true);
    act(() => screenMocks.props?.interactions?.onNextPhase());
    expect(onEndTurn).toHaveBeenCalledWith("event:player-turn", "end-turn");

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
                speakerName: "Threxan",
                text: "For the Abyss!",
              },
              playbackRunId: "event:4",
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "vrakmoth-taunt",
                action: "display-speech-bubble",
                speechBubble: {
                  speaker: "enemy",
                  duration: 3,
                  verticalOffset: 0,
                  bubbleWidth: 300,
                  text: "For the Abyss!",
                },
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
    expect(bubble?.querySelector("p")?.style.font).toBe(
      "var(--t-tutorial-dialogue)",
    );
    expect(bubble?.querySelector("p")?.style.lineHeight).toBe("");
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
                verticalOffset: 0,
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
              endTurn: null,
              howToPlay: null,
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                speechBubble: {
                  speaker: "mira",
                  duration: 3,
                  verticalOffset: 0,
                  bubbleWidth: 700,
                  text: "Welcome, Dreamer.",
                },
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
