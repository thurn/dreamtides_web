import { formatSideLabel } from "../ui/format";
import type { BattleJudgmentResolution, BattleResult, BattleSide } from "../types";

export function BattleJudgmentPauseOverlay({
  dissolvedCardNames,
  judgment,
  onContinue,
  result,
  scoreChanges,
  turnNumber,
}: {
  dissolvedCardNames: readonly string[];
  judgment: BattleJudgmentResolution;
  onContinue: () => void;
  result: BattleResult | null;
  scoreChanges: readonly {
    delta: number;
    side: BattleSide;
  }[];
  turnNumber: number;
}) {
  const scoreSummary = scoreChanges.length === 0
    ? "No score changed."
    : scoreChanges.map((change) => {
      const sign = change.delta > 0 ? "+" : "";
      return `${formatSideLabel(change.side)} ${sign}${String(change.delta)}`;
    }).join(" · ");

  return (
    <div className="judgment-pause-overlay">
      <div className="judgment-pause-panel" data-battle-judgment-overlay="">
        <p className="judgment-pause-eyebrow">Challenge Resolved</p>
        <h2>Turn {String(turnNumber)} results</h2>
        <p className="judgment-pause-summary">{scoreSummary}</p>
        <div className="judgment-pause-lanes">
          {judgment.lanes.map((lane) => (
            <article key={lane.slotId} className="judgment-pause-lane">
              <span className="judgment-pause-slot">{lane.slotId}</span>
              <span>
                You {String(lane.playerSpark)} · Enemy {String(lane.enemySpark)}
              </span>
              <span>
                {lane.winner === null ? "Tied" : `${formatSideLabel(lane.winner)} won`}
                {lane.scoreDelta !== 0 ? ` · ${String(lane.scoreDelta > 0 ? "+" : "")}${String(lane.scoreDelta)}` : ""}
              </span>
            </article>
          ))}
        </div>
        {dissolvedCardNames.length > 0 ? (
          <p className="judgment-pause-dissolved">
            Dissolved: {dissolvedCardNames.join(", ")}
          </p>
        ) : null}
        {result !== null ? (
          <p className="judgment-pause-outcome">
            Battle outcome queued: {result}
          </p>
        ) : null}
        <div className="judgment-pause-actions">
          <button
            type="button"
            data-battle-judgment-action="continue"
            className="btn primary"
            onClick={onContinue}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
