export { buildMerchantContext } from "./context/buildMerchantContext";
export {
  MERCHANT_REWARD_BUILDERS,
  buildMerchantRewardCatalog,
  buildMerchantRewardWithBuilder,
  buildMerchantRewardsForNeed,
  makeMerchantTypeChangePayload,
  resolveMerchantChoice,
} from "./catalog/rewardCatalog";
export { generateMerchantEncounter } from "./encounter/generateMerchantEncounter";
export { DreamMerchantScreen } from "./ui/DreamMerchantScreen";
export {
  applyMerchantPayloadToState,
  resolveMerchantDecline,
  resolveMerchantOffer,
} from "./encounter/resolveMerchantOffer";
export {
  merchantRewardFamilyFor,
  renderMerchantDialogue,
} from "./dialogue/dialogue";
export {
  MERCHANT_MARKET_JITTER_MAX,
  MERCHANT_MARKET_JITTER_MIN,
  MERCHANT_NEED_SEVERITY_MULTIPLIER_MAX,
  MERCHANT_NEED_SEVERITY_MULTIPLIER_MIN,
  MERCHANT_PRICE_MINIMUM,
  marketJitterFor,
  needSeverityMultiplierFor,
  priceMerchantReward,
  scarcityMultiplierFor,
  valueEssenceForCardGrant,
} from "./catalog/pricing";
export { readMerchantDeck } from "./read/deckRead";
export type {
  MerchantRewardFamily,
  MerchantRewardPrice,
  MerchantRewardScarcityInput,
  PriceMerchantRewardInput,
} from "./catalog/pricing";
export type {
  MerchantResolveFailureReason,
  ResolveMerchantDeclineResult,
  ResolveMerchantOfferResult,
} from "./encounter/resolveMerchantOffer";
export type {
  BuildMerchantRewardsOptions,
  MerchantRewardOption,
} from "./catalog/rewardCatalog";
export type {
  DreamMerchantScreenProps,
} from "./ui/DreamMerchantScreen";
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
  MerchantDialogueBeat,
  MerchantDialogueBeatKind,
  MerchantEncounter,
  MerchantGameObject,
  MerchantNeed,
  MerchantNeedKind,
  MerchantNeedObservation,
  MerchantNeedProjection,
  MerchantNeedReference,
  MerchantOffer,
  MerchantRewardBuilderId,
  MerchantRoleNeed,
  MerchantReward,
} from "./types";
