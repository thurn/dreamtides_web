// Fixture dialogue and quests for the development dream, so browser QA can
// play a quest from offer to reward without authored dream content. Two
// plaza friendlies give quests: a lost lantern beyond the river (a card-choice
// reward) and a parcel for a third friendly (an Essence reward). The two
// townsfolk bark, reacting to a flag and to the lantern quest. The
// development dream module (src/content/d97/dreams/development.ts) places
// each speaker at its anchor. Fixture copy only.

import {
  defineDialogue,
  defineQuest,
  type D97DialogueContent,
} from "../../content/d97/dialogue/schema";
import {
  parseAvatarId,
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  parseD97ItemId,
  parseD97QuestId,
  parseD97QuestStepId,
} from "../../types/identifiers";
import { devAnchorId } from "./dev-map";

function uuid(group: string, index: number): string {
  return `d97f${group}00-0000-4000-8000-${index.toString(16).padStart(12, "0")}`;
}
const node = (index: number) => parseD97DialogueNodeId(uuid("00", index));

const LANTERN_GIVER = devAnchorId(10);
const PARCEL_GIVER = devAnchorId(11);
const PARCEL_RECIPIENT = devAnchorId(12);
const LANTERN_OBJECT = devAnchorId(14);

const LANTERN = parseD97ItemId(uuid("01", 1));
const PARCEL = parseD97ItemId(uuid("01", 2));
const MET_WREN = parseD97FlagId(uuid("02", 1));
const LANTERN_QUEST = parseD97QuestId(uuid("03", 1));
const PARCEL_QUEST = parseD97QuestId(uuid("03", 2));
const FIND_LANTERN = parseD97QuestStepId(uuid("04", 1));
const DELIVER_PARCEL = parseD97QuestStepId(uuid("04", 2));

const WREN = parseD97DialogueId(uuid("05", 1));
const BRAM = parseD97DialogueId(uuid("05", 2));
const ODA = parseD97DialogueId(uuid("05", 3));
const PIP = parseD97DialogueId(uuid("05", 4));
const MOSS = parseD97DialogueId(uuid("05", 5));

/** The development Avatar portrait the lantern giver wears (Caedryn). */
const WREN_AVATAR = parseAvatarId("9d64a4a2-3dc7-456e-9eb2-5fe3a48883c4");

const LANTERN_QUEST_DEFINITION = defineQuest({
  id: LANTERN_QUEST,
  kind: "lostObject",
  title: "The Drowned Lantern",
  giverAnchorId: LANTERN_GIVER,
  turnInAnchorId: LANTERN_GIVER,
  carriedItemIds: [],
  steps: [
    {
      id: FIND_LANTERN,
      kind: "findObject",
      anchorId: LANTERN_OBJECT,
      itemId: LANTERN,
      description: "Find the lantern by the lake, then bring it back.",
    },
  ],
  reward: { kind: "cardChoice" },
});

const PARCEL_QUEST_DEFINITION = defineQuest({
  id: PARCEL_QUEST,
  kind: "delivery",
  title: "A Parcel for Oda",
  giverAnchorId: PARCEL_GIVER,
  turnInAnchorId: PARCEL_RECIPIENT,
  carriedItemIds: [PARCEL],
  steps: [
    {
      id: DELIVER_PARCEL,
      kind: "deliver",
      anchorId: PARCEL_RECIPIENT,
      itemId: PARCEL,
      description: "Carry the parcel to Oda, south of the plaza.",
    },
  ],
  reward: { kind: "essence" },
});

