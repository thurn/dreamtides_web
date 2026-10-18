// The D97 dream catalog validator (Appendix B §B2): a pure check of every
// catalog dream (src/content/d97/dreams/) against its maps' anchors, the
// character, dialogue, quest, Avatar and tileset catalogs, the size class
// tunables and the briefs beside the modules. `npm run d97:dialogue --
// validate` runs it over the catalog. Each finding names its code, its dream
// (null for a catalog-wide finding) and the offending reference, a UUID
// wherever the reference is one. Codes:
//
//   duplicate-dream      two catalog dreams share an id
//   duplicate-map        two catalog dreams play one map
//   unknown-map          the dream's or a room's map is unregistered
//   missing-brief        the dream has no `<dream-uuid>.md` brief beside it
//   unknown-tileset      the dream's tileset is not in the tileset catalog
//   size-anchors         the dream's challenger or guardian anchors (ref: the
//                        kind) fall outside its size class's bounds
//   town-cluster         no friendly anchor on the dream's map carries the
//                        town's cluster tag (ref: the town door)
//   unknown-deck         a challenger's deck source, or an incarnation, is no
//                        known Avatar
//   persona-speaker      a persona's dialogue is not a challenger's
//   unknown-quest        the dream lists a quest the quest catalog lacks
//   duplicate-quest      a quest is listed twice, by one dream or two
//   unlisted-quest       a catalog quest no catalog dream lists
//   duplicate-role       a quest names its giver, its turn-in or one step's
//                        role twice (ref: the role, or the step's UUID)
//   role-mismatch        a role's anchor is not the quest's anchor for that
//                        role, a role names a step the quest lacks, or the
//                        quest has a giver, turn-in or step with no role
//
// and the dream module rules of src/d97/overworld/dream-occupants.ts, which
// share these codes: `unknown-anchor` (a resident, the town door or a quest
// role names an anchor the dream's maps lack), `kind-mismatch`,
// `duplicate-resident`, `unknown-character` and `unknown-dialogue` (for
// residents and personas), `incarnation-speaker`, `topology-anchor` (the
// town door included), `room-door` and `unguarded-exit`.

import type { D97DialogueModule, D97QuestDefinition } from "../../content/d97/dialogue/schema";
import type { D97CatalogDream, D97DreamQuest } from "../../content/d97/dreams/schema";
import { dreamMapAnchors } from "../../rules/d97/d97-dreams";
import type {
  AvatarId,
  D97CharacterId,
  D97DialogueId,
  D97DreamId,
  D97QuestId,
  D97QuestStepId,
  D97TilesetId,
  DreamAnchorId,
  DreamMapId,
} from "../../types/identifiers";
import type { DreamAnchorDefinition } from "../map/definition";
import type { D97MapSize } from "../map/tuning";
import { validateDreamResidents, validateDreamTopology, type D97DreamRule } from "../overworld/dream-occupants";

export type D97DreamCatalogCode =
  | D97DreamRule
  | "duplicate-dream"
  | "duplicate-map"
  | "unknown-map"
  | "missing-brief"
  | "unknown-tileset"
  | "size-anchors"
  | "town-cluster"
  | "unknown-deck"
  | "persona-speaker"
  | "unknown-quest"
  | "duplicate-quest"
  | "unlisted-quest"
  | "duplicate-role"
  | "role-mismatch";

export interface D97DreamCatalogFinding {
  readonly code: D97DreamCatalogCode;
  /** The dream the finding is in, or null for a catalog-wide finding. */
  readonly dreamId: D97DreamId | null;
  /** The offending reference: a UUID, or a role or anchor kind. */
  readonly ref: string;
}

interface CountBounds {
  readonly min: number;
  readonly max: number;
}

/** The challenger and guardian anchors each size class holds (§B2). */
export type D97DreamSizeAnchors = Readonly<
  Record<D97MapSize, { readonly challenger: CountBounds; readonly guardian: CountBounds }>
>;

export interface D97DreamCatalogInput {
  readonly dreams: readonly D97CatalogDream[];
  /** A map module's anchors, or undefined for an unregistered map. */
  readonly mapAnchors: (mapId: DreamMapId) => readonly DreamAnchorDefinition[] | undefined;
  readonly characterIds: ReadonlySet<D97CharacterId>;
  readonly dialogues: ReadonlyMap<D97DialogueId, D97DialogueModule>;
  /** The catalog's quests; each must be listed by exactly one catalog dream. */
  readonly quests: ReadonlyMap<D97QuestId, D97QuestDefinition>;
  readonly avatarIds: ReadonlySet<AvatarId>;
  readonly tilesetIds: ReadonlySet<D97TilesetId>;
  /** The dreams with a brief beside their module. */
  readonly briefs: ReadonlySet<D97DreamId>;
  readonly sizeAnchors: D97DreamSizeAnchors;
}

type Report = (code: D97DreamCatalogCode, ref: string) => void;

/** Where a role stands in its quest: the giver, the turn-in, or one step. */
type RoleSlot = "giver" | "turnIn" | D97QuestStepId;

function roleSlot(role: D97DreamQuest["roles"][number]): RoleSlot {
  return role.role === "step" ? role.stepId : role.role;
}

