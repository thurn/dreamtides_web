import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { LayoutGroup, motion } from "framer-motion";
import {
  GameCard,
  type GameCardModel,
} from "../components/card/CardView";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  BATTLEFIELD_CARD_CORNER_RADIUS,
  CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO_VALUE,
} from "../components/card/card-aspect";
import { BattleStatusDisplay } from "../components/battle/BattleStatusDisplay";
import {
  DreamwellCard,
  type DreamwellCardModel,
} from "../components/battle/DreamwellCard";
import { CardBack } from "../components/battle/CardBack";
import {
  CardPile,
  type BattlePileCard,
} from "../components/battle/CardPile";
import { GlassButton } from "../components/controls/GlassButton";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { GroupPanel } from "../components/controls/GroupPanel";
import { IconButton } from "../components/controls/IconButton";
import { NumberStepper } from "../components/controls/NumberStepper";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { DreamcallerVisual } from "../components/hud/DreamcallerPortrait";
import { GLYPHS } from "../primitives/glyph";
import {
  DOUBLE_TAP_WINDOW_MS,
  LONG_PRESS_THRESHOLD_MS,
  POINTER_MOVEMENT_SLOP_PX,
} from "../primitives/pointer-gesture";
import type { CumulusColor } from "../primitives/color";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { MOBILE_BATTLE_STARTING_BACK_RANK_SLOTS } from "./mobile-battle-layout";
import { useIsDesktop } from "./use-is-desktop";
import battleBackgroundUrl from "../assets/battle-background.png";

/** One physical face-up card instance rendered by the battle board. */
export interface MobileBattleCardView {
  readonly id: string;
  readonly model: GameCardModel;
  readonly exhausted: boolean;
  readonly figment: boolean;
  readonly figmentTitleBar: boolean;
  /** Draw the green playable-card outline on this hand card. */
  readonly showPlayableOutline: boolean;
}

/** A stable battlefield position which may currently be empty. */
export interface MobileBattleSlotView {
  readonly id: string;
  readonly card: MobileBattleCardView | null;
}

/** The compact resources and Dreamcaller identity shown for one side. */
export interface MobileBattleStatusView {
  readonly dreamcaller: DreamcallerVisual;
  readonly currentEnergy: number;
  readonly maxEnergy: number;
  readonly points: number;
}

/** Every zone owned by one side of the battle. */
export interface MobileBattleSideView {
  readonly deckCardIds: readonly string[];
  readonly voidCards: readonly MobileBattleCardView[];
  readonly backRank: readonly MobileBattleSlotView[];
  readonly frontRank: readonly MobileBattleSlotView[];
  readonly status: MobileBattleStatusView;
}

/** The complete, presentation-ready mobile battle board. */
export type MobileBattlePhase =
  | "dawn"
  | "day"
  | "dusk"
  | "night"
  | "challenge";

/** Presentation-only state for the AI action waiting on human approval. */
export interface MobileBattleAiApprovalView {
  readonly description: string;
  readonly canReject: boolean;
}

/** The active side's Dreamwell card while its reveal phase is surfaced. */
export interface MobileBattleDreamwellView {
  readonly side: MobileBattleOwner;
  readonly model: DreamwellCardModel;
}

export interface MobileBattleView {
  readonly battleId: string;
  readonly aiApproval: MobileBattleAiApprovalView | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly dreamwell: MobileBattleDreamwellView | null;
  readonly activeSide: MobileBattleOwner;
  readonly phase: MobileBattlePhase;
  readonly enemyHandCardIds: readonly string[];
  readonly enemyHand: readonly MobileBattleCardView[];
  readonly enemy: MobileBattleSideView;
  readonly player: MobileBattleSideView;
  readonly playerHand: readonly MobileBattleCardView[];
  readonly inspector: MobileBattleInspectorView;
}

/** An in-place hand-card decision owned by the authoritative battle prompt. */
export interface MobileBattleCardPickerView {
  readonly key: string;
  readonly side: MobileBattleOwner;
  readonly label: string;
  readonly candidateIds: readonly string[];
  readonly count: number;
  readonly optional: boolean;
  readonly canResolve: boolean;
}

export interface MobileBattleScreenProps {
  readonly view: MobileBattleView;
  readonly interactions?: MobileBattleInteractions;
}

export type MobileBattleOwner = "enemy" | "player";
export type MobileBattleRank = "back" | "front";
export type MobileBattleCardSource = "player-hand" | "battlefield";
export type MobileBattleDropZone = "deck" | "hand" | "void";
export type MobileBattleDebugAdjustment = -1 | 1;

export interface MobileBattleInspectorSideView {
  readonly side: MobileBattleOwner;
  readonly heading: "Your" | "Enemy";
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

export interface MobileBattleInspectorAiView {
  readonly proposal: string;
  readonly kind: string;
  readonly card: string;
  readonly target: string;
  readonly heuristicChange: string;
  readonly liveEvaluation: string;
}

export interface MobileBattleInspectorView {
  readonly opponentName: string;
  readonly turn: string;
  readonly phase: string;
  readonly activeSide: string;
  readonly result: string;
  readonly stackCount: number;
  readonly nextDreamwellOrder: string;
  readonly isOpponentHandRevealed: boolean;
  readonly isPlayerHandHidden: boolean;
  readonly sides: Readonly<Record<MobileBattleOwner, MobileBattleInspectorSideView>>;
  readonly ai: MobileBattleInspectorAiView | null;
}

export type MobileBattleInspectorAction =
  | { readonly kind: "opened"; readonly layout: "docked" | "takeover"; readonly side: MobileBattleOwner }
  | { readonly kind: "side-selected"; readonly side: MobileBattleOwner }
  | { readonly kind: "adjust-stat"; readonly side: MobileBattleOwner; readonly stat: "points" | "currentEnergy" | "maxEnergy"; readonly amount: MobileBattleDebugAdjustment }
  | { readonly kind: "adjust-energy-pair"; readonly side: MobileBattleOwner; readonly amount: MobileBattleDebugAdjustment }
  | { readonly kind: "draw" | "discard" | "foresee" | "shuffle" | "open-deck" | "dreamwell-draw" | "create-figment"; readonly side: MobileBattleOwner }
  | { readonly kind: "erode"; readonly side: MobileBattleOwner; readonly count: number }
  | { readonly kind: "open-pool-viewer" | "toggle-opponent-hand" | "toggle-player-hand" | "skip-to-rewards" | "reset-battle" }
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
  readonly slotId: string;
}

export interface MobileBattleZoneTarget {
  readonly owner: MobileBattleOwner;
  readonly zone: MobileBattleDropZone;
}

/** Intent-only gesture bridge owned by the live battle controller. */
export interface MobileBattleInteractions {
  readonly canInteract: boolean;
  readonly pendingCardId: string | null;
  readonly pendingCardSource?: MobileBattleCardSource | null;
  readonly pendingCardOwner?: MobileBattleOwner | null;
  readonly onHandCardActivate: (battleCardId: string) => void;
  readonly onHandCardDrop?: (target?: MobileBattleSlotTarget) => void;
  readonly onCardDebugActivate?: (
    battleCardId: string,
    source: MobileBattleCardSource,
    invocation: MobileBattleDebugInvocation,
  ) => void;
  readonly onCardDragStart: (
    battleCardId: string,
    source: MobileBattleCardSource,
  ) => void;
  readonly onCardDragEnd: () => void;
  readonly onSlotDrop: (target: MobileBattleSlotTarget) => void;
  readonly onZoneDrop: (target: MobileBattleZoneTarget) => void;
  readonly onPreviousPhase: () => void;
  readonly onNextPhase: () => void;
  readonly onApproveAiProposal?: () => void;
  readonly onRejectAiProposal?: () => void;
  readonly onCardPickerSelectionChange?: (chosenIds: readonly string[]) => void;
  readonly onCardPickerSubmit?: (chosenIds: readonly string[]) => void;
  readonly onCardPickerSkip?: () => void;
  readonly onFillBattlefieldPreview?: () => void;
  readonly onFillTwentyCardBattlefieldPreview?: () => void;
  readonly onInspectorAction?: (action: MobileBattleInspectorAction) => void;
}

function toggleCardPickerSelection(
  selectedIds: readonly string[],
  cardId: string,
  count: number,
): string[] {
  if (selectedIds.includes(cardId)) {
    return selectedIds.filter((selectedId) => selectedId !== cardId);
  }
  if (selectedIds.length < count) {
    return [...selectedIds, cardId];
  }
  return count === 1 ? [cardId] : [...selectedIds];
}

