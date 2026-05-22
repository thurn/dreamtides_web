import { useMemo } from "react";
import type { BattleCommand } from "../debug/commands";
import type {
  BattleInit,
  BattleMutableState,
  BattleSide,
  BrowseableZone,
} from "../types";
import { createDiscardMostRecentHandCardCommand } from "./battle-ui-commands";

export function BattleInspector({
  battleInit,
  canPlayerAct: _canPlayerAct,
  futureCount,
  historyCount,
  isDesktopLayout: _isDesktopLayout,
  isOpponentHandRevealed,
  isOpen,
  lastTransition: _lastTransition,
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
  battleInit: BattleInit;
  canPlayerAct: boolean;
  futureCount: number;
  historyCount: number;
  isDesktopLayout: boolean;
  isOpponentHandRevealed: boolean;
  isOpen: boolean;
  lastTransition: unknown;
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
