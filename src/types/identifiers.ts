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
declare const identityRecordBrand: unique symbol;

type DomainIdentity<Name extends string> = string & {
  readonly [domainIdentityBrand]: Name;
};

/**
 * JSON-safe object map whose key domain remains visible to the type system.
 * JavaScript exposes object keys as plain strings, so callers brand decoded
 * keys before using them as identities; distinct identity-record domains stay
 * incompatible even when their value types happen to match.
 */
export type IdentityRecord<Key extends string, Value> = Record<
  string,
  Value
> & {
  readonly [identityRecordBrand]?: Key;
};

function identityConstructor<Identity extends DomainIdentity<string>>() {
  return (value: string): Identity => value as Identity;
}

function identityDecoder<Identity>(construct: (value: string) => Identity) {
  return (value: unknown): Identity | null =>
    typeof value === "string" ? construct(value) : null;
}

export type AtlasNodeId = DomainIdentity<"AtlasNodeId">;
export type AtlasFillProfileId = DomainIdentity<"AtlasFillProfileId">;
export type ArtAssetKey = DomainIdentity<"ArtAssetKey">;
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
const AUGURY_ARCHETYPE_IDS: readonly AuguryArchetypeId[] = [
  "fit_card_grant",
  "fit_card_draft",
  "copies_draft",
  "strong_card",
  "category_draft_known",
  "card_bundle",
  "transfigured_draft",
  "transfigure",
  "starter_transfigure",
  "purge",
  "duplicate",
  "dreamsign",
  "add_site",
];
export type AuguryCardViewId = DomainIdentity<"AuguryCardViewId">;
export type ApollyonIncarnationId = DomainIdentity<"ApollyonIncarnationId">;
export type AffiliationId = DomainIdentity<"AffiliationId">;
export type AiDifficultyPresetId = DomainIdentity<"AiDifficultyPresetId">;
export type AiActionKey = DomainIdentity<"AiActionKey">;
export type BattleCardId = DomainIdentity<"BattleCardId">;
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
export type FrontDoorActionId = DomainIdentity<"FrontDoorActionId">;
export type GlossaryEntryId = DomainIdentity<"GlossaryEntryId">;
export type GameId = DomainIdentity<"GameId">;
export type GuideId = DomainIdentity<"GuideId">;
export type JourneyId = DomainIdentity<"JourneyId">;
export type IntentKey = DomainIdentity<"IntentKey">;
export type MerchantCategoryId = DomainIdentity<"MerchantCategoryId">;
export type MerchantTargetKey = DomainIdentity<"MerchantTargetKey">;
export type NoteId = DomainIdentity<"NoteId">;
export type OfferId = DomainIdentity<"OfferId">;
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
export type TutorialTriggerId = DomainIdentity<"TutorialTriggerId">;
export type TideId = DomainIdentity<"TideId">;

export const asAtlasNodeId = identityConstructor<AtlasNodeId>();
export const asAtlasFillProfileId = identityConstructor<AtlasFillProfileId>();
export const asArtAssetKey = identityConstructor<ArtAssetKey>();
export const asAuguryArchetypeId = (
  value: AuguryArchetypeId,
): AuguryArchetypeId => value;
export const asAuguryCardViewId = identityConstructor<AuguryCardViewId>();
export const asApollyonIncarnationId =
  identityConstructor<ApollyonIncarnationId>();
export const asAffiliationId = identityConstructor<AffiliationId>();
export const asAiDifficultyPresetId =
  identityConstructor<AiDifficultyPresetId>();
export const asAiActionKey = identityConstructor<AiActionKey>();
export const asBattleCardId = identityConstructor<BattleCardId>();
export const asBattleAttemptId = identityConstructor<BattleAttemptId>();
export const asBattleEffectScriptId =
  identityConstructor<BattleEffectScriptId>();
export const asBattleEntryKey = identityConstructor<BattleEntryKey>();
export const asBattleHistoryCommandId =
  identityConstructor<BattleHistoryCommandId>();
