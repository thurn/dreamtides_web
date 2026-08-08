import { useCallback, useEffect, useMemo, useRef } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useJourney } from "../../state/journey-context";
import { selectCurrentSite } from "../../state/journey-selectors";
import { AugurySiteScreen } from "../../cumulus/screens/AugurySiteScreen";
import { buildAuguryAcceptRequest, buildAuguryDeclineRequest, buildAuguryLogEntries, buildAugurySiteModel, auguryChoiceResult, resolveAuguryGuide } from "./augury-view-model";
import { useGuideDialogue } from "./guide-dialogue-view-model";
import { createMessageDescriptor } from "../../data/localization-descriptors";

export function AugurySiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, journeyContent } = useJourney();
  const current = selectCurrentSite(state, siteId, "Augury");
  const node = current?.node ?? null;
  const site = current?.site ?? null;
  const guide = resolveAuguryGuide(journeyContent.guides, site?.guideIdOverride);
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

  const logEntries = useMemo(() => (site === null || result === null ? [] : buildAuguryLogEntries(result, site, guide.id)), [guide.id, result, site]);
  useEffect(() => {
    for (const entry of logEntries) logEventOnce(entry.key, entry.event, entry.payload);
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
    if (signature === undefined || publishedSignatureRef.current === signature) return;
    publishedSignatureRef.current = signature;
    setCardSourceDebugRef.current(result.cardSourceDebug, "merchant_grant_cards_shown");
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

  const handleChoose = useCallback(
    (offerId: string, choiceId: string | null) => {
      if (site === null || result?.encounter === null || result?.encounter === undefined) {
        return { ok: false as const, message: createMessageDescriptor("augury-error-clouded") };
      }
      const request = buildAuguryAcceptRequest(result.encounter, offerId, choiceId);
      if (request === null) {
        return { ok: false as const, message: createMessageDescriptor("augury-error-choose-vision") };
      }
      return auguryChoiceResult(mutations.acceptDreamMerchantOffer(site.id, request));
    },
    [mutations, result, site],
  );

  const handleClose = useCallback(() => {
    if (site === null) return;
    const request = result?.encounter === null || result?.encounter === undefined ? null : buildAuguryDeclineRequest(result.encounter);
    if (request === null) mutations.completeAugurySite(site.id);
    else mutations.declineDreamMerchant(site.id, request);
  }, [mutations, result, site]);

  const handleReroll = useCallback(() => {
    if (site === null) return;
    mutations.rerollAugury?.(site.id);
  }, [mutations, site]);

  const handleInspect = useCallback(
    (offerId: string) => {
      const offer = result?.encounter?.offers.find((candidate) => candidate.offerId === offerId);
      if (site === null || offer === undefined) return;
      logEvent("merchant_offer_preview_selected", {
        siteId: site.id,
        encounterSignature: offer.encounterSignature,
        offerId,
        archetypeId: offer.archetypeId,
        surface: "offer_tile",
      });
    },
    [result, site],
  );

  if (site === null || result === null) return null;
  return <AugurySiteScreen key={result.view.encounterSignature ?? result.view.siteId} view={result.view} onReroll={handleReroll} onInspectOffer={handleInspect} onChoose={handleChoose} onClose={handleClose} />;
}
