/**
 * The Expert's per-card overrides (phase-7-ai § 7.3): plays of a card the
 * Expert never weighs, filled only from misplays observed in its games,
 * each with a note naming the misplay. The table holds catalog UUIDs only.
 */
import type { CardId } from "../../types/card-identity";
import type { Action } from "../rules/actions";
import type { BattleView } from "../view/view";

export interface ExpertOverride {
  readonly cardId: CardId;
  /** Never play this card. */
  readonly rule: "neverPlay";
  /** The observed misplay, with its game and decision. */
  readonly note: string;
}

export const EXPERT_OVERRIDES: readonly ExpertOverride[] = [];

/** Whether an override rules out `action` in `view`. */
export function overridden(view: BattleView, action: Action, overrides: readonly ExpertOverride[] = EXPERT_OVERRIDES): boolean {
  if (action.kind !== "play") return false;
  const printing = view.instances[action.card]?.printing;
  if (printing === undefined || printing.kind === "figment") return false;
  return overrides.some((override) => override.rule === "neverPlay" && override.cardId === printing.cardId);
}
