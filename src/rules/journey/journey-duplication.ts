import type { ReducerLogRecord } from "../../eventlog/types";
import { deckEntryIdFromUnknown, type DeckEntryId, type DreamsignId, type SiteId } from "../../types/identifiers";
import type { AfterBattleDuplicationSource, JourneyDuplicationEffect, JourneyState } from "../../types/journey";
import { afterBattleChoice, advanceAfterBattle, appendAfterBattleSource, validAfterBattleChoice } from "./journey-after-battle";
import { duplicateDeckEntry } from "./deck";
import { journeyTransfigurationCard } from "./journey-transfiguration";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { findSite } from "./sites";

/** Replacement counts use the first held source; additional copies set the same count. */
export function duplicationSiteQuote(journey: Pick<JourneyState, "dreamsigns">, registry?: Pick<JourneyModifierRegistry, "lookup">) {
  for (const [heldIndex, sign] of journey.dreamsigns.entries()) {
    const effect = registry?.lookup(sign.id)?.journeyDuplication;
    if (effect?.kind === "duplicationSiteCopies") return { copies: effect.copies, dreamsignId: sign.id, heldIndex };
  }
  return { copies: 1, dreamsignId: null, heldIndex: null };
}

/** Concrete domain attempts precede gain prohibitions; their records explain retained state. */
export function journeyDuplicationRecord(before: JourneyState, journey: JourneyState, input: {
  readonly siteId: SiteId; readonly selectedEntryId: DeckEntryId | null;
  readonly dreamsignId: DreamsignId | null; readonly heldIndex: number | null;
  readonly choiceIndex?: number; readonly earnedSeq?: number;
}): ReducerLogRecord {
  const old = new Set(before.deck.map((entry) => entry.entryId));
  const attemptedCopies = journey.deck.filter((entry) => !old.has(entry.entryId)).map((entry) => ({
    entryId: entry.entryId, cardId: journeyTransfigurationCard(entry)?.cardId ?? null,
  }));
  return { event: "journey_duplication_resolved", fields: { ...input, requestedCopyCount: attemptedCopies.length,
    attemptedCopies, deckSizeBefore: before.deck.length, deckSizeBeforeGainObservers: journey.deck.length } };
}

export function validJourneyDuplicationScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (typeof screen !== "object" || screen === null || !("type" in screen) || screen.type !== "journeyDuplication" || !("choice" in screen)) return false;
  return validAfterBattleChoice(screen.choice, journey, registry) &&
    (screen.choice as import("../../types/journey").AfterBattleJourneyChoice).sources[(screen.choice as import("../../types/journey").AfterBattleJourneyChoice).index].kind === "duplication";
}

/** Resolve one earned optional copy without consuming a stale or foreign permission. */
export function resolveJourneyDuplication(journey: JourneyState, payload: Record<string, unknown>, seq: number, registry: JourneyModifierRegistry): JourneyState | null {
  if (journey.screen.type !== "journeyDuplication" || !validJourneyDuplicationScreen(journey.screen, journey, registry)) return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (source.kind !== "duplication" || payload.siteId !== choice.siteId || payload.dreamsignId !== source.dreamsignId ||
    payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.index || payload.earnedSeq !== source.earnedSeq) return null;
  if (payload.entryId === null) return advanceAfterBattle(journey, choice);
  const entryId = deckEntryIdFromUnknown(payload.entryId);
  if (entryId === null) return null;
  const copied = duplicateDeckEntry(journey, { entryId }, { seq });
  return copied === null ? null : advanceAfterBattle(copied, choice);
}

/** The three printed duplication clauses share physical copies, not new transformation occasions. */
export function journeyDuplication(dreamsignId: DreamsignId, descriptor: JourneyDuplicationEffect): JourneyModifierDefinition {
  if (descriptor.kind !== "afterBattleDuplication" && descriptor.kind !== "firstCardPurchaseDuplication" &&
    (descriptor.kind !== "duplicationSiteCopies" || !Number.isSafeInteger(descriptor.copies) || descriptor.copies < 1)) throw new RangeError("Invalid journeyDuplication descriptor.");
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyDuplication: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (siteId === null) return null;
      if (effect.kind === "afterBattleDuplication") {
        if (eventType !== "END_BATTLE" || before.screen.type !== "site" || before.screen.siteId !== siteId || findSite(before, siteId)?.type !== "Battle") return null;
        const source: AfterBattleDuplicationSource = { kind: "duplication", dreamsignId, heldIndex, earnedSeq: seq };
        const next = appendAfterBattleSource(journey, siteId, source);
        if (next === null) return null;
        return { journey: next, before: { permissions: afterBattleChoice(journey.screen)?.sources.length ?? 0 },
          after: { permissions: afterBattleChoice(next.screen)!.sources.length }, target: { siteIds: [siteId] } };
      }
      if (effect.kind !== "firstCardPurchaseDuplication" || eventType !== "BUY_SHOP_SLOT") return null;
      const old = before.siteRuntime[siteId], runtime = journey.siteRuntime[siteId];
      if (old?.kind !== "shop" || runtime?.kind !== "shop" || runtime.purchaseHistory.length !== old.purchaseHistory.length + 1 ||
        old.purchaseHistory.some((purchase) => purchase.item.kind === "card")) return null;
      const receipt = runtime.purchaseHistory[runtime.purchaseHistory.length - 1];
      if (receipt.eventSeq !== seq || receipt.siteId !== siteId || receipt.item.kind !== "card") return null;
      const fromEntryId = receipt.item.gainedEntryId;
      const entry = journey.deck.find((candidate) => candidate.entryId === fromEntryId);
      if (entry === undefined) return null;
      const card = journeyTransfigurationCard(entry);
      if (card === null) throw new Error("Purchased copy content is unavailable.");
      const next = duplicateDeckEntry(journey, { entryId: fromEntryId }, { seq });
      if (next === null) return null;
      return { journey: next, before: { deckSize: journey.deck.length }, after: { deckSize: next.deck.length, attemptedCopies: 1 },
        target: { siteIds: [siteId], copies: [{ fromEntryId, entryId: next.deck[next.deck.length - 1].entryId, cardId: card.cardId }] } };
    },
  };
}
