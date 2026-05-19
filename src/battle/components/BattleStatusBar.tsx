import type { SiteState } from "../../types/quest";
import { formatPhaseLabel, formatSideLabel } from "../ui/format";
import type { BattleMutableState, BattleResult, BattleSide } from "../types";

export function BattleStatusBar({
  activeSide,
  battleId,
  enemyName,
  enemyScore,
  futureCount,
  hasAiOpponent = true,
  historyCount,
  phase,
  playerScore,
  result,
  roundNumber,
  siteType,
}: {
  activeSide: BattleSide;
  battleId: string;
  enemyName: string;
  enemyScore: number;
  futureCount: number;
  hasAiOpponent?: boolean;
  historyCount: number;
  phase: BattleMutableState["phase"];
  playerScore: number;
  result: BattleResult | null;
  roundNumber: number;
  siteType: SiteState["type"];
}) {
  const phaseLabel = formatPhaseLabel(phase);
  const sideLabel = result === null ? formatSideLabel(activeSide) : "Battle Over";
  const phaseSteps = [
    { id: "dawn", label: "Dawn", icon: "bxs-sun phase-icon-sunrise" },
    { id: "day", label: "Day", icon: "bxs-sun" },
    { id: "dusk", label: "Dusk", icon: "bxs-sun phase-icon-sunset" },
    { id: "night", label: "Night", icon: "bxs-moon" },
  ] as const;
  const visiblePhase = normalizeVisiblePhase(phase);

  return (
    <section data-battle-region="status-bar" className="topbar">
      <div className="left">
        <span data-battle-stat="round-number" className="turn-badge">
          Turn {String(roundNumber)}
        </span>
        <span className={`turn-owner-pill ${activeSide === "player" ? "you" : "them"}`}>
          {sideLabel}
        </span>
      </div>
      <div className="status-focus">
        <div className="status-focus-copy">
          <span className="status-focus-label">Active Phase</span>
          <strong
            data-battle-stat="phase"
            data-battle-phase={phase}
            className={`status-focus-phase ${activeSide === "player" ? "you" : "them"}`}
          >
            {phaseLabel}
          </strong>
        </div>
        <div className="phase-track" aria-label="Battle phases">
          {phaseSteps.map((step) => (
            <span
              key={step.id}
              aria-label={`${step.label}${visiblePhase === step.id ? " active" : ""}`}
              className={`phase-track-step ${visiblePhase === step.id ? "active" : ""}`}
              data-battle-phase-chip={step.id}
              data-active={String(visiblePhase === step.id)}
            >
              <i className={`bx ${step.icon}`} aria-hidden="true" />
              {step.label}
            </span>
          ))}
        </div>
      </div>
      <div className="right">
        <div
          data-battle-stat="score-summary"
          data-battle-score-summary={`${String(playerScore)}:${String(enemyScore)}`}
          className="score-summary"
        >
          <span
            data-battle-score-side="player"
            className={activeSide === "player" ? "active" : ""}
          >
            {String(playerScore)}
          </span>
          <span className="vs">—</span>
          <span
            data-battle-score-side="enemy"
            className={activeSide === "enemy" ? "active" : ""}
          >
            {String(enemyScore)}
          </span>
        </div>
      </div>
      <div hidden>
        <div data-battle-status-meta="battle-id">{battleId}</div>
        <div data-battle-status-meta="enemy-name">{enemyName}</div>
        <div data-battle-status-meta="site-type">{siteType}</div>
        <div data-battle-status-meta="has-ai">{String(hasAiOpponent)}</div>
        <div data-battle-status-meta="history">{String(historyCount)}</div>
        <div data-battle-status-meta="future">{String(futureCount)}</div>
        <div data-battle-status-meta="result">{result ?? "none"}</div>
      </div>
    </section>
  );
}

function normalizeVisiblePhase(phase: BattleMutableState["phase"]) {
  switch (phase) {
    case "startOfTurn":
    case "draw":
      return "dawn";
    case "main":
      return "day";
    case "judgment":
    case "challenge":
    case "endOfTurn":
    case "ending":
      return "night";
    default:
      return phase;
  }
}
