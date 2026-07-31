import { layerOrdinal } from "../types/layer-name";
import type { FoldState } from "./fold-state";
import { battleModeOf } from "./battle/fold";

export interface FoldInvariantViolation {
  code: string;
  detail: string;
}

/** A programmer-error signal contained by the production fold boundary. */
export class FoldInvariantError extends Error {
  readonly violations: readonly FoldInvariantViolation[];

  constructor(violations: readonly FoldInvariantViolation[]) {
    super(
      `Fold invariant violation: ${violations
        .map((violation) => `${violation.code} (${violation.detail})`)
        .join("; ")}`,
    );
    this.name = "FoldInvariantError";
    this.violations = violations;
  }
}

/**
 * Validate stable gameplay contracts that must survive every ordinary event.
 * Pre-journey genesis and explicitly loaded QA snapshots are handled by the
 * caller; a started run must always satisfy these rules.
 */
export function foldInvariantViolations(
  state: FoldState,
): FoldInvariantViolation[] {
  const journey = state.journey;
  const violations: FoldInvariantViolation[] = [];
  if (journey.essence < 0) {
    violations.push({
      code: "essence_out_of_bounds",
      detail: String(journey.essence),
    });
  }

  if (journey.screen.type === "site") {
    const siteId = journey.screen.siteId;
    if (journey.activeSiteId !== siteId) {
      violations.push({
        code: "site_screen_active_mismatch",
        detail: `${siteId}/${journey.activeSiteId ?? "none"}`,
      });
    }
    const current =
      journey.currentDreamscape === null
        ? undefined
        : journey.atlas.nodes[journey.currentDreamscape];
    if (!current?.sites.some((site) => site.id === siteId)) {
      violations.push({
        code: "site_screen_outside_current_dreamscape",
        detail: siteId,
      });
    }
  } else if (journey.activeSiteId !== null) {
    violations.push({
      code: "active_site_without_site_screen",
      detail: journey.activeSiteId,
    });
  }

  if (journey.runId === null) return violations;

  const nodes = Object.values(journey.atlas.nodes);
  const completed = nodes.filter((node) => node.state === "completed");
  if (completed.length !== journey.completionLevel) {
    violations.push({
      code: "completion_level_atlas_mismatch",
      detail: `${String(journey.completionLevel)}/${String(completed.length)}`,
    });
  }

  if (journey.currentDreamscape !== null) {
    const node = journey.atlas.nodes[journey.currentDreamscape];
    if (node === undefined) {
      violations.push({
        code: "current_dreamscape_missing",
        detail: journey.currentDreamscape,
      });
    } else {
      if (node.state !== "available") {
        violations.push({
          code: "current_dreamscape_not_available",
          detail: `${node.id}/${node.state}`,
        });
      }
      if (layerOrdinal(node.layer) !== journey.completionLevel) {
        violations.push({
          code: "current_dreamscape_wrong_layer",
          detail: `${node.id}/${String(layerOrdinal(node.layer))}/${String(
            journey.completionLevel,
          )}`,
        });
      }
    }
  }

  if (journey.screen.type === "atlas") {
    if (journey.currentDreamscape !== null) {
      violations.push({
        code: "atlas_screen_inside_dreamscape",
        detail: journey.currentDreamscape,
      });
    }
    if (journey.completionLevel > 0 && journey.completionLevel < 7) {
      const frontier = nodes.filter(
        (node) =>
          node.state === "available" &&
          layerOrdinal(node.layer) === journey.completionLevel,
      );
      if (frontier.length === 0) {
        violations.push({
          code: "atlas_frontier_missing",
          detail: String(journey.completionLevel),
        });
      }
      for (const node of frontier) {
        if (node.dreamscapeId === null) {
          violations.push({
            code: "atlas_frontier_unseen",
            detail: node.id,
          });
        }
      }
    }
  }

  if (
    journey.screen.type === "journeyComplete" &&
    (journey.completionLevel !== 7 || journey.currentDreamscape !== null)
  ) {
    violations.push({
      code: "journey_complete_inconsistent",
      detail: `${String(journey.completionLevel)}/${
        journey.currentDreamscape ?? "none"
      }`,
    });
  }

  const battle = state.battle;
  if (battle !== null && battleModeOf(battle).kind === "journey") {
    const init = battle.init;
    if (battle.board.battleId !== init.battleId) {
      violations.push({
        code: "battle_identity_mismatch",
        detail: `${battle.board.battleId}/${init.battleId}`,
      });
    }
    if (
      init.dreamscapeId === null ||
      journey.currentDreamscape !== init.dreamscapeId
    ) {
      violations.push({
        code: "battle_dreamscape_mismatch",
        detail: `${init.dreamscapeId ?? "none"}/${
          journey.currentDreamscape ?? "none"
        }`,
      });
    }
    if (journey.completionLevel !== init.completionLevelAtStart) {
      violations.push({
        code: "battle_completion_level_mismatch",
        detail: `${String(init.completionLevelAtStart)}/${String(
          journey.completionLevel,
        )}`,
      });
    }
    if (
      journey.activeSiteId !== init.siteId ||
      journey.screen.type !== "site" ||
      journey.screen.siteId !== init.siteId
    ) {
      violations.push({
        code: "battle_site_mismatch",
        detail: init.siteId,
      });
    }
  }

  return violations;
}

export function assertFoldInvariants(state: FoldState): void {
  const violations = foldInvariantViolations(state);
  if (violations.length > 0) throw new FoldInvariantError(violations);
}
