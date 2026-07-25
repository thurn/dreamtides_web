import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { GLYPHS } from "../primitives/glyph";
import { IconButton } from "../components/controls/IconButton";
import type { BattleStatusDreamcallerProfile } from "../components/battle/BattleStatusDisplay";
import { CardBack } from "../components/battle/CardBack";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../components/battle/DreamwellCard";
import { GameCard } from "../components/card/CardView";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
} from "../components/card/card-aspect";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "../components/hud/DreamcallerPortrait";
import {
  CharacterDialogue,
  type CharacterDialogueModel,
} from "../components/overlay/CharacterDialogue";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { SpeechBubble } from "../components/overlay/SpeechBubble";
import {
  speechBubblePointerTip,
  type SpeechBubblePointerPlacement,
} from "../components/overlay/speech-bubble-geometry";
import {
  BATTLEFIELD_CARD_EXHAUSTED_FILTER,
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleInteractions,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";
import { useIsDesktop } from "./use-is-desktop";
import {
  TutorialEditorRail,
  TutorialEditorTakeover,
} from "./TutorialEditorRail";
import {
  DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS,
  MOBILE_BATTLE_INSPECTOR_RAIL_TRACK,
  MOBILE_BATTLE_MIN_BACK_RANK_SLOTS,
  MOBILE_BATTLE_MIN_FRONT_RANK_SLOTS,
} from "./mobile-battle-layout";
import type {
  TutorialAction,
  TutorialDreamcallerOwner,
  TutorialEditorSaveStatus,
  TutorialHowToPlayTrigger,
} from "../../types/tutorial";
import {
  renderTutorialInstructionParagraph,
} from "../internal/tutorial-instruction-text";
import { parseTutorialInstructionMarkup } from "../../data/tutorial-instruction-markup";

export interface TutorialDreamcallerView {
  readonly visual: DreamcallerVisual;
  readonly profile: BattleStatusDreamcallerProfile;
  readonly settled: boolean;
}

export type TutorialDialogueView =
  | {
      readonly actionId?: string;
      readonly parentAction?: TutorialAction["action"];
      readonly kind: "guide";
      readonly duration?: number;
      readonly verticalOffset: number;
      readonly bubbleWidth?: number;
      readonly model: CharacterDialogueModel;
    }
  | {
      readonly actionId?: string;
      readonly parentAction?: TutorialAction["action"];
      readonly kind: "dreamcaller";
      readonly owner: TutorialDreamcallerOwner;
      readonly duration?: number;
      readonly verticalOffset?: number;
      readonly bubbleWidth?: number;
      readonly speakerName: string;
      readonly text: string;
    };

export interface TutorialChallengeParticipantView {
  readonly owner: TutorialDreamcallerOwner;
  readonly card: MobileBattleCardView;
  readonly spark: number;
}

export interface TutorialChallengeView {
  readonly actionId: string;
  readonly challenger: TutorialChallengeParticipantView;
  readonly defender: TutorialChallengeParticipantView;
  readonly winnerOwner: TutorialDreamcallerOwner;
  readonly loserOwner: TutorialDreamcallerOwner;
}

export interface TutorialView {
  readonly battle: MobileBattleView;
  readonly opponentCardToReveal?: MobileBattleCardView | null;
  readonly dialogue: TutorialDialogueView | null;
  readonly dreamcallers: Record<
    TutorialDreamcallerOwner,
    TutorialDreamcallerView
  >;
  readonly playbackRunId: string | null;
  readonly currentAction: TutorialAction | null;
  readonly howToPlay: {
    readonly actionId: string;
    readonly text: string;
    readonly wait: number;
    readonly trigger: TutorialHowToPlayTrigger;
    readonly companion?: DreamwellCardModel | null;
    readonly cardWidth?: number;
  } | null;
  readonly endTurn: {
    readonly actionId: string;
    readonly triggerCardId: string;
    readonly ready: boolean;
  } | null;
  readonly playerReposition?: {
    readonly actionId: string;
    readonly cardInstanceId: string;
    readonly cardId: string;
    readonly opposingCardId: string;
  } | null;
  readonly challenge?: TutorialChallengeView | null;
}

export interface TutorialEditorView {
  readonly actions: readonly TutorialAction[];
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: string | null;
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
  readonly editor?: TutorialEditorView;
  /** Multiplier applied to every timed part of the tutorial sequence. */
  readonly playbackSpeed?: number;
  readonly onActionComplete?: (runId: string, actionId: string) => void;
  readonly onDreamcallerArrivalComplete?: (
    dreamcallerId: string,
    owner: TutorialDreamcallerOwner,
  ) => void;
  readonly onHowToPlayPresented?: (
    runId: string,
    actionId: string,
    trigger: TutorialHowToPlayTrigger,
  ) => void;
  readonly onHowToPlayDismissed?: (
    runId: string,
    actionId: string,
    trigger: TutorialHowToPlayTrigger,
  ) => void;
  readonly onPlayerCardPlay?: (
    runId: string,
    cardInstanceId: string,
    cardId: string,
    targetSlotId: string | null,
  ) => void;
  readonly onEndTurn?: (runId: string, actionId: string) => void;
  readonly onPlayerCharacterReposition?: (
    runId: string,
    actionId: string,
    cardId: string,
    opposingCardId: string,
    targetSlotId: string,
  ) => void;
  readonly onEditorActionsChange?: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
  readonly onReplay?: () => void;
  readonly onPlayFromAction?: (actionId: string) => void;
}

interface TutorialDialogueAnchor {
  readonly left: number;
  readonly top: number;
}

interface TutorialDreamcallerTrajectory {
  readonly startX: number;
  readonly startY: number;
  readonly targetY: number;
  readonly startScale: number;
  readonly width: number;
  readonly height: number;
}

interface TutorialCardFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface TutorialCardTrajectory {
  readonly source: TutorialCardFrame;
  readonly reveal: TutorialCardFrame;
  readonly destination: TutorialCardFrame;
}

const TUTORIAL_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");
const TUTORIAL_CARD_TRAVEL_SECONDS = motionTimeSeconds("--dur-slow");
const TUTORIAL_CARD_FLIP_SECONDS = motionTimeSeconds("--dur-slow");
const TUTORIAL_DREAMWELL_EMERGE_SECONDS = motionTimeSeconds(
  "--dur-tutorial-dreamwell-emerge",
);
// The Dreamwell card begins tucked behind its status display before traveling
// to full physical size.
const TUTORIAL_DREAMWELL_EMERGE_START_SCALE = 0.72;
// Lift the Dreamwell's transformed side-zone stacking context above battlefield
// ranks during emergence while keeping it beneath battle controls and dialogs.
const TUTORIAL_DREAMWELL_EMERGENCE_LAYER = 5;
const TUTORIAL_EDITOR_DOCK_MIN_WIDTH = 1280;
const TUTORIAL_REVEAL_CARD_DESKTOP_WIDTH = 240;
const TUTORIAL_REVEAL_CARD_MOBILE_WIDTH_RATIO = 0.45;
const TUTORIAL_CHALLENGE_TOTAL_SECONDS = TUTORIAL_CARD_TRAVEL_SECONDS * 6;
const TUTORIAL_CHALLENGE_MOTE_COUNT = 24;
// The popup panel is a content-driven desktop box measure. GlassDialog adds
// --space-5 body padding on each side around this intrinsic content width.
const TUTORIAL_HOW_TO_PLAY_DESKTOP_PANEL_WIDTH = 500;
// The pointer overlaps the portrait rim so it visibly connects to the frame.
const TUTORIAL_PORTRAIT_POINTER_OVERLAP = 2;

function atPlaybackSpeed(seconds: number, playbackSpeed: number): number {
  return seconds / playbackSpeed;
}

function millisecondsAtPlaybackSpeed(
  seconds: number,
  playbackSpeed: number,
): number {
  return atPlaybackSpeed(seconds, playbackSpeed) * 1_000;
}

function tutorialTimingVariables(
  playbackSpeed: number,
): CSSProperties {
  const seconds = (name: Parameters<typeof motionTimeSeconds>[0]) =>
    `${String(atPlaybackSpeed(motionTimeSeconds(name), playbackSpeed))}s`;
  return {
    "--dur-fast": seconds("--dur-fast"),
    "--dur-base": seconds("--dur-base"),
    "--dur-slow": seconds("--dur-slow"),
    "--dur-loading-screen-fade": seconds("--dur-loading-screen-fade"),
    "--dur-loading-quote": seconds("--dur-loading-quote"),
    "--dur-loading-dot-cycle": seconds("--dur-loading-dot-cycle"),
    "--dur-tutorial-dreamwell-emerge": seconds(
      "--dur-tutorial-dreamwell-emerge",
    ),
    "--stagger-loading-dot": seconds("--stagger-loading-dot"),
    "--stagger-travel": seconds("--stagger-travel"),
    "--motion-object-travel": `${seconds("--dur-slow")} var(--ease-out)`,
  } as CSSProperties;
}

function TutorialRepositionTargetResolver({
  screen,
  cardId,
  opposingCardId,
  onTargetSlotChange,
}: {
  readonly screen: HTMLElement;
  readonly cardId: string;
  readonly opposingCardId: string;
  readonly onTargetSlotChange: (slotId: string | null) => void;
}): null {
  useLayoutEffect(() => {
    const sourceCard = screen.querySelector<HTMLElement>(
      `[data-battle-rank="player-back"] [data-card-id="${cardId}"]`,
    );
    const opposingCard = screen.querySelector<HTMLElement>(
      `[data-battle-rank="enemy-front"] [data-card-id="${opposingCardId}"]`,
    );
    const sourceSlot = sourceCard?.closest<HTMLElement>(
      "[data-battle-slot-id]",
    );
    const opposingSlot = opposingCard?.closest<HTMLElement>(
      "[data-battle-slot-id]",
    );
    const playerFrontSlots = [
      ...screen.querySelectorAll<HTMLElement>(
        '[data-battle-rank="player-front"] [data-battle-slot-id][data-battle-slot-filled="false"]',
      ),
    ];
    if (
      sourceSlot === null ||
      sourceSlot === undefined ||
      opposingSlot === null ||
      opposingSlot === undefined ||
      playerFrontSlots.length === 0
    ) {
      onTargetSlotChange(null);
      return undefined;
    }

    const updateGeometry = (): void => {
      const opposingBox = opposingSlot.getBoundingClientRect();
      const opposingCenterX = opposingBox.left + opposingBox.width / 2;
      const targetSlot = playerFrontSlots.reduce((closest, candidate) => {
        const closestBox = closest.getBoundingClientRect();
        const candidateBox = candidate.getBoundingClientRect();
        const closestDistance = Math.abs(
          closestBox.left + closestBox.width / 2 - opposingCenterX,
        );
        const candidateDistance = Math.abs(
          candidateBox.left + candidateBox.width / 2 - opposingCenterX,
        );
        return candidateDistance < closestDistance ? candidate : closest;
      });
      const targetSlotId = targetSlot.dataset.battleSlotId;
      if (targetSlotId === undefined) {
        onTargetSlotChange(null);
        return;
      }
      onTargetSlotChange(targetSlotId);
    };

    updateGeometry();
    const observer = new ResizeObserver(updateGeometry);
    observer.observe(screen);
    observer.observe(sourceSlot);
    observer.observe(opposingSlot);
    for (const slot of playerFrontSlots) observer.observe(slot);
    window.addEventListener("resize", updateGeometry);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateGeometry);
    };
  }, [cardId, onTargetSlotChange, opposingCardId, screen]);

  return null;
}

