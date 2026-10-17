// The D97 dialogue and quest schema (decision P17, README § S33, Appendix B
// §B15). A character's dialogue is a typed TS module: nodes keyed by UUID,
// each with lines of content copy and player choices; conditions read quest
// state, flags, the act, beaten anchors, carried items and collection traits;
// a choice carries at most one effect, and each effect becomes one intent
// event (src/d97/dialogue/effects.ts). Which node shows is view state.
//
// Quests are typed data keyed by UUID: an ordered list of steps, a giver, a
// turn-in anchor and a reward kind. Rules code reads only their ids and
// structure; their copy is for the UI.

import type { CardSubtype } from "../../../types/card-identity";
import type { CardType, Rarity } from "../../../types/cards";
import type {
  AvatarId,
  D97DialogueId,
  D97DialogueNodeId,
  D97FlagId,
  D97ItemId,
  D97QuestId,
  D97QuestStepId,
  DreamAnchorId,
} from "../../../types/identifiers";

// --- conditions ---------------------------------------------------------------

/**
 * A quest's status for the player: `available` (not held and not finished),
 * `active` (held, a step remains), `ready` (held, every step done, awaiting
 * turn-in) or `completed`.
 */
export type D97QuestStatus = "available" | "active" | "ready" | "completed";

/** A quest step's status: not reached, the current step, or done. */
export type D97QuestStepStatus = "pending" | "current" | "done";

/** A trait an owned copy's card can have (Appendix B §B15 delivery traits). */
export type D97CardTrait =
  | { readonly kind: "rarity"; readonly rarity: Rarity }
  | { readonly kind: "cardType"; readonly cardType: CardType }
  | { readonly kind: "subtype"; readonly subtype: CardSubtype }
  /** An energy cost within the inclusive bounds; a missing bound is open. */
  | { readonly kind: "cost"; readonly min?: number; readonly max?: number };

export type D97DialogueCondition =
  | { readonly kind: "all"; readonly conditions: readonly D97DialogueCondition[] }
  | { readonly kind: "any"; readonly conditions: readonly D97DialogueCondition[] }
  | { readonly kind: "not"; readonly condition: D97DialogueCondition }
  | { readonly kind: "quest"; readonly questId: D97QuestId; readonly status: D97QuestStatus }
  | {
      readonly kind: "questStep";
      readonly questId: D97QuestId;
      readonly stepId: D97QuestStepId;
      readonly status: D97QuestStepStatus;
    }
  /** Whether the player holds any quest (one at a time, S33). */
  | { readonly kind: "questHeld"; readonly held: boolean }
  | { readonly kind: "flag"; readonly flagId: D97FlagId; readonly set: boolean }
  /** The current act within the inclusive bounds; a missing bound is open. */
  | { readonly kind: "act"; readonly min?: number; readonly max?: number }
  | { readonly kind: "anchorBeaten"; readonly anchorId: DreamAnchorId; readonly beaten: boolean }
  | { readonly kind: "hasItem"; readonly itemId: D97ItemId; readonly held: boolean }
  /** The collection owns at least `atLeast` copies with `trait`. */
  | { readonly kind: "collection"; readonly trait: D97CardTrait; readonly atLeast: number };

// --- effects ------------------------------------------------------------------

/** The services a friendly character can open (their surfaces arrive later). */
export type D97ServiceKind = "dreamGuide" | "sage" | "amuletMerchant" | "amuletChanger";

export type D97DialogueEffect =
  /** Accept the quest the speaker offers. */
  | { readonly kind: "offerQuest"; readonly questId: D97QuestId }
  /** Finish the active quest's current visit or deliver step at the speaker. */
  | { readonly kind: "advanceQuest"; readonly questId: D97QuestId; readonly stepId: D97QuestStepId }
  /** Turn the active quest in at the speaker and take its reward. */
  | { readonly kind: "completeQuest"; readonly questId: D97QuestId }
  /** The speaker hands the player an item. */
  | { readonly kind: "giveItem"; readonly itemId: D97ItemId }
  /** The speaker takes an item from the player. */
  | { readonly kind: "takeItem"; readonly itemId: D97ItemId }
  | { readonly kind: "openShop" }
  | { readonly kind: "openService"; readonly service: D97ServiceKind }
  | { readonly kind: "setFlag"; readonly flagId: D97FlagId; readonly value: boolean }
  /** Challenge the speaker (a challenger or guardian). */
  | { readonly kind: "startChallenge" };

