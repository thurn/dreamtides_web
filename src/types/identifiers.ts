/**
 * Nominal string identities used by journey state and the rules event log.
 *
 * JavaScript APIs and persisted JSON expose strings structurally. Inside the
 * application, however, a site id, deck-entry id, battle id, and guide id are
 * different values with different invariants. Keeping their brands here gives
 * domain models one dependency-free vocabulary and keeps the unavoidable casts
 * at explicit decode/minting boundaries.
 */

declare const domainIdentityBrand: unique symbol;

type DomainIdentity<Name extends string> = string & {
  readonly [domainIdentityBrand]: Name;
};

/**
 * JSON-safe object map keyed by one concrete identity domain. Decoders must
 * validate object keys before constructing this type; application code can
 * then index it only with the matching branded identity.
 */
export type IdentityRecord<Key extends string, Value> = Record<Key, Value>;

/** Typed counterpart to `Object.keys` for a validated identity-keyed record. */
export function identityKeys<Key extends string, Value>(
  record: IdentityRecord<Key, Value>,
): Key[] {
  return Object.keys(record) as Key[];
}

/** Typed counterpart to `Object.entries` for a validated identity-keyed record. */
export function identityEntries<Key extends string, Value>(
  record: IdentityRecord<Key, Value>,
): Array<[Key, Value]> {
  return Object.entries(record) as Array<[Key, Value]>;
}

function identityConstructor<Identity extends DomainIdentity<string>>() {
  return (value: string): Identity => value as Identity;
}