const ENEMY_HAND_VISIBLE_CARD_CAP = 6;
const BATTLEFIELD_SIDE_INSET_PERCENT = 6;
const DESKTOP_BATTLEFIELD_SIDE_INSET_PERCENT = 14;
const BATTLEFIELD_WIDTH_PERCENT = 100 - BATTLEFIELD_SIDE_INSET_PERCENT * 2;
const PHASE_LIGHT_SIZE = 6;
const PHASE_LIGHT_HALO_SIZE = 12;
const PHASE_LIGHT_STREAK_WIDTH = 16;
const PHASE_LIGHT_STREAK_HEIGHT = 2;
const PHASE_COMET_TAIL_START_SCALE = 0.35;
const PHASE_COMET_TAIL_PEAK_SCALE = 1.55;
const PHASE_CHALLENGE_PULSE_PEAK_SCALE = 1.65;
const PHASE_LIGHT_LEFT = {
  dawn: "10%",
  day: "30%",
  dusk: "50%",
  night: "70%",
  challenge: "90%",
} satisfies Record<MobileBattlePhase, string>;
const PHASE_LABEL = {
  dawn: "Dawn",
  day: "Day",
  dusk: "Dusk",
  night: "Night",
  challenge: "Challenge",
} satisfies Record<MobileBattlePhase, string>;

const BATTLE_PHASE_LIGHT_CSS = `
  :where([data-connected-count]) { display: none; }

  @keyframes battle-phase-comet-tail {
    0% { transform: translateY(-50%) scaleX(${String(PHASE_COMET_TAIL_START_SCALE)}); opacity: 0.12; }
    45% { transform: translateY(-50%) scaleX(${String(PHASE_COMET_TAIL_PEAK_SCALE)}); opacity: 0.52; }
    100% { transform: translateY(-50%) scaleX(1); opacity: 0.28; }
  }

  @keyframes battle-phase-challenge-pulse {
    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.22; }
    45% { transform: translate(-50%, -50%) scale(${String(PHASE_CHALLENGE_PULSE_PEAK_SCALE)}); opacity: 0.48; }
  }

  @media (prefers-reduced-motion: reduce) {
    [data-battle-phase-light],
    [data-battle-phase-light-halo],
    [data-battle-phase-light-streak] {
      animation: none !important;
      transition: none !important;
    }
  }
`;
// The status keeps its content-driven width while the two physical piles share
// the remaining room. This leaves a stable gap between all three objects and
// lets the phase controls size independently below the battlefield.
const SIDE_ZONES_GRID_TEMPLATE =
  "minmax(0, 1fr) max-content minmax(0, 1fr)";
const SIDE_PILE_MAX_WIDTH = 90;
const SIDE_PILE_HEIGHT = SIDE_PILE_MAX_WIDTH * CARD_ASPECT_RATIO_VALUE;
// Desktop keeps the three status objects in one centered landscape dock so
// the wide viewport creates deliberate outer whitespace instead of stretching
// the mobile spacing rhythm edge-to-edge.
const DESKTOP_SIDE_ZONES_MAX_WIDTH = 1180;
const DESKTOP_SIDE_PILE_MAX_WIDTH = 120;
const DESKTOP_SIDE_PILE_HEIGHT =
  DESKTOP_SIDE_PILE_MAX_WIDTH * CARD_ASPECT_RATIO_VALUE;
const NEXT_PHASE_CONTROL_WIDTH = 120;
const PLAYER_HAND_Z_INDEX = 15;
// Mobile player zones share the hand track and lift one spacing step above it.
// Desktop gives both sides matching rows immediately outside the play areas.
const PLAYER_HAND_TOP = `calc(${token("--space-12")} - ${token("--space-7")} + ${token("--space-2")})`;

const MOBILE_GRID_ROWS =
  "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) minmax(0, 12fr) minmax(0, 27fr)";
const DESKTOP_GRID_ROWS =
  "minmax(0, 8fr) minmax(0, 11fr) minmax(0, 23fr) minmax(0, 23fr) minmax(0, 11fr) minmax(0, 24fr)";

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

