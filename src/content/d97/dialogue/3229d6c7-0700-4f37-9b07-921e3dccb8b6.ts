// The first dream's dialogue, quests and items (decision P17), written against
// its brief (`../dreams/3229d6c7-0700-4f37-9b07-921e3dccb8b6.md`) and its tone
// note: plain country speech, everyone always about to begin the feast, small
// wrongnesses laughed off, harvest sayings for opinions. The locals never
// name their town or valley, and nobody has heard of any other place.
//
// Two lost-object quests:
// - The Feast Bell (Reeve Tobin Rook, on the hall steps): find the bell's
//   tongue in the pine meadow and bring it back. Pays Essence.
// - The Last Sheaf (Hessa Mott, at the wheat corner): find the harvest maiden
//   at the north end of the long meadow and bring it back. Pays a card choice.
//
// The townsfolk bark and react to both quests; Cobb, the bridge-keeper,
// counts the player across (a flag) and hints at the far corners. Each
// challenger greets the player with a challenge, and the guardian, Vaela,
// stands in the ember arch.

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
  type D97DialogueContent,
  type D97DialogueModule,
} from "./schema";

const node = parseD97DialogueNodeId;

// --- anchors ------------------------------------------------------------------

const HALL_STEPS = parseDreamAnchorId("8d202783-1114-45ae-af43-115eb6688d64");
const WHEAT_CORNER = parseDreamAnchorId("ee1d1483-32ee-414b-98cd-5f3788471b13");
const BELL_TONGUE_OBJECT = parseDreamAnchorId("f55a21ec-b472-4bb0-9403-3d21d4075340");
const MAIDEN_OBJECT = parseDreamAnchorId("190788a7-cf67-4903-9a5d-af1ab5607ae3");
const ARCH_GUARDIAN = parseDreamAnchorId("649daef4-9f8b-4e0e-b3f2-3d2ab91a844d");
const TERRACES_CHALLENGER = parseDreamAnchorId("3bc16e16-b79f-4d67-8db3-5b99ccb9cdf2");
const FAR_BANK_CHALLENGER = parseDreamAnchorId("bf1e576a-4b6b-4908-8fd2-3875b360dfd3");
const STUMP_FIELD_CHALLENGER = parseDreamAnchorId("7a2a2fa2-608f-4f41-81dc-659bf11bd0a2");
const SOUTH_FIELDS_CHALLENGER = parseDreamAnchorId("720d48ff-863e-4c8f-9354-b1431147d967");
const HIGH_FIELD_CHALLENGER = parseDreamAnchorId("457b0f96-1ecf-473d-bbec-62054dde63ec");

// --- items, flags, quests -----------------------------------------------------

const BELL_TONGUE = parseD97ItemId("81025f8b-12f7-40f6-9136-c3614455441b");
const HARVEST_MAIDEN = parseD97ItemId("905742d6-5f76-4a5c-92b3-30d2775d09d7");
const COUNTED_BY_COBB = parseD97FlagId("eb1a1dba-c183-497c-87f9-5d94105a97b4");

const FEAST_BELL = parseD97QuestId("80b95705-22a5-4c93-a4b4-a1ba7aff87f9");
const FIND_BELL_TONGUE = parseD97QuestStepId("347ec7a2-55ae-44e5-856e-f7a7eb1d2602");
const LAST_SHEAF = parseD97QuestId("64a57069-4c54-4dbb-9d4b-45b095cf9276");
const FIND_MAIDEN = parseD97QuestStepId("3a64b251-9a15-4ae2-9afd-d1eada2af014");

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
      description: "Find the bell's tongue in the pine meadow, through the dry hollow, and bring it to the reeve.",
    },
  ],
  reward: { kind: "essence" },
});

