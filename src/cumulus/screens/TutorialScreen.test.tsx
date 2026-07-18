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
          <div data-testid="player-battle-status">
            <div data-battle-status-dreamcaller-placeholder="" />
          </div>
        </div>
      );
    },
  };
});

const TUTORIAL_DREAMCALLER: TutorialView["dreamcaller"] = {
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
  it("fades in the battle before revealing CharacterDialogue", () => {
    vi.useFakeTimers();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <TutorialScreen
            view={{
              dreamcaller: TUTORIAL_DREAMCALLER,
              dialogue: {
                portrait: {
                  kind: "character-portrait",
                  characterId: "mira",
                },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: "Welcome, Dreamer.",
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
      DOMRect.fromRect({ x: 18, y: 390, width: 150, height: 150 });

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(
      container.querySelector("[data-tutorial-dreamcaller-arrival]"),
    ).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(
      container.querySelector("[data-tutorial-dreamcaller-arrival]"),
    ).not.toBeNull();
    expect(screenMocks.arrivalInitial).toMatchObject({
      x: 173,
      y: 400,
    });
    expect(
      (screenMocks.arrivalInitial as { readonly scale: number }).scale,
    ).toBeCloseTo(150 / 44);
    expect(screenMocks.arrivalAnimate).toMatchObject({
      y: [400, 700],
      scale: [150 / 44, 1],
    });
    expect(screenMocks.arrivalAnimate).not.toHaveProperty("x");
    expect(screenMocks.props?.view.player.status.dreamcaller).toBeNull();

    act(() => screenMocks.arrivalAnimationComplete?.());

    expect(screenMocks.props?.view.player.status).toMatchObject({
      dreamcaller: TUTORIAL_DREAMCALLER.visual,
      dreamcallerProfile: TUTORIAL_DREAMCALLER.profile,
    });
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
              dreamcaller: TUTORIAL_DREAMCALLER,
              dialogue: {
                portrait: {
                  kind: "character-portrait",
                  characterId: "mira",
                },
                portraitAlt: "Mira",
                speakerName: "Mira",
                text: "Welcome, Dreamer.",
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
          />
        </CumulusRoot>,
      );
    });

    expect(screenMocks.dialogueProps?.size).toBe("prominent");

    act(() => root.unmount());
    container.remove();
  });
});
