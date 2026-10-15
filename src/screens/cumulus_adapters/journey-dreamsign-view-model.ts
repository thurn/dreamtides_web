import { journeyTypeRemapTypes } from "../../rules/journey/journey-type-remap";
import { JOURNEY_SITE_MESSAGES } from "../../runtime/journey-site-messages";
import type { JourneyContent } from "../../data/journey-content";
import { dreamscapeSceneRef } from "./dreamscape-view-model";
import type { JourneyState } from "../../types/journey";
import type { JourneyDreamsignScreenView } from "../../cumulus/screens/JourneyDreamsignScreen";
import { toDreamsignView } from "../../cumulus/components/hud/dreamsign-view";
/** Concrete folded permission projection, independent of catalog selection policy. */
export function buildJourneyDreamsignView(journey: JourneyState, content: JourneyContent): JourneyDreamsignScreenView | null {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind === "openingHand") return null;
  const choice = journey.screen.choice;
  let continuation = choice.kind === "copy" || choice.kind === "typeRemap" || choice.kind === "subtype" ? choice.continuation : journey.screen;
  if (continuation.type === "journeyStarterPurge") continuation = continuation.choice.continuation;
  if (continuation.type === "journeyDreamsign" && (continuation.choice.kind === "copy" || continuation.choice.kind === "openingHand")) continuation = continuation.choice.continuation;
  const siteId = continuation.type === "site" ? continuation.siteId : choice.kind === "afterBattle" ? choice.siteId : continuation.type === "journeyPurge" || continuation.type === "journeyTransfiguration" || continuation.type === "journeyDuplication" ? continuation.choice.siteId : continuation.type === "journeyDreamsign" && continuation.choice.kind === "afterBattle" ? continuation.choice.siteId : null;
  const node = siteId === null ? journey.currentDreamscape === null ? null : journey.atlas.nodes[journey.currentDreamscape] ?? null : Object.values(journey.atlas.nodes).find((candidate) => candidate.sites.some((site) => site.id === siteId)) ?? null;
  // Standalone tutorial/genesis choices use existing catalog atmosphere, never a fabricated gameplay site.
  const scene = dreamscapeSceneRef(node ?? { dreamscapeId: content.dreamscapes[0]?.id ?? null }, content);
  const held = journey.dreamsigns.map((sign, heldIndex) => ({ heldIndex, dreamsign: toDreamsignView(sign) }));
  if (choice.kind === "subtype") {
    const source = choice.resume.sources[choice.resume.sourceIndex];
    return { mode: "subtype", purpose: choice.current.kind, scene, sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.resume.sourceIndex, permissionSeq: choice.permissionSeq, siteId,
      title: JOURNEY_SITE_MESSAGES.typeRemapTitle, instruction: choice.current.kind === "deckSubtype" ? JOURNEY_SITE_MESSAGES.subtypeInstruction : JOURNEY_SITE_MESSAGES.typeRemapInstruction, typeOptions: journeyTypeRemapTypes(), options: [], held, atCap: false, canContinue: false };
  }
  if (choice.kind === "typeRemap") {
    const source = choice.sources[choice.index];
    return { mode: "typeRemap", scene, sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, siteId,
      title: JOURNEY_SITE_MESSAGES.typeRemapTitle, instruction: JOURNEY_SITE_MESSAGES.typeRemapInstruction, typeOptions: journeyTypeRemapTypes(), options: [], held, atCap: false, canContinue: false };
  }
  if (choice.kind === "copy") {
    const source = choice.sources[choice.index];
    return { mode: "copy", scene, sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, siteId: choice.continuation.type === "site" ? choice.continuation.siteId : null,
      title: JOURNEY_SITE_MESSAGES.dreamsignCopyTitle, instruction: JOURNEY_SITE_MESSAGES.dreamsignCopyInstruction, options: held.filter((sign) => sign.heldIndex !== source.heldIndex), held, atCap: false, canContinue: false };
  }
  const source = choice.sources[choice.index];
  if (source.kind !== "dreamsign") return null;
  return { mode: "offer", scene, sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: source.earnedSeq, siteId: choice.siteId,
    title: JOURNEY_SITE_MESSAGES.dreamsignOfferTitle, instruction: JOURNEY_SITE_MESSAGES.dreamsignOfferInstruction, options: source.offeredDreamsigns.map((sign, heldIndex) => ({ heldIndex, dreamsign: toDreamsignView(sign) })), held,
    atCap: held.length >= journey.maxDreamsigns, canContinue: source.offeredDreamsigns.length === 0 || held.length >= journey.maxDreamsigns };
}
