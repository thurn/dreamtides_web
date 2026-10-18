// The first dream's dialogue, quests and items (decision P17), written against
// the story bible (`docs/dreamtides-97/story-bible.md`) and the dream's brief
// (`../dreams/3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`), whose tone note
// applies the bible locally: plain country speech, everyone always about to
// begin the feast, a count that always stops in the same place, harvest
// sayings for opinions. The locals never name their town or valley, and
// nobody has heard of any other place.
//
// Two lost-object quests:
// - The Feast Bell (Reeve Lambert Rook, on the hall steps): find the bell's
//   tongue on the stubble terrace, down the steps off the south road, and
//   bring it back. Pays Essence.
// - The Last Sheaf (Hessa Mott, at the square's south corner): find the
//   harvest maiden in the long grass at the far end of the high field and
//   bring it back. Pays a card choice.
//
// Through-line hooks, all on conditions the schema has:
// - first meetings: Wenna, the reeve and Cobb each set a "met" flag on the
//   first conversation and greet a returning player differently;
// - quest-aware barks: every townsperson reacts to one quest or both, and
//   Cobb, Dilly and Nettie point the way while a quest's step is current;
// - the guardian's fall: Widow Marrable and Ambrose react once the ember
//   arch's guardian is beaten, an ending in its time;
// - depth: Cobb and Barnaby have a Deep bark (acts 4–5), a cold from below,
//   laughed off. Every other line reads the same in any act.
//
// Each challenger greets the player with a challenge. The guardian in the
// ember arch is Vaela, or Tessa when the player is Vaela; each speaks as
// herself.

import {
  parseAvatarId,
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  parseD97ItemId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseDreamAnchorId,
  type AvatarId,
  type D97DialogueId,
  type D97DialogueNodeId,
  type DreamAnchorId,
} from "../../../types/identifiers";
import {
  defineDialogue,
  defineQuest,
  type D97DialogueChoice,
  type D97DialogueCondition,
  type D97DialogueContent,
  type D97DialogueModule,
} from "./schema";

const node = parseD97DialogueNodeId;

// --- anchors ------------------------------------------------------------------

const HALL_STEPS = parseDreamAnchorId("8d202783-1114-45ae-af43-115eb6688d64");
const SOUTH_CORNER = parseDreamAnchorId("ee1d1483-32ee-414b-98cd-5f3788471b13");
const BELL_TONGUE_OBJECT = parseDreamAnchorId("f55a21ec-b472-4bb0-9403-3d21d4075340");
const MAIDEN_OBJECT = parseDreamAnchorId("190788a7-cf67-4903-9a5d-af1ab5607ae3");
const ARCH_GUARDIAN = parseDreamAnchorId("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d");
const HERB_LEDGE_CHALLENGER = parseDreamAnchorId("3bc16e16-b79f-4d67-8db3-5b99ccb9cdf2");
const SOUTH_ROAD_CHALLENGER = parseDreamAnchorId("bf1e576a-4b6b-4908-8fd2-3875b360dfd3");
const TERRACE_PINES_CHALLENGER = parseDreamAnchorId("7a2a2fa2-608f-4f41-81dc-659bf11bd0a2");
const TERRACE_CHALLENGER = parseDreamAnchorId("720d48ff-863e-4c8f-9354-b1431147d967");
const HIGH_FIELD_CHALLENGER = parseDreamAnchorId("457b0f96-1ecf-473d-bbec-62054dde63ec");

// --- items, flags, quests -----------------------------------------------------

const BELL_TONGUE = parseD97ItemId("81025f8b-12f7-40f6-9136-c3614455441b");
const HARVEST_MAIDEN = parseD97ItemId("905742d6-5f76-4a5c-92b3-30d2775d09d7");
const COUNTED_BY_COBB = parseD97FlagId("eb1a1dba-c183-497c-87f9-5d94105a97b4");
const MET_WENNA = parseD97FlagId("5c488fc9-0a83-4713-a0c3-74a3210aa0dc");
const MET_THE_REEVE = parseD97FlagId("9aa39ef3-bc45-45b1-b360-a2d6a35e3c63");

