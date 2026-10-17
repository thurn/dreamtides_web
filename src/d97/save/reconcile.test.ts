// Reconciliation over a synthetic save: a fully resolvable save is untouched;
// a retired card maps to its replacement everywhere it appears; an owned copy
// of a retired card without one is removed and compensated in Essence while
// its other references are dropped; an encounter or shop on a removed anchor
// moves to a free anchor of its kind, or is dropped; places on removed
// anchors are forgotten; and a held quest whose definition was removed is
// abandoned.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D97SaveTuning } from "../../content/d97/save";
import { DEVELOPMENT_DREAM } from "../../content/d97/dreams/development";
import { registerD97ContentProvider } from "../../rules/d97/d97-content";
import type { D97Encounter, D97Run } from "../../rules/d97/d97-state";
import type { CardId } from "../../types/card-identity";
import { parseD97QuestId, parseDreamAnchorId, type DreamAnchorId } from "../../types/identifiers";
import type { DreamAnchorKind } from "../map/definition";
import { reconcileSnapshot, type D97SaveCatalog } from "./reconcile";
import { foldSyntheticRun, registerSaveContent } from "./save.fixtures";
import { takeSnapshot, type D97SaveBuild, type D97Snapshot } from "./snapshot";

const BUILD = { reducerVersion: "test", gitRevision: "unknown" } as D97SaveBuild;
const TUNING: D97SaveTuning = { retirements: [], retiredCardEssence: 7 };
const QUEST = parseD97QuestId("d97a0000-0000-4000-8000-000000000001");
const CHALLENGER: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-000000000006");
const SPARE_CHALLENGER: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-000000000007");
const REMOVED: DreamAnchorId = parseDreamAnchorId("d9700000-0000-4000-8000-0000000000ff");

const ANCHORS: { id: DreamAnchorId; kind: DreamAnchorKind }[] = [
  { id: CHALLENGER, kind: "challenger" },
  { id: SPARE_CHALLENGER, kind: "challenger" },
  { id: DEVELOPMENT_DREAM.topology.shopAnchorId, kind: "shop" },
  { id: DEVELOPMENT_DREAM.topology.waypointAnchorId, kind: "waypoint" },
];

function snapshot(edit: (run: D97Run) => D97Run = (run) => run): D97Snapshot {
  const { state, seq } = foldSyntheticRun();
  const base = takeSnapshot(state, seq, [], BUILD)!;
  return { ...base, d97: { ...base.d97, run: edit(base.d97.run!) } };
}

function catalog(retired: ReadonlySet<CardId> = new Set(), overrides: Partial<D97SaveCatalog> = {}): D97SaveCatalog {
  return { hasCard: (cardId) => !retired.has(cardId), anchors: ANCHORS, questIds: new Set([QUEST]), ...overrides };
}

function encounter(anchorId: DreamAnchorId, cards: readonly CardId[]): D97Encounter {
  return { anchorId, role: "challenger", deck: cards, draftPool: cards, signatureCardIds: cards, opponentAnteCardId: cards[0] ?? null } as D97Encounter;
}

beforeEach(registerSaveContent);
afterEach(() => registerD97ContentProvider(null));

