import type {
  MerchantAcceptRequest,
  MerchantChoice,
  MerchantChoiceCandidate,
  MerchantContext,
  MerchantDeclineRequest,
  MerchantEncounter,
  MerchantOffer,
} from "../types";
import type { QuestState, SiteState } from "../../types/quest";
import { useMemo, useState } from "react";
import { MerchantChooserPanel } from "./MerchantChooserPanel";
import { OfferCard } from "./OfferCard";

export interface DreamMerchantScreenProps {
  site: SiteState;
  encounter: MerchantEncounter;
  onAcceptOffer: (request: MerchantAcceptRequest) => void;
  onDecline: (request: MerchantDeclineRequest) => void;
  context?: MerchantContext;
  questState?: QuestState;
}

export function DreamMerchantScreen({
  site,
  encounter,
  onAcceptOffer,
  onDecline,
  context,
  questState,
}: DreamMerchantScreenProps) {
  const [choosingOfferId, setChoosingOfferId] = useState<string | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<
    ReadonlyMap<string, MerchantChoice>
  >(new Map());

  const choosingOffer = useMemo(
    () => encounter.offers.find((offer) => offer.offerId === choosingOfferId),
    [choosingOfferId, encounter.offers],
  );
  const preActionDialogue = encounter.dialogue.filter(
    (beat) => beat.phase === "pre_offer",
  );

  function selectedChoiceFor(offer: MerchantOffer): MerchantChoice | undefined {
    return selectedChoices.get(offer.offerId);
  }

  function acceptOffer(offer: MerchantOffer) {
    const choice = selectedChoiceFor(offer);
    const request: MerchantAcceptRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: offer.offerId,
      expectedPrice: offer.price,
      rewardBuilderId: offer.rewardBuilderId,
      needId: offer.needId,
      ...(choice === undefined ? {} : { choice }),
    };
    onAcceptOffer(request);
  }

  function declineEncounter() {
    const declineOffer = encounter.offers[0];
    const request: MerchantDeclineRequest = {
      encounterSignature: encounter.encounterSignature,
      offerId: declineOffer?.offerId ?? "A",
      ...(declineOffer?.needId === undefined
        ? {}
        : { needId: declineOffer.needId }),
      ...(declineOffer?.rewardBuilderId === undefined
        ? {}
        : { rewardBuilderId: declineOffer.rewardBuilderId }),
    };
    onDecline(request);
  }

  function openChooser(offer: MerchantOffer) {
    if (offer.locked) return;
    setChoosingOfferId(offer.offerId);
  }

  function selectCandidate(offer: MerchantOffer, candidate: MerchantChoiceCandidate) {
    setSelectedChoices((previous) => {
      const next = new Map(previous);
      next.set(offer.offerId, { choiceId: candidate.choiceId });
      return next;
    });
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
            <div className="max-w-[260px] text-center">
              <div className="mx-auto h-20 w-20 rounded-md border border-slate-500/40 bg-slate-800/40" />
              <p className="mt-4 text-sm leading-snug text-slate-400">
                Merchant image slot
              </p>
            </div>
          </section>

          <section
            className="rounded-md border border-slate-600/70 bg-slate-950/75 p-4 text-left"
            data-testid="merchant-dialogue"
          >
            <h2 className="text-lg font-bold text-slate-50">Dream Merchant</h2>
            <div className="mt-3 grid gap-2">
              {preActionDialogue.map((beat) => (
                <p
                  key={beat.id}
                  className="text-sm leading-relaxed text-slate-200"
                  data-dialogue-kind={beat.kind}
                  data-testid={`merchant-dialogue-beat-${beat.kind}`}
                >
                  {beat.text}
                </p>
              ))}
            </div>
          </section>

          {choosingOffer?.reward.choiceRequest !== undefined && (
            <MerchantChooserPanel
              offer={choosingOffer}
              choiceRequest={choosingOffer.reward.choiceRequest}
              selectedChoiceId={selectedChoiceFor(choosingOffer)?.choiceId}
              onSelect={(candidate) => selectCandidate(choosingOffer, candidate)}
              onClose={() => setChoosingOfferId(null)}
            />
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
    </div>
  );
}