export const asBattleId = identityConstructor<BattleId>();
export const asBattleSlotViewId = identityConstructor<BattleSlotViewId>();
export const asChoiceId = identityConstructor<ChoiceId>();
export const asClientId = identityConstructor<ClientId>();
export const asCardTutorialScreenKey =
  identityConstructor<CardTutorialScreenKey>();
export const asCardTypeChangePredicateId =
  identityConstructor<CardTypeChangePredicateId>();
export const asDeckEntryId = identityConstructor<DeckEntryId>();
export const asDreamAvatarId = identityConstructor<DreamAvatarId>();
export const asDreamscapeId = identityConstructor<DreamscapeId>();
export const asDreamsignId = identityConstructor<DreamsignId>();
export const asDreamwellCardId = identityConstructor<DreamwellCardId>();
export const asDreamwellChoiceKey = identityConstructor<DreamwellChoiceKey>();
export const asDreamwellPromptKey = identityConstructor<DreamwellPromptKey>();
export const asEditorFieldTargetId = identityConstructor<EditorFieldTargetId>();
export const asExplorationActionId = identityConstructor<ExplorationActionId>();
export const asFrontDoorActionId = identityConstructor<FrontDoorActionId>();
export const asGlossaryEntryId = identityConstructor<GlossaryEntryId>();
export const asGameId = identityConstructor<GameId>();
export const asGuideId = identityConstructor<GuideId>();
export const asJourneyId = identityConstructor<JourneyId>();
export const asIntentKey = identityConstructor<IntentKey>();
export const asMerchantCategoryId = identityConstructor<MerchantCategoryId>();
export const asMerchantTargetKey = identityConstructor<MerchantTargetKey>();
export const asNoteId = identityConstructor<NoteId>();
export const asOfferId = identityConstructor<OfferId>();
export const asOpponentId = identityConstructor<OpponentId>();
export const asPresentationId = identityConstructor<PresentationId>();
export const asPublicationId = identityConstructor<PublicationId>();
export const asQaSceneId = identityConstructor<QaSceneId>();
export const asRoomId = identityConstructor<RoomId>();
export const asRewardCandidateKey = identityConstructor<RewardCandidateKey>();
export const asSelectionKey = identityConstructor<SelectionKey>();
export const asScreenTransitionKey = identityConstructor<ScreenTransitionKey>();
export const asSemanticEntityId = identityConstructor<SemanticEntityId>();
export const asShuffleCommitment = identityConstructor<ShuffleCommitment>();
export const asSiteId = identityConstructor<SiteId>();
export const asTutorialActionId = identityConstructor<TutorialActionId>();
export const asTutorialAiActionOverrideId =
  identityConstructor<TutorialAiActionOverrideId>();
export const asTutorialRunId = identityConstructor<TutorialRunId>();
export const asTutorialTriggerId = identityConstructor<TutorialTriggerId>();
export const asTideId = identityConstructor<TideId>();

export const atlasNodeIdFromUnknown = identityDecoder(asAtlasNodeId);
export const atlasFillProfileIdFromUnknown =
  identityDecoder(asAtlasFillProfileId);
export const artAssetKeyFromUnknown = identityDecoder(asArtAssetKey);
export const auguryArchetypeIdFromUnknown = (
  value: unknown,
): AuguryArchetypeId | null =>
  typeof value === "string" &&
  (AUGURY_ARCHETYPE_IDS as readonly string[]).includes(value)
    ? (value as AuguryArchetypeId)
    : null;
