// Dialogue effects as intents (decision P17): each effect a choice carries
// becomes exactly one intent event, naming the anchor of the character the
// player is speaking with. Starting a challenge is the encounter flow's own
// preview intent, `D97_PREVIEW_ENCOUNTER`. Which anchor kinds may carry which effects is the
// legality table the validator enforces.

import type {
  D97DialogueEffect,
  D97DialogueEffectKind,
  D97DialogueModule,
  D97SpeakerKind,
} from "../../content/d97/dialogue/schema";
import type { D97Intent } from "../../rules/d97/events";
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
export type D97DialogueIntent = Extract<D97Intent, { readonly type: D97DialogueEventType }>;

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

/** Whether `left` and `right` are one effect: the same kind, ids and value. */
export function sameEffect(left: D97DialogueEffect, right: D97DialogueEffect): boolean {
  switch (left.kind) {
    case "offerQuest":
    case "completeQuest":
      return right.kind === left.kind && right.questId === left.questId;
    case "advanceQuest":
      return right.kind === "advanceQuest" && right.questId === left.questId && right.stepId === left.stepId;
    case "giveItem":
    case "takeItem":
      return right.kind === left.kind && right.itemId === left.itemId;
    case "openService":
      return right.kind === "openService" && right.service === left.service;
    case "setFlag":
      return right.kind === "setFlag" && right.flagId === left.flagId && right.value === left.value;
    case "openShop":
    case "startChallenge":
      return right.kind === left.kind;
  }
}

/**
 * Whether some choice in `module` carries `effect`. The rules check an
 * effect intent against its speaker's dialogue this way: the effect must be
 * one the speaker can offer at all. Which node is showing is view state, so
 * the check does not ask whether the choice is reachable now.
 */
export function dialogueCarriesEffect(module: D97DialogueModule, effect: D97DialogueEffect): boolean {
  return module.nodes.some((node) =>
    node.choices.some((choice) => choice.effect !== undefined && sameEffect(choice.effect, effect)),
  );
}
