import type { DomTestId } from "../types/dom";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import {
  GameCard,
  type GameCardModel,
  type GameCardSelection,
} from "../components/card/CardView";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import { renderRulesSymbolsInline } from "../components/card/RulesText";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  BATTLEFIELD_CARD_CORNER_RADIUS,
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
} from "../components/card/card-aspect";
import { BattleStatusDisplay } from "../components/battle/BattleStatusDisplay";
import type { BattleStatusBadgeView } from "../components/battle/BattleStatusBadges";
import { BattlePhaseIndicator } from "../components/battle/BattlePhaseIndicator";
import {
  BattlefieldCard,
  type BattlefieldCardInteraction,
} from "../components/battle/BattlefieldCard";
import type { BattleStatusAvatarProfile } from "../components/battle/BattleStatusDisplay";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../components/battle/DreamwellCard";
import { CardBack } from "../components/battle/CardBack";
import { CardPile, type BattlePileCard } from "../components/battle/CardPile";
import {
  BATTLE_HAND_CARD_HOVER_SCALE,
  battleCardLayoutId,
} from "../components/battle/battle-card-layout";
import { GlassButton } from "../components/controls/GlassButton";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { IconButton } from "../components/controls/IconButton";
import { NumberStepper } from "../components/controls/NumberStepper";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { GlassBackdrop, GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { DeveloperRail } from "../components/overlay/DeveloperRail";
import { TransientStatusToast } from "../components/status/TransientStatusToast";
import { builtInBattlePromptMessage } from "../../runtime/battle-prompt-messages";
import { builtInBattlePromptRef } from "../../data/dreamwell-prompts";
import {
  RADIAL_ANNOUNCEMENT_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import type { AvatarVisual } from "../components/hud/AvatarPortrait";
import { GLYPHS } from "../primitives/glyph";
import { Pressable } from "../primitives/Pressable";
import { DOUBLE_TAP_WINDOW_MS } from "../primitives/pointer-gesture";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import {
  BATTLE_HUD_END_CLEARANCE_PROPERTY,
  BATTLE_HUD_START_CLEARANCE_PROPERTY,
} from "../primitives/battle-hud-layout";
import {
  DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS,
  MOBILE_BATTLE_INSPECTOR_RAIL_TRACK,
} from "./mobile-battle-layout";
import {
  DESKTOP_PLAY_AREA_HEIGHT_PERCENT,
  battlefieldCardSize,
  battlefieldDensityBackSlotCount,
  battlefieldTrackWidth,
  desktopBattlefieldLayoutBackSlotCount,
  desktopControlCardSize,
  findBattleCardView,
  mobileBattlefieldDensity,
  mobileBattlefieldWindow,
  visibleMobileRankSlots,
  visibleRankSlots,
} from "./battle-board/layout";
import {
  closestOpenBackRankSlot,
  dropMobileCardAtPoint,
  findSlotElement,
  sameSlotTarget,
  slotTargetFromElement,
  slotTargetIsEligible,
} from "./battle-board/drop-resolution";
import { useSharedFields } from "./battle-board/structural-sharing";
import { useIsDesktop } from "../primitives/use-is-desktop";
import {
  BattleResultSurface,
  type MobileBattleResultAction,
  type MobileBattleResultView,
} from "./BattleResultSurface";
import battleBackgroundUrl from "../assets/battle-background.png";
import type { BattleForeseeResult } from "../components/battle/BattleForeseeEditor";
import {
  BattlePromptHost,
  BattlePromptNumberPicker,
  type BattlePromptHostView,
} from "./battle-overlays/BattlePromptHost";
import type { BattleId } from "../../types/identifiers";
import type { PresentationId, PromptId } from "../../types/identifiers";
import type { BattleCardId } from "../../types/identifiers";
import type { BattleSlotViewId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import { formatNumber } from "../../runtime/format-number";

export { BATTLEFIELD_CARD_EXHAUSTED_FILTER } from "../components/battle/BattlefieldCard";
const CARD_PICKER_HIGHLIGHT_SELECTION: GameCardSelection = "highlighted";
const CARD_PICKER_SELECTION: GameCardSelection = "selected";
/** No cards: one array, so a memoized region sees an unchanged prop. */
const NO_CARD_IDS: readonly BattleCardId[] = [];
const NO_CARDS: readonly MobileBattleCardView[] = [];

/** One physical face-up card instance rendered by the battle board. */
export interface MobileBattleCardView {
  readonly id: BattleCardId;
  readonly model: GameCardModel;
  readonly exhausted: boolean;
  readonly figment: boolean;
  /** Whether this rendered location should participate in shared-layout travel. */
  readonly layoutMotion?: "travel" | "snap";
  /** Stored-time counters held by this battle instance. */
  readonly storedTime: number;
  /** Lasting statuses shown as badges on the battlefield card. */
  readonly statuses?: readonly BattleStatusBadgeView[];
  /** Draw the green playable-card outline on this hand card. */
  readonly showPlayableOutline: boolean;
}

/** A stable battlefield position which may currently be empty. */
export interface MobileBattleSlotView {
  readonly id: BattleSlotViewId;
  readonly card: MobileBattleCardView | null;
}

/** The compact resources and Avatar identity shown for one side. */
export interface MobileBattleStatusView {
  readonly avatar: AvatarVisual | null;
  readonly avatarProfile?: BattleStatusAvatarProfile;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly points: number;
  readonly pointsToWin: number;
  /** Lasting statuses of this side, shown as badges under its status display. */
  readonly statuses?: readonly BattleStatusBadgeView[];
}

/** Every zone owned by one side of the battle. */
export interface MobileBattleSideView {
  readonly owner: MobileBattleOwner;
  readonly position: BattleBoardPosition;
  readonly deckCardIds: readonly BattleCardId[];
  readonly banishedCardCount: number;
  readonly voidCards: readonly MobileBattleCardView[];
  readonly backRank: readonly MobileBattleSlotView[];
  readonly frontRank: readonly MobileBattleSlotView[];
  readonly status: MobileBattleStatusView;
}

export type BattlePerspectiveSide = MobileBattleOwner;
export type BattleBoardPosition = "near" | "far";

export interface MobileBattleHandView {
  readonly owner: MobileBattleOwner;
  readonly position: BattleBoardPosition;
  readonly cardIds: readonly BattleCardId[];
  /** Face-up models available to the current local viewer. */
  readonly cards: readonly MobileBattleCardView[];
}

export interface MobileBattlePromptNoticeView {
  readonly promptSide: MobileBattleOwner;
  /**
   * Why the local viewer waits: the prompt belongs to the other seat of a
   * shared screen (the default), the opponent is answering a prompt, or the
   * opponent is taking an action.
   */
  readonly reason?: "switch-side" | "opponent-choosing" | "opponent-acting";
}

/** Which repositioning shortcuts can move at least one of the near side's characters. */
export interface MobileBattleRankShortcutsView {
  readonly allForward: boolean;
  readonly allBack: boolean;
}

/** The complete, presentation-ready mobile battle board. */
export type MobileBattlePhase = "dawn" | "day" | "dusk" | "night" | "challenge";

/** The active side's Dreamwell card while its reveal phase is surfaced. */
export interface MobileBattleDreamwellView {
  readonly side: MobileBattleOwner;
  readonly model: DreamwellCardModel;
}

export interface MobileBattleView {
  readonly battleId: BattleId;
  readonly perspective: BattlePerspectiveSide;
  readonly near: MobileBattleSideView;
  readonly far: MobileBattleSideView;
  readonly nearHand: MobileBattleHandView;
  readonly farHand: MobileBattleHandView;
  readonly promptNotice: MobileBattlePromptNoticeView | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly choicePrompt: MobileBattleChoicePromptView | null;
  readonly dreamwell: MobileBattleDreamwellView | null;
  readonly activeSide: MobileBattleOwner;
  readonly isOpeningTurn: boolean;
  readonly phase: MobileBattlePhase;
  readonly enemyHandCardIds: readonly BattleCardId[];
  readonly enemyHand: readonly MobileBattleCardView[];
  readonly enemy: MobileBattleSideView;
  readonly player: MobileBattleSideView;
  readonly playerHand: readonly MobileBattleCardView[];
  readonly inspector: MobileBattleInspectorView;
  readonly result: MobileBattleResultView | null;
  /** One shared hand card presented over the battlefield at reading size. */
  readonly revealedHandCard?: MobileBattleCardView | null;
  /**
   * The opponent's card being played, at reading size: it arrives from the
   * opponent's hand or void and, once this clears, travels to where the
   * board shows it.
   */
  readonly playReveal?: MobileBattlePlayRevealView | null;
  /** The prompt host's heading, number picker, arrangement, loop offer, and notices. */
  readonly promptHost?: BattlePromptHostView | null;
  /** All Forward and All Back, when the near side may reposition. */
  readonly rankShortcuts?: MobileBattleRankShortcutsView | null;
}

/** A played card presented at reading size before it travels to its destination. */
export interface MobileBattlePlayRevealView {
  readonly card: MobileBattleCardView;
  /** The zone it was played from, where its reveal starts. */
  readonly from: "hand" | "void";
}

export type MobileBattlePromptCopy = string;
/** Identifies one prompt; local selection resets when it changes. */
export type MobileBattlePromptKey = number | PromptId;

/** A UUID-safe card decision owned by the authoritative battle prompt. */
export interface MobileBattleCardPickerView {
  readonly key: MobileBattlePromptKey;
  readonly label: MobileBattlePromptCopy;
  readonly subtitle?: MobileBattlePromptCopy;
  readonly side: MobileBattleOwner;
  readonly candidateOwner?: MobileBattleOwner | null;
  readonly candidates: readonly MobileBattleCardPickerCandidateView[];
  readonly candidateIds: readonly BattleCardId[];
  /** The most cards a submission holds. */
  readonly count: number;
  /**
   * The fewest cards a submission holds, at least one: an empty answer is
   * the Skip control of an `optional` picker. Defaults to `count`.
   */
  readonly minCount?: number;
  readonly optional: boolean;
  readonly canResolve: boolean;
  readonly presentation: "board" | "gallery";
  /**
   * The gallery offers Cancel (`onPromptCancel`) beside its one answer
   * control: the play awaiting it may still be cancelled.
   */
  readonly cancellable?: boolean;
}

/** How many cards a picker submission may hold: `max` is capped by its candidates. */
function cardPickerBounds(cardPicker: MobileBattleCardPickerView): { readonly min: number; readonly max: number } {
  const max = Math.min(cardPicker.count, cardPicker.candidateIds.length);
  return { min: Math.min(Math.max(cardPicker.minCount ?? max, 1), max), max };
}

/** Whether `selected` cards make a submittable picker answer. */
function canSubmitCardPicker(cardPicker: MobileBattleCardPickerView, selected: number): boolean {
  const { min, max } = cardPickerBounds(cardPicker);
  return cardPicker.canResolve && selected >= min && selected <= max;
}

/** One UUID-backed physical candidate in an authoritative card prompt. */
export interface MobileBattleCardPickerCandidateView {
  readonly instanceId: BattleCardId;
  readonly cardUuid: CardId;
  readonly owner: MobileBattleOwner;
  readonly zone:
    | "hand"
    | "deck"
    | "void"
    | "banished"
    | "backRank"
    | "frontRank"
    | "stack";
  readonly card: MobileBattleCardView;
  readonly highlighted: boolean;
}

/** An in-place option decision owned by the authoritative battle prompt. */
export interface MobileBattleChoicePromptView {
  readonly key: MobileBattlePromptKey;
  readonly label: MobileBattlePromptCopy;
  readonly options: readonly {
    readonly label: MobileBattlePromptCopy;
  }[];
  readonly canResolve: boolean;
}

export interface MobileBattleScreenProps {
  readonly view: MobileBattleView;
  readonly interactions?: MobileBattleInteractions;
  /** One short-lived resource result attached to its physical battlefield card. */
  readonly cardOverlay?: MobileBattleCardOverlayView | null;
  /**
   * Whether this screen owns the shared-layout scope for physical cards or
   * participates in a scope supplied by a composing parent.
   */
  readonly cardLayoutGroup?: "owned" | "inherited";
  /** One battlefield destination emphasized for a guided interaction. */
  readonly guidedSlotHighlight?: {
    readonly owner: MobileBattleOwner;
    readonly rank: MobileBattleRank;
    readonly slotId: BattleSlotViewId;
    readonly label: string;
  };
  /** Keep dotted slot shells beneath occupied cards during an occupant transition. */
  readonly preserveOccupiedSlotOutlines?: boolean;
  /** Initial inspector state at desktop widths. */
  readonly inspectorDefault?: "responsive" | "collapsed";
  /**
   * Phase controls exposed by this presentation: Back and Next Phase
   * (`both`), Next Phase alone (`next-phase`), Pass alone (`pass`), the
   * tutorial's turn controls, or none.
   */
  readonly phaseNavigation?:
    | "both"
    | "next-phase"
    | "pass"
    | "end-turn"
    | "tutorial"
    | "hidden";
  /** Visible labels exposed for otherwise unmarked battle zones. */
  readonly zoneLabels?: "none" | "voids";
  /** Optional controlled inspector state for a parent shell with another rail. */
  readonly inspectorOpen?: boolean;
  /** Reports inspector disclosure changes in controlled compositions. */
  readonly onInspectorOpenChange?: (open: boolean) => void;
  /** Reports when a turn announcement has finished displaying. */
  readonly onTurnAnnouncementComplete?: (side: MobileBattleOwner) => void;
  /** Multiplier applied to automated presentation timing in this battle view. */
  readonly playbackSpeed?: number;
  /** Fill a positioned parent instead of owning the browser viewport. */
  readonly viewport?: "fixed" | "contained";
  /** Hides operator-only inspector controls on focused player battle surfaces. */
  readonly inspectorVisibility?: "available" | "hidden";
}

/** A presentation that must remain spatially attached to one battlefield card. */
export interface MobileBattleCardOverlayView {
  readonly kind: "points-scored";
  readonly presentationId: PresentationId;
  readonly battleCardId: BattleCardId;
  readonly points: number;
}

export type MobileBattleOwner = "enemy" | "player";
export type MobileBattleRank = "back" | "front";
export type MobileBattleCardSource = "near-hand" | "battlefield";
export type MobileBattleDropZone = "deck" | "hand" | "void";
export type MobileBattleBrowseZone = "deck" | "void" | "banished";
export type MobileBattleDebugAdjustment = -1 | 1;

function BattleCardLayoutGroup({
  battleId,
  ownership,
  children,
}: {
  readonly battleId: BattleId;
  readonly ownership: "owned" | "inherited";
  readonly children: ReactNode;
}) {
  return ownership === "owned" ? (
    <LayoutGroup id={`mobile-battle:${battleId}`}>{children}</LayoutGroup>
  ) : (
    <>{children}</>
  );
}

export interface MobileBattleInspectorSideView {
  readonly side: MobileBattleOwner;
  readonly heading: "Player" | "Enemy";
  readonly points: number;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly zones: {
    readonly hand: number;
    readonly deck: number;
    readonly void: number;
    readonly banished: number;
    readonly backRank: number;
    readonly frontRank: number;
  };
  readonly canDiscard: boolean;
  readonly canShuffle: boolean;
}

export interface MobileBattleInspectorView {
  readonly opponentName: string;
  readonly perspective: MobileBattleOwner;
  readonly turn: string;
  readonly phase: string;
  readonly activeSide: string;
  readonly result: string;
  readonly nextDreamwellOrder: string;
  readonly isOpponentHandRevealed: boolean;
  readonly isPlayerHandHidden: boolean;
  readonly isFarHandRevealed: boolean;
  readonly isNearHandHidden: boolean;
  readonly sides: Readonly<
    Record<MobileBattleOwner, MobileBattleInspectorSideView>
  >;
}

export type MobileBattleInspectorAction =
  | {
      readonly kind: "opened";
      readonly layout: "docked" | "takeover";
      readonly side: MobileBattleOwner;
    }
  | { readonly kind: "side-selected"; readonly side: MobileBattleOwner }
  | {
      readonly kind: "adjust-stat";
      readonly side: MobileBattleOwner;
      readonly stat: "points" | "currentEnergy" | "maxEnergy";
      readonly amount: MobileBattleDebugAdjustment;
    }
  | {
      readonly kind: "adjust-energy-pair";
      readonly side: MobileBattleOwner;
      readonly amount: MobileBattleDebugAdjustment;
    }
  | {
      readonly kind:
        | "draw"
        | "discard"
        | "foresee"
        | "shuffle"
        | "reorder-deck"
        | "dreamwell-draw"
        | "create-figment";
      readonly side: MobileBattleOwner;
    }
  | {
      readonly kind: "open-zone";
      readonly side: MobileBattleOwner;
      readonly zone: MobileBattleBrowseZone;
    }
  | {
      readonly kind: "erode";
      readonly side: MobileBattleOwner;
      readonly count: number;
    }
  | {
      readonly kind:
        | "open-battle-log"
        | "open-dreamwell-history"
        | "open-pool-viewer"
        | "toggle-opponent-hand"
        | "toggle-player-hand"
        | "skip-to-rewards"
        | "reset-battle";
    }
  | { readonly kind: "force-result"; readonly result: "defeat" | "draw" };

export type MobileBattleDebugInvocation =
  | { readonly presentation: "sheet" }
  | {
      readonly presentation: "context-menu";
      readonly x: number;
      readonly y: number;
    };

export interface MobileBattleSlotTarget {
  readonly owner: MobileBattleOwner;
  readonly rank: MobileBattleRank;
  readonly slotId: BattleSlotViewId;
}

/** One occupied slot whose relationship to the dragged figment is rules-owned. */
export interface MobileBattleFigmentMergeTarget {
  readonly sourceBattleCardId: BattleCardId;
  readonly destinationBattleCardId: BattleCardId;
  readonly target: MobileBattleSlotTarget;
  readonly figmentLabel: string;
  readonly status: "eligible" | "blocked-exhaustion";
  readonly addedSpark: number;
  readonly requiresConfirmation: boolean;
}

export interface MobileBattleDropCandidate {
  readonly target: MobileBattleSlotTarget;
  readonly eligible: boolean;
  readonly rect: {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
    readonly centerX: number;
    readonly centerY: number;
  };
  readonly deltaX: number;
  readonly deltaY: number;
  readonly distanceSquared: number;
  readonly containsRelease: boolean;
  readonly containsPlacement: boolean;
  readonly edgeDistanceSquared: number;
}

export interface MobileBattleDropResolution {
  readonly releasePoint: {
    readonly clientX: number;
    readonly clientY: number;
  };
  readonly placementPoint: {
    readonly clientX: number;
    readonly clientY: number;
  };
  readonly candidates: readonly MobileBattleDropCandidate[];
  readonly chosenTarget: MobileBattleSlotTarget | null;
  readonly strategy: "direct-hit" | "nearest-center" | "none";
}

export interface MobileBattleDropRejection {
  readonly reason:
    | "battlefield-unavailable"
    | "invalid-release-point"
    | "no-eligible-slot"
    | "ineligible-slot"
    | "source-slot";
  readonly clientX: number;
  readonly clientY: number;
}

export interface MobileBattleZoneTarget {
  readonly owner: MobileBattleOwner;
  readonly zone: MobileBattleDropZone;
}

export interface MobileBattleBrowseZoneTarget {
  readonly owner: MobileBattleOwner;
  readonly zone: MobileBattleBrowseZone;
}

/** Intent-only gesture bridge owned by the live battle controller. */
export interface MobileBattleInteractions {
  readonly canInteract: boolean;
  /** The player may answer the pending prompt; defaults to `canInteract`. */
  readonly canPrompt?: boolean;
  readonly nearSide?: MobileBattleOwner;
  readonly pendingCardId: BattleCardId | null;
  readonly pendingCardSource?: MobileBattleCardSource | null;
  readonly pendingCardOwner?: MobileBattleOwner | null;
  /** Battlefield ranks the current gesture may use; every rendered cell in an allowed rank participates. */
  readonly eligibleSlotRanks?: readonly MobileBattleRank[];
  /** The current cell, excluded from repositioning candidates. */
  readonly sourceSlotTarget?: MobileBattleSlotTarget | null;
  /** Exact cells accepted by a battlefield drag. */
  readonly eligibleSlotTargets?: readonly MobileBattleSlotTarget[];
  /** Canonical rules predicate for whether the exact rendered cell is legal. */
  readonly isSlotDropEligible?: (target: MobileBattleSlotTarget) => boolean;
  /** Occupied cells that merge with the pending figment instead of swapping. */
  readonly figmentMergeTargets?: readonly MobileBattleFigmentMergeTarget[];
  /** A tutorial play awaiting a legal battlefield target. */
  readonly targetSelectionCardId?: BattleCardId | null;
  readonly targetSelectionPrompt?: "legal-target" | null;
  readonly targetableCardIds?: readonly BattleCardId[];
  readonly onHandCardActivate: (battleCardId: BattleCardId) => void;
  readonly onBattlefieldCardActivate?: (battleCardId: BattleCardId) => void;
  readonly onTargetSelectionCancel?: () => void;
  readonly onHandCardDrop?: (target?: MobileBattleSlotTarget) => void;
  readonly onCardDebugActivate?: (
    battleCardId: BattleCardId,
    source: MobileBattleCardSource,
    invocation: MobileBattleDebugInvocation,
  ) => void;
  readonly onRevealedHandCardDebugActivate?: (
    battleCardId: BattleCardId,
    invocation: MobileBattleDebugInvocation,
  ) => void;
  readonly onCardDragStart: (
    battleCardId: BattleCardId,
    source: MobileBattleCardSource,
  ) => void;
  readonly onCardDragEnd: () => void;
  readonly onSlotDrop: (target: MobileBattleSlotTarget) => void;
  /** Commits a confirmed figment merge by stable battle-instance identity. */
  readonly onFigmentMerge?: (
    sourceBattleCardId: BattleCardId,
    target: MobileBattleSlotTarget,
  ) => void;
  readonly onBattlefieldDropRejected?: (
    rejection: MobileBattleDropRejection,
  ) => void;
  readonly onBattlefieldDropResolved?: (
    resolution: MobileBattleDropResolution,
  ) => void;
  readonly onZoneDrop: (target: MobileBattleZoneTarget) => void;
  readonly onZoneOpen?: (target: MobileBattleBrowseZoneTarget) => void;
  /** The side whose status display opens its Avatar and Dreamsign abilities, while it has any. */
  readonly activatableStatusOwner?: MobileBattleOwner | null;
  readonly onStatusActivate?: (owner: MobileBattleOwner) => void;
  readonly onPreviousPhase?: () => void;
  readonly onNextPhase: () => void;
  /** Cancels the play or activation awaiting the prompt host's prompt. */
  readonly onPromptCancel?: () => void;
  /** Answers the prompt host's number picker. */
  readonly onPromptNumberSubmit?: (value: number) => void;
  /** Answers the prompt host's arrangement. */
  readonly onPromptArrangeSubmit?: (result: BattleForeseeResult) => void;
  /** Dismisses the prompt host's notice. */
  readonly onPromptNoticeDismiss?: () => void;
  /** Opens the battle log; the log control shows only with this handler. */
  readonly onBattleLogOpen?: () => void;
  /** Moves every eligible near-side back-rank character forward. */
  readonly onAllForward?: () => void;
  /** Moves every near-side front-rank character back. */
  readonly onAllBack?: () => void;
  /** Repeats the loop on offer a number of times, or until the battle ends. */
  readonly onRepeatLoop?: (count: number | "untilVictory") => void;
  readonly onCardPickerSelectionChange?: (
    chosenIds: readonly BattleCardId[],
  ) => void;
  readonly onCardPickerSubmit?: (chosenIds: readonly BattleCardId[]) => void;
  readonly onCardPickerSkip?: () => void;
  readonly onChoicePromptChoose?: (optionIndex: number) => void;
  readonly onPerspectiveToggle?: () => void;
  readonly onResultAction?: (action: MobileBattleResultAction) => void;
  readonly onFillBattlefieldPreview?: () => void;
  readonly onFillAsymmetricBattlefieldPreview?: () => void;
  readonly onInspectorAction?: (action: MobileBattleInspectorAction) => void;
}

function toggleCardPickerSelection(
  selectedIds: readonly BattleCardId[],
  cardId: BattleCardId,
  count: number,
): BattleCardId[] {
  if (selectedIds.includes(cardId)) {
    return selectedIds.filter((selectedId) => selectedId !== cardId);
  }
  if (selectedIds.length < count) {
    return [...selectedIds, cardId];
  }
  return count === 1 ? [cardId] : [...selectedIds];
}

function pickerCandidate(
  cardPicker: MobileBattleCardPickerView | null,
  instanceId: BattleCardId,
): MobileBattleCardPickerCandidateView | null {
  return (
    cardPicker?.candidates.find(
      (candidate) => candidate.instanceId === instanceId,
    ) ?? null
  );
}

const ENEMY_HAND_VISIBLE_CARD_CAP = 6;
const DESKTOP_BATTLEFIELD_SIDE_INSET_PERCENT = 14;
const FIGMENT_MERGE_ANIMATION_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const FIGMENT_MERGE_NOTICE_MS = motionTimeSeconds("--dur-slow") * 4 * 1_000;
const BATTLE_OVERLAY_CSS = `
  body:has([data-radial-announcement]) [data-cumulus-reveal-portal] {
    visibility: hidden;
  }

  body:has([data-battle-tutorial-guidance]) [data-cumulus-reveal-portal] {
    display: none;
  }

`;
// The status keeps its content-driven width while the two physical piles share
// the remaining room. This leaves a stable gap between all three objects and
// lets the phase controls size independently below the battlefield.
const SIDE_ZONES_GRID_TEMPLATE = "minmax(0, 1fr) max-content minmax(0, 1fr)";
const SIDE_PILE_MAX_WIDTH = 90;
// Desktop keeps the three status objects in one centered landscape dock so
// the wide viewport creates deliberate outer whitespace instead of stretching
// the mobile spacing rhythm edge-to-edge.
const DESKTOP_SIDE_ZONES_WIDTH = 540;
const DESKTOP_SIDE_PILE_MAX_WIDTH = 120;
const DESKTOP_SIDE_PILE_HEIGHT =
  DESKTOP_SIDE_PILE_MAX_WIDTH * CARD_ASPECT_RATIO_VALUE;
const DESKTOP_SIDE_ZONE_MIN_CLEARANCE = token("--space-m");
const DESKTOP_SIDE_ZONE_SHIFT = `max(0px, calc(${DESKTOP_SIDE_ZONE_MIN_CLEARANCE} - 5.5vh + ${String(DESKTOP_SIDE_PILE_HEIGHT / 2)}px))`;
const NEXT_PHASE_CONTROL_WIDTH = 120;
// The mobile hand fans about the row's centre, its card centres up to 50%
// of the row apart and its outer cards tilted 6° each way, so the outer
// cards' top corners stay inside the row and every card's uncovered strip
// stays on screen.
const MOBILE_HAND_FAN_SPREAD = 50;
const MOBILE_HAND_FAN_SPACING = 18;
/** Degrees between the mobile fan's outer cards' tilts. */
const MOBILE_HAND_FAN_ROTATION = 12;
// Canonical full-card reading size, constrained on narrow screens so the
// shared reveal stays fully visible beside the battlefield.
const SHARED_HAND_CARD_REVEAL_WIDTH = "min(240px, 45vw)";
const PLAYER_HAND_Z_INDEX = 15;
// A pending event remains a tangible card while leaving both the hand fan and
// the playable ranks clear for target selection.
const TARGETING_CARD_STAGE_WIDTH = 54;
const DESKTOP_TARGETING_CARD_STAGE_WIDTH = 64;
const BATTLEFIELD_RANK_Z_INDEX = {
  back: 1,
  front: 2,
  dragging: 4,
} as const;
const BATTLEFIELD_CHALLENGER_PLAY_AREA_Z_INDEX =
  BATTLEFIELD_RANK_Z_INDEX.dragging + 2;
// The Dreamwell extends outside its transformed side-zone row, so that row
// must clear both battlefield-rank stacking contexts while the card is visible.
const DREAMWELL_SIDE_ZONE_Z_INDEX = BATTLEFIELD_RANK_Z_INDEX.dragging + 1;
// This layer orders the Dreamwell above its status/phase siblings inside the
// side-zone row. DREAMWELL_SIDE_ZONE_Z_INDEX owns board-wide ordering.
const DREAMWELL_WITHIN_SIDE_ZONE_Z_INDEX = 12;
// Mobile player zones share the hand track and lift one spacing step above it.
// Desktop gives both sides matching rows immediately outside the play areas.
const PLAYER_HAND_TOP = `calc(${token("--space-6xl")} - ${token("--space-xl")} + ${token("--space-xs")})`;

const MOBILE_GRID_ROWS =
  "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) minmax(0, 12fr) minmax(0, 27fr)";
const DESKTOP_GRID_ROWS = `minmax(0, 8fr) minmax(0, 11fr) minmax(0, ${String(DESKTOP_PLAY_AREA_HEIGHT_PERCENT)}fr) minmax(0, ${String(DESKTOP_PLAY_AREA_HEIGHT_PERCENT)}fr) minmax(0, 11fr) minmax(0, 24fr)`;
const BATTLEFIELD_CENTER_OFFSET = token("--space-m");

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100%",
  height: "100dvh",
  boxSizing: "border-box",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows: MOBILE_GRID_ROWS,
  paddingTop: `var(${SAFE_AREA_INSET_PROPERTIES.top})`,
  paddingRight: `var(${SAFE_AREA_INSET_PROPERTIES.right})`,
  paddingBottom: `var(${SAFE_AREA_INSET_PROPERTIES.bottom})`,
  paddingLeft: `var(${SAFE_AREA_INSET_PROPERTIES.left})`,
  backgroundColor: token("--bg-app"),
  touchAction: "none",
};

function rootStyle(isDesktop: boolean): CSSProperties {
  return {
    ...ROOT_STYLE,
    gridTemplateRows: isDesktop ? DESKTOP_GRID_ROWS : MOBILE_GRID_ROWS,
  };
}

function BattleBackdrop({ isDesktop }: { readonly isDesktop: boolean }) {
  return (
    <div
      aria-hidden="true"
      data-battle-backdrop=""
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: isDesktop ? "100vh" : "100%",
        height: isDesktop ? "100vw" : "100%",
        transform: isDesktop
          ? "translate(-50%, -50%) rotate(90deg)"
          : "translate(-50%, -50%)",
        transformOrigin: "center",
        backgroundImage: `url("${battleBackgroundUrl}")`,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "100% 100%",
        pointerEvents: "none",
      }}
    />
  );
}

