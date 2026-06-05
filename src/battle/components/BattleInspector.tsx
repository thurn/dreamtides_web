import { useMemo } from "react";
import type { BattleCommand } from "../debug/commands";
import type {
  BattleInit,
  BattleMutableState,
  BattleReducerTransition,
  BattleSide,
  BrowseableZone,
} from "../types";
import type { AiProposal } from "../ai/use-battle-ai";
import { evaluate } from "../ai/evaluate";
import { forwardModelFromState } from "../ai/forward-model";
import { createDiscardMostRecentHandCardCommand } from "./battle-ui-commands";

export function BattleInspector({
  aiMode = false,
  aiProposal = null,
  battleInit,
  canPlayerAct: _canPlayerAct,
  futureCount,
  historyCount,
  isDesktopLayout: _isDesktopLayout,
  isOpponentHandRevealed,
  isOpen,
  lastTransition,
  state,
  onClose,
  onOpen,
  onCommand,
  onOpenFigmentCreator,
  onOpenPoolViewer,
  onOpenForesee,
  onOpenZone,
  onResetBattle,
  onRedo,
  onToggleOpponentHand,
  onUndo,
}: {
  /** When true, render the debug-only "AI Reasoning" section. */
  aiMode?: boolean;
  /** The AI's currently held proposal, or null (e.g. the player's turn). */
  aiProposal?: AiProposal | null;
  battleInit: BattleInit;
  canPlayerAct: boolean;
  futureCount: number;
  historyCount: number;
  isDesktopLayout: boolean;
  isOpponentHandRevealed: boolean;
  isOpen: boolean;
  lastTransition: BattleReducerTransition | null;
  state: BattleMutableState;
  onClose: () => void;
  onOpen?: () => void;
  onCommand: (command: BattleCommand) => void;
  onOpenFigmentCreator: (side: BattleSide) => void;
  onOpenPoolViewer: () => void;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onOpenZone: (side: BattleSide, zone: BrowseableZone) => void;
  onResetBattle?: () => void;
  onRedo?: () => void;
  onToggleOpponentHand: () => void;
  onUndo?: () => void;
}) {
  const playerDiscardCommand = useMemo(
    () => createDiscardMostRecentHandCardCommand(state, "player", "inspector"),
    [state],
  );
  const enemyDiscardCommand = useMemo(
    () => createDiscardMostRecentHandCardCommand(state, "enemy", "inspector"),
    [state],
  );

  return (
    <aside className={`inspector ${isOpen ? "open" : ""}`}>
      <button
        type="button"
        data-battle-inspector-handle=""
        className="inspector-handle"
        onClick={() => (isOpen ? onClose() : onOpen?.())}
        title={isOpen ? "Close inspector" : "Open inspector"}
      >
        <span className="dot" />
        {isOpen ? "CLOSE" : "INSPECT"}
      </button>
      {isOpen ? (
        <>
          <div className="head">
            <div>
              <h3>Inspector</h3>
            </div>
            <button type="button" className="btn ghost sm" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="inspector-body">
            <GlobalBattleState battleInit={battleInit} state={state} />

            {aiMode ? (
              <AiReasoning
                proposal={aiProposal}
                state={state}
                lastTransition={lastTransition}
              />
            ) : null}

            <div className="insp-section">
              <h4>Visibility</h4>
              <div className="chip-row">
                <button
                  type="button"
                  data-battle-action="open-pool-viewer"
                  className="chip"
                  onClick={onOpenPoolViewer}
                >
                  Pool Viewer
                </button>
                <button
                  type="button"
                  data-battle-action="toggle-opponent-hand"
                  className={`chip ${isOpponentHandRevealed ? "active" : ""}`}
                  onClick={onToggleOpponentHand}
                >
                  {isOpponentHandRevealed ? "Hide enemy hand" : "Show enemy hand"}
                </button>
              </div>
            </div>

            <div className="insp-section">
              <h4>Result</h4>
              <div className="chip-row">
                <button
                  type="button"
                  data-battle-action="skip-to-rewards"
                  className="chip"
                  onClick={() => onCommand({ id: "SKIP_TO_REWARDS", sourceSurface: "inspector" })}
                >
                  Skip to rewards
                </button>
                <button
                  type="button"
                  data-battle-action="force-defeat"
                  className="chip"
                  onClick={() => onCommand({ id: "FORCE_RESULT", result: "defeat", sourceSurface: "inspector" })}
                >
                  Force defeat
                </button>
                <button
                  type="button"
                  data-battle-action="force-draw"
                  className="chip"
                  onClick={() => onCommand({ id: "FORCE_RESULT", result: "draw", sourceSurface: "inspector" })}
                >
                  Force draw
                </button>
                <button type="button" className="chip danger" onClick={onResetBattle}>
                  Reset battle
                </button>
              </div>
            </div>

            <SideEditor
              side="player"
              state={state}
              onOpenFigmentCreator={onOpenFigmentCreator}
              onOpenForesee={onOpenForesee}
              onOpenZone={onOpenZone}
              onCommand={onCommand}
              discardCommand={playerDiscardCommand}
            />
            <SideEditor
              side="enemy"
              state={state}
              onOpenFigmentCreator={onOpenFigmentCreator}
              onOpenForesee={onOpenForesee}
              onOpenZone={onOpenZone}
              onCommand={onCommand}
              discardCommand={enemyDiscardCommand}
            />

            <div className="insp-section">
              <h4>History</h4>
              <div className="chip-row">
                <button
                  type="button"
                  className="chip"
                  disabled={historyCount === 0}
                  onClick={() => onUndo?.()}
                >
                  ↶ Undo
                </button>
                <button
                  type="button"
                  className="chip"
                  disabled={futureCount === 0}
                  onClick={() => onRedo?.()}
                >
                  ↷ Redo
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

function SideEditor({
  side,
  state,
  onOpenFigmentCreator,
  onOpenForesee,
  onOpenZone,
  onCommand,
  discardCommand,
}: {
  side: BattleSide;
  state: BattleMutableState;
  onOpenFigmentCreator: (side: BattleSide) => void;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onOpenZone: (side: BattleSide, zone: BrowseableZone) => void;
  onCommand: (command: BattleCommand) => void;
  discardCommand: BattleCommand | null;
}) {
  const sideState = state.sides[side];

  return (
    <div className="insp-section">
      <h4>{side === "player" ? "Your" : "Enemy"} state</h4>
      <NumericRow label="Energy" value={sideState.currentEnergy} onAdjust={(next) => onCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_CURRENT_ENERGY", side, value: next },
        sourceSurface: "inspector",
      })}
      />
      <NumericRow label="Max energy" value={sideState.maxEnergy} onAdjust={(next) => onCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_MAX_ENERGY", side, value: next },
        sourceSurface: "inspector",
      })}
      />
      <NumericRow label="Score" value={sideState.score} onAdjust={(next) => onCommand({
        id: "DEBUG_EDIT",
        edit: { kind: "SET_SCORE", side, value: next },
        sourceSurface: "inspector",
      })}
      />
      <div className="row-ctl">
        <span className="lbl">Draw / discard</span>
        <div className="chip-row">
          <button
            type="button"
            data-battle-action={`debug-draw-${side}`}
            className="chip"
            onClick={() => onCommand({
              id: "DEBUG_EDIT",
              edit: { kind: "DRAW_CARD", side },
              sourceSurface: "inspector",
            })}
          >
            +1 Draw
          </button>
          <button
            type="button"
            data-battle-action={`debug-discard-${side}`}
            className="chip"
            disabled={discardCommand === null}
            onClick={() => {
              if (discardCommand !== null) {
                onCommand(discardCommand);
              }
            }}
          >
            Discard
          </button>
        </div>
      </div>
      <div className="row-ctl">
        <span className="lbl">Deck tools</span>
        <div className="chip-row">
          <button
            type="button"
            className="chip"
            onClick={() => onOpenForesee(side, 1)}
          >
            Foresee
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onOpenZone(side, "deck")}
          >
            Open Deck
          </button>
        </div>
      </div>
      <div className="row-ctl">
        <span className="lbl">Side actions</span>
        <div className="chip-row">
          <button
            type="button"
            className="chip"
            onClick={() => onOpenFigmentCreator(side)}
          >
            Create Figment
          </button>
        </div>
      </div>
    </div>
  );
}