const FEAST_BELL = parseD97QuestId("80b95705-22a5-4c93-a4b4-a1ba7aff87f9");
const FIND_BELL_TONGUE = parseD97QuestStepId("347ec7a2-55ae-44e5-856e-f7a7eb1d2602");
const LAST_SHEAF = parseD97QuestId("64a57069-4c54-4dbb-9d4b-45b095cf9276");
const FIND_MAIDEN = parseD97QuestStepId("3a64b251-9a15-4ae2-9afd-d1eada2af014");

// --- conditions ---------------------------------------------------------------

const BELL_RUNG: D97DialogueCondition = { kind: "quest", questId: FEAST_BELL, status: "completed" };
const MAIDEN_ON_THE_TABLE: D97DialogueCondition = { kind: "quest", questId: LAST_SHEAF, status: "completed" };
const SEEKING_THE_TONGUE: D97DialogueCondition = {
  kind: "questStep",
  questId: FEAST_BELL,
  stepId: FIND_BELL_TONGUE,
  status: "current",
};
const SEEKING_THE_MAIDEN: D97DialogueCondition = {
  kind: "questStep",
  questId: LAST_SHEAF,
  stepId: FIND_MAIDEN,
  status: "current",
};
/** Whoever stood in the ember arch has stepped aside. */
const ARCH_CLEAR: D97DialogueCondition = { kind: "anchorBeaten", anchorId: ARCH_GUARDIAN, beaten: true };
/** The story bible's Deep band: the dream sits in act 4 or 5. */
const DEEP: D97DialogueCondition = { kind: "act", min: 4, max: 5 };

const FEAST_BELL_QUEST = defineQuest({
  id: FEAST_BELL,
  kind: "lostObject",
  title: "The Feast Bell",
  giverAnchorId: HALL_STEPS,
  turnInAnchorId: HALL_STEPS,
  carriedItemIds: [],
  steps: [
    {
      id: FIND_BELL_TONGUE,
      kind: "findObject",
      anchorId: BELL_TONGUE_OBJECT,
      itemId: BELL_TONGUE,
      description: "Find the bell's tongue on the stubble terrace, down the steps off the south road, and bring it to the reeve.",
    },
  ],
  reward: { kind: "essence" },
});

const LAST_SHEAF_QUEST = defineQuest({
  id: LAST_SHEAF,
  kind: "lostObject",
  title: "The Last Sheaf",
  giverAnchorId: SOUTH_CORNER,
  turnInAnchorId: SOUTH_CORNER,
  carriedItemIds: [],
  steps: [
    {
      id: FIND_MAIDEN,
      kind: "findObject",
      anchorId: MAIDEN_OBJECT,
      itemId: HARVEST_MAIDEN,
      description: "Find the harvest maiden in the long grass at the far end of the high field, and carry her back to Hessa.",
    },
  ],
  reward: { kind: "cardChoice" },
});

// --- the shopkeeper and the quest givers -------------------------------------

