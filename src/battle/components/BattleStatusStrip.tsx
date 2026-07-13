import { useEffect, useRef, useState } from "react";
import { DreamcallerPortrait } from "../../cumulus/components/hud/DreamcallerPortrait";
import type {
  BattleDreamcallerSummary,
  BattleSide,
  BattleSideMutableState,
} from "../types";

const STAT_COMMIT_DELAY_MS = 200;
const STAT_FIREBASE_ECHO_BLOCK_MS = 10_000;

export function BattleStatusStrip({
  dreamcaller = null,
  side,
  sideState,
  subtitle,
  title,
  isActive,
  isSummarySelected = false,
  onSetEnergy,
  onSetScore,
  onIncreaseMaxEnergyAndFill,
  onDrawCard,
  onCloseSummary,
  onOpenSummary,
}: {
  dreamcaller?: BattleDreamcallerSummary | null;
  side: BattleSide;
  sideState: BattleSideMutableState;
  subtitle: string;
  title: string;
  isActive: boolean;
  isSummarySelected?: boolean;
  onSetEnergy: (value: number) => void;
  onSetScore: (value: number) => void;
  onIncreaseMaxEnergyAndFill: () => void;
  onDrawCard: () => void;
  onCloseSummary: () => void;
  onOpenSummary: () => void;
}) {
  const summaryTargetRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const target = summaryTargetRef.current;
    if (target === null) {
      return undefined;
    }
    target.addEventListener("pointerenter", onOpenSummary);
    target.addEventListener("pointerleave", onCloseSummary);
    return () => {
      target.removeEventListener("pointerenter", onOpenSummary);
      target.removeEventListener("pointerleave", onCloseSummary);
    };
  }, [onCloseSummary, onOpenSummary]);

  return (
    <section
      data-battle-region={`${side}-status-strip`}
      data-battle-ownership={side}
      data-battle-side-status={side}
      className={`status-strip ${side}`}
    >
      <div
        data-battle-side-summary={side}
        data-battle-side-summary-active={String(isActive)}
        data-battle-side-summary-selected={String(isSummarySelected)}
        className={`summary-trigger ${isSummarySelected ? "selected" : ""} ${isActive ? "active" : ""}`}
        title={subtitle === "" ? title : `${title} · ${subtitle}`}
      >
        {dreamcaller !== null ? (
          <button
            type="button"
            aria-label={`Show ${title} details`}
            className="status-dreamcaller-thumb summary-hover-target"
            data-battle-status-dreamcaller-thumb=""
            ref={summaryTargetRef}
            onFocus={onOpenSummary}
            onBlur={onCloseSummary}
          >
            <DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" />
            <span
              className="status-hand-count"
              data-battle-status-hand-count={side}
              title={`${String(sideState.hand.length)} cards in hand`}
              aria-label={`${String(sideState.hand.length)} cards in hand`}
            >
              <i className="bx bx-card-view" aria-hidden="true" />
              {String(sideState.hand.length)}
            </span>
          </button>
        ) : null}
        <span className="summary-trigger-copy">
          <span className="who">{side === "player" ? "You" : "Enemy"}</span>
          <span className="summary-meta" data-battle-status-dreamcaller-name="">
            {title}
            {subtitle === "" ? "" : ` · ${subtitle}`}
          </span>
        </span>
      </div>
      <div className="stats" data-battle-status-primary={side}>
        <LocalStatusStat
          stat={`${side}:score`}
          externalValue={sideState.score}
          label="PTS"
          decrementLabel={`Decrease ${side === "player" ? "your" : "enemy"} points`}
          incrementLabel={`Increase ${side === "player" ? "your" : "enemy"} points`}
          renderValue={(value) => String(value)}
          onCommit={onSetScore}
        />
        <LocalStatusStat
          stat={`${side}:energy`}
          externalValue={sideState.currentEnergy}
          maxEnergy={sideState.maxEnergy}
          label="E"
          decrementLabel={`Decrease ${side === "player" ? "your" : "enemy"} energy`}
          incrementLabel={`Increase ${side === "player" ? "your" : "enemy"} energy`}
          fillLabel={`Increase ${side === "player" ? "your" : "enemy"} maximum energy and refill energy`}
          renderValue={(value) => `${String(value)}/${String(sideState.maxEnergy)}`}
          onCommit={onSetEnergy}
          onFill={onIncreaseMaxEnergyAndFill}
        />
      </div>
      <button
        type="button"
        aria-label={`Draw one card for ${side === "player" ? "you" : "enemy"}`}
        className="status-strip-action"
        data-battle-action={`status-draw-${side}`}
        onClick={onDrawCard}
      >
        Draw card
      </button>
    </section>
  );
}

