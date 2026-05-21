import { DreamcallerPortrait } from "../../components/DreamcallerPortrait";
import type {
  BattleDreamcallerSummary,
  BattleSide,
  BattleSideMutableState,
} from "../types";

export function BattleStatusStrip({
  dreamcaller = null,
  side,
  sideState,
  subtitle,
  title,
  isActive,
  isSummarySelected = false,
  onAdjustEnergy,
  onAdjustScore,
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
  onAdjustEnergy: (amount: number) => void;
  onAdjustScore: (amount: number) => void;
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
        <div
          data-battle-stat={`${side}:score`}
          data-battle-value={String(sideState.score)}
          className="stat"
        >
          <span className="label">PTS</span>
          <StatStepper
            decrementLabel={`Decrease ${side === "player" ? "your" : "enemy"} points`}
            incrementLabel={`Increase ${side === "player" ? "your" : "enemy"} points`}
            value={String(sideState.score)}
            onAdjust={onAdjustScore}
          />
        </div>
        <div
          data-battle-stat={`${side}:energy`}
          data-battle-current-energy={String(sideState.currentEnergy)}
          data-battle-max-energy={String(sideState.maxEnergy)}
          data-battle-value={`${String(sideState.currentEnergy)}/${String(sideState.maxEnergy)}`}
          className="stat"
        >
          <span className="label">E</span>
          <StatStepper
            decrementLabel={`Decrease ${side === "player" ? "your" : "enemy"} energy`}
            incrementLabel={`Increase ${side === "player" ? "your" : "enemy"} energy`}
            value={`${String(sideState.currentEnergy)}/${String(sideState.maxEnergy)}`}
            onAdjust={onAdjustEnergy}
          />
        </div>
      </div>
    </section>
  );
}

function StatStepper({
  decrementLabel,
  incrementLabel,
  value,
  onAdjust,
}: {
  decrementLabel: string;
  incrementLabel: string;
  value: string;
  onAdjust: (amount: number) => void;
}) {
  return (
    <span className="stat-stepper">
      <button
        type="button"
        aria-label={decrementLabel}
        className="stat-stepper-button"
        onClick={() => onAdjust(-1)}
      >
        {"<"}
      </button>
      <span className="val">{value}</span>
      <button
        type="button"
        aria-label={incrementLabel}
        className="stat-stepper-button"
        onClick={() => onAdjust(1)}
      >
        {">"}
      </button>
    </span>
  );
}
