import type { ReducerLogRecord } from "../../eventlog/types";
import type { DreamsignId, SiteId } from "../../types/identifiers";
import { parseDreamsignId } from "../../types/identifiers";
import type { JourneyState } from "../../types/journey";
import type { GameplayEventType } from "../events";

/**
 * A pure hook over a validated gameplay journey transition, separate from the
 * battle DSL. Administrative intents never reach a hook.
 */
export interface JourneyModifierDefinition {
  readonly dreamsignId: DreamsignId;
  /**
   * Return null when this transition does not apply the effect. Hooks must be
   * deterministic, must not mutate either input, and must not perform IO.
   * Specific primitive hooks extend this registry as their rules are implemented.
   */
  readonly afterJourneyEvent: (input: {
    readonly before: Readonly<JourneyState>;
    readonly journey: Readonly<JourneyState>;
    readonly eventType: GameplayEventType;
  }) => {
    readonly journey: JourneyState;
    /** Numeric rule values only: catalog names and copy cannot enter diagnostics. */
    readonly before: Readonly<Record<string, number>>;
    readonly after: Readonly<Record<string, number>>;
  } | null;
}

export interface JourneyModifierRegistry {
  lookup(dreamsignId: DreamsignId): JourneyModifierDefinition | undefined;
  apply(input: {
    before: JourneyState;
    journey: JourneyState;
    eventType: GameplayEventType;
    siteId: SiteId | null;
  }): { journey: JourneyState; logRecords: readonly ReducerLogRecord[] };
}

function snapshot(values: Readonly<Record<string, number>>): Record<string, number> {
  if (Object.values(values).some((value) => !Number.isFinite(value))) {
    throw new Error("Journey modifier diagnostics require finite numeric values.");
  }
  return { ...values };
}

/**
 * Build a fixed UUID-keyed registry. Duplicate registrations are programmer
 * errors; the copied definitions cannot change when the caller edits its list.
 */
export function createJourneyModifierRegistry(
  definitions: readonly JourneyModifierDefinition[],
): JourneyModifierRegistry {
  const byId = new Map<DreamsignId, JourneyModifierDefinition>();
  for (const definition of definitions) {
    const dreamsignId = parseDreamsignId(definition.dreamsignId);
    if (byId.has(dreamsignId)) {
      throw new Error(`Duplicate journey modifier registration: ${dreamsignId}`);
    }
    byId.set(dreamsignId, Object.freeze({ ...definition, dreamsignId }));
  }
  return Object.freeze({
    lookup: (dreamsignId: DreamsignId) => byId.get(dreamsignId),
    apply({ before, journey, eventType, siteId }) {
      const logRecords: ReducerLogRecord[] = [];
      let next = journey;
      // Snapshot the post-domain holdings: hooks run in held order, once per
      // copy held after the event, so a Dreamsign the event gains applies to
      // it and one the event removes does not (docs/design.md § Dreamsign
      // journey effects). A hook changing the holdings does not alter this
      // iteration.
      for (const [heldIndex, { id }] of journey.dreamsigns.entries()) {
        const definition = byId.get(id);
        const applied = definition?.afterJourneyEvent({ before, journey: next, eventType });
        if (applied == null) continue;
        logRecords.push({
          event: "journey_modifier_applied",
          fields: {
            dreamsignId: id,
            hook: "after_journey_event",
            eventType,
            siteId,
            heldIndex,
            before: snapshot(applied.before),
            after: snapshot(applied.after),
          },
        });
        next = applied.journey;
      }
      return { journey: next, logRecords };
    },
  } satisfies JourneyModifierRegistry);
}

/** The production registry's fixed catalog registrations. */
export const journeyModifierRegistry = createJourneyModifierRegistry([]);