const WENNA_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("706a4104-0872-46a7-ba60-b08e41046137"),
  speaker: { name: "Wenna Ashdown", kind: "shop" },
  entries: [
    { condition: BELL_RUNG, node: node("96ec0f8a-5f7b-419e-bd64-e993aabff3f1") },
    { condition: { kind: "flag", flagId: MET_WENNA, set: true }, node: node("25c0b0ce-165b-40de-847e-e6c592509df5") },
    { node: node("508b1ba0-0c7c-4157-af44-4bf11bfc6f74") },
  ],
  nodes: [
    {
      id: node("508b1ba0-0c7c-4157-af44-4bf11bfc6f74"),
      lines: ["Come in off the road, love. Sit anywhere.", "That cup's the feast's first. Poured and waiting."],
      choices: [
        {
          label: "Thank you.",
          effect: { kind: "setFlag", flagId: MET_WENNA, value: true },
          next: node("a7e232ba-e3d7-4ada-877b-3a5d495e3c6f"),
        },
      ],
    },
    {
      id: node("a7e232ba-e3d7-4ada-877b-3a5d495e3c6f"),
      lines: ["Feast starts in three barrels. Four at the most.", "Till then, I've provisions, if you're the walking sort."],
      choices: [
        { label: "Show me the provisions.", effect: { kind: "openShop" }, next: null },
        { label: "I'll be moving on.", next: node("b8c94ccd-c504-414f-9d36-24943bbab65a") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("25c0b0ce-165b-40de-847e-e6c592509df5"),
      lines: ["Back in, love? Feast's not started.", "Three barrels yet. The cup's still waiting."],
      choices: [
        { label: "Show me the provisions.", effect: { kind: "openShop" }, next: null },
        { label: "I'll be moving on.", next: node("b8c94ccd-c504-414f-9d36-24943bbab65a") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("b8c94ccd-c504-414f-9d36-24943bbab65a"),
      lines: ["Before the feast? You're a little mad, then.", "Still. Mad folk need provisions for the road same as anyone."],
      choices: [
        { label: "Show me the provisions.", effect: { kind: "openShop" }, next: null },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("96ec0f8a-5f7b-419e-bd64-e993aabff3f1"),
      lines: ["You heard the bell? I near spilled the first cup.", "Two barrels now. Surely two."],
      choices: [
        { label: "Show me the provisions.", effect: { kind: "openShop" }, next: null },
        { label: "Goodbye.", next: null },
      ],
    },
  ],
});

const REEVE_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("5417bc7e-b049-4af8-8c87-f0ad20237df2"),
  speaker: { name: "Reeve Lambert Rook", kind: "friendly" },
  entries: [
    { condition: BELL_RUNG, node: node("13cd332c-c063-4e3f-8f0c-cbb4f6dc797e") },
    { condition: { kind: "quest", questId: FEAST_BELL, status: "ready" }, node: node("8bebc009-6936-449b-a67a-a705c7000692") },
    { condition: { kind: "quest", questId: FEAST_BELL, status: "active" }, node: node("81c69673-1a5d-491d-87fa-a7be6f5112ce") },
    { condition: { kind: "questHeld", held: true }, node: node("f86f18c4-1a3d-4383-85bb-ab7fac09bc2c") },
    { condition: { kind: "flag", flagId: MET_THE_REEVE, set: true }, node: node("8f9473c5-26c0-4451-aaf6-ae7450f1a0b3") },
    { node: node("92041228-af89-4b36-87ae-f4c1f683772f") },
  ],
  nodes: [
    {
      id: node("92041228-af89-4b36-87ae-f4c1f683772f"),
      lines: ["Evening. I'm reeve here.", "The feast starts at the bell. It always has."],
      choices: [
        {
          label: "When does the bell ring?",
          effect: { kind: "setFlag", flagId: MET_THE_REEVE, value: true },
          next: node("cc9a8935-26ed-467d-bf15-cdf6d0264a5f"),
        },
        { label: "Goodbye.", effect: { kind: "setFlag", flagId: MET_THE_REEVE, value: true }, next: null },
      ],
    },
    {
      id: node("8f9473c5-26c0-4451-aaf6-ae7450f1a0b3"),
      lines: ["Evening again. The bell's still quiet."],
      choices: [
        { label: "What's wrong with it?", next: node("cc9a8935-26ed-467d-bf15-cdf6d0264a5f") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("cc9a8935-26ed-467d-bf15-cdf6d0264a5f"),
      lines: ["It's lost its tongue.", "The boys rang it so hard it flew clean over the roofs. I'm certain of it."],
      choices: [
        { label: "I'll look for it.", effect: { kind: "offerQuest", questId: FEAST_BELL }, next: node("87d06a43-b460-46f2-ae4e-3dbecc6a0c75") },
        { label: "Not now.", next: null },
      ],
    },
    {
      id: node("87d06a43-b460-46f2-ae4e-3dbecc6a0c75"),
      lines: ["Good. Try the stubble terrace, down the steps off the south road.", "Bring it straight to me. Nobody rings that bell but the reeve."],
      choices: [],
    },
    {
      id: node("81c69673-1a5d-491d-87fa-a7be6f5112ce"),
      lines: ["No tongue yet? The stubble terrace, down the steps."],
      choices: [],
    },
    {
      id: node("8bebc009-6936-449b-a67a-a705c7000692"),
      lines: ["Is that it? Let me see it."],
      choices: [
        { label: "Here it is.", effect: { kind: "completeQuest", questId: FEAST_BELL }, next: node("bf60187d-7674-4746-b26f-25c7d91760a4") },
        { label: "One moment.", next: null },
      ],
    },
    {
      id: node("bf60187d-7674-4746-b26f-25c7d91760a4"),
      lines: ["There. One ring, as is proper.", "Hear them cheer. It'll be dark soon enough."],
      choices: [],
    },
    {
      id: node("13cd332c-c063-4e3f-8f0c-cbb4f6dc797e"),
      lines: ["The bell's rung. The feast will start directly.", "Any moment now."],
      choices: [],
    },
    {
      id: node("f86f18c4-1a3d-4383-85bb-ab7fac09bc2c"),
      lines: ["You're on someone's errand already.", "Finish it first. That's only proper."],
      choices: [],
    },
  ],
});

const HESSA_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("80f9759f-103e-4ef3-aa4d-60250c975da8"),
  speaker: { name: "Hessa Mott", kind: "friendly" },
  entries: [
    { condition: MAIDEN_ON_THE_TABLE, node: node("5de5b552-5675-4953-9146-dc16c02c63e0") },
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "ready" }, node: node("78835dd0-0933-42fa-8c1f-7fb83f2c8e40") },
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "active" }, node: node("bd393a4e-9499-4cf8-a5cd-88e7e68a1ee0") },
    { condition: { kind: "questHeld", held: true }, node: node("e0b0695e-2972-4de4-beb9-c9887569395e") },
    { node: node("b8cbcaec-aa4b-4c01-8c22-d4f95daaacf7") },
  ],
  nodes: [
    {
      id: node("b8cbcaec-aa4b-4c01-8c22-d4f95daaacf7"),
      lines: ["You're not from round here. Good. The rest of them talk too much."],
      choices: [
        { label: "Why aren't you at the feast?", next: node("76978662-c002-4b58-a7bd-7bbdabb45379") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("76978662-c002-4b58-a7bd-7bbdabb45379"),
      lines: [
        "The last sheaf gets plaited into a maiden and carried to the feast.",
        "Mine blew off in a gust. The only wind all evening.",
      ],
      choices: [
        { label: "I'll find her.", effect: { kind: "offerQuest", questId: LAST_SHEAF }, next: node("27f4958e-6a24-46ec-87e6-588d1bc40b7f") },
        { label: "Not now.", next: null },
      ],
    },
    {
      id: node("27f4958e-6a24-46ec-87e6-588d1bc40b7f"),
      lines: ["She went north, over the roofs. Bring her back whole."],
      choices: [],
    },
    {
      id: node("bd393a4e-9499-4cf8-a5cd-88e7e68a1ee0"),
      lines: ["Up the barrel lane, at the far end of the high field.", "She'll be caught in the long grass."],
      choices: [],
    },
    {
      id: node("78835dd0-0933-42fa-8c1f-7fb83f2c8e40"),
      lines: ["You found her. Not a straw out of place."],
      choices: [
        { label: "Here she is.", effect: { kind: "completeQuest", questId: LAST_SHEAF }, next: node("7a586366-5245-439c-b0fe-638ca9e9f768") },
        { label: "One moment.", next: null },
      ],
    },
    {
      id: node("7a586366-5245-439c-b0fe-638ca9e9f768"),
      lines: ["I'll set her on the feast table myself.", "The last sheaf carries the luck. Take a little with you."],
      choices: [],
    },
    {
      id: node("5de5b552-5675-4953-9146-dc16c02c63e0"),
      lines: ["She's on the table. Now I wait like everyone else."],
      choices: [],
    },
    {
      id: node("e0b0695e-2972-4de4-beb9-c9887569395e"),
      lines: ["Your hands look full. Come back when they're empty."],
      choices: [],
    },
  ],
});

