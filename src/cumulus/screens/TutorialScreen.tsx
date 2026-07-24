import { motion, useReducedMotion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { GLYPHS } from "../primitives/glyph";
import { IconButton } from "../components/controls/IconButton";
import {
  ENERGY_ICON_CLASS,
  ENERGY_ICON_COLOR,
  GlowIcon,
} from "../components/controls/GlowIcon";
import type { BattleStatusDreamcallerProfile } from "../components/battle/BattleStatusDisplay";
import { CardBack } from "../components/battle/CardBack";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../components/battle/DreamwellCard";
import { GameCard } from "../components/card/CardView";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  BATTLEFIELD_CARD_CORNER_RADIUS,
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
import { MOBILE_BATTLE_INSPECTOR_RAIL_TRACK } from "./mobile-battle-layout";
import type {
  TutorialAction,
  TutorialDreamcallerOwner,
  TutorialEditorSaveStatus,
  TutorialHowToPlayTrigger,
} from "../../types/tutorial";
import {
  parseTutorialInstructionMarkup,
  type TutorialInstructionParagraph,
} from "../../data/tutorial-instruction-markup";

export interface TutorialDreamcallerView {
  readonly visual: DreamcallerVisual;
  readonly profile: BattleStatusDreamcallerProfile;
  readonly settled: boolean;
}

export type TutorialDialogueView =
  | {
      readonly kind: "guide";
      readonly verticalOffset: number;
      readonly model: CharacterDialogueModel;
    }
  | {
      readonly kind: "dreamcaller";
      readonly owner: TutorialDreamcallerOwner;
      readonly speakerName: string;
      readonly text: string;
    };

export interface TutorialView {
  readonly battle: MobileBattleView;
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
}

export interface TutorialEditorView {
  readonly actions: readonly TutorialAction[];
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: string | null;
}

export interface TutorialScreenProps {
  readonly view: TutorialView;
  readonly editor?: TutorialEditorView;
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

interface TutorialRepositionGuideGeometry {
  readonly targetFrame: TutorialCardFrame;
  readonly targetSlotId: string;
}

const TUTORIAL_FADE_SECONDS = motionTimeSeconds("--dur-loading-screen-fade");
const TUTORIAL_CARD_TRAVEL_SECONDS = motionTimeSeconds("--dur-slow");
const TUTORIAL_EDITOR_DOCK_MIN_WIDTH = 1280;
const TUTORIAL_REVEAL_CARD_DESKTOP_WIDTH = 240;
const TUTORIAL_REVEAL_CARD_MOBILE_WIDTH_RATIO = 0.45;
// The popup panel is a content-driven desktop box measure. GlassDialog adds
// --space-5 body padding on each side around this intrinsic content width.
const TUTORIAL_HOW_TO_PLAY_DESKTOP_PANEL_WIDTH = 500;
// The pointer overlaps the portrait rim so it visibly connects to the frame.
const TUTORIAL_PORTRAIT_POINTER_OVERLAP = 2;

function TutorialRepositionGuide({
  screen,
  cardId,
  opposingCardId,
  accessibleLabel,
  onTargetSlotChange,
}: {
  readonly screen: HTMLElement;
  readonly cardId: string;
  readonly opposingCardId: string;
  readonly accessibleLabel: string;
  readonly onTargetSlotChange: (slotId: string | null) => void;
}): ReactElement | null {
  const [geometry, setGeometry] =
    useState<TutorialRepositionGuideGeometry | null>(null);

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
      setGeometry(null);
      onTargetSlotChange(null);
      return undefined;
    }

    const updateGeometry = (): void => {
      const screenBox = screen.getBoundingClientRect();
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
        setGeometry(null);
        onTargetSlotChange(null);
        return;
      }
      const targetBox = targetSlot.getBoundingClientRect();
      const next = {
        targetFrame: {
          x: targetBox.left - screenBox.left,
          y: targetBox.top - screenBox.top,
          width: targetBox.width,
          height: targetBox.height,
        },
        targetSlotId,
      };
      setGeometry((current) =>
        current?.targetFrame.x === next.targetFrame.x &&
        current.targetFrame.y === next.targetFrame.y &&
        current.targetFrame.width === next.targetFrame.width &&
        current.targetFrame.height === next.targetFrame.height &&
        current.targetSlotId === next.targetSlotId
          ? current
          : next,
      );
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

  if (geometry === null) return null;
  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      data-tutorial-reposition-guide=""
      data-tutorial-block-target-slot={geometry.targetSlotId}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: token("--layer-reveal"),
        pointerEvents: "none",
      }}
    >
      <div
        data-tutorial-block-target-highlight=""
        style={{
          position: "absolute",
          top: geometry.targetFrame.y,
          left: geometry.targetFrame.x,
          width: geometry.targetFrame.width,
          height: geometry.targetFrame.height,
          boxSizing: "border-box",
          borderRadius: BATTLEFIELD_CARD_CORNER_RADIUS,
          outline: `${token("--space-1")} solid ${token("--positive")}`,
          outlineOffset: `calc(-1 * ${token("--space-1")})`,
          boxShadow: `0 0 ${token("--space-7")} ${token("--positive")}`,
        }}
      />
    </div>
  );
}

