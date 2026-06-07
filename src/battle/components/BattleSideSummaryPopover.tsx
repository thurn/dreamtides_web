import { useEffect, useRef } from "react";
import type {
  BattleDreamcallerSummary,
  BattleMutableState,
  BattleSide,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import { DreamcallerPortrait } from "../../components/DreamcallerPortrait";
import { RulesText } from "../../components/RulesText";

export function BattleSideSummaryPopover({
  dreamcaller = null,
  isSelected = false,
  isActive,
  onClose,
  side,
  state,
  subtitle,
  title,
}: {
  dreamcaller?: BattleDreamcallerSummary | null;
  isSelected?: boolean;
  isActive: boolean;
  onClose: () => void;
  side: BattleSide;
  state: BattleMutableState;
  subtitle: string;
  title: string;
}) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const sideState = state.sides[side];
  const reserveCount = BACK_RANK_SLOT_IDS.filter((slotId) => sideState.backRank[slotId] !== null).length;
  const deployedCount = FRONT_RANK_SLOT_IDS.filter((slotId) => sideState.frontRank[slotId] !== null).length;
  const showDreamcallerSummary = dreamcaller !== null;

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
      className="side-summary-popover"
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

      {showDreamcallerSummary ? (
        <div className="battle-dreamcaller-card summary-dreamcaller-card" data-battle-summary-dreamcaller-card="">
          <div className="battle-dreamcaller-card-art">
            <DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" />
          </div>
          <div className="battle-dreamcaller-card-copy">
            <h4>{dreamcaller.name}</h4>
            <div className="dreamcaller-text" data-battle-summary-dreamcaller-rules="">
              <RulesText text={dreamcaller.renderedText} />
            </div>
          </div>
        </div>
      ) : (
        <div className="summary-grid">
          <div className="summary-stat">
            <span className="label">Status</span>
            <span className="value">{isActive ? "Active" : "Waiting"}</span>
          </div>
          <div className="summary-stat">
            <span className="label">Back Rank</span>
            <span className="value">{String(reserveCount)}/5</span>
          </div>
          <div className="summary-stat">
            <span className="label">Front Rank</span>
            <span className="value">{String(deployedCount)}/4</span>
          </div>
        </div>
      )}
    </div>
  );
}