// --- townsfolk ----------------------------------------------------------------

const PELL_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("7c6d41cd-aef7-43a2-b345-d7a103f1276d"),
  speaker: { name: "Pell", kind: "townsfolk" },
  entries: [
    { condition: BELL_RUNG, node: node("40dcf405-ea1a-4209-815e-29a1f389b043") },
    { node: node("11ebe1c0-2f4b-4818-bc37-232481b3ce81") },
  ],
  nodes: [
    {
      id: node("11ebe1c0-2f4b-4818-bc37-232481b3ce81"),
      lines: ["Bread's nearly done. It's been nearly done a good while.", "Rises lovely. Just won't stop."],
      choices: [],
    },
    {
      id: node("40dcf405-ea1a-4209-815e-29a1f389b043"),
      lines: ["The bell rang and I near took the loaves out.", "Not yet, though. Never ring before the bread's out."],
      choices: [],
    },
  ],
});

const AMBROSE_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("cd210634-53d8-46ef-b0b5-b28842efea64"),
  speaker: { name: "Ambrose Finch", kind: "townsfolk" },
  entries: [
    { condition: ARCH_CLEAR, node: node("b042032e-69b5-497c-bca6-3a00717728c8") },
    { condition: MAIDEN_ON_THE_TABLE, node: node("d25e49e0-dc5d-48af-b51a-c873f8ce68c6") },
    { condition: BELL_RUNG, node: node("e1978dd3-56a9-40b7-81e4-6c702a201b0b") },
    { node: node("7179c183-07ae-4e06-a3a5-4bdc685752af") },
  ],
  nodes: [
    {
      id: node("7179c183-07ae-4e06-a3a5-4bdc685752af"),
      lines: ["One string. Nearly there.", "I'll play the moment it's right. You'll hear it."],
      choices: [],
    },
    {
      id: node("e1978dd3-56a9-40b7-81e4-6c702a201b0b"),
      lines: ["Bell's in tune, at least. That makes one of us."],
      choices: [],
    },
    {
      id: node("d25e49e0-dc5d-48af-b51a-c873f8ce68c6"),
      lines: ["Hessa's maiden is on the table. That's luck for a tune.", "String's still not right, mind."],
      choices: [],
    },
    {
      id: node("b042032e-69b5-497c-bca6-3a00717728c8"),
      lines: ["The arch is clear. The sun'll want a tune to go down by.", "Best get this string right, then."],
      choices: [],
    },
  ],
});