function NumericRow({
  label,
  value,
  onAdjust,
}: {
  label: string;
  value: number;
  onAdjust: (next: number) => void;
}) {
  return (
    <div className="row-ctl">
      <span className="lbl">{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onAdjust(value - 1)}>−</button>
        <span className="val">{String(value)}</span>
        <button type="button" onClick={() => onAdjust(value + 1)}>+</button>
      </div>
    </div>
  );
}

// v1 planner tuning, mirrored from `use-battle-ai.ts` (`battle_ai.md`
// §"The Planner"). These are the difficulty defaults the live AI plans with;
// they are kept as local constants for display so the debug panel does not
// reach into the hook's private module state.
const V1_BEAM_WIDTH = 12;
const V1_OPPONENT_MODE = "expectiminimax";
const V1_SAMPLE_CAP = 8;

/**
 * DEBUG-ONLY: surfaces the planner's read on the current decision. Rendered only
 * when `aiMode` is true (gated by the caller), so it is invisible in normal,
 * non-AI battles.
 *
 * v1 shows what is available without a planner debug hook: the held proposal's
 * rationale / kind / card / target / heuristic movement, a live static board
 * evaluation, the fixed v1 planner settings, and an echo of the last
 * transition's AI choices. Deeper internals — the full candidate-plan list and
 * the opponent-response distribution the search explored — are a future
 * extension that would require the planner to export a debug-output hook (it
 * currently returns only the chosen action). That surgery is intentionally out
 * of scope here.
 */