function TutorialHowToPlayDialog({
  text,
  companion,
  cardWidth,
  onClose,
}: {
  readonly text: string;
  readonly companion: DreamwellCardModel | null;
  readonly cardWidth: number;
  readonly onClose: () => void;
}): ReactElement {
  const desktop = useIsDesktop();
  const paragraphStyle = {
    margin: 0,
    color: token("--text-on-glass"),
    font: desktop
      ? token("--t-tutorial-instruction")
      : token("--t-lead"),
    whiteSpace: "pre-line",
  } as const;
  const paragraphs = parseTutorialInstructionMarkup(text);

  return (
    <GlassDialog
      title="How to Play"
      closeLabel="Close how to play"
      presentation="popup"
      chrome="flowing-close"
      companion={
        companion === null ? undefined : <DreamwellCard model={companion} />
      }
      onClose={onClose}
    >
      <div
        data-tutorial-how-to-play-content=""
        style={{
          width: desktop
            ? `calc(${String(cardWidth)}px - ${token("--space-5")} - ${token("--space-5")})`
            : "100%",
          maxWidth: "100%",
          boxSizing: "border-box",
          marginInline: "auto",
          paddingTop: token("--space-9"),
          paddingRight: token("--space-9"),
          paddingBottom: token("--space-9"),
          paddingLeft: token("--space-9"),
        }}
      >
        {paragraphs.map((paragraph, index) => (
          <p
            key={index}
            style={{
              ...paragraphStyle,
              marginTop: index === 0 ? 0 : token("--space-7"),
            }}
          >
            {renderTutorialInstructionParagraph(paragraph)}
          </p>
        ))}
      </div>
    </GlassDialog>
  );
}

function TutorialDreamwellEmergence({
  screen,
  actionKey,
  reduceMotion,
  playbackSpeed,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly actionKey: string;
  readonly reduceMotion: boolean;
  readonly playbackSpeed: number;
  readonly onComplete: (actionKey: string) => void;
}): null {
  useLayoutEffect(() => {
    const layer = screen.querySelector<HTMLElement>(
      "[data-battle-dreamwell-layer]",
    );
    if (layer === null) return undefined;
    const sideZoneRow = layer.closest<HTMLElement>(
      "[data-battle-mobile-row]",
    );
    const previousSideZoneZIndex = sideZoneRow?.style.zIndex ?? "";
    if (sideZoneRow !== null) {
      sideZoneRow.dataset.tutorialDreamwellEmergenceLayer = "";
      sideZoneRow.style.zIndex = String(
        TUTORIAL_DREAMWELL_EMERGENCE_LAYER,
      );
    }
    layer.dataset.tutorialDreamwellEmergence = "emerging";

    let timeout: number | null = null;
    let animation: Animation | null = null;
    const finish = (): void => {
      layer.dataset.tutorialDreamwellEmergence = "complete";
      onComplete(actionKey);
    };

    if (reduceMotion) {
      finish();
    } else if (typeof layer.animate === "function") {
      const easing = window
        .getComputedStyle(screen)
        .getPropertyValue("--ease-out")
        .trim();
      animation = layer.animate(
        [
          {
            transform: `translate(-50%, -70%) scale(${String(TUTORIAL_DREAMWELL_EMERGE_START_SCALE)})`,
          },
          { transform: "translate(-50%, 0) scale(1)" },
        ],
        {
          duration: millisecondsAtPlaybackSpeed(
            TUTORIAL_DREAMWELL_EMERGE_SECONDS,
            playbackSpeed,
          ),
          ...(easing === "" ? {} : { easing }),
        },
      );
      animation.addEventListener("finish", finish, { once: true });
    } else {
      timeout = window.setTimeout(
        finish,
        millisecondsAtPlaybackSpeed(
          TUTORIAL_DREAMWELL_EMERGE_SECONDS,
          playbackSpeed,
        ),
      );
    }

    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      animation?.cancel();
      delete layer.dataset.tutorialDreamwellEmergence;
      if (sideZoneRow !== null) {
        delete sideZoneRow.dataset.tutorialDreamwellEmergenceLayer;
        sideZoneRow.style.zIndex = previousSideZoneZIndex;
      }
    };
  }, [actionKey, onComplete, playbackSpeed, reduceMotion, screen]);

  return null;
}

function tutorialOpponentBackRankIndex(slotCount: number): number {
  return Math.max(0, Math.floor((slotCount - 1) / 2));
}

function tutorialOpponentFrontRankIndex(slotCount: number): number {
  return Math.max(0, Math.floor(slotCount / 2));
}

function expandedTutorialSide(
  side: MobileBattleSideView,
  owner: "enemy" | "player",
  backRankCount: number,
  frontRankCount: number,
): MobileBattleSideView {
  const pad = (
    slots: MobileBattleSideView["backRank"],
    count: number,
    rank: "back" | "front",
  ) => [
    ...slots,
    ...Array.from(
      { length: Math.max(0, count - slots.length) },
      (_, offset) => ({
        id: `${owner}-${rank}-${String(slots.length + offset)}`,
        card: null,
      }),
    ),
  ];
  const backRank = pad(side.backRank, backRankCount, "back");
  const backRankStart = tutorialOpponentBackRankIndex(backRank.length);
  const centeredBackRank = backRank.map((slot, index) => ({
    ...slot,
    card: side.backRank[index - backRankStart]?.card ?? null,
  }));
  const frontRank = pad(side.frontRank, frontRankCount, "front");
  const frontRankStart = tutorialOpponentFrontRankIndex(frontRank.length);
  const centeredFrontRank = frontRank.map((slot, index) => ({
    ...slot,
    card: side.frontRank[index - frontRankStart]?.card ?? null,
  }));
  return {
    ...side,
    backRank: centeredBackRank,
    frontRank: centeredFrontRank,
  };
}

function withOpponentCardPlayed(
  battle: MobileBattleView,
  card: MobileBattleCardView,
): MobileBattleView {
  const backRankStart = tutorialOpponentBackRankIndex(
    battle.enemy.backRank.length,
  );
  const destinationIndex = battle.enemy.backRank.findIndex(
    (slot, index) => index >= backRankStart && slot.card === null,
  );
  const backRank = battle.enemy.backRank.map((slot, index, slots) => ({
    ...slot,
    card:
      index ===
      (destinationIndex < 0
        ? tutorialOpponentBackRankIndex(slots.length)
        : destinationIndex)
        ? card
        : slot.card,
  }));
  return {
    ...battle,
    enemyHandCardIds: battle.enemyHandCardIds.filter((id) => id !== card.id),
    enemyHand: battle.enemyHand.filter((candidate) => candidate.id !== card.id),
    farHand: {
      ...battle.farHand,
      cardIds: battle.farHand.cardIds.filter((id) => id !== card.id),
      cards: battle.farHand.cards.filter(
        (candidate) => candidate.id !== card.id,
      ),
    },
    enemy: { ...battle.enemy, backRank },
    inspector: {
      ...battle.inspector,
      sides: {
        ...battle.inspector.sides,
        enemy: {
          ...battle.inspector.sides.enemy,
          zones: {
            ...battle.inspector.sides.enemy.zones,
            hand: Math.max(0, battle.inspector.sides.enemy.zones.hand - 1),
            backRank: battle.inspector.sides.enemy.zones.backRank + 1,
          },
        },
      },
    },
  };
}

interface TutorialDreamcallerDialogueAnchor {
  readonly left: number;
  readonly top: number;
  readonly pointerPlacement: Extract<
    SpeechBubblePointerPlacement,
    "top-left" | "bottom-left"
  >;
}

function TutorialDreamcallerDialogue({
  dialogue,
  visible,
  layoutKey,
  desktop,
}: {
  readonly dialogue: Extract<
    TutorialDialogueView,
    { readonly kind: "dreamcaller" }
  >;
  readonly visible: boolean;
  readonly layoutKey: string;
  readonly desktop: boolean;
}): ReactElement {
  const bubbleFrameRef = useRef<HTMLDivElement | null>(null);
  const [anchor, setAnchor] =
    useState<TutorialDreamcallerDialogueAnchor | null>(null);

  useLayoutEffect(() => {
    const screen = bubbleFrameRef.current?.closest<HTMLElement>(
      "[data-tutorial-screen]",
    );
    if (screen === null || screen === undefined) return undefined;
    const target = screen.querySelector<HTMLElement>(
      `[data-testid="${dialogue.owner}-battle-status"] [data-dreamcaller-source]`,
    );
    const bubble = bubbleFrameRef.current?.querySelector<HTMLElement>("aside");
    if (target === null || bubble === null || bubble === undefined) {
      setAnchor(null);
      return undefined;
    }

    const pointerPlacement: TutorialDreamcallerDialogueAnchor["pointerPlacement"] =
      dialogue.owner === "enemy" ? "top-left" : "bottom-left";
    const updateAnchor = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const bubbleBox = bubble.getBoundingClientRect();
      if (bubbleBox.width <= 0 || bubbleBox.height <= 0) return;

      const pointer = speechBubblePointerTip(
        bubbleBox.width,
        bubbleBox.height,
        pointerPlacement,
      );
      const gutter = Number.parseFloat(
        getComputedStyle(screen).getPropertyValue("--gutter"),
      );
      const horizontalGutter = Number.isFinite(gutter) ? gutter : 0;
      const targetCenterX =
        targetBox.left - screenBox.left + targetBox.width / 2;
      const unclampedLeft = targetCenterX - pointer.x;
      const left = Math.min(
        Math.max(unclampedLeft, horizontalGutter),
        screenBox.width - bubbleBox.width - horizontalGutter,
      );
      const targetEdgeY =
        dialogue.owner === "enemy"
          ? targetBox.bottom - screenBox.top - TUTORIAL_PORTRAIT_POINTER_OVERLAP
          : targetBox.top - screenBox.top + TUTORIAL_PORTRAIT_POINTER_OVERLAP;
      const top = targetEdgeY - pointer.y + (dialogue.verticalOffset ?? 0);
      const next = {
        left: Math.round(left * 10) / 10,
        top: Math.round(top * 10) / 10,
        pointerPlacement,
      };
      setAnchor((current) =>
        current?.left === next.left &&
        current.top === next.top &&
        current.pointerPlacement === next.pointerPlacement
          ? current
          : next,
      );
    };

    updateAnchor();
    const observer = new ResizeObserver(updateAnchor);
    observer.observe(screen);
    observer.observe(target);
    observer.observe(bubble);
    window.addEventListener("resize", updateAnchor);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchor);
    };
  }, [desktop, dialogue.owner, dialogue.verticalOffset, layoutKey]);

  const pointerPlacement =
    anchor?.pointerPlacement ??
    (dialogue.owner === "enemy" ? "top-left" : "bottom-left");

  return (
    <div
      ref={bubbleFrameRef}
      aria-hidden={!visible}
      data-tutorial-dreamcaller-dialogue=""
      data-tutorial-dreamcaller-dialogue-owner={dialogue.owner}
      style={{
        position: "absolute",
        zIndex: token("--layer-reveal"),
        top: anchor?.top ?? 0,
        left: anchor?.left ?? 0,
        width: "max-content",
        maxWidth: desktop ? (dialogue.bubbleWidth ?? 300) : 220,
        visibility: visible && anchor !== null ? "visible" : "hidden",
        pointerEvents: "none",
      }}
    >
      <SpeechBubble
        speakerName={dialogue.speakerName}
        text={dialogue.text}
        pointerPlacement={pointerPlacement}
        testId={`tutorial-${dialogue.owner}-dreamcaller-speech-bubble`}
      />
    </div>
  );
}

