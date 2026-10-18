// A synthetic dream catalog for act assembly tests. Every id is a test UUID,
// so no test reads a production dream. Synthetic catalog dream `index` has:
//
// - door anchors 1 (its town door), 2 (its exit door) and 3 (a free door);
// - guardian anchor 0x20 blocking door 2, the dream module's exit guardian;
// - challenger anchors 0x10 up, the first `authored` of them seated by the
//   dream module, the rest empty;
// - a waypoint, a shop with its shopkeeper, a friendly quest giver at 0x30 and
//   an object at 0x31, the target of its one quest's one step;
// - two personas.

import type { D97TilesetCategory } from "../../content/d97/dreams/tilesets";
import { defineCatalogDream, type D97DreamResident } from "../../content/d97/dreams/schema";
import {
  parseD97CharacterId,
  parseD97DialogueId,
  parseD97DreamId,
  parseD97QuestId,
  parseD97QuestStepId,
  parseD97RunSeed,
  parseD97TilesetId,
  parseDreamAnchorId,
  parseDreamMapId,
  type D97RunSeed,
  type DreamAnchorId,
} from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { D97ActAnchor, D97ActCatalog, D97ActCatalogDream, D97ActShape, D97ActStartDream } from "./types";

const hex = (value: number, width: number) => value.toString(16).padStart(width, "0");

/** Anchor `index` of synthetic catalog dream `dream`. */
export function catalogAnchor(dream: number, index: number): DreamAnchorId {
  return parseDreamAnchorId(`d9780000-${hex(dream, 4)}-4000-8000-${hex(index, 12)}`);
}

export const TOWN_DOOR = 1;
export const EXIT_DOOR = 2;
export const FREE_DOOR = 3;
export const GUARDIAN = 0x20;
export const CHALLENGER_BASE = 0x10;

/** The deck source Avatars of the synthetic catalog. */
export const DECK_SOURCES = [testAvatarId("d97-act-deck-a"), testAvatarId("d97-act-deck-b")];

export interface CatalogDreamOptions {
  readonly category: D97TilesetCategory;
  /** Challenger anchors; 4 by default. */
  readonly challengers?: number;
  /** Challenger anchors the dream module seats; 2 by default. */
  readonly authored?: number;
  /** The tileset index; the dream's own index by default. */
  readonly tileset?: number;
}

/** Synthetic catalog dream `index`. */
export function catalogDream(index: number, options: CatalogDreamOptions): D97ActCatalogDream {
  const anchor = (n: number) => catalogAnchor(index, n);
  const challengers = options.challengers ?? 4;
  const authored = options.authored ?? 2;
  const character = (n: number) => parseD97CharacterId(`d9790000-${hex(index, 4)}-4000-8000-${hex(n, 12)}`);
  const dialogue = (n: number) => parseD97DialogueId(`d97a0000-${hex(index, 4)}-4000-8000-${hex(n, 12)}`);
  const deck = { kind: "generic", deckSourceAvatarId: DECK_SOURCES[0] } as const;
  const residents: D97DreamResident[] = [
    ...Array.from({ length: authored }, (_, n): D97DreamResident => ({
      role: "challenger",
      anchorId: anchor(CHALLENGER_BASE + n),
      characterId: character(n),
      scale: "standard",
      deck,
    })),
    { role: "shop", anchorId: anchor(5), characterId: character(0x40), scale: "standard" },
    { role: "friendly", anchorId: anchor(0x30), characterId: character(0x41), scale: "standard" },
  ];
  const dream = defineCatalogDream({
    id: parseD97DreamId(`d9770000-${hex(index, 4)}-4000-8000-000000000000`),
    mapId: parseDreamMapId(`d9771000-${hex(index, 4)}-4000-8000-000000000000`),
    size: "medium",
    tilesetId: parseD97TilesetId(`d9760000-0000-4000-8000-${hex(options.tileset ?? index, 12)}`),
    topology: {
      waypointAnchorId: anchor(4),
      arrivalDoorAnchorId: anchor(TOWN_DOOR),
      exitDoorAnchorId: anchor(EXIT_DOOR),
      exitGuardianAnchorId: anchor(GUARDIAN),
      shopAnchorId: anchor(5),
    },
    town: { doorAnchorId: anchor(TOWN_DOOR), cluster: "town" },
    rooms: [],
    residents,
    personas: [
      { characterId: character(0x50), dialogueId: dialogue(0x50) },
      { characterId: character(0x51) },
    ],
    quests: [
      {
        questId: parseD97QuestId(`d97b0000-${hex(index, 4)}-4000-8000-000000000001`),
        roles: [
          { role: "giver", anchorId: anchor(0x30) },
          { role: "step", stepId: parseD97QuestStepId(`d97b1000-${hex(index, 4)}-4000-8000-000000000001`), anchorId: anchor(0x31) },
        ],
      },
    ],
  });
  const anchors: D97ActAnchor[] = [
    { id: anchor(TOWN_DOOR), kind: "door", roomId: null },
    { id: anchor(EXIT_DOOR), kind: "door", roomId: null },
    { id: anchor(FREE_DOOR), kind: "door", roomId: null },
    { id: anchor(4), kind: "waypoint", roomId: null },
    { id: anchor(5), kind: "shop", roomId: null },
    { id: anchor(GUARDIAN), kind: "guardian", roomId: null, blocksDoor: anchor(EXIT_DOOR) },
    ...Array.from({ length: challengers }, (_, n): D97ActAnchor => ({ id: anchor(CHALLENGER_BASE + n), kind: "challenger", roomId: null })),
    { id: anchor(0x30), kind: "friendly", roomId: null },
    { id: anchor(0x31), kind: "object", roomId: null },
  ];
  return { dream, category: options.category, anchors };
}

/** Five synthetic catalog dreams over four categories, the first the start dream. */
export const SYNTHETIC_ACT_DREAMS: readonly D97ActCatalogDream[] = [
  catalogDream(1, { category: "fantasy" }),
  catalogDream(2, { category: "sciFi" }),
  catalogDream(3, { category: "historic" }),
  catalogDream(4, { category: "nature" }),
  catalogDream(5, { category: "fantasy" }),
];

export const SYNTHETIC_ACT_CATALOG: D97ActCatalog = { dreams: SYNTHETIC_ACT_DREAMS, deckSourceAvatarIds: DECK_SOURCES };

/** An act shape over the synthetic catalog: three dreams of four challengers make an act. */
export const SYNTHETIC_ACT_SHAPE: D97ActShape = {
  dreams: { min: 3, max: 8 },
  challengerAnchors: { min: 12, max: 14 },
  minCategories: 3,
  minGuardianAnchors: 3,
  chokepointGuardians: 2,
  avatarGuardians: { min: 2, max: 4 },
  loopDoors: { min: 0, max: 2 },
  retryLimit: 32,
};

/** The run seed of synthetic run `n`. */
export function runSeed(n: number): D97RunSeed {
  return parseD97RunSeed(`synthetic-act-seed-${String(n)}`);
}

/** A catalog dream as a start dream. */
export function startDream(entry: D97ActCatalogDream): D97ActStartDream {
  return { dream: entry.dream, anchors: entry.anchors, personas: entry.dream.personas, quests: entry.dream.quests };
}
