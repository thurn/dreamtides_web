// @vitest-environment jsdom

import {
  act,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import type { CharacterDialogueProps } from "../components/overlay/CharacterDialogue";
import { TutorialScreen, type TutorialView } from "./TutorialScreen";
import type {
  MobileBattleScreenProps,
  MobileBattleView,
} from "./MobileBattleScreen";

const screenMocks = vi.hoisted(() => ({
  props: null as MobileBattleScreenProps | null,
  dialogueProps: null as CharacterDialogueProps | null,
  sceneInitial: null as unknown,
  sceneAnimate: null as unknown,
  sceneTransition: null as unknown,
  sceneAnimationComplete: null as (() => void) | null,
  arrivalInitial: null as unknown,
  arrivalAnimate: null as unknown,
  arrivalTransition: null as unknown,
  arrivalAnimationComplete: null as (() => void) | null,
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
      screenMocks.arrivalInitial = initial;
      screenMocks.arrivalAnimate = animate;
      screenMocks.arrivalTransition = transition;
      screenMocks.arrivalAnimationComplete = onAnimationComplete ?? null;
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
      return (
        <div data-battle-mobile={props.view.battleId}>
          <div data-testid="enemy-battle-status">
            <div data-battle-status-dreamcaller-placeholder="" />
          </div>
          <div data-testid="player-battle-status">
            <div data-battle-status-dreamcaller-placeholder="" />
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

class ResizeObserverStub {
  constructor(_callback: ResizeObserverCallback) {}
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
                portrait: { kind: "character-portrait", characterId: "mira" },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: "Welcome, Dreamer.",
              },
              playbackRunId: "event:1",
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
                portrait: {
                  kind: "character-portrait",
                  characterId: "mira",
                },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: "Welcome, Dreamer.",
              },
              playbackRunId: "event:1",
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                text: "Welcome, Dreamer.",
                wait: 3,
              },
              battle: {
                battleId: "tutorial-battle",
              } as MobileBattleView,
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
              dialogue: null,
              playbackRunId: "event:2",
              currentAction: {
                id: "dreamcaller-arrival",
                action: "animate-dreamcaller-portrait",
                owner: "player",
                pause: 1,
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
              } as MobileBattleView,
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
    tutorialScreen!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 0, y: 0, width: 390, height: 844 });
    playerTarget!.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 173, y: 700, width: 44, height: 44 });

    act(() => screenMocks.sceneAnimationComplete?.());

    expect(
      container.querySelector("[data-tutorial-dreamcaller-arrival]"),
    ).not.toBeNull();
    expect(screenMocks.arrivalInitial).toMatchObject({
      x: 173,
      y: 400,
      scale: 1,
    });
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 400, 700],
      scale: [1, 1, 1],
    });
    expect(screenMocks.arrivalTransition).toMatchObject({
      duration: 2.34,
    });
    const arrivalTransition = screenMocks.arrivalTransition as {
      readonly times: readonly number[];
    };
    expect(arrivalTransition.times[0]).toBe(0);
    expect(arrivalTransition.times[1]).toBeCloseTo(1.14 / 2.34);
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
              currentAction: {
                id: "vrakmoth-arrival",
                action: "animate-dreamcaller-portrait",
                owner: "enemy",
                pause: 1.5,
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
                portrait: {
                  kind: "character-portrait",
                  characterId: "mira",
                },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: "Welcome, Dreamer.",
              },
              playbackRunId: "event:1",
              currentAction: {
                id: "welcome",
                action: "display-speech-bubble",
                text: "Welcome, Dreamer.",
                wait: 3,
              },
              battle: {
                battleId: "tutorial-battle",
              } as MobileBattleView,
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
