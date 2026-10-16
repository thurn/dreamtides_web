import { createLocalLog } from "../../eventlog/local-log";
import { liveLoopBattle } from "./journey-loop-integration.fixtures";
import { journeyOnGain } from "./journey-on-gain";
import { testDreamsignId } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import { LayerName } from "../../types/layer-name";
import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { reduceGameEvent } from "../reducer";
import { event, ctx } from "./lifecycle-fixtures";
import { createJourneyModifierRegistry, journeyModifierRegistry } from "./modifier-registry";
import { accept, apply, afterBattle, fixture, resolveWindow, config, GENESIS, LOOP, TOME, ENTRY_ID, SITE_ID, NODE_ID } from "./journey-loop.fixtures";

describe("journey loop saved state contracts", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("imports a committed terminal through the actual production registry without requiring its historical source", () => {
    const f = fixture(), terminal = accept(f).state;
    expect(terminal.journey).toHaveProperty("journeyDraw.result", "draw");
    const loaded = reduceGameEvent(f.state, event("LOAD_STATE", { snapshot: structuredClone(terminal.journey) }), ctx(), journeyModifierRegistry);
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.journeyDraw).toEqual(terminal.journey.journeyDraw);
    expect(loaded.state.frontDoor.phase).toBe("journey"); expect(loaded.state.battle).toBeNull();
  });
  it("imports a historical abandoned normal battle binding without recapturing a current battle", () => {
    const RAT = testDreamsignId("loop-state-live-rat"), f = liveLoopBattle("victory", false, { held: [LOOP], definitions: [journeyOnGain(RAT, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 1 })] });
    const before = structuredClone(f.state), out = apply(f, f.state, "ADD_DREAMSIGN", { dreamsignId: RAT }, { seq: 41, rng: () => 0 });
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.journeyDraw?.abandonedBattle).toEqual({ mode: "journey", battleId: before.battle!.init.battleId });
    expect(out.state.battle).toBeNull(); expect(out.state.journey.failureSummary).toEqual(before.journey.failureSummary);
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(out.state));
    expect(decoded).toEqual(out.state);
    const loaded = reduceGameEvent(f.state, event("LOAD_STATE", { snapshot: decoded.journey }), ctx(), journeyModifierRegistry);
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.journeyDraw).toEqual(out.state.journey.journeyDraw);
    expect(loaded.state.battle).toBeNull(); expect(loaded.state.frontDoor.phase).toBe("journey");
    expect(apply(f, loaded.state, "RESET_JOURNEY").state.journey).not.toHaveProperty("journeyDraw");
  });
  it.each(["commit", "anchor", "forms", "cause", "screen", "binding", "pending"] as const)("rejects malformed terminal %s at decode and LOAD", field => {
    const f = fixture(), terminal = accept(f).state, bad = structuredClone(terminal);
    const draw = bad.journey.journeyDraw!;
    if (field === "commit") Reflect.set(draw, "committedSeq", -1);
    else if (field === "anchor") Reflect.set(draw.proof, "anchor", "Inspired");
    else if (field === "forms") Reflect.set(draw.proof, "applicableForms", ["Kindled", "Kindled"]);
    else if (field === "cause") Reflect.set(draw.cause, "entryId", "unrelated-entry");
    else if (field === "screen") bad.journey.screen = { type: "atlas" };
    else if (field === "binding") Reflect.set(draw, "abandonedBattle", { mode: "tutorial", battleId: "battle", tutorialRunId: null });
    else Reflect.set(bad.journey, "pendingJourneyLoop", {});
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    expect(apply(f, f.state, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
  });
  it.each(["cardNumber", "transfiguration", "applications"] as const)("rejects a terminal whose root %s record is malformed", field => {
    const f = fixture(), bad = structuredClone(accept(f).state), target = bad.journey.deck.find(entry => entry.entryId === ENTRY_ID)!;
    if (field === "cardNumber") Reflect.set(target, "cardNumber", -1);
    else if (field === "transfiguration") Reflect.deleteProperty(target, "transfiguration");
    else Reflect.set(target, "transfigurationApplications", []);
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    expect(apply(f, f.state, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
  });
  it("rejects semantically duplicate pending instructions even when their property order differs", () => {
    const f = afterBattle(fixture()), first = resolveWindow(f, f.state).state, bad = structuredClone(first);
    const pending = bad.journey.pendingJourneyLoop!, original = pending.instructions[0];
    const reordered = { ...original, source: { heldIndex: original.source.heldIndex, dreamsignId: original.source.dreamsignId }, parentEntry: original.parentEntry,
      cause: { cardId: original.cause.cardId, entryId: original.cause.entryId, applicationIndex: original.cause.applicationIndex, ordinal: original.cause.ordinal, eventSeq: original.cause.eventSeq }, kind: original.kind };
    Reflect.set(pending, "instructions", [original, reordered]);
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    expect(apply(f, first, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
  });
  it.each(["printing", "duplicate", "record"] as const)("rejects a pending target with a mismatched %s relation", field => {
    const f = afterBattle(fixture()), first = resolveWindow(f, f.state).state, bad = structuredClone(first);
    const target = bad.journey.deck.find(entry => entry.entryId === ENTRY_ID)!;
    if (field === "printing") {
      target.cardNumber = f.neighbor.cardNumber;
      expect(f.provider.validateRecord?.(target)).toBe(true);
    } else if (field === "duplicate") bad.journey.deck.push({ ...target });
    else Reflect.set(target, "transfigurationApplications", []);
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    expect(apply(f, first, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
  });
  it.each(["absent", "growth"] as const)("retains a pending instruction with its target %s", kind => {
    const f = afterBattle(fixture()); f.state.journey.atlas.nodes[NODE_ID].layer = LayerName.One;
    const first = resolveWindow(f, f.state).state, saved = structuredClone(first);
    if (kind === "absent") saved.journey.deck = saved.journey.deck.filter(entry => entry.entryId !== ENTRY_ID);
    else {
      const index = saved.journey.deck.findIndex(entry => entry.entryId === ENTRY_ID);
      const appended = f.provider.apply!(saved.journey.deck[index], "Empowered");
      expect(appended.ok).toBe(true); if (!appended.ok) throw new Error("Synthetic append failed");
      saved.journey.deck[index] = appended.value;
    }
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(saved))).toEqual(saved);
    const loaded = apply(f, first, "LOAD_STATE", { snapshot: saved.journey });
    expect(loaded.outcome).toBe("applied");
    const out = resolveWindow(f, loaded.state, []);
    expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
    if (kind === "absent") expect(out.state.journey).not.toHaveProperty("journeyDraw");
    else expect(out.state.journey.journeyDraw?.cause).toEqual(first.journey.pendingJourneyLoop!.instructions[0].cause);
    expect(out.state.journey.deck.find(entry => entry.entryId === f.state.journey.deck[1].entryId)).toEqual(f.state.journey.deck[1]);
  });
  it.each(["permission", "causeSeq", "sourceUUID", "missingSlot", "duplicateSlot", "outerSeq", "outerSources", "duplicateDifferentPayload"] as const)("rejects intrinsic pending %s relations", field => {
    const f = afterBattle(fixture()), first = resolveWindow(f, f.state).state, bad = structuredClone(first);
    const pending = bad.journey.pendingJourneyLoop!, original = pending.instructions[0];
    if (field === "permission") Reflect.set(original, "permissionSeq", original.permissionSeq + 1);
    else if (field === "causeSeq") Reflect.set(original.cause, "eventSeq", original.cause.eventSeq + 1);
    else if (field === "sourceUUID") Reflect.set(original.source, "dreamsignId", TOME);
    else if (field === "missingSlot") Reflect.set(original, "sourceObserverSources", original.sourceObserverSources.filter(item => item.heldIndex !== original.source.heldIndex));
    else if (field === "duplicateSlot") Reflect.set(original, "sourceObserverSources", [...original.sourceObserverSources, original.sourceObserverSources[0]]);
    else if (field === "outerSeq") Reflect.set(pending, "permissionSeq", pending.permissionSeq + 1);
    else if (field === "outerSources") Reflect.set(pending, "observerSources", []);
    else { const entryId = parseDeckEntryId("forged-distinct-parent"); Reflect.set(pending, "instructions", [original, { ...original, cause: { ...original.cause, entryId }, parentEntry: { ...original.parentEntry, entryId } }]); }
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    expect(apply(f, first, "LOAD_STATE", { snapshot: bad.journey }).outcome).toBe("bounced");
  });
  it("folds the same public terminal for both actors and ignores a stale duplicate intent", () => {
    const f = fixture(), states = ["first-loop-actor", "second-loop-actor"].map(actor => {
      const log = createLocalLog({ config: config(f), genesis: GENESIS, localActor: testEventActor(actor), now: () => "1970-01-01T00:00:00.000Z" });
      log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
      const terminal = log.state();
      log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
      expect(log.state()).toBe(terminal);
      return terminal;
    });
    expect(states[0]).toEqual(states[1]);
  });
  it("keeps an unselected physical entry with the same card UUID untouched", () => {
    const f = fixture({ cardType: "Event", held: [LOOP, TOME] });
    const neighbor = { ...f.state.journey.deck[0], entryId: parseDeckEntryId("loop-same-uuid-other-entry") };
    f.state.journey.deck.push(neighbor);
    const out = accept(f);
    expect(out.state.journey.deck.find(entry => entry.entryId === neighbor.entryId)).toEqual(neighbor);
    expect(out.state.journey.journeyDraw?.cause.entryId).toBe(ENTRY_ID);
    expect(out.state.journey.deck).toHaveLength(4);
  });
  it("retains two separately earned children from duplicate physical loop sources after both are lost", () => {
    const f = afterBattle(fixture({ cardType: "Event", held: [LOOP, LOOP, TOME, TOME] }));
    const first = resolveWindow(f, f.state, [ENTRY_ID], { seq: 41 });
    expect(first.state.journey.pendingJourneyLoop?.instructions.map(item => item.source.heldIndex)).toEqual([0, 1]);
    let state = first.state;
    for (const seq of [42, 43]) state = apply(f, state, "REMOVE_DREAMSIGN", { dreamsignId: LOOP }, { seq }).state;
    const out = resolveWindow(f, state, [], { seq: 44 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck[0].transfigurationApplications).toHaveLength(3);
    expect(out.state.journey.deck).toHaveLength(8); expect(new Set(out.state.journey.deck.map(entry => entry.entryId)).size).toBe(8);
    expect(out.logRecords?.filter(row => row.event === "journey_loop_finite_application")).toHaveLength(2);
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("requires a live supported source for a pending instruction while retaining historical committed terminals", () => {
    const f = afterBattle(fixture()), first = resolveWindow(f, f.state).state;
    const out = reduceGameEvent(f.state, event("LOAD_STATE", { snapshot: first.journey }), ctx(), createJourneyModifierRegistry([]));
    expect(out.outcome).toBe("bounced");
  });
});