export const auguryCardViewIdFromUnknown = identityDecoder(asAuguryCardViewId);
export const apollyonIncarnationIdFromUnknown = identityDecoder(
  asApollyonIncarnationId,
);
export const affiliationIdFromUnknown = identityDecoder(asAffiliationId);
export const aiDifficultyPresetIdFromUnknown = identityDecoder(
  asAiDifficultyPresetId,
);
export const aiActionKeyFromUnknown = identityDecoder(asAiActionKey);
export const battleCardIdFromUnknown = identityDecoder(asBattleCardId);
export const battleAttemptIdFromUnknown = identityDecoder(asBattleAttemptId);
export const battleEffectScriptIdFromUnknown = identityDecoder(
  asBattleEffectScriptId,
);
export const battleEntryKeyFromUnknown = identityDecoder(asBattleEntryKey);
export const battleHistoryCommandIdFromUnknown = identityDecoder(
  asBattleHistoryCommandId,
);
export const battleIdFromUnknown = identityDecoder(asBattleId);
export const battleSlotViewIdFromUnknown = identityDecoder(asBattleSlotViewId);
export const choiceIdFromUnknown = identityDecoder(asChoiceId);
export const clientIdFromUnknown = identityDecoder(asClientId);
export const cardTutorialScreenKeyFromUnknown = identityDecoder(
  asCardTutorialScreenKey,
);
export const cardTypeChangePredicateIdFromUnknown = identityDecoder(
  asCardTypeChangePredicateId,
);
export const deckEntryIdFromUnknown = identityDecoder(asDeckEntryId);
export const dreamAvatarIdFromUnknown = identityDecoder(asDreamAvatarId);
export const dreamscapeIdFromUnknown = identityDecoder(asDreamscapeId);
export const dreamsignIdFromUnknown = identityDecoder(asDreamsignId);
export const dreamwellCardIdFromUnknown = identityDecoder(asDreamwellCardId);
export const dreamwellChoiceKeyFromUnknown =
  identityDecoder(asDreamwellChoiceKey);
export const dreamwellPromptKeyFromUnknown =
  identityDecoder(asDreamwellPromptKey);
export const editorFieldTargetIdFromUnknown = identityDecoder(
  asEditorFieldTargetId,
);
export const explorationActionIdFromUnknown = identityDecoder(
  asExplorationActionId,
);
export const frontDoorActionIdFromUnknown =
  identityDecoder(asFrontDoorActionId);
export const glossaryEntryIdFromUnknown = identityDecoder(asGlossaryEntryId);
export const gameIdFromUnknown = identityDecoder(asGameId);
export const guideIdFromUnknown = identityDecoder(asGuideId);
export const journeyIdFromUnknown = identityDecoder(asJourneyId);
export const intentKeyFromUnknown = identityDecoder(asIntentKey);
export const merchantCategoryIdFromUnknown =
  identityDecoder(asMerchantCategoryId);
export const merchantTargetKeyFromUnknown =
  identityDecoder(asMerchantTargetKey);
export const noteIdFromUnknown = identityDecoder(asNoteId);
export const offerIdFromUnknown = identityDecoder(asOfferId);
export const opponentIdFromUnknown = identityDecoder(asOpponentId);
export const presentationIdFromUnknown = identityDecoder(asPresentationId);
export const publicationIdFromUnknown = identityDecoder(asPublicationId);
export const qaSceneIdFromUnknown = identityDecoder(asQaSceneId);
export const roomIdFromUnknown = identityDecoder(asRoomId);
export const rewardCandidateKeyFromUnknown =
  identityDecoder(asRewardCandidateKey);
export const selectionKeyFromUnknown = identityDecoder(asSelectionKey);
export const screenTransitionKeyFromUnknown = identityDecoder(
  asScreenTransitionKey,
);
export const semanticEntityIdFromUnknown = identityDecoder(asSemanticEntityId);
export const shuffleCommitmentFromUnknown =
  identityDecoder(asShuffleCommitment);
export const siteIdFromUnknown = identityDecoder(asSiteId);
export const tutorialActionIdFromUnknown = identityDecoder(asTutorialActionId);
export const tutorialAiActionOverrideIdFromUnknown = identityDecoder(
  asTutorialAiActionOverrideId,
);
export const tutorialRunIdFromUnknown = identityDecoder(asTutorialRunId);
export const tutorialTriggerIdFromUnknown =
  identityDecoder(asTutorialTriggerId);
export const tideIdFromUnknown = identityDecoder(asTideId);
