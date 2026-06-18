import { useEffect, useRef } from "react";
import type {
  BattleDreamcallerSummary,
  BattleDreamsignSummary,
  BattleMutableState,
  BattleSide,
} from "../types";
import { FRONT_RANK_SLOT_IDS, BACK_RANK_SLOT_IDS } from "../types";
import { DreamcallerPortrait } from "../../components/DreamcallerPortrait";
import { RulesText } from "../../components/RulesText";

export function BattleSideSummaryPopover({
  dreamcaller = null,
  dreamsigns = [],
  isSelected = false,
  isActive,
  onClose,
  side,
  state,
  subtitle,
  title,
}: {
  dreamcaller?: BattleDreamcallerSummary | null;
  /**
   * The dreamsigns this side carries, shown beneath the Dreamcaller summary so
   * the player can read the opponent's dreamsign before the battle begins
   * (quests doc "Battle"). Empty for a side carrying no dreamsigns.
   */
  dreamsigns?: readonly BattleDreamsignSummary[];
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
  const backRankCount = BACK_RANK_SLOT_IDS.filter((slotId) => sideState.backRank[slotId] !== null).length;
  const frontRankCount = FRONT_RANK_SLOT_IDS.filter((slotId) => sideState.frontRank[slotId] !== null).length;
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
        <>
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
          <div className="floating-section" data-battle-summary-dreamsigns="">
            <h4>Dreamsigns</h4>
            {dreamsigns.length === 0 ? (
              <div className="floating-empty">No active Dreamsigns.</div>
            ) : (
              <div className="dreamsign-list">
                {dreamsigns.map((dreamsign) => (
                  <div
                    key={`${dreamsign.name}-${dreamsign.effectDescription}`}
                    className="dreamsign-card"
                  >
                    <div className="dreamsign-head">
                      <strong>{dreamsign.name}</strong>
                      {dreamsign.isBane ? (
                        <span className="dreamsign-badge bane">Bane</span>
                      ) : null}
                    </div>
                    <p>{dreamsign.effectDescription}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="summary-grid">
          <div className="summary-stat">
            <span className="label">Status</span>
            <span className="value">{isActive ? "Active" : "Waiting"}</span>
          </div>
          <div className="summary-stat">
            <span className="label">Back Rank</span>
            <span className="value">{String(backRankCount)}/5</span>
          </div>
          <div className="summary-stat">
            <span className="label">Front Rank</span>
            <span className="value">{String(frontRankCount)}/4</span>
          </div>
        </div>
      )}
    </div>
  );
}
