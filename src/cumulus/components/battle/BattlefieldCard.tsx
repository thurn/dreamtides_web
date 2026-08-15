import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactElement,
} from "react";
import { motion } from "framer-motion";
import { one, other, plural, tx, txa } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import {
  GameCard,
  cardSelectionShadowLayers,
  type GameCardModel,
  type GameCardSelection,
} from "../card/CardView";
import {
  BATTLEFIELD_CARD_CORNER_RADIUS,
  CARD_CORNER_RADIUS,
} from "../card/card-aspect";
import { InlineGlyph } from "../typography/InlineGlyph";
import { StandaloneGlyph } from "../controls/StandaloneGlyph";
import { RadialAnnouncement } from "../status/RadialAnnouncement";
import { GLYPHS } from "../../primitives/glyph";
import {
  LONG_PRESS_THRESHOLD_MS,
  POINTER_MOVEMENT_SLOP_PX,
} from "../../primitives/pointer-gesture";
import { motionTimeSeconds } from "../../primitives/motion-time";
import { token } from "../../primitives/tokens";
import { battleCardLayoutId } from "./battle-card-layout";
import { useTutorialObstacle } from "../overlay/tutorial-placement";
import type { BattleCardId } from "../../../types/identifiers";
import type { PresentationId } from "../../../types/identifiers";

export const BATTLEFIELD_CARD_EXHAUSTED_FILTER =
  "grayscale(0.5) brightness(0.62)";

/** Semantic viewport-space result from one completed battlefield drag. */
export interface BattlefieldCardDrop {
  /** Stable battle-instance identity of the dragged card. */
  readonly battleCardId: BattleCardId;
  /** Pointer release x-coordinate in viewport space. */
  readonly clientX: number;
  /** Pointer release y-coordinate in viewport space. */
  readonly clientY: number;
  /** Dragged card center x-coordinate after constrained placement. */
  readonly placementClientX: number;
  /** Dragged card center y-coordinate after constrained placement. */
  readonly placementClientY: number;
}

/** Complete prepared presentation for one face-up battle instance. */
export interface BattlefieldCardModel {
  /** Stable battle-instance identity used by every interaction callback. */
  readonly battleCardId: BattleCardId;
  /** Complete resolved game-card presentation. */
  readonly card: GameCardModel;
  /** Whether the battle instance is exhausted. */
  readonly exhausted: boolean;
  /** Prepared stored-memory count shown on the card. */
  readonly storedMemory: number;
  /** Whether to use the canonical Figment treatment. */
  readonly figment: boolean;
  /** Optional semantic selection treatment prepared by the board. */
  readonly selection?: GameCardSelection;
  /** Optional challenge ownership and viewer-relative orientation. */
  readonly challengeMarker?: {
    /** Semantic challenge owner. */
    readonly owner: "player" | "enemy";
    /** Viewer-relative edge where the marker appears. */
    readonly side: "near" | "far";
  };
  /** Optional score announcement attached to this battle instance. */
  readonly scoreAnnouncement?: {
    /** Signed score delta announced by the card. */
    readonly points: number;
    /** Stable presentation identity used to restart announcement motion. */
    readonly presentationId: PresentationId;
  };
  /** Named layout-motion behavior for board travel. */
  readonly motion: "snap" | "travel";
  /** Canonical compact battlefield or complete-card presentation. */
  readonly presentation: "battlefield" | "full";
}

/** Closed interaction contract prepared by the owning battle board. */
export type BattlefieldCardInteraction =
  | {
      /** Readable card with no board action. */
      readonly kind: "passive";
    }
  | {
      /** Keyboard- and pointer-pressable card. */
      readonly kind: "pressable";
      /** Reports the pressed battle-instance identity. */
      readonly onPress: (battleCardId: BattleCardId) => void;
    }
  | {
      /** Pointer-draggable card with optional quick-press behavior. */
      readonly kind: "draggable";
      /** Optional quick-press intent for the battle instance. */
      readonly onPress?: (battleCardId: BattleCardId) => void;
      /** Reports the battle instance when deliberate dragging begins. */
      readonly onDragStart: (battleCardId: BattleCardId) => void;
      /** Reports the battle instance when dragging ends or is cancelled. */
      readonly onDragEnd: (battleCardId: BattleCardId) => void;
      /** Reports the complete semantic viewport drop result. */
      readonly onDrop: (drop: BattlefieldCardDrop) => void;
    };

