// The content seam D97 reducer cases read. The app registers it from the
// loaded catalogs before any event folds (src/session/providers/), so the
// cases stay pure and every fold of a log on one build sees the same content.

import type { D97RewardBagContent } from "../../d97/collection/reward-bag";
import type { D97CardPriceFacts } from "../../d97/shop/pricing";
import type { D97StartingCollectionContent } from "../../d97/collection/starting-collection";
import type { D97TierKnob } from "../../content/d97/encounters";
import type { BattleInit as EngineBattleInit } from "../../engine";
import type { CardId } from "../../types/card-identity";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import type { D97BattleResident, D97DreamDefinition, D97DreamRoom } from "../../content/d97/dreams/schema";
import type { DreamAnchorKind } from "../../d97/map/definition";
import type {
  AvatarId,
  BattleId,
  D97DreamId,
  D97ItemId,
  D97RoomId,
  DreamAnchorId,
  DreamsignId,
} from "../../types/identifiers";
import type { D97BattleInit } from "../battle/fold";
import type { D97Encounter, D97Run } from "./d97-state";
import type { D97QuestCatalog } from "../../d97/quests/quests";
import type { D97DialogueCatalog } from "../../d97/dialogue/catalog";

/** An opponent's constructed deck (Appendix B §B9). */
export interface D97OpponentBuild {
  readonly deck: readonly CardId[];
  readonly draftPool: readonly CardId[];
  readonly dreamsignIds: readonly DreamsignId[];
  readonly signatureCardIds: readonly CardId[];
}

/** What starting an encounter's battle needs beyond loaded content. */
export interface D97BattleStartInput {
  readonly run: D97Run;
  readonly encounter: D97Encounter;
  readonly battleId: BattleId;
  /** The battle's engine seed. */
  readonly seed: number;
  readonly playerAnteCopyId: D97BattleInit["playerAnteCopyId"];
}

/** One anchor of a registered dream's maps. */
export interface D97RegisteredAnchor {
  readonly id: DreamAnchorId;
  readonly kind: DreamAnchorKind;
  /** The room the anchor stands in, or null on the dream's own map. */
  readonly roomId: D97RoomId | null;
  /** A guardian's blocked door. */
  readonly blocksDoor?: DreamAnchorId;
}

/**
 * A dream registered with the content (`./d97-dreams.ts`): its module, its
 * maps' anchors (its rooms' included), and the challengers and speakers
 * standing at its anchors. The rules read a run's dream only through
 * `runDreamAnchor`.
 */
export interface D97RegisteredDream {
  readonly definition: D97DreamDefinition;
  /** Its maps' declared anchors, its rooms' included (empty for a synthetic dream without maps). */
  readonly anchors: readonly D97RegisteredAnchor[];
  /**
   * Every anchor the dream declares (its maps', its topology's, its rooms'
   * doors and its residents'), with the room it stands in: null on the
   * dream's own map, which is also where an anchor no map places stands.
   */
  readonly anchorRooms: ReadonlyMap<DreamAnchorId, D97RoomId | null>;
  /** The dream's rooms, by id. */
  readonly rooms: ReadonlyMap<D97RoomId, D97DreamRoom>;
  /** The challenger or guardian at each battle anchor. */
  readonly challengers: ReadonlyMap<DreamAnchorId, D97BattleResident>;
  /**
   * The registered dialogue the resident at `anchorId` speaks to a run
   * playing `runAvatarId` (`incarnationFor`), or null when it speaks none.
   */
  readonly speakerDialogue: (anchorId: DreamAnchorId, runAvatarId: AvatarId) => D97DialogueModule | null;
}

/** Fold-relevant D97 content. */
export interface D97ContentProvider extends D97StartingCollectionContent, D97RewardBagContent {
  /** Every Avatar a run may start with (the full roster). */
  readonly avatarIds: ReadonlySet<AvatarId>;
  /**
   * Build `avatarId`'s opponent deck at a tier knob from a 32-bit seed.
   * Deterministic in its arguments; null when the Avatar has no pool.
   */
  readonly buildOpponentDeck: (input: {
    readonly avatarId: AvatarId;
    readonly seed: number;
    readonly knob: D97TierKnob;
    readonly deckSize: number;
    readonly signatureCount: number;
  }) => D97OpponentBuild | null;
  /** A card's printed price facts (Appendix A §A4), or null for an unknown card. */
  readonly cardPriceFacts: (cardId: CardId) => D97CardPriceFacts | null;
  /**
   * The display init and engine init of an encounter's battle.
   * Deterministic in its input; null when content is missing.
   */
  readonly startBattle: (input: D97BattleStartInput) => {
    readonly init: D97BattleInit;
    readonly engineInit: EngineBattleInit;
  } | null;
  /** Every registered quest, by UUID. */
  readonly quests: D97QuestCatalog;
  /** Every registered quest item. */
  readonly itemIds: ReadonlySet<D97ItemId>;
  /** Every registered dialogue module, quest and item, by UUID, as the overworld's surfaces read them. */
  readonly dialogue: D97DialogueCatalog;
  /**
   * Every dream a run may be in, in registration order: the dream catalog in
   * every build, plus the development dream in development builds.
   */
  readonly dreams: ReadonlyMap<D97DreamId, D97RegisteredDream>;
  /** The dream a run starts in when its start names none; null for no catalog dream. */
  readonly defaultDreamId: D97DreamId | null;
}

let provider: D97ContentProvider | null = null;

/** Register the D97 content before any game event is folded. */
export function registerD97ContentProvider(
  next: D97ContentProvider | null,
): void {
  provider = next;
}

/** The registered D97 content, or null before registration. */
export function d97ContentProvider(): D97ContentProvider | null {
  return provider;
}