const DILLY_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("3587dbec-5710-470b-a11a-24ec86b2eb43"),
  speaker: { name: "Dilly Sorrel", kind: "townsfolk" },
  entries: [
    { condition: MAIDEN_ON_THE_TABLE, node: node("f4dfc953-6da3-4e4a-bdef-ef2a09be0760") },
    { condition: SEEKING_THE_MAIDEN, node: node("5572d94a-0ca7-4868-b62b-044014d61baa") },
    { node: node("4f5d6c81-1ee5-474c-896f-4a3dc8328cd6") },
  ],
  nodes: [
    {
      id: node("4f5d6c81-1ee5-474c-896f-4a3dc8328cd6"),
      lines: ["Forty-one, forty-two, forty-three…", "Oh. Lost it again. It's always forty-three."],
      choices: [],
    },
    {
      id: node("5572d94a-0ca7-4868-b62b-044014d61baa"),
      lines: ["Hessa's maiden? I saw straw fly over.", "Into the long grass, at the far end of the field."],
      choices: [],
    },
    {
      id: node("f4dfc953-6da3-4e4a-bdef-ef2a09be0760"),
      lines: ["Forty-three sheaves and a maiden. That's forty-four!", "No. Forty-three."],
      choices: [],
    },
  ],
});

const MARRABLE_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("6dc4ea8c-68a6-4c2f-9a9e-0dae97fa8b6a"),
  speaker: { name: "Widow Marrable", kind: "townsfolk" },
  entries: [
    { condition: ARCH_CLEAR, node: node("55b2320c-a79b-41c5-91f8-6e87ce1a3c10") },
    { condition: BELL_RUNG, node: node("90cde26f-1ef4-4f23-a24b-e9a4541cf4bd") },
    { node: node("99f04f01-3ed4-48c9-9047-09463945c855") },
  ],
  nodes: [
    {
      id: node("99f04f01-3ed4-48c9-9047-09463945c855"),
      lines: ["I've laid an extra place. For whoever comes in from the dark."],
      choices: [
        { label: "What dark?", next: node("03804b8c-54ae-44c3-85e7-a78abe697283") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("03804b8c-54ae-44c3-85e7-a78abe697283"),
      lines: ["It comes, love. Evenings end. Even this one."],
      choices: [],
    },
    {
      id: node("90cde26f-1ef4-4f23-a24b-e9a4541cf4bd"),
      lines: ["So the bell's rung. And the sun sits there still.", "I'll keep the place laid."],
      choices: [],
    },
    {
      id: node("55b2320c-a79b-41c5-91f8-6e87ce1a3c10"),
      lines: ["The arch is clear, then. The sun can go down when it likes.", "Told them it would come. I'll light the lamp."],
      choices: [],
    },
  ],
});