function BattleTurnAnnouncement({
  activeSide,
  perspective,
  isDesktop,
  onComplete,
  playbackSpeed,
}: {
  readonly activeSide: MobileBattleOwner;
  readonly perspective: BattlePerspectiveSide;
  readonly isDesktop: boolean;
  readonly onComplete?: (side: MobileBattleOwner) => void;
  readonly playbackSpeed: number;
}) {
  const sequence = useRef(1);
  const previousSide = useRef(activeSide);
  const onCompleteRef = useRef(onComplete);
  const [announcement, setAnnouncement] = useState<{
    readonly key: number;
    readonly side: MobileBattleOwner;
  } | null>(null);

  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (previousSide.current === activeSide) return;
    previousSide.current = activeSide;
    setAnnouncement({ key: sequence.current, side: activeSide });
    sequence.current += 1;
  }, [activeSide]);

  useEffect(() => {
    if (announcement === null) return;
    const announcementKey = announcement.key;
    const announcementSide = announcement.side;
    const timeout = window.setTimeout(() => {
      setAnnouncement((current) =>
        current?.key === announcementKey ? null : current,
      );
      onCompleteRef.current?.(announcementSide);
    }, RADIAL_ANNOUNCEMENT_DURATION_MS / playbackSpeed);
    return () => window.clearTimeout(timeout);
  }, [announcement, playbackSpeed]);

  if (announcement === null) return null;

  const label =
    announcement.side === perspective
      ? "Your Turn"
      : "Opponent Turn";
  return (
    <RadialAnnouncement
      key={announcement.key}
      headline={label}
      size={isDesktop ? "standard" : "compact"}
      tone="accent"
      announcementId={announcement.side}
    />
  );
}

function FigmentMergeTargetIndicator({
  target,
}: {
  readonly target: MobileBattleFigmentMergeTarget;
}) {
  const blocked = target.status === "blocked-exhaustion";
  return blocked ? (
    <RadialAnnouncement
      variant="merge-target"
      status="blocked"
      announcementId={`merge-target:${target.destinationBattleCardId}`}
    />
  ) : (
    <RadialAnnouncement
      variant="merge-target"
      status="available"
      addedSpark={target.addedSpark}
      announcementId={`merge-target:${target.destinationBattleCardId}`}
    />
  );
}

interface FigmentMergeAnimationState {
  readonly key: number;
  readonly sourceCard: MobileBattleCardView;
  readonly sourceRect: DOMRect;
  readonly targetRect: DOMRect;
  readonly target: MobileBattleFigmentMergeTarget;
}