function EnemyHand({
  cardIds,
  cards,
  revealed,
  isDesktop,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
}: {
  readonly cardIds: readonly string[];
  readonly cards: readonly MobileBattleCardView[];
  readonly revealed: boolean;
  readonly isDesktop: boolean;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly string[];
  readonly onPickerCardToggle: (cardId: string) => void;
}) {
  const enemyCardPicker = cardPicker?.side === "enemy" ? cardPicker : null;
  const pickerCandidateIds = new Set(enemyCardPicker?.candidateIds ?? []);
  const showFaceUp = revealed || enemyCardPicker !== null;
  const visibleCardIds = enemyCardPicker === null
    ? cardIds.slice(0, ENEMY_HAND_VISIBLE_CARD_CAP)
    : cardIds;
  return (
    <div
      data-battle-mobile-row="enemy-hand"
      data-battle-hand-count={cardIds.length}
      data-battle-hand-visible-count={visibleCardIds.length}
      style={{
        ...ROW_STYLE,
        gridRow: 1,
        overflow: "hidden",
        display: isDesktop ? "flex" : undefined,
        alignItems: isDesktop ? "flex-start" : undefined,
        justifyContent: isDesktop ? "center" : undefined,
        gap: isDesktop ? token("--space-2") : undefined,
      }}
    >
      {visibleCardIds.map((cardId, index) => {
        const card = cards.find((candidate) => candidate.id === cardId);
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
            data-battle-card-zone="enemy-hand"
            data-battle-card-face={showFaceUp ? "up" : "down"}
            data-battle-card-picker-candidate={
              pickerCandidateIds.has(cardId) ? "true" : undefined
            }
            data-battle-card-picker-selected={
              selectedPickerCardIds.includes(cardId) ? "true" : undefined
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
              <FaceUpCard
                card={card}
                zone="enemy-hand"
                showRulesText
                selection={
                  enemyCardPicker === null
                    ? undefined
                    : {
                        selected: selectedPickerCardIds.includes(cardId),
                        color: "gold-light",
                      }
                }
                interaction={
                  pickerCandidateIds.has(cardId)
                    ? {
                        draggable: false,
                        debugGesture: isDesktop
                          ? "context-menu"
                          : "double-tap",
                        onActivate: () => onPickerCardToggle(cardId),
                      }
                    : undefined
                }
              />
            ) : (
              <motion.div
                layoutId={`battle-card:${cardId}`}
                data-battle-card-motion=""
                style={{ width: "100%", height: "100%" }}
              >
                <CardBack label="Enemy card" />
              </motion.div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function toDeckPile(cardIds: readonly string[]): readonly BattlePileCard[] {
  return cardIds.map((id) => ({ face: "down", id }));
}

function toVoidPile(
  cards: readonly MobileBattleCardView[],
): readonly BattlePileCard[] {
  return cards.map((card) => ({
    face: "up",
    id: card.id,
    model: card.model,
    figment: card.figment,
    figmentTitleBar: card.figmentTitleBar,
  }));
}

function SideZones({
  activeSide,
  dreamwell,
  isDesktop,
  owner,
  phase,
  side,
  interactions,
}: {
  readonly activeSide: MobileBattleOwner;
  readonly dreamwell: MobileBattleDreamwellView | null;
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly phase: MobileBattlePhase;
  readonly side: MobileBattleSideView;
  readonly interactions?: MobileBattleInteractions;
}) {
  const deck = toDeckPile(side.deckCardIds);
  const voidPile = toVoidPile(side.voidCards);
  const canDrop =
    interactions?.canInteract === true
    && interactions.pendingCardId !== null
    && interactions.pendingCardSource !== "player-hand";
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
        gridRow: owner === "enemy" ? 2 : isDesktop ? 5 : 6,
        ...(owner === "player"
          ? isDesktop
            ? { alignSelf: "stretch", zIndex: 3 }
            : {
                alignSelf: "start",
                height: token("--space-12"),
                transform: `translateY(calc(-1 * ${token("--space-7")}))`,
                zIndex: 3,
              }
          : null),
        display: "grid",
        gridTemplateColumns: SIDE_ZONES_GRID_TEMPLATE,
        alignItems: "center",
        justifySelf: isDesktop ? "center" : undefined,
        width: isDesktop ? "100%" : undefined,
        maxWidth: isDesktop ? DESKTOP_SIDE_ZONES_MAX_WIDTH : undefined,
        columnGap: token(isDesktop ? "--space-12" : "--space-7"),
        paddingInline: token(isDesktop ? "--space-8" : "--space-4"),
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
          height: owner === "player" ? "100%" : "72%",
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
            cards={deck}
            orientation="landscape"
            label={`${owner === "enemy" ? "Enemy" : "Player"} deck`}
            testId={`${owner}-battle-deck`}
          />
        </div>
      </div>
      <div
        data-battle-zone={`${owner}-status`}
        style={{
          minWidth: 0,
          minHeight: 0,
          height: owner === "player" ? "100%" : "82%",
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
            height:
              owner === "player"
                ? isDesktop
                  ? DESKTOP_SIDE_PILE_HEIGHT
                  : SIDE_PILE_HEIGHT
                : undefined,
          }}
        >
          <BattleStatusDisplay
            owner={owner}
            dreamcaller={side.status.dreamcaller}
            currentEnergy={side.status.currentEnergy}
            maxEnergy={side.status.maxEnergy}
            points={side.status.points}
            testId={`${owner}-battle-status`}
          />
          {owner === "player" && dreamwell !== null ? (
            <div
              data-battle-dreamwell-layer=""
              data-battle-dreamwell-side={dreamwell.side}
              style={{
                position: "absolute",
                left: "50%",
                bottom: isDesktop
                  ? `calc(100% + ${token("--space-3")})`
                  : `calc(100% + ${token("--space-3")} + ${token("--space-12")} + ${token("--space-4")})`,
                width: isDesktop ? 360 : "min(76vw, 340px)",
                maxWidth: "calc(100vw - 2 * var(--gutter))",
                transform: "translateX(-50%)",
                pointerEvents: "none",
                zIndex: 12,
                animation: "none",
                transition: "none",
              }}
            >
              <DreamwellCard model={dreamwell.model} />
            </div>
          ) : null}
          {activeSide === owner ? (
            <PhaseIndicator owner={owner} phase={phase} />
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
          height: owner === "player" ? "100%" : "72%",
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
            orientation="landscape"
            label={`${owner === "enemy" ? "Enemy" : "Player"} void`}
            testId={`${owner}-battle-void`}
          />
        </div>
      </div>
    </div>
  );
}

function PhaseIndicator({
  owner,
  phase,
}: {
  readonly owner: MobileBattleOwner;
  readonly phase: MobileBattlePhase;
}) {
  const ownerLabel = owner === "player" ? "Player" : "Opponent";
  return (
    <div
      role="img"
      aria-label={`${ownerLabel} turn, ${PHASE_LABEL[phase]} phase`}
      data-battle-phase-indicator={owner}
      data-battle-mobile-phase={phase}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: owner === "player" ? "100%" : 0,
        height: 0,
        pointerEvents: "none",
      }}
    >
      <span
        aria-hidden="true"
        data-battle-phase-light=""
        style={{
          position: "absolute",
          top: 0,
          left: PHASE_LIGHT_LEFT[phase],
          width: PHASE_LIGHT_SIZE,
          height: PHASE_LIGHT_SIZE,
          transform: "translate(-50%, -50%)",
          transition: `left ${token("--motion-object-travel")}`,
        }}
      >
        <span
          key={`${phase}-streak`}
          data-battle-phase-light-streak=""
          style={{
            position: "absolute",
            top: "50%",
            right: "50%",
            width: PHASE_LIGHT_STREAK_WIDTH,
            height: PHASE_LIGHT_STREAK_HEIGHT,
            transform: "translateY(-50%)",
            transformOrigin: "right center",
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--accent-bright"),
            boxShadow: token("--glow-accent-soft"),
            opacity: 0.28,
            animation: `battle-phase-comet-tail ${token("--dur-slow")} ${token("--ease-out")}`,
          }}
        />
        <span
          key={`${phase}-halo`}
          data-battle-phase-light-halo=""
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: PHASE_LIGHT_HALO_SIZE,
            height: PHASE_LIGHT_HALO_SIZE,
            transform: "translate(-50%, -50%)",
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--accent"),
            boxShadow: token("--glow-accent-soft"),
            opacity: 0.22,
            animation:
              phase === "challenge"
                ? `battle-phase-challenge-pulse ${token("--dur-slow")} ${token("--ease-out")}`
                : undefined,
          }}
        />
        <span
          data-battle-phase-light-core=""
          style={{
            position: "absolute",
            inset: 0,
            width: PHASE_LIGHT_SIZE,
            height: PHASE_LIGHT_SIZE,
            borderRadius: token("--radius-pill"),
            backgroundColor: token("--accent-bright"),
            boxShadow: token("--glow-accent-soft"),
          }}
        />
      </span>
    </div>
  );
}

interface LinearTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

const IDENTITY_LINEAR_TRANSFORM: LinearTransform = { a: 1, b: 0, c: 0, d: 1 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function inverseLinearTransform(element: HTMLElement | null): LinearTransform {
  if (element === null) return IDENTITY_LINEAR_TRANSFORM;
  const transform = getComputedStyle(element).transform;
  const matrix = /^matrix\(([^)]+)\)$/.exec(transform);
  const matrix3d = /^matrix3d\(([^)]+)\)$/.exec(transform);
  const values = (matrix?.[1] ?? matrix3d?.[1])
    ?.split(",")
    .map((value) => Number(value.trim()));
  if (values === undefined) return IDENTITY_LINEAR_TRANSFORM;
  const [a, b, c, d] =
    matrix !== null
      ? [values[0], values[1], values[2], values[3]]
      : [values[0], values[1], values[4], values[5]];
  if (
    a === undefined ||
    b === undefined ||
    c === undefined ||
    d === undefined
  ) {
    return IDENTITY_LINEAR_TRANSFORM;
  }
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON) {
    return IDENTITY_LINEAR_TRANSFORM;
  }
  return {
    a: d / determinant,
    b: -b / determinant,
    c: -c / determinant,
    d: a / determinant,
  };
}

function FaceUpCard({
  card,
  zone,
  showRulesText = false,
  snapLayout = false,
  selection,
  interaction,
}: {
  readonly card: MobileBattleCardView;
  readonly zone: string;
  readonly showRulesText?: boolean;
  readonly snapLayout?: boolean;
  readonly selection?: {
    readonly selected: boolean;
    readonly color: CumulusColor;
  };
  readonly interaction?: {
    readonly draggable: boolean;
    readonly debugGesture: "context-menu" | "double-tap";
    readonly onActivate?: () => void;
    readonly onDebugActivate?: (
      invocation: MobileBattleDebugInvocation,
    ) => void;
    readonly onDragStart?: () => void;
    readonly onDragEnd?: () => void;
    readonly onPointerDrop?: (clientX: number, clientY: number) => void;
  };
}) {
  const dragSuppressedRef = useRef(false);
  const longPressSuppressedRef = useRef(false);
  const touchPressStartedAtRef = useRef<number | null>(null);
  const pendingTapRef = useRef<number | null>(null);
  const pointerDragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    inverseParentTransform: LinearTransform;
    originBounds: DOMRect;
    constraintBounds: DOMRect | null;
  } | null>(null);
  const draggable = interaction?.draggable === true;
  const activatable = interaction?.onActivate !== undefined;
  const restingTransform = "";
  const cancelPendingTap = (): void => {
    if (pendingTapRef.current === null) return;
    window.clearTimeout(pendingTapRef.current);
    pendingTapRef.current = null;
  };
  useEffect(() => cancelPendingTap, []);
  const finishPointerDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    drop: boolean,
  ): void => {
    const pointerDrag = pointerDragRef.current;
    if (pointerDrag?.pointerId !== event.pointerId) {
      return;
    }
    if (pointerDrag.dragging) {
      event.preventDefault();
      if (drop) {
        const pointerEvents = event.currentTarget.style.pointerEvents;
        event.currentTarget.style.pointerEvents = "none";
        try {
          interaction?.onPointerDrop?.(event.clientX, event.clientY);
        } finally {
          event.currentTarget.style.pointerEvents = pointerEvents;
        }
      }
      interaction?.onDragEnd?.();
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort in browsers that have already released it.
    }
    pointerDragRef.current = null;
    event.currentTarget.dataset.battlePointerDragging = "false";
    event.currentTarget.style.zIndex = "";
    event.currentTarget.style.transform = restingTransform;
  };
  return (
    <motion.div
      data-battle-card-id={card.id}
      data-battle-card-zone={zone}
      data-battle-card-face="up"
      data-battle-card-exhausted={card.exhausted ? "true" : "false"}
      data-battle-pointer-dragging="false"
      draggable={false}
      onPointerDownCapture={(event) => {
        dragSuppressedRef.current = false;
        longPressSuppressedRef.current = false;
        touchPressStartedAtRef.current =
          event.pointerType === "touch" ? event.timeStamp : null;
        if (!draggable || event.button !== 0) return;
        pointerDragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          inverseParentTransform: inverseLinearTransform(
            event.currentTarget.parentElement,
          ),
          originBounds: event.currentTarget.getBoundingClientRect(),
          constraintBounds:
            event.currentTarget
              .closest<HTMLElement>("[data-battle-play-area]")
              ?.getBoundingClientRect() ?? null,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort on older Mobile Safari versions.
        }
      }}
      onPointerMove={(event) => {
        const pointerDrag = pointerDragRef.current;
        if (pointerDrag?.pointerId !== event.pointerId) {
          return;
        }
        const requestedViewportX = event.clientX - pointerDrag.startX;
        const requestedViewportY = event.clientY - pointerDrag.startY;
        if (
          !pointerDrag.dragging &&
          Math.hypot(requestedViewportX, requestedViewportY) <=
            POINTER_MOVEMENT_SLOP_PX
        ) {
          return;
        }
        event.preventDefault();
        const dragStarted = !pointerDrag.dragging;
        if (dragStarted) {
          touchPressStartedAtRef.current = null;
          pointerDrag.dragging = true;
          dragSuppressedRef.current = true;
          event.currentTarget.dataset.battlePointerDragging = "true";
          event.currentTarget.style.zIndex = "100";
        }
        const viewportX = pointerDrag.constraintBounds === null
          ? requestedViewportX
          : clamp(
              requestedViewportX,
              pointerDrag.constraintBounds.left - pointerDrag.originBounds.left,
              pointerDrag.constraintBounds.right - pointerDrag.originBounds.right,
            );
        const viewportY = pointerDrag.constraintBounds === null
          ? requestedViewportY
          : clamp(
              requestedViewportY,
              pointerDrag.constraintBounds.top - pointerDrag.originBounds.top,
              pointerDrag.constraintBounds.bottom - pointerDrag.originBounds.bottom,
            );
        const inverse = pointerDrag.inverseParentTransform;
        const x = inverse.a * viewportX + inverse.c * viewportY;
        const y = inverse.b * viewportX + inverse.d * viewportY;
        // Pointer movement must reach the compositor before React rerenders the
        // full card/reveal subtree; otherwise the card trails the finger.
        event.currentTarget.style.transform = [
          restingTransform,
          `translate3d(${String(x)}px, ${String(y)}px, 0)`,
        ]
          .filter(Boolean)
          .join(" ");
        if (dragStarted) {
          window.dispatchEvent(new Event("dragstart"));
          interaction?.onDragStart?.();
        }
      }}
      onPointerUpCapture={(event) => {
        if (
          event.pointerType === "touch" &&
          touchPressStartedAtRef.current !== null &&
          event.timeStamp - touchPressStartedAtRef.current >=
            LONG_PRESS_THRESHOLD_MS
        ) {
          longPressSuppressedRef.current = true;
        }
        touchPressStartedAtRef.current = null;
        finishPointerDrag(event, true);
      }}
      onPointerCancelCapture={(event) => {
        touchPressStartedAtRef.current = null;
        finishPointerDrag(event, false);
      }}
      onClick={(event) => {
        if (!activatable && interaction?.onDebugActivate === undefined) return;
        event.stopPropagation();
        if (longPressSuppressedRef.current) {
          longPressSuppressedRef.current = false;
          dragSuppressedRef.current = false;
          cancelPendingTap();
          return;
        }
        if (dragSuppressedRef.current) {
          dragSuppressedRef.current = false;
          return;
        }
        if (interaction?.onDebugActivate === undefined) {
          interaction?.onActivate?.();
          return;
        }
        if (interaction.debugGesture === "context-menu") {
          interaction.onActivate?.();
          return;
        }
        if (pendingTapRef.current !== null) {
          cancelPendingTap();
          interaction.onDebugActivate({ presentation: "sheet" });
          return;
        }
        pendingTapRef.current = window.setTimeout(() => {
          pendingTapRef.current = null;
          interaction?.onActivate?.();
        }, DOUBLE_TAP_WINDOW_MS);
      }}
      onContextMenu={(event) => {
        if (
          interaction?.debugGesture !== "context-menu" ||
          interaction.onDebugActivate === undefined
        ) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        cancelPendingTap();
        interaction.onDebugActivate({
          presentation: "context-menu",
          x: event.clientX,
          y: event.clientY,
        });
      }}
      style={{
        width: "100%",
        cursor: draggable ? "grab" : activatable ? "pointer" : undefined,
        position: "relative",
        touchAction: draggable ? "none" : undefined,
        transform: restingTransform || undefined,
        transformOrigin: "50% 50%",
      }}
    >
      <motion.div
        layoutId={snapLayout ? undefined : `battle-card:${card.id}`}
        data-battle-card-motion=""
        data-battle-card-layout-motion={snapLayout ? "snap" : "travel"}
        style={{ width: "100%", height: "100%" }}
      >
        <GameCard
          model={card.model}
          selected={selection?.selected ?? card.showPlayableOutline}
          selectionColor={selection?.color ?? "positive"}
          hideRulesText={!showRulesText}
          presentation={showRulesText ? "full" : "battlefield"}
          figment={card.figment}
          figmentTitleBar={card.figmentTitleBar}
          testId={`battle-card-face:${card.id}`}
        />
      </motion.div>
    </motion.div>
  );
}