const COBB_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("a4626bec-bc61-4e09-be5d-0f67b9bc2948"),
  speaker: { name: "Cobb", kind: "townsfolk" },
  entries: [
    { condition: SEEKING_THE_TONGUE, node: node("1e08121a-991f-4924-a985-ff10ff4d03ec") },
    {
      condition: { kind: "all", conditions: [{ kind: "flag", flagId: COUNTED_BY_COBB, set: true }, DEEP] },
      node: node("2bccafd7-1532-4e4d-a01b-d6d9d91acb69"),
    },
    { condition: { kind: "flag", flagId: COUNTED_BY_COBB, set: true }, node: node("4c3b5065-6dfa-4f0d-9517-33b4abd462db") },
    { node: node("b8051649-ff84-454a-ad93-01c126e25565") },
  ],
  nodes: [
    {
      id: node("b8051649-ff84-454a-ad93-01c126e25565"),
      lines: ["Hold there. I count every crossing."],
      choices: [
        {
          label: "Count me, then.",
          effect: { kind: "setFlag", flagId: COUNTED_BY_COBB, value: true },
          next: node("4c3b5065-6dfa-4f0d-9517-33b4abd462db"),
        },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("4c3b5065-6dfa-4f0d-9517-33b4abd462db"),
      lines: [
        "That's you counted. Same tally as ever, somehow.",
        "There's the steps down to the stubble terrace, and the barrel lane up the hill.",
        "And the ledge past the arch, where the herb-woman sits. Nobody counts that one.",
      ],
      choices: [],
    },
    {
      id: node("1e08121a-991f-4924-a985-ff10ff4d03ec"),
      lines: [
        "The bell's tongue? It came over the roofs and down past me.",
        "Down the steps, to the stubble terrace. I counted it, but nobody went after it.",
      ],
      choices: [],
    },
    {
      id: node("2bccafd7-1532-4e4d-a01b-d6d9d91acb69"),
      lines: ["Counted you again. Same tally.", "Water's running backward under the bridge tonight. Don't tell the reeve."],
      choices: [],
    },
  ],
});

// The inn's two townsfolk, in the tap room.

const BARNABY_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("7b874651-f996-450a-a0e1-b1156cba8bd7"),
  speaker: { name: "Barnaby Thatch", kind: "townsfolk" },
  entries: [
    { condition: BELL_RUNG, node: node("0a20d24d-4142-4335-a7a4-8882294a82d5") },
    { condition: DEEP, node: node("e2f91793-2fe0-4b5f-a846-129cb8d05f6a") },
    { node: node("d3dadbc6-40a4-461e-a026-7e5c83aee587") },
  ],
  nodes: [
    {
      id: node("d3dadbc6-40a4-461e-a026-7e5c83aee587"),
      lines: ["Full cup, and not a drop gone. Not till the bell.", "Never drink before the bell. My father's rule, and his father's."],
      choices: [],
    },
    {
      id: node("0a20d24d-4142-4335-a7a4-8882294a82d5"),
      lines: ["Bell's rung. Now there's the toast to wait on.", "Wenna gives the toast. Wenna's not ready."],
      choices: [],
    },
    {
      id: node("e2f91793-2fe0-4b5f-a846-129cb8d05f6a"),
      lines: ["Hearth won't catch tonight. Cold coming up through the boards.", "Never mind. The cup'll warm me. At the bell."],
      choices: [],
    },
  ],
});

const NETTIE_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("aaf76df0-3777-4d9e-b9bf-b631f27c0091"),
  speaker: { name: "Nettie Furrow", kind: "townsfolk" },
  entries: [
    { condition: MAIDEN_ON_THE_TABLE, node: node("0bb6f9de-58d6-402f-b394-f74eed40fa92") },
    { condition: SEEKING_THE_MAIDEN, node: node("eaa0d615-b82f-4547-a8e9-122e20396074") },
    { node: node("a55a7b9b-0b5c-4b31-b0b5-e3b7ef570cb2") },
  ],
  nodes: [
    {
      id: node("a55a7b9b-0b5c-4b31-b0b5-e3b7ef570cb2"),
      lines: ["Wenna said set the cups out. So I set them out.", "Then she said set them out again."],
      choices: [],
    },
    {
      id: node("eaa0d615-b82f-4547-a8e9-122e20396074"),
      lines: ["Hessa's lost her maiden? She'll be cross as a wet hen.", "Try north. Everything blows north here."],
      choices: [],
    },
    {
      id: node("0bb6f9de-58d6-402f-b394-f74eed40fa92"),
      lines: ["Hessa's maiden is on the feast table now.", "I moved a cup for her. Just the one."],
      choices: [],
    },
  ],
});

