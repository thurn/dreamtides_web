import { useEffect, useRef, useState, type CSSProperties } from "react";
import { LayoutGroup, motion } from "framer-motion";
import {
  GameCard,
  type GameCardModel,
} from "../components/card/CardView";
import {
  BATTLEFIELD_CARD_ASPECT_RATIO,
  CARD_ASPECT_RATIO,
} from "../components/card/card-aspect";
import { BattleStatusDisplay } from "../components/battle/BattleStatusDisplay";
import { CardBack } from "../components/battle/CardBack";
import {
  CardPile,
  type BattlePileCard,
} from "../components/battle/CardPile";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { DreamcallerVisual } from "../components/hud/DreamcallerPortrait";
import { GLYPHS } from "../primitives/glyph";
import {
  DOUBLE_TAP_WINDOW_MS,
  POINTER_MOVEMENT_SLOP_PX,
} from "../primitives/pointer-gesture";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import battleBackgroundUrl from "../assets/battle-background.png";

/** One physical face-up card instance rendered by the battle board. */
export interface MobileBattleCardView {
  readonly id: string;
  readonly model: GameCardModel;
  readonly exhausted: boolean;
  readonly figment: boolean;
  readonly figmentTitleBar: boolean;
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

export interface MobileBattleView {
  readonly battleId: string;
  readonly activeSide: MobileBattleOwner;
  readonly phase: MobileBattlePhase;
  readonly enemyHandCardIds: readonly string[];
  readonly enemy: MobileBattleSideView;
  readonly player: MobileBattleSideView;
  readonly playerHand: readonly MobileBattleCardView[];
}

export interface MobileBattleScreenProps {
  readonly view: MobileBattleView;
  readonly interactions?: MobileBattleInteractions;
}

export type MobileBattleOwner = "enemy" | "player";
export type MobileBattleRank = "back" | "front";
export type MobileBattleCardSource = "player-hand" | "battlefield";
export type MobileBattleDropZone = "deck" | "hand" | "void";

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
  readonly onHandCardActivate: (battleCardId: string) => void;
  readonly onCardDebugActivate?: (
    battleCardId: string,
    source: MobileBattleCardSource,
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
  readonly onFillBattlefieldPreview?: () => void;
  readonly onFillTwentyCardBattlefieldPreview?: () => void;
}

const ENEMY_HAND_VISIBLE_CARD_CAP = 6;
const BATTLEFIELD_SIDE_INSET_PERCENT = 6;
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
const NEXT_PHASE_CONTROL_WIDTH = 120;
// The player zones share the hand track: their 64px row is lifted 20px, and
// this anchor adds the minimum 4px separation after that row's lower edge.
const PLAYER_HAND_TOP = `calc(${token("--space-12")} - ${token("--space-7")} + ${token("--space-2")})`;

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100%",
  height: "100dvh",
  boxSizing: "border-box",
  overflow: "hidden",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gridTemplateRows:
    "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) minmax(0, 12fr) minmax(0, 27fr)",
  paddingTop: `var(${SAFE_AREA_INSET_PROPERTIES.top})`,
  paddingRight: `var(${SAFE_AREA_INSET_PROPERTIES.right})`,
  paddingBottom: `var(${SAFE_AREA_INSET_PROPERTIES.bottom})`,
  paddingLeft: `var(${SAFE_AREA_INSET_PROPERTIES.left})`,
  backgroundColor: token("--bg-app"),
  backgroundImage: `url("${battleBackgroundUrl}")`,
  backgroundPosition: "center",
  backgroundRepeat: "no-repeat",
  backgroundSize: "100% 100%",
  touchAction: "none",
};

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