function TutorialHowToPlayDialog({
  text,
  companion,
  onClose,
}: {
  readonly text: string;
  readonly companion: DreamwellCardModel | null;
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
  const inlineIconStyle = {
    display: "inline-flex",
    alignItems: "center",
    columnGap: token("--space-2"),
    whiteSpace: "nowrap",
  } as const;
  const parenthesizedIconStyle = {
    display: "inline-flex",
    alignItems: "center",
    whiteSpace: "nowrap",
  } as const;
  const inlineEnergyIconStyle = {
    display: "inline-flex",
    width: "1em",
    height: "1em",
    verticalAlign: "middle",
    transform: "translateY(-0.08em)",
  } as const;
  const paragraphs = parseTutorialInstructionMarkup(text);

  const renderInstructionText = (instruction: string): ReactElement => {
    const tokens = instruction.split(
      /(\b(?:points|spark)\s+\(\s*[⍟✦]\s*\)|\(\s*[⍟✦●]\s*\)|\d+\s+⍟|[⍟✦●])/giu,
    );
    return (
      <>
        {tokens.map((part, index) => {
          const resourceTerm =
            /^(points|spark)\s+\(\s*([⍟✦])\s*\)$/iu.exec(part);
          if (resourceTerm !== null) {
            const points = resourceTerm[2] === "⍟";
            return (
              <span
                key={index}
                {...(points
                  ? { "data-tutorial-how-to-play-points-term": "" }
                  : { "data-tutorial-how-to-play-spark-term": "" })}
                style={parenthesizedIconStyle}
              >
                {resourceTerm[1]} (
                <GlowIcon
                  iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
                  color={points ? "text-primary" : "spark"}
                />
                )
              </span>
            );
          }
          const compact = part.replace(/\s/gu, "");
          if (
            compact === "(⍟)" ||
            compact === "(✦)" ||
            compact === "(●)"
          ) {
            if (compact === "(●)") {
              return (
                <span
                  key={index}
                  data-tutorial-how-to-play-energy-term=""
                  style={parenthesizedIconStyle}
                >
                  (
                  <span style={inlineEnergyIconStyle}>
                    <GlowIcon
                      iconClass={ENERGY_ICON_CLASS}
                      color={ENERGY_ICON_COLOR}
                      title="energy"
                    />
                  </span>
                  )
                </span>
              );
            }
            const points = compact === "(⍟)";
            return (
              <span
                key={index}
                {...(points
                  ? { "data-tutorial-how-to-play-points-term": "" }
                  : { "data-tutorial-how-to-play-spark-term": "" })}
                style={parenthesizedIconStyle}
              >
                (
                <GlowIcon
                  iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
                  color={points ? "text-primary" : "spark"}
                />
                )
              </span>
            );
          }
          const pointsValue = /^(\d+)\s+⍟$/u.exec(part);
          if (pointsValue !== null) {
            return (
              <span key={index} style={inlineIconStyle}>
                {pointsValue[1]}
                <GlowIcon
                  iconClass={GLYPHS.points}
                  color="text-primary"
                  title="points"
                />
              </span>
            );
          }
          if (part === "⍟" || part === "✦") {
            const points = part === "⍟";
            return (
              <span key={index} style={parenthesizedIconStyle}>
                <GlowIcon
                  iconClass={points ? GLYPHS.points : GLYPHS.sparkInline}
                  color={points ? "text-primary" : "spark"}
                  title={points ? "points" : "spark"}
                />
              </span>
            );
          }
          if (part === "●") {
            return (
              <span key={index} style={inlineEnergyIconStyle}>
                <GlowIcon
                  iconClass={ENERGY_ICON_CLASS}
                  color={ENERGY_ICON_COLOR}
                  title="energy"
                />
              </span>
            );
          }
          return part;
        })}
      </>
    );
  };

  const renderInstructionParagraph = (
    paragraph: TutorialInstructionParagraph,
  ): ReactElement => (
    <>
      {paragraph.spans.map((span, index) =>
        span.highlight === "yellow" ? (
          <span
            key={index}
            data-tutorial-instruction-highlight="yellow"
            style={{ color: token("--spark") }}
          >
            {renderInstructionText(span.text)}
          </span>
        ) : (
          <span key={index}>{renderInstructionText(span.text)}</span>
        ),
      )}
    </>
  );

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
            ? `calc(${String(TUTORIAL_HOW_TO_PLAY_DESKTOP_PANEL_WIDTH)}px - ${token("--space-5")} - ${token("--space-5")})`
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
            {renderInstructionParagraph(paragraph)}
          </p>
        ))}
      </div>
    </GlassDialog>
  );
}

