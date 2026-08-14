import { useCallback, useEffect, useMemo, useRef } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { selectCurrentSite } from "../../state/journey-selectors";
import { AugurySiteScreen } from "../../cumulus/screens/AugurySiteScreen";
import {
  buildAuguryDeclineRequest,
  buildAuguryLogEntries,
  buildAugurySiteModel,
  chooseAuguryOffer,
  resolveAuguryGuide,
} from "./augury-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import type { ChoiceId, OfferId, SiteId } from "../../types/identifiers";

export function AugurySiteScreenAdapter({ siteId }: { siteId: SiteId }) {
  const { state, mutations, journeyContent } = useJourney();
  const current = selectCurrentSite(state, siteId, "Augury");
  const { node = null, site = null } = current ?? {};
  const guide = resolveAuguryGuide(journeyContent.guides, site?.randomSite?.presentingGuideId);
  const guideLine = useGuideDialogue(guide, "site");
  const result = useMemo(
    () =>
      site === null
        ? null
        : buildAugurySiteModel({
            state,
            sceneNode: node,
            site,
            journeyContent,
            guide,
            guideLine,
          }),
    [state, node, site, journeyContent, guide, guideLine],
  );

  const logEntries = useMemo(
    () =>
      site === null || result === null
        ? []
        : buildAuguryLogEntries(result, site, guide.id),
    [guide.id, result, site],
  );
  useEffect(() => {
    for (const entry of logEntries)
      logEventOnce(entry.key, entry.event, entry.payload);
  }, [logEntries]);

  const publishedSignatureRef = useRef<string | null>(null);
  const lifetimeGenerationRef = useRef(0);
  const setCardSourceDebugRef = useRef(mutations.setCardSourceDebug);
  useEffect(() => {
    setCardSourceDebugRef.current = mutations.setCardSourceDebug;
  }, [mutations.setCardSourceDebug]);
  useEffect(() => {
    if (result === null) return;
    const signature = result.encounter?.encounterSignature;
    if (signature === undefined || publishedSignatureRef.current === signature)
      return;
    publishedSignatureRef.current = signature;
    setCardSourceDebugRef.current(
      result.cardSourceDebug,
      "merchant_grant_cards_shown",
    );
  }, [result]);
  useEffect(() => {
    const generation = lifetimeGenerationRef.current + 1;
    lifetimeGenerationRef.current = generation;
    return () =>
      queueMicrotask(() => {
        if (lifetimeGenerationRef.current !== generation) return;
        publishedSignatureRef.current = null;
        setCardSourceDebugRef.current(null, "merchant_grant_cards_hidden");
      });
  }, [siteId]);

  const handleChoose = (offerId: OfferId, choiceId: ChoiceId | null) =>
    chooseAuguryOffer(
      site,
      result,
      mutations.acceptDreamMerchantOffer,
      offerId,
      choiceId,
    );

  const handleClose = useCallback(() => {
    if (site === null) return;
    const request =
      result?.encounter === null || result?.encounter === undefined
        ? null
        : buildAuguryDeclineRequest(result.encounter);
    if (request === null) mutations.completeAugurySite(site.id);
    else mutations.declineDreamMerchant(site.id, request);
  }, [mutations, result, site]);

  const handleReroll = useCallback(() => {
    if (site === null) return;
    mutations.rerollAugury?.(site.id);
  }, [mutations, site]);

  const handleInspect = (offerId: OfferId) => {
    const offer = result?.encounter?.offers.find(
      (candidate) => candidate.offerId === offerId,
    );
    if (site === null || offer === undefined) return;
    logEvent("merchant_offer_preview_selected", {
      siteId: site.id,
      encounterSignature: offer.encounterSignature,
      offerId,
      archetypeId: offer.archetypeId,
      surface: "offer_tile",
    });
  };

  if (site === null || result === null) return null;
  return (
    <AugurySiteScreen
      key={result.view.encounterSignature ?? result.view.siteId}
      view={result.view}
      onReroll={handleReroll}
      onInspectOffer={handleInspect}
      onChoose={handleChoose}
      onClose={handleClose}
    />
  );
}
