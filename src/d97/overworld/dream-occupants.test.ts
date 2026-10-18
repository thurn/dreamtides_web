// Dream occupants: a synthetic dream module's residents become occupants with
// their characters, scales and dialogue and the badges their roles derive (or
// their own); residents the validator flags are left out; the challenger
// assembly reads battle residents; a topology's anchors must exist with their
// kinds and its guardian must block its exit; and the development dream
// occupies every character anchor of its map. An Avatar resident is drawn,
// speaks and fights as one incarnation: a run playing its first
// incarnation's Avatar meets its second in the occupant and the encounter.

import { afterEach, describe, expect, it } from "vitest";
import { dreamChallengers } from "../../content/d97/challengers";
import { D97_CHARACTER_SPRITES } from "../../content/d97/characters";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import { defineDream, incarnationFor, type D97DreamResident, type D97DreamTopology, type D97Incarnation } from "../../content/d97/dreams/schema";
import { eventRng } from "../../eventlog/rng";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import { syntheticD97Content } from "../../rules/d97/d97-content.fixtures";
import { genesisFoldState } from "../../rules/fold-state";
import { reduceGameEvent } from "../../rules/reducer";
import { ctx, event, GENESIS } from "../../rules/reducer-fixtures";
import {
  type AvatarId,
  parseAvatarId,
  parseD97CharacterId,
  parseD97DialogueId,
  parseD97DreamId,
  parseDreamAnchorId,
  parseDreamMapId,
} from "../../types/identifiers";
import { D97_DEVELOPMENT_CONTENT } from "../development-content";
import type { DreamAnchorKind } from "../map/definition";
import { compileDevMap } from "./dev-map";
import { dreamOccupants, validateDreamResidents, validateDreamTopology, type D97DreamResidentRegistry } from "./dream-occupants";

