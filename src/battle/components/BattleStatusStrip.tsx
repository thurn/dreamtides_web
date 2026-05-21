import { useEffect, useRef, useState } from "react";
import { DreamcallerPortrait } from "../../components/DreamcallerPortrait";
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
  onCloseSummary: () => void;
  onOpenSummary: () => void;
}) {
  return (
    <section
      data-battle-region={`${side}-status-strip`}
      data-battle-ownership={side}
      data-battle-side-status={side}
      className={`status-strip ${side}`}
    >
      <button
        type="button"
        data-battle-side-summary={side}
        data-battle-side-summary-active={String(isActive)}
        data-battle-side-summary-selected={String(isSummarySelected)}
        className={`summary-trigger ${isSummarySelected ? "selected" : ""} ${isActive ? "active" : ""}`}
        title={subtitle === "" ? title : `${title} · ${subtitle}`}
        onMouseEnter={onOpenSummary}
        onMouseLeave={onCloseSummary}
        onFocus={onOpenSummary}
        onBlur={onCloseSummary}
      >
        {dreamcaller !== null ? (
          <span className="status-dreamcaller-thumb" data-battle-status-dreamcaller-thumb="">
            <DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" />
          </span>
        ) : null}
        <span className="summary-trigger-copy">
          <span className="who">{side === "player" ? "You" : "Enemy"}</span>
          <span className="summary-meta">
            {title}
            {subtitle === "" ? "" : ` · ${subtitle}`}
          </span>
        </span>
      </button>
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
          renderValue={(value) => `${String(value)}/${String(sideState.maxEnergy)}`}
          onCommit={onSetEnergy}
        />
      </div>
    </section>
  );
}

function LocalStatusStat({
  decrementLabel,
  externalValue,
  incrementLabel,
  label,
  maxEnergy,
  renderValue,
  stat,
  onCommit,
}: {
  decrementLabel: string;
  externalValue: number;
  incrementLabel: string;
  label: string;
  maxEnergy?: number;
  renderValue: (value: number) => string;
  stat: string;
  onCommit: (value: number) => void;
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
      <span className="stat-stepper">
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
      </span>
    </div>
  );
}
