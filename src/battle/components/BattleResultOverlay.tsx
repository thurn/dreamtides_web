import type { BattleResult } from "../types";

export function BattleResultOverlay({
  result,
  onDismissInspect,
  onReset,
}: {
  result: BattleResult;
  onDismissInspect: () => void;
  onReset?: () => void;
}) {
  const title = result === "victory" ? "Victory." : result === "defeat" ? "Defeat." : "Draw.";

  return (
    <div
      className="result-overlay"
      data-battle-overlay={result}
      data-battle-result-overlay={result}
    >
      <div className="panel">
        <h1>{title}</h1>
        <div className="actions">
          <button
            type="button"
            data-battle-action="dismiss-result"
            data-battle-result-action="dismiss"
            className="btn ghost"
            onClick={onDismissInspect}
          >
            Keep inspecting
          </button>
          {result === "victory" ? null : (
            <button
              type="button"
              data-battle-action="reset-run"
              data-battle-result-action="reset-run"
              className="btn danger"
              onClick={onReset}
            >
              Reset run…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
