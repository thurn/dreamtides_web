/**
 * Module stubs for the split TutorialScreen and TutorialBattleScreen tests.
 * Test files install them with `vi.mock(path, async () => ...)` factories that
 * dynamically import this module, so it must not import either screen or any
 * module it stubs.
 */
import type { ComponentProps, CSSProperties, ReactNode, Ref } from "react";
import type { LayoutGroup } from "framer-motion";
import { vi } from "vitest";
import type { BattleCardId } from "../../../types/identifiers";
import type { CharacterDialogueProps } from "../../components/overlay/CharacterDialogue";
import type {
  MobileBattleScreenProps,
  MobileBattleSlotView,
  MobileBattleStatusView,
} from "../MobileBattleScreen";

type Callback = (() => void) | null;

function initialScreenMocks() {
  return {
    props: null as MobileBattleScreenProps | null,
    dialogueProps: null as CharacterDialogueProps | null,
    sceneTransition: null as unknown,
    sceneAnimationComplete: null as Callback,
    arrivalInitial: null as unknown,
    arrivalAnimate: null as unknown,
    arrivalTransition: null as unknown,
    arrivalAnimationComplete: null as Callback,
    cardInitial: null as unknown,
    cardAnimate: null as unknown,
    cardTransition: null as unknown,
    cardAnimationComplete: null as Callback,
    cardFullAnimate: null as unknown,
    cardFullTransition: null as unknown,
    cardFlipAnimate: null as unknown,
    cardFlipTransition: null as unknown,
    cardBattlefieldAnimate: null as unknown,
    cardBattlefieldTransition: null as unknown,
    challengeRematerializedAnimationComplete: null as Callback,
    motionConfigTransition: null as unknown,
  };
}

/** Props and motion values the stubs captured during the latest render. */
export const screenMocks = initialScreenMocks();

export function resetScreenMocks(): void {
  Object.assign(screenMocks, initialScreenMocks());
}

interface MotionStubInput {
  readonly animate?: unknown;
  readonly children?: ReactNode;
  readonly initial?: unknown;
  readonly onAnimationComplete?: () => void;
  readonly style?: CSSProperties;
  readonly transition?: unknown;
  readonly [dataAttribute: `data-${string}`]: string | undefined;
}

function MotionMain({
  animate: _animate,
  children,
  initial: _initial,
  onAnimationComplete,
  transition,
  ...elementProps
}: MotionStubInput & { readonly ref?: Ref<HTMLElement> }) {
  screenMocks.sceneTransition = transition;
  screenMocks.sceneAnimationComplete = onAnimationComplete ?? null;
  return <main {...elementProps}>{children}</main>;
}

function MotionDiv({
  animate,
  children,
  initial,
  onAnimationComplete,
  transition,
  ...elementProps
}: MotionStubInput) {
  const has = (name: `data-${string}`) => elementProps[name] !== undefined;
  if (has("data-tutorial-opponent-card-play")) {
    screenMocks.cardInitial = initial;
    screenMocks.cardAnimate = animate;
    screenMocks.cardTransition = transition;
    screenMocks.cardAnimationComplete = onAnimationComplete ?? null;
  } else if (has("data-tutorial-challenge-rematerialized")) {
    screenMocks.challengeRematerializedAnimationComplete =
      onAnimationComplete ?? null;
  } else if (has("data-tutorial-card-full-layer")) {
    screenMocks.cardFullAnimate = animate;
    screenMocks.cardFullTransition = transition;
  } else if (has("data-tutorial-card-flip-layer")) {
    screenMocks.cardFlipAnimate = animate;
    screenMocks.cardFlipTransition = transition;
  } else if (has("data-tutorial-card-battlefield-layer")) {
    screenMocks.cardBattlefieldAnimate = animate;
    screenMocks.cardBattlefieldTransition = transition;
  } else {
    screenMocks.arrivalInitial = initial;
    screenMocks.arrivalAnimate = animate;
    screenMocks.arrivalTransition = transition;
    screenMocks.arrivalAnimationComplete = onAnimationComplete ?? null;
  }
  return <div {...elementProps}>{children}</div>;
}

/** Replacement `framer-motion` module that records motion props. */
export const framerMotionStub = {
  useReducedMotion: () => false,
  MotionConfig: ({
    children,
    transition,
  }: {
    readonly children?: ReactNode;
    readonly transition?: unknown;
  }) => {
    screenMocks.motionConfigTransition = transition;
    return <>{children}</>;
  },
  motion: { main: MotionMain, div: MotionDiv },
};