function lastFilledSlotCount(slots: readonly MobileBattleSlotView[]): number {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    if (slots[index]?.card !== null) return index + 1;
  }
  return 0;
}

function battlefieldLayoutBackSlotCount(
  view: MobileBattleView,
  isDesktop: boolean,
): number {
  const sides = [view.enemy, view.player] as const;
  return Math.max(
    isDesktop ? MOBILE_BATTLE_STARTING_BACK_RANK_SLOTS : 1,
    ...sides.map((side) => lastFilledSlotCount(side.backRank)),
    ...sides.map((side) => lastFilledSlotCount(side.frontRank) + 1),
  );
}

function battlefieldCardSize(layoutBackSlotCount: number): string {
  const slotCount = Math.max(layoutBackSlotCount, 1);
  const horizontalGapCount = Math.max(slotCount - 1, 0);
  return `min(22cqw, calc((${String(BATTLEFIELD_WIDTH_PERCENT)}cqw - ${String(horizontalGapCount)} * ${token("--space-2")}) / ${String(slotCount)}), calc((200cqh - 3 * ${token("--space-2")}) / 4))`;
}

function battlefieldTrackWidth(
  slotCount: number,
  cardSize: string,
): string {
  const gapCount = Math.max(slotCount - 1, 0);
  return `calc(${String(slotCount)} * ${cardSize} + ${String(gapCount)} * ${token("--space-2")})`;
}

function desktopRankSlots(
  slots: readonly MobileBattleSlotView[],
  rank: MobileBattleRank,
  slotCount: number,
): readonly MobileBattleSlotView[] {
  if (slots.length >= slotCount) return slots;
  const prefix = rank === "back" ? "B" : "F";
  return [
    ...slots,
    ...Array.from({ length: slotCount - slots.length }, (_unused, offset) => ({
      id: `${prefix}${String(slots.length + offset)}`,
      card: null,
    })),
  ];
}