export type D97DialogueEffectKind = D97DialogueEffect["kind"];

// --- graphs -------------------------------------------------------------------

/** The anchor kinds a speaking character stands at. */
export type D97SpeakerKind = "friendly" | "townsfolk" | "shop" | "challenger" | "guardian";

export interface D97DialogueChoice {
  /** The player's line (content copy). */
  readonly label: string;
  /** Shown only while this holds. */
  readonly condition?: D97DialogueCondition;
  /** The one intent choosing this records. */
  readonly effect?: D97DialogueEffect;
  /** The node shown next, or null to end the conversation. */
  readonly next: D97DialogueNodeId | null;
}

export interface D97DialogueNode {
  readonly id: D97DialogueNodeId;
  /** The speaker's lines, shown in order (content copy). */
  readonly lines: readonly string[];
  /** The player's choices after the last line; none ends the conversation. */
  readonly choices: readonly D97DialogueChoice[];
}

/** Where a conversation starts: the first entry whose condition holds. */
export interface D97DialogueEntry {
  readonly condition?: D97DialogueCondition;
  readonly node: D97DialogueNodeId;
}

export interface D97DialogueModule {
  readonly id: D97DialogueId;
  readonly speaker: {
    /** The speaker's name (content copy). */
    readonly name: string;
    /** The anchor kind the speaker stands at; it decides the legal effects. */
    readonly kind: D97SpeakerKind;
    /** The Avatar an Avatar character portrays, for its portrait. */
    readonly avatarId?: AvatarId;
  };
  /** Checked in order; the last entry should hold unconditionally. */
  readonly entries: readonly D97DialogueEntry[];
  readonly nodes: readonly D97DialogueNode[];
}

/** Declare a dialogue module. */
export function defineDialogue(module: D97DialogueModule): D97DialogueModule {
  return module;
}

// --- quests -------------------------------------------------------------------

/** The quest kinds of quest model v0 (Appendix B §B15). */
export type D97QuestKind = "defeat" | "lostObject" | "errand" | "delivery";

interface QuestStepBase {
  readonly id: D97QuestStepId;
  /** The quest log's line for this step (content copy). */
  readonly description: string;
}

export type D97QuestStep =
  /** Beat the challenger or guardian at `anchorId`. */
  | (QuestStepBase & { readonly kind: "defeat"; readonly anchorId: DreamAnchorId })
  /** Pick up `itemId` at the object anchor `anchorId`. */
  | (QuestStepBase & {
      readonly kind: "findObject";
      readonly anchorId: DreamAnchorId;
      readonly itemId: D97ItemId;
    })
  /** Talk to the character at `anchorId`. */
  | (QuestStepBase & { readonly kind: "visit"; readonly anchorId: DreamAnchorId })
  /** Hand `itemId` to the character at `anchorId`. */
  | (QuestStepBase & {
      readonly kind: "deliver";
      readonly anchorId: DreamAnchorId;
      readonly itemId: D97ItemId;
    });

export type D97QuestStepKind = D97QuestStep["kind"];

/** A quest's reward (Appendix A §A12); amounts and sizes are tunables. */
export type D97QuestReward = { readonly kind: "essence" } | { readonly kind: "cardChoice" };

export interface D97QuestDefinition {
  readonly id: D97QuestId;
  readonly kind: D97QuestKind;
  /** The quest log's title (content copy). */
  readonly title: string;
  /** The friendly anchor whose character offers the quest. */
  readonly giverAnchorId: DreamAnchorId;
  /** The anchor whose character takes the turn-in and pays the reward. */
  readonly turnInAnchorId: DreamAnchorId;
  /** Items the giver hands over on acceptance (a delivery's parcel). */
  readonly carriedItemIds: readonly D97ItemId[];
  /** Done in order. */
  readonly steps: readonly D97QuestStep[];
  readonly reward: D97QuestReward;
}

/** Declare a quest. */
export function defineQuest(quest: D97QuestDefinition): D97QuestDefinition {
  return quest;
}

export interface D97ItemDefinition {
  readonly id: D97ItemId;
  /** The item's name (content copy). */
  readonly name: string;
}

/** One registered body of dialogue content: a dream's, or a fixture's. */
export interface D97DialogueContent {
  readonly dialogues: readonly D97DialogueModule[];
  readonly quests: readonly D97QuestDefinition[];
  readonly items: readonly D97ItemDefinition[];
}