const LAST_SHEAF_QUEST = defineQuest({
  id: LAST_SHEAF,
  kind: "lostObject",
  title: "The Last Sheaf",
  giverAnchorId: WHEAT_CORNER,
  turnInAnchorId: WHEAT_CORNER,
  carriedItemIds: [],
  steps: [
    {
      id: FIND_MAIDEN,
      kind: "findObject",
      anchorId: MAIDEN_OBJECT,
      itemId: HARVEST_MAIDEN,
      description: "Find the harvest maiden at the north end of the long meadow, and carry her back to Hessa.",
    },
  ],
  reward: { kind: "cardChoice" },
});

// --- the shopkeeper and the quest givers -------------------------------------

const WENNA_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("706a4104-0872-46a7-ba60-b08e41046137"),
  speaker: { name: "Wenna Ashdown", kind: "shop" },
  entries: [
    { condition: { kind: "quest", questId: FEAST_BELL, status: "completed" }, node: node("96ec0f8a-5f7b-419e-bd64-e993aabff3f1") },
    { node: node("508b1ba0-0c7c-4157-af44-4bf11bfc6f74") },
  ],
  nodes: [
    {
      id: node("508b1ba0-0c7c-4157-af44-4bf11bfc6f74"),
      lines: [
        "Come in off the road, love. First cup's poured and waiting.",
        "Feast starts soon. Three barrels, maybe four.",
      ],
      choices: [
        { label: "What are you selling?", effect: { kind: "openShop" }, next: null },
        { label: "Leaving before the feast?", next: node("b8c94ccd-c504-414f-9d36-24943bbab65a") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("b8c94ccd-c504-414f-9d36-24943bbab65a"),
      lines: [
        "Leaving? Before the feast? You're a little mad, then.",
        "Still. Mad folk need provisions for the road same as anyone.",
      ],
      choices: [
        { label: "Show me the provisions.", effect: { kind: "openShop" }, next: null },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("96ec0f8a-5f7b-419e-bd64-e993aabff3f1"),
      lines: ["You heard the bell? I near spilled the first cup.", "Two barrels now. Surely two."],
      choices: [
        { label: "What are you selling?", effect: { kind: "openShop" }, next: null },
        { label: "Goodbye.", next: null },
      ],
    },
  ],
});

const TOBIN_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("5417bc7e-b049-4af8-8c87-f0ad20237df2"),
  speaker: { name: "Reeve Tobin Rook", kind: "friendly" },
  entries: [
    { condition: { kind: "quest", questId: FEAST_BELL, status: "completed" }, node: node("13cd332c-c063-4e3f-8f0c-cbb4f6dc797e") },
    { condition: { kind: "quest", questId: FEAST_BELL, status: "ready" }, node: node("8bebc009-6936-449b-a67a-a705c7000692") },
    { condition: { kind: "quest", questId: FEAST_BELL, status: "active" }, node: node("81c69673-1a5d-491d-87fa-a7be6f5112ce") },
    { condition: { kind: "questHeld", held: true }, node: node("f86f18c4-1a3d-4383-85bb-ab7fac09bc2c") },
    { node: node("92041228-af89-4b36-87ae-f4c1f683772f") },
  ],
  nodes: [
    {
      id: node("92041228-af89-4b36-87ae-f4c1f683772f"),
      lines: ["Evening. You'll be stopping for the feast.", "It starts at the bell. It always has."],
      choices: [
        { label: "When does the bell ring?", next: node("cc9a8935-26ed-467d-bf15-cdf6d0264a5f") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("cc9a8935-26ed-467d-bf15-cdf6d0264a5f"),
      lines: [
        "It can't. It's lost its tongue.",
        "The boys rang it so hard it flew clean over the river. I'm certain of it.",
      ],
      choices: [
        { label: "I'll look for it.", effect: { kind: "offerQuest", questId: FEAST_BELL }, next: node("87d06a43-b460-46f2-ae4e-3dbecc6a0c75") },
        { label: "Not now.", next: null },
      ],
    },
    {
      id: node("87d06a43-b460-46f2-ae4e-3dbecc6a0c75"),
      lines: [
        "Good. Try the pine meadow, through the dry hollow below the south fields.",
        "Bring it straight to me. Nobody rings that bell but the reeve.",
      ],
      choices: [],
    },
    {
      id: node("81c69673-1a5d-491d-87fa-a7be6f5112ce"),
      lines: ["No tongue yet? The pine meadow. Through the dry hollow, past the south fields."],
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
      lines: ["You've an errand in hand already. One at a time; that's the rule."],
      choices: [],
    },
  ],
});

const HESSA_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("80f9759f-103e-4ef3-aa4d-60250c975da8"),
  speaker: { name: "Hessa Mott", kind: "friendly" },
  entries: [
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "completed" }, node: node("5de5b552-5675-4953-9146-dc16c02c63e0") },
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "ready" }, node: node("78835dd0-0933-42fa-8c1f-7fb83f2c8e40") },
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "active" }, node: node("bd393a4e-9499-4cf8-a5cd-88e7e68a1ee0") },
    { condition: { kind: "questHeld", held: true }, node: node("e0b0695e-2972-4de4-beb9-c9887569395e") },
    { node: node("b8cbcaec-aa4b-4c01-8c22-d4f95daaacf7") },
  ],
  nodes: [
    {
      id: node("b8cbcaec-aa4b-4c01-8c22-d4f95daaacf7"),
      lines: ["You're not from the square. Good. They talk too much up there."],
      choices: [
        { label: "Why aren't you at the feast?", next: node("76978662-c002-4b58-a7bd-7bbdabb45379") },
        { label: "Goodbye.", next: null },
      ],
    },
    {
      id: node("76978662-c002-4b58-a7bd-7bbdabb45379"),
      lines: [
        "The last sheaf gets plaited into a maiden and carried to the feast. That's the custom.",
        "Mine blew off in a gust. The only wind all evening.",
      ],
      choices: [
        { label: "I'll find her.", effect: { kind: "offerQuest", questId: LAST_SHEAF }, next: node("27f4958e-6a24-46ec-87e6-588d1bc40b7f") },
        { label: "Not now.", next: null },
      ],
    },
    {
      id: node("27f4958e-6a24-46ec-87e6-588d1bc40b7f"),
      lines: ["She went north, up the long meadow. Bring her back whole."],
      choices: [],
    },
    {
      id: node("bd393a4e-9499-4cf8-a5cd-88e7e68a1ee0"),
      lines: ["North end of the long meadow. She'll be caught in the grass."],
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
      lines: ["She's on the table. Now I wait like everyone else, I suppose."],
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
    { condition: { kind: "quest", questId: FEAST_BELL, status: "completed" }, node: node("40dcf405-ea1a-4209-815e-29a1f389b043") },
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
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "completed" }, node: node("d25e49e0-dc5d-48af-b51a-c873f8ce68c6") },
    { condition: { kind: "quest", questId: FEAST_BELL, status: "completed" }, node: node("e1978dd3-56a9-40b7-81e4-6c702a201b0b") },
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
  ],
});