function identityDecoder<Identity>(parse: (value: unknown) => Identity) {
  return (value: unknown): Identity | null => {
    try {
      return parse(value);
    } catch {
      return null;
    }
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function identityParser<Identity>(
  label: string,
  construct: (value: string) => Identity,
  predicate: (value: string) => boolean = (value) => value.length > 0,
  normalize: (value: string) => string = (value) => value,
) {
  return (value: unknown): Identity => {
    if (typeof value !== "string" || !predicate(value)) {
      throw new Error(`${label} must be a valid non-empty identity.`);
    }
    return construct(normalize(value));
  };
}

export type AtlasNodeId = DomainIdentity<"AtlasNodeId">;
export type AtlasFillProfileId = DomainIdentity<"AtlasFillProfileId">;
export type ArtAssetKey = DomainIdentity<"ArtAssetKey">;
export type BackRankSlotId = `B${number}`;
export type AuguryArchetypeId =
  | "fit_card_grant"
  | "fit_card_draft"
  | "copies_draft"
  | "strong_card"
  | "category_draft_known"
  | "card_bundle"
  | "transfigured_draft"
  | "transfigure"
  | "starter_transfigure"
  | "purge"
  | "duplicate"
  | "dreamsign"
  | "add_site";
export type AuguryCardViewId = DomainIdentity<"AuguryCardViewId">;
export type ApollyonIncarnationId = DomainIdentity<"ApollyonIncarnationId">;
export type AffiliationId = DomainIdentity<"AffiliationId">;
export type AiDifficultyPresetId = DomainIdentity<"AiDifficultyPresetId">;
export type AiActionKey = DomainIdentity<"AiActionKey">;
export type BattleCardId = DomainIdentity<"BattleCardId">;
export type BattlefieldSlotId = BackRankSlotId | FrontRankSlotId;
export type BattleAttemptId = DomainIdentity<"BattleAttemptId">;
export type BattleEffectScriptId = DomainIdentity<"BattleEffectScriptId">;
export type BattleEntryKey = DomainIdentity<"BattleEntryKey">;
export type BattleHistoryCommandId = DomainIdentity<"BattleHistoryCommandId">;
export type BattleId = DomainIdentity<"BattleId">;
export type BattleSlotViewId = DomainIdentity<"BattleSlotViewId">;
export type ChoiceId = DomainIdentity<"ChoiceId">;
export type ClientId = DomainIdentity<"ClientId">;
export type CardTutorialScreenKey = DomainIdentity<"CardTutorialScreenKey">;
export type CardTypeChangePredicateId =
  DomainIdentity<"CardTypeChangePredicateId">;
export type DeckEntryId = DomainIdentity<"DeckEntryId">;
export type DreamAvatarId = DomainIdentity<"DreamAvatarId">;
export type DreamscapeId = DomainIdentity<"DreamscapeId">;
export type DreamsignId = DomainIdentity<"DreamsignId">;
export type DreamwellCardId = DomainIdentity<"DreamwellCardId">;
export type DreamwellChoiceKey = DomainIdentity<"DreamwellChoiceKey">;
export type DreamwellPromptKey = DomainIdentity<"DreamwellPromptKey">;
export type EditorFieldTargetId = DomainIdentity<"EditorFieldTargetId">;
export type ExplorationActionId = DomainIdentity<"ExplorationActionId">;
export type FrontRankSlotId = `F${number}`;
export type FrontDoorActionId = DomainIdentity<"FrontDoorActionId">;
export type FigmentCatalogKey = DomainIdentity<"FigmentCatalogKey">;
export type GlossaryEntryId = DomainIdentity<"GlossaryEntryId">;
export type GameId = DomainIdentity<"GameId">;
export type GambleResultId = DomainIdentity<"GambleResultId">;
export type GuideId = DomainIdentity<"GuideId">;
export type JourneyId = DomainIdentity<"JourneyId">;
export type IntentKey = DomainIdentity<"IntentKey">;
export type MerchantCategoryId = DomainIdentity<"MerchantCategoryId">;
export type MerchantTargetKey = DomainIdentity<"MerchantTargetKey">;
export type NoteId = DomainIdentity<"NoteId">;
export type OfferId = DomainIdentity<"OfferId">;
export type OfferTileId = DomainIdentity<"OfferTileId">;
export type OpponentId = DomainIdentity<"OpponentId">;
export type PresentationId = DomainIdentity<"PresentationId">;
export type PublicationId = DomainIdentity<"PublicationId">;
export type QaSceneId = DomainIdentity<"QaSceneId">;
export type RoomId = DomainIdentity<"RoomId">;
export type RewardCandidateKey = DomainIdentity<"RewardCandidateKey">;
export type SelectionKey = DomainIdentity<"SelectionKey">;
export type ScreenTransitionKey = DomainIdentity<"ScreenTransitionKey">;
export type SemanticEntityId = DomainIdentity<"SemanticEntityId">;
export type ShuffleCommitment = DomainIdentity<"ShuffleCommitment">;
export type SiteId = DomainIdentity<"SiteId">;
export type TutorialActionId = DomainIdentity<"TutorialActionId">;
export type TutorialAiActionOverrideId =
  DomainIdentity<"TutorialAiActionOverrideId">;
export type TutorialRunId = DomainIdentity<"TutorialRunId">;
export type TutorialJourneyTideId =
  DomainIdentity<"TutorialJourneyTideId">;
export type TutorialTriggerId = DomainIdentity<"TutorialTriggerId">;
export type TideId = DomainIdentity<"TideId">;

const brandAtlasNodeId = identityConstructor<AtlasNodeId>();
const brandAtlasFillProfileId = identityConstructor<AtlasFillProfileId>();
const brandArtAssetKey = identityConstructor<ArtAssetKey>();
const brandAuguryArchetypeId = (
  value: AuguryArchetypeId,
): AuguryArchetypeId => value;
const brandAuguryCardViewId = identityConstructor<AuguryCardViewId>();
const brandApollyonIncarnationId =
  identityConstructor<ApollyonIncarnationId>();
const brandAffiliationId = identityConstructor<AffiliationId>();
const brandAiDifficultyPresetId =
  identityConstructor<AiDifficultyPresetId>();
const brandAiActionKey = identityConstructor<AiActionKey>();
const brandBattleCardId = identityConstructor<BattleCardId>();
const brandBattleAttemptId = identityConstructor<BattleAttemptId>();
const brandBattleEffectScriptId =
  identityConstructor<BattleEffectScriptId>();
const brandBattleEntryKey = identityConstructor<BattleEntryKey>();
const brandBattleHistoryCommandId =
  identityConstructor<BattleHistoryCommandId>();
const brandBattleId = identityConstructor<BattleId>();
const brandBattleSlotViewId = identityConstructor<BattleSlotViewId>();
const brandChoiceId = identityConstructor<ChoiceId>();
const brandClientId = identityConstructor<ClientId>();
const brandCardTutorialScreenKey =
  identityConstructor<CardTutorialScreenKey>();
const brandCardTypeChangePredicateId =
  identityConstructor<CardTypeChangePredicateId>();
const brandDeckEntryId = identityConstructor<DeckEntryId>();
const brandDreamAvatarId = identityConstructor<DreamAvatarId>();
const brandDreamscapeId = identityConstructor<DreamscapeId>();
const brandDreamsignId = identityConstructor<DreamsignId>();
const brandDreamwellCardId = identityConstructor<DreamwellCardId>();
const brandDreamwellChoiceKey = identityConstructor<DreamwellChoiceKey>();
const brandDreamwellPromptKey = identityConstructor<DreamwellPromptKey>();
const brandEditorFieldTargetId = identityConstructor<EditorFieldTargetId>();
const brandExplorationActionId = identityConstructor<ExplorationActionId>();
const brandFrontDoorActionId = identityConstructor<FrontDoorActionId>();
const brandFigmentCatalogKey = identityConstructor<FigmentCatalogKey>();
const brandGlossaryEntryId = identityConstructor<GlossaryEntryId>();
const brandGameId = identityConstructor<GameId>();
const brandGambleResultId = identityConstructor<GambleResultId>();
const brandGuideId = identityConstructor<GuideId>();
const brandJourneyId = identityConstructor<JourneyId>();
const brandIntentKey = identityConstructor<IntentKey>();
const brandMerchantCategoryId = identityConstructor<MerchantCategoryId>();
const brandMerchantTargetKey = identityConstructor<MerchantTargetKey>();
const brandNoteId = identityConstructor<NoteId>();
const brandOfferId = identityConstructor<OfferId>();
const brandOfferTileId = identityConstructor<OfferTileId>();
const brandOpponentId = identityConstructor<OpponentId>();
const brandPresentationId = identityConstructor<PresentationId>();
const brandPublicationId = identityConstructor<PublicationId>();
const brandQaSceneId = identityConstructor<QaSceneId>();
const brandRoomId = identityConstructor<RoomId>();
const brandRewardCandidateKey = identityConstructor<RewardCandidateKey>();
const brandSelectionKey = identityConstructor<SelectionKey>();
const brandScreenTransitionKey = identityConstructor<ScreenTransitionKey>();
const brandSemanticEntityId = identityConstructor<SemanticEntityId>();
const brandShuffleCommitment = identityConstructor<ShuffleCommitment>();
const brandSiteId = identityConstructor<SiteId>();
const brandTutorialActionId = identityConstructor<TutorialActionId>();
const brandTutorialAiActionOverrideId =
  identityConstructor<TutorialAiActionOverrideId>();
const brandTutorialRunId = identityConstructor<TutorialRunId>();
const brandTutorialJourneyTideId =
  identityConstructor<TutorialJourneyTideId>();
const brandTutorialTriggerId = identityConstructor<TutorialTriggerId>();
const brandTideId = identityConstructor<TideId>();

export const parseAtlasNodeId = identityParser(
  "Atlas node id",
  brandAtlasNodeId,
);
export const parseAtlasFillProfileId = identityParser(
  "Atlas fill profile id",
  brandAtlasFillProfileId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseArtAssetKey = identityParser("Art asset key", brandArtAssetKey);
export function parseAuguryArchetypeId(value: unknown): AuguryArchetypeId {
  if (!isAuguryArchetypeId(value)) {
    throw new Error("Augury archetype id must be a supported archetype.");
  }
  return brandAuguryArchetypeId(value);
}

function isAuguryArchetypeId(value: unknown): value is AuguryArchetypeId {
  if (typeof value !== "string") return false;
  switch (value) {
    case "fit_card_grant":
    case "fit_card_draft":
    case "copies_draft":
    case "strong_card":
    case "category_draft_known":
    case "card_bundle":
    case "transfigured_draft":
    case "transfigure":
    case "starter_transfigure":
    case "purge":
    case "duplicate":
    case "dreamsign":
    case "add_site":
      return true;
    default:
      return false;
  }
}
export const parseAuguryCardViewId = identityParser(
  "Augury card view id",
  brandAuguryCardViewId,
);
export const parseApollyonIncarnationId = identityParser(
  "Apollyon incarnation id",
  brandApollyonIncarnationId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseAffiliationId = identityParser(
  "Affiliation id",
  brandAffiliationId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseAiDifficultyPresetId = identityParser(
  "AI difficulty preset id",
  brandAiDifficultyPresetId,
);
export const parseAiActionKey = identityParser("AI action key", brandAiActionKey);
export const parseBattleCardId = identityParser(
  "Battle card id",
  brandBattleCardId,
);
export const parseBattleAttemptId = identityParser(
  "Battle attempt id",
  brandBattleAttemptId,
);
export const parseBattleEffectScriptId = identityParser(
  "Battle effect script id",
  brandBattleEffectScriptId,
);
export const parseBattleEntryKey = identityParser(
  "Battle entry key",
  brandBattleEntryKey,
);
export const parseBattleHistoryCommandId = identityParser(
  "Battle history command id",
  brandBattleHistoryCommandId,
);
export const parseBattleId = identityParser("Battle id", brandBattleId);
export const parseBattleSlotViewId = identityParser(
  "Battle slot view id",
  brandBattleSlotViewId,
);
export const parseChoiceId = identityParser("Choice id", brandChoiceId);
export const parseClientId = identityParser("Client id", brandClientId);
export const parseCardTutorialScreenKey = identityParser(
  "Card tutorial screen key",
  brandCardTutorialScreenKey,
);
export const parseCardTypeChangePredicateId = identityParser(
  "Card type-change predicate id",
  brandCardTypeChangePredicateId,
);
export const parseDeckEntryId = identityParser("Deck entry id", brandDeckEntryId);
export const parseDreamAvatarId = identityParser(
  "Dream Avatar id",
  brandDreamAvatarId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseDreamscapeId = identityParser(
  "Dreamscape id",
  brandDreamscapeId,
);
export const parseDreamsignId = identityParser(
  "Dreamsign id",
  brandDreamsignId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseDreamwellCardId = identityParser(
  "Dreamwell card id",
  brandDreamwellCardId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseDreamwellChoiceKey = identityParser(
  "Dreamwell choice key",
  brandDreamwellChoiceKey,
);
export const parseDreamwellPromptKey = identityParser(
  "Dreamwell prompt key",
  brandDreamwellPromptKey,
);
export const parseEditorFieldTargetId = identityParser(
  "Editor field target id",
  brandEditorFieldTargetId,
);
export const parseExplorationActionId = identityParser(
  "Exploration action id",
  brandExplorationActionId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseFrontDoorActionId = identityParser(
  "Front-door action id",
  brandFrontDoorActionId,
);
export const parseFigmentCatalogKey = identityParser(
  "Figment catalog key",
  brandFigmentCatalogKey,
);
export const parseGlossaryEntryId = identityParser(
  "Glossary entry id",
  brandGlossaryEntryId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseGameId = identityParser("Game id", brandGameId);
export const parseGambleResultId = identityParser(
  "Gamble result id",
  brandGambleResultId,
);
export const parseGuideId = identityParser(
  "Dream Guide id",
  brandGuideId,
  (value) => /^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(value),
);
export const parseJourneyId = identityParser("Journey id", brandJourneyId);
export const parseIntentKey = identityParser("Intent key", brandIntentKey);
export const parseMerchantCategoryId = identityParser(
  "Merchant category id",
  brandMerchantCategoryId,
);
export const parseMerchantTargetKey = identityParser(
  "Merchant target key",
  brandMerchantTargetKey,
);
export const parseNoteId = identityParser("Note id", brandNoteId);
export const parseOfferId = identityParser("Offer id", brandOfferId);
export const parseOfferTileId = identityParser(
  "Offer tile id",
  brandOfferTileId,
);
export const parseOpponentId = identityParser("Opponent id", brandOpponentId);
export const parsePresentationId = identityParser(
  "Presentation id",
  brandPresentationId,
);
export const parsePublicationId = identityParser(
  "Publication id",
  brandPublicationId,
);
export const parseQaSceneId = identityParser("QA scene id", brandQaSceneId);
export const parseRoomId = identityParser("Room id", brandRoomId);
export const parseRewardCandidateKey = identityParser(
  "Reward candidate key",
  brandRewardCandidateKey,
);
export const parseSelectionKey = identityParser(
  "Selection key",
  brandSelectionKey,
);
export const parseScreenTransitionKey = identityParser(
  "Screen transition key",
  brandScreenTransitionKey,
);
export const parseSemanticEntityId = identityParser(
  "Semantic entity id",
  brandSemanticEntityId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseShuffleCommitment = identityParser(
  "Shuffle commitment",
  brandShuffleCommitment,
);
export const parseSiteId = identityParser("Site id", brandSiteId);
export const parseTutorialActionId = identityParser(
  "Tutorial action id",
  brandTutorialActionId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseTutorialAiActionOverrideId = identityParser(
  "Tutorial AI action override id",
  brandTutorialAiActionOverrideId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseTutorialRunId = identityParser(
  "Tutorial run id",
  brandTutorialRunId,
);
export const parseTutorialJourneyTideId = identityParser(
  "Tutorial journey tide id",
  brandTutorialJourneyTideId,
  (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value),
);
export const parseTutorialTriggerId = identityParser(
  "Tutorial trigger id",
  brandTutorialTriggerId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);
export const parseTideId = identityParser(
  "Tide id",
  brandTideId,
  (value) => UUID_PATTERN.test(value),
  (value) => value.toLowerCase(),
);

export const atlasNodeIdFromUnknown = identityDecoder(parseAtlasNodeId);
export const atlasFillProfileIdFromUnknown =
  identityDecoder(parseAtlasFillProfileId);
export const artAssetKeyFromUnknown = identityDecoder(parseArtAssetKey);
export const auguryArchetypeIdFromUnknown = identityDecoder(
  parseAuguryArchetypeId,
);
export const auguryCardViewIdFromUnknown = identityDecoder(parseAuguryCardViewId);
export const apollyonIncarnationIdFromUnknown = identityDecoder(
  parseApollyonIncarnationId,
);
export const affiliationIdFromUnknown = identityDecoder(parseAffiliationId);
export const aiDifficultyPresetIdFromUnknown = identityDecoder(
  parseAiDifficultyPresetId,
);
export const aiActionKeyFromUnknown = identityDecoder(parseAiActionKey);
export const battleCardIdFromUnknown = identityDecoder(parseBattleCardId);
export const battleAttemptIdFromUnknown = identityDecoder(parseBattleAttemptId);
export const battleEffectScriptIdFromUnknown = identityDecoder(
  parseBattleEffectScriptId,
);
export const battleEntryKeyFromUnknown = identityDecoder(parseBattleEntryKey);
export const battleHistoryCommandIdFromUnknown = identityDecoder(
  parseBattleHistoryCommandId,
);
export const battleIdFromUnknown = identityDecoder(parseBattleId);
export const battleSlotViewIdFromUnknown = identityDecoder(parseBattleSlotViewId);
export const choiceIdFromUnknown = identityDecoder(parseChoiceId);
export const clientIdFromUnknown = identityDecoder(parseClientId);
export const cardTutorialScreenKeyFromUnknown = identityDecoder(
  parseCardTutorialScreenKey,
);
export const cardTypeChangePredicateIdFromUnknown = identityDecoder(
  parseCardTypeChangePredicateId,
);
export const deckEntryIdFromUnknown = identityDecoder(parseDeckEntryId);
export const dreamAvatarIdFromUnknown = identityDecoder(parseDreamAvatarId);
export const dreamscapeIdFromUnknown = identityDecoder(parseDreamscapeId);
export const dreamsignIdFromUnknown = identityDecoder(parseDreamsignId);
export const dreamwellCardIdFromUnknown = identityDecoder(parseDreamwellCardId);
export const dreamwellChoiceKeyFromUnknown =
  identityDecoder(parseDreamwellChoiceKey);
export const dreamwellPromptKeyFromUnknown =
  identityDecoder(parseDreamwellPromptKey);
export const editorFieldTargetIdFromUnknown = identityDecoder(
  parseEditorFieldTargetId,
);
export const explorationActionIdFromUnknown = identityDecoder(
  parseExplorationActionId,
);
export const frontDoorActionIdFromUnknown =
  identityDecoder(parseFrontDoorActionId);
export const figmentCatalogKeyFromUnknown = identityDecoder(
  parseFigmentCatalogKey,
);
export const glossaryEntryIdFromUnknown = identityDecoder(parseGlossaryEntryId);
export const gameIdFromUnknown = identityDecoder(parseGameId);
export const gambleResultIdFromUnknown = identityDecoder(parseGambleResultId);
export const guideIdFromUnknown = identityDecoder(parseGuideId);
export const journeyIdFromUnknown = identityDecoder(parseJourneyId);
export const intentKeyFromUnknown = identityDecoder(parseIntentKey);
export const merchantCategoryIdFromUnknown =
  identityDecoder(parseMerchantCategoryId);
export const merchantTargetKeyFromUnknown =
  identityDecoder(parseMerchantTargetKey);
export const noteIdFromUnknown = identityDecoder(parseNoteId);
export const offerIdFromUnknown = identityDecoder(parseOfferId);
export const offerTileIdFromUnknown = identityDecoder(parseOfferTileId);
export const opponentIdFromUnknown = identityDecoder(parseOpponentId);
export const presentationIdFromUnknown = identityDecoder(parsePresentationId);
export const publicationIdFromUnknown = identityDecoder(parsePublicationId);
export const qaSceneIdFromUnknown = identityDecoder(parseQaSceneId);
export const roomIdFromUnknown = identityDecoder(parseRoomId);
export const rewardCandidateKeyFromUnknown =
  identityDecoder(parseRewardCandidateKey);
export const selectionKeyFromUnknown = identityDecoder(parseSelectionKey);
export const screenTransitionKeyFromUnknown = identityDecoder(
  parseScreenTransitionKey,
);
export const semanticEntityIdFromUnknown = identityDecoder(parseSemanticEntityId);
export const shuffleCommitmentFromUnknown =
  identityDecoder(parseShuffleCommitment);
export const siteIdFromUnknown = identityDecoder(parseSiteId);
export const tutorialActionIdFromUnknown = identityDecoder(parseTutorialActionId);
export const tutorialAiActionOverrideIdFromUnknown = identityDecoder(
  parseTutorialAiActionOverrideId,
);
export const tutorialRunIdFromUnknown = identityDecoder(parseTutorialRunId);
export const tutorialJourneyTideIdFromUnknown = identityDecoder(
  parseTutorialJourneyTideId,
);
export const tutorialTriggerIdFromUnknown =
  identityDecoder(parseTutorialTriggerId);
export const tideIdFromUnknown = identityDecoder(parseTideId);
