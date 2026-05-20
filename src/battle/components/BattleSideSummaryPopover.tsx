import { useEffect, useRef } from "react";
import type {
  BattleMutableState,
  BattleSide,
  BrowseableZone,
} from "../types";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";

export function BattleSideSummaryPopover({
  isPlayerInfoAvailable = false,
  isSelected = false,
  isActive,
  onClose,
  onOpenFigmentCreator,
  onOpenPlayerInfo,
  onOpenZone,
  side,
  state,
  subtitle,
  title,
}: {
  isPlayerInfoAvailable?: boolean;
  isSelected?: boolean;
  isActive: boolean;
  onClose: () => void;
  onOpenFigmentCreator: (side: BattleSide) => void;
  onOpenPlayerInfo?: () => void;
  onOpenZone: (side: BattleSide, zone: BrowseableZone) => void;
  side: BattleSide;
  state: BattleMutableState;
  subtitle: string;
  title: string;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sideState = state.sides[side];
  const reserveCount = RESERVE_SLOT_IDS.filter((slotId) => sideState.reserve[slotId] !== null).length;
  const deployedCount = DEPLOY_SLOT_IDS.filter((slotId) => sideState.deployed[slotId] !== null).length;

  useEffect(() => {
    function handlePointerDown(event: MouseEvent): void {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (popoverRef.current?.contains(event.target) ?? false) {
        return;
      }
      onClose();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      onClose();
    }

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={popoverRef}
      className={`side-summary-popover ${side}`}
      data-battle-side-summary-popover={side}
      data-selected={String(isSelected)}
    >
      <div className="floating-header">
        <div>
          <p className="eyebrow">{side === "player" ? "Player Summary" : "Enemy Summary"}</p>
          <h3>{title}</h3>
          {subtitle === "" ? null : <p className="floating-subtitle">{subtitle}</p>}
        </div>
        <button type="button" className="btn ghost sm" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="summary-grid">
        <div className="summary-stat">
          <span className="label">Status</span>
          <span className="value">{isActive ? "Active" : "Waiting"}</span>
        </div>
        <div className="summary-stat">
          <span className="label">Reserve</span>
          <span className="value">{String(reserveCount)}/5</span>
        </div>
        <div className="summary-stat">
          <span className="label">Deployed</span>
          <span className="value">{String(deployedCount)}/4</span>
        </div>
        <div className="summary-stat">
          <span className="label">Extra Turns</span>
          <span className="value">{String(sideState.pendingExtraTurns)}</span>
        </div>
      </div>

      <div className="floating-section">
        <h4>Quick Zones</h4>
        <div className="chip-row">
          {(["hand", "deck", "void", "banished"] as const).map((zone) => (
            <button
              key={zone}
              type="button"
              className="chip"
              onClick={() => {
                onOpenZone(side, zone);
                onClose();
              }}
            >
              {zone === "void" ? "Void" : zone[0].toUpperCase() + zone.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="floating-section">
        <h4>Debug Actions</h4>
        <div className="chip-row">
          <button
            type="button"
            className="chip"
            onClick={() => {
              onOpenFigmentCreator(side);
              onClose();
            }}
          >
            Create Figment
          </button>
          {side === "player" && isPlayerInfoAvailable ? (
            <button
              type="button"
              className="chip"
              onClick={() => {
                onOpenPlayerInfo?.();
                onClose();
              }}
            >
              Dreamcaller
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