function FigmentMergeAnimation({
  animation,
}: {
  readonly animation: FigmentMergeAnimationState;
}) {
  
  const reduceMotion = useReducedMotion();
  const deltaX = animation.targetRect.left - animation.sourceRect.left;
  const deltaY = animation.targetRect.top - animation.sourceRect.top;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${animation.target.figmentLabel} merged and gained ${formatNumber(animation.target.addedSpark)} Spark`}
      data-battle-figment-merge-animation=""
      data-battle-figment-merge-source={animation.target.sourceBattleCardId}
      data-battle-figment-merge-destination={
        animation.target.destinationBattleCardId
      }
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        pointerEvents: "none",
      }}
    >
      <motion.div
        initial={reduceMotion ? false : { opacity: 1, scale: 1, x: 0, y: 0 }}
        animate={
          reduceMotion
            ? { opacity: 0 }
            : {
                opacity: [1, 0.92, 0],
                scale: [1, 0.68, 0.16],
                x: [0, deltaX, deltaX],
                y: [0, deltaY, deltaY],
                rotate: [0, 4, 14],
              }
        }
        transition={{
          duration: reduceMotion ? 0 : FIGMENT_MERGE_ANIMATION_SECONDS,
          ease: "easeInOut",
          times: reduceMotion ? undefined : [0, 0.72, 1],
        }}
        style={{
          position: "absolute",
          left: animation.sourceRect.left,
          top: animation.sourceRect.top,
          width: animation.sourceRect.width,
          height: animation.sourceRect.height,
          transformOrigin: "50% 50%",
        }}
      >
        <GameCard
          model={animation.sourceCard.model}
          hideRulesText
          exhausted={animation.sourceCard.exhausted}
          presentation="battlefield"
          figment
          testId={`battle-figment-merge-traveler:${animation.sourceCard.id}`}
        />
      </motion.div>
      <motion.div
        aria-hidden="true"
        data-battle-figment-merge-impact=""
        initial={reduceMotion ? false : { opacity: 0, scale: 0.54 }}
        animate={
          reduceMotion
            ? { opacity: 0 }
            : { opacity: [0, 0.86, 0], scale: [0.54, 1.18, 1.42] }
        }
        transition={{
          duration: reduceMotion ? 0 : FIGMENT_MERGE_ANIMATION_SECONDS,
          ease: "easeOut",
          times: reduceMotion ? undefined : [0, 0.72, 1],
        }}
        style={{
          position: "absolute",
          left: animation.targetRect.left,
          top: animation.targetRect.top,
          width: animation.targetRect.width,
          height: animation.targetRect.height,
          border: `${token("--space-xxs")} solid ${token("--border-accent")}`,
          borderRadius: BATTLEFIELD_CARD_CORNER_RADIUS,
          boxShadow: token("--glow-accent-soft"),
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

const SAFE_AREA_BACKDROP_STYLE: CSSProperties = {
  position: "absolute",
  inset: "0 0 auto",
  height: `var(${SAFE_AREA_INSET_PROPERTIES.top})`,
  background: token("--bg-app"),
  pointerEvents: "none",
};

const ROW_STYLE: CSSProperties = {
  position: "relative",
  minWidth: 0,
  minHeight: 0,
};

function centeredFanPosition(params: {
  index: number;
  count: number;
  maximumSpread: number;
  spacing: number;
}): { left: string; normalized: number } {
  const { index, count, maximumSpread, spacing } = params;
  if (count <= 1) return { left: "50%", normalized: 0 };
  const spread = Math.min(maximumSpread, (count - 1) * spacing);
  const normalized = index / (count - 1) - 0.5;
  return {
    left: `${String(50 + normalized * spread)}%`,
    normalized,
  };
}

const FarHand = memo(function FarHand({
  owner,
  cardIds,
  cards,
  revealed,
  isDesktop,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
}: {
  readonly owner: MobileBattleOwner;
  readonly cardIds: readonly BattleCardId[];
  readonly cards: readonly MobileBattleCardView[];
  readonly revealed: boolean;
  readonly isDesktop: boolean;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly onPickerCardToggle: (cardId: BattleCardId) => void;
}) {
  const farHandCandidates =
    cardPicker?.candidates.filter(
      (candidate) => candidate.owner === owner && candidate.zone === "hand",
    ) ?? [];
  const pickerCandidateIds = new Set(
    farHandCandidates.map((candidate) => candidate.instanceId),
  );
  const importantCardIds = new Set([
    ...cards.map((card) => card.id),
    ...farHandCandidates.map((candidate) => candidate.instanceId),
  ]);
  const visibleCardIds = cardIds.filter(
    (cardId, index) =>
      index < ENEMY_HAND_VISIBLE_CARD_CAP || importantCardIds.has(cardId),
  );
  return (
    <div
      data-battle-mobile-row="far-hand"
      data-battle-hand-owner={owner}
      data-battle-hand-count={cardIds.length}
      data-battle-hand-visible-count={visibleCardIds.length}
      style={{
        ...ROW_STYLE,
        gridRow: 1,
        overflow: "hidden",
        display: isDesktop ? "flex" : undefined,
        alignItems: isDesktop ? "flex-start" : undefined,
        justifyContent: isDesktop ? "center" : undefined,
        gap: isDesktop ? token("--space-xs") : undefined,
      }}
    >
      {visibleCardIds.map((cardId, index) => {
        const candidate = pickerCandidate(cardPicker, cardId);
        const card =
          cards.find((visibleCard) => visibleCard.id === cardId) ??
          candidate?.card;
        const showFaceUp = revealed || card !== undefined || candidate !== null;
        const highlighted = candidate?.highlighted === true;
        const { left, normalized } = centeredFanPosition({
          index,
          count: visibleCardIds.length,
          maximumSpread: isDesktop ? 42 : 36,
          spacing: isDesktop ? 9 : 8,
        });
        const rotation = normalized * (isDesktop ? -8 : -12);
        const drop = normalized * normalized * (isDesktop ? 8 : 16);
        return (
          <div
            key={cardId}
            data-battle-card-id={cardId}
            data-battle-card-zone="far-hand"
            data-battle-card-face={showFaceUp ? "up" : "down"}
            data-battle-card-picker-candidate={
              pickerCandidateIds.has(cardId)
                ? "true"
                : undefined
            }
            data-battle-card-picker-selected={
              selectedPickerCardIds.includes(cardId) ? "true" : undefined
            }
            data-battle-card-picker-highlighted={
              highlighted ? "true" : undefined
            }
            style={{
              position: isDesktop ? "relative" : "absolute",
              top: 0,
              left: isDesktop ? undefined : left,
              height: "94%",
              flex: isDesktop ? "0 0 auto" : undefined,
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 0%",
              transform: isDesktop
                ? `translateY(-${String(drop)}%) rotate(${String(rotation)}deg)`
                : `translateX(-50%) translateY(-${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            {showFaceUp && card !== undefined ? (
              <BattleCardSurface
                card={card}
                zone="far-hand"
                showRulesText
                selection={
                  candidate === null
                    ? undefined
                    : {
                        selected:
                          selectedPickerCardIds.includes(cardId) || highlighted,
                        kind: selectedPickerCardIds.includes(cardId)
                          ? CARD_PICKER_SELECTION
                          : CARD_PICKER_HIGHLIGHT_SELECTION,
                      }
                }
                interaction={
                  pickerCandidateIds.has(cardId)
                    ? {
                        draggable: false,
                        debugGesture: isDesktop ? "context-menu" : "double-tap",
                        onActivate: () => onPickerCardToggle(cardId),
                      }
                    : undefined
                }
              />
            ) : (
              <motion.div
                layoutId={battleCardLayoutId(cardId)}
                data-battle-card-layout-id={battleCardLayoutId(cardId)}
                data-battle-card-motion=""
                style={{ width: "100%", height: "100%" }}
              >
                <CardBack
                  label={"Opponent card"}
                />
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
});

function toDeckPile(
  cardIds: readonly BattleCardId[],
): readonly BattlePileCard[] {
  return cardIds.map((id) => ({ face: "down", id }));
}

function toVoidPile(
  cards: readonly MobileBattleCardView[],
): readonly BattlePileCard[] {
  return cards.map((card) => ({
    face: "up",
    id: card.id,
    model: card.model,
    layoutMotion: card.layoutMotion,
    figment: card.figment,
  }));
}

const SideZones = memo(function SideZones({
  activeSide,
  dreamwell,
  isDesktop,
  owner,
  position,
  phase,
  side,
  zoneLabels,
  interactions,
}: {
  readonly activeSide: MobileBattleOwner;
  /** This side's Dreamwell card while its reveal is surfaced. */
  readonly dreamwell: MobileBattleDreamwellView | null;
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly position: BattleBoardPosition;
  readonly phase: MobileBattlePhase;
  readonly side: MobileBattleSideView;
  readonly zoneLabels: "none" | "voids";
  readonly interactions?: MobileBattleInteractions;
}) {
  const deck = toDeckPile(side.deckCardIds);
  const voidPile = toVoidPile(side.voidCards);
  const statusDisplay = (
    <BattleStatusDisplay
      owner={owner}
      relationship={position}
      avatar={side.status.avatar}
      avatarProfile={side.status.avatarProfile}
      currentEnergy={side.status.currentEnergy}
      maxEnergy={side.status.maxEnergy}
      points={side.status.points}
      pointsToWin={side.status.pointsToWin}
      statuses={side.status.statuses}
      testId={`${owner}-battle-status`}
    />
  );
  const ownsVisibleDreamwell = dreamwell?.side === owner;
  const canDrop =
    interactions?.canInteract === true &&
    interactions.pendingCardId !== null &&
    interactions.pendingCardSource !== "near-hand";
  const zoneDropProps = (zone: "deck" | "void") => ({
    "data-battle-mobile-drop-kind": "zone",
    "data-battle-mobile-drop-owner": owner,
    "data-battle-mobile-drop-zone": zone,
    "data-battle-drop-target": canDrop ? "true" : undefined,
    onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
      if (canDrop) event.preventDefault();
    },
    onDrop: (event: React.DragEvent<HTMLDivElement>) => {
      if (!canDrop) return;
      event.preventDefault();
      interactions.onZoneDrop({ owner, zone });
    },
  });
  return (
    <div
      data-battle-mobile-row={`${owner}-zones`}
      style={{
        ...ROW_STYLE,
        gridColumn: 1,
        gridRow: position === "far" ? 2 : isDesktop ? 5 : 6,
        ...(position === "near"
          ? isDesktop
            ? {
                alignSelf: "stretch",
                transform: `translateY(${DESKTOP_SIDE_ZONE_SHIFT})`,
              }
            : {
                alignSelf: "start",
                height: token("--space-6xl"),
                transform: `translateY(calc(-1 * ${token("--space-xl")}))`,
              }
          : isDesktop
            ? {
                transform: `translateY(calc(-1 * ${DESKTOP_SIDE_ZONE_SHIFT}))`,
              }
            : null),
        zIndex: ownsVisibleDreamwell
          ? DREAMWELL_SIDE_ZONE_Z_INDEX
          : position === "near"
            ? 3
            : undefined,
        display: "grid",
        gridTemplateColumns: SIDE_ZONES_GRID_TEMPLATE,
        alignItems: "center",
        justifySelf: isDesktop ? "center" : undefined,
        width: isDesktop ? "100%" : undefined,
        maxWidth: isDesktop
          ? `${String(DESKTOP_SIDE_ZONES_WIDTH)}px`
          : undefined,
        boxSizing: isDesktop ? "border-box" : undefined,
        columnGap: token(isDesktop ? "--space-6xl" : "--space-xl"),
        paddingInline: token(isDesktop ? "--space-2xl" : "--space-s"),
      }}
    >
      <div
        {...zoneDropProps("deck")}
        data-battle-zone={`${owner}-deck`}
        data-battle-zone-count={deck.length}
        data-battle-zone-top-card-id={deck[0]?.id}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: position === "near" ? "100%" : "72%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          data-battle-pile-frame=""
          style={{
            position: "relative",
            width: "100%",
            maxWidth: isDesktop
              ? DESKTOP_SIDE_PILE_MAX_WIDTH
              : SIDE_PILE_MAX_WIDTH,
          }}
        >
          <CardPile
            cards={deck}
            label={((position === "near" ? "viewer" : "opponent") === "viewer" ? "Your deck" : "Opponent’s deck")}
            onPress={
              interactions?.onZoneOpen === undefined
                ? undefined
                : () => interactions.onZoneOpen?.({ owner, zone: "deck" })
            }
            testId={`${owner}-battle-deck`}
          />
        </div>
      </div>
      <div
        data-battle-zone={`${owner}-status`}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: position === "near" ? "100%" : "82%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          data-battle-status-phase-anchor=""
          style={{
            position: "relative",
            width: "max-content",
            maxWidth: "100%",
          }}
        >
          {interactions?.activatableStatusOwner === owner &&
          interactions.canInteract &&
          interactions.onStatusActivate !== undefined ? (
            <Pressable
              as="button"
              ariaLabelMessage={"Use your Avatar and Dreamsign abilities"}
              data-battle-status-activatable={owner}
              onClick={() => interactions.onStatusActivate?.(owner)}
              style={{ display: "block", appearance: "none", padding: 0, border: 0, background: "transparent" }}
            >
              {statusDisplay}
            </Pressable>
          ) : (
            statusDisplay
          )}
          {dreamwell !== null && dreamwell.side === owner ? (
            <div
              data-battle-dreamwell-layer=""
              data-battle-dreamwell-side={dreamwell.side}
              style={{
                position: "absolute",
                left: "50%",
                top:
                  position === "far"
                    ? `calc(100% + ${token("--space-xs")})`
                    : undefined,
                bottom:
                  position === "near"
                    ? isDesktop
                      ? `calc(100% + ${token("--space-xs")})`
                      : `calc(100% + ${token("--space-xs")} + ${token("--space-6xl")} + ${token("--space-s")})`
                    : undefined,
                width: isDesktop ? 360 : "min(76vw, 340px)",
                maxWidth: "calc(100vw - 2 * var(--gutter))",
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: DREAMWELL_WITHIN_SIDE_ZONE_Z_INDEX,
                animation: "none",
                transition: "none",
              }}
            >
              <DreamwellCard model={dreamwell.model} />
            </div>
          ) : null}
          {activeSide === owner ? (
            <BattlePhaseIndicator side={position} phase={phase} />
          ) : null}
        </div>
      </div>
      <div
        {...zoneDropProps("void")}
        data-battle-zone={`${owner}-void`}
        data-battle-zone-count={voidPile.length}
        data-battle-zone-top-card-id={voidPile[0]?.id}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: position === "near" ? "100%" : "72%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          data-battle-pile-frame=""
          style={{
            width: "100%",
            maxWidth: isDesktop
              ? DESKTOP_SIDE_PILE_MAX_WIDTH
              : SIDE_PILE_MAX_WIDTH,
          }}
        >
          <CardPile
            cards={voidPile}
            label={((position === "near" ? "viewer" : "opponent") === "viewer" ? "Your void" : "Opponent’s void")}
            emptyState="outlined"
            emptyLabel={
              zoneLabels === "voids"
                ? "Void"
                : undefined
            }
            onPress={
              interactions?.onZoneOpen === undefined
                ? undefined
                : () => interactions.onZoneOpen?.({ owner, zone: "void" })
            }
            testId={`${owner}-battle-void`}
          />
        </div>
      </div>
    </div>
  );
});

interface BattleCardSurfaceInteraction {
  readonly draggable: boolean;
  readonly debugGesture: "context-menu" | "double-tap";
  readonly onActivate?: () => void;
  readonly onDebugActivate?: (invocation: MobileBattleDebugInvocation) => void;
  readonly onDragStart?: () => void;
  readonly onDragEnd?: () => void;
  readonly onPointerDrop?: (
    clientX: number,
    clientY: number,
    placementClientX: number,
    placementClientY: number,
  ) => void;
}

type MobileBattleCardSurfaceZone =
  | "far-hand"
  | "near-hand"
  | "targeting-stage"
  | "shared-reveal"
  | `${MobileBattleOwner}-${"front" | "back"}-rank`;

function BattleCardSurface({
  card,
  zone,
  showRulesText = false,
  snapLayout = false,
  challengerChevron,
  challengerPosition,
  cardOverlay,
  selection,
  interaction,
}: {
  readonly card: MobileBattleCardView;
  readonly zone: MobileBattleCardSurfaceZone;
  readonly showRulesText?: boolean;
  readonly snapLayout?: boolean;
  readonly challengerChevron?: MobileBattleOwner;
  readonly challengerPosition?: BattleBoardPosition;
  readonly cardOverlay?: MobileBattleCardOverlayView | null;
  readonly selection?: {
    readonly selected: boolean;
    readonly kind: GameCardSelection;
  };
  readonly interaction?: BattleCardSurfaceInteraction;
}) {
  const pendingTapRef = useRef<number | null>(null);
  const activate = (): void => {
    if (
      interaction?.onDebugActivate === undefined ||
      interaction.debugGesture === "context-menu"
    ) {
      interaction?.onActivate?.();
      return;
    }
    if (pendingTapRef.current !== null) {
      window.clearTimeout(pendingTapRef.current);
      pendingTapRef.current = null;
      interaction.onDebugActivate({ presentation: "sheet" });
      return;
    }
    pendingTapRef.current = window.setTimeout(() => {
      pendingTapRef.current = null;
      interaction.onActivate?.();
    }, DOUBLE_TAP_WINDOW_MS);
  };
  useEffect(
    () => () => {
      if (pendingTapRef.current !== null)
        window.clearTimeout(pendingTapRef.current);
    },
    [],
  );

  const semanticInteraction: BattlefieldCardInteraction =
    interaction?.draggable === true
      ? {
          kind: "draggable",
          ...(interaction.onActivate === undefined &&
          interaction.onDebugActivate === undefined
            ? {}
            : { onPress: activate }),
          onDragStart: () => interaction.onDragStart?.(),
          onDragEnd: () => interaction.onDragEnd?.(),
          onDrop: (drop) =>
            interaction.onPointerDrop?.(
              drop.clientX,
              drop.clientY,
              drop.placementClientX,
              drop.placementClientY,
            ),
        }
      : interaction?.onActivate !== undefined ||
          interaction?.onDebugActivate !== undefined
        ? { kind: "pressable", onPress: activate }
        : { kind: "passive" };

  return (
    <div
      data-battle-card-zone={zone}
      data-battle-card-playable={card.showPlayableOutline ? "true" : undefined}
      style={{ width: "100%", position: "relative" }}
      onContextMenu={(event) => {
        if (
          interaction?.debugGesture !== "context-menu" ||
          interaction.onDebugActivate === undefined
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        interaction.onDebugActivate({
          presentation: "context-menu",
          x: event.clientX,
          y: event.clientY,
        });
      }}
    >
      <BattlefieldCard
        model={{
          battleCardId: card.id,
          card: card.model,
          exhausted: card.exhausted,
          storedMemory: card.storedTime,
          statuses: card.statuses,
          figment: card.figment,
          selection:
            selection === undefined
              ? card.showPlayableOutline
                ? "playable"
                : undefined
              : selection.selected
                ? selection.kind
                : undefined,
          challengeMarker:
            challengerChevron === undefined || challengerPosition === undefined
              ? undefined
              : { owner: challengerChevron, side: challengerPosition },
          scoreAnnouncement:
            cardOverlay?.battleCardId === card.id
              ? {
                  points: cardOverlay.points,
                  presentationId: cardOverlay.presentationId,
                }
              : undefined,
          motion:
            snapLayout || card.layoutMotion === "snap" ? "snap" : "travel",
          presentation: showRulesText ? "full" : "battlefield",
        }}
        interaction={semanticInteraction}
      />
    </div>
  );
}

const Rank = memo(function Rank({
  isDesktop,
  owner,
  position,
  rank,
  slots,
  mobileSlotCount,
  mobileStartIndex,
  layoutBackSlotCount,
  densityBackSlotCount,
  centerAsymmetricDesktopRanks,
  cardSize,
  centerOffset,
  order,
  draggingCardId,
  snapLayoutCardId,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
  onBattlefieldDragChange,
  hoveredMergeTarget,
  onMergeTargetHover,
  guidedSlotHighlight,
  preserveOccupiedSlotOutlines,
  showChallengerChevrons,
  cardOverlay,
  interactions,
}: {
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly position: BattleBoardPosition;
  readonly rank: MobileBattleRank;
  readonly slots: readonly MobileBattleSlotView[];
  readonly mobileSlotCount: number;
  readonly mobileStartIndex: number;
  readonly layoutBackSlotCount: number;
  readonly densityBackSlotCount: number;
  readonly centerAsymmetricDesktopRanks: boolean;
  readonly cardSize: string;
  readonly centerOffset: string;
  readonly order: number;
  readonly draggingCardId: BattleCardId | null;
  readonly snapLayoutCardId: BattleCardId | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly onPickerCardToggle: (cardId: BattleCardId) => void;
  readonly onBattlefieldDragChange: (
    dragging: boolean,
    cardId?: BattleCardId,
  ) => void;
  readonly hoveredMergeTarget: MobileBattleFigmentMergeTarget | null;
  readonly onMergeTargetHover: (
    target: MobileBattleFigmentMergeTarget | null,
  ) => void;
  readonly guidedSlotHighlight?: MobileBattleScreenProps["guidedSlotHighlight"];
  readonly preserveOccupiedSlotOutlines?: boolean;
  readonly showChallengerChevrons: boolean;
  readonly cardOverlay?: MobileBattleCardOverlayView | null;
  readonly interactions?: MobileBattleInteractions;
}) {
  
  const canDropOnOwner =
    interactions?.canInteract === true &&
    interactions.pendingCardId !== null &&
    interactions.pendingCardSource !== "near-hand" &&
    (interactions.pendingCardOwner === null ||
      interactions.pendingCardOwner === undefined ||
      interactions.pendingCardOwner === owner);
  const desktopSlotCount =
    rank === "back"
      ? layoutBackSlotCount
      : Math.max(layoutBackSlotCount - 1, 1);
  const visibleSlots = isDesktop
    ? centerAsymmetricDesktopRanks
      ? slots
      : visibleRankSlots(slots, rank, desktopSlotCount)
    : visibleMobileRankSlots(slots, rank, mobileSlotCount, mobileStartIndex);
  const containsDraggingCard =
    draggingCardId !== null &&
    visibleSlots.some((slot) => slot.card?.id === draggingCardId);
  const trackSlotCount = Math.max(visibleSlots.length, 1);
  const isCenterFacingRank =
    (position === "far" && order === 1) || (position === "near" && order === 0);
  const density = isDesktop
    ? {
        gap: token("--space-xs"),
        sideInsetPercent: DESKTOP_BATTLEFIELD_SIDE_INSET_PERCENT,
      }
    : mobileBattlefieldDensity(densityBackSlotCount);
  const outerOffset = `calc(${cardSize} + ${density.gap} + ${centerOffset})`;
  return (
    <div
      data-battle-rank={`${owner}-${rank}`}
      data-battle-rank-order={order}
      style={{
        position: "absolute",
        left: `${String(density.sideInsetPercent)}%`,
        right: `${String(density.sideInsetPercent)}%`,
        height: cardSize,
        top:
          position === "near"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        bottom:
          position === "far"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: containsDraggingCard
          ? BATTLEFIELD_RANK_Z_INDEX.dragging
          : BATTLEFIELD_RANK_Z_INDEX[rank],
      }}
    >
      <div
        data-battle-rank-track=""
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: battlefieldTrackWidth(trackSlotCount, cardSize, density.gap),
          height: cardSize,
          display: "grid",
          gridTemplateColumns: `repeat(${String(trackSlotCount)}, ${cardSize})`,
          gridAutoColumns: cardSize,
          gridAutoFlow: "column",
          columnGap: density.gap,
        }}
      >
        {visibleSlots.map((slot) => {
          const slotCard = slot.card;
          const slotTarget = { owner, rank, slotId: slot.id } as const;
          const canDrop =
            canDropOnOwner &&
            interactions !== undefined &&
            slotTargetIsEligible(interactions, slotTarget);
          const mergeTarget =
            interactions?.figmentMergeTargets?.find((candidateTarget) =>
              sameSlotTarget(candidateTarget.target, slotTarget),
            ) ?? null;
          const mergeTargetHovered =
            mergeTarget !== null &&
            hoveredMergeTarget !== null &&
            sameSlotTarget(mergeTarget.target, hoveredMergeTarget.target);
          const candidate =
            slot.card === null
              ? null
              : pickerCandidate(cardPicker, slot.card.id);
          const isPickerSelected =
            slot.card !== null && selectedPickerCardIds.includes(slot.card.id);
          const isPickerHighlighted = candidate?.highlighted === true;
          return (
            <div
              key={slot.id}
              data-battle-slot-id={slot.id}
              data-battle-slot-filled={slot.card !== null ? "true" : "false"}
              data-battle-mobile-drop-kind="slot"
              data-battle-mobile-drop-owner={owner}
              data-battle-mobile-drop-rank={rank}
              data-battle-mobile-drop-slot-id={slot.id}
              data-battle-drop-target={canDrop ? "true" : undefined}
              data-battle-figment-merge-target={
                mergeTarget === null
                  ? undefined
                  : mergeTargetHovered
                    ? mergeTarget.status === "eligible"
                      ? "hovered"
                      : "blocked"
                    : "candidate"
              }
              data-battle-card-picker-candidate={
                candidate === null ? undefined : "true"
              }
              data-battle-card-picker-selected={
                isPickerSelected ? "true" : undefined
              }
              data-battle-card-picker-highlighted={
                isPickerHighlighted ? "true" : undefined
              }
              onDragOver={(event) => {
                if (!canDrop) return;
                event.preventDefault();
                onMergeTargetHover(mergeTarget);
              }}
              onDragLeave={(event) => {
                if (
                  mergeTargetHovered &&
                  !event.currentTarget.contains(
                    event.relatedTarget as Node | null,
                  )
                ) {
                  onMergeTargetHover(null);
                }
              }}
              onDrop={(event) => {
                if (!canDrop) return;
                event.preventDefault();
                interactions.onSlotDrop(slotTarget);
              }}
              style={{
                position: "relative",
                width: cardSize,
                aspectRatio: BATTLEFIELD_CARD_ASPECT_RATIO,
                boxSizing: "border-box",
              }}
            >
              {slot.card === null ||
              slot.card.id === draggingCardId ||
              preserveOccupiedSlotOutlines === true ? (
                <div
                  aria-hidden="true"
                  data-battle-slot-outline=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    borderRadius: BATTLEFIELD_CARD_CORNER_RADIUS,
                    border: token("--battlefield-slot-border"),
                    boxSizing: "border-box",
                    pointerEvents: "none",
                    zIndex:
                      preserveOccupiedSlotOutlines === true &&
                      slot.card !== null &&
                      slot.card.id !== draggingCardId
                        ? 0
                        : 3,
                  }}
                />
              ) : null}
              {guidedSlotHighlight?.owner === owner &&
              guidedSlotHighlight.rank === rank &&
              guidedSlotHighlight.slotId === slot.id ? (
                <div
                  role="img"
                  aria-label={guidedSlotHighlight.label}
                  data-battle-guided-slot-highlight=""
                  data-battle-guided-slot-id={slot.id}
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    zIndex: 4,
                    boxSizing: "border-box",
                    borderRadius: BATTLEFIELD_CARD_CORNER_RADIUS,
                    outline: `${token("--space-xxs")} solid ${token("--positive")}`,
                    outlineOffset: `calc(-1 * ${token("--space-xxs")})`,
                    boxShadow: `0 0 ${token("--space-xl")} ${token("--positive")}`,
                  }}
                />
              ) : null}
              {slotCard !== null ? (
                <BattleCardSurface
                  card={slotCard}
                  zone={`${owner}-${rank}-rank`}
                  snapLayout={snapLayoutCardId === slotCard.id}
                  challengerChevron={
                    showChallengerChevrons &&
                    rank === "front" &&
                    slotCard.model.displaySnapshot.cardType === "Character"
                      ? owner
                      : undefined
                  }
                  challengerPosition={position}
                  cardOverlay={cardOverlay}
                  selection={
                    candidate === null
                      ? interactions?.targetSelectionCardId === slotCard.id ||
                        interactions?.targetableCardIds?.includes(slotCard.id)
                        ? { selected: true, kind: "highlighted" }
                        : undefined
                      : {
                          selected: isPickerSelected || isPickerHighlighted,
                          kind: isPickerSelected
                            ? CARD_PICKER_SELECTION
                            : CARD_PICKER_HIGHLIGHT_SELECTION,
                        }
                  }
                  interaction={
                    candidate !== null
                      ? {
                          draggable: false,
                          debugGesture: isDesktop
                            ? "context-menu"
                            : "double-tap",
                          onActivate: () =>
                            onPickerCardToggle(candidate.instanceId),
                        }
                      : interactions === undefined
                        ? undefined
                        : {
                            draggable: interactions.canInteract,
                            debugGesture: isDesktop
                              ? "context-menu"
                              : "double-tap",
                            onDragStart: () => {
                              onBattlefieldDragChange(true, slotCard.id);
                              interactions.onCardDragStart(
                                slotCard.id,
                                "battlefield",
                              );
                            },
                            onActivate:
                              interactions.onBattlefieldCardActivate ===
                              undefined
                                ? undefined
                                : () =>
                                    interactions.onBattlefieldCardActivate?.(
                                      slotCard.id,
                                    ),
                            ...(interactions.onCardDebugActivate === undefined
                              ? {}
                              : {
                                  onDebugActivate: (invocation) =>
                                    interactions.onCardDebugActivate?.(
                                      slotCard.id,
                                      "battlefield",
                                      invocation,
                                    ),
                                }),
                            onDragEnd: () => {
                              onBattlefieldDragChange(false);
                              interactions.onCardDragEnd();
                            },
                            onPointerDrop: (
                              clientX,
                              clientY,
                              placementClientX,
                              placementClientY,
                            ) =>
                              dropMobileCardAtPoint(
                                interactions,
                                clientX,
                                clientY,
                                placementClientX,
                                placementClientY,
                              ),
                          }
                  }
                />
              ) : null}
              {mergeTargetHovered && mergeTarget !== null ? (
                <FigmentMergeTargetIndicator target={mergeTarget} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
});

function PlayArea({
  isDesktop,
  owner,
  position,
  side,
  mobileWindow,
  layoutBackSlotCount,
  densityBackSlotCount,
  centerAsymmetricDesktopRanks,
  cardSize,
  centerOffset,
  draggingCardId,
  snapLayoutCardId,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
  onBattlefieldDragChange,
  hoveredMergeTarget,
  onMergeTargetHover,
  guidedSlotHighlight,
  preserveOccupiedSlotOutlines,
  allowSharedLayoutOverflow,
  showChallengerChevrons,
  cardOverlay,
  interactions,
}: {
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly position: BattleBoardPosition;
  readonly side: MobileBattleSideView;
  readonly mobileWindow: ReturnType<typeof mobileBattlefieldWindow>;
  readonly layoutBackSlotCount: number;
  readonly densityBackSlotCount: number;
  readonly centerAsymmetricDesktopRanks: boolean;
  readonly cardSize: string;
  readonly centerOffset: string;
  readonly draggingCardId: BattleCardId | null;
  readonly snapLayoutCardId: BattleCardId | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly onPickerCardToggle: (cardId: BattleCardId) => void;
  readonly onBattlefieldDragChange: (
    dragging: boolean,
    cardId?: BattleCardId,
  ) => void;
  readonly hoveredMergeTarget: MobileBattleFigmentMergeTarget | null;
  readonly onMergeTargetHover: (
    target: MobileBattleFigmentMergeTarget | null,
  ) => void;
  readonly guidedSlotHighlight?: MobileBattleScreenProps["guidedSlotHighlight"];
  readonly preserveOccupiedSlotOutlines?: boolean;
  readonly allowSharedLayoutOverflow: boolean;
  readonly showChallengerChevrons: boolean;
  readonly cardOverlay?: MobileBattleCardOverlayView | null;
  readonly interactions?: MobileBattleInteractions;
}) {
  const ranks =
    position === "far"
      ? ([
          ["back", side.backRank],
          ["front", side.frontRank],
        ] as const)
      : ([
          ["front", side.frontRank],
          ["back", side.backRank],
        ] as const);
  return (
    <div
      data-battle-mobile-row={`${owner}-play-area`}
      data-battle-play-area={owner}
      style={{
        ...ROW_STYLE,
        gridColumn: 1,
        gridRow: position === "far" ? 3 : 4,
        overflow:
          showChallengerChevrons || allowSharedLayoutOverflow
            ? "visible"
            : "hidden",
        zIndex: showChallengerChevrons
          ? BATTLEFIELD_CHALLENGER_PLAY_AREA_Z_INDEX
          : undefined,
        containerType: "size",
      }}
    >
      {ranks.map(([rank, slots], order) => (
        <Rank
          key={rank}
          isDesktop={isDesktop}
          owner={owner}
          position={position}
          rank={rank}
          slots={slots}
          mobileSlotCount={
            rank === "back"
              ? mobileWindow.backSlotCount
              : mobileWindow.frontSlotCount
          }
          mobileStartIndex={mobileWindow.startIndex}
          layoutBackSlotCount={layoutBackSlotCount}
          densityBackSlotCount={densityBackSlotCount}
          centerAsymmetricDesktopRanks={centerAsymmetricDesktopRanks}
          cardSize={cardSize}
          centerOffset={centerOffset}
          order={order}
          draggingCardId={draggingCardId}
          snapLayoutCardId={snapLayoutCardId}
          cardPicker={cardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={onPickerCardToggle}
          onBattlefieldDragChange={onBattlefieldDragChange}
          hoveredMergeTarget={hoveredMergeTarget}
          onMergeTargetHover={onMergeTargetHover}
          guidedSlotHighlight={guidedSlotHighlight}
          preserveOccupiedSlotOutlines={preserveOccupiedSlotOutlines}
          showChallengerChevrons={showChallengerChevrons}
          cardOverlay={cardOverlay}
          interactions={interactions}
        />
      ))}
    </div>
  );
}

const NearHand = memo(function NearHand({
  owner,
  cards,
  totalCount,
  isDesktop,
  snapLayoutCardId,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
  onCardDragChange,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly cards: readonly MobileBattleCardView[];
  readonly totalCount: number;
  readonly isDesktop: boolean;
  readonly snapLayoutCardId: BattleCardId | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly onPickerCardToggle: (cardId: BattleCardId) => void;
  readonly onCardDragChange: (dragging: boolean, cardId?: BattleCardId) => void;
  readonly interactions?: MobileBattleInteractions;
}) {
  const pickerCandidateIds = new Set(cardPicker?.candidateIds ?? []);
  const canDrop =
    cardPicker === null &&
    interactions?.canInteract === true &&
    interactions.pendingCardId !== null &&
    interactions.pendingCardSource !== "near-hand";
  return (
    <div
      data-battle-mobile-row="near-hand"
      data-battle-hand-owner={owner}
      data-battle-hand-count={totalCount}
      data-battle-hand-visible-count={cards.length}
      data-battle-hand-card-hover-scale={String(BATTLE_HAND_CARD_HOVER_SCALE)}
      data-battle-mobile-drop-kind="zone"
      data-battle-mobile-drop-owner={owner}
      data-battle-mobile-drop-zone="hand"
      data-battle-drop-target={canDrop ? "true" : undefined}
      onDragOver={(event) => {
        if (canDrop) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        interactions.onZoneDrop({ owner, zone: "hand" });
      }}
      style={{
        ...ROW_STYLE,
        gridColumn: 1,
        gridRow: 6,
        zIndex: PLAYER_HAND_Z_INDEX,
        pointerEvents: "none",
        overflow:
          interactions?.pendingCardId !== undefined &&
          interactions.pendingCardId !== null
            ? "visible"
            : "hidden",
        display: isDesktop ? "flex" : undefined,
        alignItems: isDesktop ? "flex-start" : undefined,
        justifyContent: isDesktop ? "center" : undefined,
        gap: isDesktop ? token("--space-xs") : undefined,
        paddingTop: isDesktop ? token("--space-2xl") : undefined,
        paddingRight: isDesktop
          ? `calc(var(${BATTLE_HUD_END_CLEARANCE_PROPERTY}, 0px) + ${token("--space-2xl")})`
          : undefined,
        paddingLeft: isDesktop
          ? `calc(var(${BATTLE_HUD_START_CLEARANCE_PROPERTY}, 0px) + ${token("--space-2xl")})`
          : undefined,
        transform: isDesktop
          ? `translateY(${token("--space-2xl")})`
          : undefined,
        boxSizing: isDesktop ? "border-box" : undefined,
      }}
    >
      {cards.map((card, index) => {
        const candidate = pickerCandidate(cardPicker, card.id);
        const isPickerCandidate = pickerCandidateIds.has(card.id);
        const isPickerSelected = selectedPickerCardIds.includes(card.id);
        const isPickerHighlighted = candidate?.highlighted === true;
        const { left, normalized } = centeredFanPosition({
          index,
          count: cards.length,
          maximumSpread: isDesktop ? 72 : MOBILE_HAND_FAN_SPREAD,
          spacing: isDesktop ? 16 : MOBILE_HAND_FAN_SPACING,
        });
        const rotation =
          normalized * (isDesktop ? 8 : MOBILE_HAND_FAN_ROTATION);
        const drop = normalized * normalized * (isDesktop ? 8 : 18);
        const cardContent = (
          <BattleCardSurface
            card={card}
            zone="near-hand"
            showRulesText
            snapLayout={snapLayoutCardId === card.id}
            selection={
              cardPicker === null
                ? undefined
                : {
                    selected: isPickerSelected || isPickerHighlighted,
                    kind: isPickerSelected
                      ? CARD_PICKER_SELECTION
                      : CARD_PICKER_HIGHLIGHT_SELECTION,
                  }
            }
            interaction={
              cardPicker !== null
                ? isPickerCandidate
                  ? {
                      draggable: false,
                      debugGesture: isDesktop ? "context-menu" : "double-tap",
                      onActivate: () => onPickerCardToggle(card.id),
                    }
                  : undefined
                : interactions === undefined || !interactions.canInteract
                  ? undefined
                  : {
                      draggable: interactions.canInteract,
                      debugGesture: isDesktop ? "context-menu" : "double-tap",
                      onActivate: () =>
                        interactions.onHandCardActivate(
                          card.id,
                        ),
                      ...(interactions.onCardDebugActivate === undefined
                        ? {}
                        : {
                            onDebugActivate: (invocation) =>
                              interactions.onCardDebugActivate?.(
                                card.id,
                                "near-hand",
                                invocation,
                              ),
                          }),
                      onDragStart: () => {
                        onCardDragChange(true, card.id);
                        interactions.onCardDragStart(
                          card.id,
                          "near-hand",
                        );
                      },
                      onDragEnd: () => {
                        onCardDragChange(false);
                        interactions.onCardDragEnd();
                      },
                      onPointerDrop: (
                        clientX,
                        clientY,
                        placementClientX,
                        placementClientY,
                      ) =>
                        dropMobileCardAtPoint(
                          interactions,
                          clientX,
                          clientY,
                          placementClientX,
                          placementClientY,
                        ),
                    }
            }
          />
        );
        if (isDesktop) {
          const isOnlyCard = cards.length === 1;
          const isFirstCard = index === 0;
          const isLastCard = index === cards.length - 1;
          const isCenteredCard = isOnlyCard || (!isFirstCard && !isLastCard);
          return (
            <div
              key={card.id}
              data-battle-near-hand-slot=""
              style={{
                position: "relative",
                height: "94%",
                minWidth: 0,
                flex: "0 1 auto",
                aspectRatio: CARD_ASPECT_RATIO,
                zIndex: index + 1,
                pointerEvents: "none",
              }}
            >
              <div
                data-battle-card-picker-candidate={
                  cardPicker !== null && isPickerCandidate ? "true" : undefined
                }
                data-battle-card-picker-selected={
                  cardPicker !== null && isPickerSelected ? "true" : undefined
                }
                data-battle-card-picker-highlighted={
                  cardPicker !== null && isPickerHighlighted
                    ? "true"
                    : undefined
                }
                style={{
                  position: "absolute",
                  left:
                    isCenteredCard || isFirstCard
                      ? isCenteredCard
                        ? "50%"
                        : 0
                      : undefined,
                  right: isLastCard && !isOnlyCard ? 0 : undefined,
                  top: 0,
                  height: "100%",
                  aspectRatio: CARD_ASPECT_RATIO,
                  transformOrigin: "50% 100%",
                  transform: `${isCenteredCard ? "translateX(-50%) " : ""}translateY(${String(drop)}%) rotate(${String(rotation)}deg)`,
                  pointerEvents: "auto",
                }}
              >
                {cardContent}
              </div>
            </div>
          );
        }
        return (
          <div
            key={card.id}
            data-battle-card-picker-candidate={
              cardPicker !== null && isPickerCandidate ? "true" : undefined
            }
            data-battle-card-picker-selected={
              cardPicker !== null && isPickerSelected ? "true" : undefined
            }
            data-battle-card-picker-highlighted={
              cardPicker !== null && isPickerHighlighted ? "true" : undefined
            }
            style={{
              position: "absolute",
              left,
              top: PLAYER_HAND_TOP,
              height: "92%",
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 100%",
              transform: `translateX(-50%) translateY(${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
              pointerEvents: "auto",
            }}
          >
            {cardContent}
          </div>
        );
      })}
    </div>
  );
});

function TargetingCardStage({
  card,
  isDesktop,
}: {
  readonly card: MobileBattleCardView;
  readonly isDesktop: boolean;
}) {
  
  return (
    <div
      data-battle-targeting-card-stage=""
      role="group"
      aria-label={"Card awaiting a target"}
      style={{
        gridColumn: 1,
        gridRow: 5,
        alignSelf: "start",
        justifySelf: "start",
        width: isDesktop
          ? DESKTOP_TARGETING_CARD_STAGE_WIDTH
          : TARGETING_CARD_STAGE_WIDTH,
        aspectRatio: CARD_ASPECT_RATIO,
        marginTop: token("--space-xs"),
        marginLeft: `calc(var(${SAFE_AREA_INSET_PROPERTIES.left}) + ${token("--space-s")})`,
        zIndex: PLAYER_HAND_Z_INDEX,
        pointerEvents: "auto",
      }}
    >
      <BattleCardSurface
        card={card}
        zone="targeting-stage"
        showRulesText
        selection={{ selected: true, kind: "selected" }}
      />
    </div>
  );
}

/**
 * The opponent's played card at reading size: it grows out of the opponent's
 * hand (or void), and when the screen clears it the board's copy of the card,
 * which shares its layout identity, travels from here to its destination.
 */
function BattlePlayReveal({
  reveal,
  farOwner,
}: {
  readonly reveal: MobileBattlePlayRevealView;
  readonly farOwner: MobileBattleOwner;
}) {
  const reduceMotion = useReducedMotion();
  const [origin] = useState(() => {
    const selector =
      reveal.from === "void"
        ? `[data-battle-zone="${farOwner}-void"]`
        : `[data-battle-mobile-row="far-hand"]`;
    const rect = document.querySelector(selector)?.getBoundingClientRect();
    return rect === undefined || rect.width === 0
      ? { x: 0, y: 0 }
      : {
          x: rect.left + rect.width / 2 - window.innerWidth / 2,
          y: rect.top + rect.height / 2 - window.innerHeight / 2,
        };
  });
  return (
    <div
      data-battle-play-reveal=""
      data-battle-play-reveal-from={reveal.from}
      style={{
        position: "fixed",
        left: "50%",
        top: "50%",
        width: SHARED_HAND_CARD_REVEAL_WIDTH,
        transform: "translate(-50%, -50%)",
        zIndex: token("--layer-reveal"),
        pointerEvents: "none",
      }}
    >
      <motion.div
        layoutId={reduceMotion ? undefined : battleCardLayoutId(reveal.card.id)}
        data-battle-card-id={reveal.card.id}
        data-battle-card-layout-id={
          reduceMotion ? undefined : battleCardLayoutId(reveal.card.id)
        }
        initial={
          reduceMotion
            ? false
            : { opacity: 0, scale: 0.45, x: origin.x, y: origin.y }
        }
        animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
          ease: [0.22, 0.61, 0.36, 1],
        }}
      >
        <GameCard
          model={reveal.card.model}
          testId={`battle-play-reveal:${reveal.card.id}`}
        />
      </motion.div>
    </div>
  );
}

/**
 * Where the shared card shows: at reading size beside the battlefield, or
 * aside, at the targeting stage's size and place, while a choice on the
 * battlefield would otherwise sit under it.
 */
type SharedHandCardRevealPlacement = "reading" | "aside";

function SharedHandCardReveal({
  card,
  isDesktop,
  placement,
  interactions,
}: {
  readonly card: MobileBattleCardView;
  readonly isDesktop: boolean;
  readonly placement: SharedHandCardRevealPlacement;
  readonly interactions?: MobileBattleInteractions;
}) {
  const reduceMotion = useReducedMotion();
  const canOpenActions =
    interactions?.canInteract === true &&
    interactions.onRevealedHandCardDebugActivate !== undefined;
  return (
    <motion.div
      data-battle-revealed-hand-card=""
      data-battle-revealed-hand-card-placement={placement}
      data-battle-card-id={card.id}
      initial={
        reduceMotion
          ? false
          : { opacity: 0, scale: 0.55, x: token("--space-2xl") }
      }
      animate={{ opacity: 1, scale: 1, x: 0 }}
      transition={{
        duration: reduceMotion ? 0 : motionTimeSeconds("--dur-slow"),
        ease: [0.22, 0.61, 0.36, 1],
      }}
      style={{
        gridColumn: 1,
        zIndex: token("--layer-reveal"),
        pointerEvents: "auto",
        ...(placement === "reading"
          ? {
              gridRow: "3 / 5",
              alignSelf: "center",
              justifySelf: "end",
              width: SHARED_HAND_CARD_REVEAL_WIDTH,
              marginRight: token(isDesktop ? "--space-2xl" : "--space-s"),
            }
          : {
              gridRow: 5,
              alignSelf: "start",
              justifySelf: "start",
              width: isDesktop
                ? DESKTOP_TARGETING_CARD_STAGE_WIDTH
                : TARGETING_CARD_STAGE_WIDTH,
              marginTop: token("--space-xs"),
              marginLeft: token("--space-s"),
            }),
      }}
    >
      <BattleCardSurface
        card={card}
        zone="shared-reveal"
        showRulesText
        interaction={
          canOpenActions
            ? {
                draggable: false,
                debugGesture: isDesktop ? "context-menu" : "double-tap",
                onDebugActivate: (invocation) =>
                  interactions.onRevealedHandCardDebugActivate?.(
                    card.id,
                    invocation,
                  ),
              }
            : undefined
        }
      />
    </motion.div>
  );
}

function pickerZoneCaption(
  candidate: MobileBattleCardPickerCandidateView,
  perspective: BattlePerspectiveSide,
): string {
  if (candidate.highlighted) {
    return "Just Drawn";
  }
  const viewerOwned = candidate.owner === perspective;
  if (candidate.zone === "hand") {
    return viewerOwned
      ? "Your Hand"
      : "Opponent Hand";
  }
  if (candidate.zone === "deck") {
    return viewerOwned
      ? "Your Deck"
      : "Opponent Deck";
  }
  if (candidate.zone === "backRank") {
    return viewerOwned
      ? "Your Back Rank"
      : "Opponent Back Rank";
  }
  if (candidate.zone === "frontRank") {
    return viewerOwned
      ? "Your Front Rank"
      : "Opponent Front Rank";
  }
  if (candidate.zone === "void") {
    return viewerOwned
      ? "Your Void"
      : "Opponent Void";
  }
  if (candidate.zone === "stack") {
    return "On the Stack";
  }
  return viewerOwned
    ? "Your Banished"
    : "Opponent Banished";
}

function CardPickerGallery({
  cardPicker,
  selectedPickerCardIds,
  isDesktop,
  onPickerCardToggle,
  interactions,
  perspective,
}: {
  readonly cardPicker: MobileBattleCardPickerView;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly isDesktop: boolean;
  readonly onPickerCardToggle: (cardId: BattleCardId) => void;
  readonly interactions?: MobileBattleInteractions;
  readonly perspective: BattlePerspectiveSide;
}) {
  
  const requiredCount = cardPickerBounds(cardPicker).max;
  const promptSubtitle: MobileBattlePromptCopy =
    cardPicker.subtitle === undefined
      ? `${formatNumber(selectedPickerCardIds.length)}/${formatNumber(requiredCount)} selected`
      : cardPicker.subtitle;
  const canSubmit =
    canSubmitCardPicker(cardPicker, selectedPickerCardIds.length) &&
    interactions?.onCardPickerSubmit !== undefined;
  const submitAction = {
    label:
      requiredCount === 0
        ? "Continue"
        : "Submit",
    variant: "accent" as const,
    disabled: !canSubmit,
    testId: "battle-card-picker-submit",
    onPress: () => interactions?.onCardPickerSubmit?.(selectedPickerCardIds),
  };
  const skipAction = {
    label: "Skip",
    disabled:
      !cardPicker.canResolve || interactions?.onCardPickerSkip === undefined,
    testId: "battle-card-picker-skip",
    onPress: () => interactions?.onCardPickerSkip?.(),
  };
  const optionalWithCandidates =
    cardPicker.optional && cardPicker.candidates.length > 0;
  const onCancel = interactions?.onPromptCancel;
  const cancelAction =
    cardPicker.cancellable === true && onCancel !== undefined
      ? { label: "Cancel", testId: "battle-prompt-cancel", onPress: () => onCancel() }
      : null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={cardPicker.label}
      data-battle-card-picker-gallery=""
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        display: "grid",
        placeItems: "center",
        padding: isDesktop ? token("--space-2xl") : 0,
        boxSizing: "border-box",
      }}
    >
      <GlassBackdrop />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 1080,
          height: isDesktop ? "min(84dvh, 760px)" : "100%",
          minHeight: 0,
        }}
      >
        <CardPickerPanel<BattleCardId>
          title={cardPicker.label}
          subtitle={promptSubtitle}
          cards={cardPicker.candidates.map((candidate) => {
            const selected = selectedPickerCardIds.includes(
              candidate.instanceId,
            );
            return {
              entryId: candidate.instanceId,
              model: candidate.card.model,
              selection: selected
                ? CARD_PICKER_SELECTION
                : candidate.highlighted
                  ? CARD_PICKER_HIGHLIGHT_SELECTION
                  : undefined,
              caption: {
                kind: "text" as const,
                message: pickerZoneCaption(candidate, perspective),
              },
              testId: `battle-card-picker-candidate-${candidate.instanceId}`,
            };
          })}
          emptyLabel={"No valid targets."}
          presentation="overlay"
          testId="battle-card-picker-gallery-panel"
          footerActions={
            optionalWithCandidates
              ? [skipAction, submitAction]
              : cancelAction === null
                ? [cardPicker.optional ? skipAction : submitAction]
                : [cancelAction, cardPicker.optional ? skipAction : submitAction]
          }
          onCardPress={onPickerCardToggle}
        />
      </div>
    </div>
  );
}

function ControlRow({
  cardPicker,
  choicePrompt,
  promptHost,
  selectedPickerCardIds,
  isDesktop,
  interactions,
  layoutBackSlotCount,
  nextPhaseAction,
  phaseNavigation,
  perspective,
  rankShortcuts,
  tutorialNextAction,
}: {
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly choicePrompt: MobileBattleChoicePromptView | null;
  readonly promptHost: BattlePromptHostView | null;
  readonly selectedPickerCardIds: readonly BattleCardId[];
  readonly isDesktop: boolean;
  readonly interactions?: MobileBattleInteractions;
  readonly layoutBackSlotCount: number;
  readonly nextPhaseAction: "continue" | "nextPhase";
  readonly phaseNavigation: NonNullable<MobileBattleScreenProps["phaseNavigation"]>;
  readonly perspective: BattlePerspectiveSide;
  readonly rankShortcuts: MobileBattleRankShortcutsView | null;
  readonly tutorialNextAction: "endTurn" | "startChallenge";
}) {
  
  const disabled = interactions?.canInteract !== true;
  const numberPicker = promptHost?.key != null ? promptHost.number : null;
  const hasAlternateNextControls = choicePrompt !== null || numberPicker !== null;
  const requiredPickerCount =
    cardPicker === null ? 0 : cardPickerBounds(cardPicker).max;
  const canSubmitPicker =
    cardPicker !== null &&
    canSubmitCardPicker(cardPicker, selectedPickerCardIds.length);
  return (
    <div
      data-battle-mobile-row="control-row"
      aria-label={"Battle controls"}
      style={{
        ...ROW_STYLE,
        gridColumn: 1,
        gridRow: 5,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: isDesktop ? "center" : "flex-end",
        width: isDesktop ? "100%" : undefined,
        boxSizing: "border-box",
        containerType: isDesktop ? "inline-size" : undefined,
        paddingInline: isDesktop ? 0 : token("--space-s"),
        paddingTop: token(isDesktop ? "--space-m" : "--space-s"),
        zIndex: 10,
        pointerEvents: "none",
      }}
    >
      {cardPicker !== null ? (
        <div
          data-battle-card-picker-controls=""
          style={{
            width: isDesktop
              ? battlefieldTrackWidth(
                  layoutBackSlotCount,
                  desktopControlCardSize(layoutBackSlotCount),
                  token("--space-xs"),
                )
              : "100%",
            maxWidth: isDesktop ? "100%" : undefined,
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: token("--space-s"),
            position: "relative",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          <span
            aria-live="polite"
            data-battle-card-picker-progress=""
            style={{
              minWidth: 0,
              overflow: "hidden",
              color: token("--text-primary"),
              font: token("--t-caption"),
              textAlign: "right",
              textOverflow: "ellipsis",
              textShadow: token("--text-outline-media"),
              whiteSpace: "nowrap",
            }}
          >
            {(promptHost?.heading ?? null) === null ? (
              <>
                <span data-battle-card-picker-prompt-copy="">
                  {cardPicker.label}
                </span>{" "}
              </>
            ) : null}
            <span data-battle-card-picker-progress-copy="">
              {!cardPicker.candidates.every((candidate) => candidate.zone === "hand")
                ? `${formatNumber(selectedPickerCardIds.length)}/${formatNumber(requiredPickerCount)}`
                : (cardPicker.candidateOwner ?? cardPicker.side) === perspective
                  ? `from your hand · ${formatNumber(selectedPickerCardIds.length)}/${formatNumber(requiredPickerCount)}`
                  : `from the opponent hand · ${formatNumber(selectedPickerCardIds.length)}/${formatNumber(requiredPickerCount)}`}
            </span>
          </span>
          {cardPicker.optional ? (
            <GlassButton
              label={"Skip"}
              disabled={!cardPicker.canResolve}
              testId="battle-card-picker-skip"
              onPress={() => interactions?.onCardPickerSkip?.()}
            />
          ) : null}
          <GlassButton
            label={
              requiredPickerCount === 0
                ? "Continue"
                : "Submit"
            }
            variant="accent"
            disabled={
              !canSubmitPicker || interactions?.onCardPickerSubmit === undefined
            }
            testId="battle-card-picker-submit"
            onPress={() =>
              interactions?.onCardPickerSubmit?.(selectedPickerCardIds)
            }
          />
        </div>
      ) : phaseNavigation !== "hidden" ? (
        <div
          data-battle-phase-controls="row"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: isDesktop ? "flex-end" : undefined,
            width: isDesktop
              ? battlefieldTrackWidth(
                  layoutBackSlotCount,
                  desktopControlCardSize(layoutBackSlotCount),
                  token("--space-xs"),
                )
              : undefined,
            maxWidth: "100%",
            gap: token("--space-s"),
            position: "relative",
            zIndex: 10,
            pointerEvents: "auto",
          }}
        >
          {/* A choice takes the whole row; long options wrap rather than leave the screen. */}
          {rankShortcuts === null || choicePrompt !== null ? null : (
            <div
              data-battle-rank-shortcuts=""
              style={{ display: "flex", gap: token("--space-xs") }}
            >
              <IconButton
                glyph={GLYPHS.chevronUp}
                size="sm"
                label={"All Forward"}
                disabled={
                  disabled ||
                  !rankShortcuts.allForward ||
                  interactions?.onAllForward === undefined
                }
                testId="battle-all-forward"
                onPress={() => interactions?.onAllForward?.()}
              />
              <IconButton
                glyph={GLYPHS.chevronDown}
                size="sm"
                label={"All Back"}
                disabled={
                  disabled ||
                  !rankShortcuts.allBack ||
                  interactions?.onAllBack === undefined
                }
                testId="battle-all-back"
                onPress={() => interactions?.onAllBack?.()}
              />
            </div>
          )}
          {phaseNavigation === "both" ? (
            <div data-battle-phase-back="">
              <IconButton
                glyph={GLYPHS.arrowLeft}
                size="sm"
                label={"Back"}
                disabled={disabled}
                onPress={() => interactions?.onPreviousPhase?.()}
              />
            </div>
          ) : null}
          <div
            data-battle-phase-next=""
            data-battle-choice-prompt-controls={
              choicePrompt === null ? undefined : ""
            }
            aria-label={
              choicePrompt === null ? undefined : choicePrompt.label
            }
            style={{
              width: hasAlternateNextControls ? undefined : "max-content",
              minWidth: hasAlternateNextControls
                ? undefined
                : NEXT_PHASE_CONTROL_WIDTH,
              display: hasAlternateNextControls ? "flex" : "grid",
              alignItems: hasAlternateNextControls ? "center" : undefined,
              justifyContent: hasAlternateNextControls ? "flex-end" : undefined,
              flexWrap: hasAlternateNextControls ? "wrap" : undefined,
              gap: hasAlternateNextControls ? token("--space-s") : undefined,
            }}
          >
            {numberPicker !== null && promptHost?.key != null ? (
              <BattlePromptNumberPicker
                key={promptHost.key}
                label={numberPicker.label}
                values={numberPicker.values}
                disabled={
                  !(interactions?.canPrompt ?? !disabled) ||
                  interactions?.onPromptNumberSubmit === undefined
                }
                onSubmit={(value) => interactions?.onPromptNumberSubmit?.(value)}
              />
            ) : choicePrompt !== null ? (
              choicePrompt.options.map((option, index) => (
                <GlassButton
                  key={`${choicePrompt.key}:${String(index)}`}
                  label={option.label}
                  variant={index === 0 ? "accent" : "default"}
                  disabled={
                    !choicePrompt.canResolve ||
                    interactions?.onChoicePromptChoose === undefined
                  }
                  testId={`battle-choice-prompt-option-${String(index)}`}
                  onPress={() => interactions?.onChoicePromptChoose?.(index)}
                />
              ))
            ) : (
              <GlassButton
                label={
                  phaseNavigation === "end-turn" ||
                  (phaseNavigation === "tutorial" &&
                    tutorialNextAction === "endTurn")
                    ? "End Turn"
                    : phaseNavigation === "tutorial"
                      ? "Start Challenge"
                      : phaseNavigation === "pass"
                        ? "Pass"
                        : nextPhaseAction === "nextPhase"
                        ? "Next Phase"
                        : "Continue"
                }
                variant="accent"
                disabled={disabled}
                testId={
                  phaseNavigation === "end-turn" ||
                  phaseNavigation === "tutorial"
                    ? "tutorial-end-turn"
                    : undefined
                }
                onPress={() => interactions?.onNextPhase()}
              />
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function BattleControlMessage({
  choicePrompt,
  promptNotice,
}: {
  readonly choicePrompt: MobileBattleChoicePromptView | null;
  readonly promptNotice: MobileBattlePromptNoticeView | null;
}) {
  
  const message: MobileBattlePromptCopy | null =
    promptNotice !== null
      ? promptNotice.reason === "opponent-choosing"
        ? "Your opponent is choosing."
        : promptNotice.reason === "opponent-acting"
          ? "Your opponent is acting."
          : builtInBattlePromptMessage(
            builtInBattlePromptRef("switch-side", promptNotice.promptSide),
          )
      : choicePrompt !== null
        ? choicePrompt.label
        : null;
  if (message === null) return null;
  return (
    <div
      aria-live="polite"
      data-battle-choice-prompt-message={choicePrompt === null ? undefined : ""}
      data-battle-prompt-waiting={
        promptNotice === null ? undefined : promptNotice.promptSide
      }
      style={{
        maxWidth: 320,
        overflow: "hidden",
        color: token("--text-primary"),
        font: token("--t-caption"),
        textOverflow: "ellipsis",
        textShadow: token("--text-outline-media"),
        whiteSpace: "nowrap",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}

// tutorial-only until Phase 6: the debug menu and the Battle Inspector rail
// below render only where `inspectorVisibility` is "available", which only
// the scripted tutorial stage (`TutorialScreen`) leaves on.
function BattleDebugMenu({
  onFillBattlefieldPreview,
  onFillAsymmetricBattlefieldPreview,
}: {
  readonly onFillBattlefieldPreview?: () => void;
  readonly onFillAsymmetricBattlefieldPreview?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div
      data-battle-debug="menu"
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: token("--space-xs"),
      }}
    >
      <IconButton
        glyph={GLYPHS.bug}
        size="sm"
        label={"Battle debug menu"}
        ariaExpanded={isOpen}
        testId="battle-debug-menu-trigger"
        onPress={() => setIsOpen((open) => !open)}
      />
      {isOpen ? (
        <div
          role="menu"
          aria-label="Battle debug actions"
          style={{
            position: "absolute",
            top: `calc(100% + ${token("--space-xs")})`,
            right: 0,
            width: 300,
          }}
        >
          <GlassPanel radius="popover" tint="popover">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: token("--space-xs"),
                padding: token("--space-m"),
              }}
            >
              <GlassButton
                label={"Fill Battlefield + Voids"}
                placement="onGlass"
                disabled={onFillBattlefieldPreview === undefined}
                testId="battle-debug-fill-grid"
                onPress={() => {
                  onFillBattlefieldPreview?.();
                  setIsOpen(false);
                }}
              />
              <GlassButton
                label={"Fill 19 vs 9 + Voids"}
                placement="onGlass"
                disabled={onFillAsymmetricBattlefieldPreview === undefined}
                testId="battle-debug-fill-asymmetric"
                onPress={() => {
                  onFillAsymmetricBattlefieldPreview?.();
                  setIsOpen(false);
                }}
              />
            </div>
          </GlassPanel>
        </div>
      ) : null}
    </div>
  );
}

const INSPECTOR_ID = "cumulus-battle-inspector";
const INSPECTOR_DOCK_MIN_WIDTH = 1280;

function InspectorValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-xxs"),
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: token("--text-on-glass-muted"),
          font: token("--t-caption"),
        }}
      >
        {label}
      </span>
      <span
        style={{
          color: token("--text-on-glass"),
          font: token("--t-body-sm"),
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function InspectorButton({
  label,
  onPress,
  disabled = false,
  variant = "default",
  testId,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly variant?: "default" | "accent" | "danger";
  readonly testId?: DomTestId;
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <GlassButton
        label={label}
        placement="onGlass"
        variant={variant}
        disabled={disabled}
        testId={testId}
        onPress={onPress}
      />
    </div>
  );
}

/** A transparent subdivision laid directly on the inspector's glass shell. */
function InspectorSection({ children }: { readonly children: ReactNode }) {
  return (
    <section
      data-battle-inspector-section=""
      style={{
        paddingBlock: token("--space-m"),
        borderTop: `1px solid ${token("--border-soft")}`,
      }}
    >
      {children}
    </section>
  );
}

function BattleInspectorContent({
  inspector,
  perspective,
  selectedSide,
  onSelectSide,
  onPerspectiveToggle,
  onAction,
}: {
  readonly inspector: MobileBattleInspectorView;
  readonly perspective: BattlePerspectiveSide;
  readonly selectedSide: MobileBattleOwner;
  readonly onSelectSide: (side: MobileBattleOwner) => void;
  readonly onPerspectiveToggle?: () => void;
  readonly onAction?: (action: MobileBattleInspectorAction) => void;
}) {
  const side = inspector.sides[selectedSide];
  const [erodeCount, setErodeCount] = useState(1);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [endBattleOpen, setEndBattleOpen] = useState(false);
  const actionGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: token("--space-xs"),
  };
  const groupLayout: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: token("--space-s"),
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        data-battle-inspector-perspective-control=""
        style={{ minWidth: 0, paddingBottom: token("--space-m") }}
      >
        <GlassButton
          label={perspective === "player"
              ? "Control Opponent"
              : "Return to Your Side"}
          widthReservations={[
            { label: "Control Opponent" },
            { label: "Return to Your Side" },
          ]}
          placement="onGlass"
          variant={perspective === "enemy" ? "accent" : "default"}
          pressed={perspective === "enemy"}
          disabled={onPerspectiveToggle === undefined}
          testId="battle-perspective-toggle"
          onPress={() => onPerspectiveToggle?.()}
        />
      </div>

      <InspectorSection>
        <div style={{ ...groupLayout, gap: token("--space-xs") }}>
          <h3
            style={{
              margin: 0,
              color: token("--text-on-glass"),
              font: token("--t-title-sm"),
            }}
          >
            Battle Snapshot
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: token("--space-s"),
            }}
          >
            <InspectorValue
              label={"Turn"}
              value={inspector.turn}
            />
            <InspectorValue
              label={"Phase"}
              value={inspector.phase}
            />
            <InspectorValue
              label={"Active side"}
              value={inspector.activeSide}
            />
            <InspectorValue
              label={"Result"}
              value={inspector.result}
            />
            <InspectorValue
              label={"Next Dreamwell order"}
              value={inspector.nextDreamwellOrder}
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection>
        <div style={groupLayout}>
          <h3
            style={{
              margin: 0,
              color: token("--text-on-glass"),
              font: token("--t-title-sm"),
            }}
          >
            History
          </h3>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: token("--space-xs"),
            }}
          >
            <InspectorButton
              label={"Battle Log"}
              onPress={() => onAction?.({ kind: "open-battle-log" })}
              disabled={onAction === undefined}
              testId="battle-inspector-open-battle-log"
            />
            <InspectorButton
              label={"Dreamwell History"}
              onPress={() => onAction?.({ kind: "open-dreamwell-history" })}
              disabled={onAction === undefined}
              testId="battle-inspector-open-dreamwell-history"
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection>
        <div style={groupLayout}>
          <SegmentedControl
            full
            options={[
              { value: "player", label: "You" },
              { value: "enemy", label: "Enemy" },
            ]}
            value={selectedSide}
            onChange={(value) => onSelectSide(value as MobileBattleOwner)}
          />
        </div>
      </InspectorSection>

      <InspectorSection>
        <div style={groupLayout}>
          <h3
            style={{
              margin: 0,
              color: token("--text-on-glass"),
              font: token("--t-title-sm"),
            }}
          >
            {side.heading} Resources
          </h3>
          <NumberStepper
            label={"Points"}
            value={side.points}
            resource="points"
            decrementLabel={`Decrease ${side.heading.toLowerCase()} points`}
            incrementLabel={`Increase ${side.heading.toLowerCase()} points`}
            decrementDisabled={side.points <= 0 || onAction === undefined}
            incrementDisabled={onAction === undefined}
            onDecrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "points",
                amount: -1,
              })
            }
            onIncrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "points",
                amount: 1,
              })
            }
          />
          <NumberStepper
            label={"Current energy"}
            value={side.currentEnergy}
            resource="energy"
            decrementLabel={`Decrease ${side.heading.toLowerCase()} current energy`}
            incrementLabel={`Increase ${side.heading.toLowerCase()} current energy`}
            decrementDisabled={
              side.currentEnergy <= 0 || onAction === undefined
            }
            incrementDisabled={onAction === undefined}
            onDecrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "currentEnergy",
                amount: -1,
              })
            }
            onIncrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "currentEnergy",
                amount: 1,
              })
            }
          />
          <NumberStepper
            label={"Maximum energy"}
            value={side.maxEnergy}
            resource="energy"
            decrementLabel={`Decrease ${side.heading.toLowerCase()} maximum energy`}
            incrementLabel={`Increase ${side.heading.toLowerCase()} maximum energy`}
            decrementDisabled={side.maxEnergy <= 0 || onAction === undefined}
            incrementDisabled={onAction === undefined}
            onDecrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "maxEnergy",
                amount: -1,
              })
            }
            onIncrement={() =>
              onAction?.({
                kind: "adjust-stat",
                side: selectedSide,
                stat: "maxEnergy",
                amount: 1,
              })
            }
          />
          <NumberStepper
            label={"Current + maximum"}
            value={side.currentEnergy}
            displayValue={`${String(side.currentEnergy)}/${String(side.maxEnergy)}`}
            resource="energy"
            decrementLabel={`Decrease ${side.heading.toLowerCase()} current and maximum energy`}
            incrementLabel={`Increase ${side.heading.toLowerCase()} current and maximum energy`}
            decrementDisabled={
              side.currentEnergy <= 0 ||
              side.maxEnergy <= 0 ||
              onAction === undefined
            }
            incrementDisabled={onAction === undefined}
            onDecrement={() =>
              onAction?.({
                kind: "adjust-energy-pair",
                side: selectedSide,
                amount: -1,
              })
            }
            onIncrement={() =>
              onAction?.({
                kind: "adjust-energy-pair",
                side: selectedSide,
                amount: 1,
              })
            }
          />
        </div>
      </InspectorSection>

      <InspectorSection>
        <div style={groupLayout}>
          <h3
            style={{
              margin: 0,
              color: token("--text-on-glass"),
              font: token("--t-title-sm"),
            }}
          >
            {side.heading} Zones
          </h3>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: token("--space-s"),
            }}
          >
            <InspectorValue
              label={"Hand"}
              value={String(side.zones.hand)}
            />
            <InspectorValue
              label={"Deck"}
              value={String(side.zones.deck)}
            />
            <InspectorValue
              label={"Void"}
              value={String(side.zones.void)}
            />
            <InspectorValue
              label={"Banished"}
              value={String(side.zones.banished)}
            />
            <InspectorValue
              label={"Back Rank"}
              value={String(side.zones.backRank)}
            />
            <InspectorValue
              label={"Front Rank"}
              value={String(side.zones.frontRank)}
            />
          </div>
        </div>
      </InspectorSection>

      <InspectorSection>
        <div style={groupLayout}>
          <h3
            style={{
              margin: 0,
              color: token("--text-on-glass"),
              font: token("--t-title-sm"),
            }}
          >
            {side.heading} Actions
          </h3>
          <div style={actionGrid}>
            <InspectorButton
              label={"Draw"}
              variant="accent"
              onPress={() => onAction?.({ kind: "draw", side: selectedSide })}
              disabled={onAction === undefined}
              testId={`battle-inspector-draw-${selectedSide}`}
            />
            <InspectorButton
              label={"Discard"}
              onPress={() =>
                onAction?.({ kind: "discard", side: selectedSide })
              }
              disabled={!side.canDiscard || onAction === undefined}
              testId={`battle-inspector-discard-${selectedSide}`}
            />
          </div>
          <h4
            style={{
              margin: 0,
              color: token("--text-on-glass-muted"),
              font: token("--t-button-sm"),
            }}
          >
            Deck & Effects
          </h4>
          <div style={actionGrid}>
            <InspectorButton
              label={"Foresee"}
              onPress={() =>
                onAction?.({ kind: "foresee", side: selectedSide })
              }
              disabled={onAction === undefined}
            />
            <InspectorButton
              label={"Shuffle"}
              onPress={() =>
                onAction?.({ kind: "shuffle", side: selectedSide })
              }
              disabled={!side.canShuffle || onAction === undefined}
            />
            <InspectorButton
              label={"Reorder Deck"}
              onPress={() =>
                onAction?.({ kind: "reorder-deck", side: selectedSide })
              }
              disabled={side.zones.deck === 0 || onAction === undefined}
            />
            <InspectorButton
              label={"Open Deck"}
              onPress={() =>
                onAction?.({
                  kind: "open-zone",
                  side: selectedSide,
                  zone: "deck",
                })
              }
              disabled={onAction === undefined}
            />
            <InspectorButton
              label={"Open Void"}
              onPress={() =>
                onAction?.({
                  kind: "open-zone",
                  side: selectedSide,
                  zone: "void",
                })
              }
              disabled={onAction === undefined}
            />
            <InspectorButton
              label={"Open Banished"}
              onPress={() =>
                onAction?.({
                  kind: "open-zone",
                  side: selectedSide,
                  zone: "banished",
                })
              }
              disabled={onAction === undefined}
            />
            <InspectorButton
              label={"Dreamwell + Draw"}
              onPress={() =>
                onAction?.({ kind: "dreamwell-draw", side: selectedSide })
              }
              disabled={onAction === undefined}
            />
          </div>
          <NumberStepper
            label={"Erode count"}
            value={erodeCount}
            decrementLabel={`Decrease erode count for ${side.heading.toLowerCase()}`}
            incrementLabel={`Increase erode count for ${side.heading.toLowerCase()}`}
            decrementDisabled={erodeCount <= 1}
            onDecrement={() =>
              setErodeCount((current) => Math.max(1, current - 1))
            }
            onIncrement={() => setErodeCount((current) => current + 1)}
          />
          <div style={actionGrid}>
            <InspectorButton
              label={`Erode ${String(erodeCount)}`}
              onPress={() =>
                onAction?.({
                  kind: "erode",
                  side: selectedSide,
                  count: erodeCount,
                })
              }
              disabled={onAction === undefined}
            />
            <InspectorButton
              label={"Create Figment"}
              onPress={() =>
                onAction?.({ kind: "create-figment", side: selectedSide })
              }
              disabled={onAction === undefined}
            />
          </div>
        </div>
      </InspectorSection>

      <DisclosureSection
        title={"View & Visibility"}
        summary={"Pool and hidden hands"}
        expanded={visibilityOpen}
        placement="onGlass"
        onExpandedChange={setVisibilityOpen}
      >
        <div style={{ ...actionGrid, marginTop: token("--space-s") }}>
          <InspectorButton
            label={"Pool Viewer"}
            onPress={() => onAction?.({ kind: "open-pool-viewer" })}
            disabled={onAction === undefined}
          />
          <InspectorButton
            label={inspector.isFarHandRevealed ? "Hide Far Hand" : "Reveal Far Hand"}
            onPress={() => onAction?.({ kind: "toggle-opponent-hand" })}
            disabled={onAction === undefined}
          />
          <InspectorButton
            label={inspector.isNearHandHidden ? "Show Near Hand" : "Hide Near Hand"}
            onPress={() => onAction?.({ kind: "toggle-player-hand" })}
            disabled={onAction === undefined}
          />
        </div>
      </DisclosureSection>

      <DisclosureSection
        title={"End Battle"}
        summary={"Outcomes and local reset"}
        expanded={endBattleOpen}
        placement="onGlass"
        onExpandedChange={setEndBattleOpen}
      >
        <div style={{ ...actionGrid, marginTop: token("--space-s") }}>
          <InspectorButton
            label={"Skip to Rewards"}
            onPress={() => onAction?.({ kind: "skip-to-rewards" })}
            disabled={onAction === undefined}
          />
          <InspectorButton
            label={"Force Defeat"}
            onPress={() =>
              onAction?.({ kind: "force-result", result: "defeat" })
            }
            disabled={onAction === undefined}
          />
          <InspectorButton
            label={"Force Draw"}
            onPress={() => onAction?.({ kind: "force-result", result: "draw" })}
            disabled={onAction === undefined}
          />
          <InspectorButton
            label={"Reset Battle"}
            variant="danger"
            onPress={() => onAction?.({ kind: "reset-battle" })}
            disabled={onAction === undefined}
          />
        </div>
      </DisclosureSection>
    </div>
  );
}

function BattleInspectorRail({
  inspector,
  perspective,
  selectedSide,
  onSelectSide,
  onClose,
  onPerspectiveToggle,
  onAction,
}: {
  readonly inspector: MobileBattleInspectorView;
  readonly perspective: BattlePerspectiveSide;
  readonly selectedSide: MobileBattleOwner;
  readonly onSelectSide: (side: MobileBattleOwner) => void;
  readonly onClose: () => void;
  readonly onPerspectiveToggle?: () => void;
  readonly onAction?: (action: MobileBattleInspectorAction) => void;
}) {
  return (
    <div
      data-battle-inspector="docked"
      style={{ minWidth: 0, height: "100dvh" }}
    >
      <DeveloperRail
        id={INSPECTOR_ID}
        side="right"
        title={"Battle Inspector"}
        subtitle={`Opponent: ${inspector.opponentName} · Perspective: ${inspector.perspective}`}
        closeLabel={"Close battle inspector"}
        onClose={onClose}
      >
        <BattleInspectorContent
          inspector={inspector}
          perspective={perspective}
          selectedSide={selectedSide}
          onSelectSide={onSelectSide}
          onPerspectiveToggle={onPerspectiveToggle}
          onAction={onAction}
        />
      </DeveloperRail>
    </div>
  );
}

/** Responsive battle table composed entirely from physical battle objects. */
export function MobileBattleScreen({
  view: receivedView,
  interactions,
  cardOverlay = null,
  inspectorDefault = "responsive",
  phaseNavigation = "both",
  zoneLabels = "none",
  inspectorOpen: controlledInspectorOpen,
  onInspectorOpenChange,
  onTurnAnnouncementComplete,
  playbackSpeed = 1,
  guidedSlotHighlight,
  preserveOccupiedSlotOutlines = false,
  viewport = "fixed",
  inspectorVisibility = "available",
  cardLayoutGroup = "owned",
}: MobileBattleScreenProps) {
  // Each view keeps the previous view's unchanged parts, so a memoized region
  // whose side an intent did not change skips rendering.
  const view = useSharedFields(receivedView);
  // Event handlers read the committed view when they run.
  const latestView = useRef(view);
  useLayoutEffect(() => {
    latestView.current = view;
  }, [view]);
  const isDesktop = useIsDesktop();
  const isDockLayout = useIsDesktop(INSPECTOR_DOCK_MIN_WIDTH);
  const inspectorStartsOpen = inspectorDefault === "responsive" && isDockLayout;
  const [internalInspectorOpen, setInternalInspectorOpen] =
    useState(inspectorStartsOpen);
  const isInspectorOpen = controlledInspectorOpen ?? internalInspectorOpen;
  const setInspectorOpen = useCallback(
    (open: boolean): void => {
      setInternalInspectorOpen(open);
      onInspectorOpenChange?.(open);
    },
    [onInspectorOpenChange],
  );
  const [isCardDragActive, setIsCardDragActive] = useState(false);
  const [snapLayoutCardId, setSnapLayoutCardId] = useState<BattleCardId | null>(
    null,
  );
  const [hoveredMergeTarget, setHoveredMergeTarget] =
    useState<MobileBattleFigmentMergeTarget | null>(null);
  const [mergeConfirmation, setMergeConfirmation] =
    useState<MobileBattleFigmentMergeTarget | null>(null);
  const [mergeNotice, setMergeNotice] = useState<"exhaustion" | null>(null);
  const [mergeAnimation, setMergeAnimation] =
    useState<FigmentMergeAnimationState | null>(null);
  const mergeAnimationSequence = useRef(1);
  const [cardPickerSelection, setCardPickerSelection] = useState<{
    readonly pickerKey: MobileBattlePromptKey | null;
    readonly ids: readonly BattleCardId[];
  }>({ pickerKey: null, ids: [] });
  const [selectedSide, setSelectedSide] = useState<MobileBattleOwner>("player");
  const [completedTurnAnnouncement, setCompletedTurnAnnouncement] = useState<{
    readonly battleId: BattleId;
    readonly turn: string;
    readonly side: MobileBattleOwner;
  }>(() => ({
    battleId: view.battleId,
    turn: view.inspector.turn,
    side: view.activeSide,
  }));
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);
  const previousDockLayout = useRef(isDockLayout);
  const previousPerspective = useRef(view.perspective);
  const openedLogKey = useRef<string | null>(null);
  const snapLayoutOriginView = useRef<MobileBattleView | null>(null);
  const near = view.perspective === "player" ? view.player : view.enemy;
  const far = view.perspective === "player" ? view.enemy : view.player;
  const banishedCardCount = near.banishedCardCount + far.banishedCardCount;
  const initialBanishedOwner =
    near.banishedCardCount > 0 ? near.owner : far.owner;
  const nearHandNeededByPrompt =
    view.cardPicker?.candidates.some(
      (candidate) =>
        candidate.owner === near.owner && candidate.zone === "hand",
    ) === true;
  const nearHandCards =
    view.inspector.isNearHandHidden && !nearHandNeededByPrompt
      ? NO_CARDS
      : view.perspective === "player"
        ? view.playerHand
        : view.nearHand.cards;
  const targetingCard =
    interactions?.targetSelectionCardId === null ||
    interactions?.targetSelectionCardId === undefined
      ? null
      : (nearHandCards.find(
          (card) => card.id === interactions.targetSelectionCardId,
        ) ?? null);
  const displayedNearHandCards =
    targetingCard === null
      ? nearHandCards
      : nearHandCards.filter((card) => card.id !== targetingCard.id);
  const farHandCards = view.inspector.isFarHandRevealed
    ? far.owner === "enemy"
      ? view.enemyHand
      : view.playerHand
    : view.farHand.cards;
  const mobileWindow = mobileBattlefieldWindow(view);
  const layoutBackSlotCount = isDesktop
    ? desktopBattlefieldLayoutBackSlotCount(view)
    : mobileWindow.backSlotCount;
  const densityBackSlotCount = battlefieldDensityBackSlotCount(view);
  const centerOffset = BATTLEFIELD_CENTER_OFFSET;
  const cardSize = battlefieldCardSize(
    layoutBackSlotCount,
    isDesktop,
    densityBackSlotCount,
    centerOffset,
  );
  const centerAsymmetricDesktopRanks =
    isDesktop &&
    (far.backRank.length >= DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS ||
      near.backRank.length >= DESKTOP_BATTLE_STARTING_BACK_RANK_SLOTS) &&
    (far.backRank.length !== near.backRank.length ||
      far.frontRank.length !== near.frontRank.length);
  const cardPickerKey = view.cardPicker?.key ?? null;
  const boardCardPicker =
    view.cardPicker?.presentation === "board" ? view.cardPicker : null;
  const galleryCardPicker =
    view.cardPicker?.presentation === "gallery" ? view.cardPicker : null;
  // While a choice on the battlefield is open, the shared card steps aside
  // to the targeting stage, as a card being played does, so it covers no
  // candidate of a full rank.
  const battlefieldChoice =
    (interactions?.targetableCardIds?.length ?? 0) > 0 ||
    (boardCardPicker?.candidates.some(
      (candidate) =>
        candidate.zone === "backRank" || candidate.zone === "frontRank",
    ) ??
      false);
  const revealedHandCardPlacement: SharedHandCardRevealPlacement =
    battlefieldChoice ? "aside" : "reading";
  const selectedPickerCardIds =
    cardPickerSelection.pickerKey === cardPickerKey
      ? cardPickerSelection.ids
      : NO_CARD_IDS;
  const turnAnnouncementComplete =
    view.isOpeningTurn ||
    (completedTurnAnnouncement?.battleId === view.battleId &&
      completedTurnAnnouncement.turn === view.inspector.turn &&
      completedTurnAnnouncement.side === view.activeSide);
  const visibleDreamwell = turnAnnouncementComplete ? view.dreamwell : null;
  const activeSideHasChallengers =
    view.phase === "dusk" ||
    view.phase === "night" ||
    view.phase === "challenge";
  const handleTurnAnnouncementComplete = useCallback(
    (side: MobileBattleOwner): void => {
      setCompletedTurnAnnouncement({
        battleId: view.battleId,
        turn: view.inspector.turn,
        side,
      });
      onTurnAnnouncementComplete?.(side);
    },
    [onTurnAnnouncementComplete, view.battleId, view.inspector.turn],
  );

  const beginFigmentMerge = useCallback(
    (target: MobileBattleFigmentMergeTarget): void => {
      const sourceCard = findBattleCardView(
        latestView.current,
        target.sourceBattleCardId,
      );
      const sourceElement =
        [
          ...document.querySelectorAll<HTMLElement>("[data-battle-card-id]"),
        ].find(
          (element) =>
            element.dataset.battleCardId === target.sourceBattleCardId,
        ) ?? null;
      const targetElement = findSlotElement(target.target);
      if (
        sourceCard !== null &&
        sourceElement !== null &&
        targetElement !== null
      ) {
        setMergeAnimation({
          key: mergeAnimationSequence.current,
          sourceCard,
          sourceRect: sourceElement.getBoundingClientRect(),
          targetRect: targetElement.getBoundingClientRect(),
          target,
        });
        mergeAnimationSequence.current += 1;
      }
      setMergeConfirmation(null);
      setHoveredMergeTarget(null);
      interactions?.onFigmentMerge?.(target.sourceBattleCardId, target.target);
    },
    [interactions],
  );

  const handlePresentedSlotDrop = useCallback(
    (target: MobileBattleSlotTarget): void => {
      const mergeTarget =
        interactions?.figmentMergeTargets?.find((candidate) =>
          sameSlotTarget(candidate.target, target),
        ) ?? null;
      if (mergeTarget === null) {
        interactions?.onSlotDrop(target);
        return;
      }
      if (mergeTarget.status === "blocked-exhaustion") {
        setHoveredMergeTarget(null);
        setMergeNotice("exhaustion");
        return;
      }
      if (mergeTarget.requiresConfirmation) {
        setHoveredMergeTarget(null);
        setMergeConfirmation(mergeTarget);
        return;
      }
      beginFigmentMerge(mergeTarget);
    },
    [beginFigmentMerge, interactions],
  );

  const presentedInteractions = useMemo(
    () =>
      interactions === undefined
        ? undefined
        : {
            ...interactions,
            onSlotDrop: handlePresentedSlotDrop,
          },
    [handlePresentedSlotDrop, interactions],
  );

  useEffect(() => {
    if (mergeNotice === null) return;
    const timeout = window.setTimeout(
      () => setMergeNotice(null),
      FIGMENT_MERGE_NOTICE_MS / playbackSpeed,
    );
    return () => window.clearTimeout(timeout);
  }, [mergeNotice, playbackSpeed]);

  useEffect(() => {
    if (mergeAnimation === null) return;
    const timeout = window.setTimeout(
      () =>
        setMergeAnimation((current) =>
          current?.key === mergeAnimation.key ? null : current,
        ),
      (FIGMENT_MERGE_ANIMATION_SECONDS * 1_000) / playbackSpeed,
    );
    return () => window.clearTimeout(timeout);
  }, [mergeAnimation, playbackSpeed]);

  useEffect(() => {
    if (
      interactions?.pendingCardId === null ||
      interactions?.pendingCardId === undefined ||
      interactions.figmentMergeTargets?.length === 0
    ) {
      setHoveredMergeTarget(null);
      return;
    }
    const updateHoveredTarget = (event: MouseEvent | PointerEvent): void => {
      const elements =
        typeof document.elementsFromPoint === "function"
          ? document.elementsFromPoint(event.clientX, event.clientY)
          : typeof document.elementFromPoint === "function"
            ? [document.elementFromPoint(event.clientX, event.clientY)].filter(
                (element): element is Element => element !== null,
              )
            : [];
      const targets = elements
        .map((element) => slotTargetFromElement(element))
        .filter((target): target is MobileBattleSlotTarget => target !== null);
      if (targets.length === 0) return;
      const next =
        interactions.figmentMergeTargets?.find((candidate) =>
          targets.some((target) => sameSlotTarget(candidate.target, target)),
        ) ?? null;
      setHoveredMergeTarget((current) => {
        if (current === null || next === null) return next;
        return sameSlotTarget(current.target, next.target) ? current : next;
      });
    };
    window.addEventListener("pointermove", updateHoveredTarget);
    window.addEventListener("dragover", updateHoveredTarget);
    return () => {
      window.removeEventListener("pointermove", updateHoveredTarget);
      window.removeEventListener("dragover", updateHoveredTarget);
    };
  }, [interactions?.figmentMergeTargets, interactions?.pendingCardId]);

  useEffect(() => {
    setSelectedSide("player");
    setInspectorOpen(inspectorStartsOpen);
    setIsCardDragActive(false);
    setSnapLayoutCardId(null);
    setHoveredMergeTarget(null);
    setMergeConfirmation(null);
    setMergeNotice(null);
    setMergeAnimation(null);
    setCardPickerSelection({ pickerKey: null, ids: [] });
  }, [inspectorStartsOpen, setInspectorOpen, view.battleId]);

  useEffect(() => {
    const perspectiveChanged = previousPerspective.current !== view.perspective;
    previousPerspective.current = view.perspective;
    if (perspectiveChanged) {
      setSelectedSide("player");
      setInspectorOpen(false);
    }
    setIsCardDragActive(false);
    setSnapLayoutCardId(null);
    setHoveredMergeTarget(null);
    setMergeConfirmation(null);
    setCardPickerSelection({ pickerKey: null, ids: [] });
  }, [setInspectorOpen, view.perspective]);

  const handlePickerCardToggle = useCallback(
    (cardId: BattleCardId): void => {
      if (view.cardPicker === null) return;
      const nextIds = toggleCardPickerSelection(
        selectedPickerCardIds,
        cardId,
        view.cardPicker.count,
      );
      setCardPickerSelection({ pickerKey: view.cardPicker.key, ids: nextIds });
      interactions?.onCardPickerSelectionChange?.(nextIds);
    },
    [interactions, selectedPickerCardIds, view.cardPicker],
  );

  useEffect(() => {
    if (snapLayoutCardId === null || isCardDragActive) return;
    if (view !== snapLayoutOriginView.current) {
      const frame = window.requestAnimationFrame(() => {
        setSnapLayoutCardId((current) =>
          current === snapLayoutCardId ? null : current,
        );
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const timeout = window.setTimeout(() => {
      setSnapLayoutCardId((current) =>
        current === snapLayoutCardId ? null : current,
      );
    }, 1_000 / playbackSpeed);
    return () => window.clearTimeout(timeout);
  }, [isCardDragActive, playbackSpeed, snapLayoutCardId, view]);

  const handleCardDragChange = useCallback(
    (dragging: boolean, cardId?: BattleCardId): void => {
      setIsCardDragActive(dragging);
      if (dragging && cardId !== undefined) {
        snapLayoutOriginView.current = latestView.current;
        setSnapLayoutCardId(cardId);
      }
    },
    [],
  );

  useEffect(() => {
    if (previousDockLayout.current === isDockLayout) return;
    previousDockLayout.current = isDockLayout;
    setInspectorOpen(inspectorStartsOpen);
  }, [inspectorStartsOpen, isDockLayout, setInspectorOpen]);

  useEffect(() => {
    if (!isInspectorOpen) {
      openedLogKey.current = null;
      return;
    }
    const layout = isDockLayout ? "docked" : "takeover";
    const key = `${view.battleId}:${layout}`;
    if (openedLogKey.current === key) return;
    openedLogKey.current = key;
    interactions?.onInspectorAction?.({
      kind: "opened",
      layout,
      side: selectedSide,
    });
  }, [
    interactions,
    isDockLayout,
    isInspectorOpen,
    selectedSide,
    view.battleId,
  ]);

  const closeInspector = useCallback(() => {
    setInspectorOpen(false);
    requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  }, [setInspectorOpen]);

  useEffect(() => {
    if (isDockLayout || galleryCardPicker === null || !isInspectorOpen) return;
    closeInspector();
  }, [closeInspector, galleryCardPicker, isDockLayout, isInspectorOpen]);

  useEffect(() => {
    if (!isInspectorOpen || isDockLayout) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeInspector, isDockLayout, isInspectorOpen]);

  const selectSide = useCallback(
    (side: MobileBattleOwner) => {
      setSelectedSide(side);
      interactions?.onInspectorAction?.({ kind: "side-selected", side });
    },
    [interactions],
  );

  const handleInspectorAction = useCallback(
    (action: MobileBattleInspectorAction) => {
      if (
        (!isDockLayout &&
          (action.kind === "foresee" || action.kind === "reorder-deck")) ||
        action.kind === "open-battle-log" ||
        action.kind === "open-dreamwell-history"
      ) {
        closeInspector();
      }
      interactions?.onInspectorAction?.(action);
    },
    [closeInspector, interactions, isDockLayout],
  );

  const board = (
    <main
      className="cumulus"
      data-battle-mobile={view.battleId}
      data-battle-layout={isDesktop ? "desktop" : "mobile"}
      data-battle-card-layout-group={cardLayoutGroup}
      data-battle-perspective={view.perspective}
      onDragOver={(event) => {
        if (interactions?.pendingCardSource === "near-hand") {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (interactions?.pendingCardSource !== "near-hand") return;
        event.preventDefault();
        interactions.onHandCardDrop?.(
          closestOpenBackRankSlot(
            event.currentTarget,
            near.owner,
            event.clientX,
            event.clientY,
          ),
        );
      }}
      style={{
        ...rootStyle(isDesktop),
        position: "relative",
        inset: undefined,
        width: "100%",
        minWidth: 0,
      }}
    >
      <BattleBackdrop isDesktop={isDesktop} />
      <div
        aria-hidden="true"
        data-battle-mobile-safe-area-backdrop=""
        style={SAFE_AREA_BACKDROP_STYLE}
      />
      {view.result === null ? (
        <BattleTurnAnnouncement
          key={view.battleId}
          activeSide={view.activeSide}
          perspective={view.perspective}
          isDesktop={isDesktop}
          onComplete={handleTurnAnnouncementComplete}
          playbackSpeed={playbackSpeed}
        />
      ) : null}
      <BattleCardLayoutGroup
        battleId={view.battleId}
        ownership={cardLayoutGroup}
      >
        <FarHand
          owner={far.owner}
          cardIds={view.farHand.cardIds}
          cards={farHandCards}
          revealed={view.inspector.isFarHandRevealed}
          isDesktop={isDesktop}
          cardPicker={boardCardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
        />
        <SideZones
          activeSide={view.activeSide}
          dreamwell={
            visibleDreamwell?.side === far.owner ? visibleDreamwell : null
          }
          isDesktop={isDesktop}
          owner={far.owner}
          position="far"
          phase={view.phase}
          side={far}
          zoneLabels={zoneLabels}
          interactions={interactions}
        />
        <PlayArea
          isDesktop={isDesktop}
          owner={far.owner}
          position="far"
          side={far}
          mobileWindow={mobileWindow}
          layoutBackSlotCount={layoutBackSlotCount}
          densityBackSlotCount={densityBackSlotCount}
          centerAsymmetricDesktopRanks={centerAsymmetricDesktopRanks}
          cardSize={cardSize}
          centerOffset={centerOffset}
          draggingCardId={isCardDragActive ? snapLayoutCardId : null}
          snapLayoutCardId={snapLayoutCardId}
          cardPicker={boardCardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
          onBattlefieldDragChange={handleCardDragChange}
          hoveredMergeTarget={hoveredMergeTarget}
          onMergeTargetHover={setHoveredMergeTarget}
          guidedSlotHighlight={guidedSlotHighlight}
          preserveOccupiedSlotOutlines={preserveOccupiedSlotOutlines}
          allowSharedLayoutOverflow={cardLayoutGroup === "inherited"}
          showChallengerChevrons={
            activeSideHasChallengers && far.owner === view.activeSide
          }
          cardOverlay={cardOverlay}
          interactions={presentedInteractions}
        />
        <PlayArea
          isDesktop={isDesktop}
          owner={near.owner}
          position="near"
          side={near}
          mobileWindow={mobileWindow}
          layoutBackSlotCount={layoutBackSlotCount}
          densityBackSlotCount={densityBackSlotCount}
          centerAsymmetricDesktopRanks={centerAsymmetricDesktopRanks}
          cardSize={cardSize}
          centerOffset={centerOffset}
          draggingCardId={isCardDragActive ? snapLayoutCardId : null}
          snapLayoutCardId={snapLayoutCardId}
          cardPicker={boardCardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
          onBattlefieldDragChange={handleCardDragChange}
          hoveredMergeTarget={hoveredMergeTarget}
          onMergeTargetHover={setHoveredMergeTarget}
          guidedSlotHighlight={guidedSlotHighlight}
          preserveOccupiedSlotOutlines={preserveOccupiedSlotOutlines}
          allowSharedLayoutOverflow={cardLayoutGroup === "inherited"}
          showChallengerChevrons={
            activeSideHasChallengers && near.owner === view.activeSide
          }
          cardOverlay={cardOverlay}
          interactions={presentedInteractions}
        />
        <ControlRow
          cardPicker={boardCardPicker}
          choicePrompt={view.choicePrompt}
          promptHost={view.promptHost ?? null}
          selectedPickerCardIds={selectedPickerCardIds}
          isDesktop={isDesktop}
          interactions={interactions}
          layoutBackSlotCount={layoutBackSlotCount}
          nextPhaseAction={
            view.dreamwell === null || phaseNavigation !== "both"
              ? "nextPhase"
              : "continue"
          }
          phaseNavigation={phaseNavigation}
          perspective={view.perspective}
          rankShortcuts={view.rankShortcuts ?? null}
          tutorialNextAction={
            (view.activeSide === "enemy" && view.phase === "dusk") ||
            (view.activeSide === "player" && view.phase === "night")
              ? "startChallenge"
              : "endTurn"
          }
        />
        {targetingCard === null ? null : (
          <TargetingCardStage card={targetingCard} isDesktop={isDesktop} />
        )}
        <SideZones
          activeSide={view.activeSide}
          dreamwell={
            visibleDreamwell?.side === near.owner ? visibleDreamwell : null
          }
          isDesktop={isDesktop}
          owner={near.owner}
          position="near"
          phase={view.phase}
          side={near}
          zoneLabels={zoneLabels}
          interactions={interactions}
        />
        <NearHand
          owner={near.owner}
          cards={displayedNearHandCards}
          totalCount={nearHandCards.length}
          isDesktop={isDesktop}
          snapLayoutCardId={snapLayoutCardId}
          cardPicker={boardCardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
          onCardDragChange={handleCardDragChange}
          interactions={interactions}
        />
        {view.playReveal === undefined || view.playReveal === null ? null : (
          <BattlePlayReveal
            key={view.playReveal.card.id}
            reveal={view.playReveal}
            farOwner={far.owner}
          />
        )}
      </BattleCardLayoutGroup>
      {view.revealedHandCard !== undefined && view.revealedHandCard !== null ? (
        <div
          data-battle-card-reveal-layer=""
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            boxSizing: "border-box",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateRows: isDesktop ? DESKTOP_GRID_ROWS : MOBILE_GRID_ROWS,
            paddingTop: `var(${SAFE_AREA_INSET_PROPERTIES.top})`,
            paddingRight: `var(${SAFE_AREA_INSET_PROPERTIES.right})`,
            paddingBottom: `var(${SAFE_AREA_INSET_PROPERTIES.bottom})`,
            paddingLeft: `var(${SAFE_AREA_INSET_PROPERTIES.left})`,
            pointerEvents: "none",
          }}
        >
          <SharedHandCardReveal
            key={revealedHandCardPlacement}
            card={view.revealedHandCard}
            isDesktop={isDesktop}
            placement={revealedHandCardPlacement}
            interactions={interactions}
          />
        </div>
      ) : null}
      <div
        data-battle-top-left-controls=""
        style={{
          position: "absolute",
          top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-s")})`,
          left: `calc(var(${SAFE_AREA_INSET_PROPERTIES.left}) + ${token("--space-s")})`,
          zIndex: 20,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: token("--space-xs"),
        }}
      >
        {interactions?.onBattleLogOpen === undefined ? null : (
          <IconButton
            glyph={GLYPHS.list}
            size="sm"
            label={"Open battle log"}
            testId="battle-log-open"
            onPress={interactions.onBattleLogOpen}
          />
        )}
        {isDesktop &&
        banishedCardCount > 0 &&
        interactions?.onZoneOpen !== undefined ? (
          <div
            data-battle-zone="banished"
            data-battle-zone-count={String(banishedCardCount)}
            data-battle-zone-near-count={String(near.banishedCardCount)}
            data-battle-zone-far-count={String(far.banishedCardCount)}
          >
            <IconButton
              glyph={GLYPHS.block}
              size="sm"
              label={(banishedCardCount === 1 ? `Open ${formatNumber(banishedCardCount)} banished Card` : `Open ${formatNumber(banishedCardCount)} banished Cards`)}
              testId="near-battle-banished"
              onPress={() =>
                interactions.onZoneOpen?.({
                  owner: initialBanishedOwner,
                  zone: "banished",
                })
              }
            />
          </div>
        ) : null}
        <BattleControlMessage
          choicePrompt={
            (view.promptHost?.heading ?? null) === null ? view.choicePrompt : null
          }
          promptNotice={view.promptNotice}
        />
      </div>
      {inspectorVisibility === "available" ? (
        <div
          data-battle-top-right-controls=""
          style={{
            position: "absolute",
            top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-s")})`,
            right: `calc(var(${SAFE_AREA_INSET_PROPERTIES.right}) + ${token("--space-s")})`,
            zIndex: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: token("--space-xs"),
          }}
        >
          <BattleDebugMenu
            onFillBattlefieldPreview={interactions?.onFillBattlefieldPreview}
            onFillAsymmetricBattlefieldPreview={
              interactions?.onFillAsymmetricBattlefieldPreview
            }
          />
          <div
            ref={(node) => {
              inspectorTriggerRef.current =
                node?.querySelector("button") ?? null;
            }}
          >
            <IconButton
              glyph={GLYPHS.sidebarRight}
              size="sm"
              label={isInspectorOpen
                  ? "Close battle inspector"
                  : "Open battle inspector"}
              ariaExpanded={isInspectorOpen}
              ariaControls={INSPECTOR_ID}
              testId="battle-inspector-trigger"
              onPress={() => {
                if (isInspectorOpen) {
                  closeInspector();
                } else {
                  inspectorTriggerRef.current =
                    document.activeElement instanceof HTMLElement
                      ? document.activeElement
                      : inspectorTriggerRef.current;
                  setInspectorOpen(true);
                }
              }}
            />
          </div>
        </div>
      ) : null}
      {view.promptHost === null || view.promptHost === undefined ? null : (
        <BattlePromptHost
          view={view.promptHost}
          canAct={interactions?.canInteract === true}
          onCancel={interactions?.onPromptCancel}
          onArrangeSubmit={interactions?.onPromptArrangeSubmit}
          onRepeatLoop={interactions?.onRepeatLoop}
          onNoticeDismiss={interactions?.onPromptNoticeDismiss}
        />
      )}
      {galleryCardPicker !== null ? (
        <CardPickerGallery
          cardPicker={galleryCardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          isDesktop={isDesktop}
          onPickerCardToggle={handlePickerCardToggle}
          interactions={interactions}
          perspective={view.perspective}
        />
      ) : null}
    </main>
  );

  return (
    <>
      <style>{BATTLE_OVERLAY_CSS}</style>
      <div
        className="cumulus"
        data-battle-inspector-open={isInspectorOpen ? "true" : "false"}
        data-battle-inspector-layout={isDockLayout ? "docked" : "takeover"}
        style={{
          position: viewport === "contained" ? "absolute" : "fixed",
          inset: 0,
          display: "grid",
          gridTemplateColumns:
            inspectorVisibility === "available" &&
            isDockLayout &&
            isInspectorOpen
              ? `minmax(0, 1fr) ${MOBILE_BATTLE_INSPECTOR_RAIL_TRACK}`
              : "minmax(0, 1fr)",
          width: "100%",
          height: "100dvh",
          overflow: "hidden",
          background: token("--bg-app"),
        }}
      >
        {board}
        {inspectorVisibility === "available" &&
        isDockLayout &&
        isInspectorOpen ? (
          <BattleInspectorRail
            inspector={view.inspector}
            perspective={view.perspective}
            selectedSide={selectedSide}
            onSelectSide={selectSide}
            onClose={closeInspector}
            onPerspectiveToggle={interactions?.onPerspectiveToggle}
            onAction={handleInspectorAction}
          />
        ) : null}
      </div>
      {mergeAnimation !== null ? (
        <FigmentMergeAnimation
          key={mergeAnimation.key}
          animation={mergeAnimation}
        />
      ) : null}
      {mergeNotice !== null ? (
        <TransientStatusToast
          copy={{
            title: "Merge Blocked",
            message: "An exhausted Figment cannot be merged with one that is not exhausted.",
          }}
          onDismiss={() => setMergeNotice(null)}
        />
      ) : null}
      {mergeConfirmation !== null ? (
        <GlassDialog
          title={`Merge ${mergeConfirmation.figmentLabel}?`}
          presentation="popup"
          desktopCenterTarget="battlefield"
          onClose={() => setMergeConfirmation(null)}
          closeLabel={"Cancel"}
        >
          <div
            data-battle-figment-merge-confirmation=""
            style={{
              display: "grid",
              gap: token("--space-m"),
              maxWidth: 420,
            }}
          >
            <p
              style={{
                margin: 0,
                color: token("--text-on-glass"),
                font: token("--t-body"),
              }}
            >
              {renderRulesSymbolsInline(
                `Only ${formatNumber(mergeConfirmation.addedSpark)} ✦ from this Legionnaire will be added. Its Warrior-count bonus does not transfer. This merge cannot be undone.`,
              )}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: token("--space-xs"),
              }}
            >
              <GlassButton
                label={"Cancel"}
                placement="onGlass"
                onPress={() => setMergeConfirmation(null)}
              />
              <GlassButton
                label={"Merge"}
                variant="accent"
                placement="onGlass"
                testId="battle-figment-merge-confirm"
                onPress={() => beginFigmentMerge(mergeConfirmation)}
              />
            </div>
          </div>
        </GlassDialog>
      ) : null}
      {inspectorVisibility === "available" &&
      !isDockLayout &&
      isInspectorOpen ? (
        <GlassDialog
          title={"Battle Inspector"}
          subtitle={`Developer Tools · Opponent: ${view.inspector.opponentName}`}
          closeLabel={"Close battle inspector"}
          cutoutAwareClose
          fullScreen
          onClose={closeInspector}
        >
          <div
            id={INSPECTOR_ID}
            data-battle-inspector="takeover"
            style={{ width: "100%", maxWidth: 720, marginInline: "auto" }}
          >
            <BattleInspectorContent
              inspector={view.inspector}
              perspective={view.perspective}
              selectedSide={selectedSide}
              onSelectSide={selectSide}
              onPerspectiveToggle={interactions?.onPerspectiveToggle}
              onAction={handleInspectorAction}
            />
          </div>
        </GlassDialog>
      ) : null}
      {view.result !== null ? (
        <BattleResultSurface
          view={view.result}
          centerOnBattlefield={
            inspectorVisibility === "available" && isDockLayout && isInspectorOpen
          }
          onAction={interactions?.onResultAction}
        />
      ) : null}
    </>
  );
}