describe("reconcileSnapshot", () => {
  it("leaves a fully resolvable save untouched", () => {
    const save = snapshot();
    const result = reconcileSnapshot(save, catalog(), TUNING);
    expect(result.reconciliations).toEqual([]);
    expect(result.snapshot).toEqual(save);
  });

  it("maps a retired card to its replacement everywhere", () => {
    const save = snapshot();
    const run = save.d97.run!;
    const retired = run.collection.copies[0].cardId;
    const replacement = run.bag.entries.find((entry) => entry.cardId !== retired)!.cardId;
    const withEncounter = { ...save, d97: { ...save.d97, run: { ...run, encounters: { [CHALLENGER]: encounter(CHALLENGER, [retired]) } } } };
    const result = reconcileSnapshot(withEncounter, catalog(new Set([retired])), { ...TUNING, retirements: [{ cardId: retired, replacementId: replacement }] });
    const next = result.snapshot.d97.run!;
    expect(next.collection.copies.some((copy) => copy.cardId === retired)).toBe(false);
    expect(next.collection.copies.length).toBe(run.collection.copies.length);
    expect(next.encounters[CHALLENGER]?.deck).toEqual([replacement]);
    expect(next.essence).toBe(run.essence);
    expect(result.reconciliations.every((entry) => entry.kind === "cardReplaced")).toBe(true);
    expect(result.reconciliations.length).toBeGreaterThan(0);
  });

  it("compensates owned copies of a retired card without a replacement and drops its references", () => {
    const save = snapshot();
    const run = save.d97.run!;
    const retired = run.collection.copies[0].cardId;
    const owned = run.collection.copies.filter((copy) => copy.cardId === retired).length;
    const withEncounter = { ...save, d97: { ...save.d97, run: { ...run, encounters: { [CHALLENGER]: encounter(CHALLENGER, [retired]) } } } };
    const result = reconcileSnapshot(withEncounter, catalog(new Set([retired])), TUNING);
    const next = result.snapshot.d97.run!;
    expect(next.collection.copies.length).toBe(run.collection.copies.length - owned);
    expect(next.essence).toBe(run.essence + owned * TUNING.retiredCardEssence);
    expect(next.encounters[CHALLENGER]).toMatchObject({ deck: [], opponentAnteCardId: null });
    expect(result.reconciliations.filter((entry) => entry.kind === "cardCompensated")).toHaveLength(owned);
    expect(result.reconciliations.some((entry) => entry.kind === "cardDropped")).toBe(true);
  });

  it("moves an encounter off a removed anchor to a free anchor of its kind, or drops it", () => {
    const save = snapshot((run) => ({ ...run, encounters: { [CHALLENGER]: encounter(CHALLENGER, []), [REMOVED]: encounter(REMOVED, []) } }));
    const moved = reconcileSnapshot(save, catalog(), TUNING);
    expect(moved.snapshot.d97.run!.encounters[SPARE_CHALLENGER]?.anchorId).toBe(SPARE_CHALLENGER);
    expect(moved.reconciliations).toEqual([{ kind: "anchorMoved", where: "encounter", anchorId: REMOVED, toAnchorId: SPARE_CHALLENGER }]);
    const full = reconcileSnapshot(save, catalog(new Set(), { anchors: ANCHORS.filter((anchor) => anchor.id !== SPARE_CHALLENGER) }), TUNING);
    expect(full.snapshot.d97.run!.encounters[REMOVED]).toBeUndefined();
    expect(full.reconciliations).toEqual([{ kind: "anchorDropped", where: "encounter", anchorId: REMOVED }]);
  });

  it("forgets places on removed anchors", () => {
    const save = snapshot((run) => ({ ...run, lastPlace: { kind: "door", anchorId: REMOVED }, returnAnchorId: REMOVED, activeWaypointIds: [REMOVED, DEVELOPMENT_DREAM.topology.waypointAnchorId] }));
    const next = reconcileSnapshot(save, catalog(), TUNING).snapshot.d97.run!;
    expect(next.lastPlace).toBeNull();
    expect(next.returnAnchorId).toBeNull();
    expect(next.activeWaypointIds).toEqual([DEVELOPMENT_DREAM.topology.waypointAnchorId]);
  });

  it("abandons a held quest whose definition was removed", () => {
    const save = snapshot((run) => ({ ...run, quests: { ...run.quests, active: { questId: QUEST, completedStepIds: [] } } }));
    const kept = reconcileSnapshot(save, catalog(), TUNING);
    expect(kept.snapshot.d97.run!.quests.active?.questId).toBe(QUEST);
    const removed = reconcileSnapshot(save, catalog(new Set(), { questIds: new Set() }), TUNING);
    expect(removed.snapshot.d97.run!.quests.active).toBeNull();
    expect(removed.reconciliations).toEqual([{ kind: "questAbandoned", questId: QUEST }]);
  });
});
