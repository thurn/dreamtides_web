export { buildMerchantContext } from "./context/buildMerchantContext";
export {
  generateMerchantEncounter,
  generateMerchantEncounterWithDebug,
} from "./encounter/generateMerchantEncounter";
export { resolveOfferPresentation } from "./ui/offerPresentation";
export {
  applyMerchantPayloadToState,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./encounter/resolveMerchantOffer";
export { MERCHANT_ARCHETYPE_BUILDERS } from "./archetypes/registry";
export {
  isTransfigurationMerchantArchetype,
  MERCHANT_ARCHETYPE_FAMILIES,
} from "./archetypes/types";
export { MERCHANT_TUNING } from "./tuning";
export { buildMerchantDeckSnapshot } from "./trace/deckSnapshot";
export type { MerchantDeckSnapshot } from "./trace/deckSnapshot";
export type { MerchantOfferTrace } from "./trace/types";
export type { MerchantEncounterGenerationDebug } from "./encounter/generateMerchantEncounter";
export type {
  MerchantResolveFailureReason,
  ResolveMerchantDeclineResult,
  ResolveMerchantOfferResult,
} from "./encounter/resolveMerchantOffer";
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
  MerchantEncounter,
  MerchantGameObject,
  MerchantOffer,
  MerchantOfferActionResult,
} from "./types";
