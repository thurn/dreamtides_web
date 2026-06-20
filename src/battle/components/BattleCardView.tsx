import type {
  CSSProperties,
  DragEventHandler,
  MouseEventHandler,
} from "react";
import { useEffect, useState } from "react";
import { cardImageUrl } from "../../data/card-database";
import { DEFAULT_ART_CROP } from "../../components/CardView";
import type { ArtCrop, CardData, FrozenCardData } from "../../types/cards";
import type { BattleCardInstance } from "../types";
import { selectEffectiveSparkForInstance, selectFigmentCount } from "../state/figments";
import { AutomationGearIcon } from "./AutomationGearIcon";

export interface BattleCardVisualData {
  artUrl: string | null;
  /** Curated art crop (pan/zoom) for the source image. Absent cards render with
   *  the default centered crop. */
  art?: ArtCrop;
  cost: number;
  /** ⧗ counters stored on this card; 0 when the card holds none. */
  counters: number;
  isFast: boolean;
  figmentCount: number;
  effectiveSpark: number;
  kind: "character" | "event";
  name: string;
  printedSpark: number;
  reserved: boolean;
  sparkDelta: number;
  subtype: string;
  text: string;
}

export function battleCardVisualFromInstance(
  instance: BattleCardInstance,
): BattleCardVisualData {
  return {
    artUrl: instance.definition.imageNumber > 0 ? cardImageUrl(instance.definition.imageNumber) : null,
    art: instance.definition.art,
    cost: instance.definition.energyCost,
    counters: instance.status.counters,
    figmentCount: selectFigmentCount(instance),
    effectiveSpark: instance.definition.battleCardKind === "character"
      ? selectEffectiveSparkForInstance(instance)
      : 0,
    isFast: instance.definition.isFast,
    kind: instance.definition.battleCardKind,
    name: instance.definition.name,
    printedSpark: instance.definition.printedSpark,
    reserved: false,
    sparkDelta: instance.sparkDelta,
    subtype: normalizeSubtype(instance.definition.subtype, instance.definition.battleCardKind),
    text: stripRulesText(instance.definition.renderedText),
  };
}

export function battleCardVisualFromReward(
  card: FrozenCardData,
): BattleCardVisualData {
  return {
    artUrl: card.artOwned ? cardImageUrl(card.imageNumber) : null,
    art: card.art,
    cost: card.energyCost ?? 0,
    counters: 0,
    figmentCount: 1,
    effectiveSpark: card.cardType === "Character" ? Math.max(0, card.spark ?? 0) : 0,
    isFast: card.isFast,
    kind: card.cardType === "Character" ? "character" : "event",
    name: card.name,
    printedSpark: card.spark ?? 0,
    reserved: false,
    sparkDelta: 0,
    subtype: normalizeSubtype(card.subtype, card.cardType === "Character" ? "character" : "event"),
    text: stripRulesText(card.renderedText),
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
      ? selectEffectiveSparkForInstance(instance)
      : null,
    isFast: instance.definition.isFast,
    renderedText: instance.definition.renderedText,
    imageNumber: instance.definition.imageNumber,
    artOwned: instance.definition.imageNumber > 0,
    art: instance.definition.art,
  };
}

export function BattleCardView({
  battleCardId,
  variant = "mini",
  dataBattleHandCard = false,
  data,
  hidden = false,
  exhausted = false,
  playable = false,
  selected = false,
  unaffordable = false,
  reserved = false,
  showAutomationGear = false,
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
  exhausted?: boolean;
  playable?: boolean;
  selected?: boolean;
  unaffordable?: boolean;
  reserved?: boolean;
  showAutomationGear?: boolean;
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
  const effectiveSpark = data.kind === "character" ? data.effectiveSpark : 0;
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
    exhausted ? "exhausted" : "",
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
        {showAutomationGear ? (
          <AutomationGearIcon className="c-automation-gear" />
        ) : null}
      </div>
      <div className="c-art">
        {hidden ? null : <BattleCardArt data={data} />}
      </div>
      {!hidden && exhausted ? (
        <div className="c-exhausted" aria-label="exhausted">☪</div>
      ) : null}
      {!hidden && data.kind === "character" && data.figmentCount > 1 ? (
        <div className="c-figment-count" aria-label="figment count">
          {String(data.figmentCount)}
        </div>
      ) : null}
      {!hidden && data.counters > 0 ? (
        <div className="c-counters" aria-label={`${String(data.counters)} counters`}>
          <span className="c-counters-glyph" aria-hidden="true">⧗</span>
          {String(data.counters)}
        </div>
      ) : null}
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
    return <div className="c-art-fill" style={createArtStyle(data.name)} />;
  }

  return (
    <>
      <img
        src={data.artUrl ?? undefined}
        alt=""
        className="c-art-image"
        style={battleArtImageStyle(data.art ?? DEFAULT_ART_CROP)}
        draggable={false}
        loading="lazy"
        onError={() => setShowFallback(true)}
      />
      <div className="c-art-overlay" />
    </>
  );
}

/**
 * Inline CSS that applies a card's curated art crop (pan/zoom) to the battle
 * card art image, so the framing matches the shared `CardView`. The image cover-
 * fits the art box (`object-fit: cover` in CSS); `object-position` pans within
 * the cover overscan and `transform: scale` adds the curated zoom around that
 * same focal point, so panning and zooming stay anchored together.
 *
 * The crop's `x`/`y` are normalized to [-1, 1] with 0 centered, the same
 * convention `CardView` resolves: a positive `x` reveals more of the image's
 * left side, so it maps to a smaller `object-position` percentage (and likewise
 * for `y`). The watermark strip is clipped off the source bottom in CSS; the
 * crop `scale` (≥ the default 1.17) refills the clipped band.
 */
function battleArtImageStyle(crop: ArtCrop): CSSProperties {
  const positionX = ((1 - crop.x) / 2) * 100;
  const positionY = ((1 - crop.y) / 2) * 100;
  const position = `${positionX.toFixed(3)}% ${positionY.toFixed(3)}%`;
  return {
    objectPosition: position,
    transformOrigin: position,
    transform: `scale(${String(crop.scale)})`,
  };
}

function createArtStyle(name: string): CSSProperties {
  const hue = hueForName(name);

  return {
    background: [
      `radial-gradient(circle at 20% 20%, oklch(0.72 0.12 ${String(hue)} / 0.45), transparent 38%)`,
      `radial-gradient(circle at 78% 28%, oklch(0.65 0.11 ${String((hue + 32) % 360)} / 0.35), transparent 42%)`,
      `radial-gradient(circle at 50% 78%, oklch(0.58 0.08 ${String((hue + 280) % 360)} / 0.28), transparent 40%)`,
      "linear-gradient(180deg, oklch(0.17 0.02 260), oklch(0.11 0.01 260))",
    ].join(", "),
  };
}

/**
 * Derives a stable fallback-art hue from the card name so cards without linked
 * art get a consistent gradient. The name is a stable per-card key, so the same
 * card always renders the same hue.
 */
function hueForName(name: string): number {
  if (name === "") {
    return 190;
  }
  let hash = 0;
  for (const char of name) {
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
