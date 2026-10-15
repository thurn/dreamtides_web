import { resolveBeforeBattlePurge, validBeforeBattlePurgeChoice } from "./journey-before-battle-purge";
import { afterBattleChoice, appendAfterBattleSource, advanceAfterBattle, validAfterBattleChoice } from "./journey-after-battle";
import type { DreamsignId } from "../../types/identifiers";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, siteIdFromUnknown } from "../../types/identifiers";
import type { AfterBattlePurgeSource, BeforeBattleJourneyPurgeChoice, JourneyPurgeChoice, JourneyPurgeEffect, JourneyPurgeTransition, JourneyState } from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { completeAndReturn, findSite } from "./sites";

const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const indexInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The current earned permission, identified by its source and original held slot. */
export function currentPurgeSource(choice: Exclude<JourneyPurgeChoice, BeforeBattleJourneyPurgeChoice>): AfterBattlePurgeSource | undefined;
export function currentPurgeSource(choice: JourneyPurgeChoice): AfterBattlePurgeSource | BeforeBattleJourneyPurgeChoice | undefined;
export function currentPurgeSource(choice: JourneyPurgeChoice): AfterBattlePurgeSource | BeforeBattleJourneyPurgeChoice | undefined {
  if (choice.kind === "beforeBattle") return choice;
  const source = choice.kind === "afterBattle" ? choice.sources[choice.index] :
    { dreamsignId: choice.dreamsignId, heldIndex: choice.heldIndex, maxCount: choice.count };
  return source?.kind === "transfiguration" || source?.kind === "dreamsign" || source?.kind === "duplication" ? undefined : source;
}

/** Strict purpose shape and saved continuation checks, independent of catalog defaults. */
export function validJourneyPurgeScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyPurge") return false;
  const choice = screen.choice;
  if (!record(choice)) return false;
  const siteId = siteIdFromUnknown(choice.siteId);
  if (siteId === null) return false;
  if (!record(journey.atlas) || !record(journey.atlas.nodes) || !Array.isArray(journey.atlas.layers) ||
    !record(journey.siteRuntime) || Object.values(journey.atlas.nodes).some((node) => !record(node) || !Array.isArray(node.sites))) return false;
  const site = findSite(journey, siteId);
  if (choice.kind === "beforeBattle") return validBeforeBattlePurgeChoice(choice, journey, registry);
  if (choice.kind === "essenceSite") {
    const runtime = journey.siteRuntime[siteId];
    const sourceId = dreamsignIdFromUnknown(choice.dreamsignId);
    const effect = sourceId === null ? undefined : registry.lookup(sourceId)?.journeyPurge;
    return dreamsignIdFromUnknown(choice.dreamsignId) !== null && indexInteger(choice.heldIndex) &&
      positiveInteger(choice.count) && effect?.kind === "replaceEssenceWithPurge" && effect.count === choice.count && site?.type === "Essence" && !site.isVisited &&
      journey.currentDreamscape !== null && journey.atlas.nodes[journey.currentDreamscape]?.sites.some((item) => item.id === site.id) === true &&
      runtime?.kind === "essence" && runtime.accepted === false && Number.isFinite(runtime.amount) && runtime.amount >= 0;
  }
  return validAfterBattleChoice(choice, journey, registry) &&
    currentPurgeSource(choice as unknown as JourneyPurgeChoice) !== undefined;
}

/** Register printed purge permissions or a passive prohibition. */
export function journeyPurge(dreamsignId: DreamsignId, descriptor: JourneyPurgeEffect): JourneyModifierDefinition {
  const effect = Object.freeze({ ...descriptor });
  if (effect.kind === "beforeBattlePurge") {
    if (!indexInteger(effect.minimumDeckSize)) throw new RangeError("Invalid journeyPurge catalog minimum.");
    return { dreamsignId, journeyPurge: effect, afterJourneyEvent: () => null };
  }
  if (effect.kind === "preventPurge") return { dreamsignId, journeyPurge: effect, afterJourneyEvent: () => null };
  if ((effect.kind !== "afterBattlePurge" && effect.kind !== "replaceEssenceWithPurge") ||
    !positiveInteger(effect.kind === "afterBattlePurge" ? effect.maxCount : effect.count)) {
    throw new RangeError("Invalid journeyPurge catalog count.");
  }
  return { dreamsignId, journeyPurge: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (siteId === null) return null;
      if (effect.kind === "afterBattlePurge") {
        if (eventType !== "END_BATTLE" || before.screen.type !== "site" ||
          before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
        const next = appendAfterBattleSource(journey, siteId, { dreamsignId, heldIndex, maxCount: effect.maxCount });
        if (next === null) return null;
        const count = afterBattleChoice(next.screen)!.sources.length;
        return { journey: next, before: { permissions: count - 1 }, after: { permissions: count, maxCount: effect.maxCount },
          target: { siteIds: [siteId] } };
      }
      const runtime = journey.siteRuntime[siteId];
      if (journey.screen.type === "journeyPurge" && journey.screen.choice.kind === "essenceSite") return null;
      if ((eventType !== "OPEN_SITE" && eventType !== "ACCEPT_ESSENCE") || before.siteRuntime[siteId] !== undefined ||
        runtime?.kind !== "essence" || runtime.accepted ||
        journey.dreamsigns.findIndex((sign) => sign.id === dreamsignId) !== heldIndex) return null;
      const choice: JourneyPurgeChoice = { kind: "essenceSite", siteId, dreamsignId, heldIndex, count: effect.count };
      return { journey: { ...journey, screen: { type: "journeyPurge", choice } },
        before: { offered: 0 }, after: { offered: 1, count: effect.count }, target: { siteIds: [siteId] } };
    },
  };
}

/** Resolve the current folded permission atomically, including its source and ordinal. */
export function resolveJourneyPurge(journey: JourneyState, payload: Record<string, unknown>, registry: JourneyModifierRegistry): JourneyPurgeTransition | null {
  if (journey.screen.type !== "journeyPurge" || !validJourneyPurgeScreen(journey.screen, journey, registry)) return null;
  if (journey.screen.choice.kind === "beforeBattle") return resolveBeforeBattlePurge(journey, payload, registry);
  const choice = journey.screen.choice;
  const source = currentPurgeSource(choice);
  if (source === undefined || payload.siteId !== choice.siteId || payload.dreamsignId !== source.dreamsignId ||
    payload.heldIndex !== source.heldIndex || payload.choiceIndex !== (choice.kind === "afterBattle" ? choice.index : 0) ||
    !Array.isArray(payload.entryIds)) return null;
  const entryIds = payload.entryIds.map(deckEntryIdFromUnknown);
  if (entryIds.some((id) => id === null) || new Set(entryIds).size !== entryIds.length ||
    (choice.kind === "essenceSite" ? entryIds.length !== choice.count : entryIds.length > source.maxCount)) return null;
  const selected = new Set(entryIds);
  const removed = journey.deck.filter((entry) => selected.has(entry.entryId));
  if (removed.length !== entryIds.length) return null;
  let next: JourneyState = { ...journey, deck: journey.deck.filter((entry) => !selected.has(entry.entryId)) };
  if (choice.kind === "essenceSite") {
    const runtime = journey.siteRuntime[choice.siteId];
    if (runtime?.kind !== "essence") return null;
    next = completeAndReturn({ ...next, siteRuntime: { ...next.siteRuntime,
      [choice.siteId]: { ...runtime, accepted: true } } }, choice.siteId);
  } else {
    next = advanceAfterBattle(next, choice);
  }
  return { journey: next, purges: removed.map(({ entryId }) => ({ entryId })) };
}
