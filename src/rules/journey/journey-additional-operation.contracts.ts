import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { journeyTransfigurationOccurrences, validJourneyTransfigurationOperation, validJourneyTransfigurationRecords } from "./journey-transfiguration";
import { additional, additionalWindow, accept, apply, resolveWindow, POUCH, SECOND, TOME, WINDOW, TAIL, ENTRY_ID, CARD_ID } from "./journey-additional-transfiguration.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { parseDeckEntryId } from "../../types/identifiers";

describe("additional application operation identity", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each(["Character", "Event"] as const)("consumes the actual additional factory without a Tome for %s", cardType => {
    const f = additional({ cardType }), out = accept(f, { seq: 11 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(23);
    expect(out.state.journey.deck[0].transfiguration).toBe(f.rootForm);
    expect(out.state.journey.deck[0]).not.toHaveProperty("transfigurationApplications");
    expect(out.state.journey.deck[1]).toEqual(f.state.journey.deck[1]);
    expect(out.state.journey.journeyDraw).toMatchObject({ result: "draw", cause: { eventSeq: 11, ordinal: 0, applicationIndex: 0, entryId: ENTRY_ID, cardId: CARD_ID }, proof: { anchor: cardType === "Character" ? "Kindled" : "Inspired" } });
    expect(out.logRecords?.filter(row => row.event === "journey_loop_finite_application")).toHaveLength(0);
    expect(out.state.journey.journeyDraw).not.toHaveProperty("committedCausalSeq"); expect(Object.keys(out.state.journey.journeyDraw!.cause)).toHaveLength(5);
  });
  it.each([[POUCH, TOME, SECOND, TOME], [TOME, SECOND, TOME, POUCH]])("copies only the completed parent before either physical child, held=%s", (...held) => {
    const f = additional({ cardType: "Event", held }), out = accept(f, { seq: 12 });
    const deck = out.state.journey.deck;
    expect(deck).toHaveLength(4); expect(deck.slice(2).map(({ entryId: _id, ...entry }) => entry)).toEqual([deck[0], deck[0]].map(({ entryId: _id, ...entry }) => entry));
    expect(new Set(deck.map(entry => entry.entryId)).size).toBe(4);
    const earned = out.logRecords!.filter(row => row.event === "journey_loop_instruction_earned");
    expect(earned.map(row => (row.fields.source as { heldIndex: number }).heldIndex)).toEqual(held.flatMap((id, index) => id === POUCH || id === SECOND ? [index] : []));
    expect(out.state.journey.journeyDraw?.earnedSource.heldIndex).toBe(held.findIndex(id => id === POUCH || id === SECOND));
  });
  it("collects reverse-deck selection order and detached before/after values", () => {
    const f = additional({ cardType: "Event", held: [] }), before = f.state.journey;
    const appended = before.deck.map(entry => f.provider.apply!(entry, "Inspired"));
    const after = { ...before, deck: appended.map(result => { if (!result.ok) throw new Error("fixture append"); return result.value; }) };
    const ids = [before.deck[1].entryId, before.deck[0].entryId];
    const occurrences = journeyTransfigurationOccurrences(before, after, { eventSeq: 8, ordinalStart: 3, orderedEntryIds: ids });
    expect(occurrences.map(item => item.operation!.cause)).toEqual(ids.map((entryId, index) => ({ eventSeq: 8, ordinal: 3 + index, entryId, cardId: index === 0 ? f.neighbor.id : CARD_ID, applicationIndex: 0 })));
    expect(occurrences[0].entry).not.toBe(after.deck[1]); expect(occurrences[0].operation!.beforeEntry).not.toBe(before.deck[1]);
    expect(() => journeyTransfigurationOccurrences(before, after, { eventSeq: 8, ordinalStart: 0, orderedEntryIds: [ids[0]] })).toThrow();
  });
  it("validates full one-step values independently of application-object property order", () => {
    const f = additional({ held: [] }), before = f.state.journey;
    const result = f.provider.apply!(before.deck[0], "Kindled"); if (!result.ok) throw new Error("fixture append");
    const [operation] = journeyTransfigurationOccurrences(before, { deck: [result.value, before.deck[1]] }, { eventSeq: 4, ordinalStart: 0 });
    const shuffled: unknown = JSON.parse(JSON.stringify(operation), (_key: string, value: unknown): unknown => value && !Array.isArray(value) && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse()) : value);
    expect(validJourneyTransfigurationOperation(shuffled)).toBe(true);
    for (const field of ["sparkBonus", "statOverride", "keywordModification", "isBane", "cardNumber"]) {
      const bad = structuredClone(operation);
      Reflect.set(bad.operation!.beforeEntry, field, field === "sparkBonus" ? 4 : field === "statOverride" ? { spark: 8 } : field === "keywordModification" ? { fast: true } : field === "isBane" ? true : 9999);
      expect(validJourneyTransfigurationOperation(bad)).toBe(false);
      expect(validJourneyTransfigurationRecords({ screen: { choice: { kind: "subtype", resume: { transfigurations: [bad] } } } })).toBe(false);
    }
    const unknown = structuredClone(operation); Reflect.set(unknown.operation!.cause, "unrecognizedCausalSeq", 4); expect(validJourneyTransfigurationOperation(unknown)).toBe(false);
    expect(validJourneyTransfigurationOperation({ ...operation, operation: undefined })).toBe(false);
    const { operation: _metadata, ...legacy } = operation;
    expect(validJourneyTransfigurationOperation(legacy)).toBe(true);
  });
  it("keeps distinct physical same-UUID neighbors and excludes copy/admin occasions", () => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME] });
    f.state.journey.deck[1] = { ...f.state.journey.deck[0], entryId: parseDeckEntryId("additional-same-uuid-neighbor") };
    const out = accept(f);
    expect(out.state.journey.deck[1]).toEqual(f.state.journey.deck[1]);
    expect(out.logRecords?.filter(row => row.event === "journey_loop_instruction_earned")).toHaveLength(1);
    const debug = apply(f, f.state, "TRANSFIGURE_CARD", { entryId: ENTRY_ID, transfiguration: "Inspired" });
    expect(debug.state.journey.deck).toHaveLength(2); expect(debug.state.journey).not.toHaveProperty("journeyDraw");
    expect(apply(f, debug.state, "LOAD_STATE", { snapshot: debug.state.journey }).state.journey).not.toHaveProperty("journeyDraw");
  });
  it("assigns the actual reverse selection cause/RNG order under a public earned window", () => {
    const f = additionalWindow({ cardType: "Event", held: [POUCH, TOME, WINDOW, TAIL] }), ids = [f.state.journey.deck[1].entryId, ENTRY_ID];
    const first = resolveWindow(f, f.state, ids, { seq: 19, rng: () => 0 });
    expect(first.outcome).toBe("applied");
    expect(first.state.journey.pendingJourneyLoop!.instructions.map(item => item.cause.entryId)).toEqual(ids);
    expect(first.state.journey.pendingJourneyLoop!.instructions.map(item => item.cause.ordinal)).toEqual([0, 1]);
    const resolved = first.logRecords!.find(row => row.event === "journey_transfiguration_resolved")!;
    expect((resolved.fields.transformations as readonly { drawIndex: number }[]).map(item => item.drawIndex)).toEqual([0, 1]);
    const saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(first.state));
    expect(saved).toEqual(first.state);
    const loaded = apply(f, first.state, "LOAD_STATE", { snapshot: saved.journey }, { seq: 20 });
    expect(loaded.outcome).toBe("applied");
    expect(resolveWindow(f, loaded.state, [], { seq: 21 }).state.journey.journeyDraw?.cause.entryId).toBe(ids[0]);
  });
});
