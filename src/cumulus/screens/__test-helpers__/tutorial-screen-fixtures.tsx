/**
 * Synthetic fixtures and render harness shared by the split TutorialScreen
 * tests. Each test file must install the stubs from `tutorial-screen-stubs`
 * with `vi.mock` before importing this module.
 */
import { afterEach, beforeEach, expect, vi } from "vitest";
import type { CharacterDialogueModel } from "../../components/overlay/CharacterDialogue";
import { renderInCumulus, type CumulusRender } from "../../testing/render";
import { annotatedTextEquality } from "../../testing/annotated-text";
import type { MobileBattleView } from "../MobileBattleScreen";
import {
  TutorialScreen,
  type TutorialScreenProps,
  type TutorialView,
} from "../TutorialScreen";
import { parseCardName } from "../../../types/card-identity";
import {
  parseBattleCardId,
  parseBattleId,
  type TutorialActionId,
  type TutorialRunId,
} from "../../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testDreamwellCardId,
} from "../../../types/test-identities";
import type {
  TutorialAction,
  TutorialSpeechBubble,
} from "../../../types/tutorial";
import { resetScreenMocks } from "./tutorial-screen-stubs";

export const TUTORIAL_AVATARS: TutorialView["avatars"] = {
  player: {
    visual: {
      imageNumber: "0029",
      name: "Tensho",
      title: "Daimyo of Lacquered Fury",
      portraitFocus: { x: 0.5, y: 0.22 },
    },
    profile: {
      id: testAvatarId("bfc40414-5264-41bf-86e1-a0f41ee4f5b5"),
      ability: "Avatar ability is not active",
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
      id: testAvatarId("b99936ca-97f9-4930-af5a-fa9ef92557ef"),
      ability: "Avatar ability is not active",
      unavailable: true,
    },
    settled: false,
  },
};

export const TUTORIAL_OPPONENT_CARD: MobileBattleView["enemyHand"][number] = {
  id: parseBattleCardId("tutorial-enemy-deck-1"),
  model: {
    cardId: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
    displaySnapshot: {
      id: testCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
      name: parseCardName("Twilight Troubadour"),
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
  storedTime: 0,
  showPlayableOutline: false,
};

export const TUTORIAL_PLAYER_CARD: MobileBattleView["playerHand"][number] = {
  ...TUTORIAL_OPPONENT_CARD,
  id: parseBattleCardId("tutorial-player-deck-1"),
  model: {
    ...TUTORIAL_OPPONENT_CARD.model,
    cardId: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
    displaySnapshot: {
      ...TUTORIAL_OPPONENT_CARD.model.displaySnapshot,
      id: testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af"),
      name: parseCardName("Marked Direwolf"),
      spark: 4,
    },
  },
  exhausted: false,
  showPlayableOutline: true,
};

export const TUTORIAL_DREAMWELL_CARD: NonNullable<
  MobileBattleView["dreamwell"]
>["model"] = {
  cardId: testDreamwellCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
  displaySnapshot: {
    id: testDreamwellCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
    name: "Autumn Glade",
    renderedText: "Gain 2⍟.",
    energyAdded: 1,
    imageNumber: 1789989917,
  },
};

/** Builds a guide dialogue model with fixture speaker and text. */
export function guideModel(text: string): CharacterDialogueModel {
  return {
    portrait: { kind: "character-portrait", characterId: "mira" },
    portraitAlt: "Mira",
    speakerName: "Mira",
    text,
  };
}

/** A display-speech-bubble action with fixture defaults. */
export function speechAction(
  id: TutorialActionId,
  speechBubble: Partial<TutorialSpeechBubble> & { readonly text: string },
  wait = 0,
): TutorialAction {
  return {
    id,
    action: "display-speech-bubble",
    speechBubble: {
      speaker: "mira",
      duration: 3,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      ...speechBubble,
    },
    wait,
  };
}

/** A partial battle view; the stubbed battle screen reads only what it needs. */
export function battle(fields: Record<string, unknown> = {}): MobileBattleView {
  return {
    battleId: parseBattleId("tutorial-battle"),
    ...fields,
  } as unknown as MobileBattleView;
}

/** One side with three back-rank and two front-rank empty slots. */
export function emptySide(owner: "enemy" | "player") {
  return {
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
    status: { avatar: null, currentEnergy: 0, maxEnergy: 0, points: 0 },
  };
}

/** A complete tutorial view with no dialogue, action, or overlays. */
export function tutorialView(
  runId: TutorialRunId,
  fields: Partial<TutorialView> = {},
): TutorialView {
  return {
    avatars: TUTORIAL_AVATARS,
    dialogue: null,
    playbackRunId: runId,
    endTurn: null,
    howToPlay: null,
    currentAction: null,
    battle: battle(),
    ...fields,
  };
}

export function renderTutorialScreen(
  view: TutorialView,
  props: Omit<TutorialScreenProps, "view"> = {},
): CumulusRender {
  return renderInCumulus(<TutorialScreen view={view} {...props} />);
}

/** Simulates a desktop (`min-width` matching) or mobile viewport. */
export function setDesktopViewport(desktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: desktop && query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

/** Stubs a `getBoundingClientRect` result on one element. */
export function setRect(
  element: Element | null,
  rect: { x?: number; y?: number; width?: number; height?: number },
): void {
  if (element === null) throw new Error("Expected element to measure.");
  element.getBoundingClientRect = () => DOMRect.fromRect(rect);
}

export class ResizeObserverStub {
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

/** Registers the per-test environment shared by every TutorialScreen file. */
export function installTutorialScreenHarness(): void {
  expect.addEqualityTesters([annotatedTextEquality]);
  beforeEach(() => {
    setDesktopViewport(false);
    globalThis.ResizeObserver = ResizeObserverStub;
    ResizeObserverStub.callbacks = [];
    resetScreenMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });
}
