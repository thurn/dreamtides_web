import type { SiteState } from "../../types/quest";
import { formatPhaseLabel, formatSideLabel } from "../ui/format";
import type { BattleMutableState, BattlePhase, BattleResult, BattleSide } from "../types";

const PHASE_STEPS = [
  { id: "dawn", label: "Dawn", icon: "bx-sun phase-icon-sunrise" },
  { id: "day", label: "Day", icon: "bx-sun" },
  { id: "dusk", label: "Dusk", icon: "bx-sun phase-icon-sunset" },
  { id: "night", label: "Night", icon: "bx-moon" },
  { id: "challenge", label: "Challenge", icon: "bx-shield" },
] as const;

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
  onSetPhase,
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
  onSetPhase?: (phase: BattlePhase) => void;
}) {
  const phaseLabel = formatPhaseLabel(phase);
  const sideLabel = result === null ? formatSideLabel(activeSide) : "Battle Over";
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
          {PHASE_STEPS.map((step) => (
            <button
              key={step.id}
              type="button"
              aria-label={`Set phase to ${step.label}${visiblePhase === step.id ? " (active)" : ""}`}
              aria-pressed={visiblePhase === step.id}
              className={`phase-track-step ${visiblePhase === step.id ? "active" : ""}`}
              data-battle-phase-chip={step.id}
              data-active={String(visiblePhase === step.id)}
              onClick={() => onSetPhase?.(step.id)}
            >
              <i className={`bxf ${step.icon}`} aria-hidden="true" />
              {step.label}
            </button>
          ))}
        </div>
      </div>
      <div className="right">
        {hasAiOpponent && activeSide === "enemy" && (
          <span
            data-battle-ai-thinking
            className="battle-ai-thinking"
            aria-live="polite"
          >
            <span className="battle-ai-thinking-dot" aria-hidden="true" />
            AI thinking…
          </span>
        )}
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
    case "dreamwell":
    case "draw":
      return "dawn";
    case "ending":
      return "night";
    default:
      return phase;
  }
}