const id = (n: number) => `00000097-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
const anchor = (n: number) => parseDreamAnchorId(id(n));
const HERO = parseD97CharacterId(id(100));
const BRUTE = parseD97CharacterId(id(101));
const UNKNOWN_CHARACTER = parseD97CharacterId(id(102));
const VAELA_LOOK = parseD97CharacterId(id(103));
const TESSA_LOOK = parseD97CharacterId(id(104));
const GREETING = parseD97DialogueId(id(200));
const UNKNOWN_DIALOGUE = parseD97DialogueId(id(201));
const VAELA_LINES = parseD97DialogueId(id(202));
const TESSA_LINES = parseD97DialogueId(id(203));
const AVATAR = parseAvatarId(id(300));
const VAELA = parseAvatarId(id(301));
const TESSA = parseAvatarId(id(302));
const PLAYER = parseAvatarId(id(303));

/** A dialogue module spoken at `kind`, portraying `avatarId` when given. */
function lines(dialogueId: typeof GREETING, kind: D97DialogueModule["speaker"]["kind"], avatarId?: AvatarId): D97DialogueModule {
  return { id: dialogueId, speaker: { name: "Speaker", kind, ...(avatarId === undefined ? {} : { avatarId }) }, entries: [], nodes: [] };
}

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
  characterIds: new Set([HERO, BRUTE, VAELA_LOOK, TESSA_LOOK]),
  dialogues: new Map(
    [lines(GREETING, "friendly"), lines(VAELA_LINES, "guardian", VAELA), lines(TESSA_LINES, "guardian", TESSA)].map((module) => [module.id, module]),
  ),
};

/** An Avatar guardian at anchor 3: Vaela, or `second` when the player is Vaela. */
function avatarGuardian(second: D97Incarnation): D97DreamResident {
  return {
    role: "guardian",
    anchorId: anchor(3),
    scale: "incarnation",
    deck: { kind: "avatar", incarnations: [{ avatarId: VAELA, characterId: VAELA_LOOK, dialogueId: VAELA_LINES }, second] },
  };
}

const AVATAR_GUARDIAN = avatarGuardian({ avatarId: TESSA, characterId: TESSA_LOOK, dialogueId: TESSA_LINES });

const RESIDENTS: readonly D97DreamResident[] = [
  { role: "challenger", anchorId: anchor(1), characterId: HERO, scale: "standard", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
  { role: "challenger", anchorId: anchor(2), characterId: BRUTE, scale: "standard", badge: "prizeDuel", deck: { kind: "generic", deckSourceAvatarId: AVATAR } },
  AVATAR_GUARDIAN,
  { role: "shop", anchorId: anchor(4), characterId: HERO, scale: "standard" },
  { role: "friendly", anchorId: anchor(5), characterId: HERO, scale: "standard", dialogueId: GREETING },
  { role: "townsfolk", anchorId: anchor(6), characterId: BRUTE, scale: "standard", dialogueId: GREETING },
];

const dream = (residents: readonly D97DreamResident[], topology: D97DreamTopology = TOPOLOGY) =>
  defineDream({ id: parseD97DreamId(id(400)), mapId: parseDreamMapId(id(401)), topology, residents });

describe("dreamOccupants", () => {
  const occupants = dreamOccupants(dream(RESIDENTS), REGISTRY, PLAYER);

  it("places each resident with its character, scale, dialogue and derived or own badge", () => {
    expect(occupants.get(anchor(1))).toEqual({ character: HERO, badge: "challenger", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(2))).toEqual({ character: BRUTE, badge: "prizeDuel", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(3))).toEqual({ character: VAELA_LOOK, badge: "boss", scale: "incarnation", dialogue: VAELA_LINES });
    expect(occupants.get(anchor(4))).toEqual({ character: HERO, badge: "shop", scale: "standard", dialogue: null });
    expect(occupants.get(anchor(5))).toEqual({ character: HERO, badge: null, scale: "standard", dialogue: GREETING });
    expect(occupants.get(anchor(6))).toEqual({ character: BRUTE, badge: null, scale: "standard", dialogue: GREETING });
  });

  it("leaves anchors without a resident unoccupied", () => {
    expect(occupants.has(anchor(7))).toBe(false);
    expect(occupants.size).toBe(RESIDENTS.length);
    expect(dreamOccupants(dream([]), REGISTRY, PLAYER).size).toBe(0);
  });

  it("assembles challengers and guardians from battle residents", () => {
    expect([...dreamChallengers(dream(RESIDENTS)).values()]).toEqual(RESIDENTS.slice(0, 3));
  });
});

describe("incarnationFor", () => {
  it("is an Avatar resident's first incarnation the player is not playing", () => {
    expect(incarnationFor(AVATAR_GUARDIAN, PLAYER)).toEqual({ characterId: VAELA_LOOK, dialogueId: VAELA_LINES, avatarId: VAELA });
    expect(incarnationFor(AVATAR_GUARDIAN, VAELA)).toEqual({ characterId: TESSA_LOOK, dialogueId: TESSA_LINES, avatarId: TESSA });
    expect(incarnationFor(AVATAR_GUARDIAN, TESSA)).toEqual({ characterId: VAELA_LOOK, dialogueId: VAELA_LINES, avatarId: VAELA });
  });

  it("is a generic resident's one look with its deck source, and a civil resident's with no Avatar", () => {
    expect(incarnationFor(RESIDENTS[0], PLAYER)).toEqual({ characterId: HERO, dialogueId: null, avatarId: AVATAR });
    expect(incarnationFor(RESIDENTS[4], PLAYER)).toEqual({ characterId: HERO, dialogueId: GREETING, avatarId: null });
  });
});

describe("a run playing an Avatar guardian's first incarnation", () => {
  afterEach(() => registerD97ContentProvider(null));

  it("draws, and fights, its second incarnation", () => {
    const guarded = dream([AVATAR_GUARDIAN]);
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [VAELA], dreams: [guarded], poolSize: 40 }));
    const genesis = { ...GENESIS, mode: "d97" as const };
    const apply = (state: ReturnType<typeof genesisFoldState>, type: string, payload: Record<string, unknown>, seq: number) =>
      reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(genesis.seed, seq) }));
    const started = apply(genesisFoldState(genesis), "D97_START_RUN", { avatarId: VAELA }, 1);
    const previewed = apply(started.state, "D97_PREVIEW_ENCOUNTER", { anchorId: anchor(3) }, 2);
    expect(previewed.outcome).toBe("applied");
    const run = previewed.state.d97?.run;
    const encounter = run?.encounters[anchor(3)];
    expect(encounter?.avatarId).toBe(TESSA);
    expect(encounter?.characterId).toBe(TESSA_LOOK);
    expect(encounter?.kind).toBe("avatar");
    const occupant = dreamOccupants(guarded, REGISTRY, run!.avatarId).get(anchor(3));
    expect(occupant?.character).toBe(TESSA_LOOK);
    expect(occupant?.dialogue).toBe(TESSA_LINES);
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
    expect(dreamOccupants(dream(broken), REGISTRY, PLAYER).size).toBe(0);
  });

  it("checks every incarnation's character and dialogue, and that its dialogue portrays its Avatar", () => {
    expect(rules([avatarGuardian({ avatarId: TESSA, characterId: UNKNOWN_CHARACTER, dialogueId: TESSA_LINES })])).toEqual([["unknown-character", anchor(3)]]);
    expect(rules([avatarGuardian({ avatarId: TESSA, characterId: TESSA_LOOK, dialogueId: UNKNOWN_DIALOGUE })])).toEqual([["unknown-dialogue", anchor(3)]]);
    expect(rules([avatarGuardian({ avatarId: TESSA, characterId: TESSA_LOOK, dialogueId: VAELA_LINES })])).toEqual([["incarnation-speaker", anchor(3)]]);
    expect(rules([avatarGuardian({ avatarId: TESSA, characterId: TESSA_LOOK })])).toEqual([]);
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

describe("the development dream", () => {
  const { dream: DEVELOPMENT_DREAM, dialogue, characterSprites } = D97_DEVELOPMENT_CONTENT;
  const map = compileDevMap();
  const registry: D97DreamResidentRegistry = {
    anchors: map.anchors,
    characterIds: new Set([...D97_CHARACTER_SPRITES, ...characterSprites].map((recipe) => recipe.id)),
    dialogues: new Map(dialogue.dialogues.map((module) => [module.id, module])),
  };

  it("occupies exactly its map's character anchors, with the guardian at incarnation scale", () => {
    expect(validateDreamResidents(DEVELOPMENT_DREAM, registry)).toEqual([]);
    expect(validateDreamTopology(DEVELOPMENT_DREAM, map.anchors)).toEqual([]);
    const occupants = dreamOccupants(DEVELOPMENT_DREAM, registry, PLAYER);
    for (const { id: anchorId, kind } of map.anchors) {
      const character = ["challenger", "guardian", "shop", "friendly", "townsfolk"].includes(kind);
      expect(occupants.has(anchorId), kind).toBe(character);
    }
    const guardian = map.anchors.find((candidate) => candidate.kind === "guardian");
    expect(guardian === undefined ? null : occupants.get(guardian.id)).toMatchObject({ scale: "incarnation", badge: "boss" });
  });
});