export interface BattlefieldCardProps {
  /** Complete prepared battle-instance presentation. */
  readonly model: BattlefieldCardModel;
  /** Closed interaction behavior prepared by the board. */
  readonly interaction: BattlefieldCardInteraction;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  readonly originBounds: DOMRect;
  readonly constraintBounds: DOMRect | null;
  readonly inverseParentTransform: LinearTransform;
  dragging: boolean;
  viewportX: number;
  viewportY: number;
}

interface LinearTransform {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
}

const IDENTITY_LINEAR_TRANSFORM: LinearTransform = { a: 1, b: 0, c: 0, d: 1 };
const POINTER_DROP_COMMIT_HOLD_MS = motionTimeSeconds("--dur-slow") * 1_000;

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
  if (a === undefined || b === undefined || c === undefined || d === undefined)
    return IDENTITY_LINEAR_TRANSFORM;
  const determinant = a * d - b * c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < Number.EPSILON)
    return IDENTITY_LINEAR_TRANSFORM;
  return {
    a: d / determinant,
    b: -b / determinant,
    c: -c / determinant,
    d: a / determinant,
  };
}

const BADGE_SIZE = "min(26cqw, 28px)";
const BADGE_STYLE: CSSProperties = {
  position: "absolute",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: BADGE_SIZE,
  height: BADGE_SIZE,
  border: `1px solid ${token("--text-on-accent")}`,
  borderRadius: token("--radius-pill"),
  background: token("--surface-card"),
  color: token("--text-primary"),
  font: token("--t-popover-meta"),
  boxShadow: token("--shadow-sm"),
  boxSizing: "border-box",
  pointerEvents: "none",
  zIndex: 4,
};

function ChallengeMarker({
  owner,
  side,
}: NonNullable<BattlefieldCardModel["challengeMarker"]>): ReactElement {
  const resolve = useLocalizer();
  return (
    <div
      role="img"
      aria-label={resolve(
        owner === "enemy"
          ? tx(
              "Opponent challenger",
              "[accessibility] [battle] Opposing challenger.",
            )
          : tx(
              "Player challenger",
              "[accessibility] [battle] Local challenger.",
            ),
      )}
      data-battle-challenger-chevron={owner}
      data-battle-challenger-chevron-direction={side === "far" ? "down" : "up"}
      data-battle-challenger-chevron-style="circle-badge"
      style={{
        position: "absolute",
        zIndex: 7,
        top: side === "near" ? "-4%" : undefined,
        bottom: side === "far" ? "-4%" : undefined,
        left: "50%",
        width: "22%",
        height: "16%",
        pointerEvents: "none",
        transform: "translateX(-50%)",
      }}
    >
      <svg
        viewBox="0 0 50 50"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          overflow: "visible",
          transform: side === "far" ? "rotate(180deg)" : undefined,
          transformOrigin: "50% 50%",
        }}
      >
        <g data-battle-challenger-marker-circle="">
          <circle
            cx="25"
            cy="25"
            r="23"
            fill={token("--surface-status-badge")}
          />
          <polyline
            points="13,32 25,19 37,32"
            fill="none"
            stroke={token("--surface-status-badge")}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="13,32 25,19 37,32"
            fill="none"
            stroke={token("--battle-challenger-chevron")}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      </svg>
    </div>
  );
}

