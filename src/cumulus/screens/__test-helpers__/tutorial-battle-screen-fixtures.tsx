/**
 * Synthetic fixtures and render harness shared by the split
 * TutorialBattleScreen tests. Each test file must install the battle stubs from
 * `tutorial-screen-stubs` with `vi.mock` before importing this module.
 */
import { act, type ComponentProps, type ReactElement } from "react";
import { afterEach, beforeEach, vi } from "vitest";
import { renderInCumulus, type CumulusRender } from "../../testing/render";
import type { MobileBattleInteractions } from "../MobileBattleScreen";
import {
  TutorialBattleScreen,
  type TutorialBattleView,
} from "../TutorialBattleScreen";
import { parseCardName } from "../../../types/card-identity";
import {
  parseBattleCardId,
  parseBattleId,
  parseClientId,
  parsePresentationId,
} from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import {
  reducedMotionPreference,
  tutorialBattleProps,
} from "./tutorial-screen-stubs";

export type TutorialBattleScreenInput = ComponentProps<
  typeof TutorialBattleScreen
>;

export const interactions: MobileBattleInteractions = {
  canInteract: false,
  pendingCardId: null,
  targetSelectionPrompt: null,
  onHandCardActivate: vi.fn(),
  onCardDragStart: vi.fn(),
  onCardDragEnd: vi.fn(),
  onSlotDrop: vi.fn(),
  onZoneDrop: vi.fn(),
  onPreviousPhase: vi.fn(),
  onNextPhase: vi.fn(),
};

export function view(
  overrides: Partial<TutorialBattleView> = {},
): TutorialBattleView {
  const result: TutorialBattleView = {
    battle: {
      battleId: parseBattleId("tutorial-battle"),
      inspector: { turn: "2" },
      activeSide: "player",
    } as TutorialBattleView["battle"],
    challengeOriginBattle: null,
    ownership: "driver",
    driverClientId: parseClientId("driver-client"),
    manualControls: false,
    foresee: null,
    presentationId: null,
    presentation: null,
    victoryVisible: false,
    ...overrides,
  };
  return {
    ...result,
    presentationId:
      overrides.presentationId ??
      overrides.presentation?.presentationId ??
      result.presentationId,
  };
}

/** A view presenting the opponent playing one synthetic character. */
export function opponentPlayView(): TutorialBattleView {
  const cardId = testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8");
  return view({
    presentation: {
      kind: "opponent-play",
      presentationId: parsePresentationId("opponent-play:enemy-card-1"),
      cardId,
      battleCardId: parseBattleCardId("enemy-card-1"),
      cardKind: "character",
      card: {
        id: parseBattleCardId("enemy-card-1"),
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: parseCardName("Synthetic Troubadour"),
            cardNumber: 510,
            cardType: "Character",
            subtype: "Musician",
            isStarter: true,
            energyCost: 2,
            spark: 2,
            isFast: false,
            renderedText: "",
            imageNumber: 510,
            artOwned: true,
          },
        },
        exhausted: true,
        figment: false,
        storedTime: 0,
        showPlayableOutline: false,
      },
    },
  });
}

export function tutorialBattleScreen(
  screenView: TutorialBattleView,
  props: Partial<Omit<TutorialBattleScreenInput, "view">> = {},
): ReactElement {
  return (
    <TutorialBattleScreen
      view={screenView}
      interactions={interactions}
      movementStatusMessage={null}
      onMovementStatusDismiss={vi.fn()}
      onForeseeConfirm={() => {}}
      onNewJourney={vi.fn()}
      guidance={null}
      onGuidanceContinue={() => {}}
      onGuidanceDurationComplete={() => {}}
      onPresentationVisible={vi.fn()}
      {...props}
    />
  );
}

export function mountTutorialBattle(
  screenView: TutorialBattleView,
  props: Partial<Omit<TutorialBattleScreenInput, "view">> = {},
): CumulusRender {
  return renderInCumulus(tutorialBattleScreen(screenView, props));
}

/** Props from the battle stub's most recent render. */
export function lastBattleProps<T>(): T {
  return tutorialBattleProps.mock.lastCall?.[0] as T;
}

export function completeTurnAnnouncement(side: "player" | "enemy"): void {
  act(() => {
    lastBattleProps<{
      onTurnAnnouncementComplete?: (side: "player" | "enemy") => void;
    }>().onTurnAnnouncementComplete?.(side);
  });
}

class ResizeObserverStub {
  observe(_target: Element) {}
  unobserve(_target: Element) {}
  disconnect() {}
}

/** Registers the per-test environment shared by every TutorialBattleScreen file. */
export function installTutorialBattleHarness(): void {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverStub;
    reducedMotionPreference.value = false;
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
    document.body.innerHTML = "";
    tutorialBattleProps.mockClear();
  });
}
