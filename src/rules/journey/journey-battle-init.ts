import type { OpeningHandGuarantee } from "../../engine/state/types";
import type { CardId } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, parseBattleId, parseDreamsignId, siteIdFromUnknown } from "../../types/identifiers";
import type { AfterBattleJourneyChoice, DeckEntry, JourneyBattleInitEffect, JourneyDreamsignCopyChoice, JourneyDreamsignGain, JourneyOnGainEffect, JourneyState } from "../../types/journey";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";
import { journeyOnGain, validJourneyDreamsignScreen, validDreamsignBattleBinding } from "./journey-on-gain";
import { validStarterPurgeScreen, validStarterBattleBinding } from "./journey-starter-acquisition";
import { journeyTransfigurationCard, validJourneyTransfigurationScreen, type JourneyTransfigurationProvider } from "./journey-transfiguration";
import { journeyBattleOf, type BattleFoldState } from "../battle/fold";
import { validAfterBattleChoice } from "./journey-after-battle";
import { validJourneyPurgeScreen } from "./journey-purge";
import { validJourneyDuplicationScreen } from "./journey-duplication";
import { findSite } from "./sites";

type Lookup = JourneyModifierRegistry["lookup"];
type Acquisition = Extract<JourneyOnGainEffect, { kind: "chooseOpeningHandEventOnGain" }>;
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const index = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

/** The public journey primitive composes acquisition with its held binding. */
export function journeyBattleInit(dreamsignId: import("../../types/identifiers").DreamsignId,
  descriptor: JourneyBattleInitEffect, acquisition: Acquisition): JourneyModifierDefinition {
  if (descriptor.kind !== "chosenOpeningHandEntry" || acquisition.kind !== "chooseOpeningHandEventOnGain") {
    throw new RangeError("Invalid journeyBattleInit descriptor.");
  }
  return { ...journeyOnGain(parseDreamsignId(dreamsignId), acquisition), journeyBattleInit: Object.freeze({ ...descriptor }) };
}

/** An unavailable canonical card is distinct from an available empty Event set. */
export function journeyOpeningHandEntries(deck: readonly DeckEntry[], resolve: JourneyTransfigurationProvider["resolve"]):
  readonly { readonly entry: Readonly<DeckEntry>; readonly cardId: CardId }[] | null {
  const eligible: { entry: Readonly<DeckEntry>; cardId: CardId }[] = [];
  for (const entry of deck) {
    const card = resolve(entry);
    if (card === null) return null;
    if (card.cardType === "Event") eligible.push({ entry, cardId: card.cardId });
  }
  return eligible;
}

/** Only the owned optional field is constrained; purged targets remain inert. */
export function validJourneyOpeningBindings(signs: unknown, lookup: Lookup): boolean {
  if (!Array.isArray(signs)) return false;
  return signs.every((sign: unknown) => {
    if (typeof sign !== "object" || sign === null || Array.isArray(sign)) return false;
    if (!("openingHandEntryId" in sign)) return true;
    const id = "id" in sign ? dreamsignIdFromUnknown(sign.id) : null;
    return id !== null && deckEntryIdFromUnknown(sign.openingHandEntryId) !== null &&
      lookup(id)?.journeyBattleInit?.kind === "chosenOpeningHandEntry";
  });
}

/** Padding retains this original prefix; select exactly one original input slot. */
export function journeyOpeningHandGuarantees(journey: Pick<JourneyState, "deck" | "dreamsigns">,
  lookup: Lookup): readonly OpeningHandGuarantee[] {
  if (!validJourneyOpeningBindings(journey.dreamsigns, lookup)) throw new Error("Invalid journey opening-hand binding.");
  return journey.dreamsigns.flatMap((sign, heldIndex) => {
    if (lookup(sign.id)?.journeyBattleInit?.kind !== "chosenOpeningHandEntry" || sign.openingHandEntryId === undefined) return [];
    const deckIndex = journey.deck.findIndex((entry) => entry.entryId === sign.openingHandEntryId);
    return deckIndex < 0 ? [] : [{ deckIndex, entryId: sign.openingHandEntryId, dreamsignId: sign.id, heldIndex }];
  });
}

/** Original acquired source identity decides a cursor role, including after conversion. */
export function journeyAcquisitionKind(source: JourneyDreamsignGain, lookup: Lookup): JourneyDreamsignCopyChoice["kind"] | null {
  const effect = lookup(source.dreamsignId)?.journeyOnGain;
  if (effect?.kind === "copyOwnedDreamsignOnGain") return "copy";
  return effect?.kind === "chooseOpeningHandEventOnGain" && lookup(source.dreamsignId)?.journeyBattleInit?.kind === "chosenOpeningHandEntry"
    ? "openingHand" : null;
}