function EnemyHand({ cardIds }: { readonly cardIds: readonly string[] }) {
  const visibleCardIds = cardIds.slice(0, ENEMY_HAND_VISIBLE_CARD_CAP);
  return (
    <div
      data-battle-mobile-row="enemy-hand"
      data-battle-hand-count={cardIds.length}
      data-battle-hand-visible-count={visibleCardIds.length}
      style={{
        ...ROW_STYLE,
        gridRow: 1,
        overflow: "hidden",
      }}
    >
      {visibleCardIds.map((cardId, index) => {
        const { left, normalized } = centeredFanPosition({
          index,
          count: visibleCardIds.length,
          maximumSpread: 36,
          spacing: 8,
        });
        const rotation = normalized * -12;
        const drop = normalized * normalized * 16;
        return (
          <div
            key={cardId}
            data-battle-card-id={cardId}
            data-battle-card-zone="enemy-hand"
            data-battle-card-face="down"
            style={{
              position: "absolute",
              top: 0,
              left,
              height: "94%",
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 0%",
              transform: `translateX(-50%) translateY(-${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            <motion.div
              layoutId={`battle-card:${cardId}`}
              data-battle-card-motion=""
              style={{ width: "100%", height: "100%" }}
            >
              <CardBack label="Enemy card" />
            </motion.div>
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
  owner,
  phase,
  side,
  interactions,
}: {
  readonly activeSide: MobileBattleOwner;
  readonly owner: MobileBattleOwner;
  readonly phase: MobileBattlePhase;
  readonly side: MobileBattleSideView;
  readonly interactions?: MobileBattleInteractions;
}) {
  const deck = toDeckPile(side.deckCardIds);
  const voidPile = toVoidPile(side.voidCards);
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
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
        gridRow: owner === "enemy" ? 2 : 6,
        ...(owner === "player"
          ? {
              alignSelf: "start",
              height: token("--space-12"),
              transform: `translateY(calc(-1 * ${token("--space-7")}))`,
              zIndex: 3,
            }
          : null),
        display: "grid",
        gridTemplateColumns: SIDE_ZONES_GRID_TEMPLATE,
        alignItems: "center",
        columnGap: token("--space-7"),
        paddingInline: token("--space-4"),
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
        <CardPile
          cards={deck}
          orientation="landscape"
          label={`${owner === "enemy" ? "Enemy" : "Player"} deck`}
          testId={`${owner}-battle-deck`}
        />
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
        <CardPile
          cards={voidPile}
          orientation="landscape"
          label={`${owner === "enemy" ? "Enemy" : "Player"} void`}
          testId={`${owner}-battle-void`}
        />
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
  interaction,
}: {
  readonly card: MobileBattleCardView;
  readonly zone: string;
  readonly showRulesText?: boolean;
  readonly interaction?: {
    readonly draggable: boolean;
    readonly onActivate?: () => void;
    readonly onDebugActivate?: () => void;
    readonly onDragStart: () => void;
    readonly onDragEnd: () => void;
    readonly onTouchDrop: (clientX: number, clientY: number) => void;
  };
}) {
  const dragSuppressedRef = useRef(false);
  const pendingTapRef = useRef<number | null>(null);
  const touchPointerRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    dragging: boolean;
    inverseParentTransform: LinearTransform;
  } | null>(null);
  const draggable = interaction?.draggable === true;
  const restingTransform = card.exhausted ? "rotate(90deg)" : "";
  const cancelPendingTap = (): void => {
    if (pendingTapRef.current === null) return;
    window.clearTimeout(pendingTapRef.current);
    pendingTapRef.current = null;
  };
  useEffect(() => cancelPendingTap, []);
  const finishTouchDrag = (
    event: React.PointerEvent<HTMLDivElement>,
    drop: boolean,
  ): void => {
    const touchPointer = touchPointerRef.current;
    if (
      event.pointerType !== "touch" ||
      touchPointer?.pointerId !== event.pointerId
    ) {
      return;
    }
    if (touchPointer.dragging) {
      event.preventDefault();
      if (drop) {
        const pointerEvents = event.currentTarget.style.pointerEvents;
        event.currentTarget.style.pointerEvents = "none";
        try {
          interaction?.onTouchDrop(event.clientX, event.clientY);
        } finally {
          event.currentTarget.style.pointerEvents = pointerEvents;
        }
      }
      interaction?.onDragEnd();
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort in browsers that have already released it.
    }
    touchPointerRef.current = null;
    event.currentTarget.draggable = draggable;
    event.currentTarget.dataset.battleTouchDragging = "false";
    event.currentTarget.style.zIndex = "";
    event.currentTarget.style.transform = restingTransform;
  };
  return (
    <motion.div
      data-battle-card-id={card.id}
      data-battle-card-zone={zone}
      data-battle-card-face="up"
      data-battle-card-exhausted={card.exhausted ? "true" : "false"}
      data-battle-touch-dragging="false"
      draggable={draggable}
      onPointerDownCapture={(event) => {
        dragSuppressedRef.current = false;
        if (!draggable || event.pointerType !== "touch") return;
        event.currentTarget.draggable = false;
        touchPointerRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          inverseParentTransform: inverseLinearTransform(
            event.currentTarget.parentElement,
          ),
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is best-effort on older Mobile Safari versions.
        }
      }}
      onPointerMove={(event) => {
        const touchPointer = touchPointerRef.current;
        if (
          event.pointerType !== "touch" ||
          touchPointer?.pointerId !== event.pointerId
        ) {
          return;
        }
        const viewportX = event.clientX - touchPointer.startX;
        const viewportY = event.clientY - touchPointer.startY;
        if (
          !touchPointer.dragging &&
          Math.hypot(viewportX, viewportY) <= POINTER_MOVEMENT_SLOP_PX
        ) {
          return;
        }
        event.preventDefault();
        const dragStarted = !touchPointer.dragging;
        if (dragStarted) {
          touchPointer.dragging = true;
          dragSuppressedRef.current = true;
          event.currentTarget.dataset.battleTouchDragging = "true";
          event.currentTarget.style.zIndex = "100";
        }
        const inverse = touchPointer.inverseParentTransform;
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
          interaction?.onDragStart();
        }
      }}
      onPointerUpCapture={(event) => finishTouchDrag(event, true)}
      onPointerCancelCapture={(event) => finishTouchDrag(event, false)}
      onClick={(event) => {
        if (!draggable && interaction?.onDebugActivate === undefined) return;
        event.stopPropagation();
        if (dragSuppressedRef.current) {
          dragSuppressedRef.current = false;
          return;
        }
        if (interaction?.onDebugActivate === undefined) {
          if (draggable) interaction?.onActivate?.();
          return;
        }
        if (pendingTapRef.current !== null) {
          cancelPendingTap();
          interaction?.onDebugActivate?.();
          return;
        }
        pendingTapRef.current = window.setTimeout(() => {
          pendingTapRef.current = null;
          if (draggable) interaction?.onActivate?.();
        }, DOUBLE_TAP_WINDOW_MS);
      }}
      onDragStart={(event) => {
        if (touchPointerRef.current !== null) {
          event.preventDefault();
          return;
        }
        if (draggable) {
          cancelPendingTap();
          dragSuppressedRef.current = true;
          interaction?.onDragStart();
        }
      }}
      onDragEnd={() => {
        if (draggable) interaction?.onDragEnd();
      }}
      style={{
        width: "100%",
        cursor: draggable ? "grab" : undefined,
        position: "relative",
        touchAction: draggable ? "none" : undefined,
        transform: restingTransform || undefined,
        transformOrigin: "50% 50%",
      }}
    >
      <motion.div
        layoutId={`battle-card:${card.id}`}
        data-battle-card-motion=""
        style={{ width: "100%", height: "100%" }}
      >
        <GameCard
          model={card.model}
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

function battlefieldLayoutBackSlotCount(view: MobileBattleView): number {
  const sides = [view.enemy, view.player] as const;
  return Math.max(
    1,
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

function Rank({
  owner,
  rank,
  slots,
  layoutBackSlotCount,
  cardSize,
  order,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly rank: MobileBattleRank;
  readonly slots: readonly MobileBattleSlotView[];
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
  readonly order: number;
  readonly interactions?: MobileBattleInteractions;
}) {
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
  const layoutSlotCount =
    rank === "back"
      ? layoutBackSlotCount
      : Math.max(layoutBackSlotCount - 1, 1);
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
        left: `${String(BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
        right: `${String(BATTLEFIELD_SIDE_INSET_PERCENT)}%`,
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
        {slots.map((slot) => (
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
            {slot.card !== null ? (
              <FaceUpCard
                card={slot.card}
                zone={`${owner}-${rank}-rank`}
                interaction={
                  interactions === undefined
                    ? undefined
                    : {
                        draggable: interactions.canInteract,
                        onDragStart: () =>
                          interactions.onCardDragStart(
                            slot.card?.id ?? "",
                            "battlefield",
                          ),
                        ...(interactions.onCardDebugActivate === undefined
                          ? {}
                          : {
                              onDebugActivate: () =>
                                interactions.onCardDebugActivate?.(
                                  slot.card?.id ?? "",
                                  "battlefield",
                                ),
                            }),
                        onDragEnd: interactions.onCardDragEnd,
                        onTouchDrop: (clientX, clientY) =>
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
  owner,
  side,
  layoutBackSlotCount,
  cardSize,
  interactions,
}: {
  readonly owner: MobileBattleOwner;
  readonly side: MobileBattleSideView;
  readonly layoutBackSlotCount: number;
  readonly cardSize: string;
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
          owner={owner}
          rank={rank}
          slots={slots}
          layoutBackSlotCount={layoutBackSlotCount}
          cardSize={cardSize}
          order={order}
          interactions={interactions}
        />
      ))}
    </div>
  );
}

function PlayerHand({
  cards,
  interactions,
}: {
  readonly cards: readonly MobileBattleCardView[];
  readonly interactions?: MobileBattleInteractions;
}) {
  const canDrop =
    interactions?.canInteract === true && interactions.pendingCardId !== null;
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
        overflow: canDrop ? "visible" : "hidden",
      }}
    >
      {cards.map((card, index) => {
        const { left, normalized } = centeredFanPosition({
          index,
          count: cards.length,
          maximumSpread: 82,
          spacing: 18,
        });
        const rotation = normalized * 18;
        const drop = normalized * normalized * 18;
        return (
          <div
            key={card.id}
            style={{
              position: "absolute",
              left,
              top: PLAYER_HAND_TOP,
              height: "92%",
              aspectRatio: CARD_ASPECT_RATIO,
              transformOrigin: "50% 100%",
              transform: `translateX(-50%) translateY(${String(drop)}%) rotate(${String(rotation)}deg)`,
              zIndex: index + 1,
            }}
          >
            <FaceUpCard
              card={card}
              zone="player-hand"
              showRulesText
              interaction={
                interactions === undefined
                  ? undefined
                  : {
                      draggable: interactions.canInteract,
                      onActivate: () =>
                        interactions.onHandCardActivate(card.id),
                      ...(interactions.onCardDebugActivate === undefined
                        ? {}
                        : {
                            onDebugActivate: () =>
                              interactions.onCardDebugActivate?.(
                                card.id,
                                "player-hand",
                              ),
                          }),
                      onDragStart: () =>
                        interactions.onCardDragStart(card.id, "player-hand"),
                      onDragEnd: interactions.onCardDragEnd,
                      onTouchDrop: (clientX, clientY) =>
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
  const target = document
    .elementFromPoint(clientX, clientY)
    ?.closest<HTMLElement>("[data-battle-mobile-drop-kind]");
  if (target === undefined || target === null) return;
  const owner = target.dataset.battleMobileDropOwner;
  if (owner !== "enemy" && owner !== "player") return;
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

function ControlRow({
  interactions,
}: {
  readonly interactions?: MobileBattleInteractions;
}) {
  const disabled = interactions?.canInteract !== true;
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
        boxSizing: "border-box",
        paddingInline: token("--space-4"),
        paddingTop: token("--space-4"),
      }}
    >
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
        <div
          data-battle-phase-back=""
        >
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
          style={{ width: NEXT_PHASE_CONTROL_WIDTH, display: "grid" }}
        >
          <GlassButton
            label="Next Phase"
            variant="accent"
            disabled={disabled}
            onPress={() => interactions?.onNextPhase()}
          />
        </div>
      </div>
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
        position: "absolute",
        top: `calc(var(${SAFE_AREA_INSET_PROPERTIES.top}) + ${token("--space-4")})`,
        right: `calc(var(${SAFE_AREA_INSET_PROPERTIES.right}) + ${token("--space-4")})`,
        zIndex: 20,
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
          style={{ width: 300 }}
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

/** Seven-row, mobile-only battle table composed entirely from battle objects. */
export function MobileBattleScreen({ view, interactions }: MobileBattleScreenProps) {
  const layoutBackSlotCount = battlefieldLayoutBackSlotCount(view);
  const cardSize = battlefieldCardSize(layoutBackSlotCount);
  return (
    <>
      <style>{BATTLE_PHASE_LIGHT_CSS}</style>
      <main
        className="cumulus"
        data-battle-mobile={view.battleId}
        style={ROOT_STYLE}
      >
        <div
          aria-hidden="true"
          data-battle-mobile-safe-area-backdrop=""
          style={SAFE_AREA_BACKDROP_STYLE}
        />
        <LayoutGroup id={`mobile-battle:${view.battleId}`}>
          <EnemyHand cardIds={view.enemyHandCardIds} />
          <SideZones
            activeSide={view.activeSide}
            owner="enemy"
            phase={view.phase}
            side={view.enemy}
            interactions={interactions}
          />
          <PlayArea
            owner="enemy"
            side={view.enemy}
            layoutBackSlotCount={layoutBackSlotCount}
            cardSize={cardSize}
            interactions={interactions}
          />
          <PlayArea
            owner="player"
            side={view.player}
            layoutBackSlotCount={layoutBackSlotCount}
            cardSize={cardSize}
            interactions={interactions}
          />
          <ControlRow interactions={interactions} />
          <SideZones
            activeSide={view.activeSide}
            owner="player"
            phase={view.phase}
            side={view.player}
            interactions={interactions}
          />
          <PlayerHand cards={view.playerHand} interactions={interactions} />
        </LayoutGroup>
        <BattleDebugMenu
          onFillBattlefieldPreview={interactions?.onFillBattlefieldPreview}
          onFillTwentyCardBattlefieldPreview={
            interactions?.onFillTwentyCardBattlefieldPreview
          }
        />
      </main>
    </>
  );
}
