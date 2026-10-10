import type { CSSProperties, ReactElement } from "react";
import { InlineGlyph } from "../typography/InlineGlyph";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";

/**
 * A lasting battle status shown as a badge: a change with a duration, a
 * granted or lost keyword, disabled triggers, an effect lasting until a
 * player pays, a banished card that returns, a pending cost change, a
 * waiting delayed ability, or an exhausted Avatar.
 */
export type BattleStatusBadgeKind =
  | "duration"
  | "keyword"
  | "triggersDisabled"
  | "payable"
  | "returns"
  | "costModifier"
  | "delayedTrigger"
  | "exhausted";

export interface BattleStatusBadgeView {
  readonly kind: BattleStatusBadgeKind;
  /** Accessible name: the status and how long it lasts. */
  readonly label: string;
}

const BADGE_GLYPHS: Readonly<Record<BattleStatusBadgeKind, Glyph>> = {
  duration: GLYPHS.duration,
  keyword: GLYPHS.plus,
  triggersDisabled: GLYPHS.block,
  payable: GLYPHS.lockFilled,
  returns: GLYPHS.refreshCcw,
  costModifier: GLYPHS.energy,
  delayedTrigger: GLYPHS.bolt,
  exhausted: GLYPHS.exhaust,
};

/** The badge diameter: the battle card's status-badge size. */
export const BATTLE_STATUS_BADGE_SIZE = "min(26cqw, 28px)";

/** The shared status-badge material of battle cards and status displays. */
export const BATTLE_STATUS_BADGE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: BATTLE_STATUS_BADGE_SIZE,
  height: BATTLE_STATUS_BADGE_SIZE,
  border: `1px solid ${token("--text-on-accent")}`,
  borderRadius: token("--radius-pill"),
  background: token("--surface-card"),
  color: token("--text-primary"),
  font: token("--t-popover-meta"),
  boxShadow: token("--shadow-sm"),
  boxSizing: "border-box",
  pointerEvents: "none",
};

/**
 * A battle object's lasting statuses, one badge each, in a column at a
 * card's top-left corner (`card`) or a row under a status display
 * (`status`). Renders nothing for no statuses.
 */
export function BattleStatusBadges({
  badges,
  placement,
}: {
  readonly badges: readonly BattleStatusBadgeView[];
  readonly placement: "card" | "status";
}): ReactElement | null {
  if (badges.length === 0) return null;
  return (
    <div
      data-battle-status-badges={placement}
      style={{
        position: "absolute",
        zIndex: 4,
        display: "flex",
        flexDirection: placement === "card" ? "column" : "row",
        gap: token("--space-xxs"),
        pointerEvents: "none",
        ...(placement === "card"
          ? { top: "4%", left: "4%" }
          : { top: "100%", left: "50%", transform: `translate(-50%, calc(-50% + ${token("--space-xxs")}))` }),
      }}
    >
      {badges.map((badge, index) => (
        <div
          key={`${badge.kind}:${String(index)}`}
          role="img"
          aria-label={badge.label}
          data-battle-status-badge={badge.kind}
          style={{
            ...BATTLE_STATUS_BADGE_STYLE,
            width: BATTLE_STATUS_BADGE_SIZE,
            borderRadius: token("--radius-compact"),
            background: token("--surface-status-badge"),
            color: token("--text-on-accent"),
          }}
        >
          <InlineGlyph glyph={BADGE_GLYPHS[badge.kind]} />
        </div>
      ))}
    </div>
  );
}