const DILLY_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("3587dbec-5710-470b-a11a-24ec86b2eb43"),
  speaker: { name: "Dilly Sorrel", kind: "townsfolk" },
  entries: [
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "completed" }, node: node("f4dfc953-6da3-4e4a-bdef-ef2a09be0760") },
    { condition: { kind: "quest", questId: LAST_SHEAF, status: "active" }, node: node("5572d94a-0ca7-4868-b62b-044014d61baa") },
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
      lines: ["Hessa's maiden? I saw straw fly north. All up the long meadow."],
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
    { condition: { kind: "quest", questId: FEAST_BELL, status: "completed" }, node: node("90cde26f-1ef4-4f23-a24b-e9a4541cf4bd") },
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
  ],
});

const COBB_DIALOGUE = defineDialogue({
  id: parseD97DialogueId("a4626bec-bc61-4e09-be5d-0f67b9bc2948"),
  speaker: { name: "Cobb", kind: "townsfolk" },
  entries: [
    { condition: { kind: "quest", questId: FEAST_BELL, status: "active" }, node: node("1e08121a-991f-4924-a985-ff10ff4d03ec") },
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
        "There's the fords downriver, and the plank bridge past the creek row.",
        "And the meadow behind the pines. Nobody crosses to that one.",
      ],
      choices: [],
    },
    {
      id: node("1e08121a-991f-4924-a985-ff10ff4d03ec"),
      lines: [
        "The pine meadow? Down the fords, along the creek row, through the south fields.",
        "Then the dry hollow. I've not counted anyone that way in a long while.",
      ],
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
  anchorId: FAR_BANK_CHALLENGER,
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
  anchorId: SOUTH_FIELDS_CHALLENGER,
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
  greeting: [
    "The reeve wants a tally of everything before the feast. Everything.",
    "Your deck, then. I'll count it as we play.",
  ],
  accept: "Count away.",
  decline: "Not now.",
  beaten: ["Recorded. A loss, in my own hand."],
});

