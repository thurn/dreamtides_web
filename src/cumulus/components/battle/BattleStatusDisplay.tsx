import { glassSurfaceStyle } from "../../internal/glass-surface";
import { token } from "../../primitives/tokens";
import {
  DreamcallerPortrait,
  type DreamcallerVisual,
} from "../hud/DreamcallerPortrait";
import { ResourceChip } from "../hud/ResourceChip";

/** Which combatant this status card describes. */
export type BattleStatusOwner = "player" | "enemy";

/** Semantic profile revealed from a populated battle Dreamcaller portrait. */
export interface BattleStatusDreamcallerProfile {
  readonly id: string;
  readonly ability: string;
  readonly unavailable?: boolean;
}

export interface BattleStatusDisplayProps {
  /** Combatant represented by this status card. */
  readonly owner: BattleStatusOwner;
  /** Dreamcaller whose head portrait anchors the card, or null while it loads. */
  readonly dreamcaller: DreamcallerVisual | null;
  /** Optional identity and ability copy revealed from the portrait. */
  readonly dreamcallerProfile?: BattleStatusDreamcallerProfile;
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
 * The glass status object on a battle board: energy at left, a cropped
 * Dreamcaller portrait at center, and points at right. It has no interaction or
 * phase state; callers only place the complete card.
 */
export function BattleStatusDisplay({
  owner,
  dreamcaller,
  dreamcallerProfile,
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
        height: "100%",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
        alignItems: "center",
        gap: token("--space-2"),
        padding: token("--space-3"),
        color: token("--text-on-glass"),
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
      }}
    >
      <div
        data-battle-status-resource="energy"
        style={{ display: "flex", justifyContent: "center", minWidth: 0 }}
      >
        <ResourceChip
          kind="energy"
          value={`${String(currentEnergy)}/${String(maxEnergy)}`}
          size="md"
        />
      </div>
      <div style={{ width: token("--touch-min") }}>
        {dreamcaller === null ? (
          <div
            role="img"
            aria-label="Dreamcaller portrait loading"
            data-battle-status-dreamcaller-placeholder=""
            style={{
              width: "100%",
              height: token("--touch-min"),
              borderRadius: token("--radius-inset"),
              background: token("--surface-placeholder"),
            }}
          />
        ) : (
          <DreamcallerPortrait
            dreamcaller={dreamcaller}
            variant="thumb"
            profile={dreamcallerProfile}
            unavailable={dreamcallerProfile?.unavailable}
          />
        )}
      </div>
      <div
        data-battle-status-resource="points"
        style={{ display: "flex", justifyContent: "center", minWidth: 0 }}
      >
        <ResourceChip kind="points" value={points} size="md" tone="inherit" />
      </div>
    </div>
  );
}
