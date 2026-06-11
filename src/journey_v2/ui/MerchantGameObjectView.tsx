import { CardDisplay } from "../../components/CardDisplay";
import { CardHoverPreview } from "../../components/CardHoverPreview";
import { DreamsignArtTile } from "../../components/DreamsignArtTile";
import { DreamsignHoverCard } from "../../components/DreamsignHoverCard";
import {
  CARD_HOVER_PREVIEW_DELAY_MS,
  CARD_HOVER_PREVIEW_WIDTH_PX,
  HoverPopover,
} from "../../components/HoverPopover";
import { RulesText } from "../../components/RulesText";
import type { Dreamsign } from "../../types/quest";
import type { MerchantGameObject } from "../types";

interface MerchantGameObjectViewProps {
  object: MerchantGameObject;
  compact?: boolean;
}

function ObjectBadge({
  badge,
}: {
  badge: MerchantGameObject["badge"];
}) {
  if (badge === undefined) return null;
  return (
    <span
      className="inline-flex min-h-6 items-center rounded-md border border-amber-300/50 bg-amber-300/15 px-2 py-1 text-[11px] font-semibold uppercase leading-none text-amber-100"
      data-testid="merchant-game-object-badge"
      title={badge.detail}
    >
      {badge.label}
    </span>
  );
}

function CardObjectView({
  object,
  compact,
}: {
  object: Extract<
    MerchantGameObject,
    { objectType: "catalogCard" | "deckCard" }
  >;
  compact: boolean;
}) {
  const card =
    object.objectType === "deckCard" && object.previewCard
      ? object.previewCard
      : object.card;
  const title =
    object.objectType === "deckCard"
      ? `${object.displayName} in deck`
      : `${object.displayName} for deck`;

  return (
    <HoverPopover
      triggerAs="div"
      placement="left"
      delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
      maxWidthPx={null}
      content={({ anchorRect, side }) => (
        <CardHoverPreview
          card={card}
          testId={`merchant-game-object-hover-${object.cardUuid}`}
          widthPx={CARD_HOVER_PREVIEW_WIDTH_PX}
          popoverSide={side}
          anchorRect={anchorRect}
          transfiguration={object.transfiguration}
        />
      )}
    >
      <article
        className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)] items-center gap-3 rounded-md border border-slate-600/60 bg-slate-950/55 p-2 text-left"
        data-card-uuid={object.cardUuid}
        data-card-number={object.cardNumber}
        data-entry-id={object.entryId}
        data-testid={`merchant-game-object-${object.objectType}`}
        aria-label={title}
      >
        <div className="w-[54px] shrink-0 overflow-hidden rounded-md">
          <CardDisplay
            card={card}
            hideRulesText={compact}
            suppressHoverHelp
            transfiguration={object.transfiguration}
            className="w-[54px]"
          />
        </div>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-100">
              {object.displayName}
            </h4>
            <ObjectBadge badge={object.badge} />
          </div>
          <p className="text-xs leading-snug text-slate-400">{title}</p>
          {object.objectType === "deckCard" && object.previewCard !== undefined && (
            <p className="text-xs leading-snug text-emerald-200">
              Preview: {object.previewCard.name}
            </p>
          )}
        </div>
      </article>
    </HoverPopover>
  );
}

function dreamsignFromObject(
  object: Extract<MerchantGameObject, { objectType: "dreamsign" }>,
): Dreamsign {
  return {
    id: object.dreamsignId,
    name: object.dreamsignTemplate.name,
    effectDescription: object.dreamsignTemplate.effectDescription,
    imageName: object.dreamsignTemplate.imageName,
    imageAlt: object.dreamsignTemplate.imageAlt,
    isBane: false,
  };
}

function DreamsignObjectView({
  object,
}: {
  object: Extract<MerchantGameObject, { objectType: "dreamsign" }>;
}) {
  const dreamsign = dreamsignFromObject(object);
  return (
    <HoverPopover
      triggerAs="div"
      placement="left"
      delayMs={CARD_HOVER_PREVIEW_DELAY_MS}
      maxWidthPx={null}
      content={({ anchorRect, side }) => (
        <DreamsignHoverCard
          dreamsign={dreamsign}
          testid={`merchant-game-object-dreamsign-hover-${object.dreamsignId}`}
          popoverSide={side}
          anchorRect={anchorRect}
        />
      )}
    >
      <article
        className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-md border border-emerald-400/35 bg-emerald-950/20 p-2 text-left"
        data-dreamsign-id={object.dreamsignId}
        data-testid="merchant-game-object-dreamsign"
        aria-label={`${object.displayName} dreamsign`}
      >
        <DreamsignArtTile dreamsign={dreamsign} sizePx={52} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h4 className="min-w-0 break-words text-sm font-semibold leading-tight text-slate-100">
              {object.displayName}
            </h4>
            <ObjectBadge badge={object.badge} />
          </div>
          <div className="text-xs leading-snug text-slate-300">
            <RulesText text={object.dreamsignTemplate.effectDescription} />
          </div>
        </div>
      </article>
    </HoverPopover>
  );
}

export function MerchantGameObjectView({
  object,
  compact = false,
}: MerchantGameObjectViewProps) {
  if (object.objectType === "catalogCard" || object.objectType === "deckCard") {
    return <CardObjectView object={object} compact={compact} />;
  }
  return <DreamsignObjectView object={object} />;
}

export function MerchantGameObjectList({
  objects,
  compact = false,
}: {
  objects: readonly MerchantGameObject[];
  compact?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-2" data-testid="merchant-game-object-list">
      {objects.map((object, index) => (
        <MerchantGameObjectView
          key={gameObjectKey(object, index)}
          object={object}
          compact={compact}
        />
      ))}
    </div>
  );
}

function gameObjectKey(object: MerchantGameObject, index: number): string {
  if (object.objectType === "catalogCard") {
    return `catalog:${object.cardUuid}:${index}`;
  }
  if (object.objectType === "deckCard") {
    return `deck:${object.entryId}:${object.cardUuid}:${index}`;
  }
  return `dreamsign:${object.dreamsignId}:${index}`;
}
