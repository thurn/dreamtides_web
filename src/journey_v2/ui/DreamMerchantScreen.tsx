import type {
  MerchantAcceptRequest,
  MerchantChoice,
  MerchantChoiceCandidate,
  MerchantCommitRequest,
  MerchantContext,
  MerchantDeclineRequest,
  MerchantEncounter,
  MerchantOffer,
  MerchantOfferActionResult,
} from "../types";
import type { QuestState, SiteState } from "../../types/quest";
import { useMemo, useState } from "react";
import { MerchantChooserPanel } from "./MerchantChooserPanel";
import { OfferCard } from "./OfferCard";

export interface DreamMerchantScreenProps {
  site: SiteState;
  encounter: MerchantEncounter;
  onAcceptOffer: (request: MerchantAcceptRequest) => MerchantOfferActionResult | void;
  onDecline: (request: MerchantDeclineRequest) => void;
  /**
   * Called when the player commits to a `hiddenUntilCommit` offer. Task 16
   * builds the UI that triggers this; the plumbing is wired here so the prop
   * is available on the component when Task 16 consumes it.
   */
  onCommit?: (request: MerchantCommitRequest) => MerchantOfferActionResult | void;
  context?: MerchantContext;
  questState?: QuestState;
}

export function DreamMerchantScreen({
  site,
  encounter,
  onAcceptOffer,
  onDecline,
  // onCommit is consumed by Task 16's commit-then-reveal UI; declared here
  // so callers can pass it through before the UI is built.
  onCommit: _onCommit,
  context,
  questState,
}: DreamMerchantScreenProps) {
  const [choosingOfferId, setChoosingOfferId] = useState<string | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, MerchantChoice>
  >(new Map());
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const choosingOffer = useMemo(
    () => encounter.offers.find((offer) => offer.offerId === choosingOfferId),
    [choosingOfferId, encounter.offers],
  );

  function selectedChoiceFor(offer: MerchantOffer): MerchantChoice | undefined {
    return selectedChoices.get(offer.offerId);
  }

  function acceptOffer(offer: MerchantOffer) {
    setValidationMessage(null);
    const choice = selectedChoiceFor(offer);
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: offer.offerId,
      archetypeId: offer.archetypeId,
      ...(choice === undefined ? {} : { choice }),
    };
    const result = onAcceptOffer(request);
    if (result?.ok === false) {
      setValidationMessage(validationMessageFor(result.reason));
      return;
    }
    setAccepted(true);
  }

  function declineEncounter() {
    const declineOffer = encounter.offers[0];
    const request: MerchantDeclineRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: declineOffer?.offerId ?? "A",
    };
    onDecline(request);
  }

  function openChooser(offer: MerchantOffer) {
    setValidationMessage(null);
    setChoosingOfferId(offer.offerId);
  }

  function selectCandidate(offer: MerchantOffer, candidate: MerchantChoiceCandidate) {
    setValidationMessage(null);
    setSelectedChoices((previous) => {
      const next = new Map(previous);
      next.set(offer.offerId, { choiceId: candidate.choiceId });
      return next;
    });
    setChoosingOfferId(null);
  }

  return (
    <div
      className="min-h-full overflow-y-auto bg-[#090b10] p-4 text-slate-100 sm:p-6"
      data-testid="dream-merchant-v2-screen"
      data-site-id={site.id}
      data-encounter-signature={encounter.encounterSignature}
      data-offer-count={encounter.offers.length}
      data-essence={context?.essence ?? questState?.essence}
    >
      <div className="mx-auto grid w-full max-w-[1500px] gap-4 lg:grid-cols-[minmax(280px,1fr)_minmax(360px,520px)_minmax(280px,1fr)] lg:items-start">
        <div className="order-3 lg:order-1">
          {encounter.offers[0] && (
            <OfferCard
              offer={encounter.offers[0]}
              label="A"
              isChooserOpen={choosingOfferId === encounter.offers[0].offerId}
              selectedChoice={selectedChoiceFor(encounter.offers[0])}
              onTake={acceptOffer}
              onChoose={openChooser}
            />
          )}
        </div>

        <main className="order-1 grid gap-4 lg:order-2">
          <section
            className="flex min-h-[300px] items-center justify-center rounded-md border border-dashed border-slate-500/70 bg-[radial-gradient(circle_at_center,rgba(245,158,11,0.10),rgba(15,23,42,0.54)_48%,rgba(2,6,23,0.90)_100%)] p-6 sm:min-h-[420px] lg:min-h-[560px]"
            data-testid="dream-merchant-image-slot"
            aria-label="Dream Merchant image slot"
          >
            <div className="h-24 w-24 rounded-md border border-slate-500/35 bg-slate-800/30" />
          </section>

          <section
            className="rounded-md border border-slate-600/70 bg-slate-950/75 p-4 text-left"
            data-testid="merchant-dialogue"
          >
            <h2 className="text-lg font-bold text-slate-50">Dream Merchant</h2>
            <p
              className="mt-3 text-sm leading-relaxed text-slate-200"
              data-dialogue-offer-id={encounter.dialogue.offerId}
              data-testid="merchant-dialogue-line"
            >
              {encounter.dialogue.line}
            </p>
            {accepted && (
              <p
                className="mt-3 text-sm leading-relaxed text-emerald-200"
                data-testid="merchant-accept-reaction"
              >
                {encounter.acceptReaction}
              </p>
            )}
          </section>

          {validationMessage !== null && (
            <p
              className="rounded-md border border-amber-300/45 bg-amber-950/35 px-4 py-3 text-sm font-semibold text-amber-100"
              data-testid="merchant-validation-message"
            >
              {validationMessage}
            </p>
          )}

          <button
            type="button"
            className="min-h-12 rounded-md border border-slate-600 bg-slate-900 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
            data-testid="merchant-walk-away"
            onClick={declineEncounter}
          >
            Walk away
          </button>
        </main>

        <div className="order-4 lg:order-3">
          {encounter.offers[1] && (
            <OfferCard
              offer={encounter.offers[1]}
              label="B"
              isChooserOpen={choosingOfferId === encounter.offers[1].offerId}
              selectedChoice={selectedChoiceFor(encounter.offers[1])}
              onTake={acceptOffer}
              onChoose={openChooser}
            />
          )}
        </div>
      </div>

      {choosingOffer?.choiceRequest !== undefined && (
        <div className="fixed inset-x-3 bottom-24 top-4 z-40 overflow-y-auto sm:left-1/2 sm:w-[min(760px,calc(100vw-2rem))] sm:-translate-x-1/2">
          <MerchantChooserPanel
            offer={choosingOffer}
            choiceRequest={choosingOffer.choiceRequest}
            selectedChoiceId={selectedChoiceFor(choosingOffer)?.choiceId}
            onSelect={(candidate) => selectCandidate(choosingOffer, candidate)}
            onClose={() => setChoosingOfferId(null)}
          />
        </div>
      )}
    </div>
  );
}

function validationMessageFor(reason: string): string {
  if (
    reason === "stale_encounter" ||
    reason === "archetype_mismatch" ||
    reason === "offer_not_found"
  ) {
    return "The offer changed while you were deciding. Review the new deal and try again.";
  }
  return "The merchant cannot complete that trade. Review the offer and try again.";
}
