import {
  parseCardId,
  parseCardName,
  parseCardSubtype,
  type CardId,
  type CardName,
  type CardSubtype,
} from "./card-identity";
import {
  parseContentHash,
  parseFoldHash,
  type ContentHash,
  type FoldHash,
} from "./content-hash";
import { parseJourneySeed, type JourneySeed } from "./journey-seed";
import {
  parseDreamwellCardName,
  type DreamwellCardName,
} from "./catalog-names";
import {
  parseAffiliationId,
  parseApollyonIncarnationId,
  parseAtlasFillProfileId,
  parseAtlasNodeId,
  parseArtAssetKey,
  parseBattleCardId,
  parseClientId,
  parseDreamAvatarId,
  parseDreamscapeId,
  parseDreamsignId,
  parseDreamwellCardId,
  parseDreamwellChoiceKey,
  parseDreamwellPromptKey,
  parseExplorationActionId,
  parseGlossaryEntryId,
  parseGambleResultId,
  parseGuideId,
  parseIntentKey,
  parseJourneyId,
  parseOfferTileId,
  parseOpponentId,
  parsePresentationId,
  parseRoomId,
  parseSemanticEntityId,
  parseShuffleCommitment,
  parseTideId,
  parseTutorialActionId,
  parseTutorialAiActionOverrideId,
  parseTutorialJourneyTideId,
  parseTutorialRunId,
  parseTutorialTriggerId,
  type AffiliationId,
  type ApollyonIncarnationId,
  type AtlasFillProfileId,
  type AtlasNodeId,
  type ArtAssetKey,
  type BattleCardId,
  type ClientId,
  type DreamAvatarId,
  type DreamscapeId,
  type DreamsignId,
  type DreamwellCardId,
  type DreamwellChoiceKey,
  type DreamwellPromptKey,
  type ExplorationActionId,
  type GambleResultId,
  type GlossaryEntryId,
  type GuideId,
  type IntentKey,
  type JourneyId,
  type OfferTileId,
  type OpponentId,
  type PresentationId,
  type RoomId,
  type SemanticEntityId,
  type ShuffleCommitment,
  type TideId,
  type TutorialActionId,
  type TutorialAiActionOverrideId,
  type TutorialJourneyTideId,
  type TutorialRunId,
  type TutorialTriggerId,
} from "./identifiers";
import { semanticEntityId } from "./semantic-identity";
import {
  parseEventActor,
  type EventActor,
} from "../eventlog/types";
import {
  parseJourneyMutationSource,
  type JourneyMutationSource,
} from "./journey-source";

/**
 * Produce a stable UUID-shaped value before handing it to a concrete domain
 * parser. Fixture identities therefore obey the same representation invariant
 * as catalog identities; no test-only assertion can smuggle an arbitrary label
 * into a UUID-backed type.
 */
function testUuid(seed: string): SemanticEntityId {
  return semanticEntityId("test", seed);
}

function testUnderscoreSlug(seed: string): string {
  const slug = seed.toLowerCase().replace(/[^a-z0-9]+/gu, "_").replace(/^_+|_+$/gu, "");
  return slug.length === 0 ? "fixture" : slug;
}

function testKebabSlug(seed: string): string {
  return testUnderscoreSlug(seed).replace(/_/gu, "-");
}

export const testCardId = (seed: string): CardId => parseCardId(testUuid(seed));
export const testCardName = (name = "Fixture Card"): CardName =>
  parseCardName(name);
export const testCardSubtype = (subtype = "Fixture"): CardSubtype =>
  parseCardSubtype(subtype);
export const testEventActor = (actor = "fixture-actor"): EventActor =>
  parseEventActor(actor);
export const testJourneyMutationSource = (
  source = "fixture-source",
): JourneyMutationSource => parseJourneyMutationSource(source);
export const testDreamwellCardName = (
  name = "Fixture Dreamwell Card",
): DreamwellCardName => parseDreamwellCardName(name);
export const testBattleCardId = (seed: string): BattleCardId =>
  parseBattleCardId(seed);
