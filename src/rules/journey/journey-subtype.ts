import { cardIdFromUnknown, cardSubtypeFromUnknown, type CardSubtype } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, cardTypeChangePredicateIdFromUnknown, parseCardTypeChangePredicateId, siteIdFromUnknown } from "../../types/identifiers";
import type { DeckEntry, JourneyDreamsignSubtypeChoice, JourneyModifierBefore, JourneyState, JourneySubtypeResume, JourneySuspendedBattle } from "../../types/journey";
import type { BattleFoldState } from "../battle/fold";
import type { FoldState } from "../fold-state";
import { isGameplayEventType, isKnownEventType } from "../events";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfigurationCard } from "./journey-transfiguration";
import { journeyTypeRemapTypes, validTypeRemapScreen, validTypeRemapIntent, validTypeRemapBattleBinding, resolveTypeRemap } from "./journey-type-remap";
import { finishJourneyAcquisition } from "./journey-on-gain";
import { validShopReplenishmentRuntime } from "./journey-shop";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const keys = ["deck", "screen", "siteRuntime", "dreamsigns", "essence", "currentDreamscape", "shopModifiers", "draftState", "atlas"] as const;

/** Freeze precisely the historical contract consumed by ordinary observers. */
export function journeySubtypeBefore(before: JourneyModifierBefore): JourneyModifierBefore {
  const { deck, screen, siteRuntime, dreamsigns, essence, currentDreamscape, shopModifiers, draftState, atlas } = before;
  return structuredClone({ deck, screen, siteRuntime, dreamsigns, essence, currentDreamscape, shopModifiers, draftState, atlas });
}

/** The acquired-source cursor pauses before any positive observer executes. */
export function prepareJourneySubtypeChoice(journey: JourneyState, resume: JourneySubtypeResume, seq: number, suspendedBattle: JourneySuspendedBattle | null, kind: "deckSubtype" | "typeRemap"): JourneyState {
  if (journeyTypeRemapTypes().length === 0) throw new Error("Journey subtype vocabulary is unavailable");
  if (journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind !== "afterBattle") throw new Error("Nested journey subtype choice");
  const continuation: JourneyDreamsignSubtypeChoice["continuation"] = journey.screen.type === "journeyDreamsign" ? { type: "journeyDreamsign", choice: journey.screen.choice as import("../../types/journey").AfterBattleJourneyChoice } : journey.screen;
  const entries = kind === "typeRemap" ? [] : journey.deck.flatMap(entry => {
    const card = journeyTransfigurationCard(entry);
    if (card === null) throw new Error("Journey subtype content is unavailable");
    return card.cardType === "Character" ? [{ entryId: entry.entryId, cardId: card.cardId }] : [];
  });
  return { ...journey, screen: { type: "journeyDreamsign", choice: { kind: "subtype", permissionSeq: seq,
    current: kind === "typeRemap" ? { kind } : { kind, entries }, continuation,
    suspendedBattle, resume: structuredClone(resume) } } };
}

export function subtypeContinuation(journey: JourneyState): JourneyState {
  return journey.screen.type === "journeyDreamsign" && journey.screen.choice.kind === "subtype" ? { ...journey, screen: journey.screen.choice.continuation } : journey;
}

function c12(journey: JourneyState, choice: JourneyDreamsignSubtypeChoice, continuation = choice.continuation): JourneyState {
  return { ...journey, screen: { type: "journeyDreamsign", choice: { kind: "typeRemap", sources: [choice.resume.sources[choice.resume.sourceIndex]], index: 0, permissionSeq: choice.permissionSeq, continuation, suspendedBattle: choice.suspendedBattle } } };
}

