import type { CSSProperties, DragEventHandler, MouseEventHandler } from "react";
import { asCardId, asCardName, isCardId } from "../../types/card-identity";
import { CardView, GameCard, type GameCardModel } from "../../tango/components/card/CardView";
import type { BattleCardInstance } from "../types";
import { selectEffectiveSparkForInstance } from "../state/figments";
import { AutomationGearIcon } from "./AutomationGearIcon";
import { BattleCardView, battleCardDisplayFromInstance, battleCardVisualFromInstance } from "./BattleCardView";

/** Resolve canonical battle display state without changing battle-instance identity. */
export function battleGameCardModel(instance: BattleCardInstance): GameCardModel {
  const definition = instance.definition;
  if (!isCardId(definition.cardId)) {
    throw new Error(`BattleGameCard requires a canonical card UUID; ${instance.battleCardId} has none.`);
  }
  const cardId = asCardId(definition.cardId);
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: asCardName(definition.name),
      cardNumber: definition.cardNumber,
      cardType: definition.battleCardKind === "character" ? "Character" : "Event",
      subtype: definition.subtype,
      isStarter: false,
      energyCost: definition.energyCost,
      ...(definition.energyCosts === undefined ? {} : { energyCosts: definition.energyCosts }),
      spark: definition.battleCardKind === "character" ? selectEffectiveSparkForInstance(instance) : null,
      isFast: definition.isFast,
      isInterrupt: definition.timing === "interrupt",
      reclaimCost: definition.reclaimCost,
      renderedText: definition.renderedText,
      imageNumber: definition.imageNumber,
      artOwned: definition.imageNumber > 0,
      ...(definition.art === undefined ? {} : { art: definition.art }),
    },
  };
}

export interface BattleGameCardProps {
  readonly instance: BattleCardInstance;
  readonly variant?: "mini" | "hand";
  readonly compact?: boolean;
  readonly hidden?: boolean;
  readonly exhausted?: boolean;
  readonly playable?: boolean;
  readonly selected?: boolean;
  readonly unaffordable?: boolean;
  readonly reserved?: boolean;
  readonly showAutomationGear?: boolean;
  readonly dataBattleHandCard?: boolean;
  readonly style?: CSSProperties;
  readonly className?: string;
  readonly draggable?: boolean;
  readonly onActivate?: () => void;
  readonly onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  readonly onContextMenu?: MouseEventHandler<HTMLDivElement>;
  readonly onDragStart?: DragEventHandler<HTMLDivElement>;
  readonly onDragEnd?: DragEventHandler<HTMLDivElement>;
  readonly onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  readonly onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  readonly onMouseMove?: MouseEventHandler<HTMLDivElement>;
}

/** Battle adapter for the canonical Tango GameCard reveal path. */
export function BattleGameCard({
  instance, variant = "mini", compact = false, hidden = false,
  exhausted = instance.status.isExhausted, playable = false, selected = false,
  unaffordable = false, reserved = false, showAutomationGear = false,
  dataBattleHandCard = false, style, className = "", draggable = false,
  onActivate, onDoubleClick, onContextMenu, onDragStart, onDragEnd,
  onMouseEnter, onMouseLeave, onMouseMove,
}: BattleGameCardProps) {
  const canonical = isCardId(instance.definition.cardId);
  if (!canonical) {
    if (variant === "hand") {
      return <div data-battle-card-id={instance.battleCardId} data-battle-card-variant={variant}
        data-selected={String(selected)} className={["battle-card", "hand-card", className].filter(Boolean).join(" ")}
        style={style} draggable={draggable} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
        onClick={onActivate}
        onDragStart={onDragStart} onDragEnd={onDragEnd} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseMove={onMouseMove}>
        <CardView card={battleCardDisplayFromInstance(instance)} selected={selected} hideRulesText={compact} />
      </div>;
    }
    return <BattleCardView battleCardId={instance.battleCardId} variant={variant} dataBattleHandCard={dataBattleHandCard}
      data={battleCardVisualFromInstance(instance)} hidden={hidden} exhausted={exhausted} playable={playable}
      selected={selected} unaffordable={unaffordable} reserved={reserved} showAutomationGear={showAutomationGear}
      style={style} className={className} draggable={draggable} onClick={onActivate}
      onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseMove={onMouseMove} />;
  }
  const classes = ["battle-card", "battle-game-card", variant === "hand" ? "hand-card" : "",
    selected ? "selected" : "", playable ? "playable" : "", unaffordable ? "unaffordable" : "",
    exhausted ? "exhausted" : "", reserved ? "reserved" : "", hidden ? "hidden-enemy" : "", className]
    .filter(Boolean).join(" ");
  return (
    <div data-battle-card-id={instance.battleCardId} data-battle-card-variant={variant}
      data-battle-hand-card={dataBattleHandCard ? "" : undefined} data-battle-card-playable={String(playable)}
      data-selected={String(selected)} data-battle-card-hidden={String(hidden)}
      data-battle-card-counters={String(instance.status.counters)} data-battle-card-exhausted={String(exhausted)}
      data-battle-card-transfiguration={instance.definition.transfiguration ?? undefined}
      className={classes} style={style} draggable={draggable} onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu} onDragStart={onDragStart} onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onMouseMove={onMouseMove}>
      {hidden ? <div aria-label="Hidden enemy card" className="battle-card-hidden-face">?</div> : (
        <GameCard model={battleGameCardModel(instance)} selected={selected} selectionColor="selected"
          hideRulesText={compact} unavailable={unaffordable} onActivate={onActivate} />
      )}
      {showAutomationGear ? <AutomationGearIcon className="c-automation-gear" /> : null}
    </div>
  );
}
