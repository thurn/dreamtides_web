import { selectEffectiveSparkOrZero } from "../state/selectors";
import { DEPLOY_SLOT_IDS } from "../types";
import type {
  BattleMutableState,
  BattleCommandSourceSurface,
  BattleSide,
  BattleSideMutableState,
  BrowseableZone,
} from "../types";

export function BattleStatusStrip({
  side,
  sideState,
  state,
  subtitle,
  title,
  isActive,
  isSummarySelected = false,
  onOpenZone,
  onZoneDrop,
  pendingDragCardId = null,
  pendingDragSourceSurface = null,
  onSelectSummary,
}: {
  side: BattleSide;
  sideState: BattleSideMutableState;
  state: BattleMutableState;
  subtitle: string;
  title: string;
  isActive: boolean;
  isSummarySelected?: boolean;
  onOpenZone: (zone: BrowseableZone) => void;
  onZoneDrop?: (
    side: BattleSide,
    zone: BrowseableZone,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
  pendingDragCardId?: string | null;
  pendingDragSourceSurface?: BattleCommandSourceSurface | null;
  onSelectSummary: () => void;
}) {
  const totalDeployedSpark = DEPLOY_SLOT_IDS.reduce(
    (sum, slotId) => sum + selectEffectiveSparkOrZero(state, sideState.deployed[slotId]),
    0,
  );

  return (
    <section
      data-battle-region={`${side}-status-strip`}
      data-battle-ownership={side}
      data-battle-side-status={side}
      className={`status-strip ${side}`}
    >
      <button
        type="button"
        data-battle-side-summary={side}
        data-battle-side-summary-active={String(isActive)}
        data-battle-side-summary-selected={String(isSummarySelected)}
        className={`summary-trigger ${isSummarySelected ? "selected" : ""} ${isActive ? "active" : ""}`}
        onClick={onSelectSummary}
        title={subtitle === "" ? title : `${title} · ${subtitle}`}
      >
        <span className="who">{side === "player" ? "You" : "Enemy"}</span>
        <span className="summary-meta">
          {title}
          {subtitle === "" ? "" : ` · ${subtitle}`}
        </span>
      </button>
      <div className="stats">
        <div
          data-battle-stat={`${side}:score`}
          data-battle-value={String(sideState.score)}
          className="stat"
        >
          <span className="label">PTS</span>
          <span className="val">{String(sideState.score)}</span>
        </div>
        <div
          data-battle-stat={`${side}:energy`}
          data-battle-current-energy={String(sideState.currentEnergy)}
          data-battle-max-energy={String(sideState.maxEnergy)}
          data-battle-value={`${String(sideState.currentEnergy)}/${String(sideState.maxEnergy)}`}
          className="stat"
        >
          <span className="label">E</span>
          <span className="val">
            {String(sideState.currentEnergy)}/{String(sideState.maxEnergy)}
          </span>
        </div>
        <div
          data-battle-stat={`${side}:spark`}
          data-battle-value={String(totalDeployedSpark)}
          className="stat"
        >
          <span className="label">◆</span>
          <span className="val">{String(totalDeployedSpark)}</span>
        </div>
        <button
          type="button"
          data-battle-zone-open={`${side}:hand`}
          data-battle-stat={`${side}:hand`}
          data-battle-zone-count={String(sideState.hand.length)}
          data-battle-zone-drop-target={pendingDragCardId !== null ? `${side}:hand` : undefined}
          className={`stat clickable ${pendingDragCardId !== null ? "drop-target" : ""}`}
          onClick={() => onOpenZone("hand")}
          onDragOver={(event) => {
            if (pendingDragCardId !== null) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            if (pendingDragSourceSurface === null) {
              return;
            }
            event.preventDefault();
            onZoneDrop?.(side, "hand", pendingDragSourceSurface);
          }}
        >
          <span className="label">H</span>
          <span className="val">{String(sideState.hand.length)}</span>
        </button>
        <button
          type="button"
          data-battle-zone-open={`${side}:deck`}
          data-battle-stat={`${side}:deck`}
          data-battle-zone-count={String(sideState.deck.length)}
          data-battle-zone-drop-target={pendingDragCardId !== null ? `${side}:deck` : undefined}
          className={`stat clickable ${pendingDragCardId !== null ? "drop-target" : ""}`}
          onClick={() => onOpenZone("deck")}
          onDragOver={(event) => {
            if (pendingDragCardId !== null) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            if (pendingDragSourceSurface === null) {
              return;
            }
            event.preventDefault();
            onZoneDrop?.(side, "deck", pendingDragSourceSurface);
          }}
        >
          <span className="label">D</span>
          <span className="val">{String(sideState.deck.length)}</span>
        </button>
        <button
          type="button"
          data-battle-zone-open={`${side}:void`}
          data-battle-stat={`${side}:void`}
          data-battle-zone-count={String(sideState.void.length)}
          data-battle-zone-drop-target={pendingDragCardId !== null ? `${side}:void` : undefined}
          className={`stat clickable ${pendingDragCardId !== null ? "drop-target" : ""}`}
          onClick={() => onOpenZone("void")}
          onDragOver={(event) => {
            if (pendingDragCardId !== null) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            if (pendingDragSourceSurface === null) {
              return;
            }
            event.preventDefault();
            onZoneDrop?.(side, "void", pendingDragSourceSurface);
          }}
        >
          <span className="label">V</span>
          <span className="val">{String(sideState.void.length)}</span>
        </button>
        <button
          type="button"
          data-battle-zone-open={`${side}:banished`}
          data-battle-stat={`${side}:banished`}
          data-battle-zone-count={String(sideState.banished.length)}
          data-battle-zone-drop-target={pendingDragCardId !== null ? `${side}:banished` : undefined}
          className={`stat clickable ${pendingDragCardId !== null ? "drop-target" : ""}`}
          onClick={() => onOpenZone("banished")}
          onDragOver={(event) => {
            if (pendingDragCardId !== null) {
              event.preventDefault();
            }
          }}
          onDrop={(event) => {
            if (pendingDragSourceSurface === null) {
              return;
            }
            event.preventDefault();
            onZoneDrop?.(side, "banished", pendingDragSourceSurface);
          }}
        >
          <span className="label">B</span>
          <span className="val">{String(sideState.banished.length)}</span>
        </button>
      </div>
    </section>
  );
}