function checkQuest(
  listed: D97DreamQuest,
  quest: D97QuestDefinition,
  anchorIds: ReadonlySet<DreamAnchorId>,
  report: Report,
): void {
  const roles = new Map<RoleSlot, DreamAnchorId>();
  for (const role of listed.roles) {
    const key = roleSlot(role);
    if (roles.has(key)) report("duplicate-role", key);
    roles.set(key, role.anchorId);
    if (!anchorIds.has(role.anchorId)) report("unknown-anchor", role.anchorId);
  }
  // Each role the quest needs, with the anchor its definition names.
  const expected = new Map<RoleSlot, DreamAnchorId>([["giver", quest.giverAnchorId]]);
  if (quest.turnInAnchorId !== quest.giverAnchorId) expected.set("turnIn", quest.turnInAnchorId);
  for (const step of quest.steps) expected.set(step.id, step.anchorId);
  for (const [key, anchorId] of roles) {
    const wanted = expected.get(key);
    if (wanted === undefined) report("role-mismatch", key === "giver" || key === "turnIn" ? anchorId : key);
    else if (wanted !== anchorId) report("role-mismatch", anchorId);
  }
  for (const [key, anchorId] of expected) {
    if (!roles.has(key)) report("role-mismatch", key === "giver" || key === "turnIn" ? anchorId : key);
  }
}

function checkDream(dream: D97CatalogDream, input: D97DreamCatalogInput, report: Report): void {
  if (!input.briefs.has(dream.id)) report("missing-brief", dream.id);
  if (!input.tilesetIds.has(dream.tilesetId)) report("unknown-tileset", dream.tilesetId);
  const missing = [dream.mapId, ...dream.rooms.map((room) => room.mapId)].filter((mapId) => input.mapAnchors(mapId) === undefined);
  for (const mapId of missing) report("unknown-map", mapId);
  if (missing.length > 0) return;

  const anchors = dreamMapAnchors(dream, input.mapAnchors);
  const anchorIds = new Set(anchors.map((anchor) => anchor.id));
  for (const finding of [
    ...validateDreamTopology(dream, anchors),
    ...validateDreamResidents(dream, { anchors, characterIds: input.characterIds, dialogues: input.dialogues }),
  ]) {
    report(finding.rule, finding.anchorId);
  }

  const townDoor = anchors.find((anchor) => anchor.id === dream.town.doorAnchorId);
  if (townDoor === undefined) report("unknown-anchor", dream.town.doorAnchorId);
  else if (townDoor.kind !== "door" || townDoor.roomId !== null) report("topology-anchor", dream.town.doorAnchorId);
  const clustered = anchors.some(
    (anchor) => anchor.kind === "friendly" && anchor.roomId === null && anchor.cluster === dream.town.cluster,
  );
  if (!clustered) report("town-cluster", dream.town.doorAnchorId);

  const bounds = input.sizeAnchors[dream.size];
  for (const kind of ["challenger", "guardian"] as const) {
    const count = anchors.filter((anchor) => anchor.kind === kind).length;
    if (count < bounds[kind].min || count > bounds[kind].max) report("size-anchors", kind);
  }

  for (const resident of dream.residents) {
    if (resident.role !== "challenger" && resident.role !== "guardian") continue;
    const avatars =
      resident.deck.kind === "generic"
        ? [resident.deck.deckSourceAvatarId]
        : resident.deck.incarnations.map((incarnation) => incarnation.avatarId);
    for (const avatarId of avatars) {
      if (!input.avatarIds.has(avatarId)) report("unknown-deck", avatarId);
    }
  }

  for (const persona of dream.personas) {
    if (!input.characterIds.has(persona.characterId)) report("unknown-character", persona.characterId);
    if (persona.dialogueId === undefined) continue;
    const module = input.dialogues.get(persona.dialogueId);
    if (module === undefined) report("unknown-dialogue", persona.dialogueId);
    else if (module.speaker.kind !== "challenger") report("persona-speaker", persona.dialogueId);
  }

  for (const listed of dream.quests) {
    const quest = input.quests.get(listed.questId);
    if (quest === undefined) report("unknown-quest", listed.questId);
    else checkQuest(listed, quest, anchorIds, report);
  }
}

/** Every finding over the dream catalog, in dream order; none means valid. */
export function validateDreamCatalog(input: D97DreamCatalogInput): D97DreamCatalogFinding[] {
  const findings: D97DreamCatalogFinding[] = [];
  const dreamIds = new Set<D97DreamId>();
  const mapIds = new Set<DreamMapId>();
  const listedQuests = new Set<D97QuestId>();
  for (const dream of input.dreams) {
    const report: Report = (code, ref) => findings.push({ code, dreamId: dream.id, ref });
    if (dreamIds.has(dream.id)) report("duplicate-dream", dream.id);
    if (mapIds.has(dream.mapId)) report("duplicate-map", dream.mapId);
    dreamIds.add(dream.id);
    mapIds.add(dream.mapId);
    for (const listed of dream.quests) {
      if (listedQuests.has(listed.questId)) report("duplicate-quest", listed.questId);
      listedQuests.add(listed.questId);
    }
    checkDream(dream, input, report);
  }
  for (const questId of input.quests.keys()) {
    if (!listedQuests.has(questId)) findings.push({ code: "unlisted-quest", dreamId: null, ref: questId });
  }
  return findings;
}