function AiReasoning({
  proposal,
  state,
  lastTransition,
}: {
  proposal: AiProposal | null;
  state: BattleMutableState;
  lastTransition: BattleReducerTransition | null;
}) {
  // The static board evaluation is pure but defensively guarded: a malformed
  // projection must never crash the inspector / battle screen.
  const liveEvaluation = useMemo<number | null>(() => {
    try {
      return evaluate(forwardModelFromState(state, "enemy"));
    } catch {
      return null;
    }
  }, [state]);

  const trace = proposal?.trace ?? null;
  const cardName =
    trace?.cardName ??
    (trace?.battleCardId != null
      ? state.cardInstances[trace.battleCardId]?.definition.name ?? null
      : null);
  const targetCardName =
    trace?.targetBattleCardId != null
      ? state.cardInstances[trace.targetBattleCardId]?.definition.name ??
        trace.targetBattleCardId
      : null;
  const target = targetCardName ?? trace?.targetSlotId ?? null;

  const aiChoices = lastTransition?.aiChoices ?? [];
  const recentRationale = aiChoices[aiChoices.length - 1]?.rationale ?? null;

  return (
    <div className="insp-section">
      <h4>AI Reasoning</h4>
      {proposal === null ? (
        <div className="row-ctl">
          <span className="lbl">Proposal</span>
          <span className="val">No active AI proposal</span>
        </div>
      ) : (
        <>
          <div className="row-ctl">
            <span className="lbl">Proposal</span>
            <span className="val">{proposal.description}</span>
          </div>
          <div className="row-ctl">
            <span className="lbl">Kind</span>
            <span className="val">{proposal.kind}</span>
          </div>
          {cardName !== null ? (
            <div className="row-ctl">
              <span className="lbl">Card</span>
              <span className="val">{cardName}</span>
            </div>
          ) : null}
          {target !== null ? (
            <div className="row-ctl">
              <span className="lbl">Target</span>
              <span className="val">{target}</span>
            </div>
          ) : null}
          {trace?.heuristicScoreBefore != null &&
          trace.heuristicScoreAfter != null ? (
            <div className="row-ctl">
              <span className="lbl">Heuristic</span>
              <span className="val">
                {trace.heuristicScoreBefore.toFixed(1)} →{" "}
                {trace.heuristicScoreAfter.toFixed(1)}
              </span>
            </div>
          ) : null}
        </>
      )}
      <div className="row-ctl">
        <span className="lbl">Live eval</span>
        <span className="val">{formatEvaluation(liveEvaluation)}</span>
      </div>
      <div className="row-ctl">
        <span className="lbl">Planner</span>
        <span className="val">
          beam {String(V1_BEAM_WIDTH)} · {V1_OPPONENT_MODE} · sample{" "}
          {String(V1_SAMPLE_CAP)}
        </span>
      </div>
      <div className="row-ctl">
        <span className="lbl">Recent AI choices</span>
        <span className="val">
          {String(aiChoices.length)}
          {recentRationale !== null ? ` · ${recentRationale}` : ""}
        </span>
      </div>
    </div>
  );
}

/** Formats the static evaluation scalar; ±Infinity reads as a decided game. */
function formatEvaluation(value: number | null): string {
  if (value === null) {
    return "—";
  }
  if (value === Number.POSITIVE_INFINITY) {
    return "win";
  }
  if (value === Number.NEGATIVE_INFINITY) {
    return "loss";
  }
  return value.toFixed(2);
}

function GlobalBattleState({
  battleInit,
  state,
}: {
  battleInit: BattleInit;
  state: BattleMutableState;
}) {
  return (
    <div className="insp-section">
      <h4>Battle State</h4>
      <div className="chip-row">
        <span className="chip">Turn {String(state.turnNumber)}</span>
        <span className="chip">{state.phase}</span>
        <span className="chip">{state.activeSide === "player" ? "Player active" : "Enemy active"}</span>
        <span className="chip">{state.result ?? "Live"}</span>
      </div>
      <div className="row-ctl">
        <span className="lbl">Battle</span>
        <span className="val">{battleInit.enemyDescriptor.name}</span>
      </div>
      <ZoneCountRow label="Your zones" state={state} side="player" />
      <ZoneCountRow label="Enemy zones" state={state} side="enemy" />
      <div className="row-ctl">
        <span className="lbl">Stack</span>
        <span className="val">{String((state.stack ?? []).length)}</span>
      </div>
    </div>
  );
}

function ZoneCountRow({
  label,
  side,
  state,
}: {
  label: string;
  side: BattleSide;
  state: BattleMutableState;
}) {
  const sideState = state.sides[side];
  const reserveCount = Object.values(sideState.reserve).filter(Boolean).length;
  const deployedCount = Object.values(sideState.deployed).filter(Boolean).length;

  return (
    <div className="row-ctl">
      <span className="lbl">{label}</span>
      <span className="val">
        H{String(sideState.hand.length)} D{String(sideState.deck.length)} V{String(sideState.void.length)} B{String(sideState.banished.length)} R{String(reserveCount)} P{String(deployedCount)}
      </span>
    </div>
  );
}
