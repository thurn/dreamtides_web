// The dream catalog validator over a synthetic catalog: a clean medium dream
// with a room, a town, residents, a persona and a quest validates clean, and
// each broken reference reports its code and the offending UUID.

import { describe, expect, it } from "vitest";
import type { D97DialogueModule, D97QuestDefinition, D97SpeakerKind } from "../../content/d97/dialogue/schema";
import type { D97CatalogDream } from "../../content/d97/dreams/schema";
import {
  parseAvatarId,
  parseD97CharacterId,
  parseD97DialogueId,
  parseD97DreamId,
  parseD97ItemId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseD97RoomId,
  parseD97TilesetId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../types/identifiers";
import type { DreamAnchorDefinition } from "../map/definition";
import { validateDreamCatalog, type D97DreamCatalogInput, type D97DreamSizeAnchors } from "./validate";

const uuid = (n: number) => `7d3e9a10-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const anchor = (n: number) => parseDreamAnchorId(uuid(n));

const DREAM_MAP = parseDreamMapId(uuid(100));
const ROOM_MAP = parseDreamMapId(uuid(101));
const OTHER_MAP = parseDreamMapId(uuid(102));
const DREAM_ID = parseD97DreamId(uuid(200));
const OTHER_DREAM_ID = parseD97DreamId(uuid(201));
const ROOM_ID = parseD97RoomId(uuid(202));
const TILESET = parseD97TilesetId(uuid(300));
const AVATAR = parseAvatarId(uuid(301));
const RESIDENT = parseD97CharacterId(uuid(400));
const CHALLENGER = parseD97CharacterId(uuid(401));
const INCARNATION = parseD97CharacterId(uuid(402));
const SHOP_LINES = parseD97DialogueId(uuid(500));
const GIVER_LINES = parseD97DialogueId(uuid(501));
const CHALLENGER_LINES = parseD97DialogueId(uuid(502));
const QUEST = parseD97QuestId(uuid(600));
const FIND = parseD97QuestStepId(uuid(601));
const OTHER_QUEST = parseD97QuestId(uuid(602));
const ITEM = parseD97ItemId(uuid(700));
const UNKNOWN = 999;

const TOWN_DOOR = anchor(1);
const EXIT_DOOR = anchor(2);
const WAYPOINT = anchor(3);
const GUARDIAN = anchor(4);
const CHALLENGERS = [anchor(5), anchor(6), anchor(7), anchor(8)] as const;
const GIVER = anchor(9);
const OBJECT = anchor(10);
const BUILDING_DOOR = anchor(11);
const ROOM_DOOR = anchor(12);
const SHOP = anchor(13);

const MAPS: ReadonlyMap<typeof DREAM_MAP, readonly DreamAnchorDefinition[]> = new Map([
  [
    DREAM_MAP,
    [
      { id: TOWN_DOOR, kind: "door", at: [0, 0], entry: [0, 1] },
      { id: EXIT_DOOR, kind: "door", at: [9, 9], entry: [9, 8] },
      { id: WAYPOINT, kind: "waypoint", at: [1, 1] },
      { id: GUARDIAN, kind: "guardian", at: [8, 8], blocksDoor: EXIT_DOOR },
      ...CHALLENGERS.map((id, index): DreamAnchorDefinition => ({ id, kind: "challenger", at: [5, index] })),
      { id: GIVER, kind: "friendly", at: [2, 1], cluster: "square" },
      { id: OBJECT, kind: "object", at: [7, 2] },
      { id: BUILDING_DOOR, kind: "buildingDoor", at: [3, 0], entry: [3, 1] },
    ],
  ],
  [
    ROOM_MAP,
    [
      { id: ROOM_DOOR, kind: "buildingDoor", at: [0, 3], entry: [0, 2] },
      { id: SHOP, kind: "shop", at: [1, 1] },
    ],
  ],
  [OTHER_MAP, []],
]);

const generic = { kind: "generic", deckSourceAvatarId: AVATAR } as const;

const DREAM: D97CatalogDream = {
  id: DREAM_ID,
  mapId: DREAM_MAP,
  size: "medium",
  tilesetId: TILESET,
  topology: {
    waypointAnchorId: WAYPOINT,
    arrivalDoorAnchorId: TOWN_DOOR,
    exitDoorAnchorId: EXIT_DOOR,
    exitGuardianAnchorId: GUARDIAN,
    shopAnchorId: SHOP,
  },
  town: { doorAnchorId: TOWN_DOOR, cluster: "square" },
  rooms: [{ id: ROOM_ID, mapId: ROOM_MAP, buildingDoorAnchorId: BUILDING_DOOR, doorAnchorId: ROOM_DOOR }],
  residents: [
    { role: "shop", anchorId: SHOP, characterId: RESIDENT, scale: "standard", dialogueId: SHOP_LINES },
    { role: "friendly", anchorId: GIVER, characterId: RESIDENT, scale: "standard", dialogueId: GIVER_LINES },
    ...CHALLENGERS.map((anchorId) => ({
      role: "challenger" as const,
      anchorId,
      characterId: CHALLENGER,
      scale: "standard" as const,
      dialogueId: CHALLENGER_LINES,
      deck: generic,
    })),
    {
      role: "guardian",
      anchorId: GUARDIAN,
      scale: "standard",
      deck: { kind: "avatar", incarnations: [{ avatarId: AVATAR, characterId: INCARNATION }] },
    },
  ],
  personas: [{ characterId: CHALLENGER, dialogueId: CHALLENGER_LINES }],
  quests: [
    {
      questId: QUEST,
      roles: [
        { role: "giver", anchorId: GIVER },
        { role: "step", stepId: FIND, anchorId: OBJECT },
      ],
    },
  ],
};

const dialogue = (id: typeof SHOP_LINES, kind: D97SpeakerKind): D97DialogueModule => ({
  id,
  speaker: { name: "", kind },
  entries: [],
  nodes: [],
});

const QUEST_DEFINITION: D97QuestDefinition = {
  id: QUEST,
  kind: "lostObject",
  title: "",
  giverAnchorId: GIVER,
  turnInAnchorId: GIVER,
  carriedItemIds: [],
  steps: [{ id: FIND, kind: "findObject", description: "", anchorId: OBJECT, itemId: ITEM }],
  reward: { kind: "essence" },
};

const SIZE_ANCHORS: D97DreamSizeAnchors = {
  small: { challenger: { min: 2, max: 3 }, guardian: { min: 0, max: 1 } },
  medium: { challenger: { min: 4, max: 5 }, guardian: { min: 1, max: 1 } },
  large: { challenger: { min: 6, max: 8 }, guardian: { min: 1, max: 2 } },
};

const INPUT: D97DreamCatalogInput = {
  dreams: [DREAM],
  mapAnchors: (mapId) => MAPS.get(mapId),
  characterIds: new Set([RESIDENT, CHALLENGER, INCARNATION]),
  dialogues: new Map([
    [SHOP_LINES, dialogue(SHOP_LINES, "shop")],
    [GIVER_LINES, dialogue(GIVER_LINES, "friendly")],
    [CHALLENGER_LINES, dialogue(CHALLENGER_LINES, "challenger")],
  ]),
  quests: new Map([[QUEST, QUEST_DEFINITION]]),
  avatarIds: new Set([AVATAR]),
  tilesetIds: new Set([TILESET]),
  briefs: new Set([DREAM_ID]),
  sizeAnchors: SIZE_ANCHORS,
};

/** The findings' codes and references, for `dreams` over the clean input otherwise. */
function findings(overrides: Partial<D97DreamCatalogInput> = {}): [string, string][] {
  return validateDreamCatalog({ ...INPUT, ...overrides }).map((finding) => [finding.code, finding.ref]);
}

const withDream = (dream: Partial<D97CatalogDream>) => findings({ dreams: [{ ...DREAM, ...dream }] });

describe("validateDreamCatalog", () => {
  it("passes a clean catalog", () => {
    expect(findings()).toEqual([]);
  });

  it("reports anchors the dream's maps lack: a resident's, the town door's and a quest role's", () => {
    const [shop, ...rest] = DREAM.residents;
    expect(withDream({ residents: [...rest, { ...shop, anchorId: anchor(UNKNOWN) }] })).toEqual([
      ["unknown-anchor", anchor(UNKNOWN)],
    ]);
    expect(withDream({ town: { ...DREAM.town, doorAnchorId: anchor(UNKNOWN) } })).toEqual([["unknown-anchor", anchor(UNKNOWN)]]);
  });

  it("reports a quest role at an anchor the dream's maps lack", () => {
    const quests = [{ questId: QUEST, roles: [{ role: "giver" as const, anchorId: GIVER }, { role: "step" as const, stepId: FIND, anchorId: anchor(UNKNOWN) }] }];
    expect(withDream({ quests })).toEqual([
      ["unknown-anchor", anchor(UNKNOWN)],
      ["role-mismatch", anchor(UNKNOWN)],
    ]);
  });

  it("reports a role a quest names twice", () => {
    const giver = { role: "giver" as const, anchorId: GIVER };
    const step = { role: "step" as const, stepId: FIND, anchorId: OBJECT };
    expect(withDream({ quests: [{ questId: QUEST, roles: [giver, step, giver] }] })).toEqual([["duplicate-role", "giver"]]);
    expect(withDream({ quests: [{ questId: QUEST, roles: [giver, step, step] }] })).toEqual([["duplicate-role", FIND]]);
  });

  it("reports roles that disagree with the quest: a moved giver, a missing step, an unknown step, a needless turn-in", () => {
    const step = { role: "step" as const, stepId: FIND, anchorId: OBJECT };
    expect(withDream({ quests: [{ questId: QUEST, roles: [{ role: "giver", anchorId: OBJECT }, step] }] })).toEqual([
      ["role-mismatch", OBJECT],
    ]);
    expect(withDream({ quests: [{ questId: QUEST, roles: [{ role: "giver", anchorId: GIVER }] }] })).toEqual([
      ["role-mismatch", FIND],
    ]);
    const stray = parseD97QuestStepId(uuid(UNKNOWN));
    expect(
      withDream({ quests: [{ questId: QUEST, roles: [{ role: "giver", anchorId: GIVER }, step, { role: "step", stepId: stray, anchorId: OBJECT }] }] }),
    ).toEqual([["role-mismatch", stray]]);
    expect(
      withDream({ quests: [{ questId: QUEST, roles: [{ role: "giver", anchorId: GIVER }, step, { role: "turnIn", anchorId: GIVER }] }] }),
    ).toEqual([["role-mismatch", GIVER]]);
  });

  it("requires a turn-in role when the turn-in is not the giver", () => {
    const quests = new Map([[QUEST, { ...QUEST_DEFINITION, turnInAnchorId: SHOP }]]);
    expect(findings({ quests })).toEqual([["role-mismatch", SHOP]]);
    const roles = [...DREAM.quests[0].roles, { role: "turnIn" as const, anchorId: SHOP }];
    expect(findings({ quests, dreams: [{ ...DREAM, quests: [{ questId: QUEST, roles }] }] })).toEqual([]);
  });

  it("reports unknown characters, of a resident, an incarnation or a persona", () => {
    expect(findings({ characterIds: new Set([RESIDENT, INCARNATION]) })).toEqual([
      ...CHALLENGERS.map((anchorId): [string, string] => ["unknown-character", anchorId]),
      ["unknown-character", CHALLENGER],
    ]);
    expect(findings({ characterIds: new Set([RESIDENT, CHALLENGER]) })).toEqual([["unknown-character", GUARDIAN]]);
  });

  it("reports unknown dialogue, quests, decks and tilesets", () => {
    const dialogues = new Map(INPUT.dialogues);
    dialogues.delete(CHALLENGER_LINES);
    expect(findings({ dialogues })).toEqual([
      ...CHALLENGERS.map((anchorId): [string, string] => ["unknown-dialogue", anchorId]),
      ["unknown-dialogue", CHALLENGER_LINES],
    ]);
    expect(findings({ quests: new Map() })).toEqual([["unknown-quest", QUEST]]);
    expect(findings({ avatarIds: new Set() })).toEqual([
      ...CHALLENGERS.map((): [string, string] => ["unknown-deck", AVATAR]),
      ["unknown-deck", AVATAR],
    ]);
    expect(findings({ tilesetIds: new Set() })).toEqual([["unknown-tileset", TILESET]]);
  });

  it("reports a persona whose dialogue is not a challenger's", () => {
    expect(withDream({ personas: [{ characterId: CHALLENGER, dialogueId: GIVER_LINES }] })).toEqual([
      ["persona-speaker", GIVER_LINES],
    ]);
  });

  it("reports a missing brief and unregistered maps", () => {
    expect(findings({ briefs: new Set() })).toEqual([["missing-brief", DREAM_ID]]);
    const unknownMap = parseDreamMapId(uuid(UNKNOWN));
    expect(withDream({ mapId: unknownMap })).toEqual([["unknown-map", unknownMap]]);
  });

  it("reports a town door off the dream's map and a town cluster no friendly anchor carries", () => {
    expect(withDream({ town: { doorAnchorId: ROOM_DOOR, cluster: "square" } })).toEqual([["topology-anchor", ROOM_DOOR]]);
    expect(withDream({ town: { doorAnchorId: TOWN_DOOR, cluster: "plaza" } })).toEqual([["town-cluster", TOWN_DOOR]]);
  });

  it("holds the challenger and guardian anchors to the declared size class", () => {
    expect(withDream({ size: "small" })).toEqual([["size-anchors", "challenger"]]);
    expect(withDream({ size: "large" })).toEqual([["size-anchors", "challenger"]]);
  });

  it("reports duplicate dreams, shared maps, quests listed twice and catalog quests no dream lists", () => {
    const other: D97CatalogDream = { ...DREAM, id: OTHER_DREAM_ID };
    expect(findings({ dreams: [DREAM, { ...DREAM, quests: [] }], briefs: new Set([DREAM_ID]) })).toEqual([
      ["duplicate-dream", DREAM_ID],
      ["duplicate-map", DREAM_MAP],
    ]);
    expect(findings({ dreams: [DREAM, other], briefs: new Set([DREAM_ID, OTHER_DREAM_ID]) })).toEqual([
      ["duplicate-map", DREAM_MAP],
      ["duplicate-quest", QUEST],
    ]);
    const quests = new Map([...INPUT.quests, [OTHER_QUEST, { ...QUEST_DEFINITION, id: OTHER_QUEST }]]);
    expect(findings({ quests })).toEqual([["unlisted-quest", OTHER_QUEST]]);
  });
});
