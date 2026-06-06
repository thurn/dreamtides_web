import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";

import { selectEffectiveSparkOrZero } from "../state/selectors";
import type { BattleCardInstance, BattleMutableState } from "../types";
import { BattleCardBadges } from "./BattleCardBadges";

/**
 * Compact battlefield card face (staggered-parity). Renders in a slot's
 * inner region at a fixed ~96×104 footprint. Shows cost, name, subtype,
 * spark (for characters), and a Fast chip for events. Rules text is dropped
 * at this size and surfaced via the `title` tooltip so the card body stays
 * legible at a glance.
 */
export function BattlefieldCardTile({
  card,
  state,
  isSelected,
  canInteract,
  onClick,
  onKeyDown,
}: {
  card: BattleCardInstance;
  state: BattleMutableState;
  isSelected: boolean;
  canInteract: boolean;
  onClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}) {
  const cost = card.definition.energyCost;
  const effectiveSpark = selectEffectiveSparkOrZero(state, card.battleCardId);
  const isCharacter = card.definition.battleCardKind === "character";
  const subtypeLabel = isCharacter ? card.definition.subtype : "Event";
  const ariaLabel = `${card.definition.name}, cost ${String(cost)}, spark ${String(effectiveSpark)}${isSelected ? ", selected" : ""}`;
  const tooltip = [
    `${card.definition.name} — cost ${String(cost)}${isCharacter ? `, spark ${String(effectiveSpark)}` : ""}`,
    card.definition.renderedText.replace(/<[^>]+>/g, "").trim(),
  ]
    .filter((line) => line !== "")
    .join("\n");
  const frameClass = [
    "relative mt-1 flex h-full w-full flex-col justify-between overflow-hidden rounded-md border p-1 text-left",
    "bg-[linear-gradient(145deg,_rgba(26,16,37,0.95)_0%,_rgba(15,10,24,0.98)_100%)]",
    isSelected
      ? "border-[var(--color-gold)] ring-1 ring-[var(--color-gold)]/70"
      : "border-[var(--color-border)]",
    "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-light)]/80",
  ].join(" ");

  return (
    <div
      role="button"
      tabIndex={0}
      data-battlefield-card-tile=""
      data-battle-card-id={card.battleCardId}
      data-selected={String(isSelected)}
      aria-label={ariaLabel}
      aria-disabled={canInteract ? undefined : true}
      title={tooltip}
      className={frameClass}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="inline-flex items-center gap-0.5 rounded-sm border border-amber-400/60 bg-black/60 px-1 py-[1px] text-[10px] font-bold leading-none text-[var(--color-gold-light)]">
          <i aria-hidden="true" className="bxf bx-flame leading-none" />
          {String(cost)}
        </span>
        {card.definition.isFast ? (
          <span
            aria-label="Fast"
            title="Fast"
            className="rounded-sm border border-amber-300/70 bg-amber-400/15 px-1 py-[1px] text-[10px] font-bold leading-none text-amber-200"
          >
            {"\u21AF"}
          </span>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden px-0.5">
        <p className="truncate text-[11px] font-semibold leading-tight text-white">
          {card.definition.name}
        </p>
        <p className="truncate text-[9px] leading-tight text-slate-400">
          {subtypeLabel}
        </p>
      </div>
      <div className="flex items-end justify-between gap-1">
        <div
          data-battle-card-badges={card.battleCardId}
          className="flex min-h-[0.5rem] flex-wrap gap-0.5"
        >
          <BattleCardBadges instance={card} />
        </div>
        {isCharacter ? (
          <span className="inline-flex items-center gap-0.5 rounded-sm border border-purple-400/60 bg-black/55 px-1 py-[1px] text-[10px] font-bold leading-none text-purple-200">
            <span aria-hidden="true">{"\u2605"}</span>
            {String(effectiveSpark)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