export const testAtlasFillProfileId = (seed: string): AtlasFillProfileId =>
  parseAtlasFillProfileId(testUuid(seed));
export const testAtlasNodeId = (seed: string): AtlasNodeId =>
  parseAtlasNodeId(seed);
export const testArtAssetKey = (seed: string): ArtAssetKey =>
  parseArtAssetKey(seed);
export const testApollyonIncarnationId = (
  seed: string,
): ApollyonIncarnationId => parseApollyonIncarnationId(testUuid(seed));
export const testAffiliationId = (seed: string): AffiliationId =>
  parseAffiliationId(testUuid(seed));
export const testDreamAvatarId = (seed: string): DreamAvatarId =>
  parseDreamAvatarId(testUuid(seed));
export const testDreamscapeId = (seed: string): DreamscapeId =>
  parseDreamscapeId(seed);
export const testDreamsignId = (seed: string): DreamsignId =>
  parseDreamsignId(testUuid(seed));
export const testDreamwellCardId = (seed: string): DreamwellCardId =>
  parseDreamwellCardId(testUuid(seed));
export const testDreamwellChoiceKey = (seed: string): DreamwellChoiceKey =>
  parseDreamwellChoiceKey(seed);
export const testDreamwellPromptKey = (seed: string): DreamwellPromptKey =>
  parseDreamwellPromptKey(seed);
export const testExplorationActionId = (
  seed: string,
): ExplorationActionId => parseExplorationActionId(testUuid(seed));
export const testGlossaryEntryId = (seed: string): GlossaryEntryId =>
  parseGlossaryEntryId(testUuid(seed));
export const testGambleResultId = (seed: string): GambleResultId =>
  parseGambleResultId(seed);
export const testGuideId = (seed: string): GuideId =>
  parseGuideId(testUnderscoreSlug(seed));
export const testClientId = (seed: string): ClientId => parseClientId(seed);
export const testRoomId = (seed: string): RoomId => parseRoomId(seed);
export const testSemanticEntityId = (seed: string): SemanticEntityId =>
  parseSemanticEntityId(testUuid(seed));
export const testShuffleCommitment = (seed: string): ShuffleCommitment =>
  parseShuffleCommitment(seed);
export const testIntentKey = (seed: string): IntentKey => parseIntentKey(seed);
export const testJourneyId = (seed: string): JourneyId => parseJourneyId(seed);
export const testOpponentId = (seed: string): OpponentId => parseOpponentId(seed);
export const testOfferTileId = (seed: string): OfferTileId =>
  parseOfferTileId(seed);
export const testPresentationId = (seed: string): PresentationId =>
  parsePresentationId(seed);
export const testTutorialRunId = (seed: string): TutorialRunId =>
  parseTutorialRunId(seed);
export const testTutorialActionId = (seed: string): TutorialActionId =>
  parseTutorialActionId(testUuid(seed));
export const testTutorialAiActionOverrideId = (
  seed: string,
): TutorialAiActionOverrideId =>
  parseTutorialAiActionOverrideId(testUuid(seed));
export const testTutorialTriggerId = (seed: string): TutorialTriggerId =>
  parseTutorialTriggerId(testUuid(seed));
export const testTideId = (seed: string): TideId => parseTideId(testUuid(seed));
export const testTutorialJourneyTideId = (
  seed: string,
): TutorialJourneyTideId => parseTutorialJourneyTideId(testKebabSlug(seed));

function testSha256(seed: string): string {
  if (/^[0-9a-f]$/u.test(seed)) return seed.repeat(64);
  const encoded = Array.from(seed, (character) =>
    character.charCodeAt(0).toString(16).padStart(4, "0")
  ).join("");
  return encoded.padEnd(64, "0").slice(0, 64);
}

/** Build deterministic SHA-256-shaped catalog digests at fixture boundaries. */
export const testContentHash = (seed = "content"): ContentHash =>
  parseContentHash(testSha256(seed));
export const testFoldHash = (seed = "fold"): FoldHash =>
  parseFoldHash(testSha256(seed));
export const testJourneySeed = (seed = "journey"): JourneySeed =>
  parseJourneySeed(seed);
