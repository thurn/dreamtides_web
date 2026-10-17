// Dream occupants: a synthetic dream module's residents become occupants with
// their characters, scales and dialogue and the badges their roles derive (or
// their own); residents the validator flags are left out; the challenger
// assembly reads battle residents; a topology's anchors must exist with their
// kinds and its guardian must block its exit; dreams are found by their
// topology's anchors; and the development dream occupies every character
// anchor of its map.

import { describe, expect, it } from "vitest";
import { D97_CHALLENGERS, dreamChallengers } from "../../content/d97/challengers";
import { D97_CHARACTER_SPRITES } from "../../content/d97/characters";
import { d97DreamByAnchor } from "../../content/d97/dreams";
import { DEVELOPMENT_DREAM } from "../../content/d97/dreams/development";
import { defineDream, type D97DreamResident, type D97DreamTopology } from "../../content/d97/dreams/schema";
import {
  parseAvatarId,
  parseD97CharacterId,
  parseD97DialogueId,
  parseD97DreamId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../types/identifiers";
import { registeredDialogueCatalog } from "../dialogue/catalog";
import type { DreamAnchorKind } from "../map/definition";
import { compileDevMap } from "./dev-map";
import { dreamOccupants, validateDreamResidents, validateDreamTopology, type D97DreamResidentRegistry } from "./dream-occupants";

const id = (n: number) => `00000097-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const anchor = (n: number) => parseDreamAnchorId(id(n));
const HERO = parseD97CharacterId(id(100));
const BRUTE = parseD97CharacterId(id(101));
const UNKNOWN_CHARACTER = parseD97CharacterId(id(102));
const GREETING = parseD97DialogueId(id(200));
const UNKNOWN_DIALOGUE = parseD97DialogueId(id(201));
const AVATAR = parseAvatarId(id(300));

const KINDS: readonly DreamAnchorKind[] = ["challenger", "challenger", "guardian", "shop", "friendly", "townsfolk", "friendly", "door", "waypoint", "door"];
/** Anchor 3, the guardian, blocks anchor 8, the exit door. */
const ANCHORS = KINDS.map((kind, index) => ({ id: anchor(index + 1), kind, ...(index === 2 ? { blocksDoor: anchor(8) } : {}) }));
const TOPOLOGY: D97DreamTopology = {
  waypointAnchorId: anchor(9),
  arrivalDoorAnchorId: anchor(10),
  exitDoorAnchorId: anchor(8),
  exitGuardianAnchorId: anchor(3),
  shopAnchorId: anchor(4),
};
const REGISTRY: D97DreamResidentRegistry = {
  anchors: ANCHORS,
  characterIds: new Set([HERO, BRUTE]),
  dialogueIds: new Set([GREETING]),
};

const RESIDENTS: readonly D97DreamResident[] = [
  { role: "challenger", anchorId: anchor(1), characterId: HERO, scale: "standard", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
  { role: "challenger", anchorId: anchor(2), characterId: BRUTE, scale: "standard", badge: "prizeDuel", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
  { role: "guardian", anchorId: anchor(3), characterId: BRUTE, scale: "incarnation", deck: { kind: "avatar", avatarIds: [AVATAR] } },
  { role: "shop", anchorId: anchor(4), characterId: HERO, scale: "standard" },
  { role: "friendly", anchorId: anchor(5), characterId: HERO, scale: "standard", dialogueId: GREETING },
  { role: "townsfolk", anchorId: anchor(6), characterId: BRUTE, scale: "standard", dialogueId: GREETING },
];

const dream = (residents: readonly D97DreamResident[], topology: D97DreamTopology = TOPOLOGY) =>
  defineDream({ id: parseD97DreamId(id(400)), mapId: parseDreamMapId(id(401)), topology, residents });

describe("dreamOccupants", () => {
  const occupants = dreamOccupants(dream(RESIDENTS), REGISTRY);

  it("places each resident with its character, scale, dialogue and derived or own badge", () => {
    expect(occupants.get(anchor(1))).toEqual({ character: HERO, badge: "challenger", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(2))).toEqual({ character: BRUTE, badge: "prizeDuel", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(3))).toEqual({ character: BRUTE, badge: "boss", scale: "incarnation", dialogue: null });
    expect(occupants.get(anchor(4))).toEqual({ character: HERO, badge: "shop", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(5))).toEqual({ character: HERO, badge: null, scale: "standard", dialogue: GREETING });
    expect(occupants.get(anchor(6))).toEqual({ character: BRUTE, badge: null, scale: "standard", dialogue: GREETING });
  });

  it("leaves anchors without a resident unoccupied", () => {
    expect(occupants.has(anchor(7))).toBe(false);
    expect(occupants.size).toBe(RESIDENTS.length);
    expect(dreamOccupants(dream([]), REGISTRY).size).toBe(0);
  });

  it("assembles challengers and guardians from battle residents", () => {
    expect(dreamChallengers([dream(RESIDENTS)])).toEqual([
      { anchorId: anchor(1), characterId: HERO, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
      { anchorId: anchor(2), characterId: BRUTE, role: "challenger", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
      { anchorId: anchor(3), characterId: BRUTE, role: "guardian", deck: { kind: "avatar", avatarIds: [AVATAR] } },
    ]);
  });
});

describe("validateDreamResidents", () => {
  const rules = (residents: readonly D97DreamResident[]) =>
    validateDreamResidents(dream(residents), REGISTRY).map((finding) => [finding.rule, finding.anchorId]);

  it("passes the synthetic residents", () => {
    expect(rules(RESIDENTS)).toEqual([]);
  });

  it("reports each broken rule and leaves the flawed resident out", () => {
    const broken: readonly D97DreamResident[] = [
      { role: "shop", anchorId: anchor(99), characterId: HERO, scale: "standard" },
      { role: "shop", anchorId: anchor(8), characterId: HERO, scale: "standard" },
      { role: "friendly", anchorId: anchor(5), characterId: UNKNOWN_CHARACTER, scale: "standard" },
      { role: "townsfolk", anchorId: anchor(6), characterId: HERO, scale: "standard", dialogueId: UNKNOWN_DIALOGUE },
      { role: "friendly", anchorId: anchor(7), characterId: HERO, scale: "standard" },
      { role: "friendly", anchorId: anchor(7), characterId: BRUTE, scale: "standard" },
    ];
    expect(rules(broken)).toEqual([
      ["unknown-anchor", anchor(99)],
      ["kind-mismatch", anchor(8)],
      ["unknown-character", anchor(5)],
      ["unknown-dialogue", anchor(6)],
      ["duplicate-resident", anchor(7)],
    ]);
    expect(dreamOccupants(dream(broken), REGISTRY).size).toBe(0);
  });
});

describe("validateDreamTopology", () => {
  const rules = (topology: D97DreamTopology) =>
    validateDreamTopology(dream([], topology), ANCHORS).map((finding) => [finding.rule, finding.anchorId]);

  it("passes a topology whose anchors exist with their kinds and whose guardian blocks the exit", () => {
    expect(rules(TOPOLOGY)).toEqual([]);
  });

  it("reports missing or mis-kinded anchors and an unguarded exit", () => {
    expect(rules({ ...TOPOLOGY, waypointAnchorId: anchor(99), arrivalDoorAnchorId: anchor(4), shopAnchorId: anchor(5) })).toEqual([
      ["topology-anchor", anchor(99)],
      ["topology-anchor", anchor(4)],
      ["topology-anchor", anchor(5)],
    ]);
    expect(rules({ ...TOPOLOGY, exitDoorAnchorId: anchor(10), arrivalDoorAnchorId: anchor(8) })).toEqual([["unguarded-exit", anchor(3)]]);
  });
});

describe("d97DreamByAnchor", () => {
  const other = defineDream({
    id: parseD97DreamId(id(500)),
    mapId: parseDreamMapId(id(501)),
    topology: { waypointAnchorId: anchor(20), arrivalDoorAnchorId: anchor(21), exitDoorAnchorId: anchor(22), exitGuardianAnchorId: anchor(23), shopAnchorId: anchor(24) },
    residents: [],
  });
  const dreams = [dream([]), other];

  it("finds the dream whose topology names an anchor", () => {
    expect(d97DreamByAnchor(anchor(9), dreams)?.id).toBe(dreams[0]?.id);
    expect(d97DreamByAnchor(anchor(22), dreams)?.id).toBe(other.id);
    expect(d97DreamByAnchor(anchor(1), dreams)).toBeNull();
    expect(d97DreamByAnchor(DEVELOPMENT_DREAM.topology.waypointAnchorId)?.id).toBe(DEVELOPMENT_DREAM.id);
  });
});

describe("the development dream", () => {
  const map = compileDevMap();
  const registry: D97DreamResidentRegistry = {
    anchors: map.anchors,
    characterIds: new Set(D97_CHARACTER_SPRITES.map((recipe) => recipe.id)),
    dialogueIds: new Set(registeredDialogueCatalog().dialogues.keys()),
  };

  it("occupies exactly its map's character anchors, with the guardian at incarnation scale", () => {
    expect(validateDreamResidents(DEVELOPMENT_DREAM, registry)).toEqual([]);
    expect(validateDreamTopology(DEVELOPMENT_DREAM, map.anchors)).toEqual([]);
    const occupants = dreamOccupants(DEVELOPMENT_DREAM, registry);
    for (const { id: anchorId, kind } of map.anchors) {
      const character = ["challenger", "guardian", "shop", "friendly", "townsfolk"].includes(kind);
      expect(occupants.has(anchorId), kind).toBe(character);
    }
    const guardian = map.anchors.find((candidate) => candidate.kind === "guardian");
    expect(guardian === undefined ? null : occupants.get(guardian.id)).toMatchObject({ scale: "incarnation", badge: "boss" });
  });

  it("feeds the encounter rules' challengers", () => {
    for (const challenger of dreamChallengers([DEVELOPMENT_DREAM])) expect(D97_CHALLENGERS).toContainEqual(challenger);
  });
});
