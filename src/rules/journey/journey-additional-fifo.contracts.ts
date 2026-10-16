import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { additionalWindow, apply, resolveWindow, POUCH, SECOND, TOME, WINDOW, TAIL, ENTRY_ID } from "./journey-additional-transfiguration.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { journeyPurge } from "./journey-purge";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration, journeyTransfigurationOccurrences } from "./journey-transfiguration";

describe("additional applications preserve an earned FIFO", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each([[POUCH, POUCH, WINDOW, TAIL, TOME], [POUCH, SECOND, WINDOW, TAIL, TOME]])("executes every source-lost child on the same original, held=%s", (...held) => {
    const f = additionalWindow({ cardType: "Event", held }), root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 10, rng: () => 0 });
    expect(root.outcome).toBe("applied"); expect(root.state.journey.deck).toHaveLength(3);
    expect(root.state.journey.pendingJourneyLoop!.instructions.map(item => item.source.heldIndex)).toEqual([0, 1]);
    let state = root.state;
    for (const id of [held[0], held[1]]) state = apply(f, state, "REMOVE_DREAMSIGN", { dreamsignId: id }, { seq: 11 }).state;
    const reloaded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state));
    const rng = vi.fn(() => 0), out = resolveWindow(f, reloaded, [], { seq: 12, rng });
    expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
    const original = out.state.journey.deck.find(entry => entry.entryId === ENTRY_ID)!;
    const form = f.provider.resolve(root.state.journey.deck[0])!.applicableForms![0];
    expect(original.transfigurationApplications).toEqual([{ form: root.state.journey.deck[0].transfiguration }, { form }, { form }]);
    const finite = out.logRecords!.filter(row => row.event === "journey_loop_finite_application");
    expect(finite.map(row => row.fields.cause)).toEqual([1, 2].map((applicationIndex, ordinal) => ({ ...root.state.journey.pendingJourneyLoop!.instructions[0].cause, eventSeq: 12, ordinal, applicationIndex })));
    expect(finite.map(row => row.fields.parentCause)).toEqual([root.state.journey.pendingJourneyLoop!.instructions[0].cause, root.state.journey.pendingJourneyLoop!.instructions[0].cause]);
    expect(rng).toHaveBeenCalledTimes(2);
    const copies = out.state.journey.deck.slice(2);
    expect(copies).toHaveLength(3); expect(copies.map(entry => entry.transfigurationApplications?.length ?? 1)).toEqual([1, 2, 3]);
    expect(new Set(out.state.journey.deck.map(entry => entry.entryId)).size).toBe(out.state.journey.deck.length);
    const operations = journeyTransfigurationOccurrences({ deck: [copies[1]] }, { deck: [{ ...copies[2], entryId: copies[1].entryId }] }, { eventSeq: 12, ordinalStart: 8, parentCause: { ...root.state.journey.pendingJourneyLoop!.instructions[0].cause, entryId: copies[1].entryId } });
    expect(operations[0].operation!.parentCause!.applicationIndex).toBe(0);
    expect(operations[0].operation!.cause.applicationIndex).toBe(2);
  });
  it("takes fresh continuing holdings and stops before the first remaining child", () => {
    const f = additionalWindow({ cardType: "Event", held: [POUCH, SECOND, WINDOW, TAIL, TOME] });
    const root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 20 });
    const lost = apply(f, root.state, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: 21 }).state;
    const rng = vi.fn(() => 0), out = resolveWindow(f, lost, [], { seq: 22, rng });
    expect(out.state.journey.journeyDraw?.earnedSource).toEqual({ dreamsignId: POUCH, heldIndex: 0 });
    expect(out.state.journey.journeyDraw?.continuingSources).toEqual([{ dreamsignId: SECOND, heldIndex: 0 }]);
    expect(out.state.journey.deck).toEqual(root.state.journey.deck); expect(rng).not.toHaveBeenCalled();
  });
  it("does not grant a newly acquired source a retroactive parent instruction", () => {
    const f = additionalWindow({ cardType: "Event" }), root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 20 });
    const added = apply(f, root.state, "ADD_DREAMSIGN", { dreamsignId: SECOND }, { seq: 21 }).state;
    const out = resolveWindow(f, added, [], { seq: 22 });
    expect(root.state.journey.pendingJourneyLoop!.instructions).toHaveLength(1);
    expect(out.state.journey.journeyDraw?.continuingSources).toEqual([{ dreamsignId: POUCH, heldIndex: 0 }, { dreamsignId: SECOND, heldIndex: 4 }]);
  });
  it("finishes an earned purge of the original before considering its child", () => {
    const f = additionalWindow({ cardType: "Event" });
    const registry = createJourneyModifierRegistry([journeyTransfiguration(POUCH, { kind: "additionalRandomTransfiguration" }), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }), journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 2 }), journeyPurge(TAIL, { kind: "afterBattlePurge", maxCount: 1 })]);
    if (f.state.journey.screen.type !== "journeyTransfiguration") throw new Error("fixture window");
    f.state.journey.screen = { ...f.state.journey.screen, choice: { ...f.state.journey.screen.choice, sources: [f.state.journey.screen.choice.sources[0], { kind: "purge", dreamsignId: TAIL, heldIndex: 3, maxCount: 1 }] } };
    const configured = { ...f, registry }, first = resolveWindow(configured, f.state, [ENTRY_ID], { seq: 8 });
    const out = resolveWindow(configured, first.state, [ENTRY_ID], { seq: 9 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.some(entry => entry.entryId === ENTRY_ID)).toBe(false);
    expect(out.state.journey).not.toHaveProperty("journeyDraw"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
  });
  it("retains two distinct actual event3 applications after import and drains them in FIFO order", () => {
    const f = additionalWindow({ cardType: "Event", held: [POUCH, TOME, WINDOW, TAIL, WINDOW] });
    if (f.state.journey.screen.type !== "journeyTransfiguration") throw new Error("fixture window");
    f.state.journey.screen = { ...f.state.journey.screen, choice: { ...f.state.journey.screen.choice, sources: [...f.state.journey.screen.choice.sources, { kind: "transfiguration", dreamsignId: WINDOW, heldIndex: 4, maxCount: 2 }] } };
    const root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 3, rng: () => 0 });
    const loaded = apply(f, f.state, "LOAD_STATE", { snapshot: root.state.journey }, { seq: 1 }); expect(loaded.outcome).toBe("applied");
    const advanced = apply(f, loaded.state, "LOAD_STATE", { snapshot: loaded.state.journey }, { seq: 2 }); expect(advanced.outcome).toBe("applied");
    const secondId = f.state.journey.deck[1].entryId, second = resolveWindow(f, advanced.state, [secondId], { seq: 3, rng: () => 0 });
    expect(second.outcome).toBe("applied");
    const causes = second.state.journey.pendingJourneyLoop!.instructions.map(item => item.cause);
    expect(causes.map(cause => [cause.eventSeq, cause.ordinal, cause.entryId])).toEqual([[3, 0, ENTRY_ID], [3, 1, secondId]]);
    expect(causes.every(cause => !Object.prototype.hasOwnProperty.call(cause, "causalSeq"))).toBe(true);
    const logged = second.logRecords!.filter(row => row.event === "journey_transfiguration_operation"); expect(logged.map(row => row.fields.cause)).toEqual([causes[1]]);
    expect(second.state.journey.deck).toHaveLength(4); expect(new Set(second.state.journey.deck.map(entry => entry.entryId)).size).toBe(4);
    expect(second.state.journey.deck.slice(2).map(({ entryId: _id, ...entry }) => entry)).toEqual(second.state.journey.deck.slice(0, 2).map(({ entryId: _id, ...entry }) => entry));
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(second.state)); expect(decoded).toEqual(second.state);
    const lost = apply(f, decoded, "REMOVE_DREAMSIGN", { dreamsignId: POUCH }, { seq: 4 });
    const rng = vi.fn(() => 0), done = resolveWindow(f, lost.state, [], { seq: 5, rng });
    expect(done.outcome).toBe("applied"); expect(rng).toHaveBeenCalledTimes(2);
    const finite = done.logRecords!.filter(row => row.event === "journey_loop_finite_application");
    expect(finite.map(row => row.fields.parentCause)).toEqual(causes); expect(finite.map(row => (row.fields.cause as { entryId: typeof ENTRY_ID }).entryId)).toEqual([ENTRY_ID, secondId]);
    expect(done.state.journey.deck.slice(0, 2).map(entry => entry.transfigurationApplications!.length)).toEqual([2, 2]);
    expect(done.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(done.state.journey).not.toHaveProperty("journeyDraw");
    expect(done.state.journey.deck).toHaveLength(6); expect(new Set(done.state.journey.deck.map(entry => entry.entryId)).size).toBe(6);
  });
  it("persists a truthful low-clock committed draw from high-clock earned work and resets it", () => {
    const f = additionalWindow({ cardType: "Event" }), root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 9 });
    const loaded = apply(f, f.state, "LOAD_STATE", { snapshot: root.state.journey }, { seq: 1 }); expect(loaded.outcome).toBe("applied");
    const advanced = apply(f, loaded.state, "LOAD_STATE", { snapshot: loaded.state.journey }, { seq: 2 }); expect(advanced.outcome).toBe("applied");
    const rng = vi.fn(() => 0), done = resolveWindow(f, advanced.state, [], { seq: 3, rng }); expect(done.outcome).toBe("applied"); expect(rng).not.toHaveBeenCalled();
    expect(done.state.journey.journeyDraw).toMatchObject({ committedSeq: 3, committedCausalSeq: 9, cause: root.state.journey.pendingJourneyLoop!.instructions[0].cause, result: "draw" });
    expect(done.state.journey.deck).toEqual(root.state.journey.deck);
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(done.state)); expect(decoded).toEqual(done.state);
    const reimport = apply(f, f.state, "LOAD_STATE", { snapshot: decoded.journey }, { seq: 1 }); expect(reimport.outcome).toBe("applied"); expect(reimport.state.journey.journeyDraw).toEqual(done.state.journey.journeyDraw);
    for (const clock of [-1, 3, 2, Number.MAX_SAFE_INTEGER + 1]) {
      const bad = structuredClone(done.state); Reflect.set(bad.journey.journeyDraw!, "committedCausalSeq", clock);
      expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(bad))).toThrow(); expect(apply(f, f.state, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
    }
    const reset = apply(f, reimport.state, "RESET_JOURNEY", {}, { seq: 4 }); expect(reset.outcome).toBe("applied"); expect(reset.state.journey).not.toHaveProperty("journeyDraw"); expect(reset.state.journey).not.toHaveProperty("pendingJourneyLoop");
  });

});