function validEntries(value: unknown): value is readonly DeckEntry[] {
  if (!Array.isArray(value)) return false;
  const seen = new Set();
  return value.every(entry => {
    if (!record(entry) || deckEntryIdFromUnknown(entry.entryId) === null || seen.has(entry.entryId) || !index(entry.cardNumber) || !(entry.transfiguration === null || typeof entry.transfiguration === "string" && ["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"].includes(String(entry.transfiguration)))) return false;
    if (typeof entry.isBane !== "boolean" || entry.sparkBonus !== undefined && (typeof entry.sparkBonus !== "number" || !Number.isFinite(entry.sparkBonus))) return false;
    if (entry.keywordModification != null && (!record(entry.keywordModification) || entry.keywordModification.fast !== undefined && typeof entry.keywordModification.fast !== "boolean" || ["energyCostReduction", "reclaim", "setReclaim"].some(key => entry.keywordModification != null && record(entry.keywordModification) && entry.keywordModification[key] !== undefined && (typeof entry.keywordModification[key] !== "number" || !Number.isFinite(entry.keywordModification[key]))))) return false;
    if (entry.statOverride !== undefined && (!record(entry.statOverride) || ["energyCost", "spark"].some(key => record(entry.statOverride) && entry.statOverride[key] !== undefined && (typeof entry.statOverride[key] !== "number" || !Number.isFinite(entry.statOverride[key]))))) return false;
    if (entry.typeChange != null && (!record(entry.typeChange) || cardTypeChangePredicateIdFromUnknown(entry.typeChange.predicateId) === null || !["Character", "Event"].includes(String(entry.typeChange.cardType)) || cardSubtypeFromUnknown(entry.typeChange.subtype) === null || typeof entry.typeChange.label !== "string")) return false;
    seen.add(entry.entryId);
    return journeyTransfigurationCard(entry as unknown as DeckEntry) !== null;
  });
}

/** Deferred purchase hooks consume historical receipt kinds and concrete slots. */
function validHistoricalShop(runtime: Record<string, unknown>): boolean {
  if (!Array.isArray(runtime.purchaseHistory) || !index(runtime.rerollCount) || !Array.isArray(runtime.slots)) return false;
  for (const receipt of runtime.purchaseHistory) {
    if (!record(receipt) || !record(receipt.item) || receipt.item.kind !== "card" && receipt.item.kind !== "dreamsign") return false;
  }
  for (const slot of runtime.slots) {
    if (!record(slot) || typeof slot.purchased !== "boolean" || typeof slot.basePrice !== "number" || !Number.isFinite(slot.basePrice) || slot.basePrice < 0 ||
      typeof slot.discountPercent !== "number" || !Number.isFinite(slot.discountPercent) || slot.discountPercent < 0 || slot.discountPercent > 100) return false;
    if (slot.itemType === "card") {
      if (!index(slot.cardNumber) || slot.transfiguration !== undefined && (typeof slot.transfiguration !== "string" || !["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"].includes(slot.transfiguration))) return false;
    } else if (slot.itemType !== "dreamsign" || !record(slot.dreamsign) || dreamsignIdFromUnknown(slot.dreamsign.id) === null) return false;
  }
  return validShopReplenishmentRuntime(runtime);
}

function validBefore(value: Record<string, unknown>, journey: JourneyState): boolean {
  const screen = value.screen, shop = value.shopModifiers, atlas = value.atlas;
  if (!record(screen) || typeof screen.type !== "string" || !["journeyStart", "atlas", "dreamscape", "site", "journeyComplete", "journeyFailed", "journeyDreamsign", "journeyStarterPurge", "journeyPurge", "journeyTransfiguration", "journeyDuplication"].includes(String(screen.type)) || !record(shop) || !record(atlas) || !record(atlas.nodes)) return false;
  if (screen.type === "site" && (siteIdFromUnknown(screen.siteId) === null || findSite(journey, siteIdFromUnknown(screen.siteId)!) === undefined)) return false;
  if (screen.type.startsWith("journey") && !["journeyStart", "journeyComplete", "journeyFailed"].includes(screen.type) && (!record(screen.choice) || !["afterBattle", "beforeBattle", "essenceSite"].includes(String(screen.choice.kind)))) return false;
  for (const key of ["freeRerolls", "essenceDiscountPercent"]) if (typeof shop[key] !== "number" || !Number.isFinite(shop[key])) return false;
  if (!Array.isArray(shop.freeNextShopModifiers) || !Array.isArray(shop.freePurchaseModifiers)) return false;
  for (const [id, node] of Object.entries(atlas.nodes)) {
    if (!record(node) || !Array.isArray(node.sites) || !Array.isArray(node.forwardIds) || !Array.isArray(node.backwardIds) || !journey.atlas.nodes[id as import("../../types/identifiers").AtlasNodeId]) return false;
    for (const site of node.sites) if (!record(site) || siteIdFromUnknown(site.id) === null || typeof site.type !== "string" || typeof site.isVisited !== "boolean" || typeof site.isEnhanced !== "boolean") return false;
  }
  if (value.currentDreamscape !== null && (typeof value.currentDreamscape !== "string" || !record(atlas.nodes[value.currentDreamscape]))) return false;
  if (record(value.draftState)) {
    const draft = value.draftState;
    if (!index(draft.sitePicksCompleted) || !index(draft.pickNumber) || !(draft.activeSiteId === null || siteIdFromUnknown(draft.activeSiteId) !== null)) return false;
    if (draft.siteFirstEventEntryId !== undefined && draft.siteFirstEventEntryId !== null && deckEntryIdFromUnknown(draft.siteFirstEventEntryId) === null) return false;
  }
  if (!record(value.siteRuntime)) return false;
  return Object.entries(value.siteRuntime).every(([id, runtime]) => siteIdFromUnknown(id) !== null && record(runtime) && ["shop", "reward", "dreamsignOffer", "essence", "cardChoice", "augury", "gamble", "exploration", "randomSite"].includes(String(runtime.kind)) && (runtime.kind !== "shop" || validHistoricalShop(runtime)));
}

