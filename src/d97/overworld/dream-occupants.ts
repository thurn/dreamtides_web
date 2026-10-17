// A dream's occupants, as the overworld draws them: each resident of the
// dream module (src/content/d97/dreams/) at its anchor on the compiled map,
// with the badge its role derives unless it sets its own, and the validators
// that check a dream module against its map: its residents against the map's
// anchors and the character and dialogue catalogs, and its topology against
// the map's anchors. Assembly places only residents that pass validation, so
// a stale module never puts a character where its map has no such anchor.

import { derivedBadge, type D97DreamDefinition, type D97DreamResident } from "../../content/d97/dreams/schema";
import type { D97CharacterId, D97DialogueId, D97DreamId, DreamAnchorId } from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";
import type { OverworldOccupant, OverworldOccupants } from "./occupants";

export type D97DreamRule =
  /** Two residents claim one anchor. */
  | "duplicate-resident"
  /** The resident's anchor is not on the dream's map. */
  | "unknown-anchor"
  /** The resident's role is not its anchor's kind. */
  | "kind-mismatch"
  /** The resident's character has no sprite recipe. */
  | "unknown-character"
  /** The resident speaks a dialogue module the catalog does not hold. */
  | "unknown-dialogue"
  /** A topology anchor is not on the map, or is not the kind its role needs. */
  | "topology-anchor"
  /** The exit guardian does not block the exit door. */
  | "unguarded-exit";

export interface D97DreamFinding {
  readonly rule: D97DreamRule;
  readonly dreamId: D97DreamId;
  readonly anchorId: DreamAnchorId;
}

/** What the validators read of a map anchor. */
interface DreamAnchorSummary {
  readonly id: DreamAnchorId;
  readonly kind: DreamAnchorKind;
  readonly blocksDoor?: DreamAnchorId;
}

export interface D97DreamResidentRegistry {
  /** The anchors of the dream's map, with their kinds. */
  readonly anchors: readonly DreamAnchorSummary[];
  readonly characterIds: ReadonlySet<D97CharacterId>;
  readonly dialogueIds: ReadonlySet<D97DialogueId>;
}

/** Every finding for `dream`'s residents against `registry`, in resident order. */
export function validateDreamResidents(
  dream: D97DreamDefinition,
  registry: D97DreamResidentRegistry,
): D97DreamFinding[] {
  const kinds = new Map(registry.anchors.map((anchor) => [anchor.id, anchor.kind]));
  const seen = new Set<DreamAnchorId>();
  const findings: D97DreamFinding[] = [];
  for (const resident of dream.residents) {
    const report = (rule: D97DreamRule) => findings.push({ rule, dreamId: dream.id, anchorId: resident.anchorId });
    if (seen.has(resident.anchorId)) report("duplicate-resident");
    seen.add(resident.anchorId);
    const kind = kinds.get(resident.anchorId);
    if (kind === undefined) report("unknown-anchor");
    else if (kind !== resident.role) report("kind-mismatch");
    if (!registry.characterIds.has(resident.characterId)) report("unknown-character");
    if (resident.dialogueId !== undefined && !registry.dialogueIds.has(resident.dialogueId)) report("unknown-dialogue");
  }
  return findings;
}

/** Every finding for `dream`'s topology against its map's `anchors`. */
export function validateDreamTopology(dream: D97DreamDefinition, anchors: readonly DreamAnchorSummary[]): D97DreamFinding[] {
  const { waypointAnchorId, arrivalDoorAnchorId, exitDoorAnchorId, exitGuardianAnchorId, shopAnchorId } = dream.topology;
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor]));
  const findings: D97DreamFinding[] = [];
  const expected: readonly (readonly [DreamAnchorId, DreamAnchorKind])[] = [
    [waypointAnchorId, "waypoint"],
    [arrivalDoorAnchorId, "door"],
    [exitDoorAnchorId, "door"],
    [exitGuardianAnchorId, "guardian"],
    [shopAnchorId, "shop"],
  ];
  for (const [anchorId, kind] of expected) {
    if (byId.get(anchorId)?.kind !== kind) findings.push({ rule: "topology-anchor", dreamId: dream.id, anchorId });
  }
  const guardian = byId.get(exitGuardianAnchorId);
  if (guardian?.kind === "guardian" && guardian.blocksDoor !== exitDoorAnchorId) {
    findings.push({ rule: "unguarded-exit", dreamId: dream.id, anchorId: exitGuardianAnchorId });
  }
  return findings;
}

function occupantOf(resident: D97DreamResident): OverworldOccupant {
  return {
    character: resident.characterId,
    badge: resident.badge ?? derivedBadge(resident.role),
    scale: resident.scale,
    dialogue: resident.dialogueId ?? null,
  };
}

/**
 * The occupants of `dream` on its map: every resident without a finding,
 * keyed by anchor. Anchors without a resident stay unoccupied.
 */
export function dreamOccupants(dream: D97DreamDefinition, registry: D97DreamResidentRegistry): OverworldOccupants {
  const flawed = new Set(validateDreamResidents(dream, registry).map((finding) => finding.anchorId));
  return new Map(
    dream.residents.filter((resident) => !flawed.has(resident.anchorId)).map((resident) => [resident.anchorId, occupantOf(resident)]),
  );
}
