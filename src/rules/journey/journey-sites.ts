import { createRewardSelectionStream } from "../../reward-selection/rng";
import { SELECTION_RULES_VERSION } from "../../reward-selection/types";
import { cardIdFromUnknown } from "../../types/card-identity";
import {
  dreamsignIdFromUnknown,
  parseSelectionKey,
  siteIdFromUnknown,
  type DreamsignId,
} from "../../types/identifiers";
import type {
  ExplorationSiteRuntime,
  JourneySitesEffect,
  JourneyState,
  SiteState,
} from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { findSite, getSiteContentProvider } from "./sites";

/** Aggregate encounter generation, also the optimistic intent comparison value. */
export function explorationRerollCount(runtime: ExplorationSiteRuntime): number {
  return Object.values(runtime.journeySiteRerolls ?? {}).reduce((sum, count) => sum + count, 0);
}

/** Remaining uses belong to held copies; historical consumed uses never reset. */
export function explorationRerollAllowance(
  journey: JourneyState,
  runtime: ExplorationSiteRuntime,
  dreamsignId: DreamsignId,
  registry: JourneyModifierRegistry,
): number {
  const effect = registry.lookup(dreamsignId)?.journeySites;
  if (effect?.kind !== "rerollExploration") return 0;
  const copies = journey.dreamsigns.filter((sign) => sign.id === dreamsignId).length;
  return Math.max(0, copies * effect.rerollsPerSite - (runtime.journeySiteRerolls?.[dreamsignId] ?? 0));
}

/** Live targeted enhancement for an unprepared site; prepared and natural modes persist. */
export function projectJourneySite(
  journey: Pick<JourneyState, "dreamsigns" | "siteRuntime">,
  site: SiteState,
  registry: Pick<JourneyModifierRegistry, "lookup">,
): SiteState {
  if (site.isEnhanced || site.isVisited || journey.siteRuntime?.[site.id] !== undefined) return site;
  const enhanced = journey.dreamsigns.some((sign) => {
    const effect = registry.lookup(sign.id)?.journeySites;
    return effect?.kind === "enhanceSiteTypes" && effect.siteTypes.some((type) => type === site.type);
  });
  return enhanced ? { ...site, isEnhanced: true } : site;
}