/** Validate this finite saved acquisition role and every independent earned queue. */
export function validJourneySubtypeScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  try {
    if (!record(screen) || screen.type !== "journeyDreamsign" || !record(screen.choice)) return false;
    const raw = screen.choice;
    if (raw.kind !== "subtype" || !index(raw.permissionSeq) || !record(raw.current) || !record(raw.resume) || !record(raw.continuation)) return false;
    const r = raw.resume, old = r.before;
    if (!record(old) || Object.keys(old).length !== keys.length || keys.some(key => !(key in old)) || !validEntries(old.deck) || !record(old.screen) || !record(old.siteRuntime) || !Array.isArray(old.dreamsigns) || old.dreamsigns.some(sign => !record(sign) || dreamsignIdFromUnknown(sign.id) === null) || typeof old.essence !== "number" || !Number.isFinite(old.essence) || old.essence < 0 || !record(old.shopModifiers) || !record(old.atlas) || !record(old.atlas.nodes) || !(old.draftState === null || record(old.draftState))) return false;
    if (old.currentDreamscape !== journey.currentDreamscape || !validBefore(old, journey)) return false;
    if (!isKnownEventType(String(r.eventType) as Uppercase<string>) || !isGameplayEventType(r.eventType as import("../events").GameEventType) || r.eventType === "RESOLVE_JOURNEY_SUBTYPE" || !(r.siteId === null || siteIdFromUnknown(r.siteId) !== null) || !index(r.sourceIndex)) return false;
    if (!Array.isArray(r.sources) || r.sourceIndex >= r.sources.length || !Array.isArray(r.observerSources) || !Array.isArray(r.copySources) || !Array.isArray(r.starterSources) || !Array.isArray(r.transfigurations) || !Array.isArray(r.purges) || !validEntries(r.attemptedEntries)) return false;
    const sources = (list: unknown[], contiguous: boolean) => {
      let previous = -1;
      return list.every(source => {
        if (!record(source) || dreamsignIdFromUnknown(source.dreamsignId) === null || !index(source.heldIndex) || source.heldIndex <= previous || contiguous && source.heldIndex !== previous + 1) return false;
        previous = source.heldIndex; return true;
      });
    };
    if (!sources(r.sources, false) || !sources(r.observerSources, true) || !sources(r.copySources, false) || !sources(r.starterSources, false)) return false;
    const observers: unknown[] = r.observerSources;
    if (r.sources.some(source => !record(source) || !observers.some(held => record(held) && held.heldIndex === source.heldIndex && held.dreamsignId === source.dreamsignId))) return false;
    const choice = raw as unknown as JourneyDreamsignSubtypeChoice;
    if (!choice.resume.sources.some(source => registry.lookup(source.dreamsignId)?.journeyOnGain?.kind === "deckSubtypeOnGain")) return false;
    const processed = choice.resume.sources.slice(0, choice.resume.sourceIndex);
    const expectedCopies = processed.filter(source => registry.lookup(source.dreamsignId)?.journeyOnGain?.kind === "copyOwnedDreamsignOnGain" && choice.resume.observerSources.length > 1);
    const expectedStarters = processed.filter(source => registry.lookup(source.dreamsignId)?.journeyOnGain?.kind === "purgeStarterOnGain");
    const sameSources = (expected: typeof processed, actual: Readonly<typeof processed>) => expected.length === actual.length && expected.every((source, n) => source.dreamsignId === actual[n].dreamsignId && source.heldIndex === actual[n].heldIndex);
    if (!sameSources(expectedCopies, choice.resume.copySources) || !sameSources(expectedStarters, choice.resume.starterSources)) return false;
    const source = choice.resume.sources[choice.resume.sourceIndex], effect = registry.lookup(source.dreamsignId)?.journeyOnGain;
    if (choice.resume.sources.slice(choice.resume.sourceIndex + 1).some(item => registry.lookup(item.dreamsignId)?.journeyOnGain?.kind === "copyOwnedDreamsignOnGain" && journey.dreamsigns[item.heldIndex]?.id !== item.dreamsignId)) return false;
    if (choice.current.kind === "deckSubtype") {
      if (effect?.kind !== "deckSubtypeOnGain" || !Array.isArray(choice.current.entries)) return false;
      const expected = journey.deck.flatMap(entry => { const card = journeyTransfigurationCard(entry); if (card === null) throw new Error("Unavailable cohort content"); return card.cardType === "Character" ? [{ entryId: entry.entryId, cardId: card.cardId }] : []; });
      if (expected.length !== choice.current.entries.length || expected.some((entry, n) => choice.current.kind !== "deckSubtype" || entry.entryId !== choice.current.entries[n].entryId || entry.cardId !== choice.current.entries[n].cardId)) return false;
      const ids = new Set();
      for (const target of choice.current.entries) {
        if (!record(target) || deckEntryIdFromUnknown(target.entryId) === null || cardIdFromUnknown(target.cardId) === null || ids.has(target.entryId)) return false;
        ids.add(target.entryId);
        const entry = journey.deck.find(entry => entry.entryId === target.entryId), card = entry === undefined ? null : journeyTransfigurationCard(entry);
        if (card === null || card.cardId !== target.cardId || card.cardType !== "Character") return false;
      }
    } else if (choice.current.kind !== "typeRemap" || effect?.kind !== "typeRemapOnGain") return false;
    const transformedIds = new Set();
    for (const occurrence of r.transfigurations) {
      if (!record(occurrence) || !validEntries([occurrence.entry]) || cardIdFromUnknown(occurrence.cardId) === null) return false;
      const entry = occurrence.entry as DeckEntry;
      if (transformedIds.has(entry.entryId)) return false;
      transformedIds.add(entry.entryId);
      const card = journeyTransfigurationCard(entry);
      if (card?.cardId !== occurrence.cardId || card?.cardType !== occurrence.cardType || (occurrence.entry as DeckEntry).transfiguration === null) return false;
    }
    const purgeIds = new Set();
    for (const purge of r.purges) { if (!record(purge) || deckEntryIdFromUnknown(purge.entryId) === null || purgeIds.has(purge.entryId) || purge.cardId !== undefined && cardIdFromUnknown(purge.cardId) === null) return false; purgeIds.add(purge.entryId); }
    // Existing queue validators own their earned-source and continuation contracts.
    const tail = finishJourneyAcquisition(subtypeContinuation(journey), choice.resume.copySources, choice.resume.starterSources, [], choice.permissionSeq, choice.suspendedBattle);
    const projected = c12(journey, choice, tail.screen as JourneyDreamsignSubtypeChoice["continuation"]);
    if (choice.current.kind === "typeRemap") return validTypeRemapScreen(projected.screen, projected, registry);
    return validSubtypeTail(tail, registry, choice);
  } catch { return false; }
}