/** One finite mandatory cursor, with the pre-existing terminal continuation. */
export function advanceJourneyAcquisition(journey: JourneyState, choice: JourneyDreamsignCopyChoice, lookup: Lookup): JourneyState {
  const next = choice.index + 1;
  if (next === choice.sources.length) return { ...journey, screen: choice.continuation };
  const kind = journeyAcquisitionKind(choice.sources[next], lookup);
  if (kind === null) throw new Error("Journey acquisition role is unavailable.");
  return { ...journey, screen: { type: "journeyDreamsign", choice: { ...choice, kind, index: next, heldIds: journey.dreamsigns.map((sign) => sign.id) } } };
}

/** Validate the complete shared cursor while retaining legacy all-copy snapshots. */
export function validJourneyAcquisitionScreen(screen: unknown, journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (!record(screen) || screen.type !== "journeyDreamsign" || !record(screen.choice)) return false;
  const choice = screen.choice;
  if ((choice.kind !== "copy" && choice.kind !== "openingHand") || !Array.isArray(choice.sources) || choice.sources.length === 0 ||
    !index(choice.index) || choice.index >= choice.sources.length || !index(choice.permissionSeq) ||
    !Array.isArray(choice.heldIds) || choice.heldIds.length !== journey.dreamsigns.length ||
    choice.heldIds.some((id, i) => id !== journey.dreamsigns[i].id) || !record(choice.continuation)) return false;
  let previous = -1;
  for (const [n, source] of choice.sources.entries()) {
    if (!record(source) || !index(source.heldIndex) || source.heldIndex >= journey.dreamsigns.length || source.heldIndex <= previous) return false;
    previous = source.heldIndex;
    const id = dreamsignIdFromUnknown(source.dreamsignId);
    if (id === null) return false;
    const kind = journeyAcquisitionKind({ dreamsignId: id, heldIndex: source.heldIndex }, (key) => registry.lookup(key));
    if (kind === null || kind === "copy" && journey.dreamsigns.length < 2 ||
      n === choice.index && kind !== choice.kind || n >= choice.index && journey.dreamsigns[source.heldIndex]?.id !== id) return false;
  }
  const continuation = choice.continuation;
  if (continuation.type === "journeyDreamsign") {
    if (!record(continuation.choice) || continuation.choice.kind !== "afterBattle" || !validAfterBattleChoice(continuation.choice, journey, registry)) return false;
    const earned = continuation.choice as unknown as AfterBattleJourneyChoice;
    if (earned.sources[earned.index].kind !== "dreamsign") return false;
  } else if (continuation.type === "journeyPurge") {
    if (!validJourneyPurgeScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "journeyDuplication") {
    if (!validJourneyDuplicationScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "journeyTransfiguration") {
    if (!validJourneyTransfigurationScreen(continuation, journey, registry)) return false;
  } else if (continuation.type === "site" ? siteIdFromUnknown(continuation.siteId) === null :
    !["journeyStart", "atlas", "dreamscape", "journeyComplete", "journeyFailed"].includes(String(continuation.type))) return false;
  if (continuation.type === "site" && (findSite(journey, siteIdFromUnknown(continuation.siteId)!) === undefined ||
    journey.currentDreamscape === null || !journey.atlas.nodes[journey.currentDreamscape]?.sites.some((site) => site.id === continuation.siteId))) return false;
  const binding = choice.suspendedBattle;
  if (binding === null) return true;
  if (!record(binding) || typeof binding.battleId !== "string" || (binding.mode !== "journey" && binding.mode !== "tutorial")) return false;
  try { parseBattleId(binding.battleId); } catch { return false; }
  return true;
}

export function validJourneyAcquisitionBattleBinding(journey: JourneyState, battle: BattleFoldState | null): boolean {
  if (journey.screen.type !== "journeyDreamsign" || (journey.screen.choice.kind !== "copy" && journey.screen.choice.kind !== "openingHand")) return battle === null;
  const { suspendedBattle: binding, continuation } = journey.screen.choice;
  if (binding === null) return battle === null;
  if (battle === null || battle.init.battleId !== binding.battleId || battle.mode.kind !== binding.mode) return false;
  const init = journeyBattleOf(battle)?.init;
  return binding.mode === "tutorial" || init !== undefined && continuation.type === "site" && continuation.siteId === init.siteId &&
    journey.currentDreamscape === init.nodeId && journey.completionLevel === init.completionLevelAtStart;
}

/** A starter permission cannot renumber an unresolved acquired Mug occurrence. */
export function hasStarterOpeningContinuation(journey: JourneyState, registry: JourneyModifierRegistry): boolean {
  if (journey.screen.type !== "journeyStarterPurge") return false;
  const continuation = journey.screen.choice.continuation;
  return continuation.type === "journeyDreamsign" && (continuation.choice.kind === "copy" || continuation.choice.kind === "openingHand") &&
    continuation.choice.sources.some((source) => registry.lookup(source.dreamsignId)?.journeyOnGain?.kind === "chooseOpeningHandEventOnGain");
}

/** Matching permission and canonical physical eligibility precede every mutation. */
function authorizedOpeningSelection(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null,
  registry: JourneyModifierRegistry) {
  if (journey.screen.type !== "journeyDreamsign" || journey.screen.choice.kind !== "openingHand" ||
    !validJourneyAcquisitionScreen(journey.screen, journey, registry) || !validJourneyAcquisitionBattleBinding(journey, battle)) return null;
  const choice = journey.screen.choice, source = choice.sources[choice.index];
  if (payload.dreamsignId !== source.dreamsignId || payload.heldIndex !== source.heldIndex ||
    payload.choiceIndex !== choice.index || payload.permissionSeq !== choice.permissionSeq) return null;
  const entries = journeyOpeningHandEntries(journey.deck, journeyTransfigurationCard);
  if (entries === null) return null;
  if (payload.entryId === null) return entries.length === 0 ? { choice, source, selected: null } : null;
  const id = deckEntryIdFromUnknown(payload.entryId);
  const selected = id === null ? undefined : entries.find(({ entry }) => entry.entryId === id);
  return selected === undefined ? null : { choice, source, selected };
}

export function validOpeningHandIntent(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null,
  registry: JourneyModifierRegistry): boolean {
  return authorizedOpeningSelection(journey, payload, battle, registry) !== null;
}

export function resolveOpeningHandEntry(journey: JourneyState, payload: Record<string, unknown>, battle: BattleFoldState | null,
  registry: JourneyModifierRegistry): { readonly journey: JourneyState; readonly cardId: CardId | null } | null {
  const authorized = authorizedOpeningSelection(journey, payload, battle, registry);
  if (authorized === null) return null;
  const { choice, source, selected } = authorized;
  const next = selected === null ? journey : { ...journey, dreamsigns: journey.dreamsigns.map((sign, i) =>
    i === source.heldIndex ? { ...sign, openingHandEntryId: selected.entry.entryId } : sign) };
  return { journey: advanceJourneyAcquisition(next, choice, id => registry.lookup(id)), cardId: selected?.cardId ?? null };
}

/** Checkpoint recovery validates only the owned binding and mandatory cursor seam. */
export function assertJourneyOpeningCheckpoint(value: unknown, registry: JourneyModifierRegistry): void {
  if (!record(value) || !record(value.journey)) return;
  const journey = value.journey;
  if (!validJourneyOpeningBindings(journey.dreamsigns, id => registry.lookup(id))) throw new Error("Invalid journey opening-hand checkpoint binding.");
  const ownsSource = (sources: unknown) => Array.isArray(sources) && sources.some(source => {
    const id = record(source) ? dreamsignIdFromUnknown(source.dreamsignId) : null;
    return id !== null && registry.lookup(id)?.journeyOnGain?.kind === "chooseOpeningHandEventOnGain";
  });
  const ownsPermission = (screen: unknown): boolean => {
    if (!record(screen) || !record(screen.choice)) return false;
    const choice = screen.choice;
    if (screen.type === "journeyStarterPurge" || screen.type === "journeyDreamsign" && choice.kind === "typeRemap") return ownsPermission(choice.continuation);
    return screen.type === "journeyDreamsign" && (choice.kind === "openingHand" || ownsSource(choice.sources) ||
      choice.kind === "subtype" && record(choice.resume) && ownsSource(choice.resume.sources));
  };
  if (!ownsPermission(journey.screen)) return;
  const projected = journey as unknown as JourneyState, battle = value.battle as BattleFoldState | null;
  const starter = projected.screen.type === "journeyStarterPurge";
  if (!(starter ? validStarterPurgeScreen(projected.screen, projected, registry) && validStarterBattleBinding(projected, battle)
    : validJourneyDreamsignScreen(projected.screen, projected, registry) && validDreamsignBattleBinding(projected, battle))) {
    throw new Error("Invalid journey opening-hand checkpoint permission.");
  }
  const screen = journey.screen;
  const binding = record(screen) && record(screen.choice) ? screen.choice.suspendedBattle : null;
  if (record(binding) && binding.mode === "tutorial") {
    const frontDoor = value.frontDoor;
    if (!record(frontDoor) || frontDoor.phase !== "tutorial" || !record(frontDoor.tutorial) || !record(value.battle) ||
      !record(value.battle.mode) || value.battle.mode.kind !== "tutorial" || frontDoor.tutorial.runId !== value.battle.mode.tutorialRunId) {
      throw new Error("Invalid journey opening-hand tutorial provenance.");
    }
  }
}
