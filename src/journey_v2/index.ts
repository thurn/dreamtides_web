export { buildMerchantContext } from "./context/buildMerchantContext";
export {
  generateMerchantEncounter,
  generateMerchantEncounterWithDebug,
} from "./encounter/generateMerchantEncounter";
export { DreamMerchantScreen } from "./ui/DreamMerchantScreen";
export { MerchantChooserPanel } from "./ui/MerchantChooserPanel";
export {
  MerchantGameObjectList,
  MerchantGameObjectView,
} from "./ui/MerchantGameObjectView";
export { OfferCard } from "./ui/OfferCard";
export {
  applyMerchantPayloadToState,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./encounter/resolveMerchantOffer";
export { renderMerchantDialogue } from "./dialogue/dialogue";
export {
  MERCHANT_ARCHETYPE_BUILDERS,
} from "./archetypes/registry";
export {
  MERCHANT_ARCHETYPE_FAMILIES,
} from "./archetypes/types";
export { MERCHANT_TUNING } from "./tuning";
export type {
  MerchantEncounterGenerationDebug,
} from "./encounter/generateMerchantEncounter";
export type {
  MerchantResolveFailureReason,
  ResolveMerchantDeclineResult,
  ResolveMerchantOfferResult,
} from "./encounter/resolveMerchantOffer";
export type {
  DreamMerchantScreenProps,
} from "./ui/DreamMerchantScreen";
export type {
  MerchantArchetypeBuilder,
  MerchantArchetypeId,
  MerchantOfferDraft,
  MerchantOfferFamily,
} from "./archetypes/types";
export type {
  MerchantApplyPayload,
  MerchantAcceptRequest,
  MerchantCatalogCard,
  MerchantChoice,
  MerchantChoiceCandidate,
  MerchantChoiceRequest,
  MerchantContext,
  MerchantDeckCard,
  MerchantDeclineRequest,
  MerchantDialogueLine,
  MerchantEncounter,
  MerchantGameObject,
  MerchantOffer,
  MerchantOfferActionResult,
} from "./types";