export function CharacterDialogueStub(props: CharacterDialogueProps) {
  screenMocks.dialogueProps = props;
  return (
    <section data-character-dialogue={props.dialogue.speakerName}>
      <div data-character-dialogue-portrait-frame="" />
      <div>
        <aside />
      </div>
    </section>
  );
}

function Rank({
  rank,
  slots,
  outlines,
}: {
  readonly rank: string;
  readonly slots: readonly MobileBattleSlotView[] | undefined;
  readonly outlines: boolean;
}) {
  return (
    <div data-battle-rank={rank}>
      {slots?.map((slot) => (
        <div
          key={slot.id}
          data-battle-slot-id={slot.id}
          data-battle-slot-filled={slot.card === null ? "false" : "true"}
        >
          {outlines ? <div data-battle-slot-outline="" /> : null}
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
  );
}

function StatusAvatar({
  side,
  status,
}: {
  readonly side: "enemy" | "player";
  readonly status: MobileBattleStatusView | undefined;
}) {
  return (
    <div data-testid={`${side}-battle-status`}>
      {status?.avatar === undefined || status.avatar === null ? (
        <div data-battle-status-avatar-placeholder="" />
      ) : (
        <span data-avatar-source={status.avatarProfile?.id} />
      )}
    </div>
  );
}

/**
 * Minimal battle surface exposing the anchors TutorialScreen measures. Test
 * views are partial, so every nested read is optional.
 */
export function MobileBattleScreenStub(props: MobileBattleScreenProps) {
  screenMocks.props = props;
  const view = props.view as Partial<MobileBattleScreenProps["view"]>;
  const outlines = props.preserveOccupiedSlotOutlines === true;
  return (
    <div data-battle-mobile={view.battleId}>
      {(view.farHand?.cardIds ?? []).map((cardId) => (
        <div
          key={cardId}
          data-battle-card-id={cardId}
          data-battle-card-zone="far-hand"
        />
      ))}
      <Rank rank="enemy-back" slots={view.enemy?.backRank} outlines={false} />
      <Rank
        rank="enemy-front"
        slots={view.enemy?.frontRank}
        outlines={outlines}
      />
      <Rank
        rank="player-front"
        slots={view.player?.frontRank}
        outlines={outlines}
      />
      <Rank rank="player-back" slots={view.player?.backRank} outlines={false} />
      <div data-battle-zone="enemy-void">
        <div data-battle-pile-frame="" />
      </div>
      <div data-battle-zone="player-void">
        <div data-battle-pile-frame="" />
      </div>
      <StatusAvatar side="enemy" status={view.enemy?.status} />
      <div data-battle-mobile-row="enemy-zones">
        {view.dreamwell === null || view.dreamwell === undefined ? null : (
          <div
            data-battle-dreamwell-layer=""
            data-battle-dreamwell-side={view.dreamwell.side}
          >
            <div data-dreamwell-card={view.dreamwell.model.cardId} />
          </div>
        )}
      </div>
      <StatusAvatar side="player" status={view.player?.status} />
    </div>
  );
}

/** TutorialBattleScreen: the reduced-motion preference the stub reports. */
export const reducedMotionPreference = { value: false };

/** TutorialBattleScreen: every props object the battle stub received. */
export const tutorialBattleProps = vi.fn();

export function LayoutGroupStub({
  id,
  children,
}: {
  readonly id?: ComponentProps<typeof LayoutGroup>["id"];
  readonly children: ReactNode;
}) {
  return <div data-test-layout-group={id}>{children}</div>;
}

interface ChallengeCardsView {
  readonly testChallengeCards?: readonly {
    readonly id: BattleCardId;
    readonly zone?: "player-void" | "enemy-void";
  }[];
}

/** TutorialBattleScreen's battle surface: records props and renders challenge cards. */
export function TutorialBattleMobileScreenStub(props: {
  readonly view: ChallengeCardsView;
}) {
  tutorialBattleProps(props);
  return (
    <main data-test-mobile-battle="">
      {props.view.testChallengeCards?.map((card) => (
        <div key={card.id} data-battle-zone={card.zone}>
          <div data-battle-card-id={card.id} />
        </div>
      ))}
    </main>
  );
}
