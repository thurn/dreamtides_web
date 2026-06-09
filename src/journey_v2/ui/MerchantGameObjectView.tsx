import { CardDisplay } from "../../components/CardDisplay";
import { DreamsignArtTile } from "../../components/DreamsignArtTile";
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
    <article
      className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)] items-center gap-3 rounded-md border border-slate-600/60 bg-slate-950/55 p-2 text-left"
      data-card-uuid={object.cardUuid}
      data-card-number={object.cardNumber}
      data-entry-id={object.entryId}
      data-testid={`merchant-game-object-${object.objectType}`}
    >
      <div className="w-[54px] shrink-0 overflow-hidden rounded-md">
        <CardDisplay
          card={card}
          hideRulesText={compact}
          suppressHoverHelp
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
  return (
    <article
      className="grid min-w-0 grid-cols-[52px_minmax(0,1fr)] items-center gap-3 rounded-md border border-emerald-400/35 bg-emerald-950/20 p-2 text-left"
      data-dreamsign-id={object.dreamsignId}
      data-testid="merchant-game-object-dreamsign"
    >
      <DreamsignArtTile dreamsign={dreamsignFromObject(object)} sizePx={52} />
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
  );
}

function EssenceObjectView({
  object,
}: {
  object: Extract<MerchantGameObject, { objectType: "essence" }>;
}) {
  const sign = object.amount >= 0 ? "+" : "";
  return (
    <article
      className="flex min-h-[58px] items-center justify-between gap-3 rounded-md border border-amber-300/35 bg-amber-950/20 p-3 text-left"
      data-testid="merchant-game-object-essence"
    >
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-amber-100">Essence</h4>
        <p className="text-xs text-slate-300">Immediate resource change</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-lg font-bold tabular-nums text-amber-100">
          {sign}
          {object.amount}
        </span>
        <ObjectBadge badge={object.badge} />
      </div>
    </article>
  );
}

export function MerchantGameObjectView({
  object,
  compact = false,
}: MerchantGameObjectViewProps) {
  if (object.objectType === "catalogCard" || object.objectType === "deckCard") {
    return <CardObjectView object={object} compact={compact} />;
  }
  if (object.objectType === "dreamsign") {
    return <DreamsignObjectView object={object} />;
  }
  return <EssenceObjectView object={object} />;
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
  if (object.objectType === "dreamsign") {
    return `dreamsign:${object.dreamsignId}:${index}`;
  }
  return `essence:${object.amount}:${index}`;
}