function tutorialOpponentBackRankIndex(slotCount: number): number {
  return Math.max(0, Math.floor(slotCount / 2) - 1);
}

function tutorialOpponentFrontRankIndex(slotCount: number): number {
  return Math.max(0, Math.floor(slotCount / 2));
}

function expandedTutorialSide(
  side: MobileBattleSideView,
  owner: "enemy" | "player",
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
  const backRank = pad(side.backRank, 10, "back");
  const existingCard = side.backRank.find((slot) => slot.card !== null)?.card;
  const centeredBackRank =
    existingCard === undefined || existingCard === null
      ? backRank
      : backRank.map((slot, index, slots) => ({
          ...slot,
          card:
            index === tutorialOpponentBackRankIndex(slots.length)
              ? existingCard
              : null,
        }));
  const frontRank = pad(side.frontRank, 9, "front");
  const existingFrontCard = side.frontRank.find(
    (slot) => slot.card !== null,
  )?.card;
  const centeredFrontRank =
    existingFrontCard === undefined || existingFrontCard === null
      ? frontRank
      : frontRank.map((slot, index, slots) => ({
          ...slot,
          card:
            index === tutorialOpponentFrontRankIndex(slots.length)
              ? existingFrontCard
              : null,
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
  const backRank = battle.enemy.backRank.map((slot, index, slots) => ({
    ...slot,
    card:
      index === tutorialOpponentBackRankIndex(slots.length) ? card : slot.card,
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
      const top = targetEdgeY - pointer.y;
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
  }, [desktop, dialogue.owner, layoutKey]);

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
        maxWidth: desktop ? 300 : 220,
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
  onComplete,
}: {
  readonly screen: HTMLElement;
  readonly card: MobileBattleCardView;
  readonly revealDuration: number;
  readonly reduceMotion: boolean;
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
    const destination =
      enemyBack[tutorialOpponentBackRankIndex(enemyBack.length)];
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

  const travelDuration = reduceMotion ? 0 : TUTORIAL_CARD_TRAVEL_SECONDS;
  const totalDuration = travelDuration * 2 + revealDuration;
  const revealStart = totalDuration === 0 ? 0 : travelDuration / totalDuration;
  const revealEnd =
    totalDuration === 0 ? 1 : (travelDuration + revealDuration) / totalDuration;
  const times = [0, revealStart, revealEnd, 1];
  const frames = reduceMotion
    ? [trajectory.reveal, trajectory.reveal]
    : [
        trajectory.source,
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
          exhausted={card.exhausted}
          testId="tutorial-opponent-card-reveal"
        />
      ) : (
        <div style={{ position: "absolute", inset: 0 }}>
          <motion.div
            data-tutorial-card-full-layer=""
            initial={{ opacity: 1 }}
            animate={{ opacity: 0 }}
            transition={{
              delay: travelDuration + revealDuration,
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
              initial={{ rotateY: 0 }}
              animate={{ rotateY: [0, 180, 180, 180] }}
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
                  exhausted={card.exhausted}
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
              delay: travelDuration + revealDuration,
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

/** Standalone tutorial battle presentation entered from the loading scene. */
export function TutorialScreen({
  view,
  editor,
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
  const [howToPlayPresentedActionKey, setHowToPlayPresentedActionKey] = useState<
    string | null
  >(null);
  const [howToPlayDismissedActionKey, setHowToPlayDismissedActionKey] = useState<
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
            pause: view.currentAction.pause,
            duration: view.currentAction.duration,
            dreamcaller: view.dreamcallers[view.currentAction.owner],
          }
        : null,
    [view.currentAction, view.dreamcallers, view.playbackRunId],
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
    if (
      view.playbackRunId === null ||
      view.currentAction?.action !== "reveal-and-play-opponent-card"
    ) {
      return null;
    }
    const card = view.battle.enemyHand[0];
    return card === undefined
      ? null
      : {
          key: `${view.playbackRunId}:${view.currentAction.id}`,
          card,
          revealDuration: view.currentAction.revealDuration,
        };
  }, [view.battle.enemyHand, view.currentAction, view.playbackRunId]);
  const dreamcallerSettled = useCallback(
    (owner: TutorialDreamcallerOwner): boolean =>
      view.dreamcallers[owner].settled ||
      (dreamcallerArrival?.owner === owner &&
        arrivedActionKey === dreamcallerArrival.key),
    [arrivedActionKey, dreamcallerArrival, view.dreamcallers],
  );

  const battleView = useMemo<MobileBattleView>(() => {
    const sourceBattle = desktop
      ? {
          ...view.battle,
          enemy: expandedTutorialSide(view.battle.enemy, "enemy"),
          player: expandedTutorialSide(view.battle.player, "player"),
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
      howToPlayPresentedActionKey === actionKey ||
      howToPlayDismissedActionKey === actionKey
    ) {
      return;
    }
    setHowToPlayPresentedActionKey(actionKey);
    onHowToPlayPresented?.(runId, howToPlay.actionId, howToPlay.trigger);
  }, [
    completedTurnAnnouncementSide,
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
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [onActionComplete, sceneEntered, view.currentAction, view.playbackRunId]);

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
      (TUTORIAL_CARD_TRAVEL_SECONDS + wait) * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    drawnActionKey,
    onActionComplete,
    opponentCardDraw,
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
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    completedTurnAnnouncementSide,
    onActionComplete,
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
      view.playbackRunId === null
    ) {
      return undefined;
    }
    const { id, wait } = view.currentAction;
    const runId = view.playbackRunId;
    const timeout = window.setTimeout(
      () => onActionComplete?.(runId, id),
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    onActionComplete,
    opponentCardPlay,
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
      (TUTORIAL_CARD_TRAVEL_SECONDS + wait) * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [onActionComplete, sceneEntered, view.currentAction, view.playbackRunId]);

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
      howToPlay.wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    howToPlayDismissedActionKey,
    onActionComplete,
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
      wait * 1_000,
    );
    return () => window.clearTimeout(timeout);
  }, [
    arrivedActionKey,
    dreamcallerArrival,
    onActionComplete,
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
    <motion.main
      ref={screenRef}
      className="cumulus"
      data-tutorial-screen=""
      initial={{ opacity: reduceMotion ? 1 : 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : TUTORIAL_FADE_SECONDS }}
      onAnimationComplete={() => setSceneEntered(true)}
      style={{
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
            viewport="contained"
            inspectorDefault="collapsed"
            inspectorOpen={battleInspectorOpen}
            onInspectorOpenChange={handleBattleInspectorOpenChange}
            onTurnAnnouncementComplete={completeTurnAnnouncement}
            phaseNavigation={canEndTurn ? "end-turn" : "hidden"}
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
          onComplete={completeOpponentCardPlay}
        />
      ) : null}
      {sceneEntered &&
      playerReposition !== null &&
      repositionSourceCard !== null &&
      repositionOpposingCard !== null &&
      screenRef.current !== null ? (
        <TutorialRepositionGuide
          screen={screenRef.current}
          cardId={playerReposition.cardId}
          opposingCardId={playerReposition.opposingCardId}
          accessibleLabel={`Drag ${repositionSourceCard.model.displaySnapshot.name} to block ${repositionOpposingCard.model.displaySnapshot.name}.`}
          onTargetSlotChange={setRepositionTargetSlotId}
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
          top: dialogueAnchor?.top ?? 0,
          right: desktop ? undefined : token("--gutter"),
          bottom: undefined,
          left: desktop ? (dialogueAnchor?.left ?? 0) : token("--gutter"),
          display: "flex",
          justifyContent: "flex-start",
          visibility: dialogueAnchor === null ? "hidden" : "visible",
          pointerEvents: "none",
        }}
      >
        {renderedDialogue?.kind !== "guide" ? null : (
          <CharacterDialogue
            dialogue={renderedDialogue.model}
            size={desktop ? "prominent" : "compact"}
            visible={sceneEntered && view.dialogue?.kind === "guide"}
            testId="tutorial-welcome-dialogue"
          />
        )}
      </div>
      {renderedDialogue?.kind === "dreamcaller" ? (
        <TutorialDreamcallerDialogue
          dialogue={renderedDialogue}
          visible={sceneEntered && view.dialogue?.kind === "dreamcaller"}
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
          onClose={closeHowToPlay}
        />
      ) : null}
    </motion.main>
  );
}
