import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyTransfiguration, registerJourneyTransfigurationProvider, journeyTransfigurationOccurrences } from "./journey-transfiguration";
import { journeyDeckEntry } from "./journey-deck-entry";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { additional, additionalWindow, accept, apply, resolveWindow, config, POUCH, TOME, ENTRY_ID, SITE_ID, GENESIS } from "./journey-additional-transfiguration.fixtures";
import { event } from "./lifecycle-fixtures";
import { testDreamsignId } from "../../types/test-identities";
import { GAME_ENGINE_CONFIG } from "../replay/replay";

const GAIN = testDreamsignId("additional-child-gain");
describe("additional applications refuse unsupported contexts atomically", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("rejects forged, composed and accessor additional claims without executing them", () => {
    const definition = journeyTransfiguration(POUCH, { kind: "additionalRandomTransfiguration" });
    const fake = { ...definition, afterJourneyEvent: vi.fn(() => null) };
    for (const bad of [fake, { ...definition, journeyDeckEntry: { kind: "warriorSpark", amount: 2 } as const }, { ...definition, journeyTransfiguration: { kind: "additionalRandomTransfiguration" } as const }, { ...definition, journeyTransfiguration: { kind: "copyTransfiguredEvent" } as const }]) expect(() => createJourneyModifierRegistry([bad])).toThrow(RangeError);
    const accessor = { ...definition }, getter = vi.fn(() => definition.journeyTransfiguration);
    Object.defineProperty(accessor, "journeyTransfiguration", { get: getter, enumerable: true });
    expect(() => createJourneyModifierRegistry([accessor])).toThrow(RangeError); expect(getter).not.toHaveBeenCalled(); expect(fake.afterJourneyEvent).not.toHaveBeenCalled();
    expect(() => createJourneyModifierRegistry([{ ...definition }])).not.toThrow();
  });
  it.each(["unavailable", "opaque provider", "refusing apply"] as const)("contains %s after a local root calculation and retries the full event", mode => {
    const f = additional({ cardType: "Event", held: [POUCH, TOME] }), initial = structuredClone(f.state);
    registerJourneyTransfigurationProvider(mode === "unavailable" ? null : mode === "opaque provider" ? { ...f.provider } : { ...f.provider, apply: () => ({ ok: false, reason: "unavailable_content" }) });
    const log = createLocalLog({ config: config(f), genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => "1970-01-01T00:00:00.000Z", devMode: false });
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    expect(log.state()).toEqual(initial);
    registerJourneyTransfigurationProvider(f.provider);
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    expect(log.state().journey.journeyDraw?.result).toBe("draw"); expect(log.state().journey.deck).toHaveLength(3);
    expect(foldEvents(config(f), GENESIS, { seq: 1, state: f.state }, [...log.events()].filter(row => row.seq > 1)).state).toEqual(log.state());
  });
  it("limits an available captured empty applicability set without a draw or child", () => {
    const f = additional({ cardType: "Event" });
    const empty = createJourneyTransfigurationProvider({ ...f.content, transfigurationData: { ...f.data, forms: [] } });
    registerJourneyTransfigurationProvider(empty);
    const rng = vi.fn(() => 0), out = accept(f, { rng });
    expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("journeyDraw"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
    expect(out.state.journey.deck[0]).not.toHaveProperty("transfigurationApplications"); expect(rng).not.toHaveBeenCalled();
  });
  it("refuses a captured nonempty choice set without its supported closure anchor", () => {
    const f = additional({ cardType: "Event", authored: true });
    const provider = createJourneyTransfigurationProvider({ ...f.content, transfigurationData: { ...f.data, forms: f.data.forms.filter(form => form.id !== "Inspired") } });
    registerJourneyTransfigurationProvider(provider);
    const rng = vi.fn(() => 0);
    expect(() => accept(f, { rng })).toThrow(); expect(rng).not.toHaveBeenCalled(); expect(f.state.journey.essence).toBe(30);
  });
  it.each(["Tome", "gain"] as const)("positively checks actual child-invoked %s factories before proof", kind => {
    const canonical = kind === "Tome" ? journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }) : journeyDeckEntry(GAIN, { kind: "warriorSpark", amount: 1 });
    const opaque = { ...canonical, afterJourneyEvent: () => null };
    const f = additional({ cardType: "Event", held: [POUCH, kind === "Tome" ? TOME : GAIN] });
    const registry = createJourneyModifierRegistry([journeyTransfiguration(POUCH, { kind: "additionalRandomTransfiguration" }), opaque]);
    expect(() => accept({ ...f, registry })).toThrow(/child/);
  });
  it("preserves ordinary resolve-only scalar copying without stamping history or demanding additional proof", () => {
    const f = additional({ cardType: "Event", held: [TOME] });
    registerJourneyTransfigurationProvider({ resolve: entry => f.provider.resolve(entry) });
    const out = accept(f); expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(3);
    for (const entry of out.state.journey.deck) expect(entry).not.toHaveProperty("transfigurationApplications");
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("rejects malformed pending causes/application prefixes, preserving valid legacy absence", () => {
    const f = additionalWindow({ cardType: "Event" }), root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 10 });
    const appended = f.provider.apply!(root.state.journey.deck[0], "Inspired"); if (!appended.ok) throw new Error("fixture append");
    const valid = structuredClone(root.state); valid.journey.deck[0] = appended.value;
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(valid))).toEqual(valid);
    for (const field of ["eventSeq", "applicationIndex", "entryId"]) {
      const bad = structuredClone(root.state), cause = bad.journey.pendingJourneyLoop!.instructions[0].cause;
      Reflect.set(cause, field, field === "eventSeq" ? 9 : field === "applicationIndex" ? 99 : "unknown-entry");
      expect(apply(f, root.state, "LOAD_STATE", { snapshot: bad.journey }).state).toBe(root.state);
    }
    const legacy = { ...f.state.journey.deck[0], transfiguration: "Inspired" as const };
    expect(journeyTransfigurationOccurrences({ deck: f.state.journey.deck }, { deck: [legacy, f.state.journey.deck[1]] })).toEqual([{ entry: legacy, cardId: f.base.id, cardType: "Event" }]);
  });
  it("bounces stale and repeated windows with zero dependent draws", () => {
    const f = additionalWindow({ cardType: "Event" });
    const first = resolveWindow(f, f.state, [ENTRY_ID], { seq: 10 });
    const rng = vi.fn(() => 0), stale = apply(f, first.state, "RESOLVE_JOURNEY_TRANSFIGURATION", { siteId: SITE_ID, dreamsignId: "unknown-source", heldIndex: 2, choiceIndex: 0, entryIds: [ENTRY_ID] }, { seq: 11, rng });
    expect(stale.state).toBe(first.state); expect(rng).not.toHaveBeenCalled();
  });
  it("refuses an overflowing retained occasion identity before dependent draws or commits", () => {
    const f = additionalWindow({ cardType: "Event" }), root = resolveWindow(f, f.state, [ENTRY_ID], { seq: 9 });
    const saved = structuredClone(root.state); Reflect.set(saved.journey.pendingJourneyLoop!.instructions[0].cause, "ordinal", Number.MAX_SAFE_INTEGER);
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(saved))).toEqual(saved);
    const rng = vi.fn(() => 0), before = structuredClone(saved);
    expect(() => resolveWindow(f, saved, [], { seq: 3, rng })).toThrow(RangeError); expect(rng).not.toHaveBeenCalled(); expect(saved).toEqual(before);
  });

});