function TutorialDreamcallerArrival({
  screen,
  dreamcaller,
  owner,
  pause,
  duration,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly dreamcaller: DreamcallerVisual;
  readonly owner: TutorialDreamcallerOwner;
  readonly pause: number;
  readonly duration: number;
  readonly onComplete: () => void;
}): ReactElement | null {
  const [trajectory, setTrajectory] =
    useState<TutorialDreamcallerTrajectory | null>(null);

  useLayoutEffect(() => {
    const target = screen.querySelector<HTMLElement>(
      `[data-testid="${owner}-battle-status"] [data-battle-status-dreamcaller-placeholder]`,
    );
    const dialoguePortrait = screen.querySelector<HTMLElement>(
      "[data-character-dialogue-portrait-frame]",
    );
    if (target === null) return undefined;

    const updateTrajectory = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const targetBox = target.getBoundingClientRect();
      const dialoguePortraitBox = dialoguePortrait?.getBoundingClientRect();
      setTrajectory({
        startX: targetBox.left - screenBox.left,
        startY: (screenBox.height - targetBox.height) / 2,
        targetY: targetBox.top - screenBox.top,
        startScale:
          targetBox.width === 0 || dialoguePortraitBox === undefined
            ? 1
            : dialoguePortraitBox.width / targetBox.width,
        width: targetBox.width,
        height: targetBox.height,
      });
    };

    updateTrajectory();
    const observer = new ResizeObserver(updateTrajectory);
    observer.observe(screen);
    observer.observe(target);
    if (dialoguePortrait !== null) observer.observe(dialoguePortrait);
    window.addEventListener("resize", updateTrajectory);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateTrajectory);
    };
  }, [owner, screen]);

  if (trajectory === null) return null;

  const totalDuration = pause + duration;
  const frames =
    totalDuration === 0
      ? {
          y: [trajectory.targetY, trajectory.targetY],
          scale: [1, 1],
          times: [0, 1],
        }
      : {
          y: [trajectory.startY, trajectory.startY, trajectory.targetY],
          scale: [trajectory.startScale, trajectory.startScale, 1],
          times: [0, pause / totalDuration, 1],
        };

  return (
    <motion.div
      data-tutorial-dreamcaller-arrival=""
      data-tutorial-dreamcaller-owner={owner}
      initial={{
        x: trajectory.startX,
        y: trajectory.startY,
        scale: trajectory.startScale,
        opacity: 1,
      }}
      animate={{
        y: frames.y,
        scale: frames.scale,
        opacity: 1,
      }}
      transition={{
        duration: totalDuration,
        times: frames.times,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        position: "absolute",
        zIndex: 40,
        top: 0,
        left: 0,
        width: trajectory.width,
        height: trajectory.height,
        pointerEvents: "none",
        transformOrigin: "center",
      }}
    >
      <DreamcallerPortrait dreamcaller={dreamcaller} variant="thumb" />
    </motion.div>
  );
}

function TutorialOpponentCardPlay({
  screen,
  card,
  revealDuration,
  reduceMotion,
  playbackSpeed,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly card: MobileBattleCardView;
  readonly revealDuration: number;
  readonly reduceMotion: boolean;
  readonly playbackSpeed: number;
  readonly onComplete: () => void;
}): ReactElement | null {
  const [trajectory, setTrajectory] = useState<TutorialCardTrajectory | null>(
    null,
  );

  useLayoutEffect(() => {
    const source = [
      ...screen.querySelectorAll<HTMLElement>(
        '[data-battle-card-zone="far-hand"][data-battle-card-id]',
      ),
    ].find((element) => element.dataset.battleCardId === card.id);
    const enemyFront = [
      ...screen.querySelectorAll<HTMLElement>(
        '[data-battle-rank="enemy-front"] [data-battle-slot-id]',
      ),
    ];
    const playerFront = [
      ...screen.querySelectorAll<HTMLElement>(
        '[data-battle-rank="player-front"] [data-battle-slot-id]',
      ),
    ];
    const enemyBack = [
      ...screen.querySelectorAll<HTMLElement>(
        '[data-battle-rank="enemy-back"] [data-battle-slot-id]',
      ),
    ];
    const destinationStart = tutorialOpponentBackRankIndex(enemyBack.length);
    const destination =
      enemyBack
        .slice(destinationStart)
        .find(
          (slot) =>
            slot.querySelector("[data-battle-card-id]") === null,
        ) ?? enemyBack[destinationStart];
    if (
      source === undefined ||
      destination === undefined ||
      enemyFront.length < 2 ||
      playerFront.length < 2
    ) {
      return undefined;
    }

    source.style.visibility = "hidden";
    const measuredElements = [
      screen,
      source,
      destination,
      ...enemyFront.slice(-2),
      ...playerFront.slice(-2),
    ];
    const updateTrajectory = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const sourceBox = source.getBoundingClientRect();
      const destinationBox = destination.getBoundingClientRect();
      const [enemyPenultimate, enemyLast] = enemyFront
        .slice(-2)
        .map((slot) => slot.getBoundingClientRect());
      const [playerPenultimate, playerLast] = playerFront
        .slice(-2)
        .map((slot) => slot.getBoundingClientRect());
      if (
        enemyPenultimate === undefined ||
        enemyLast === undefined ||
        playerPenultimate === undefined ||
        playerLast === undefined
      ) {
        return;
      }
      const revealWidth = Math.min(
        TUTORIAL_REVEAL_CARD_DESKTOP_WIDTH,
        screenBox.width * TUTORIAL_REVEAL_CARD_MOBILE_WIDTH_RATIO,
      );
      const revealHeight = revealWidth / CARD_ASPECT_RATIO_VALUE;
      const revealCenterX =
        (enemyPenultimate.right +
          enemyLast.left +
          playerPenultimate.right +
          playerLast.left) /
        4;
      const revealCenterY =
        (enemyPenultimate.bottom +
          enemyLast.bottom +
          playerPenultimate.top +
          playerLast.top) /
        4;
      setTrajectory({
        source: {
          x: sourceBox.left - screenBox.left,
          y: sourceBox.top - screenBox.top,
          width: sourceBox.width,
          height: sourceBox.height,
        },
        reveal: {
          x: revealCenterX - screenBox.left - revealWidth / 2,
          y: revealCenterY - screenBox.top - revealHeight / 2,
          width: revealWidth,
          height: revealHeight,
        },
        destination: {
          x: destinationBox.left - screenBox.left,
          y: destinationBox.top - screenBox.top,
          width: destinationBox.width,
          height: destinationBox.height,
        },
      });
    };

    updateTrajectory();
    const observer = new ResizeObserver(updateTrajectory);
    for (const element of measuredElements) observer.observe(element);
    window.addEventListener("resize", updateTrajectory);
    return () => {
      source.style.visibility = "";
      observer.disconnect();
      window.removeEventListener("resize", updateTrajectory);
    };
  }, [card.id, screen]);

  if (trajectory === null) return null;

  const travelDuration = reduceMotion
    ? 0
    : atPlaybackSpeed(TUTORIAL_CARD_TRAVEL_SECONDS, playbackSpeed);
  const flipDuration = reduceMotion
    ? 0
    : atPlaybackSpeed(TUTORIAL_CARD_FLIP_SECONDS, playbackSpeed);
  const scaledRevealDuration = atPlaybackSpeed(
    revealDuration,
    playbackSpeed,
  );
  const totalDuration =
    travelDuration * 2 + flipDuration + scaledRevealDuration;
  const revealStart = totalDuration === 0 ? 0 : travelDuration / totalDuration;
  const readingStart =
    totalDuration === 0
      ? 0
      : (travelDuration + flipDuration) / totalDuration;
  const revealEnd =
    totalDuration === 0
      ? 1
      : (travelDuration + flipDuration + scaledRevealDuration) / totalDuration;
  const times = [0, revealStart, readingStart, revealEnd, 1];
  const frames = reduceMotion
    ? [trajectory.reveal, trajectory.reveal]
    : [
        trajectory.source,
        trajectory.reveal,
        trajectory.reveal,
        trajectory.reveal,
        trajectory.destination,
      ];
  const motionTimes = reduceMotion ? [0, 1] : times;

  return (
    <motion.div
      data-tutorial-opponent-card-play=""
      data-tutorial-card-id={card.model.cardId}
      initial={{
        x: frames[0]?.x,
        y: frames[0]?.y,
        width: frames[0]?.width,
        height: frames[0]?.height,
      }}
      animate={{
        x: frames.map((frame) => frame.x),
        y: frames.map((frame) => frame.y),
        width: frames.map((frame) => frame.width),
        height: frames.map((frame) => frame.height),
      }}
      transition={{
        duration: totalDuration,
        times: motionTimes,
        ease: [0.22, 0.61, 0.36, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        position: "absolute",
        zIndex: token("--layer-reveal"),
        top: 0,
        left: 0,
        pointerEvents: "none",
        perspective: 1200,
      }}
    >
      {reduceMotion ? (
        <GameCard
          model={card.model}
          testId="tutorial-opponent-card-reveal"
        />
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>
          <motion.div
            data-tutorial-card-full-layer=""
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{
              delay: travelDuration + flipDuration + scaledRevealDuration,
              duration: travelDuration,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: "100%",
              aspectRatio: CARD_ASPECT_RATIO_VALUE,
              transform: "translateY(-50%)",
            }}
          >
            <motion.div
              data-tutorial-card-flip-layer=""
              initial={{ rotateY: 0 }}
              animate={{ rotateY: [0, 0, 180, 180, 180] }}
              transition={{ duration: totalDuration, times }}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                transformStyle: "preserve-3d",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backfaceVisibility: "hidden",
                }}
              >
                <CardBack label="Opponent card flipping face up" />
              </div>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  transform: "rotateY(180deg)",
                  backfaceVisibility: "hidden",
                }}
              >
                <GameCard
                  model={card.model}
                  testId="tutorial-opponent-card-reveal"
                />
              </div>
            </motion.div>
          </motion.div>
          <motion.div
            data-tutorial-card-battlefield-layer=""
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              delay: travelDuration + flipDuration + scaledRevealDuration,
              duration: travelDuration,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: "50%",
              left: 0,
              width: "100%",
              aspectRatio: BATTLEFIELD_CARD_ASPECT_RATIO,
              transform: "translateY(-50%)",
              filter: card.exhausted
                ? BATTLEFIELD_CARD_EXHAUSTED_FILTER
                : undefined,
            }}
          >
            <GameCard
              model={card.model}
              exhausted={card.exhausted}
              presentation="battlefield"
              testId="tutorial-opponent-card-battlefield"
            />
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}

