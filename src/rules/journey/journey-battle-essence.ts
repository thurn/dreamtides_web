import type { EngineEvent } from "../../engine/events";
import type { RemovalProvenance } from "../../engine/events/types";
import type { CommittedBattleStep } from "../../engine/fold/slice";
import type { ReducerLogRecord } from "../../eventlog/types";
import type { BattleId, SiteId } from "../../types/identifiers";
import type { JourneyEssenceEffect, JourneyState } from "../../types/journey";
import type { JourneyModifierRegistry } from "./modifier-registry";

/** React to complete successful steps, never to presentation prefixes or saved history. */
export function applyJourneyBattleEssence(input: {
  journey: JourneyState; battleId: BattleId; siteId: SiteId; seq: number;
  steps: readonly CommittedBattleStep[]; lookup: JourneyModifierRegistry["lookup"];
}): { journey: JourneyState; logRecords: readonly ReducerLogRecord[] } {
  let journey = input.journey;
  const logRecords: ReducerLogRecord[] = [];
  for (const step of input.steps) {
    let phase = step.phase;
    for (const event of step.events) {
      if (event.kind === "phaseChanged") { phase = event.phase; continue; }
      const removal = event.kind === "dissolved" || event.kind === "banished" ? event.removal
        : event.kind === "ceasedToExist" ? event.banishedBy : undefined;
      if (removal?.controller !== "player") continue;
      for (const [heldIndex, dreamsignId] of step.dreamsigns.entries()) {
        const effect = input.lookup(dreamsignId)?.journeyEssence;
        if (!qualifies(effect, phase, event.kind, removal.kind)) continue;
        const before = journey.essence;
        journey = { ...journey, essence: before + effect.amount };
        logRecords.push({ event: "journey_modifier_applied", fields: {
          dreamsignId, heldIndex, hook: "battle_step_committed", battleId: input.battleId,
          siteId: input.siteId, seq: input.seq, stepVersion: step.version,
          eventKind: event.kind, phase, victimInstance: "instance" in event ? event.instance : null,
          ...(removal.kind === "challenge" ? { causingInstance: removal.character } : {}),
          before: { essence: before }, after: { essence: journey.essence, gained: effect.amount },
        } });
      }
    }
  }
  return { journey, logRecords };
}
function qualifies(effect: JourneyEssenceEffect | undefined, phase: CommittedBattleStep["phase"], kind: EngineEvent["kind"], cause: RemovalProvenance["kind"]): effect is Extract<JourneyEssenceEffect, { kind: "enemyRemovalOutsideChallengeEssence" | "challengeDissolveEssence" }> {
  return effect?.kind === "enemyRemovalOutsideChallengeEssence" ? phase !== "challenge"
    : effect?.kind === "challengeDissolveEssence" && kind === "dissolved" && cause === "challenge";
}
