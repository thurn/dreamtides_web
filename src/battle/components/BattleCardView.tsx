import type {
  CSSProperties,
  DragEventHandler,
  MouseEventHandler,
} from "react";
import { useEffect, useState } from "react";
import { cardImageUrl } from "../../data/card-database";
import type { CardData, FrozenCardData } from "../../types/cards";
import type { BattleCardInstance } from "../types";

export interface BattleCardVisualData {
  artUrl: string | null;
  cost: number;
  isFast: boolean;
  kind: "character" | "event";
  name: string;
  printedSpark: number;
  reserved: boolean;
  sparkDelta: number;
  subtype: string;
  text: string;
  tides: readonly string[];
}

export function battleCardVisualFromInstance(
  instance: BattleCardInstance,
): BattleCardVisualData {
  return {
    artUrl: instance.definition.imageNumber > 0 ? cardImageUrl(instance.definition.cardNumber) : null,
    cost: instance.definition.energyCost,
    isFast: instance.definition.isFast,
    kind: instance.definition.battleCardKind,
    name: instance.definition.name,
    printedSpark: instance.definition.printedSpark,
    reserved: false,
    sparkDelta: instance.sparkDelta,
    subtype: normalizeSubtype(instance.definition.subtype, instance.definition.battleCardKind),
    text: stripRulesText(instance.definition.renderedText),
    tides: instance.definition.tides,
  };
}

export function battleCardVisualFromReward(
  card: FrozenCardData,
): BattleCardVisualData {
  return {
    artUrl: card.artOwned ? cardImageUrl(card.cardNumber) : null,
    cost: card.energyCost ?? 0,
    isFast: card.isFast,
    kind: card.cardType === "Character" ? "character" : "event",
    name: card.name,
    printedSpark: card.spark ?? 0,
    reserved: false,
    sparkDelta: 0,
    subtype: normalizeSubtype(card.subtype, card.cardType === "Character" ? "character" : "event"),
    text: stripRulesText(card.renderedText),
    tides: card.tides,
  };
}

export function battleCardDisplayFromInstance(
  instance: BattleCardInstance,
): CardData {
  return {
    name: instance.definition.name,
    id: `battle-card-${instance.battleCardId}`,
    cardNumber: instance.definition.cardNumber,
    cardType: instance.definition.battleCardKind === "character" ? "Character" : "Event",
    subtype: instance.definition.subtype,
    isStarter: false,
    energyCost: instance.definition.printedEnergyCost,
    spark: instance.definition.battleCardKind === "character"
      ? Math.max(0, instance.definition.printedSpark + instance.sparkDelta)
      : null,
    isFast: instance.definition.isFast,
    tides: [...instance.definition.tides],
    renderedText: instance.definition.renderedText,
    imageNumber: instance.definition.imageNumber,
    artOwned: instance.definition.imageNumber > 0,
  };
}

