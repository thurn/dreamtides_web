import { glassSurfaceStyle } from "../../internal/glass-surface";
import type { DomTestId } from "../../types/dom";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "../hud/DreamAvatarPortrait";
import { InlineGlyph } from "../typography/InlineGlyph";
import {
  tx,
  select,
  when,
  otherwise,
  plural,
  one,
  other,
  txa,
} from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { LocalizedString } from "@trox/runtime";
import type { DreamAvatarId, OpponentId } from "../../../types/identifiers";

/** Which combatant this status card describes. */
export type BattleStatusOwner = "player" | "enemy";
export type BattleStatusRelationship = "near" | "far";

/** Semantic profile revealed from a populated battle DreamAvatar portrait. */
export interface BattleStatusDreamAvatarProfile {
  readonly id: DreamAvatarId | OpponentId;
  readonly ability: LocalizedString;
  readonly unavailable?: boolean;
}

export interface BattleStatusDisplayProps {
  /** Combatant represented by this status card. */
  readonly owner: BattleStatusOwner;
  /** Relationship of this canonical combatant to the current local perspective. */
  readonly relationship: BattleStatusRelationship;
  /** DreamAvatar whose head portrait anchors the card, or null while it loads. */
  readonly dreamAvatar: DreamAvatarVisual | null;
  /** Optional identity and ability copy revealed from the portrait. */
  readonly dreamAvatarProfile?: BattleStatusDreamAvatarProfile;
  /** Energy currently available to this combatant. */
  readonly currentEnergy: number;
  /** Maximum energy available to this combatant. */
  readonly maxEnergy: number;
  /** Current battle points. */
  readonly points: number;
  /** Battle points required to win. */
  readonly pointsToWin: number;
  /** Optional stable test id for the complete status card. */
  readonly testId?: DomTestId;
}

/**
 * The glass status object on a battle board: energy at left, a cropped
 * DreamAvatar portrait at center, and points at right. It has no interaction or
 * phase state; callers only place the complete card.
 */
export function BattleStatusDisplay({
  owner,
  relationship,
  dreamAvatar,
  dreamAvatarProfile,
  currentEnergy,
  maxEnergy,
  points,
  pointsToWin,
  testId,
}: BattleStatusDisplayProps) {
  const resolve = useLocalizer();

  return (
    <div
      role="group"
      aria-label={resolve(
        txa(
          select(relationship === "near" ? "viewer" : "opponent", [
            when(
              "viewer",
              plural(pointsToWin, [
                one(
                  "Your side: {current_energy} of {max_energy} Energy, {points} of {points_to_win} Point",
                ),
                other(
                  "Your side: {current_energy} of {max_energy} Energy, {points} of {points_to_win} Points",
                ),
              ]),
            ),
            otherwise(
              plural(pointsToWin, [
                one(
                  "Opponent: {current_energy} of {max_energy} Energy, {points} of {points_to_win} Point",
                ),
                other(
                  "Opponent: {current_energy} of {max_energy} Energy, {points} of {points_to_win} Points",
                ),
              ]),
            ),
          ]),
          {
            current_energy: currentEnergy,
            max_energy: maxEnergy,
            points,
            points_to_win: pointsToWin,
          },
          '[accessibility] [battle] Summary for one participant\'s battle status card. owner is "viewer" for the side nearest the current local perspective or "opponent" for the opposing side. Energy and point values are non-negative integers; maximums and the points-to-win target are positive integers.',
        ),
      )}
      data-battle-status=""
      data-owner={owner}
      data-relationship={relationship}
      data-current-energy={String(currentEnergy)}
      data-max-energy={String(maxEnergy)}
      data-points={String(points)}
      data-points-to-win={String(pointsToWin)}
      data-testid={testId}
      style={{
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
        data-battle-status-dream-avatar-slot=""
        style={{ width: token("--touch-min") }}
      >
        {dreamAvatar === null ? (
          <div
            role="img"
            aria-label={resolve(
              tx(
                "Avatar portrait loading",
                "[battle] [loading] Status avatar loading.",
              ),
            )}
            data-battle-status-dream-avatar-placeholder=""
            style={{
              width: "100%",
              height: token("--touch-min"),
              borderRadius: token("--radius-compact"),
              background: token("--surface-placeholder"),
            }}
          />
        ) : (
          <DreamAvatarPortrait
            dreamAvatar={dreamAvatar}
            variant="thumb"
            profile={dreamAvatarProfile}
            unavailable={dreamAvatarProfile?.unavailable}
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
