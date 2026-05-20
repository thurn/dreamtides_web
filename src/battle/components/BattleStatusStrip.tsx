import { selectEffectiveSparkOrZero } from "../state/selectors";
import { DEPLOY_SLOT_IDS } from "../types";
import type {
  BattleCommandSourceSurface,
  BattleMutableState,
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
        <ZoneButton
          count={sideState.hand.length}
          label="H"
          pendingDragCardId={pendingDragCardId}
          pendingDragSourceSurface={pendingDragSourceSurface}
          side={side}
          stat="hand"
          onOpenZone={onOpenZone}
          onZoneDrop={onZoneDrop}
        />
        <ZoneButton
          count={sideState.deck.length}
          label="D"
          pendingDragCardId={pendingDragCardId}
          pendingDragSourceSurface={pendingDragSourceSurface}
          side={side}
          stat="deck"
          onOpenZone={onOpenZone}
          onZoneDrop={onZoneDrop}
        />
        <ZoneButton
          count={sideState.void.length}
          label="V"
          pendingDragCardId={pendingDragCardId}
          pendingDragSourceSurface={pendingDragSourceSurface}
          side={side}
          stat="void"
          onOpenZone={onOpenZone}
          onZoneDrop={onZoneDrop}
        />
        <ZoneButton
          count={sideState.banished.length}
          label="B"
          pendingDragCardId={pendingDragCardId}
          pendingDragSourceSurface={pendingDragSourceSurface}
          side={side}
          stat="banished"
          onOpenZone={onOpenZone}
          onZoneDrop={onZoneDrop}
        />
      </div>
    </section>
  );
}

function ZoneButton({
  count,
  label,
  pendingDragCardId,
  pendingDragSourceSurface,
  side,
  stat,
  onOpenZone,
  onZoneDrop,
}: {
  count: number;
  label: string;
  pendingDragCardId: string | null;
  pendingDragSourceSurface: BattleCommandSourceSurface | null;
  side: BattleSide;
  stat: BrowseableZone;
  onOpenZone: (zone: BrowseableZone) => void;
  onZoneDrop?: (
    side: BattleSide,
    zone: BrowseableZone,
    sourceSurface: BattleCommandSourceSurface,
  ) => void;
}) {
  const isDropTarget = pendingDragCardId !== null &&
    pendingDragSourceSurface !== null &&
    onZoneDrop !== undefined;

  return (
    <button
      type="button"
      data-battle-zone-open={`${side}:${stat}`}
      data-battle-stat={`${side}:${stat}`}
      data-battle-zone-count={String(count)}
      data-battle-zone-drop-target={isDropTarget ? `${side}:${stat}` : undefined}
      className={`stat clickable ${isDropTarget ? "drop-target" : ""}`}
      onClick={() => onOpenZone(stat)}
      onDragOver={(event) => {
        if (isDropTarget) {
          event.preventDefault();
        }
      }}
      onDrop={(event) => {
        if (!isDropTarget || pendingDragSourceSurface === null) {
          return;
        }
        event.preventDefault();
        onZoneDrop?.(side, stat, pendingDragSourceSurface);
      }}
    >
      <span className="label">{label}</span>
      <span className="val">{String(count)}</span>
    </button>
  );
}
