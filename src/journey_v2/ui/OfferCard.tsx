import type { MerchantChoice, MerchantOffer } from "../types";
import { MerchantGameObjectList } from "./MerchantGameObjectView";

interface OfferCardProps {
  offer: MerchantOffer;
  label: string;
  isChooserOpen: boolean;
  selectedChoice?: MerchantChoice;
  onTake: (offer: MerchantOffer) => void;
  onChoose: (offer: MerchantOffer) => void;
}

export function OfferCard({
  offer,
  label,
  isChooserOpen,
  selectedChoice,
  onTake,
  onChoose,
}: OfferCardProps) {
  const hasChoices = offer.choiceRequest !== undefined;
  const actionLabel = hasChoices
    ? selectedChoice === undefined
      ? "Choose"
      : "Confirm"
    : "Take";

  return (
    <article
      className="grid min-h-[520px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-md border border-slate-600/70 bg-slate-950/70 p-4 text-left shadow-xl shadow-black/25 lg:h-[calc(100vh-9rem)] lg:max-h-[720px]"
      data-offer-id={offer.offerId}
      data-archetype-id={offer.archetypeId}
      data-testid={`merchant-offer-card-${offer.offerId}`}
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase text-amber-200">
          Offer {label}
        </p>
        <h3 className="mt-1 break-words text-xl font-bold leading-tight text-slate-50">
          {offer.title}
        </h3>
        <p className="min-h-[44px] text-sm leading-snug text-slate-300">
          {offer.summary}
        </p>
      </header>

      <section className="min-w-0 overflow-y-auto pr-1">
        <MerchantGameObjectList objects={offer.gameObjects} compact />
      </section>

      <footer className="space-y-3">
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
          className="min-h-11 w-full rounded-md border border-emerald-300/45 bg-emerald-500/20 px-4 py-2 text-sm font-bold text-emerald-50 transition hover:bg-emerald-500/30"
          data-testid={`merchant-offer-action-${offer.offerId}`}
          onClick={() => {
            if (hasChoices && selectedChoice === undefined) {
              onChoose(offer);
              return;
            }
            onTake(offer);
          }}
        >
          {actionLabel}
        </button>
      </footer>
    </article>
  );
}