const WREN_DIALOGUE = defineDialogue({
  id: WREN,
  speaker: { name: "Wren", kind: "friendly", avatarId: WREN_AVATAR },
  entries: [
    { condition: { kind: "quest", questId: LANTERN_QUEST, status: "completed" }, node: node(6) },
    { condition: { kind: "quest", questId: LANTERN_QUEST, status: "ready" }, node: node(5) },
    { condition: { kind: "quest", questId: LANTERN_QUEST, status: "active" }, node: node(4) },
    { condition: { kind: "questHeld", held: true }, node: node(7) },
    { condition: { kind: "flag", flagId: MET_WREN, set: true }, node: node(2) },
    { node: node(1) },
  ],
  nodes: [
    {
      id: node(1),
      lines: ["Oh! A walker. You startled me.", "I dropped my lantern somewhere by the lake."],
      choices: [
        { label: "What happened?", effect: { kind: "setFlag", flagId: MET_WREN, value: true }, next: node(2) },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node(2),
      lines: ["It slipped from my hand when the water sang. Would you look for it?"],
      choices: [
        { label: "I'll find it.", effect: { kind: "offerQuest", questId: LANTERN_QUEST }, next: node(3) },
        { label: "Not now.", next: null },
      ],
    },
    { id: node(3), lines: ["Thank you. It glows faintly when no one is watching."], choices: [] },
    { id: node(4), lines: ["The lake is east, past the bridge."], choices: [] },
    {
      id: node(5),
      lines: ["You found it!"],
      choices: [
        { label: "Here it is.", effect: { kind: "completeQuest", questId: LANTERN_QUEST }, next: node(6) },
        { label: "One moment.", next: null },
      ],
    },
    { id: node(6), lines: ["The plaza is brighter with it back."], choices: [] },
    { id: node(7), lines: ["You look busy. Come back when your hands are free."], choices: [] },
  ],
});

const BRAM_DIALOGUE = defineDialogue({
  id: BRAM,
  speaker: { name: "Bram", kind: "friendly" },
  entries: [
    { condition: { kind: "quest", questId: PARCEL_QUEST, status: "completed" }, node: node(13) },
    { condition: { kind: "quest", questId: PARCEL_QUEST, status: "available" }, node: node(14) },
    { node: node(12) },
  ],
  nodes: [
    {
      id: node(11),
      lines: ["This parcel is for Oda, south of here. My knees won't make the walk."],
      choices: [
        { label: "I'll carry it.", effect: { kind: "offerQuest", questId: PARCEL_QUEST }, next: node(12) },
        { label: "Not now.", next: null },
      ],
    },
    { id: node(12), lines: ["Oda waits by the south houses."], choices: [] },
    { id: node(13), lines: ["Oda wrote to say thank you."], choices: [] },
    {
      id: node(14),
      lines: ["Ah, good, a pair of legs."],
      choices: [
        { label: "Do you need something?", condition: { kind: "questHeld", held: false }, next: node(11) },
        { label: "Goodbye.", next: null },
      ],
    },
  ],
});

const ODA_DIALOGUE = defineDialogue({
  id: ODA,
  speaker: { name: "Oda", kind: "friendly" },
  entries: [
    {
      condition: { kind: "questStep", questId: PARCEL_QUEST, stepId: DELIVER_PARCEL, status: "current" },
      node: node(21),
    },
    { condition: { kind: "quest", questId: PARCEL_QUEST, status: "ready" }, node: node(22) },
    { node: node(24) },
  ],
  nodes: [
    {
      id: node(21),
      lines: ["Is that Bram's parcel?"],
      choices: [
        {
          label: "Here you are.",
          condition: { kind: "hasItem", itemId: PARCEL, held: true },
          effect: { kind: "advanceQuest", questId: PARCEL_QUEST, stepId: DELIVER_PARCEL },
          next: node(22),
        },
        { label: "Not yet.", next: null },
      ],
    },
    {
      id: node(22),
      lines: ["Thank you. Let me pay you for the walk."],
      choices: [
        { label: "Thank you.", effect: { kind: "completeQuest", questId: PARCEL_QUEST }, next: node(23) },
      ],
    },
    { id: node(23), lines: ["Safe walking."], choices: [] },
    { id: node(24), lines: ["The houses here are older than the river."], choices: [] },
  ],
});

const PIP_DIALOGUE = defineDialogue({
  id: PIP,
  speaker: { name: "Pip", kind: "townsfolk" },
  entries: [
    { condition: { kind: "flag", flagId: MET_WREN, set: true }, node: node(32) },
    { node: node(31) },
  ],
  nodes: [
    { id: node(31), lines: ["Wren's been crying by the well again."], choices: [] },
    { id: node(32), lines: ["So you've met Wren. The lake keeps what it's given."], choices: [] },
  ],
});

const MOSS_DIALOGUE = defineDialogue({
  id: MOSS,
  speaker: { name: "Moss", kind: "townsfolk" },
  entries: [
    { condition: { kind: "quest", questId: LANTERN_QUEST, status: "completed" }, node: node(42) },
    { node: node(41) },
  ],
  nodes: [
    { id: node(41), lines: ["Something glimmers out on the water at night."], choices: [] },
    { id: node(42), lines: ["The glimmer on the lake is gone."], choices: [] },
  ],
});

/** The development dream's fixture dialogue content. */
export const DEV_DIALOGUE_CONTENT: D97DialogueContent = {
  dialogues: [WREN_DIALOGUE, BRAM_DIALOGUE, ODA_DIALOGUE, PIP_DIALOGUE, MOSS_DIALOGUE],
  quests: [LANTERN_QUEST_DEFINITION, PARCEL_QUEST_DEFINITION],
  items: [
    { id: LANTERN, name: "Wren's Lantern" },
    { id: PARCEL, name: "Bram's Parcel" },
  ],
};

/** The fixture dialogue modules the development dream's residents speak. */
export const DEV_DIALOGUES = { wren: WREN, bram: BRAM, oda: ODA, pip: PIP, moss: MOSS } as const;
