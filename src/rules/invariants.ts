import { subtypeContinuation, validJourneySubtypeScreen, validJourneySubtypeBattleBinding } from "./journey/journey-subtype";
import { typeRemapContinuation, validJourneyTypeRemap, validTypeRemapBattleBinding } from "./journey/journey-type-remap";
import { validShopReplenishmentRuntime } from "./journey/journey-shop";
import { validStarterPurgeScreen, validStarterBattleBinding } from "./journey/journey-starter-acquisition";
import { validJourneyDuplicationScreen } from "./journey/journey-duplication";
import { validJourneyDreamsignScreen, validDreamsignBattleBinding } from "./journey/journey-on-gain";
import { validJourneyOpeningBindings } from "./journey/journey-battle-init";
import { validJourneyTransfigurationRecords, validJourneyTransfigurationScreen } from "./journey/journey-transfiguration";
import { validJourneyPurgeScreen } from "./journey/journey-purge";
import { journeyModifierRegistry, type JourneyModifierRegistry } from "./journey/modifier-registry";
import { layerOrdinal } from "../types/layer-name";
import type { FoldState } from "./fold-state";
import { journeyBattleOf } from "./battle/fold";
import { finalCompletionLevel } from "./battle/journey-battle";

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
  registry: JourneyModifierRegistry = journeyModifierRegistry,
): FoldInvariantViolation[] {
  const acquisition = typeRemapContinuation(subtypeContinuation(state.journey));
  const subtype = state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "subtype" ? state.journey.screen.choice : null;
  const remap = state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "typeRemap" ? state.journey.screen.choice : null;
  const starter = acquisition.screen.type === "journeyStarterPurge" ? acquisition.screen.choice : null;
  const visible = starter?.continuation ?? acquisition.screen;
  const signChoice = visible.type === "journeyDreamsign" ? visible.choice : null;
  const displayed = signChoice?.kind === "copy" || signChoice?.kind === "openingHand" ? signChoice.continuation : visible;
  const projected = { ...state.journey, screen: displayed };
  const pending = displayed.type === "journeyPurge" || displayed.type === "journeyTransfiguration" || displayed.type === "journeyDuplication" ? displayed : null;
  const earned = displayed.type === "journeyDreamsign" && displayed.choice.kind === "afterBattle" ? displayed.choice : pending?.choice.kind === "afterBattle" ? pending.choice : null;
  const journey = earned === null ? projected : { ...projected, screen: { type: earned.returnTo } };
  const violations: FoldInvariantViolation[] = [];
  if (!validJourneyOpeningBindings(state.journey.dreamsigns, (id) => registry.lookup(id))) violations.push({ code: "journey_opening_binding_inconsistent", detail: "binding" });
  if (subtype !== null && (!validJourneySubtypeScreen(state.journey.screen, state.journey, registry) || !validJourneySubtypeBattleBinding(state.journey, state.battle))) violations.push({ code: "journey_subtype_inconsistent", detail: "subtype" });
  if (subtype?.suspendedBattle?.mode === "tutorial" && (state.frontDoor.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId)) violations.push({ code: "journey_subtype_tutorial_mismatch", detail: "tutorial" });
  if (!validJourneyTypeRemap(state.journey, registry) || remap !== null && !validTypeRemapBattleBinding(state.journey, state.battle)) violations.push({ code: "journey_type_remap_inconsistent", detail: "typeRemap" });
  if (remap?.suspendedBattle?.mode === "tutorial" && (state.frontDoor.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId)) violations.push({ code: "journey_type_remap_tutorial_mismatch", detail: "tutorial" });
  if (starter !== null && (!validStarterPurgeScreen(acquisition.screen, acquisition, registry) || !validStarterBattleBinding(acquisition, state.battle))) violations.push({ code: "journey_starter_choice_inconsistent", detail: String(starter.permissionSeq) });
  if (starter?.suspendedBattle?.mode === "tutorial" && (state.frontDoor.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId)) violations.push({ code: "journey_starter_tutorial_mismatch", detail: "tutorial" });
  const choiceJourney = { ...state.journey, screen: visible };
  if (signChoice !== null && (!validJourneyDreamsignScreen(visible, choiceJourney, registry) || !validDreamsignBattleBinding(choiceJourney, state.battle))) violations.push({ code: "journey_dreamsign_choice_inconsistent", detail: signChoice.kind });
  if (pending !== null && (state.battle !== null || !(pending.type === "journeyDuplication" ? validJourneyDuplicationScreen(pending, projected, registry) : pending.type === "journeyPurge" ? validJourneyPurgeScreen(pending, projected, registry) : validJourneyTransfigurationScreen(pending, projected, registry)))) {
    violations.push({ code: "journey_purge_choice_inconsistent", detail: pending.choice.siteId });
  }
  if ((signChoice?.kind === "copy" || signChoice?.kind === "openingHand") && signChoice.suspendedBattle?.mode === "tutorial" && (state.frontDoor.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId)) violations.push({ code: "journey_copy_tutorial_mismatch", detail: "tutorial" });
  if (journey.essence < 0) {
    violations.push({
      code: "essence_out_of_bounds",
      detail: String(journey.essence),
    });
  }

  if (journey.screen.type === "site") {
    const siteId = journey.screen.siteId;
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
  }

  for (const [siteId, runtime] of Object.entries(journey.siteRuntime)) {
    if (!validShopReplenishmentRuntime(runtime)) violations.push({ code: "journey_shop_replenishment_inconsistent", detail: siteId });
  }

  if (!validJourneyTransfigurationRecords(state.journey)) violations.push({ code: "journey_transfiguration_record_inconsistent", detail: "applications" });
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
    if (
      journey.completionLevel > 0 &&
      journey.completionLevel < finalCompletionLevel(journey.atlas)
    ) {
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
    (journey.completionLevel !== finalCompletionLevel(journey.atlas) ||
      journey.currentDreamscape !== null)
  ) {
    violations.push({
      code: "journey_complete_inconsistent",
      detail: `${String(journey.completionLevel)}/${
        journey.currentDreamscape ?? "none"
      }`,
    });
  }

  const battle = journeyBattleOf(state.battle);
  if (battle !== null) {
    const init = battle.init;
    if (
      init.nodeId === null ||
      journey.currentDreamscape !== init.nodeId
    ) {
      violations.push({
        code: "battle_dreamscape_mismatch",
        detail: `${init.nodeId ?? "none"}/${
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

export function assertFoldInvariants(state: FoldState, registry: JourneyModifierRegistry = journeyModifierRegistry): void {
  const violations = foldInvariantViolations(state, registry);
  if (violations.length > 0) throw new FoldInvariantError(violations);
}
