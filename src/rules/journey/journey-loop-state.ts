/** Intrinsic saved-state contracts and exact whole-fold battle custody for journey draws. */
import type { FoldState } from "../fold-state";
import type { JourneyLoopBattleBinding, JourneyOperationCause, JourneyEarnedLoopInstruction, JourneyDreamsignGain, DeckEntry, TransfigurationType } from "../../types/journey";
import { cardIdFromUnknown } from "../../types/card-identity";
import { deckEntryIdFromUnknown, dreamsignIdFromUnknown, parseBattleId, parseTutorialRunId, siteIdFromUnknown } from "../../types/identifiers";
import { copyTransfigurationApplications, isTransfigurationApplications } from "../../engine/transfiguration-application-data";
import { isDeckEntryTransfigurationRecord } from "../../transfiguration/deck-entry-transfigurations";
import { validJourneyTransfigurationRecord } from "./journey-transfiguration";
import type { JourneyModifierRegistry } from "./modifier-registry";
import { journeyInstructionSource } from "./journey-mandatory-loop";

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const array = (value: unknown): value is readonly unknown[] => Array.isArray(value);
const integer = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const forms = ["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"];
function source(value: unknown): value is JourneyDreamsignGain { return record(value) && dreamsignIdFromUnknown(value.dreamsignId) !== null && integer(value.heldIndex); }
function sources(value: unknown, nonempty = false): value is readonly JourneyDreamsignGain[] {
  return array(value) && (!nonempty || value.length > 0) && value.every(source) && new Set(value.map(item => item.heldIndex)).size === value.length;
}
function cause(value: unknown): value is JourneyOperationCause {
  return record(value) && Object.keys(value).length === ("causalSeq" in value ? 6 : 5) && (!("causalSeq" in value) || integer(value.causalSeq) && Number(value.causalSeq) > Number(value.eventSeq)) && integer(value.eventSeq) && value.eventSeq > 0 && integer(value.ordinal) && integer(value.applicationIndex) && deckEntryIdFromUnknown(value.entryId) !== null && cardIdFromUnknown(value.cardId) !== null;
}
function binding(value: unknown): value is JourneyLoopBattleBinding | null {
  if (value === null) return true;
  if (!record(value)) return false;
  try {
    parseBattleId(value.battleId);
    if (value.mode === "journey") return !("tutorialRunId" in value);
    if (value.mode !== "tutorial") return false;
    parseTutorialRunId(value.tutorialRunId);
    return true;
  } catch { return false; }
}
function entryProjection(value: unknown): Readonly<DeckEntry> | null {
  if (!record(value) || !integer(value.cardNumber) || typeof value.isBane !== "boolean" || typeof value.transfiguration !== "string" || !forms.includes(value.transfiguration) || !isDeckEntryTransfigurationRecord(value)) return null;
  const entryId = deckEntryIdFromUnknown(value.entryId), applications = value.transfigurationApplications;
  if (entryId === null || applications !== undefined && !isTransfigurationApplications(applications)) return null;
  return { entryId, cardNumber: value.cardNumber, isBane: value.isBane, transfiguration: value.transfiguration as TransfigurationType,
    ...(applications === undefined ? {} : { transfigurationApplications: applications }) };
}
function instruction(value: unknown, registry?: JourneyModifierRegistry): value is JourneyEarnedLoopInstruction {
  if (!record(value) || value.kind !== "mandatoryOriginalTransfiguration" || !integer(value.permissionSeq) || !cause(value.cause) || value.permissionSeq < 1 || value.permissionSeq > (value.cause.causalSeq ?? value.cause.eventSeq) || !sources(value.sourceObserverSources, true) || !source(value.source)) return false;
  const earnedSource = value.source;
  if (!value.sourceObserverSources.some(item => item.heldIndex === earnedSource.heldIndex && item.dreamsignId === earnedSource.dreamsignId)) return false;
  // Only this validated projection is consumed by the source executor; saved optional modifications are never cast into it.
  const parent = entryProjection(value.parentEntry);
  if (parent === null || parent.entryId !== value.cause.entryId || value.cause.applicationIndex !== (parent.transfigurationApplications?.length ?? 1) - 1) return false;
  if (registry !== undefined) {
    const spec = journeyInstructionSource(registry.lookup(value.source.dreamsignId), value.cause.cardId);
    if (spec === undefined || spec.cardId !== value.cause.cardId || spec.provider.resolve(parent)?.cardId !== value.cause.cardId || !validJourneyTransfigurationRecord(parent)) return false;
  }
  return true;
}
/** Optional absent fields preserve legacy saves. Present fields are never silently trusted. */
export function validJourneyLoopState(value: unknown, registry?: JourneyModifierRegistry): boolean {
  if (!record(value)) return false;
  const pendingPresent = "pendingJourneyLoop" in value, drawPresent = "journeyDraw" in value;
  if (!pendingPresent && !drawPresent) return true;
  if (pendingPresent && drawPresent || !record(value.screen) || !array(value.deck)) return false;
  if (pendingPresent) {
    const pending = value.pendingJourneyLoop;
    if (!record(pending) || pending.kind !== "earnedOriginalTransfiguration" || !integer(pending.permissionSeq) || pending.permissionSeq < 1 || pending.siteId !== null && siteIdFromUnknown(pending.siteId) === null || !binding(pending.suspendedBattle) || !sources(pending.observerSources) || !array(pending.instructions) || pending.instructions.length === 0 || !pending.instructions.every((item): item is JourneyEarnedLoopInstruction => instruction(item, registry))) return false;
    if (!["journeyDreamsign", "journeyPurge", "journeyTransfiguration", "journeyStarterPurge"].includes(value.screen.type as string)) return false;
    const deck = value.deck;
    if (!pending.instructions.every(item => {
      const targets = deck.filter(entry => record(entry) && entry.entryId === item.cause.entryId);
      if (targets.length === 0) return true;
      if (targets.length !== 1) return false;
      const target = entryProjection(targets[0]);
      if (target === null || target.cardNumber !== item.parentEntry.cardNumber) return false;
      const parentApplications = item.parentEntry.transfigurationApplications;
      if (parentApplications !== undefined && (target.transfigurationApplications === undefined || JSON.stringify(copyTransfigurationApplications(target.transfigurationApplications.slice(0, parentApplications.length))) !== JSON.stringify(copyTransfigurationApplications(parentApplications)))) return false;
      if (registry === undefined) return true;
      const spec = journeyInstructionSource(registry.lookup(item.source.dreamsignId), item.cause.cardId);
      return spec !== undefined && spec.provider.validateRecord?.(target) === true && spec.provider.resolve(target)?.cardId === item.cause.cardId;
    })) return false;
    const identities = pending.instructions.map(item => JSON.stringify([item.cause.causalSeq ?? item.cause.eventSeq, item.cause.ordinal, item.source.heldIndex]));
    const snapshotKey = (items: readonly JourneyDreamsignGain[]) => JSON.stringify(items.map(item => [item.heldIndex, item.dreamsignId]));
    const first = pending.instructions[0];
    if (pending.permissionSeq !== first.permissionSeq || snapshotKey(pending.observerSources) !== snapshotKey(first.sourceObserverSources)) return false;
    return new Set(identities).size === identities.length && pending.instructions.every((item, index, items) => index === 0 ||
      (item.cause.causalSeq ?? item.cause.eventSeq) > (items[index - 1].cause.causalSeq ?? items[index - 1].cause.eventSeq) || (item.cause.causalSeq ?? item.cause.eventSeq) === (items[index - 1].cause.causalSeq ?? items[index - 1].cause.eventSeq) &&
      item.cause.ordinal >= items[index - 1].cause.ordinal && snapshotKey(item.sourceObserverSources) === snapshotKey(items[index - 1].sourceObserverSources));
  }
  const draw = value.journeyDraw;
  if (!record(draw) || draw.kind !== "mandatoryJourneyLoop" || draw.result !== "draw" || !integer(draw.committedSeq) || draw.committedSeq < 1 || "committedCausalSeq" in draw && (!integer(draw.committedCausalSeq) || Number(draw.committedCausalSeq) <= draw.committedSeq) || !cause(draw.cause) || Number(draw.committedCausalSeq ?? draw.committedSeq) < (draw.cause.causalSeq ?? draw.cause.eventSeq) || !source(draw.earnedSource) || !sources(draw.continuingSources, true) || !binding(draw.abandonedBattle) || value.screen.type !== "journeyFailed" || !record(draw.proof)) return false;
  const proof = draw.proof;
  if (proof.kind !== "canonicalTransfigurationTypeClosure" || !["Character", "Event"].includes(proof.cardType as string) || proof.anchor !== (proof.cardType === "Character" ? "Kindled" : "Inspired") || !array(proof.applicableForms) || !proof.applicableForms.includes(proof.anchor) || proof.applicableForms.some(form => typeof form !== "string" || !forms.includes(form)) || new Set(proof.applicableForms).size !== proof.applicableForms.length) return false;
  const rootCause = draw.cause;
  const target = value.deck.find(entry => record(entry) && entry.entryId === rootCause.entryId);
  const root = entryProjection(target);
  if (root === null || draw.cause.applicationIndex >= (root.transfigurationApplications?.length ?? 1)) return false;

  return true;
}

