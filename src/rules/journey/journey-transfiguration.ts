import type { EventContext } from "../../eventlog/types";
import type { CardId } from "../../types/card-identity";
import type { CardType } from "../../types/cards";
import { deckEntryIdFromUnknown, type DreamsignId } from "../../types/identifiers";
import type { DeckEntry, JourneyState, JourneyTransfigurationEffect, JourneyTransfigurationOccurrence, TransfigurationType } from "../../types/journey";
import { mintEntryId } from "./deck";
import { afterBattleChoice, appendAfterBattleSource, advanceAfterBattle, validAfterBattleChoice } from "./journey-after-battle";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { findSite } from "./sites";

export interface JourneyTransfigurationProvider {
  resolve(entry: Readonly<DeckEntry>): { readonly cardId: CardId; readonly cardType: CardType; readonly subtype: import("../../types/card-identity").CardSubtype; readonly forms: readonly TransfigurationType[] } | null;
}
let provider: JourneyTransfigurationProvider | null = null;
export function registerJourneyTransfigurationProvider(value: JourneyTransfigurationProvider | null): void { provider = value; }

export function journeyTransfigurationCard(entry: Readonly<DeckEntry>) { return provider?.resolve(entry) ?? null; }

/** Only original physical entries modified by this domain operation are occurrences. */
export function journeyTransfigurationOccurrences(before: JourneyState, after: JourneyState): readonly JourneyTransfigurationOccurrence[] {
  const original = new Map(before.deck.map((entry) => [entry.entryId, entry]));
  return after.deck.flatMap((entry) => {
    if (original.get(entry.entryId)?.transfiguration !== null || entry.transfiguration === null) return [];
    if (provider === null) throw new Error("Journey transfiguration content is unavailable.");
    const resolved = provider.resolve(entry);
    if (resolved === null) throw new Error("Transfigured journey card is unknown.");
    return [Object.freeze({ entry: Object.freeze(structuredClone(entry)), cardId: resolved.cardId, cardType: resolved.cardType })];
  });
}

export function journeyTransfiguration(dreamsignId: DreamsignId, descriptor: JourneyTransfigurationEffect): JourneyModifierDefinition {
  if (descriptor.kind !== "copyTransfiguredEvent" && (descriptor.kind !== "afterBattleTransfiguration" ||
    !Number.isSafeInteger(descriptor.maxCount) || descriptor.maxCount < 1)) throw new RangeError("Invalid journeyTransfiguration descriptor.");
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyTransfiguration: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq, transfigurations }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (effect.kind === "afterBattleTransfiguration") {
        if (eventType !== "END_BATTLE" || siteId === null || before.screen.type !== "site" || before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
        const next = appendAfterBattleSource(journey, siteId, { kind: "transfiguration", dreamsignId, heldIndex, maxCount: effect.maxCount });
        if (next === null) return null;
        const count = afterBattleChoice(next.screen)!.sources.length;
        return { journey: next, before: { permissions: count - 1 }, after: { permissions: count, maxCount: effect.maxCount }, target: { siteIds: [siteId] } };
      }
      const events = transfigurations.filter((occurrence) => occurrence.cardType === "Event");
      if (events.length === 0) return null;
      let deck = [...journey.deck];
      const copies = events.map(({ entry, cardId }, index) => {
        const copy = { ...structuredClone(entry), entryId: mintEntryId(deck, seq, index) };
        deck = [...deck, copy];
        return { fromEntryId: entry.entryId, entryId: copy.entryId, cardId };
      });
      return { journey: { ...journey, deck }, before: { deckSize: journey.deck.length }, after: { deckSize: deck.length, copied: copies.length },
        target: { siteIds: siteId === null ? [] : [siteId], copies } };
    },
  };
}

export function validJourneyTransfigurationScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (typeof screen !== "object" || screen === null || !("type" in screen) || screen.type !== "journeyTransfiguration" || !("choice" in screen)) return false;
  return validAfterBattleChoice(screen.choice, journey, registry) &&
    (screen.choice as import("../../types/journey").AfterBattleJourneyChoice).sources[(screen.choice as import("../../types/journey").AfterBattleJourneyChoice).index].kind === "transfiguration";
}

/** Validation finishes before any card changes or random forms are committed. */
export function resolveJourneyTransfiguration(journey: JourneyState, payload: Record<string, unknown>, ctx: EventContext, registry: JourneyModifierRegistry): JourneyState | null {
  if (journey.screen.type !== "journeyTransfiguration" || !validJourneyTransfigurationScreen(journey.screen, journey, registry)) return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (source.kind !== "transfiguration" || payload.siteId !== choice.siteId || payload.dreamsignId !== source.dreamsignId ||
    payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.index || !Array.isArray(payload.entryIds) || payload.entryIds.length > source.maxCount) return null;
  const ids = payload.entryIds.map(deckEntryIdFromUnknown);
  if (ids.some((id) => id === null) || new Set(ids).size !== ids.length) return null;
  const selected = ids.map((id) => journey.deck.find((entry) => entry.entryId === id));
  if (selected.some((entry) => entry === undefined || entry.transfiguration !== null)) return null;
  if (selected.length === 0) return advanceAfterBattle(journey, choice);
  if (provider === null) return null;
  const resolved = selected.map((entry) => provider!.resolve(entry!));
  if (resolved.some((card) => card === null || card.forms.length === 0)) return null;
  const forms = new Map(ids.map((id, index) => [id!, resolved[index]!.forms[Math.floor(ctx.rng(index) * resolved[index]!.forms.length)]]));
  return advanceAfterBattle({ ...journey, deck: journey.deck.map((entry) => forms.has(entry.entryId) ? { ...entry, transfiguration: forms.get(entry.entryId)! } : entry) }, choice);
}
