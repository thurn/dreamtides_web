import { token } from "../../primitives/tokens";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "../hud/DreamcallerPortrait";
import { ResourceChip } from "../hud/ResourceChip";

/** Which combatant this status card describes. */
export type BattleStatusOwner = "player" | "enemy";

export interface BattleStatusDisplayProps {
  /** Combatant represented by this status card. */
  readonly owner: BattleStatusOwner;
  /** Dreamcaller whose head portrait anchors the card. */
  readonly dreamcaller: DreamcallerVisual;
  /** Energy currently available to this combatant. */
  readonly currentEnergy: number;
  /** Maximum energy available to this combatant. */
  readonly maxEnergy: number;
  /** Current battle points. */
  readonly points: number;
  /** Optional stable test id for the complete status card. */
  readonly testId?: string;
}

/**
 * The fixed solid status object on a battle board: energy at left, a cropped
 * Dreamcaller portrait at center, and points at right. It has no interaction or
 * phase state; callers only place the complete card.
 */
export function BattleStatusDisplay({
  owner,
  dreamcaller,
  currentEnergy,
  maxEnergy,
  points,
  testId,
}: BattleStatusDisplayProps) {
  const ownerLabel = owner === "player" ? "Player" : "Enemy";

  return (
    <div
      role="group"
      aria-label={`${ownerLabel}: ${String(currentEnergy)} of ${String(maxEnergy)} energy, ${String(points)} points`}
      data-battle-status=""
      data-owner={owner}
      data-current-energy={String(currentEnergy)}
      data-max-energy={String(maxEnergy)}
      data-points={String(points)}
      data-testid={testId}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
        alignItems: "center",
        gap: token("--space-2"),
        padding: token("--space-3"),
        background: token("--surface-chrome"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-panel"),
        boxShadow: token("--shadow-card"),
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-start", minWidth: 0 }}>
        <ResourceChip
          kind="energy"
          value={`${String(currentEnergy)}/${String(maxEnergy)}`}
          size="lg"
        />
      </div>
      <div style={{ width: token("--touch-min") }}>
        <DreamcallerPortrait dreamcaller={dreamcaller} variant="thumb" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 0 }}>
        <ResourceChip kind="points" value={points} size="lg" />
      </div>
    </div>
  );
}