function StatusIndicators({
  model,
}: {
  readonly model: BattlefieldCardModel;
}): ReactElement {
  const resolve = useLocalizer();
  return (
    <div
      data-battle-card-status-indicators=""
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      {model.exhausted && (
        <div
          aria-label={resolve(
            tx("Exhausted", "[accessibility] [battle] Exhausted card status."),
          )}
          data-battle-card-status="exhausted"
          style={{
            ...BADGE_STYLE,
            top: "50%",
            left: "50%",
            width: BADGE_SIZE,
            transform: "translate(-50%, -50%)",
            fontSize: "min(19cqw, 20px)",
          }}
        >
          <StandaloneGlyph
            glyph={GLYPHS.exhaust}
            color="white"
            depth="content-protection"
          />
        </div>
      )}
      {model.storedMemory > 0 && (
        <div
          aria-label={resolve(
            txa(
              plural(model.storedMemory, [
                one("{count} memory counter"),
                other("{count} memory counters"),
              ]),
              { count: model.storedMemory },
              "[accessibility] [battle] Memory counters on a card.",
            ),
          )}
          data-battle-card-status="stored-time"
          data-battle-card-status-kind="stored-memory"
          style={{
            ...BADGE_STYLE,
            right: "4%",
            bottom: "4%",
            width: BADGE_SIZE,
            borderRadius: token("--radius-compact"),
            background: token("--surface-status-badge"),
            color: token("--text-on-accent"),
          }}
        >
          <span
            data-battle-memory-counter=""
            style={{
              display: "inline-flex",
              alignItems: "center",
              font: token("--t-numeral-sm"),
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span>{model.storedMemory}</span>
            <InlineGlyph glyph={GLYPHS.memory} />
          </span>
        </div>
      )}
    </div>
  );
}

/** One complete face-up battle card presentation with semantic press/drag intent. */
export function BattlefieldCard({
  model,
  interaction,
}: BattlefieldCardProps): ReactElement {
  const dragRef = useRef<DragState | null>(null);
  const tutorialObstacleRef = useTutorialObstacle(
    `tutorial-obstacle:battle-card:${model.battleCardId}`,
    "card",
  );
  const suppressClickRef = useRef(false);
  const longPressSuppressedRef = useRef(false);
  const touchPressStartedAtRef = useRef<number | null>(null);
  const pointerDropHoldRef = useRef<number | null>(null);
  const draggable = interaction.kind === "draggable";
  const press =
    interaction.kind === "passive" ? undefined : interaction.onPress;
  const cancelPointerDropHold = (): void => {
    if (pointerDropHoldRef.current === null) return;
    window.clearTimeout(pointerDropHoldRef.current);
    pointerDropHoldRef.current = null;
  };
  useEffect(() => () => cancelPointerDropHold(), []);
  const finish = (
    event: React.PointerEvent<HTMLDivElement>,
    commit: boolean,
  ): void => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    if (drag.dragging) {
      event.preventDefault();
      suppressClickRef.current = true;
      if (commit && interaction.kind === "draggable") {
        const pointerEvents = event.currentTarget.style.pointerEvents;
        event.currentTarget.style.pointerEvents = "none";
        try {
          interaction.onDrop({
            battleCardId: model.battleCardId,
            clientX: event.clientX,
            clientY: event.clientY,
            placementClientX:
              drag.originBounds.left +
              drag.originBounds.width / 2 +
              drag.viewportX,
            placementClientY:
              drag.originBounds.top +
              drag.originBounds.height / 2 +
              drag.viewportY,
          });
        } finally {
          event.currentTarget.style.pointerEvents = pointerEvents;
        }
        interaction.onDragEnd(model.battleCardId);
      } else if (interaction.kind === "draggable") {
        interaction.onDragEnd(model.battleCardId);
      }
    }
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    dragRef.current = null;
    event.currentTarget.dataset.battlePointerDragging = "false";
    cancelPointerDropHold();
    if (commit && drag.dragging && interaction.kind === "draggable") {
      const releasedCard = event.currentTarget;
      const releasedTransform = releasedCard.style.transform;
      releasedCard.dataset.battlePointerDrop = "committing";
      pointerDropHoldRef.current = window.setTimeout(() => {
        pointerDropHoldRef.current = null;
        if (releasedCard.style.transform === releasedTransform) {
          releasedCard.style.zIndex = "";
          releasedCard.style.transform = "";
        }
        delete releasedCard.dataset.battlePointerDrop;
      }, POINTER_DROP_COMMIT_HOLD_MS);
      return;
    }
    event.currentTarget.style.zIndex = "";
    event.currentTarget.style.transform = "";
  };

  return (
    <motion.div
      ref={tutorialObstacleRef}
      role={interaction.kind === "passive" ? undefined : "button"}
      tabIndex={interaction.kind === "passive" ? undefined : 0}
      data-battlefield-card=""
      data-battle-card-id={model.battleCardId}
      data-battle-card-face="up"
      data-battle-card-exhausted={model.exhausted ? "true" : "false"}
      data-battle-card-stored-memory={model.storedMemory}
      data-battle-card-stored-time={model.storedMemory}
      data-battle-pointer-dragging="false"
      draggable={false}
      onKeyDown={(event) => {
        if (
          (event.key === "Enter" || event.key === " ") &&
          press !== undefined
        ) {
          event.preventDefault();
          press(model.battleCardId);
        }
      }}
      onPointerDownCapture={(event) => {
        suppressClickRef.current = false;
        longPressSuppressedRef.current = false;
        touchPressStartedAtRef.current =
          event.pointerType === "touch" ? event.timeStamp : null;
        if (!draggable || event.button !== 0) return;
        dragRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          dragging: false,
          originBounds: event.currentTarget.getBoundingClientRect(),
          constraintBounds:
            event.currentTarget
              .closest<HTMLElement>("[data-battle-play-area]")
              ?.getBoundingClientRect() ?? null,
          inverseParentTransform: inverseLinearTransform(
            event.currentTarget.parentElement,
          ),
          viewportX: 0,
          viewportY: 0,
        };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* best effort */
        }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (drag?.pointerId !== event.pointerId) return;
        const requestedViewportX = event.clientX - drag.startX;
        const requestedViewportY = event.clientY - drag.startY;
        if (
          !drag.dragging &&
          Math.hypot(requestedViewportX, requestedViewportY) <=
            POINTER_MOVEMENT_SLOP_PX
        )
          return;
        event.preventDefault();
        if (!drag.dragging) {
          touchPressStartedAtRef.current = null;
          drag.dragging = true;
          event.currentTarget.dataset.battlePointerDragging = "true";
          event.currentTarget.style.zIndex = "100";
          if (interaction.kind === "draggable")
            interaction.onDragStart(model.battleCardId);
          window.dispatchEvent(new Event("dragstart"));
        }
        const viewportX =
          drag.constraintBounds === null
            ? requestedViewportX
            : clamp(
                requestedViewportX,
                drag.constraintBounds.left - drag.originBounds.left,
                drag.constraintBounds.right - drag.originBounds.right,
              );
        const viewportY =
          drag.constraintBounds === null
            ? requestedViewportY
            : clamp(
                requestedViewportY,
                drag.constraintBounds.top - drag.originBounds.top,
                drag.constraintBounds.bottom - drag.originBounds.bottom,
              );
        drag.viewportX = viewportX;
        drag.viewportY = viewportY;
        const inverse = drag.inverseParentTransform;
        const x = inverse.a * viewportX + inverse.c * viewportY;
        const y = inverse.b * viewportX + inverse.d * viewportY;
        event.currentTarget.style.transform = `translate3d(${String(x)}px, ${String(y)}px, 0)`;
      }}
      onPointerUpCapture={(event) => {
        if (
          event.pointerType === "touch" &&
          touchPressStartedAtRef.current !== null &&
          event.timeStamp - touchPressStartedAtRef.current >=
            LONG_PRESS_THRESHOLD_MS
        )
          longPressSuppressedRef.current = true;
        touchPressStartedAtRef.current = null;
        finish(event, true);
      }}
      onPointerCancelCapture={(event) => {
        touchPressStartedAtRef.current = null;
        finish(event, false);
      }}
      onClick={(event) => {
        if (longPressSuppressedRef.current) {
          longPressSuppressedRef.current = false;
          suppressClickRef.current = false;
          return;
        }
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if (press !== undefined) {
          event.stopPropagation();
          press(model.battleCardId);
        }
      }}
      style={{
        width: "100%",
        cursor: draggable
          ? "grab"
          : press === undefined
            ? undefined
            : "pointer",
        position: "relative",
        containerType: "inline-size",
        touchAction: draggable ? "none" : undefined,
      }}
    >
      <motion.div
        layoutId={
          model.motion === "snap"
            ? undefined
            : battleCardLayoutId(model.battleCardId)
        }
        data-battle-card-motion=""
        data-battle-card-layout-motion={model.motion}
        data-battle-card-layout-id={
          model.motion === "snap"
            ? undefined
            : battleCardLayoutId(model.battleCardId)
        }
        style={{
          width: "100%",
          height: "100%",
          filter: model.exhausted
            ? BATTLEFIELD_CARD_EXHAUSTED_FILTER
            : undefined,
        }}
      >
        <GameCard
          model={model.card}
          selection={model.exhausted ? undefined : model.selection}
          hideRulesText={model.presentation === "battlefield"}
          exhausted={model.exhausted}
          presentation={model.presentation === "full" ? "full" : "battlefield"}
          figment={model.figment}
          testId={`battle-card-face:${model.battleCardId}`}
        />
        {model.challengeMarker && (
          <ChallengeMarker {...model.challengeMarker} />
        )}
      </motion.div>
      {model.exhausted && model.selection !== undefined && (
        <div
          aria-hidden="true"
          data-battle-card-selection-ring="unfiltered"
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 5,
            borderRadius:
              model.presentation === "full"
                ? CARD_CORNER_RADIUS
                : BATTLEFIELD_CARD_CORNER_RADIUS,
            boxShadow: cardSelectionShadowLayers(model.selection).join(", "),
            pointerEvents: "none",
          }}
        />
      )}
      {model.scoreAnnouncement && (
        <RadialAnnouncement
          variant="card-score"
          points={model.scoreAnnouncement.points}
          announcementId={model.scoreAnnouncement.presentationId}
        />
      )}
      <StatusIndicators model={model} />
    </motion.div>
  );
}