interface TutorialChallengeGeometry {
  readonly challenger: TutorialCardFrame;
  readonly defender: TutorialCardFrame;
  readonly void: TutorialCardFrame;
}

function tutorialChallengeCardElement(
  screen: HTMLElement,
  participant: TutorialChallengeParticipantView,
): HTMLElement | null {
  const rank = screen.querySelector<HTMLElement>(
    `[data-battle-rank="${participant.owner}-front"]`,
  );
  if (rank === null) return null;
  return (
    [...rank.querySelectorAll<HTMLElement>("[data-battle-card-id]")].find(
      (element) => element.dataset.battleCardId === participant.card.id,
    ) ?? null
  );
}

function frameRelativeTo(
  element: HTMLElement,
  container: HTMLElement,
): TutorialCardFrame {
  const elementBox = element.getBoundingClientRect();
  const containerBox = container.getBoundingClientRect();
  return {
    x: elementBox.left - containerBox.left,
    y: elementBox.top - containerBox.top,
    width: elementBox.width,
    height: elementBox.height,
  };
}

function TutorialChallengeAnimation({
  screen,
  challenge,
  wait,
  reduceMotion,
  playbackSpeed,
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly challenge: TutorialChallengeView;
  readonly wait: number;
  readonly reduceMotion: boolean;
  readonly playbackSpeed: number;
  readonly onComplete: () => void;
}): ReactElement | null {
  const [started, setStarted] = useState(false);
  const [geometry, setGeometry] =
    useState<TutorialChallengeGeometry | null>(null);
  const completionReported = useRef(false);
  const completionTimeout = useRef<number | null>(null);

  const finish = useCallback((): void => {
    if (completionReported.current) return;
    completionReported.current = true;
    if (wait === 0) {
      onComplete();
      return;
    }
    completionTimeout.current = window.setTimeout(
      onComplete,
      millisecondsAtPlaybackSpeed(wait, playbackSpeed),
    );
  }, [onComplete, playbackSpeed, wait]);

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setStarted(true),
      reduceMotion
        ? 0
        : millisecondsAtPlaybackSpeed(
            TUTORIAL_CARD_TRAVEL_SECONDS,
            playbackSpeed,
          ),
    );
    return () => window.clearTimeout(timeout);
  }, [playbackSpeed, reduceMotion]);

  useEffect(
    () => () => {
      if (completionTimeout.current !== null) {
        window.clearTimeout(completionTimeout.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!started || !reduceMotion) return;
    finish();
  }, [finish, reduceMotion, started]);

  useLayoutEffect(() => {
    if (!started || reduceMotion) return undefined;
    const challengerElement = tutorialChallengeCardElement(
      screen,
      challenge.challenger,
    );
    const defenderElement = tutorialChallengeCardElement(
      screen,
      challenge.defender,
    );
    const voidElement = screen.querySelector<HTMLElement>(
      `[data-battle-zone="${challenge.loserOwner}-void"] [data-battle-pile-frame]`,
    );
    if (
      challengerElement === null ||
      defenderElement === null ||
      voidElement === null
    ) {
      return undefined;
    }
    setGeometry({
      challenger: frameRelativeTo(challengerElement, screen),
      defender: frameRelativeTo(defenderElement, screen),
      void: frameRelativeTo(voidElement, screen),
    });
    const challengerVisual =
      challengerElement.querySelector<HTMLElement>(
        "[data-battle-card-motion]",
      ) ?? challengerElement;
    const defenderVisual =
      defenderElement.querySelector<HTMLElement>(
        "[data-battle-card-motion]",
      ) ?? defenderElement;
    const previousChallengerVisibility =
      challengerVisual.style.visibility;
    const previousDefenderVisibility = defenderVisual.style.visibility;
    challengerVisual.style.visibility = "hidden";
    defenderVisual.style.visibility = "hidden";
    return () => {
      challengerVisual.style.visibility = previousChallengerVisibility;
      defenderVisual.style.visibility = previousDefenderVisibility;
    };
  }, [challenge, reduceMotion, screen, started]);

  if (geometry === null || reduceMotion) return null;

  const frameFor = (
    participant: TutorialChallengeParticipantView,
  ): TutorialCardFrame =>
    participant.owner === challenge.challenger.owner
      ? geometry.challenger
      : geometry.defender;
  const winner =
    challenge.winnerOwner === challenge.challenger.owner
      ? challenge.challenger
      : challenge.defender;
  const loser =
    challenge.loserOwner === challenge.challenger.owner
      ? challenge.challenger
      : challenge.defender;
  const winnerFrame = frameFor(winner);
  const loserFrame = frameFor(loser);
  const challengerCenterX =
    geometry.challenger.x + geometry.challenger.width / 2;
  const defenderCenterX = geometry.defender.x + geometry.defender.width / 2;
  const challengerCenterY =
    geometry.challenger.y + geometry.challenger.height / 2;
  const defenderCenterY =
    geometry.defender.y + geometry.defender.height / 2;
  const clashCenterX = (challengerCenterX + defenderCenterX) / 2;
  const clashCenterY = (challengerCenterY + defenderCenterY) / 2;
  const clashGap =
    Math.min(geometry.challenger.height, geometry.defender.height) * 0.04;
  const clashFrame = (
    participant: TutorialChallengeParticipantView,
    frame: TutorialCardFrame,
  ): TutorialCardFrame => ({
    ...frame,
    x: clashCenterX - frame.width / 2,
    y:
      participant.owner === "enemy"
        ? clashCenterY - frame.height - clashGap / 2
        : clashCenterY + clashGap / 2,
  });
  const loserClash = clashFrame(loser, loserFrame);
  const voidCenterX = geometry.void.x + geometry.void.width / 2;
  const voidCenterY = geometry.void.y + geometry.void.height / 2;
  const rematerializedWidth = geometry.void.height;
  const rematerializedHeight = geometry.void.width;
  const loserClashCenterX = loserClash.x + loserClash.width / 2;
  const loserClashCenterY = loserClash.y + loserClash.height / 2;
  const sequenceTimes = [0, 0.16, 0.42, 0.56, 0.78, 1];
  const participants = [challenge.challenger, challenge.defender] as const;

  return (
    <div
      role="status"
      aria-label={`${winner.card.model.displaySnapshot.name} wins the challenge. ${loser.card.model.displaySnapshot.name} dissolves into the ${loser.owner === "enemy" ? "opponent" : "player"} void.`}
      data-tutorial-challenge-animation=""
      data-tutorial-challenge-winner-card-id={winner.card.model.cardId}
      data-tutorial-challenge-loser-card-id={loser.card.model.cardId}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {participants.map((participant) => {
        const source = frameFor(participant);
        const clash = clashFrame(participant, source);
        const won = participant.owner === challenge.winnerOwner;
        return (
          <motion.div
            key={participant.card.id}
            data-tutorial-challenge-card={participant.owner}
            data-tutorial-challenge-outcome={won ? "winner" : "loser"}
            initial={{
              x: source.x,
              y: source.y,
              scale: 1,
              rotate: 0,
              opacity: 1,
            }}
            animate={{
              x: [
                source.x,
                source.x,
                clash.x,
                clash.x,
                won ? source.x : clash.x,
                won ? source.x : clash.x,
              ],
              y: [
                source.y,
                source.y - source.height * 0.08,
                clash.y,
                clash.y,
                won ? source.y - source.height * 0.08 : clash.y,
                won ? source.y : clash.y,
              ],
              scale: won
                ? [1, 1.08, 1.12, 1.16, 1.08, 1]
                : [1, 1.08, 1.12, 1.04, 0.58, 0.4],
              rotate: won
                ? [0, -1, 2, -2, 1, 0]
                : [0, 1, -2, 3, 14, 24],
              opacity: won
                ? [1, 1, 1, 1, 1, 1]
                : [1, 1, 1, 0.7, 0, 0],
            }}
            transition={{
              duration: atPlaybackSpeed(
                TUTORIAL_CHALLENGE_TOTAL_SECONDS,
                playbackSpeed,
              ),
              times: sequenceTimes,
              ease: [0.22, 0.61, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: source.width,
              height: source.height,
              containerType: "inline-size",
              transformOrigin: "center",
            }}
          >
            <GameCard
              model={participant.card.model}
              exhausted={false}
              presentation="battlefield"
              testId={`tutorial-challenge-card-${participant.owner}`}
            />
          </motion.div>
        );
      })}
      {[0, 1].map((ring) => (
        <motion.div
          key={ring}
          aria-hidden="true"
          data-tutorial-challenge-impact-ring={String(ring + 1)}
          initial={{ scale: 0.2, opacity: 0 }}
          animate={{
            scale: [0.2, 0.2, 0.2, 1 + ring * 0.45, 1.7 + ring * 0.5, 2],
            opacity: [0, 0, 0, 0.95, 0, 0],
          }}
          transition={{
            duration: atPlaybackSpeed(
              TUTORIAL_CHALLENGE_TOTAL_SECONDS,
              playbackSpeed,
            ),
            times: sequenceTimes,
            ease: [0.22, 0.61, 0.36, 1],
          }}
          style={{
            position: "absolute",
            left: clashCenterX - winnerFrame.width * 0.62,
            top: clashCenterY - winnerFrame.width * 0.62,
            width: winnerFrame.width * 1.24,
            height: winnerFrame.width * 1.24,
            border: `${token("--space-1")} solid ${token(ring === 0 ? "--spark" : "--accent-bright")}`,
            borderRadius: token("--radius-pill"),
            boxShadow:
              ring === 0
                ? token("--shadow-card")
                : token("--glow-accent-soft"),
          }}
        />
      ))}
      {Array.from({ length: TUTORIAL_CHALLENGE_MOTE_COUNT }, (_unused, index) => {
        const angle =
          (index / TUTORIAL_CHALLENGE_MOTE_COUNT) * Math.PI * 2 +
          (index % 2 === 0 ? 0.18 : -0.11);
        const scatterDistance =
          loserFrame.width * (0.45 + (index % 5) * 0.13);
        const moteSize = token(index % 4 === 0 ? "--space-5" : "--space-4");
        return (
          <motion.div
            key={index}
            aria-hidden="true"
            data-tutorial-challenge-mote=""
            initial={{
              x: loserClashCenterX,
              y: loserClashCenterY,
              scale: 0,
              opacity: 0,
            }}
            animate={{
              x: [
                loserClashCenterX,
                loserClashCenterX,
                loserClashCenterX + Math.cos(angle) * scatterDistance,
                voidCenterX + Math.cos(angle) * geometry.void.width * 0.12,
                voidCenterX,
              ],
              y: [
                loserClashCenterY,
                loserClashCenterY,
                loserClashCenterY + Math.sin(angle) * scatterDistance,
                voidCenterY + Math.sin(angle) * geometry.void.height * 0.12,
                voidCenterY,
              ],
              scale: [0, 0, 1.1 + (index % 3) * 0.22, 0.9, 0],
              opacity: [0, 0, 1, 1, 0],
              rotate: [0, 0, index % 2 === 0 ? 120 : -140, 240, 320],
            }}
            transition={{
              duration: atPlaybackSpeed(
                TUTORIAL_CHALLENGE_TOTAL_SECONDS,
                playbackSpeed,
              ),
              times: [0, 0.38, 0.56, 0.86, 1],
              ease: [0.22, 0.61, 0.36, 1],
            }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: moteSize,
              height: moteSize,
              borderRadius: token(
                index % 4 === 0 ? "--radius-inset" : "--radius-pill",
              ),
              background: token(
                index % 3 === 0
                  ? "--gradient-gold"
                  : index % 3 === 1
                    ? "--gradient-accent"
                    : "--gradient-energy",
              ),
              outline: `${token("--space-1")} solid ${token("--text-on-accent")}`,
              boxShadow: token("--shadow-md"),
            }}
          />
        );
      })}
      <motion.div
        data-tutorial-challenge-rematerialized=""
        data-tutorial-challenge-rematerialized-owner={loser.owner}
        initial={{
          x: voidCenterX - rematerializedWidth / 2,
          y: voidCenterY - rematerializedHeight / 2,
          scale: 0.25,
          rotate: 90,
          opacity: 0,
        }}
        animate={{
          scale: [0.25, 0.25, 0.25, 0.25, 1.12, 1],
          opacity: [0, 0, 0, 0, 1, 1],
          rotate: [90, 90, 90, 90, 88, 90],
        }}
        transition={{
          duration: atPlaybackSpeed(
            TUTORIAL_CHALLENGE_TOTAL_SECONDS,
            playbackSpeed,
          ),
          times: sequenceTimes,
          ease: [0.22, 0.61, 0.36, 1],
        }}
        onAnimationComplete={finish}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: rematerializedWidth,
          height: rematerializedHeight,
          transformOrigin: "center",
          containerType: "inline-size",
        }}
      >
        <GameCard
          model={loser.card.model}
          exhausted={false}
          testId="tutorial-challenge-rematerialized-card"
        />
      </motion.div>
    </div>
  );
}

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({
  view,
  editor,
  playbackSpeed = 1,
  onActionComplete,
  onDreamcallerArrivalComplete,
  onHowToPlayPresented,
  onHowToPlayDismissed,
  onPlayerCardPlay,
  onEndTurn,
  onPlayerCharacterReposition,
  onEditorActionsChange,
  onReplay,
  onPlayFromAction,
}: TutorialScreenProps): ReactElement {
  const desktop = useIsDesktop();
  const dockEditor = useIsDesktop(TUTORIAL_EDITOR_DOCK_MIN_WIDTH);
  const reduceMotion = useReducedMotion() === true;
  const screenRef = useRef<HTMLElement | null>(null);
  const [sceneEntered, setSceneEntered] = useState(reduceMotion);
  const [editorOpen, setEditorOpen] = useState(false);
  const [battleInspectorOpen, setBattleInspectorOpen] = useState(false);
  const [arrivedActionKey, setArrivedActionKey] = useState<string | null>(null);
  const [drawnActionKey, setDrawnActionKey] = useState<string | null>(null);
  const [playedActionKey, setPlayedActionKey] = useState<string | null>(null);
  const [visibleDialogueActionKey, setVisibleDialogueActionKey] = useState<
    string | null
  >(null);
  const [completedDialogueActionKey, setCompletedDialogueActionKey] = useState<
    string | null
  >(null);
  const [howToPlayPresentedActionKey, setHowToPlayPresentedActionKey] = useState<
    string | null
  >(null);
  const [howToPlayDismissedActionKey, setHowToPlayDismissedActionKey] = useState<
    string | null
  >(null);
  const [dreamwellEmergedActionKey, setDreamwellEmergedActionKey] = useState<
    string | null
  >(null);
  const [completedTurnAnnouncementSide, setCompletedTurnAnnouncementSide] =
    useState<"enemy" | "player" | null>(null);
  const [pendingTutorialCardId, setPendingTutorialCardId] = useState<
    string | null
  >(null);
  const [repositionTargetSlotId, setRepositionTargetSlotId] = useState<
    string | null
  >(null);
  const [repositionRequestedActionKey, setRepositionRequestedActionKey] =
    useState<string | null>(null);
  const pendingTutorialCardIdRef = useRef<string | null>(null);
  const tutorialCardDropHandledRef = useRef(false);
  const reportedDrawKeys = useRef<Set<string>>(new Set());
  const reportedArrivalKeys = useRef<Set<string>>(new Set());
  const reportedPlayKeys = useRef<Set<string>>(new Set());
  const [dialogueAnchor, setDialogueAnchor] =
    useState<TutorialDialogueAnchor | null>(null);
  const lastDialogue = useRef<TutorialDialogueView | null>(view.dialogue);
  if (view.dialogue !== null) lastDialogue.current = view.dialogue;
  const renderedDialogue = view.dialogue ?? lastDialogue.current;
  const opponentDeckCardIds = view.battle.enemy?.deckCardIds ?? [];
  const dreamcallerArrival = useMemo(
    () =>
      view.playbackRunId !== null &&
      view.currentAction?.action === "animate-dreamcaller-portrait"
        ? {
            key: `${view.playbackRunId}:${view.currentAction.id}`,
            owner: view.currentAction.owner,
            pause: atPlaybackSpeed(
              view.currentAction.pause,
              playbackSpeed,
            ),
            duration: atPlaybackSpeed(
              view.currentAction.duration,
              playbackSpeed,
            ),
            dreamcaller: view.dreamcallers[view.currentAction.owner],
          }
        : null,
    [
      playbackSpeed,
      view.currentAction,
      view.dreamcallers,
      view.playbackRunId,
    ],
  );
  const opponentCardDraw = useMemo(
    () =>
      view.playbackRunId !== null &&
      view.currentAction?.action === "draw-opponent-card" &&
      opponentDeckCardIds[0] !== undefined
        ? {
            key: `${view.playbackRunId}:${view.currentAction.id}`,
            cardId: opponentDeckCardIds[0],
          }
        : null,
    [opponentDeckCardIds, view.currentAction, view.playbackRunId],
  );
  const opponentCardPlay = useMemo(() => {
    const currentAction = view.currentAction;
    if (
      view.playbackRunId === null ||
      currentAction?.action !== "reveal-and-play-opponent-card"
    ) {
      return null;
    }
    const card =
      view.opponentCardToReveal?.model.cardId === currentAction.cardId
        ? view.opponentCardToReveal
        : undefined;
    return card === undefined
      ? null
      : {
          key: `${view.playbackRunId}:${currentAction.id}`,
          card,
          revealDuration: currentAction.revealDuration,
        };
  }, [view.currentAction, view.opponentCardToReveal, view.playbackRunId]);
  const dialogueActionId =
    view.dialogue?.actionId ?? view.currentAction?.id ?? null;
  const dialogueParentAction =
    view.dialogue?.parentAction ?? view.currentAction?.action ?? null;
  const dialogueDuration =
    view.dialogue?.duration ??
    (view.currentAction?.action === "display-speech-bubble" ||
    view.currentAction?.action === "reveal-and-play-opponent-card" ||
    view.currentAction?.action === "end-turn"
      ? view.currentAction.speechBubble?.duration
      : undefined) ??
    3;

  useEffect(() => {
    const dialogue = view.dialogue;
    const runId = view.playbackRunId;
    if (
      !sceneEntered ||
      dialogue === null ||
      runId === null ||
      dialogueActionId === null
    ) {
      return undefined;
    }
    const actionKey = `${runId}:${dialogueActionId}`;
    setCompletedDialogueActionKey((current) =>
      current === actionKey ? null : current,
    );
    const startDelay =
      dialogueParentAction === "reveal-and-play-opponent-card" && !reduceMotion
        ? millisecondsAtPlaybackSpeed(
            TUTORIAL_CARD_TRAVEL_SECONDS + TUTORIAL_CARD_FLIP_SECONDS,
            playbackSpeed,
          )
        : 0;
    if (startDelay === 0) setVisibleDialogueActionKey(actionKey);
    const showTimeout =
      startDelay === 0
        ? null
        : window.setTimeout(
            () => setVisibleDialogueActionKey(actionKey),
            startDelay,
          );
    const hideTimeout = window.setTimeout(
      () => {
        setVisibleDialogueActionKey((current) =>
          current === actionKey ? null : current,
        );
        setCompletedDialogueActionKey(actionKey);
      },
      startDelay +
        millisecondsAtPlaybackSpeed(dialogueDuration, playbackSpeed),
    );
    return () => {
      if (showTimeout !== null) window.clearTimeout(showTimeout);
      window.clearTimeout(hideTimeout);
      setVisibleDialogueActionKey((current) =>
        current === actionKey ? null : current,
      );
    };
  }, [
    dialogueActionId,
    dialogueDuration,
    dialogueParentAction,
    playbackSpeed,
    reduceMotion,
    sceneEntered,
    view.dialogue,
    view.playbackRunId,
  ]);
  const challengeAnimation =
    view.playbackRunId !== null &&
    view.currentAction?.action === "resolve-challenge" &&
    view.challenge !== null &&
    view.challenge !== undefined
      ? {
          key: `${view.playbackRunId}:${view.currentAction.id}`,
          runId: view.playbackRunId,
          actionId: view.currentAction.id,
          wait: view.currentAction.wait,
          challenge: view.challenge,
        }
      : null;
  const dreamcallerSettled = useCallback(
    (owner: TutorialDreamcallerOwner): boolean =>
      view.dreamcallers[owner].settled ||
      (dreamcallerArrival?.owner === owner &&
        arrivedActionKey === dreamcallerArrival.key),
    [arrivedActionKey, dreamcallerArrival, view.dreamcallers],
  );

  const battleView = useMemo<MobileBattleView>(() => {
    const backRankCount = desktop
      ? DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS
      : MOBILE_BATTLE_MIN_BACK_RANK_SLOTS;
    const frontRankCount = desktop
      ? DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS - 1
      : MOBILE_BATTLE_MIN_FRONT_RANK_SLOTS;
    const hasCompleteRanks =
      Array.isArray(view.battle.enemy?.backRank) &&
      Array.isArray(view.battle.enemy.frontRank) &&
      Array.isArray(view.battle.player?.backRank) &&
      Array.isArray(view.battle.player.frontRank);
    const sourceBattle = hasCompleteRanks
      ? {
          ...view.battle,
          enemy: expandedTutorialSide(
            view.battle.enemy,
            "enemy",
            backRankCount,
            frontRankCount,
          ),
          player: expandedTutorialSide(
            view.battle.player,
            "player",
            backRankCount,
            frontRankCount,
          ),
        }
      : view.battle;
    const playerSettled = dreamcallerSettled("player");
    const enemySettled = dreamcallerSettled("enemy");
    const drawnCardId =
      opponentCardDraw !== null && drawnActionKey === opponentCardDraw.key
        ? opponentCardDraw.cardId
        : null;
    if (
      !playerSettled &&
      !enemySettled &&
      drawnCardId === null &&
      (opponentCardPlay === null || playedActionKey !== opponentCardPlay.key)
    ) {
      return sourceBattle;
    }
    const updatedBattle: MobileBattleView = {
      ...sourceBattle,
      ...(playerSettled
        ? {
            player: {
              ...sourceBattle.player,
              status: {
                ...sourceBattle.player.status,
                dreamcaller: view.dreamcallers.player.visual,
                dreamcallerProfile: view.dreamcallers.player.profile,
              },
            },
          }
        : {}),
      ...(enemySettled
        ? {
            enemy: {
              ...sourceBattle.enemy,
              status: {
                ...sourceBattle.enemy.status,
                dreamcaller: view.dreamcallers.enemy.visual,
                dreamcallerProfile: view.dreamcallers.enemy.profile,
              },
            },
            inspector: {
              ...sourceBattle.inspector,
              opponentName: view.dreamcallers.enemy.visual.name,
            },
          }
        : {}),
      ...(drawnCardId === null
        ? {}
        : {
            enemyHandCardIds: [...sourceBattle.enemyHandCardIds, drawnCardId],
            farHand: {
              ...sourceBattle.farHand,
              cardIds: [...sourceBattle.farHand.cardIds, drawnCardId],
            },
            enemy: {
              ...sourceBattle.enemy,
              ...(enemySettled
                ? {
                    status: {
                      ...sourceBattle.enemy.status,
                      dreamcaller: view.dreamcallers.enemy.visual,
                      dreamcallerProfile: view.dreamcallers.enemy.profile,
                    },
                  }
                : {}),
              deckCardIds: sourceBattle.enemy.deckCardIds.filter(
                (cardId) => cardId !== drawnCardId,
              ),
            },
            inspector: {
              ...sourceBattle.inspector,
              ...(enemySettled
                ? { opponentName: view.dreamcallers.enemy.visual.name }
                : {}),
              sides: {
                ...sourceBattle.inspector.sides,
                enemy: {
                  ...sourceBattle.inspector.sides.enemy,
                  zones: {
                    ...sourceBattle.inspector.sides.enemy.zones,
                    hand: sourceBattle.enemyHandCardIds.length + 1,
                    deck: sourceBattle.enemy.deckCardIds.length - 1,
                  },
                },
              },
            },
          }),
    };
    return opponentCardPlay !== null && playedActionKey === opponentCardPlay.key
      ? withOpponentCardPlayed(updatedBattle, opponentCardPlay.card)
      : updatedBattle;
  }, [
    desktop,
    drawnActionKey,
    dreamcallerSettled,
    opponentCardDraw,
    opponentCardPlay,
    playedActionKey,
    view,
  ]);

  const completeDreamcallerArrival = useCallback((): void => {
    if (dreamcallerArrival === null) return;
    if (reportedArrivalKeys.current.has(dreamcallerArrival.key)) return;
    reportedArrivalKeys.current.add(dreamcallerArrival.key);
    setArrivedActionKey(dreamcallerArrival.key);
    onDreamcallerArrivalComplete?.(
      dreamcallerArrival.dreamcaller.profile.id,
      dreamcallerArrival.owner,
    );
  }, [dreamcallerArrival, onDreamcallerArrivalComplete]);

  const completeOpponentCardPlay = useCallback((): void => {
    if (opponentCardPlay === null) return;
    if (reportedPlayKeys.current.has(opponentCardPlay.key)) return;
    reportedPlayKeys.current.add(opponentCardPlay.key);
    setPlayedActionKey(opponentCardPlay.key);
  }, [opponentCardPlay]);

  const completeTurnAnnouncement = useCallback(
    (side: "enemy" | "player"): void => {
      setCompletedTurnAnnouncementSide(side);
      if (!sceneEntered || view.howToPlay === null) return;
      const runId = view.playbackRunId;
      if (runId === null) {
        return;
      }
      const expectedTrigger: TutorialHowToPlayTrigger =
        side === "player"
          ? "player-turn-announcement-complete"
          : "enemy-turn-announcement-complete";
      if (view.howToPlay.trigger !== expectedTrigger) return;
      const actionKey = `${runId}:${view.howToPlay.actionId}`;
      if (
        view.howToPlay.companion !== null &&
        view.howToPlay.companion !== undefined &&
        dreamwellEmergedActionKey !== actionKey
      ) {
        return;
      }
      if (
        howToPlayPresentedActionKey === actionKey ||
        howToPlayDismissedActionKey === actionKey
      ) {
        return;
      }
      setHowToPlayPresentedActionKey(actionKey);
      onHowToPlayPresented?.(
        runId,
        view.howToPlay.actionId,
        view.howToPlay.trigger,
      );
    },
    [
      dreamwellEmergedActionKey,
      howToPlayDismissedActionKey,
      howToPlayPresentedActionKey,
      onHowToPlayPresented,
      sceneEntered,
      view.howToPlay,
      view.playbackRunId,
    ],
  );

  useEffect(() => {
    const howToPlay = view.howToPlay;
    const runId = view.playbackRunId;
    if (!sceneEntered || howToPlay === null || runId === null) return;
    const announcementTrigger =
      completedTurnAnnouncementSide === null
        ? null
        : completedTurnAnnouncementSide === "player"
          ? "player-turn-announcement-complete"
          : "enemy-turn-announcement-complete";
    if (
      howToPlay.trigger !== "immediate" &&
      howToPlay.trigger !== announcementTrigger
    ) {
      return;
    }
    const actionKey = `${runId}:${howToPlay.actionId}`;
    if (
      howToPlay.companion !== null &&
      howToPlay.companion !== undefined &&
      dreamwellEmergedActionKey !== actionKey
    ) {
      return;
    }
    if (
      howToPlayPresentedActionKey === actionKey ||
      howToPlayDismissedActionKey === actionKey
    ) {
      return;
    }
    setHowToPlayPresentedActionKey(actionKey);
    onHowToPlayPresented?.(runId, howToPlay.actionId, howToPlay.trigger);
  }, [
    completedTurnAnnouncementSide,
    dreamwellEmergedActionKey,
    howToPlayDismissedActionKey,
    howToPlayPresentedActionKey,
    onHowToPlayPresented,
    sceneEntered,
    view.howToPlay,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (
      !sceneEntered ||
      view.currentAction?.action !== "display-speech-bubble" ||
      view.playbackRunId === null ||
      completedDialogueActionKey !==
        `${view.playbackRunId}:${view.currentAction.id}`
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    if (wait === 0) {
      onActionComplete?.(runId, id);
      return undefined;
    }
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(wait, playbackSpeed),
    );
    return () => window.clearTimeout(timeout);
  }, [
    completedDialogueActionKey,
    onActionComplete,
    playbackSpeed,
    sceneEntered,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (!sceneEntered || opponentCardDraw === null) return;
    if (reportedDrawKeys.current.has(opponentCardDraw.key)) return;
    reportedDrawKeys.current.add(opponentCardDraw.key);
    setDrawnActionKey(opponentCardDraw.key);
  }, [opponentCardDraw, sceneEntered]);

  useEffect(() => {
    if (
      opponentCardDraw === null ||
      drawnActionKey !== opponentCardDraw.key ||
      view.currentAction?.action !== "draw-opponent-card" ||
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(
        TUTORIAL_CARD_TRAVEL_SECONDS + wait,
        playbackSpeed,
      ),
    );
    return () => window.clearTimeout(timeout);
  }, [
    drawnActionKey,
    onActionComplete,
    opponentCardDraw,
    playbackSpeed,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (
      !sceneEntered ||
      view.currentAction?.action !== "draw-dreamwell-card" ||
      view.playbackRunId === null ||
      view.battle.dreamwell?.model.cardId !== view.currentAction.cardId ||
      completedTurnAnnouncementSide !== view.currentAction.owner
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    if (wait === 0) {
      onActionComplete?.(runId, id);
      return undefined;
    }
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(wait, playbackSpeed),
    );
    return () => window.clearTimeout(timeout);
  }, [
    completedTurnAnnouncementSide,
    onActionComplete,
    playbackSpeed,
    sceneEntered,
    view.battle.dreamwell,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (
      opponentCardPlay === null ||
      playedActionKey !== opponentCardPlay.key ||
      view.currentAction?.action !== "reveal-and-play-opponent-card" ||
      view.playbackRunId === null ||
      (view.currentAction.speechBubble !== undefined &&
        completedDialogueActionKey !==
          `${view.playbackRunId}:${view.currentAction.id}`)
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    if (wait === 0) {
      onActionComplete?.(runId, id);
      return undefined;
    }
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(wait, playbackSpeed),
    );
    return () => window.clearTimeout(timeout);
  }, [
    completedDialogueActionKey,
    onActionComplete,
    opponentCardPlay,
    playbackSpeed,
    playedActionKey,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (
      !sceneEntered ||
      view.currentAction?.action !== "reposition-opponent-character" ||
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(
        TUTORIAL_CARD_TRAVEL_SECONDS + wait,
        playbackSpeed,
      ),
    );
    return () => window.clearTimeout(timeout);
  }, [
    onActionComplete,
    playbackSpeed,
    sceneEntered,
    view.currentAction,
    view.playbackRunId,
  ]);

  const closeHowToPlay = useCallback((): void => {
    const runId = view.playbackRunId;
    const howToPlay = view.howToPlay;
    if (runId === null || howToPlay === null) return;
    setHowToPlayDismissedActionKey(`${runId}:${howToPlay.actionId}`);
    onHowToPlayDismissed?.(
      runId,
      howToPlay.actionId,
      howToPlay.trigger,
    );
  }, [onHowToPlayDismissed, view.howToPlay, view.playbackRunId]);

  // The instructional action has completed by the time the player receives
  // control. Its view data is therefore absent, while the hand still carries
  // the authoritative playable marker from the tutorial view model.
  const tutorialPlayableCard =
    view.currentAction?.action === "end-turn" &&
    view.endTurn?.ready !== true
      ? ((view.battle.playerHand ?? []).find(
          (card) => card.showPlayableOutline,
        ) ?? null)
      : null;
  const canPlayTutorialCard =
    view.currentAction?.action === "end-turn" &&
    view.playbackRunId !== null &&
    tutorialPlayableCard !== null &&
    onPlayerCardPlay !== undefined;
  const canEndTurn =
    view.currentAction?.action === "end-turn" &&
    view.endTurn?.ready === true &&
    view.playbackRunId !== null &&
    (view.currentAction.speechBubble === undefined ||
      completedDialogueActionKey ===
        `${view.playbackRunId}:${view.currentAction.id}`) &&
    onEndTurn !== undefined;
  const playerReposition = view.playerReposition ?? null;
  const playerRepositionActionKey =
    playerReposition === null || view.playbackRunId === null
      ? null
      : `${view.playbackRunId}:${playerReposition.actionId}`;
  const canRepositionTutorialCard =
    playerReposition !== null &&
    playerRepositionActionKey !== repositionRequestedActionKey &&
    view.playbackRunId !== null &&
    onPlayerCharacterReposition !== undefined;

  useEffect(() => {
    if (canPlayTutorialCard || canRepositionTutorialCard) return;
    pendingTutorialCardIdRef.current = null;
    tutorialCardDropHandledRef.current = false;
    setPendingTutorialCardId(null);
  }, [canPlayTutorialCard, canRepositionTutorialCard]);

  useEffect(() => {
    setRepositionTargetSlotId(null);
    setRepositionRequestedActionKey(null);
  }, [playerRepositionActionKey]);

  const playTutorialCard = useCallback(
    (targetSlotId: string | null): void => {
      const runId = view.playbackRunId;
      const card = tutorialPlayableCard;
      if (
        runId === null ||
        card === null ||
        onPlayerCardPlay === undefined ||
        pendingTutorialCardIdRef.current !== card.id
      ) {
        return;
      }
      tutorialCardDropHandledRef.current = true;
      pendingTutorialCardIdRef.current = null;
      setPendingTutorialCardId(null);
      onPlayerCardPlay(
        runId,
        card.id,
        card.model.cardId,
        targetSlotId,
      );
    },
    [onPlayerCardPlay, tutorialPlayableCard, view.playbackRunId],
  );

  const tutorialInteractions = useMemo<MobileBattleInteractions | undefined>(
    () =>
      (!canPlayTutorialCard || tutorialPlayableCard === null) &&
      !canRepositionTutorialCard &&
      !canEndTurn
        ? undefined
        : {
            canInteract: true,
            nearSide: "player",
            pendingCardId: pendingTutorialCardId,
            pendingCardSource:
              pendingTutorialCardId === null
                ? null
                : canRepositionTutorialCard
                  ? "battlefield"
                  : "near-hand",
            pendingCardOwner:
              pendingTutorialCardId === null ? null : "player",
            onHandCardActivate: (battleCardId) => {
              if (!canPlayTutorialCard || tutorialPlayableCard === null) return;
              if (battleCardId !== tutorialPlayableCard.id) return;
              pendingTutorialCardIdRef.current = battleCardId;
              tutorialCardDropHandledRef.current = false;
              playTutorialCard(null);
            },
            onHandCardDrop: (target) => {
              if (!canPlayTutorialCard) return;
              playTutorialCard(
                target?.owner === "player" && target.rank === "back"
                  ? target.slotId
                  : null,
              );
            },
            onCardDragStart: (battleCardId, source) => {
              if (
                canRepositionTutorialCard &&
                playerReposition !== null &&
                source === "battlefield" &&
                battleCardId === playerReposition.cardInstanceId
              ) {
                tutorialCardDropHandledRef.current = false;
                pendingTutorialCardIdRef.current = battleCardId;
                setPendingTutorialCardId(battleCardId);
                return;
              }
              if (!canPlayTutorialCard || tutorialPlayableCard === null) return;
              if (
                source !== "near-hand" ||
                battleCardId !== tutorialPlayableCard.id
              ) {
                return;
              }
              tutorialCardDropHandledRef.current = false;
              pendingTutorialCardIdRef.current = battleCardId;
              setPendingTutorialCardId(battleCardId);
            },
            onCardDragEnd: () => {
              if (canRepositionTutorialCard) {
                tutorialCardDropHandledRef.current = false;
                pendingTutorialCardIdRef.current = null;
                setPendingTutorialCardId(null);
                return;
              }
              if (!canPlayTutorialCard || tutorialPlayableCard === null) return;
              if (
                !tutorialCardDropHandledRef.current &&
                pendingTutorialCardIdRef.current === tutorialPlayableCard.id
              ) {
                playTutorialCard(null);
                return;
              }
              tutorialCardDropHandledRef.current = false;
              pendingTutorialCardIdRef.current = null;
              setPendingTutorialCardId(null);
            },
            onSlotDrop: (target) => {
              if (
                canRepositionTutorialCard &&
                playerReposition !== null &&
                view.playbackRunId !== null &&
                onPlayerCharacterReposition !== undefined &&
                pendingTutorialCardIdRef.current ===
                  playerReposition.cardInstanceId &&
                target.owner === "player" &&
                target.rank === "front" &&
                target.slotId === repositionTargetSlotId
              ) {
                tutorialCardDropHandledRef.current = true;
                pendingTutorialCardIdRef.current = null;
                setPendingTutorialCardId(null);
                setRepositionRequestedActionKey(
                  `${view.playbackRunId}:${playerReposition.actionId}`,
                );
                onPlayerCharacterReposition(
                  view.playbackRunId,
                  playerReposition.actionId,
                  playerReposition.cardId,
                  playerReposition.opposingCardId,
                  target.slotId,
                );
                return;
              }
              if (!canPlayTutorialCard) return;
              playTutorialCard(
                target.owner === "player" && target.rank === "back"
                  ? target.slotId
                  : null,
              );
            },
            onZoneDrop: () => {},
            onPreviousPhase: () => {},
            onNextPhase: () => {
              if (
                !canEndTurn ||
                view.playbackRunId === null ||
                view.endTurn === null
              ) {
                return;
              }
              onEndTurn?.(view.playbackRunId, view.endTurn.actionId);
            },
          },
    [
      canEndTurn,
      canPlayTutorialCard,
      canRepositionTutorialCard,
      onEndTurn,
      onPlayerCharacterReposition,
      pendingTutorialCardId,
      playTutorialCard,
      playerReposition,
      repositionTargetSlotId,
      tutorialPlayableCard,
      view.endTurn,
      view.playbackRunId,
    ],
  );

  useEffect(() => {
    const runId = view.playbackRunId;
    const howToPlay = view.howToPlay;
    if (
      runId === null ||
      howToPlay === null ||
      howToPlayDismissedActionKey !== `${runId}:${howToPlay.actionId}`
    ) {
      return undefined;
    }
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, howToPlay.actionId),
      millisecondsAtPlaybackSpeed(howToPlay.wait, playbackSpeed),
    );
    return () => window.clearTimeout(timeout);
  }, [
    howToPlayDismissedActionKey,
    onActionComplete,
    playbackSpeed,
    view.howToPlay,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (
      !sceneEntered ||
      !reduceMotion ||
      dreamcallerArrival === null ||
      arrivedActionKey === dreamcallerArrival.key
    ) {
      return;
    }
    completeDreamcallerArrival();
  }, [
    arrivedActionKey,
    completeDreamcallerArrival,
    dreamcallerArrival,
    reduceMotion,
    sceneEntered,
  ]);

  useEffect(() => {
    if (
      dreamcallerArrival === null ||
      arrivedActionKey !== dreamcallerArrival.key ||
      view.currentAction?.action !== "animate-dreamcaller-portrait" ||
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      millisecondsAtPlaybackSpeed(wait, playbackSpeed),
    );
    return () => window.clearTimeout(timeout);
  }, [
    arrivedActionKey,
    dreamcallerArrival,
    onActionComplete,
    playbackSpeed,
    view.currentAction,
    view.playbackRunId,
  ]);

  useEffect(() => {
    if (!dockEditor && editorOpen && battleInspectorOpen) {
      setEditorOpen(false);
    }
  }, [battleInspectorOpen, dockEditor, editorOpen]);

  useLayoutEffect(() => {
    const screen = screenRef.current;
    const dialogue = screen?.querySelector<HTMLElement>(
      "[data-character-dialogue]",
    );
    const bubble = dialogue?.querySelector<HTMLElement>("aside");
    const enemySlots = screen?.querySelectorAll<HTMLElement>(
      '[data-battle-rank="enemy-front"] [data-battle-slot-id]',
    );
    const playerSlots = screen?.querySelectorAll<HTMLElement>(
      '[data-battle-rank="player-front"] [data-battle-slot-id]',
    );
    if (
      screen === null ||
      screen === undefined ||
      dialogue === null ||
      dialogue === undefined
    ) {
      return undefined;
    }

    if (
      desktop &&
      (bubble === null ||
        bubble === undefined ||
        enemySlots === undefined ||
        playerSlots === undefined ||
        enemySlots.length < 2 ||
        playerSlots.length < 2)
    ) {
      return undefined;
    }

    const measuredElements: Element[] = [screen, dialogue];
    if (bubble !== null && bubble !== undefined) measuredElements.push(bubble);
    if (enemySlots !== undefined) measuredElements.push(...enemySlots);
    if (playerSlots !== undefined) measuredElements.push(...playerSlots);
    const updateAnchor = (): void => {
      const screenBox = screen.getBoundingClientRect();
      const dialogueBox = dialogue.getBoundingClientRect();
      let next: TutorialDialogueAnchor;
      if (
        desktop &&
        bubble !== null &&
        bubble !== undefined &&
        enemySlots !== undefined &&
        playerSlots !== undefined
      ) {
        const bubbleBox = bubble.getBoundingClientRect();
        const enemyLeftBox = enemySlots[0].getBoundingClientRect();
        const enemyRightBox = enemySlots[1].getBoundingClientRect();
        const playerLeftBox = playerSlots[0].getBoundingClientRect();
        const playerRightBox = playerSlots[1].getBoundingClientRect();
        const frontIntersectionX =
          (enemyLeftBox.right +
            enemyRightBox.left +
            playerLeftBox.right +
            playerRightBox.left) /
          4;
        const frontIntersectionY =
          (enemyLeftBox.bottom +
            enemyRightBox.bottom +
            playerLeftBox.top +
            playerRightBox.top) /
          4;
        next = {
          left:
            Math.round(
              (frontIntersectionX -
                screenBox.left -
                (bubbleBox.left - dialogueBox.left)) *
                10,
            ) / 10,
          top:
            Math.round(
              (frontIntersectionY -
                screenBox.top -
                dialogueBox.height / 2 +
                (renderedDialogue?.kind === "guide"
                  ? renderedDialogue.verticalOffset
                  : 0)) *
                10,
            ) / 10,
        };
      } else {
        const dialogueGap = Number.parseFloat(
          window.getComputedStyle(screen).getPropertyValue("--space-6"),
        );
        next = {
          left: 0,
          top:
            Math.round(
              ((screenBox.height - dialogueBox.height) / 2 -
                dialogueBox.height -
                (Number.isFinite(dialogueGap) ? dialogueGap : 0) +
                (renderedDialogue?.kind === "guide"
                  ? renderedDialogue.verticalOffset
                  : 0)) *
                10,
            ) / 10,
        };
      }
      setDialogueAnchor((current) =>
        current?.left === next.left && current.top === next.top
          ? current
          : next,
      );
    };

    updateAnchor();
    const observer = new ResizeObserver(updateAnchor);
    for (const element of measuredElements) observer.observe(element);
    window.addEventListener("resize", updateAnchor);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateAnchor);
    };
  }, [desktop, renderedDialogue]);

  const editorSurface =
    editor === undefined ||
    onEditorActionsChange === undefined ||
    onReplay === undefined ||
    onPlayFromAction === undefined
      ? null
      : {
          ...editor,
          onActionsChange: onEditorActionsChange,
          onReplay,
          onPlayFromAction,
          onClose: () => setEditorOpen(false),
        };

  const handleBattleInspectorOpenChange = useCallback(
    (open: boolean): void => {
      setBattleInspectorOpen(open);
      if (open && !dockEditor) setEditorOpen(false);
    },
    [dockEditor],
  );
  const howToPlayActionKey =
    view.howToPlay === null || view.playbackRunId === null
      ? null
      : `${view.playbackRunId}:${view.howToPlay.actionId}`;
  const dreamwellEmergenceActionKey =
    howToPlayActionKey !== null &&
    view.howToPlay?.companion !== null &&
    view.howToPlay?.companion !== undefined
      ? howToPlayActionKey
      : null;
  const howToPlayVisible =
    howToPlayActionKey !== null &&
    howToPlayPresentedActionKey === howToPlayActionKey &&
    howToPlayDismissedActionKey !== howToPlayActionKey;
  const howToPlayCompanion =
    howToPlayVisible ? (view.howToPlay?.companion ?? null) : null;
  const displayedBattleView =
    howToPlayCompanion === null &&
    view.currentAction?.action !== "draw-dreamwell-card"
      ? battleView
      : { ...battleView, dreamwell: null };
  const repositionSourceCard =
    playerReposition === null
      ? null
      : (battleView.player.backRank.find(
          (slot) => slot.card?.id === playerReposition.cardInstanceId,
        )?.card ?? null);
  const repositionOpposingCard =
    playerReposition === null
      ? null
      : (battleView.enemy.frontRank.find(
          (slot) =>
            slot.card?.model.cardId === playerReposition.opposingCardId,
        )?.card ?? null);

  return (
    <MotionConfig
      transition={{
        duration: atPlaybackSpeed(
          TUTORIAL_CARD_TRAVEL_SECONDS,
          playbackSpeed,
        ),
      }}
    >
      <motion.main
      ref={screenRef}
      className="cumulus"
      data-tutorial-screen=""
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{
        duration: reduceMotion
          ? 0
          : atPlaybackSpeed(TUTORIAL_FADE_SECONDS, playbackSpeed),
      }}
      onAnimationComplete={() => setSceneEntered(true)}
      style={{
        ...tutorialTimingVariables(playbackSpeed),
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100dvh",
        minHeight: "100vh",
        overflow: "hidden",
        background: token("--bg-loading"),
      }}
    >
      <div
        data-tutorial-shell=""
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          gridTemplateColumns:
            dockEditor && editorOpen
              ? `${MOBILE_BATTLE_INSPECTOR_RAIL_TRACK} minmax(0, 1fr)`
              : "minmax(0, 1fr)",
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {dockEditor && editorOpen && editorSurface !== null ? (
          <TutorialEditorRail {...editorSurface} />
        ) : null}
        <div style={{ position: "relative", minWidth: 0, minHeight: 0 }}>
          <MobileBattleScreen
            view={displayedBattleView}
            interactions={tutorialInteractions}
            guidedSlotHighlight={
              playerReposition === null ||
              repositionSourceCard === null ||
              repositionOpposingCard === null ||
              repositionTargetSlotId === null
                ? undefined
                : {
                    owner: "player",
                    rank: "front",
                    slotId: repositionTargetSlotId,
                    label: `Drag ${repositionSourceCard.model.displaySnapshot.name} to block ${repositionOpposingCard.model.displaySnapshot.name}.`,
                  }
            }
            viewport="contained"
            inspectorDefault="collapsed"
            inspectorOpen={battleInspectorOpen}
            onInspectorOpenChange={handleBattleInspectorOpenChange}
            onTurnAnnouncementComplete={completeTurnAnnouncement}
            playbackSpeed={playbackSpeed}
            phaseNavigation={canEndTurn ? "end-turn" : "hidden"}
            preserveOccupiedSlotOutlines={challengeAnimation !== null}
            zoneLabels="voids"
          />
        </div>
      </div>
      {sceneEntered &&
      !reduceMotion &&
      dreamcallerArrival !== null &&
      arrivedActionKey !== dreamcallerArrival.key &&
      screenRef.current !== null ? (
        <TutorialDreamcallerArrival
          screen={screenRef.current}
          dreamcaller={dreamcallerArrival.dreamcaller.visual}
          owner={dreamcallerArrival.owner}
          pause={dreamcallerArrival.pause}
          duration={dreamcallerArrival.duration}
          onComplete={completeDreamcallerArrival}
        />
      ) : null}
      {sceneEntered &&
      opponentCardPlay !== null &&
      playedActionKey !== opponentCardPlay.key &&
      screenRef.current !== null ? (
        <TutorialOpponentCardPlay
          screen={screenRef.current}
          card={opponentCardPlay.card}
          revealDuration={opponentCardPlay.revealDuration}
          reduceMotion={reduceMotion}
          playbackSpeed={playbackSpeed}
          onComplete={completeOpponentCardPlay}
        />
      ) : null}
      {sceneEntered &&
      playerReposition !== null &&
      repositionSourceCard !== null &&
      repositionOpposingCard !== null &&
      screenRef.current !== null ? (
        <TutorialRepositionTargetResolver
          screen={screenRef.current}
          cardId={playerReposition.cardId}
          opposingCardId={playerReposition.opposingCardId}
          onTargetSlotChange={setRepositionTargetSlotId}
        />
      ) : null}
      {sceneEntered &&
      dreamwellEmergenceActionKey !== null &&
      dreamwellEmergedActionKey !== dreamwellEmergenceActionKey &&
      screenRef.current !== null ? (
        <TutorialDreamwellEmergence
          screen={screenRef.current}
          actionKey={dreamwellEmergenceActionKey}
          reduceMotion={reduceMotion}
          playbackSpeed={playbackSpeed}
          onComplete={setDreamwellEmergedActionKey}
        />
      ) : null}
      {sceneEntered &&
      challengeAnimation !== null &&
      screenRef.current !== null ? (
        <TutorialChallengeAnimation
          key={challengeAnimation.key}
          screen={screenRef.current}
          challenge={challengeAnimation.challenge}
          wait={challengeAnimation.wait}
          reduceMotion={reduceMotion}
          playbackSpeed={playbackSpeed}
          onComplete={() =>
            onActionComplete?.(
              challengeAnimation.runId,
              challengeAnimation.actionId,
            )
          }
        />
      ) : null}
      {editorSurface !== null && !editorOpen ? (
        <div
          style={{
            position: "absolute",
            top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
            left: `calc(var(${SAFE_AREA_INSET_PROPERTIES.left}) + ${token("--space-4")})`,
            zIndex: 20,
          }}
        >
          <IconButton
            glyph={GLYPHS.sidebarLeft}
            size="sm"
            label="Open tutorial editor"
            ariaExpanded={false}
            ariaControls="cumulus-tutorial-editor"
            testId="tutorial-editor-trigger"
            onPress={() => {
              if (!dockEditor) setBattleInspectorOpen(false);
              setEditorOpen(true);
            }}
          />
        </div>
      ) : null}
      <div
        data-tutorial-dialogue-anchor=""
        style={{
          position: "absolute",
          zIndex: 30,
          top:
            !desktop &&
            view.currentAction?.action === "reveal-and-play-opponent-card"
              ? undefined
              : (dialogueAnchor?.top ?? 0),
          right: desktop ? undefined : token("--gutter"),
          bottom:
            !desktop &&
            view.currentAction?.action === "reveal-and-play-opponent-card"
              ? `calc(var(${SAFE_AREA_INSET_PROPERTIES.bottom}) + ${token("--space-12")})`
              : undefined,
          left: desktop ? (dialogueAnchor?.left ?? 0) : token("--gutter"),
          transform:
            !desktop &&
            view.currentAction?.action ===
              "reveal-and-play-opponent-card" &&
            renderedDialogue?.kind === "guide"
              ? `translateY(${String(renderedDialogue.verticalOffset ?? 0)}px)`
              : undefined,
          display: "flex",
          justifyContent: "flex-start",
          maxWidth:
            desktop && renderedDialogue?.kind === "guide"
              ? (renderedDialogue.bubbleWidth ?? 700)
              : undefined,
          visibility:
            !desktop &&
            view.currentAction?.action === "reveal-and-play-opponent-card"
              ? "visible"
              : dialogueAnchor === null
                ? "hidden"
                : "visible",
          pointerEvents: "none",
        }}
      >
        {renderedDialogue?.kind !== "guide" ? null : (
          <CharacterDialogue
            dialogue={renderedDialogue.model}
            size={desktop ? "prominent" : "compact"}
            visible={
              sceneEntered &&
              view.dialogue?.kind === "guide" &&
              view.playbackRunId !== null &&
              dialogueActionId !== null &&
              visibleDialogueActionKey ===
                `${view.playbackRunId}:${dialogueActionId}`
            }
            testId="tutorial-welcome-dialogue"
            playbackSpeed={playbackSpeed}
          />
        )}
      </div>
      {renderedDialogue?.kind === "dreamcaller" ? (
        <TutorialDreamcallerDialogue
          dialogue={renderedDialogue}
          visible={
            sceneEntered &&
            view.dialogue?.kind === "dreamcaller" &&
            view.playbackRunId !== null &&
            dialogueActionId !== null &&
            visibleDialogueActionKey ===
              `${view.playbackRunId}:${dialogueActionId}`
          }
          layoutKey={`${String(dockEditor)}:${String(editorOpen)}`}
          desktop={desktop}
        />
      ) : null}
      {!dockEditor && editorOpen && editorSurface !== null ? (
        <TutorialEditorTakeover {...editorSurface} />
      ) : null}
      {howToPlayVisible && view.howToPlay !== null ? (
        <TutorialHowToPlayDialog
          text={view.howToPlay.text}
          companion={howToPlayCompanion}
          cardWidth={
            view.howToPlay.cardWidth ??
            TUTORIAL_HOW_TO_PLAY_DESKTOP_PANEL_WIDTH
          }
          onClose={closeHowToPlay}
        />
      ) : null}
      </motion.main>
    </MotionConfig>
  );
}