import { validStarterPurgeScreen } from "./journey-starter-acquisition";
import { validJourneyDreamsignScreen } from "./journey-on-gain";
import { validJourneyPurgeScreen } from "./journey-purge";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import { validJourneyTransfigurationScreen } from "./journey-transfiguration";
import { findSite } from "./sites";
function validSubtypeTail(tail: JourneyState, registry: JourneyModifierRegistry, choice: JourneyDreamsignSubtypeChoice): boolean {
  const screen = tail.screen;
  if (screen.type === "journeyStarterPurge") return validStarterPurgeScreen(screen, tail, registry);
  if (screen.type === "journeyDreamsign") return screen.choice.kind !== "subtype" && screen.choice.kind !== "typeRemap" && validJourneyDreamsignScreen(screen, tail, registry);
  if (screen.type === "journeyPurge") return validJourneyPurgeScreen(screen, tail, registry);
  if (screen.type === "journeyDuplication") return validJourneyDuplicationScreen(screen, tail, registry);
  if (screen.type === "journeyTransfiguration") return validJourneyTransfigurationScreen(screen, tail, registry);
  if (screen.type === "site") return siteIdFromUnknown(screen.siteId) !== null && findSite(tail, screen.siteId) !== undefined && tail.currentDreamscape !== null && tail.atlas.nodes[tail.currentDreamscape]?.sites.some(site => site.id === screen.siteId) === true;
  return ["journeyStart", "atlas", "dreamscape", "journeyComplete", "journeyFailed"].includes(screen.type) && choice.continuation.type === screen.type;
}