/** Capture only the battle currently suspended after the domain transition. */
export function journeyLoopBattleBinding(state: FoldState): JourneyLoopBattleBinding | null {
  const battle = state.battle;
  if (battle === null) return null;
  if (battle.mode.kind === "journey") return { battleId: battle.init.battleId, mode: "journey" };
  if (state.frontDoor.tutorial?.runId !== battle.mode.tutorialRunId || state.frontDoor.phase !== "tutorial") throw new Error("Journey loop tutorial binding mismatch");
  return { battleId: battle.init.battleId, mode: "tutorial", tutorialRunId: battle.mode.tutorialRunId };
}
function sameBinding(a: JourneyLoopBattleBinding | null, b: JourneyLoopBattleBinding | null): boolean {
  if (a === null || b === null) return a === b;
  return a.battleId === b.battleId && a.mode === b.mode && (a.mode !== "tutorial" || b.mode === "tutorial" && a.tutorialRunId === b.tutorialRunId);
}
export function validJourneyLoopFold(state: FoldState, registry?: JourneyModifierRegistry): boolean {
  if (!validJourneyLoopState(state.journey, registry)) return false;
  if (state.journey.journeyDraw !== undefined) return state.battle === null && state.frontDoor.phase === "journey";
  const pending = state.journey.pendingJourneyLoop;
  if (pending === undefined) return true;
  try { return sameBinding(pending.suspendedBattle, journeyLoopBattleBinding(state)); } catch { return false; }
}
/** Validate custody before clearing a battle; historical completed battle summaries are retained. */
export function commitJourneyLoopFold(state: FoldState): FoldState {
  const draw = state.journey.journeyDraw;
  if (draw === undefined) return state;
  if (!sameBinding(draw.abandonedBattle, journeyLoopBattleBinding(state))) throw new Error("Journey loop battle binding mismatch");
  return { ...state, battle: null, frontDoor: { ...state.frontDoor, phase: "journey" } };
}
export function assertJourneyLoopCheckpoint(state: unknown): void {
  if (!record(state) || !validJourneyLoopState(state.journey)) throw new Error("Invalid journey loop checkpoint");
  const journey = state.journey;
  if (!record(journey)) throw new Error("Invalid journey loop checkpoint");
  if (journey.journeyDraw !== undefined && (state.battle !== null || !record(state.frontDoor) || state.frontDoor.phase !== "journey")) throw new Error("Invalid journey loop terminal checkpoint");
  if (record(journey.pendingJourneyLoop)) {
    const actual = savedBattleBinding(state);
    if (actual === undefined || !binding(journey.pendingJourneyLoop.suspendedBattle) || !sameBinding(journey.pendingJourneyLoop.suspendedBattle, actual)) throw new Error("Invalid journey loop pending checkpoint");
  }
}
function savedBattleBinding(state: Record<string, unknown>): JourneyLoopBattleBinding | null | undefined {
  if (state.battle === null) return null;
  if (!record(state.battle) || !record(state.battle.init) || !record(state.battle.mode)) return undefined;
  try {
    const battleId = parseBattleId(state.battle.init.battleId);
    if (state.battle.mode.kind === "journey") return { mode: "journey", battleId };
    if (state.battle.mode.kind !== "tutorial" || !record(state.frontDoor) || state.frontDoor.phase !== "tutorial" || !record(state.frontDoor.tutorial)) return undefined;
    const tutorialRunId = parseTutorialRunId(state.battle.mode.tutorialRunId);
    return state.frontDoor.tutorial.runId === tutorialRunId ? { mode: "tutorial", battleId, tutorialRunId } : undefined;
  } catch { return undefined; }
}