// --- challengers and the guardian --------------------------------------------

/** The challenge and the refusal every opponent's greeting offers. */
function challengeChoices(accept: string, decline: string): readonly D97DialogueChoice[] {
  return [
    { label: accept, effect: { kind: "startChallenge" }, next: null },
    { label: decline, next: null },
  ];
}

/** An opponent's greeting with a challenge, and its line once beaten at `anchorId`. */
function opponentDialogue(args: {
  readonly id: D97DialogueId;
  readonly name: string;
  readonly kind: "challenger" | "guardian";
  readonly anchorId: DreamAnchorId;
  readonly greetId: D97DialogueNodeId;
  readonly beatenId: D97DialogueNodeId;
  readonly greeting: readonly string[];
  readonly accept: string;
  readonly decline: string;
  readonly beaten: readonly string[];
  readonly avatarId?: AvatarId;
}): D97DialogueModule {
  return defineDialogue({
    id: args.id,
    speaker: { name: args.name, kind: args.kind, ...(args.avatarId === undefined ? {} : { avatarId: args.avatarId }) },
    entries: [
      { condition: { kind: "anchorBeaten", anchorId: args.anchorId, beaten: true }, node: args.beatenId },
      { node: args.greetId },
    ],
    nodes: [
      { id: args.greetId, lines: args.greeting, choices: challengeChoices(args.accept, args.decline) },
      { id: args.beatenId, lines: args.beaten, choices: [] },
    ],
  });
}

const GARROW_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("a141e172-6b7c-4e26-9f43-c6e3b6ac98ca"),
  name: "Garrow",
  kind: "challenger",
  anchorId: SOUTH_ROAD_CHALLENGER,
  greetId: node("8fbb7d05-b1b9-47d9-b389-c80c0b9a14cf"),
  beatenId: node("3439431f-e02d-471e-b4f4-b9d3251e43cc"),
  greeting: ["One, two. One, two. That's how a floor gets threshed.", "Fancy a hand? Keep the beat if you can."],
  accept: "Deal me in.",
  decline: "Not now.",
  beaten: ["You kept the beat better than me. Fair harvest to you."],
});

const SCARECROW_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("789835da-d2ce-475b-8139-3812e5093315"),
  name: "The Scarecrow",
  kind: "challenger",
  anchorId: TERRACE_CHALLENGER,
  greetId: node("3d8f12a4-3255-4e67-9d40-8e6dad03bee2"),
  beatenId: node("0af75dd1-d7c9-48d5-9dd2-895d255d8d23"),
  greeting: ["…", "Play."],
  accept: "All right.",
  decline: "Another time.",
  beaten: ["Back up the pole, then."],
});

const OSWIN_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("29565050-7be1-4e5a-be84-093b12406c71"),
  name: "Oswin Marl",
  kind: "challenger",
  anchorId: HIGH_FIELD_CHALLENGER,
  greetId: node("5d75a426-8a60-41a3-bd69-d1aea286b27f"),
  beatenId: node("b647406a-ada1-4171-80d3-22c0dc403cec"),
  greeting: ["The reeve wants a tally of everything before the feast. Everything.", "Your cards, then. I'll tally them as we play."],
  accept: "Tally away.",
  decline: "Not now.",
  beaten: ["Recorded. A loss, in my own hand."],
});

const YARROW_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("b5993bae-424b-43b7-8ff6-ddc42cc7b955"),
  name: "Mother Yarrow",
  kind: "challenger",
  anchorId: HERB_LEDGE_CHALLENGER,
  greetId: node("b969ab05-fccc-4ca7-8c64-f02d7f592b45"),
  beatenId: node("82620df5-d691-47e6-87b7-73b301fdc621"),
  greeting: ["Ha! Another one up on my ledge with nowhere to be.", "Sit, sit. Thyme for luck and rue for losing. Which will you get?"],
  accept: "Let's see.",
  decline: "Not now.",
  beaten: ["Well! The herbs never told me that. How funny."],
});

