// Synthetic dialogue and quest content for node tests: one quest of each
// kind over a handful of test anchors, two items, a flag and a small
// dialogue module. Every id is a test UUID.

import type {
  D97DialogueContent,
  D97DialogueModule,
  D97QuestDefinition,
} from "../../content/d97/dialogue/schema";
import type { DreamAnchorKind } from "../map/definition";
import {
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  parseD97ItemId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseDreamAnchorId,
  type DreamAnchorId,
} from "../../types/identifiers";

function uuid(group: number, index: number): string {
  return `${group.toString(16).padStart(8, "0")}-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}

export const ANCHORS = {
  giver: parseDreamAnchorId(uuid(1, 1)),
  recipient: parseDreamAnchorId(uuid(1, 2)),
  townsperson: parseDreamAnchorId(uuid(1, 3)),
  challenger: parseDreamAnchorId(uuid(1, 4)),
  object: parseDreamAnchorId(uuid(1, 5)),
  otherObject: parseDreamAnchorId(uuid(1, 6)),
  shop: parseDreamAnchorId(uuid(1, 7)),
} as const;

export const ANCHOR_KINDS: ReadonlyMap<DreamAnchorId, DreamAnchorKind> = new Map<DreamAnchorId, DreamAnchorKind>([
  [ANCHORS.giver, "friendly"],
  [ANCHORS.recipient, "friendly"],
  [ANCHORS.townsperson, "townsfolk"],
  [ANCHORS.challenger, "challenger"],
  [ANCHORS.object, "object"],
  [ANCHORS.otherObject, "object"],
  [ANCHORS.shop, "shop"],
]);

export const ITEMS = { relic: parseD97ItemId(uuid(2, 1)), parcel: parseD97ItemId(uuid(2, 2)) } as const;
export const FLAG = parseD97FlagId(uuid(3, 1));

export const STEPS = {
  defeat: parseD97QuestStepId(uuid(4, 1)),
  find: parseD97QuestStepId(uuid(4, 2)),
  visit: parseD97QuestStepId(uuid(4, 3)),
  deliver: parseD97QuestStepId(uuid(4, 4)),
} as const;

export const DEFEAT_QUEST: D97QuestDefinition = {
  id: parseD97QuestId(uuid(5, 1)),
  kind: "defeat",
  title: "Defeat",
  giverAnchorId: ANCHORS.giver,
  turnInAnchorId: ANCHORS.giver,
  carriedItemIds: [],
  steps: [{ id: STEPS.defeat, kind: "defeat", anchorId: ANCHORS.challenger, description: "Defeat" }],
  reward: { kind: "essence" },
};

export const LOST_OBJECT_QUEST: D97QuestDefinition = {
  id: parseD97QuestId(uuid(5, 2)),
  kind: "lostObject",
  title: "Lost object",
  giverAnchorId: ANCHORS.giver,
  turnInAnchorId: ANCHORS.giver,
  carriedItemIds: [],
  steps: [{ id: STEPS.find, kind: "findObject", anchorId: ANCHORS.object, itemId: ITEMS.relic, description: "Find" }],
  reward: { kind: "cardChoice" },
};

export const ERRAND_QUEST: D97QuestDefinition = {
  id: parseD97QuestId(uuid(5, 3)),
  kind: "errand",
  title: "Errand",
  giverAnchorId: ANCHORS.recipient,
  turnInAnchorId: ANCHORS.recipient,
  carriedItemIds: [],
  steps: [{ id: STEPS.visit, kind: "visit", anchorId: ANCHORS.townsperson, description: "Visit" }],
  reward: { kind: "essence" },
};

export const DELIVERY_QUEST: D97QuestDefinition = {
  id: parseD97QuestId(uuid(5, 4)),
  kind: "delivery",
  title: "Delivery",
  giverAnchorId: ANCHORS.giver,
  turnInAnchorId: ANCHORS.recipient,
  carriedItemIds: [ITEMS.parcel],
  steps: [{ id: STEPS.deliver, kind: "deliver", anchorId: ANCHORS.recipient, itemId: ITEMS.parcel, description: "Deliver" }],
  reward: { kind: "essence" },
};

export const QUESTS: readonly D97QuestDefinition[] = [DEFEAT_QUEST, LOST_OBJECT_QUEST, ERRAND_QUEST, DELIVERY_QUEST];

export const NODES = {
  greet: parseD97DialogueNodeId(uuid(6, 1)),
  offer: parseD97DialogueNodeId(uuid(6, 2)),
  done: parseD97DialogueNodeId(uuid(6, 3)),
} as const;

/** A friendly giver: a greeting that sets the flag, then the delivery offer. */
export const GIVER_DIALOGUE: D97DialogueModule = {
  id: parseD97DialogueId(uuid(7, 1)),
  speaker: { name: "Giver", kind: "friendly" },
  entries: [
    { condition: { kind: "quest", questId: DELIVERY_QUEST.id, status: "completed" }, node: NODES.done },
    { node: NODES.greet },
  ],
  nodes: [
    {
      id: NODES.greet,
      lines: ["Hello."],
      choices: [{ label: "Hello.", effect: { kind: "setFlag", flagId: FLAG, value: true }, next: NODES.offer }],
    },
    {
      id: NODES.offer,
      lines: ["Carry this?"],
      choices: [
        {
          label: "Yes.",
          condition: { kind: "flag", flagId: FLAG, set: true },
          effect: { kind: "offerQuest", questId: DELIVERY_QUEST.id },
          next: null,
        },
        { label: "No.", next: null },
      ],
    },
    { id: NODES.done, lines: ["Thanks."], choices: [] },
  ],
};

export const SYNTHETIC_CONTENT: D97DialogueContent = {
  dialogues: [GIVER_DIALOGUE],
  quests: QUESTS,
  items: [
    { id: ITEMS.relic, name: "Relic" },
    { id: ITEMS.parcel, name: "Parcel" },
  ],
};
