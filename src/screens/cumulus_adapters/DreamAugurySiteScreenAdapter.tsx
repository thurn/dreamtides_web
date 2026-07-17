import { useCallback, useEffect, useMemo, useRef } from "react";
import { logEvent, logEventOnce } from "../../logging";
import { useQuest } from "../../state/quest-context";
import { DreamAugurySiteScreen } from "../../cumulus/screens/DreamAugurySiteScreen";
import {
  buildDreamAuguryAcceptRequest,
  buildDreamAuguryDeclineRequest,
  buildDreamAuguryLogEntries,
  buildDreamAugurySiteModel,
  dreamAuguryChoiceResult,
  resolveDreamAuguryGuide,
} from "./dream-augury-view-model";

export function DreamAugurySiteScreenAdapter({ siteId }: { siteId: string }) {
  const { state, mutations, questContent } = useQuest();
  const node = state.currentDreamscape === null
    ? null
    : (state.atlas.nodes[state.currentDreamscape] ?? null);
  const site = node?.sites.find((candidate) => candidate.id === siteId) ?? null;
  const guide = resolveDreamAuguryGuide(questContent.guides);
  const guideLineRef = useRef<string | null | undefined>(undefined);
  if (guideLineRef.current === undefined) {
    const lines = guide?.dialog ?? [];
    guideLineRef.current = lines.length === 0
      ? null
      : lines[Math.floor(Math.random() * lines.length)] ?? null;
  }
  const guideLine = guideLineRef.current;
  const result = useMemo(
    () => site === null ? null : buildDreamAugurySiteModel({
      state, sceneNode: node, site, questContent, guide, guideLine,
    }),
    [state, node, site, questContent, guide, guideLine],
  );

  const logEntries = useMemo(
    () =>
      site === null || result === null
        ? []
        : buildDreamAuguryLogEntries(result, site, guide?.id ?? null),
    [guide?.id, result, site],
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
    if (signature === undefined || publishedSignatureRef.current === signature) return;
    publishedSignatureRef.current = signature;
    setCardSourceDebugRef.current(result.cardSourceDebug, "merchant_grant_cards_shown");
  }, [result]);
  useEffect(() => {
    const generation = lifetimeGenerationRef.current + 1;
    lifetimeGenerationRef.current = generation;
    return () => queueMicrotask(() => {
      if (lifetimeGenerationRef.current !== generation) return;
      publishedSignatureRef.current = null;
      setCardSourceDebugRef.current(null, "merchant_grant_cards_hidden");
    });
  }, [siteId]);

  const handleChoose = useCallback(
    (offerId: string, choiceId: string | null) => {
      if (site === null || result?.encounter === null || result?.encounter === undefined) {
        return { ok: false as const, message: "The augury is clouded." };
      }
      const request = buildDreamAuguryAcceptRequest(result.encounter, offerId, choiceId);
      if (request === null) {
        return { ok: false as const, message: "Choose a vision first." };
      }
      return dreamAuguryChoiceResult(
        mutations.acceptDreamMerchantOffer(site.id, request),
      );
    },
    [mutations, result, site],
  );

  const handleClose = useCallback(() => {
    if (site === null) return;
    const request =
      result?.encounter === null || result?.encounter === undefined
        ? null
        : buildDreamAuguryDeclineRequest(result.encounter);
    if (request === null) mutations.completeDreamAugurySite(site.id);
    else mutations.declineDreamMerchant(site.id, request);
  }, [mutations, result, site]);

  const handleInspect = useCallback((offerId: string) => {
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
  }, [result, site]);

  if (site === null || result === null) return null;
  return (
    <DreamAugurySiteScreen
      key={result.view.encounterSignature ?? result.view.siteId}
      view={result.view}
      onInspectOffer={handleInspect}
      onChoose={handleChoose}
      onClose={handleClose}
    />
  );
}