const JORY_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("6fbef6bc-a6b4-4a4f-a6e5-d802f183513f"),
  name: "Jory Hewitt",
  kind: "challenger",
  anchorId: TERRACE_PINES_CHALLENGER,
  greetId: node("8faec48a-3f83-4f51-828d-fddea3ffac35"),
  beatenId: node("a0a38372-f26d-4695-8191-f0d1484c21ca"),
  greeting: ["I split wood and I play straight.", "You'll get a fair game off me."],
  accept: "A fair game, then.",
  decline: "Not now.",
  beaten: ["Fair's fair. You beat me clean."],
});

const VAELA_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("f2ccc27d-bb93-4ae4-b834-e679a898cdd5"),
  name: "Vaela",
  kind: "guardian",
  anchorId: ARCH_GUARDIAN,
  avatarId: parseAvatarId("60bd584b-5bc8-4ee7-8a98-cbb304eb71ab"),
  greetId: node("d240a5b0-2d09-40f3-8e9a-84f1fc261c0b"),
  beatenId: node("f2f8d288-a84c-408e-aca9-bfd4cdeeed98"),
  greeting: ["Another walker who wants the sun to set.", "I hold this arch, and I test whoever comes. Get past me, if you can."],
  accept: "Then I will.",
  decline: "Not yet.",
  beaten: ["Go on, then. Let it get dark."],
});

const TESSA_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("6359068e-4ff9-40b4-8e29-c0425f2859d1"),
  name: "Tessa",
  kind: "guardian",
  anchorId: ARCH_GUARDIAN,
  avatarId: parseAvatarId("ba973428-6d90-4847-b779-cb7e25a5ac84"),
  greetId: node("e75a06d8-e2a8-48de-a3f3-6ad0a048c784"),
  beatenId: node("98822023-e041-49cd-8748-0d297c8d030c"),
  greeting: ["The field's cut. I glean what's left, and I hold this arch.", "Show me your hand, walker. Then we'll see about the sun."],
  accept: "Deal me in.",
  decline: "Not yet.",
  beaten: ["Gleaned clean. Go on, then. Let the evening end."],
});

export const FIRST_DREAM_DIALOGUES = {
  wenna: WENNA_DIALOGUE.id,
  reeve: REEVE_DIALOGUE.id,
  hessa: HESSA_DIALOGUE.id,
  pell: PELL_DIALOGUE.id,
  ambrose: AMBROSE_DIALOGUE.id,
  dilly: DILLY_DIALOGUE.id,
  marrable: MARRABLE_DIALOGUE.id,
  cobb: COBB_DIALOGUE.id,
  barnaby: BARNABY_DIALOGUE.id,
  nettie: NETTIE_DIALOGUE.id,
  garrow: GARROW_DIALOGUE.id,
  scarecrow: SCARECROW_DIALOGUE.id,
  oswin: OSWIN_DIALOGUE.id,
  yarrow: YARROW_DIALOGUE.id,
  jory: JORY_DIALOGUE.id,
  vaela: VAELA_DIALOGUE.id,
  tessa: TESSA_DIALOGUE.id,
} as const;

/** The first dream's dialogue content. */
export const FIRST_DREAM_DIALOGUE_CONTENT: D97DialogueContent = {
  dialogues: [
    WENNA_DIALOGUE,
    REEVE_DIALOGUE,
    HESSA_DIALOGUE,
    PELL_DIALOGUE,
    AMBROSE_DIALOGUE,
    DILLY_DIALOGUE,
    MARRABLE_DIALOGUE,
    COBB_DIALOGUE,
    BARNABY_DIALOGUE,
    NETTIE_DIALOGUE,
    GARROW_DIALOGUE,
    SCARECROW_DIALOGUE,
    OSWIN_DIALOGUE,
    YARROW_DIALOGUE,
    JORY_DIALOGUE,
    VAELA_DIALOGUE,
    TESSA_DIALOGUE,
  ],
  quests: [FEAST_BELL_QUEST, LAST_SHEAF_QUEST],
  items: [
    { id: BELL_TONGUE, name: "The Bell's Tongue" },
    { id: HARVEST_MAIDEN, name: "The Harvest Maiden" },
  ],
};