export function validJourneySubtypeBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "subtype") return false;
  return validTypeRemapBattleBinding(c12(journey, journey.screen.choice), battle);
}
export function validJourneySubtypeIntent(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): boolean {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "subtype" || !validJourneySubtypeScreen(journey.screen, journey, registry) || !validJourneySubtypeBattleBinding(journey, battle)) return false;
  const choice = journey.screen.choice, source = choice.resume.sources[choice.resume.sourceIndex];
  if (payload.sourceDreamsignId !== source.dreamsignId || payload.heldIndex !== source.heldIndex || payload.choiceIndex !== choice.resume.sourceIndex || payload.permissionSeq !== choice.permissionSeq || !journeyTypeRemapTypes().includes(payload.chosenSubtype as CardSubtype)) return false;
  return choice.current.kind !== "typeRemap" || validTypeRemapIntent(c12(journey, choice), { ...payload, choiceIndex: 0 }, battle, registry);
}
export function resolveJourneySubtype(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null, registry: JourneyModifierRegistry): JourneyState | null {
  if (!validJourneySubtypeIntent(journey, payload, battle, registry) || journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "subtype") return null;
  const choice = journey.screen.choice;
  if (choice.current.kind === "typeRemap") {
    const result = resolveTypeRemap(c12(journey, choice), { ...payload, choiceIndex: 0 }, battle, registry);
    return result === null ? null : { ...result, screen: choice.continuation };
  }
  const ids = new Set(choice.current.entries.map(entry => entry.entryId));
  return { ...journey, screen: choice.continuation, deck: journey.deck.map(entry => ids.has(entry.entryId) ? { ...entry, typeChange: { predicateId: parseCardTypeChangePredicateId("journey-character-subtype"), cardType: "Character", subtype: payload.chosenSubtype as CardSubtype, label: "" } } : entry) };
}
export function assertJourneySubtypeCheckpoint(value: unknown, registry: JourneyModifierRegistry): void {
  if (!record(value) || !record(value.journey) || !record(value.journey.screen) || !record(value.journey.screen.choice) || value.journey.screen.choice.kind !== "subtype") return;
  const state = value as unknown as FoldState;
  if (!validJourneySubtypeScreen(state.journey.screen, state.journey, registry) || !validJourneySubtypeBattleBinding(state.journey, state.battle) || state.journey.screen.type === "journeyDreamsign" && state.journey.screen.choice.kind === "subtype" && state.journey.screen.choice.suspendedBattle?.mode === "tutorial" && (state.frontDoor?.phase !== "tutorial" || state.battle?.mode.kind !== "tutorial" || state.frontDoor.tutorial?.runId !== state.battle.mode.tutorialRunId)) throw new Error("Journey subtype checkpoint requires valid acquisition and battle provenance");
}