const YARROW_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("b5993bae-424b-43b7-8ff6-ddc42cc7b955"),
  name: "Mother Yarrow",
  kind: "challenger",
  anchorId: TERRACES_CHALLENGER,
  greetId: node("b969ab05-fccc-4ca7-8c64-f02d7f592b45"),
  beatenId: node("82620df5-d691-47e6-87b7-73b301fdc621"),
  greeting: [
    "Ha! Another one wandering about as if it were still evening.",
    "Sit, sit. Thyme for luck and rue for losing. Shall we see which you get?",
  ],
  accept: "Let's see.",
  decline: "Not now.",
  beaten: ["Well! The herbs never told me that. How funny."],
});

const ALDO_DIALOGUE = opponentDialogue({
  id: parseD97DialogueId("6fbef6bc-a6b4-4a4f-a6e5-d802f183513f"),
  name: "Aldo Hewitt",
  kind: "challenger",
  anchorId: STUMP_FIELD_CHALLENGER,
  greetId: node("8faec48a-3f83-4f51-828d-fddea3ffac35"),
  beatenId: node("a0a38372-f26d-4695-8191-f0d1484c21ca"),
  greeting: ["I split wood and I play straight. You'll get a fair game."],
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
  greeting: [
    "You want the sun to go down. They all say they do.",
    "It goes through this arch when someone gets past me. Nobody has.",
  ],
  accept: "Then I will.",
  decline: "Not yet.",
  beaten: ["Go on, then. Let it get dark."],
});

export const FIRST_DREAM_DIALOGUES = {
  wenna: WENNA_DIALOGUE.id,
  tobin: TOBIN_DIALOGUE.id,
  hessa: HESSA_DIALOGUE.id,
  pell: PELL_DIALOGUE.id,
  ambrose: AMBROSE_DIALOGUE.id,
  dilly: DILLY_DIALOGUE.id,
  marrable: MARRABLE_DIALOGUE.id,
  cobb: COBB_DIALOGUE.id,
  garrow: GARROW_DIALOGUE.id,
  scarecrow: SCARECROW_DIALOGUE.id,
  oswin: OSWIN_DIALOGUE.id,
  yarrow: YARROW_DIALOGUE.id,
  aldo: ALDO_DIALOGUE.id,
  vaela: VAELA_DIALOGUE.id,
} as const;

/** The first dream's dialogue content. */
export const FIRST_DREAM_DIALOGUE_CONTENT: D97DialogueContent = {
  dialogues: [
    WENNA_DIALOGUE,
    TOBIN_DIALOGUE,
    HESSA_DIALOGUE,
    PELL_DIALOGUE,
    AMBROSE_DIALOGUE,
    DILLY_DIALOGUE,
    MARRABLE_DIALOGUE,
    COBB_DIALOGUE,
    GARROW_DIALOGUE,
    SCARECROW_DIALOGUE,
    OSWIN_DIALOGUE,
    YARROW_DIALOGUE,
    ALDO_DIALOGUE,
    VAELA_DIALOGUE,
  ],
  quests: [FEAST_BELL_QUEST, LAST_SHEAF_QUEST],
  items: [
    { id: BELL_TONGUE, name: "The Bell's Tongue" },
    { id: HARVEST_MAIDEN, name: "The Harvest Maiden" },
  ],
};
