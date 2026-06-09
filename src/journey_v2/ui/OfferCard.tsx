import type { MerchantChoice, MerchantOffer } from "../types";
import { MerchantGameObjectList } from "./MerchantGameObjectView";

interface OfferCardProps {
  offer: MerchantOffer;
  label: string;
  needRead: string;
  isChooserOpen: boolean;
  selectedChoice?: MerchantChoice;
  onTake: (offer: MerchantOffer) => void;
  onChoose: (offer: MerchantOffer) => void;
}

function lockCopy(offer: MerchantOffer): string {
  if (offer.lockedReason === "insufficient_essence") {
    return `Locked: costs ${offer.price} essence.`;
  }
  return offer.lockedReason ?? "Locked";
}

export function OfferCard({
  offer,
  label,
  needRead,
  isChooserOpen,
  selectedChoice,
  onTake,
  onChoose,
}: OfferCardProps) {
  const hasChoices = offer.reward.choiceRequest !== undefined;
  const actionLabel = hasChoices
    ? selectedChoice === undefined
      ? "Choose"
      : "Confirm"
    : "Take";
  const disabled = offer.locked;

  return (
    <article
      className="grid min-h-[520px] grid-rows-[auto_auto_1fr_auto] gap-4 rounded-md border border-slate-600/70 bg-slate-950/70 p-4 text-left shadow-xl shadow-black/25"
      data-offer-id={offer.offerId}
      data-testid={`merchant-offer-card-${offer.offerId}`}
    >
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase text-amber-200">
              Offer {label}
            </p>
            <h3 className="mt-1 break-words text-xl font-bold leading-tight text-slate-50">
              {offer.reward.title}
            </h3>
          </div>
          <div
            className="rounded-md border border-amber-300/45 bg-amber-300/12 px-3 py-2 text-right"
            data-testid={`merchant-offer-price-${offer.offerId}`}
          >
            <div className="text-[11px] uppercase text-amber-100/80">Price</div>
            <div className="text-lg font-bold tabular-nums text-amber-100">
              {offer.price}
            </div>
          </div>
        </div>
        <p className="min-h-[44px] text-sm leading-snug text-slate-300">
          {offer.reward.summary}
        </p>
      </header>

      <section
        className="rounded-md border border-slate-700/70 bg-slate-900/55 p-3"
        data-testid={`merchant-offer-need-${offer.offerId}`}
      >
        <p className="text-xs font-semibold uppercase text-slate-400">
          Merchant read
        </p>
        <p className="mt-1 text-sm leading-snug text-slate-100">
          {needRead}
        </p>
      </section>

      <section className="min-w-0 overflow-hidden">
        <MerchantGameObjectList objects={offer.reward.gameObjects} compact />
      </section>

      <footer className="space-y-3">
        {offer.locked && (
          <p
            className="rounded-md border border-red-300/40 bg-red-950/30 px-3 py-2 text-sm leading-snug text-red-100"
            data-testid={`merchant-offer-locked-${offer.offerId}`}
          >
            {lockCopy(offer)}
          </p>
        )}
        {isChooserOpen && hasChoices && (
          <p className="text-xs text-emerald-200">Choosing from this offer.</p>
        )}
        {selectedChoice !== undefined && hasChoices && (
          <p
            className="rounded-md border border-emerald-300/35 bg-emerald-950/25 px-3 py-2 text-sm text-emerald-100"
            data-testid={`merchant-offer-selection-${offer.offerId}`}
          >
            Selection ready. Confirm to take this offer.
          </p>
        )}
        <button
          type="button"
          className="min-h-11 w-full rounded-md border border-emerald-300/45 bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/30 disabled:border-slate-600 disabled:bg-slate-800 disabled:text-slate-500"
          disabled={disabled}
          data-testid={`merchant-offer-action-${offer.offerId}`}
          onClick={() => {
            if (hasChoices && selectedChoice === undefined) {
              onChoose(offer);
              return;
            }
            onTake(offer);
          }}
        >
          {offer.locked ? "Locked" : actionLabel}
        </button>
      </footer>
    </article>
  );
}