function LocalStatusStat({
  decrementLabel,
  externalValue,
  incrementLabel,
  label,
  fillLabel,
  maxEnergy,
  renderValue,
  stat,
  onCommit,
  onFill,
}: {
  decrementLabel: string;
  externalValue: number;
  incrementLabel: string;
  label: string;
  fillLabel?: string;
  maxEnergy?: number;
  renderValue: (value: number) => string;
  stat: string;
  onCommit: (value: number) => void;
  onFill?: () => void;
}) {
  const [localValue, setLocalValue] = useState(externalValue);
  const [isEditingLocally, setIsEditingLocally] = useState(false);
  const commitTimerRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);
  const latestExternalValueRef = useRef(externalValue);
  const latestLocalValueRef = useRef(externalValue);

  useEffect(() => {
    latestExternalValueRef.current = externalValue;
    if (!isEditingLocally) {
      latestLocalValueRef.current = externalValue;
      setLocalValue(externalValue);
    }
  }, [externalValue, isEditingLocally]);

  useEffect(() => () => {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
    }
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
  }, []);

  function adjust(amount: number): void {
    const next = latestLocalValueRef.current + amount;
    latestLocalValueRef.current = next;
    setIsEditingLocally(true);
    setLocalValue(next);

    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
    }
    commitTimerRef.current = window.setTimeout(() => {
      commitTimerRef.current = null;
      onCommit(latestLocalValueRef.current);
    }, STAT_COMMIT_DELAY_MS);

    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
    }
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      setIsEditingLocally(false);
      latestLocalValueRef.current = latestExternalValueRef.current;
      setLocalValue(latestExternalValueRef.current);
    }, STAT_FIREBASE_ECHO_BLOCK_MS);
  }

  function fill(): void {
    if (commitTimerRef.current !== null) {
      window.clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    if (releaseTimerRef.current !== null) {
      window.clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }
    setIsEditingLocally(false);
    onFill?.();
  }

  return (
    <div
      data-battle-stat={stat}
      data-battle-current-energy={maxEnergy === undefined ? undefined : String(localValue)}
      data-battle-max-energy={maxEnergy === undefined ? undefined : String(maxEnergy)}
      data-battle-value={maxEnergy === undefined
        ? String(localValue)
        : `${String(localValue)}/${String(maxEnergy)}`}
      className="stat"
    >
      <span className="label">{label}</span>
      <span className={`stat-stepper ${onFill === undefined ? "" : "with-fill"}`}>
        <button
          type="button"
          aria-label={decrementLabel}
          className="stat-stepper-button"
          onClick={() => adjust(-1)}
        >
          {"<"}
        </button>
        <span className="val">{renderValue(localValue)}</span>
        <button
          type="button"
          aria-label={incrementLabel}
          className="stat-stepper-button"
          onClick={() => adjust(1)}
        >
          {">"}
        </button>
        {onFill === undefined || fillLabel === undefined ? null : (
          <button
            type="button"
            aria-label={fillLabel}
            className="stat-stepper-button"
            onClick={fill}
          >
            <i className="bx bx-plus" aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
}