/** One catalog clause registered as a pure, post-event journey modifier. */
export function journeySites(dreamsignId: DreamsignId, effect: JourneySitesEffect): JourneyModifierDefinition {
  return {
    dreamsignId,
    journeySites: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, lookup }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (effect.kind === "enhanceSiteTypes") {
        if (eventType !== "OPEN_SITE" || siteId === null || before.siteRuntime[siteId] !== undefined ||
          journey.siteRuntime[siteId] === undefined) return null;
        const site = findSite(journey, siteId);
        if (site === null || site.isVisited || site.isEnhanced ||
          !effect.siteTypes.some((type) => type === site.type)) return null;
        const node = Object.values(journey.atlas.nodes).find((candidate) => candidate.sites.some((s) => s.id === siteId));
        if (node === undefined) return null;
        // Persist only the mode of the successfully prepared site. Unopened
        // targeted sites continue to use live holdings through the projection.
        return {
          journey: { ...journey, atlas: { ...journey.atlas, nodes: { ...journey.atlas.nodes, [node.id]: {
            ...node, sites: node.sites.map((s) => s.id === siteId ? { ...s, isEnhanced: true } : s),
          } } } },
          before: { enhanced: 0 }, after: { enhanced: 1 },
          target: { nodeId: node.id, siteIds: [siteId] },
        };
      }
      const copiesThroughThisHook = journey.dreamsigns.slice(0, heldIndex + 1)
        .filter((sign) => sign.id === dreamsignId).length;
      if (effect.kind === "rerollExploration") {
        if (eventType !== "REROLL_EXPLORATION" || before.screen.type !== "site") return null;
        const siteId = before.screen.siteId;
        const old = before.siteRuntime[siteId];
        const next = journey.siteRuntime[siteId];
        if (old?.kind !== "exploration" || next?.kind !== "exploration") return null;
        const oldUsed = old.journeySiteRerolls?.[dreamsignId] ?? 0;
        const used = next.journeySiteRerolls?.[dreamsignId] ?? 0;
        // Only the copy whose entitlement was consumed logs this application.
        if (used !== oldUsed + 1 || used > copiesThroughThisHook * effect.rerollsPerSite ||
          used <= (copiesThroughThisHook - 1) * effect.rerollsPerSite) return null;
        return {
          journey,
          before: { rerollsUsed: oldUsed },
          after: { rerollsUsed: used },
          target: { siteIds: [siteId], beforeCardId: old.encounterCardId, afterCardId: next.encounterCardId },
        };
      }
      const nodeId = journey.currentDreamscape;
      const node = nodeId === null ? undefined : journey.atlas.nodes[nodeId];
      const provider = getSiteContentProvider();
      if (node === undefined || nodeId === null || provider === null) return null;
      const history = node.journeySiteEnhancements ?? [];
      const earned = history.filter((grant) => grant.dreamsignId === dreamsignId)
        .reduce((max, grant) => Math.max(max, grant.entitlement + 1), 0);
      const budget = copiesThroughThisHook * effect.count - earned;
      if (budget <= 0) return null;
      const eligible = node.sites.filter((site) => !site.isVisited && !projectJourneySite(journey, site, { lookup }).isEnhanced &&
        journey.siteRuntime[site.id] === undefined &&
        !(journey.screen.type === "site" && journey.screen.siteId === site.id) &&
        provider.sitesData.guideAssignments[site.type] !== undefined)
        .sort((left, right) => left.id.localeCompare(right.id));
      if (eligible.length === 0) return null;
      const chosen: SiteState[] = [];
      for (let offset = 0; offset < budget && eligible.length > 0; offset++) {
        const stream = createRewardSelectionStream({
          mechanicId: "catalog-card-chooser",
          policyId: "uniform",
          scope: {
            journeySeed: journey.seed,
            siteUuid: eligible[0].id,
            selectionKey: parseSelectionKey(`journey-sites:${nodeId}:${dreamsignId}:${String(earned + offset)}`),
          },
          count: 1,
        }, "enhancement");
        chosen.push(eligible.splice(Math.floor(stream.draw() * eligible.length), 1)[0]);
      }
      const ids = new Set(chosen.map((site) => site.id));
      return {
        journey: {
          ...journey,
          atlas: { ...journey.atlas, nodes: { ...journey.atlas.nodes, [nodeId]: {
            ...node,
            sites: node.sites.map((site) => ids.has(site.id) ? { ...site, isEnhanced: true } : site),
            journeySiteEnhancements: [...history, ...chosen.map((site, offset) => ({
              dreamsignId, siteId: site.id, entitlement: earned + offset,
            }))],
          } } },
        },
        before: { enhancementsEarned: earned },
        after: { enhancementsEarned: earned + chosen.length },
        target: { nodeId, siteIds: chosen.map((site) => site.id) },
      };
    },
  };
}

/** Atomically redraw an unresolved Exploration encounter and consume its source use. */
export function rerollExploration(
  journey: JourneyState,
  payload: Record<string, unknown>,
  registry: JourneyModifierRegistry,
): JourneyState | null {
  const siteId = siteIdFromUnknown(payload.siteId);
  const dreamsignId = dreamsignIdFromUnknown(payload.dreamsignId);
  const expectedCardId = cardIdFromUnknown(payload.expectedEncounterCardId);
  if (siteId === null || dreamsignId === null || expectedCardId === null ||
    journey.screen.type !== "site" || journey.screen.siteId !== siteId ||
    payload.selectionRulesVersion !== SELECTION_RULES_VERSION) return null;
  const site = findSite(journey, siteId);
  const runtime = journey.siteRuntime[siteId];
  const provider = getSiteContentProvider();
  if (site?.type !== "Exploration" || site.isVisited || runtime?.kind !== "exploration" ||
    runtime.resolution !== null || runtime.selectionRulesVersion !== SELECTION_RULES_VERSION ||
    runtime.encounterCardId !== expectedCardId ||
    payload.expectedRerollCount !== explorationRerollCount(runtime) ||
    explorationRerollAllowance(journey, runtime, dreamsignId, registry) <= 0 || provider === null) return null;
  const next = provider.rerollExploration({ journey, site, runtime, selectionRulesVersion: SELECTION_RULES_VERSION });
  if (next === null || next.encounterCardId === runtime.encounterCardId || next.resolution !== null) return null;
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: { ...next, journeySiteRerolls: {
      ...runtime.journeySiteRerolls,
      [dreamsignId]: (runtime.journeySiteRerolls?.[dreamsignId] ?? 0) + 1,
    } } },
  };
}

/** Optional saved-state fields must be finite, branded, and nonnegative. */
export function validJourneySiteCounters(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, count]) => dreamsignIdFromUnknown(id) !== null &&
    typeof count === "number" && Number.isSafeInteger(count) && count >= 0);
}