function Rank({
  isDesktop,
  owner,
  rank,
  slots,
  layoutBackSlotCount,
  cardSize,
  order,
  draggingCardId,
  snapLayoutCardId,
  onBattlefieldDragChange,
  interactions,
}: {
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly rank: MobileBattleRank;
  readonly slots: readonly MobileBattleSlotView[];
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
  readonly order: number;
  readonly draggingCardId: string | null;
  readonly snapLayoutCardId: string | null;
  readonly onBattlefieldDragChange: (
    dragging: boolean,
    cardId?: string,
  ) => void;
  readonly interactions?: MobileBattleInteractions;
}) {
  const canDrop =
    interactions?.canInteract === true
    && interactions.pendingCardId !== null
    && interactions.pendingCardSource !== "player-hand"
    && (interactions.pendingCardOwner === null
      || interactions.pendingCardOwner === undefined
      || interactions.pendingCardOwner === owner);
  const layoutSlotCount =
    rank === "back"
      ? layoutBackSlotCount
      : Math.max(layoutBackSlotCount - 1, 1);
  const visibleSlots = isDesktop
    ? desktopRankSlots(slots, rank, layoutSlotCount)
    : slots;
  const isCenterFacingRank =
    (owner === "enemy" && order === 1) ||
    (owner === "player" && order === 0);
  const centerOffset = token("--space-1");
  const outerOffset = `calc(${cardSize} + ${token("--space-2")} + ${centerOffset})`;
  return (
    <div
      data-battle-rank={`${owner}-${rank}`}
      data-battle-rank-order={order}
      style={{
        position: "absolute",
        left: `${String(isDesktop ? DESKTOP_BATTLEFIELD_SIDE_INSET_PERCENT : BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
        right: `${String(isDesktop ? DESKTOP_BATTLEFIELD_SIDE_INSET_PERCENT : BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
        height: cardSize,
        top:
          owner === "player"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        bottom:
          owner === "enemy"
            ? isCenterFacingRank
              ? centerOffset
              : outerOffset
            : undefined,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: rank === "front" ? 2 : 1,
      }}
    >
      <div
        data-battle-rank-track=""
        style={{
          position: "relative",
          flex: "0 0 auto",
          width: battlefieldTrackWidth(layoutSlotCount, cardSize),
          height: cardSize,
          display: "grid",
          gridTemplateColumns: `repeat(${String(layoutSlotCount)}, ${cardSize})`,
          gridAutoColumns: cardSize,
          gridAutoFlow: "column",
          columnGap: token("--space-2"),
        }}
      >
        {visibleSlots.map((slot) => (
          <div
            key={slot.id}
            data-battle-slot-id={slot.id}
            data-battle-slot-filled={slot.card !== null ? "true" : "false"}
            data-battle-mobile-drop-kind="slot"
            data-battle-mobile-drop-owner={owner}
            data-battle-mobile-drop-rank={rank}
            data-battle-mobile-drop-slot-id={slot.id}
            data-battle-drop-target={canDrop ? "true" : undefined}
            onDragOver={(event) => {
              if (canDrop) event.preventDefault();
            }}
            onDrop={(event) => {
              if (!canDrop) return;
              event.preventDefault();
              interactions.onSlotDrop({ owner, rank, slotId: slot.id });
            }}
            style={{
              position: "relative",
              width: cardSize,
              aspectRatio: BATTLEFIELD_CARD_ASPECT_RATIO,
              boxSizing: "border-box",
            }}
          >
            {slot.card === null || slot.card.id === draggingCardId ? (
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
                  zIndex: 3,
                }}
              />
            ) : null}
            {slot.card !== null ? (
              <FaceUpCard
                card={slot.card}
                zone={`${owner}-${rank}-rank`}
                snapLayout={snapLayoutCardId === slot.card.id}
                interaction={
                  interactions === undefined
                    ? undefined
                    : {
                        draggable: interactions.canInteract,
                        debugGesture: isDesktop
                          ? "context-menu"
                          : "double-tap",
                        onDragStart: () => {
                          onBattlefieldDragChange(true, slot.card?.id);
                          interactions.onCardDragStart(
                            slot.card?.id ?? "",
                            "battlefield",
                          );
                        },
                        ...(interactions.onCardDebugActivate === undefined
                          ? {}
                          : {
                              onDebugActivate: (invocation) =>
                                interactions.onCardDebugActivate?.(
                                  slot.card?.id ?? "",
                                  "battlefield",
                                  invocation,
                                ),
                            }),
                        onDragEnd: () => {
                          onBattlefieldDragChange(false);
                          interactions.onCardDragEnd();
                        },
                        onPointerDrop: (clientX, clientY) =>
                          dropMobileCardAtPoint(
                            interactions,
                            clientX,
                            clientY,
                          ),
                      }
                }
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayArea({
  isDesktop,
  owner,
  side,
  layoutBackSlotCount,
  cardSize,
  draggingCardId,
  snapLayoutCardId,
  onBattlefieldDragChange,
  interactions,
}: {
  readonly isDesktop: boolean;
  readonly owner: MobileBattleOwner;
  readonly side: MobileBattleSideView;
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
  readonly draggingCardId: string | null;
  readonly snapLayoutCardId: string | null;
  readonly onBattlefieldDragChange: (
    dragging: boolean,
    cardId?: string,
  ) => void;
  readonly interactions?: MobileBattleInteractions;
}) {
  const ranks =
    owner === "enemy"
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
        gridRow: owner === "enemy" ? 3 : 4,
        overflow: "hidden",
        containerType: "size",
      }}
    >
      {ranks.map(([rank, slots], order) => (
        <Rank
          key={rank}
          isDesktop={isDesktop}
          owner={owner}
          rank={rank}
          slots={slots}
          layoutBackSlotCount={layoutBackSlotCount}
          cardSize={cardSize}
          order={order}
          draggingCardId={draggingCardId}
          snapLayoutCardId={snapLayoutCardId}
          onBattlefieldDragChange={onBattlefieldDragChange}
          interactions={interactions}
        />
      ))}
    </div>
  );
}

function PlayerHand({
  cards,
  isDesktop,
  snapLayoutCardId,
  cardPicker,
  selectedPickerCardIds,
  onPickerCardToggle,
  onCardDragChange,
  interactions,
}: {
  readonly cards: readonly MobileBattleCardView[];
  readonly isDesktop: boolean;
  readonly snapLayoutCardId: string | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly string[];
  readonly onPickerCardToggle: (cardId: string) => void;
  readonly onCardDragChange: (dragging: boolean, cardId?: string) => void;
  readonly interactions?: MobileBattleInteractions;
}) {
  const pickerCandidateIds = new Set(cardPicker?.candidateIds ?? []);
  const canDrop =
    cardPicker === null &&
    interactions?.canInteract === true
    && interactions.pendingCardId !== null
    && interactions.pendingCardSource !== "player-hand";
  return (
    <div
      data-battle-mobile-row="player-hand"
      data-battle-hand-count={cards.length}
      data-battle-hand-visible-count={cards.length}
      data-battle-mobile-drop-kind="zone"
      data-battle-mobile-drop-owner="player"
      data-battle-mobile-drop-zone="hand"
      data-battle-drop-target={canDrop ? "true" : undefined}
      onDragOver={(event) => {
        if (canDrop) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!canDrop) return;
        event.preventDefault();
        interactions.onZoneDrop({ owner: "player", zone: "hand" });
      }}
      style={{
        ...ROW_STYLE,
        gridColumn: 1,
        gridRow: 6,
        zIndex: PLAYER_HAND_Z_INDEX,
        overflow:
          interactions?.pendingCardId !== undefined
          && interactions.pendingCardId !== null
            ? "visible"
            : "hidden",
        display: isDesktop ? "flex" : undefined,
        alignItems: isDesktop ? "flex-start" : undefined,
        justifyContent: isDesktop ? "center" : undefined,
        gap: isDesktop ? token("--space-2") : undefined,
        paddingTop: isDesktop ? token("--space-8") : undefined,
        transform: isDesktop
          ? `translateY(${token("--space-8")})`
          : undefined,
        boxSizing: isDesktop ? "border-box" : undefined,
      }}
    >
      {cards.map((card, index) => {
        const isPickerCandidate = pickerCandidateIds.has(card.id);
        const isPickerSelected = selectedPickerCardIds.includes(card.id);
        const { left, normalized } = centeredFanPosition({
          index,
          count: cards.length,
          maximumSpread: isDesktop ? 72 : 82,
          spacing: isDesktop ? 16 : 18,
        });
        const rotation = normalized * (isDesktop ? 8 : 18);
        const drop = normalized * normalized * (isDesktop ? 8 : 18);
        return (
          <div
            key={card.id}
            data-battle-card-picker-candidate={
              cardPicker !== null && isPickerCandidate ? "true" : undefined
            }
            data-battle-card-picker-selected={
              cardPicker !== null && isPickerSelected ? "true" : undefined
            }
            style={{
              position: isDesktop ? "relative" : "absolute",
              left: isDesktop ? undefined : left,
              top: isDesktop ? undefined : PLAYER_HAND_TOP,
              height: isDesktop ? "88%" : "92%",
              flex: isDesktop ? "0 0 auto" : undefined,
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 100%",
              transform: isDesktop
                ? `translateY(${String(drop)}%) rotate(${String(rotation)}deg)`
                : `translateX(-50%) translateY(${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            <FaceUpCard
              card={card}
              zone="player-hand"
              showRulesText
              snapLayout={snapLayoutCardId === card.id}
              selection={
                cardPicker === null
                  ? undefined
                  : { selected: isPickerSelected, color: "gold-light" }
              }
              interaction={
                cardPicker !== null
                  ? isPickerCandidate
                    ? {
                        draggable: false,
                        debugGesture: isDesktop
                          ? "context-menu"
                          : "double-tap",
                        onActivate: () => onPickerCardToggle(card.id),
                      }
                    : undefined
                  : interactions === undefined
                  ? undefined
                  : {
                      draggable: interactions.canInteract,
                      debugGesture: isDesktop
                        ? "context-menu"
                        : "double-tap",
                      onActivate: () =>
                        interactions.onHandCardActivate(card.id),
                      ...(interactions.onCardDebugActivate === undefined
                        ? {}
                        : {
                            onDebugActivate: (invocation) =>
                              interactions.onCardDebugActivate?.(
                                card.id,
                                "player-hand",
                                invocation,
                              ),
                          }),
                      onDragStart: () => {
                        onCardDragChange(true, card.id);
                        interactions.onCardDragStart(card.id, "player-hand");
                      },
                      onDragEnd: () => {
                        onCardDragChange(false);
                        interactions.onCardDragEnd();
                      },
                      onPointerDrop: (clientX, clientY) =>
                        dropMobileCardAtPoint(
                          interactions,
                          clientX,
                          clientY,
                        ),
                    }
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function dropMobileCardAtPoint(
  interactions: MobileBattleInteractions,
  clientX: number,
  clientY: number,
): void {
  const hitTarget = document.elementFromPoint(clientX, clientY);
  if (interactions.pendingCardSource === "player-hand") {
    const battleScreen = hitTarget?.closest<HTMLElement>(
      "[data-battle-mobile]",
    );
    interactions.onHandCardDrop?.(
      battleScreen === undefined || battleScreen === null
        ? undefined
        : closestOpenBackRankSlot(battleScreen, "player", clientX, clientY),
    );
    return;
  }
  const target = hitTarget?.closest<HTMLElement>(
    "[data-battle-mobile-drop-kind]",
  );
  if (target === undefined || target === null) return;
  const owner = target.dataset.battleMobileDropOwner;
  if (owner !== "enemy" && owner !== "player") return;
  if (
    interactions.pendingCardOwner !== null &&
    interactions.pendingCardOwner !== undefined &&
    interactions.pendingCardOwner !== owner
  ) {
    return;
  }
  if (target.dataset.battleMobileDropKind === "slot") {
    const rank = target.dataset.battleMobileDropRank;
    const slotId = target.dataset.battleMobileDropSlotId;
    if ((rank !== "back" && rank !== "front") || slotId === undefined) return;
    interactions.onSlotDrop({ owner, rank, slotId });
    return;
  }
  const zone = target.dataset.battleMobileDropZone;
  if (zone !== "deck" && zone !== "hand" && zone !== "void") return;
  interactions.onZoneDrop({ owner, zone });
}

function closestOpenBackRankSlot(
  battleScreen: HTMLElement,
  owner: MobileBattleOwner,
  clientX: number,
  clientY: number,
): MobileBattleSlotTarget | undefined {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return undefined;

  let closest:
    | { readonly slotId: string; readonly distanceSquared: number }
    | undefined;
  const slots = battleScreen.querySelectorAll<HTMLElement>(
    `[data-battle-rank="${owner}-back"] [data-battle-slot-filled="false"]`,
  );
  slots.forEach((slot) => {
    const slotId = slot.dataset.battleSlotId;
    if (slotId === undefined) return;
    const bounds = slot.getBoundingClientRect();
    const deltaX = clientX - (bounds.left + bounds.width / 2);
    const deltaY = clientY - (bounds.top + bounds.height / 2);
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    if (closest === undefined || distanceSquared < closest.distanceSquared) {
      closest = { slotId, distanceSquared };
    }
  });

  return closest === undefined
    ? undefined
    : { owner, rank: "back", slotId: closest.slotId };
}

function ControlRow({
  aiApproval,
  cardPicker,
  selectedPickerCardIds,
  isDesktop,
  interactions,
}: {
  readonly aiApproval: MobileBattleAiApprovalView | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly selectedPickerCardIds: readonly string[];
  readonly isDesktop: boolean;
  readonly interactions?: MobileBattleInteractions;
}) {
  const disabled = interactions?.canInteract !== true;
  const requiredPickerCount = cardPicker === null
    ? 0
    : Math.min(cardPicker.count, cardPicker.candidateIds.length);
  const canSubmitPicker = cardPicker !== null
    && cardPicker.canResolve
    && selectedPickerCardIds.length === requiredPickerCount;
  return (
    <div
      data-battle-mobile-row="control-row"
      aria-label="Battle controls"
      style={{
        ...ROW_STYLE,
        gridRow: 5,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "flex-end",
        justifySelf: isDesktop ? "center" : undefined,
        width: isDesktop ? "100%" : undefined,
        maxWidth: isDesktop ? DESKTOP_SIDE_ZONES_MAX_WIDTH : undefined,
        boxSizing: "border-box",
        paddingInline: token(isDesktop ? "--space-8" : "--space-4"),
        paddingTop: token(isDesktop ? "--space-5" : "--space-4"),
        zIndex: 10,
      }}
    >
      {cardPicker !== null ? (
        <div
          data-battle-card-picker-controls=""
          style={{
            width: "100%",
            minWidth: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: token("--space-4"),
            position: "relative",
            zIndex: 10,
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
            {cardPicker.label} · {String(selectedPickerCardIds.length)}/{String(requiredPickerCount)}
          </span>
          {cardPicker.optional ? (
            <GlassButton
              label="Skip"
              disabled={!cardPicker.canResolve}
              testId="battle-card-picker-skip"
              onPress={() => interactions?.onCardPickerSkip?.()}
            />
          ) : null}
          <GlassButton
            label="Submit"
            variant="accent"
            disabled={!canSubmitPicker || interactions?.onCardPickerSubmit === undefined}
            testId="battle-card-picker-submit"
            onPress={() => interactions?.onCardPickerSubmit?.(selectedPickerCardIds)}
          />
        </div>
      ) : (
        <div
          data-battle-phase-controls="row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: token("--space-4"),
            position: "relative",
            zIndex: 10,
          }}
        >
          <div data-battle-phase-back="">
            <IconButton
              glyph={GLYPHS.arrowLeft}
              size="sm"
              label="Back"
              disabled={disabled}
              onPress={() => interactions?.onPreviousPhase()}
            />
          </div>
          <div
            data-battle-phase-next=""
            data-battle-ai-approval-controls={
              aiApproval === null ? undefined : ""
            }
            style={{
              width: aiApproval === null ? NEXT_PHASE_CONTROL_WIDTH : undefined,
              display: aiApproval === null ? "grid" : "flex",
              alignItems: aiApproval === null ? undefined : "center",
              justifyContent: aiApproval === null ? undefined : "flex-end",
              gap: aiApproval === null ? undefined : token("--space-4"),
            }}
          >
            {aiApproval === null ? (
              <GlassButton
                label="Next Phase"
                variant="accent"
                disabled={disabled}
                onPress={() => interactions?.onNextPhase()}
              />
            ) : (
              <>
                {aiApproval.canReject ? (
                  <IconButton
                    glyph={GLYPHS.close}
                    size="sm"
                    label="Reject AI action"
                    disabled={interactions?.onRejectAiProposal === undefined}
                    onPress={() => interactions?.onRejectAiProposal?.()}
                  />
                ) : null}
                <GlassButton
                  label="Continue"
                  variant="accent"
                  disabled={interactions?.onApproveAiProposal === undefined}
                  onPress={() => interactions?.onApproveAiProposal?.()}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AiApprovalMessage({
  aiApproval,
}: {
  readonly aiApproval: MobileBattleAiApprovalView | null;
}) {
  if (aiApproval === null) return null;
  return (
    <div
      aria-live="polite"
      data-battle-ai-approval-message=""
      style={{
        position: "absolute",
        top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
        left: `calc(var(${SAFE_AREA_INSET_PROPERTIES.left}) + ${token("--space-4")})`,
        zIndex: 20,
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
      {aiApproval.description}
    </div>
  );
}

function BattleDebugMenu({
  onFillBattlefieldPreview,
  onFillTwentyCardBattlefieldPreview,
}: {
  readonly onFillBattlefieldPreview?: () => void;
  readonly onFillTwentyCardBattlefieldPreview?: () => void;
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
        gap: token("--space-3"),
      }}
    >
      <IconButton
        glyph={GLYPHS.bug}
        size="sm"
        label="Battle debug menu"
        ariaExpanded={isOpen}
        testId="battle-debug-menu-trigger"
        onPress={() => setIsOpen((open) => !open)}
      />
      {isOpen ? (
        <div
          role="menu"
          aria-label="Battle debug actions"
          style={{ position: "absolute", top: `calc(100% + ${token("--space-3")})`, right: 0, width: 300 }}
        >
          <GlassPanel radius="popover" tint="popover">
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: token("--space-3"),
                padding: token("--space-5"),
              }}
            >
              <GlassButton
                label="Fill Battlefield + Voids"
                placement="onGlass"
                disabled={onFillBattlefieldPreview === undefined}
                testId="battle-debug-fill-grid"
                onPress={() => {
                  onFillBattlefieldPreview?.();
                  setIsOpen(false);
                }}
              />
              <GlassButton
                label="Fill 20 vs 9 + Voids"
                placement="onGlass"
                disabled={onFillTwentyCardBattlefieldPreview === undefined}
                testId="battle-debug-fill-twenty-player"
                onPress={() => {
                  onFillTwentyCardBattlefieldPreview?.();
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

function InspectorValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token("--space-1"), minWidth: 0 }}>
      <span style={{ color: token("--text-on-glass-muted"), font: token("--t-caption") }}>{label}</span>
      <span style={{ color: token("--text-on-glass"), font: token("--t-body-sm"), overflowWrap: "anywhere" }}>{value}</span>
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
  readonly testId?: string;
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

function BattleInspectorContent({
  inspector,
  selectedSide,
  onSelectSide,
  onAction,
}: {
  readonly inspector: MobileBattleInspectorView;
  readonly selectedSide: MobileBattleOwner;
  readonly onSelectSide: (side: MobileBattleOwner) => void;
  readonly onAction?: (action: MobileBattleInspectorAction) => void;
}) {
  const side = inspector.sides[selectedSide];
  const [erodeCount, setErodeCount] = useState(1);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [endBattleOpen, setEndBattleOpen] = useState(false);
  const actionGrid: CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: token("--space-3"),
  };
  const groupLayout: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: token("--space-4"),
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token("--space-4") }}>
      <GroupPanel>
        <div style={{ ...groupLayout, gap: token("--space-3") }}>
          <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>Battle Snapshot</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: token("--space-4") }}>
            <InspectorValue label="Turn" value={inspector.turn} />
            <InspectorValue label="Phase" value={inspector.phase} />
            <InspectorValue label="Active side" value={inspector.activeSide} />
            <InspectorValue label="Result" value={inspector.result} />
            <InspectorValue label="Stack cards" value={String(inspector.stackCount)} />
            <InspectorValue label="Next Dreamwell order" value={inspector.nextDreamwellOrder} />
          </div>
        </div>
      </GroupPanel>

      <div style={{ position: "sticky", top: 0, zIndex: 2 }}>
        <GroupPanel>
          <div style={groupLayout}>
            <SegmentedControl
              full
              options={[{ value: "player", label: "You" }, { value: "enemy", label: "Enemy" }]}
              value={selectedSide}
              onChange={(value) => onSelectSide(value as MobileBattleOwner)}
            />
          </div>
        </GroupPanel>
      </div>

      <GroupPanel>
        <div style={groupLayout}>
          <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>{side.heading} Resources</h3>
          <NumberStepper label="Points" value={side.points} resource="points" decrementLabel={`Decrease ${side.heading.toLowerCase()} points`} incrementLabel={`Increase ${side.heading.toLowerCase()} points`} decrementDisabled={side.points <= 0 || onAction === undefined} incrementDisabled={onAction === undefined} onDecrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "points", amount: -1 })} onIncrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "points", amount: 1 })} />
          <NumberStepper label="Current energy" value={side.currentEnergy} resource="energy" decrementLabel={`Decrease ${side.heading.toLowerCase()} current energy`} incrementLabel={`Increase ${side.heading.toLowerCase()} current energy`} decrementDisabled={side.currentEnergy <= 0 || onAction === undefined} incrementDisabled={onAction === undefined} onDecrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "currentEnergy", amount: -1 })} onIncrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "currentEnergy", amount: 1 })} />
          <NumberStepper label="Maximum energy" value={side.maxEnergy} resource="energy" decrementLabel={`Decrease ${side.heading.toLowerCase()} maximum energy`} incrementLabel={`Increase ${side.heading.toLowerCase()} maximum energy`} decrementDisabled={side.maxEnergy <= 0 || onAction === undefined} incrementDisabled={onAction === undefined} onDecrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "maxEnergy", amount: -1 })} onIncrement={() => onAction?.({ kind: "adjust-stat", side: selectedSide, stat: "maxEnergy", amount: 1 })} />
          <NumberStepper label="Current + maximum" value={side.currentEnergy} displayValue={`${String(side.currentEnergy)}/${String(side.maxEnergy)}`} resource="energy" decrementLabel={`Decrease ${side.heading.toLowerCase()} current and maximum energy`} incrementLabel={`Increase ${side.heading.toLowerCase()} current and maximum energy`} decrementDisabled={side.currentEnergy <= 0 || side.maxEnergy <= 0 || onAction === undefined} incrementDisabled={onAction === undefined} onDecrement={() => onAction?.({ kind: "adjust-energy-pair", side: selectedSide, amount: -1 })} onIncrement={() => onAction?.({ kind: "adjust-energy-pair", side: selectedSide, amount: 1 })} />
        </div>
      </GroupPanel>

      <GroupPanel>
        <div style={groupLayout}>
          <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>{side.heading} Zones</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: token("--space-4") }}>
            <InspectorValue label="Hand" value={String(side.zones.hand)} />
            <InspectorValue label="Deck" value={String(side.zones.deck)} />
            <InspectorValue label="Void" value={String(side.zones.void)} />
            <InspectorValue label="Banished" value={String(side.zones.banished)} />
            <InspectorValue label="Back Rank" value={String(side.zones.backRank)} />
            <InspectorValue label="Front Rank" value={String(side.zones.frontRank)} />
          </div>
        </div>
      </GroupPanel>

      <GroupPanel>
        <div style={groupLayout}>
          <h3 style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-title-sm") }}>{side.heading} Actions</h3>
          <div style={actionGrid}>
            <InspectorButton label="Draw" variant="accent" onPress={() => onAction?.({ kind: "draw", side: selectedSide })} disabled={onAction === undefined} testId={`battle-inspector-draw-${selectedSide}`} />
            <InspectorButton label="Discard" onPress={() => onAction?.({ kind: "discard", side: selectedSide })} disabled={!side.canDiscard || onAction === undefined} testId={`battle-inspector-discard-${selectedSide}`} />
          </div>
          <h4 style={{ margin: 0, color: token("--text-on-glass-muted"), font: token("--t-button-sm") }}>Deck & Effects</h4>
          <div style={actionGrid}>
            <InspectorButton label="Foresee" onPress={() => onAction?.({ kind: "foresee", side: selectedSide })} disabled={onAction === undefined} />
            <InspectorButton label="Shuffle" onPress={() => onAction?.({ kind: "shuffle", side: selectedSide })} disabled={!side.canShuffle || onAction === undefined} />
            <InspectorButton label="Open Deck" onPress={() => onAction?.({ kind: "open-deck", side: selectedSide })} disabled={onAction === undefined} />
            <InspectorButton label="Dreamwell + Draw" onPress={() => onAction?.({ kind: "dreamwell-draw", side: selectedSide })} disabled={onAction === undefined} />
          </div>
          <NumberStepper label="Erode count" value={erodeCount} decrementLabel={`Decrease erode count for ${side.heading.toLowerCase()}`} incrementLabel={`Increase erode count for ${side.heading.toLowerCase()}`} decrementDisabled={erodeCount <= 1} onDecrement={() => setErodeCount((current) => Math.max(1, current - 1))} onIncrement={() => setErodeCount((current) => current + 1)} />
          <div style={actionGrid}>
            <InspectorButton label={`Erode ${String(erodeCount)}`} onPress={() => onAction?.({ kind: "erode", side: selectedSide, count: erodeCount })} disabled={onAction === undefined} />
            <InspectorButton label="Create Figment" onPress={() => onAction?.({ kind: "create-figment", side: selectedSide })} disabled={onAction === undefined} />
          </div>
        </div>
      </GroupPanel>

      <DisclosureSection title="View & Visibility" summary="Pool and hidden hands" expanded={visibilityOpen} onExpandedChange={setVisibilityOpen}>
        <div style={{ ...actionGrid, marginTop: token("--space-4") }}>
          <InspectorButton label="Pool Viewer" onPress={() => onAction?.({ kind: "open-pool-viewer" })} disabled={onAction === undefined} />
          <InspectorButton label={inspector.isOpponentHandRevealed ? "Hide Enemy Hand" : "Show Enemy Hand"} onPress={() => onAction?.({ kind: "toggle-opponent-hand" })} disabled={onAction === undefined} />
          <InspectorButton label={inspector.isPlayerHandHidden ? "Show Your Hand" : "Hide Your Hand"} onPress={() => onAction?.({ kind: "toggle-player-hand" })} disabled={onAction === undefined} />
        </div>
      </DisclosureSection>

      {inspector.ai !== null ? (
        <DisclosureSection title="AI Analysis" summary={inspector.ai.kind} expanded={aiOpen} onExpandedChange={setAiOpen}>
          <div style={{ display: "grid", gap: token("--space-4"), marginTop: token("--space-4") }}>
            <InspectorValue label="Proposal" value={inspector.ai.proposal} />
            <InspectorValue label="Kind" value={inspector.ai.kind} />
            <InspectorValue label="Card" value={inspector.ai.card} />
            <InspectorValue label="Target" value={inspector.ai.target} />
            <InspectorValue label="Heuristic change" value={inspector.ai.heuristicChange} />
            <InspectorValue label="Live evaluation" value={inspector.ai.liveEvaluation} />
          </div>
        </DisclosureSection>
      ) : null}

      <DisclosureSection title="End Battle" summary="Outcomes and local reset" expanded={endBattleOpen} onExpandedChange={setEndBattleOpen}>
        <div style={{ ...actionGrid, marginTop: token("--space-4") }}>
          <InspectorButton label="Skip to Rewards" onPress={() => onAction?.({ kind: "skip-to-rewards" })} disabled={onAction === undefined} />
          <InspectorButton label="Force Defeat" onPress={() => onAction?.({ kind: "force-result", result: "defeat" })} disabled={onAction === undefined} />
          <InspectorButton label="Force Draw" onPress={() => onAction?.({ kind: "force-result", result: "draw" })} disabled={onAction === undefined} />
          <InspectorButton label="Reset Battle" variant="danger" onPress={() => onAction?.({ kind: "reset-battle" })} disabled={onAction === undefined} />
        </div>
      </DisclosureSection>
    </div>
  );
}

function BattleInspectorRail({
  inspector,
  selectedSide,
  onSelectSide,
  onClose,
  onAction,
}: {
  readonly inspector: MobileBattleInspectorView;
  readonly selectedSide: MobileBattleOwner;
  readonly onSelectSide: (side: MobileBattleOwner) => void;
  readonly onClose: () => void;
  readonly onAction?: (action: MobileBattleInspectorAction) => void;
}) {
  return (
    <aside id={INSPECTOR_ID} data-battle-inspector="docked" style={{ minWidth: 0, height: "100dvh" }}>
      <GlassPanel frame="edgeRail" eyebrow="Developer Tools" title="Battle Inspector" subtitle={`Opponent: ${inspector.opponentName}`} headerSpacing="compact" rightAccessory={{ kind: "iconButton", glyph: GLYPHS.close, label: "Close battle inspector", onPress: onClose, size: "sm" }}>
        <div style={{ height: "100%", overflowY: "auto", padding: token("--space-5"), boxSizing: "border-box" }}>
          <BattleInspectorContent inspector={inspector} selectedSide={selectedSide} onSelectSide={onSelectSide} onAction={onAction} />
        </div>
      </GlassPanel>
    </aside>
  );
}

/** Responsive battle table composed entirely from physical battle objects. */
export function MobileBattleScreen({ view, interactions }: MobileBattleScreenProps) {
  const isDesktop = useIsDesktop();
  const isDockLayout = useIsDesktop(INSPECTOR_DOCK_MIN_WIDTH);
  const [isInspectorOpen, setIsInspectorOpen] = useState(isDockLayout);
  const [isCardDragActive, setIsCardDragActive] = useState(false);
  const [snapLayoutCardId, setSnapLayoutCardId] = useState<string | null>(null);
  const [cardPickerSelection, setCardPickerSelection] = useState<{
    readonly pickerKey: string | null;
    readonly ids: readonly string[];
  }>({ pickerKey: null, ids: [] });
  const [selectedSide, setSelectedSide] = useState<MobileBattleOwner>("player");
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);
  const previousDockLayout = useRef(isDockLayout);
  const openedLogKey = useRef<string | null>(null);
  const snapLayoutOriginView = useRef<MobileBattleView | null>(null);
  const layoutBackSlotCount = battlefieldLayoutBackSlotCount(view, isDesktop);
  const cardSize = battlefieldCardSize(layoutBackSlotCount);
  const cardPickerKey = view.cardPicker?.key ?? null;
  const selectedPickerCardIds = cardPickerSelection.pickerKey === cardPickerKey
    ? cardPickerSelection.ids
    : [];

  useEffect(() => {
    setSelectedSide("player");
    setIsInspectorOpen(isDockLayout);
    setIsCardDragActive(false);
    setSnapLayoutCardId(null);
    setCardPickerSelection({ pickerKey: null, ids: [] });
  }, [view.battleId]);

  const handlePickerCardToggle = useCallback((cardId: string): void => {
    if (view.cardPicker === null) return;
    const nextIds = toggleCardPickerSelection(
      selectedPickerCardIds,
      cardId,
      view.cardPicker.count,
    );
    setCardPickerSelection({ pickerKey: view.cardPicker.key, ids: nextIds });
    interactions?.onCardPickerSelectionChange?.(nextIds);
  }, [interactions, selectedPickerCardIds, view.cardPicker]);

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
    }, 1_000);
    return () => window.clearTimeout(timeout);
  }, [isCardDragActive, snapLayoutCardId, view]);

  const handleCardDragChange = useCallback((
    dragging: boolean,
    cardId?: string,
  ): void => {
    setIsCardDragActive(dragging);
    if (dragging && cardId !== undefined) {
      snapLayoutOriginView.current = view;
      setSnapLayoutCardId(cardId);
    }
  }, [view]);

  useEffect(() => {
    if (previousDockLayout.current === isDockLayout) return;
    previousDockLayout.current = isDockLayout;
    setIsInspectorOpen(isDockLayout);
  }, [isDockLayout]);

  useEffect(() => {
    if (!isInspectorOpen) {
      openedLogKey.current = null;
      return;
    }
    const layout = isDockLayout ? "docked" : "takeover";
    const key = `${view.battleId}:${layout}`;
    if (openedLogKey.current === key) return;
    openedLogKey.current = key;
    interactions?.onInspectorAction?.({ kind: "opened", layout, side: selectedSide });
  }, [interactions, isDockLayout, isInspectorOpen, selectedSide, view.battleId]);

  const closeInspector = useCallback(() => {
    setIsInspectorOpen(false);
    requestAnimationFrame(() => inspectorTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isInspectorOpen || isDockLayout) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeInspector, isDockLayout, isInspectorOpen]);

  const selectSide = useCallback((side: MobileBattleOwner) => {
    setSelectedSide(side);
    interactions?.onInspectorAction?.({ kind: "side-selected", side });
  }, [interactions]);

  const handleInspectorAction = useCallback((action: MobileBattleInspectorAction) => {
    if (!isDockLayout && action.kind === "foresee") {
      closeInspector();
    }
    interactions?.onInspectorAction?.(action);
  }, [closeInspector, interactions, isDockLayout]);

  const board = (
    <main
      className="cumulus"
      data-battle-mobile={view.battleId}
      data-battle-layout={isDesktop ? "desktop" : "mobile"}
      onDragOver={(event) => {
        if (interactions?.pendingCardSource === "player-hand") {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (interactions?.pendingCardSource !== "player-hand") return;
        event.preventDefault();
        interactions.onHandCardDrop?.(
          closestOpenBackRankSlot(
            event.currentTarget,
            "player",
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
      <div aria-hidden="true" data-battle-mobile-safe-area-backdrop="" style={SAFE_AREA_BACKDROP_STYLE} />
      <LayoutGroup id={`mobile-battle:${view.battleId}`}>
        <EnemyHand
          cardIds={view.enemyHandCardIds}
          cards={view.enemyHand}
          revealed={view.inspector.isOpponentHandRevealed}
          isDesktop={isDesktop}
          cardPicker={view.cardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
        />
        <SideZones activeSide={view.activeSide} dreamwell={view.dreamwell} isDesktop={isDesktop} owner="enemy" phase={view.phase} side={view.enemy} interactions={interactions} />
        <PlayArea isDesktop={isDesktop} owner="enemy" side={view.enemy} layoutBackSlotCount={layoutBackSlotCount} cardSize={cardSize} draggingCardId={isCardDragActive ? snapLayoutCardId : null} snapLayoutCardId={snapLayoutCardId} onBattlefieldDragChange={handleCardDragChange} interactions={interactions} />
        <PlayArea isDesktop={isDesktop} owner="player" side={view.player} layoutBackSlotCount={layoutBackSlotCount} cardSize={cardSize} draggingCardId={isCardDragActive ? snapLayoutCardId : null} snapLayoutCardId={snapLayoutCardId} onBattlefieldDragChange={handleCardDragChange} interactions={interactions} />
        <ControlRow
          aiApproval={view.aiApproval}
          cardPicker={view.cardPicker}
          selectedPickerCardIds={selectedPickerCardIds}
          isDesktop={isDesktop}
          interactions={interactions}
        />
        <SideZones activeSide={view.activeSide} dreamwell={view.dreamwell} isDesktop={isDesktop} owner="player" phase={view.phase} side={view.player} interactions={interactions} />
        <PlayerHand
          cards={view.inspector.isPlayerHandHidden ? [] : view.playerHand}
          isDesktop={isDesktop}
          snapLayoutCardId={snapLayoutCardId}
          cardPicker={view.cardPicker?.side === "player" ? view.cardPicker : null}
          selectedPickerCardIds={selectedPickerCardIds}
          onPickerCardToggle={handlePickerCardToggle}
          onCardDragChange={handleCardDragChange}
          interactions={interactions}
        />
      </LayoutGroup>
      <AiApprovalMessage aiApproval={view.aiApproval} />
      <div
        style={{
          position: "absolute",
          top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
          right: `calc(var(${SAFE_AREA_INSET_PROPERTIES.right}) + ${token("--space-4")})`,
          zIndex: 20,
          display: "flex",
          alignItems: "flex-start",
          gap: token("--space-3"),
        }}
      >
        <BattleDebugMenu
          onFillBattlefieldPreview={interactions?.onFillBattlefieldPreview}
          onFillTwentyCardBattlefieldPreview={interactions?.onFillTwentyCardBattlefieldPreview}
        />
        <div ref={(node) => { inspectorTriggerRef.current = node?.querySelector("button") ?? null; }}>
          <IconButton
            glyph={GLYPHS.sidebarRight}
            size="sm"
            label={isInspectorOpen ? "Close battle inspector" : "Open battle inspector"}
            ariaExpanded={isInspectorOpen}
            ariaControls={INSPECTOR_ID}
            testId="battle-inspector-trigger"
            onPress={() => {
              if (isInspectorOpen) {
                closeInspector();
              } else {
                inspectorTriggerRef.current = document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : inspectorTriggerRef.current;
                setIsInspectorOpen(true);
              }
            }}
          />
        </div>
      </div>
    </main>
  );

  return (
    <>
      <style>{BATTLE_PHASE_LIGHT_CSS}</style>
      <div
        className="cumulus"
        data-battle-inspector-open={isInspectorOpen ? "true" : "false"}
        data-battle-inspector-layout={isDockLayout ? "docked" : "takeover"}
        style={{
          position: "fixed",
          inset: 0,
          display: "grid",
          gridTemplateColumns: isDockLayout && isInspectorOpen
            ? "minmax(0, 1fr) clamp(340px, 25vw, 400px)"
            : "minmax(0, 1fr)",
          width: "100%",
          height: "100dvh",
          overflow: "hidden",
          background: token("--bg-app"),
        }}
      >
        {board}
        {isDockLayout && isInspectorOpen ? (
          <BattleInspectorRail
            inspector={view.inspector}
            selectedSide={selectedSide}
            onSelectSide={selectSide}
            onClose={closeInspector}
            onAction={handleInspectorAction}
          />
        ) : null}
      </div>
      {!isDockLayout && isInspectorOpen ? (
        <GlassDialog
          title="Battle Inspector"
          subtitle={`Developer Tools · Opponent: ${view.inspector.opponentName}`}
          closeLabel="Close battle inspector"
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
              selectedSide={selectedSide}
              onSelectSide={selectSide}
              onAction={handleInspectorAction}
            />
          </div>
        </GlassDialog>
      ) : null}
    </>
  );
}
