import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { DomTestId } from "../../types/dom";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  AvatarPortrait,
  type AvatarVisual,
} from "../hud/AvatarPortrait";
import { InlineGlyph } from "../typography/InlineGlyph";
import { BattleStatusBadges, type BattleStatusBadgeView } from "./BattleStatusBadges";
import type { AvatarId, OpponentId } from "../../../types/identifiers";
import { formatNumber } from "../../../runtime/format-number";

/** Which combatant this status card describes. */
export type BattleStatusOwner = "player" | "enemy";
export type BattleStatusRelationship = "near" | "far";

/** Semantic profile revealed from a populated battle Avatar portrait. */
export interface BattleStatusAvatarProfile {
  readonly id: AvatarId | OpponentId;
  readonly ability: string;
  readonly unavailable?: boolean;
}

export interface BattleStatusDisplayProps {
  /** Combatant represented by this status card. */
  readonly owner: BattleStatusOwner;
  /** Relationship of this canonical combatant to the current local perspective. */
  readonly relationship: BattleStatusRelationship;
  /** Avatar whose head portrait anchors the card, or null while it loads. */
  readonly avatar: AvatarVisual | null;
  /** Optional identity and ability copy revealed from the portrait. */
  readonly avatarProfile?: BattleStatusAvatarProfile;
  /** Energy currently available to this combatant. */
  readonly currentEnergy: number;
  /** Maximum energy available to this combatant. */
  readonly maxEnergy: number;
  /** Current battle points. */
  readonly points: number;
  /** Battle points required to win. */
  readonly pointsToWin: number;
  /** Lasting statuses of this combatant (pending cost changes, returning cards, waiting abilities, an exhausted Avatar), one badge each under the card. */
  readonly statuses?: readonly BattleStatusBadgeView[];
  /** Optional stable test id for the complete status card. */
  readonly testId?: DomTestId;
}

/**
 * The glass status object on a battle board: energy at left, a cropped
 * Avatar portrait at center, and points at right. It has no interaction or
 * phase state; callers only place the complete card.
 */
export function BattleStatusDisplay({
  owner,
  relationship,
  avatar,
  avatarProfile,
  currentEnergy,
  maxEnergy,
  points,
  pointsToWin,
  statuses = [],
  testId,
}: BattleStatusDisplayProps) {

  return (
    <div
      role="group"
      aria-label={((relationship === "near" ? "viewer" : "opponent") === "viewer" ? (pointsToWin === 1 ? `Your side: ${formatNumber(currentEnergy)} of ${formatNumber(maxEnergy)} Energy, ${formatNumber(points)} of ${formatNumber(pointsToWin)} Point` : `Your side: ${formatNumber(currentEnergy)} of ${formatNumber(maxEnergy)} Energy, ${formatNumber(points)} of ${formatNumber(pointsToWin)} Points`) : (pointsToWin === 1 ? `Opponent: ${formatNumber(currentEnergy)} of ${formatNumber(maxEnergy)} Energy, ${formatNumber(points)} of ${formatNumber(pointsToWin)} Point` : `Opponent: ${formatNumber(currentEnergy)} of ${formatNumber(maxEnergy)} Energy, ${formatNumber(points)} of ${formatNumber(pointsToWin)} Points`))}
      data-battle-status=""
      data-owner={owner}
      data-relationship={relationship}
      data-current-energy={String(currentEnergy)}
      data-max-energy={String(maxEnergy)}
      data-points={String(points)}
      data-points-to-win={String(pointsToWin)}
      data-testid={testId}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
        alignItems: "center",
        gap: token("--space-xs"),
        padding: token("--space-xs"),
        color: token("--text-on-glass"),
        ...glassSurfaceStyle({ radius: token("--radius-panel") }),
      }}
    >
      <div
        data-battle-status-resource="energy"
        style={{ display: "flex", justifyContent: "center", minWidth: 0 }}
      >
        <BattleResourceValue
          kind="energy"
          value={`${String(currentEnergy)}/${String(maxEnergy)}`}
        />
      </div>
      <div
        data-battle-status-avatar-slot=""
        style={{ width: token("--touch-min") }}
      >
        {avatar === null ? (
          <div
            role="img"
            aria-label={"Avatar portrait loading"}
            data-battle-status-avatar-placeholder=""
            style={{
              width: "100%",
              height: token("--touch-min"),
              borderRadius: token("--radius-compact"),
              background: token("--surface-placeholder"),
            }}
          />
        ) : (
          <AvatarPortrait
            avatar={avatar}
            variant="thumb"
            profile={avatarProfile}
            unavailable={avatarProfile?.unavailable}
          />
        )}
      </div>
      <div
        data-battle-status-resource="points"
        style={{ display: "flex", justifyContent: "center", minWidth: 0 }}
      >
        <BattleResourceValue
          kind="points"
          value={`${String(points)}/${String(pointsToWin)}`}
        />
      </div>
      <BattleStatusBadges badges={statuses} placement="status" />
    </div>
  );
}

function BattleResourceValue({
  kind,
  value,
}: {
  kind: "energy" | "points";
  value: string;
}) {
  return (
    <span
      data-battle-resource-value={kind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: "inherit",
        font: token("--t-numeral"),
        fontVariantNumeric: "tabular-nums",
        whiteSpace: "nowrap",
      }}
    >
      <span>{value}</span>
      <InlineGlyph
        glyph={kind === "energy" ? GLYPHS.energy : GLYPHS.points}
        color={kind === "energy" ? "energy" : undefined}
      />
    </span>
  );
}
