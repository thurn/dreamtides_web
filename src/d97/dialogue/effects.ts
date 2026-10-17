// Dialogue effects as intents (decision P17): each effect a choice carries
// becomes exactly one intent event, naming the anchor of the character the
// player is speaking with. Starting a challenge is the encounter flow's own
// preview intent, `D97_PREVIEW_ENCOUNTER`. Which anchor kinds may carry which effects is the
// legality table the validator enforces.

import type {
  D97DialogueEffect,
  D97DialogueEffectKind,
  D97SpeakerKind,
} from "../../content/d97/dialogue/schema";
import type { EventPayloads } from "../../rules/events";
import type { DreamAnchorId } from "../../types/identifiers";

/** The event types dialogue effects record. */
export type D97DialogueEventType =
  | "D97_ACCEPT_QUEST"
  | "D97_ADVANCE_QUEST"
  | "D97_COMPLETE_QUEST"
  | "D97_GIVE_ITEM"
  | "D97_TAKE_ITEM"
  | "D97_OPEN_SHOP"
  | "D97_OPEN_SERVICE"
  | "D97_SET_FLAG"
  | "D97_PREVIEW_ENCOUNTER";

/** One intent event, typed by its event type. */
export type D97DialogueIntent = {
  readonly [Type in D97DialogueEventType]: { readonly type: Type; readonly payload: EventPayloads[Type] };
}[D97DialogueEventType];

/** The intent `effect` records when chosen while speaking at `anchorId`. */
export function effectIntent(effect: D97DialogueEffect, anchorId: DreamAnchorId): D97DialogueIntent {
  switch (effect.kind) {
    case "offerQuest":
      return { type: "D97_ACCEPT_QUEST", payload: { questId: effect.questId, anchorId } };
    case "advanceQuest":
      return {
        type: "D97_ADVANCE_QUEST",
        payload: { questId: effect.questId, stepId: effect.stepId, anchorId },
      };
    case "completeQuest":
      return { type: "D97_COMPLETE_QUEST", payload: { questId: effect.questId, anchorId } };
    case "giveItem":
      return { type: "D97_GIVE_ITEM", payload: { itemId: effect.itemId, anchorId } };
    case "takeItem":
      return { type: "D97_TAKE_ITEM", payload: { itemId: effect.itemId, anchorId } };
    case "openShop":
      return { type: "D97_OPEN_SHOP", payload: { anchorId } };
    case "openService":
      return { type: "D97_OPEN_SERVICE", payload: { anchorId, service: effect.service } };
    case "setFlag":
      return { type: "D97_SET_FLAG", payload: { flagId: effect.flagId, value: effect.value, anchorId } };
    case "startChallenge":
      return { type: "D97_PREVIEW_ENCOUNTER", payload: { anchorId } };
  }
}

/**
 * The effects each speaker kind may carry. Quest givers are friendly
 * characters; errands and deliveries can end at any resident who talks;
 * townsfolk offer no services and only set flags or take an errand's visit;
 * only challengers and guardians start challenges.
 */
export const LEGAL_EFFECTS: Readonly<Record<D97SpeakerKind, ReadonlySet<D97DialogueEffectKind>>> = {
  friendly: new Set([
    "offerQuest",
    "advanceQuest",
    "completeQuest",
    "giveItem",
    "takeItem",
    "openService",
    "setFlag",
  ]),
  townsfolk: new Set(["advanceQuest", "setFlag"]),
  shop: new Set(["advanceQuest", "completeQuest", "giveItem", "takeItem", "openShop", "setFlag"]),
  challenger: new Set(["startChallenge", "setFlag"]),
  guardian: new Set(["startChallenge", "setFlag"]),
};
