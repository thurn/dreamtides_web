import type { CSSProperties } from "react";
import { useMemo } from "react";
import type { BattleCommand } from "../debug/commands";
import { selectBattleCardLocation, selectBattlefieldSlotOccupant } from "../state/selectors";
import type {
  BattleInit,
  BattleMutableState,
  BattleSelection,
  BattleSide,
  BrowseableZone,
} from "../types";
import { BattleCardView, battleCardVisualFromInstance } from "./BattleCardView";
import { createDiscardMostRecentHandCardCommand } from "./battle-ui-commands";

export function BattleInspector({
  battleInit: _battleInit,
  canPlayerAct: _canPlayerAct,
  futureCount,
  historyCount,
  isDesktopLayout: _isDesktopLayout,
  isOpen,
  lastTransition: _lastTransition,
  selection,
  state,
  onClearSelection,
  onClose,
  onOpen,
  onCommand,
  onOpenFigmentCreator,
  onOpenForesee,
  onOpenNoteEditor: _onOpenNoteEditor,
  onOpenZone,
  onResetBattle,
  onRedo,
  onSelectBattleCard: _onSelectBattleCard,
  onUndo,
}: {
  battleInit: BattleInit;
  canPlayerAct: boolean;
  futureCount: number;
  historyCount: number;
  isDesktopLayout: boolean;
  isOpen: boolean;
  lastTransition: unknown;
  selection: BattleSelection;
  state: BattleMutableState;
  onClearSelection: () => void;
  onClose: () => void;
  onOpen?: () => void;
  onCommand: (command: BattleCommand) => void;
  onOpenFigmentCreator: (side: BattleSide) => void;
  onOpenForesee: (side: BattleSide, count: number) => void;
  onOpenNoteEditor: (battleCardId: string) => void;
  onOpenZone: (side: BattleSide, zone: BrowseableZone) => void;
  onResetBattle?: () => void;
  onRedo?: () => void;
  onSelectBattleCard: (battleCardId: string) => void;
  onUndo?: () => void;
}) {
  const selectedCard = selection?.kind === "card"
    ? state.cardInstances[selection.battleCardId] ?? null
    : null;
  const selectedCardLocation = selectedCard === null
    ? null
    : selectBattleCardLocation(state, selectedCard.battleCardId);
  const selectedSlotOccupant = selection?.kind === "slot"
    ? selectBattlefieldSlotOccupant(state, selection.target)
    : null;
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
        className={`inspector-handle ${selection !== null ? "has-selection" : ""}`}
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
              <h3>{selectedCard !== null ? "Card" : "Inspector"}</h3>
            </div>
            <button type="button" className="btn ghost sm" onClick={onClose}>
              ✕
            </button>
          </div>
          <div className="inspector-body">
            {selectedCard !== null ? (
              <CardInspector
                card={selectedCard}
                location={selectedCardLocation}
              />
            ) : selection?.kind === "slot" ? (
              <SlotInspector
                occupantId={selectedSlotOccupant}
                slotLabel={`${selection.target.side === "player" ? "Your" : "Enemy"} ${selection.target.zone} ${selection.target.slotId}`}
              />
            ) : (
              <div className="insp-empty">Select a card or slot to edit.</div>
            )}

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
              <h4>Result</h4>
              <div className="chip-row">
                <button
                  type="button"
                  data-battle-action="force-victory"
                  className="chip"
                  onClick={() => onCommand({ id: "SKIP_TO_REWARDS", sourceSurface: "inspector" })}
                >
                  Force victory
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
                <button type="button" className="chip" onClick={onClearSelection}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </aside>
  );
}

function CardInspector({
  card,
  location,
}: {
  card: BattleMutableState["cardInstances"][string];
  location: ReturnType<typeof selectBattleCardLocation>;
}) {
  const side = location?.side ?? card.controller;
  const effectiveSpark = Math.max(0, card.definition.printedSpark + card.sparkDelta);
  const locationLabel = location === null
    ? "UNKNOWN"
    : location.zone === "reserve" || location.zone === "deployed"
      ? `${side === "player" ? "YOUR" : "ENEMY"} ${location.zone.toUpperCase()} · ${location.slotId}`
      : `${location.zone.toUpperCase()} · ${side.toUpperCase()}`;

  return (
    <div>
      <div className="insp-card-preview">
        <div style={{ "--card-w": "70px", "--card-h": "96px" } as CSSProperties}>
          <BattleCardView
            data={battleCardVisualFromInstance(card)}
            reserved={location?.zone === "reserve"}
          />
        </div>
        <div className="meta">
          <div className="n">{card.definition.name}</div>
          <div className="t">
            {card.definition.battleCardKind} · {card.definition.subtype} · {(card.definition.tides[0] ?? "—").toUpperCase()}
          </div>
          <div className="text">{card.definition.renderedText.replace(/<[^>]+>/g, "")}</div>
          <div className="badges">
            <span>Cost {String(card.definition.energyCost)}</span>
            {card.definition.battleCardKind === "character" ? (
              <span>
                ◆ {String(effectiveSpark)}
                {card.sparkDelta !== 0 ? ` (${card.sparkDelta > 0 ? "+" : ""}${String(card.sparkDelta)})` : ""}
              </span>
            ) : null}
            {card.definition.isFast ? <span className="badge-accent">fast</span> : null}
            {card.definition.reclaimCost !== null ? (
              <span className="badge-accent">
                Reclaim {String(card.definition.reclaimCost)}
              </span>
            ) : null}
            {location?.zone === "reserve" ? <span>reserved</span> : null}
          </div>
          <div className="t">{locationLabel}</div>
        </div>
      </div>

      <div className="insp-note card-action-hint">
        Right-click this card for play, move, note, marker, and copy actions.
      </div>

      <div className="insp-section">
        <h4>Card State</h4>
        <div className="chip-row">
          {location?.zone === "reserve" ? <span className="chip active">Reserved</span> : null}
          {card.markers.isPrevented ? <span className="chip active">Prevented</span> : null}
          {card.markers.isCopied ? <span className="chip active">Copied</span> : null}
          <span className="chip">{card.notes.length} Notes</span>
        </div>
        {card.notes.length > 0 ? (
          <div className="insp-note-list">
            {card.notes.map((note) => (
              <div key={note.noteId} className="insp-note-entry">
                {note.text}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
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
            onClick={() => onCommand({
              id: "DEBUG_EDIT",
              edit: { kind: "GRANT_EXTRA_TURN", side },
              sourceSurface: "inspector",
            })}
          >
            Extra Turn
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onCommand({
              id: "DEBUG_EDIT",
              edit: { kind: "FORCE_JUDGMENT", side },
              sourceSurface: "inspector",
            })}
          >
            Extra Judgment
          </button>
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

function SlotInspector({
  occupantId,
  slotLabel,
}: {
  occupantId: string | null;
  slotLabel: string;
}) {
  return (
    <div className="insp-empty">
      {slotLabel}
      {occupantId === null ? " is empty." : ` contains ${occupantId}.`}
    </div>
  );
}