export function BattleCardView({
  battleCardId,
  variant = "mini",
  dataBattleHandCard = false,
  data,
  hidden = false,
  playable = false,
  selected = false,
  unaffordable = false,
  reserved = false,
  style,
  className = "",
  draggable = false,
  onClick,
  onDoubleClick,
  onContextMenu,
  onDragStart,
  onDragEnd,
  onMouseEnter,
  onMouseLeave,
  onMouseMove,
}: {
  battleCardId?: string;
  variant?: "mini" | "hand";
  dataBattleHandCard?: boolean;
  data: BattleCardVisualData;
  hidden?: boolean;
  playable?: boolean;
  selected?: boolean;
  unaffordable?: boolean;
  reserved?: boolean;
  style?: CSSProperties;
  className?: string;
  draggable?: boolean;
  onClick?: MouseEventHandler<HTMLDivElement>;
  onDoubleClick?: MouseEventHandler<HTMLDivElement>;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  onDragStart?: DragEventHandler<HTMLDivElement>;
  onDragEnd?: DragEventHandler<HTMLDivElement>;
  onMouseEnter?: MouseEventHandler<HTMLDivElement>;
  onMouseLeave?: MouseEventHandler<HTMLDivElement>;
  onMouseMove?: MouseEventHandler<HTMLDivElement>;
}) {
  const effectiveSpark = Math.max(0, data.printedSpark + data.sparkDelta);
  const sparkClassName = data.sparkDelta > 0
    ? "boosted"
    : data.sparkDelta < 0
      ? "nerfed"
      : "";
  const cardClassName = [
    "battle-card",
    variant === "hand" ? "hand-card" : "",
    data.kind === "event" ? "event" : "",
    playable ? "playable" : "",
    selected ? "selected" : "",
    unaffordable ? "unaffordable" : "",
    hidden ? "hidden-enemy" : "",
    reserved || data.reserved ? "reserved" : "",
    className,
  ]
    .filter((value) => value !== "")
    .join(" ");

  return (
    <div
      data-battle-card-id={battleCardId}
      data-battle-card-variant={variant}
      data-battle-hand-card={dataBattleHandCard ? "" : undefined}
      data-battle-card-playable={playable ? "true" : "false"}
      data-selected={String(selected)}
      className={cardClassName}
      style={style}
      draggable={draggable}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseMove={onMouseMove}
    >
      <div className="c-top">
        <div className="c-cost" aria-label="energy cost">{hidden ? "?" : String(data.cost)}</div>
        {data.kind === "character" ? (
          <div className={`c-spark ${sparkClassName}`} aria-label="spark">
            {hidden ? "?" : String(effectiveSpark)}
          </div>
        ) : (
          <div className="c-spark event">{hidden ? "?" : "•"}</div>
        )}
      </div>
      <div className="c-art">
        {hidden ? null : <BattleCardArt data={data} />}
      </div>
      <div className="c-name">{hidden ? "?" : data.name}</div>
      <div className="c-type">
        <span>{hidden ? "?" : data.subtype}</span>
      </div>
      {variant === "hand" && !hidden && data.text !== "" ? (
        <div className="c-rules">{data.text}</div>
      ) : null}
    </div>
  );
}

function BattleCardArt({ data }: { data: BattleCardVisualData }) {
  const [showFallback, setShowFallback] = useState(data.artUrl === null);

  useEffect(() => {
    setShowFallback(data.artUrl === null);
  }, [data.artUrl]);

  if (showFallback) {
    return <div className="c-art-fill" style={createArtStyle(data.tides)} />;
  }

  return (
    <>
      <img
        src={data.artUrl ?? undefined}
        alt=""
        className="c-art-image"
        draggable={false}
        loading="lazy"
        onError={() => setShowFallback(true)}
      />
      <div className="c-art-overlay" />
    </>
  );
}

function createArtStyle(tides: readonly string[]): CSSProperties {
  const hue = tideHueForName(tides[0] ?? "");

  return {
    background: [
      `radial-gradient(circle at 20% 20%, oklch(0.72 0.12 ${String(hue)} / 0.45), transparent 38%)`,
      `radial-gradient(circle at 78% 28%, oklch(0.65 0.11 ${String((hue + 32) % 360)} / 0.35), transparent 42%)`,
      `radial-gradient(circle at 50% 78%, oklch(0.58 0.08 ${String((hue + 280) % 360)} / 0.28), transparent 40%)`,
      "linear-gradient(180deg, oklch(0.17 0.02 260), oklch(0.11 0.01 260))",
    ].join(", "),
  };
}

function tideHueForName(tide: string): number {
  if (tide === "") {
    return 190;
  }
  let hash = 0;
  for (const char of tide) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 360;
}

function normalizeSubtype(subtype: string, kind: "character" | "event"): string {
  if (subtype === "" || subtype === "*") {
    return kind === "event" ? "EVENT" : "";
  }

  return subtype.toUpperCase();
}

function stripRulesText(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
