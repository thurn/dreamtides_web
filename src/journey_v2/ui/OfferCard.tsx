import type { MerchantChoice, MerchantOffer } from "../types";
import { MerchantGameObjectList } from "./MerchantGameObjectView";

interface OfferCardProps {
  offer: MerchantOffer;
  label: string;
  isChooserOpen: boolean;
  selectedChoice?: MerchantChoice;
  /**
   * The offer id committed to via resolveMerchantCommit, or null when no
   * commit has been made yet. Used to determine post-commit rendering state:
   * - The committed offer reveals its chooser.
   * - The forfeited offer shows no accept control.
   */
  committedOfferId: string | null;
  onTake: (offer: MerchantOffer) => void;
  onChoose: (offer: MerchantOffer) => void;
  onCommit: (offer: MerchantOffer) => void;
}

/**
 * Renders the concealed treatment for a hiddenUntilCommit offer that has not
 * yet been committed. Shows card backs plus the offer title to signal what
 * kind of draft awaits — but deliberately exposes NO card names or identities.
 */
function HiddenOfferBody({ offer }: { offer: MerchantOffer }) {
  // The candidate count comes from choiceRequest (post-commit chooser), but
  // we must not render any candidate details here. Show card-back placeholders
  // to visually communicate "there are cards here".
  const cardBackCount = offer.choiceRequest?.candidates.length ?? 4;

  return (
    <div
      className="flex flex-col gap-3"
      data-testid={`merchant-offer-hidden-body-${offer.offerId}`}
      aria-label={`Hidden offer: ${offer.title}`}
    >
      <p className="text-sm font-semibold leading-snug text-slate-100">
        {offer.title}
      </p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: cardBackCount }, (_, i) => (
          <div
            key={i}
            className="h-[72px] w-[52px] rounded-md border border-slate-600/60 bg-slate-800/60 bg-[repeating-linear-gradient(135deg,rgba(100,116,139,0.08),rgba(100,116,139,0.08)_2px,transparent_2px,transparent_12px)]"
            aria-hidden="true"
          />
        ))}
      </div>
      <p className="text-xs leading-snug text-slate-400">
        Commit to reveal the cards — forfeits the other offer.
      </p>
    </div>
  );
}

export function OfferCard({
  offer,
  label,
  isChooserOpen,
  selectedChoice,
  committedOfferId,
  onTake,
  onChoose,
  onCommit,
}: OfferCardProps) {
  const isCommitted = committedOfferId === offer.offerId;
  const isForfeited = committedOfferId !== null && committedOfferId !== offer.offerId;

  // A hidden offer is concealed until committed. After commit only the
  // committed offer's chooser is revealed; the other is forfeited.
  const isHiddenPreCommit = offer.hiddenUntilCommit && committedOfferId === null;

  // For face-up offers or the committed offer after reveal: determine action.
  const hasChoices = offer.choiceRequest !== undefined;
  const actionLabel = hasChoices
    ? selectedChoice === undefined
      ? "Choose"
      : "Confirm"
    : "Take";

  return (
    <article
      className={`grid min-h-[520px] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 rounded-md border p-4 text-left shadow-xl shadow-black/25 lg:h-[calc(100vh-9rem)] lg:max-h-[720px] ${
        isForfeited
          ? "border-slate-700/50 bg-slate-950/40 opacity-50"
          : "border-slate-600/70 bg-slate-950/70"
      }`}
      data-offer-id={offer.offerId}
      data-archetype-id={offer.archetypeId}
      data-testid={`merchant-offer-card-${offer.offerId}`}
    >
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase text-amber-200">
          {isForfeited ? "Forfeited" : `Offer ${label}`}
        </p>
        <h3 className="mt-1 break-words text-xl font-bold leading-tight text-slate-50">
          {offer.title}
        </h3>
        {!isHiddenPreCommit && (
          <p className="min-h-[44px] text-sm leading-snug text-slate-300">
            {offer.summary}
          </p>
        )}
      </header>

      <section className="min-w-0 overflow-y-auto pr-1">
        {isHiddenPreCommit ? (
          <HiddenOfferBody offer={offer} />
        ) : (
          <MerchantGameObjectList objects={offer.gameObjects} compact />
        )}
      </section>

      <footer className="space-y-3">
        {/* Forfeited offer: no controls */}
        {isForfeited ? null : isHiddenPreCommit ? (
          /* Hidden pre-commit: show commit button */
          <button
            type="button"
            className="min-h-11 w-full rounded-md border border-amber-300/45 bg-amber-500/15 px-4 py-2 text-sm font-bold text-amber-50 transition hover:bg-amber-500/25"
            data-testid={`merchant-offer-commit-${offer.offerId}`}
            onClick={() => onCommit(offer)}
          >
            Commit and reveal
          </button>
        ) : (
          /* Face-up or committed-and-revealed: show accept/chooser controls */
          <>
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
            {isCommitted && hasChoices && selectedChoice === undefined && !isChooserOpen && (
              <p className="text-xs text-amber-200">
                Choose a card from the revealed options below.
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
          </>
        )}
      </footer>
    </article>
  );
}
