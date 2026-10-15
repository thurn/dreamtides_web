import { afterEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { testCardId, testDreamsignId, testEventActor, testJourneySeed } from "../../types/test-identities";
import { parseCardSubtype } from "../../types/card-identity";
import { parseJourneyId } from "../../types/identifiers";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { clearReplayFixtureProviders } from "../replay/fixture-providers";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { journeyOnGain } from "./journey-on-gain";
import { GENESIS } from "./lifecycle-fixtures";
import { SOURCE, LOWER, FRUIT, apply, initial, pending, payload, provider, registry, config, sign } from "./journey-before-battle-purge-fixtures";

afterEach(() => clearReplayFixtureProviders());
describe("before-battle permission persistence boundaries", () => {
  it("roundtrips actual GAME checkpoints without production registration, while live LOAD requires the supplied descriptor", () => {
    provider(); const p = pending(), encoded = GAME_ENGINE_CONFIG.encode(p);
    expect(GAME_ENGINE_CONFIG.decode(encoded)).toEqual(p);
    const result = apply(p, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(p.journey)) });
    expect(result.outcome).toBe("applied");
    expect(apply(result.state, "RESOLVE_JOURNEY_PURGE", payload(result.state)).state.battle).not.toBeNull();
    const wrong = registry().lookup(LOWER)!;
    const unknown = { ...registry(), lookup: (id: Parameters<ReturnType<typeof registry>["lookup"]>[0]) => id === SOURCE ? undefined : registry().lookup(id) };
    const mismatch = { ...registry(), lookup: (id: Parameters<ReturnType<typeof registry>["lookup"]>[0]) => id === SOURCE ? wrong : registry().lookup(id) };
    for (const mods of [unknown, mismatch]) {
      expect(apply(p, "LOAD_STATE", { snapshot: p.journey }, mods).state).toBe(p);
      expect(apply(p, "RESOLVE_JOURNEY_PURGE", payload(p), mods).state).toBe(p);
    }
  });
  it("rejects malformed intrinsic identity, context, continuation and battle ownership on decode and live LOAD", () => {
    provider(); const p = pending(); if (p.journey.screen.type !== "journeyPurge") throw new Error("missing choice");
    for (const patch of [{ heldIndex: -1 }, { minimumDeckSize: 1.5 }, { earnedSeq: -1 }, { dreamsignId: "" }, { siteId: "foreign" }, { seed: testJourneySeed("foreign-seed") }, { seedOverride: -1 }, { timestamp: "" }, { nodeId: null }, { completionLevel: 1 }, { continuation: { type: "atlas" } }, { continuation: { type: "site", siteId: "foreign" } }, { surprise: true }]) {
      const state = { ...p, journey: { ...p.journey, screen: { ...p.journey.screen, choice: { ...p.journey.screen.choice, ...patch } } } };
      expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(state))).toThrow();
      expect(apply(p, "LOAD_STATE", { snapshot: state.journey }).state).toBe(p);
    }
    const nullNode = JSON.parse(JSON.stringify(p)) as typeof p;
    nullNode.journey.currentDreamscape = null;
    if (nullNode.journey.screen.type === "journeyPurge" && nullNode.journey.screen.choice.kind === "beforeBattle") nullNode.journey.screen = { ...nullNode.journey.screen, choice: { ...nullNode.journey.screen.choice, nodeId: null } };
    expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(nullNode))).toThrow();
    expect(apply(p, "LOAD_STATE", { snapshot: nullNode.journey }).state).toBe(p);
    const actual = apply(p, "RESOLVE_JOURNEY_PURGE", payload(p)).state.battle;
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify({ ...p, battle: actual }))).toThrow();
    expect(apply(p, "LOAD_STATE", { snapshot: p.journey, battle: actual }).state).toBe(p);
  });
  it("preserves seed intent and source-independent permission across administrative run identity reset", () => {
    provider(); const p = pending(initial([SOURCE, FRUIT]));
    const oldRun = { ...p, journey: { ...p.journey, runId: parseJourneyId("original-run") } };
    const loaded = apply(oldRun, "LOAD_STATE", { snapshot: oldRun.journey }, registry(), { seq: 12 }).state;
    expect(loaded.journey.runId).not.toBe(oldRun.journey.runId); expect(loaded.journey.seed).toBe(p.journey.seed);
    expect(loaded.journey.screen).toEqual(p.journey.screen);
    const lost = apply(loaded, "REMOVE_DREAMSIGN", { dreamsignId: SOURCE }, registry(), { seq: 13 }).state;
    expect(apply(lost, "RESOLVE_JOURNEY_PURGE", payload(lost), registry(), { seq: 14 }).state.battle).not.toBeNull();
    expect(apply(p, "LOAD_STATE", { snapshot: { ...p.journey, seed: testJourneySeed("foreign") } }).state).toBe(p);
  });
  it("validates the real copy and Starter acquisition wrappers carrying this continuation", () => {
    provider(); const COPY = testDreamsignId("before729-copy"), TEETH = testDreamsignId("before729-teeth");
    const mods = registry([journeyOnGain(COPY, { kind: "copyOwnedDreamsignOnGain" }), journeyOnGain(TEETH, { kind: "purgeStarterOnGain", maxCount: 1 })]);
    registerJourneyTransfigurationProvider({ resolve: () => ({ cardId: testCardId("before729-card"), cardType: "Event", subtype: parseCardSubtype(""), forms: [], starter: true, perfectedEligible: false }) });
    const p = pending(initial(), mods);
    const copy = apply(p, "ADD_DREAMSIGN", { dreamsignId: COPY }, mods).state;
    const starter = apply(p, "ADD_DREAMSIGN", { dreamsignId: TEETH }, mods).state;
    expect(copy.journey.screen.type).toBe("journeyDreamsign"); expect(starter.journey.screen.type).toBe("journeyStarterPurge");
    if (copy.journey.screen.type !== "journeyDreamsign" || copy.journey.screen.choice.kind !== "copy" || starter.journey.screen.type !== "journeyStarterPurge") throw new Error("Missing real acquisition contexts");
    const held = [...copy.journey.dreamsigns, sign(TEETH)];
    const nested = { ...copy, journey: { ...copy.journey, dreamsigns: held, screen: { ...starter.journey.screen, choice: { ...starter.journey.screen.choice, sources: starter.journey.screen.choice.sources.map((source) => ({ ...source, heldIndex: 2 })), continuation: { ...copy.journey.screen, choice: { ...copy.journey.screen.choice, heldIds: held.map(({ id }) => id) } } } } } };
    for (const wrapped of [copy, starter, nested]) {
      expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(wrapped))).toEqual(wrapped);
      expect(apply(wrapped, "LOAD_STATE", { snapshot: wrapped.journey }, mods).outcome).toBe("applied");
      const bad: unknown = JSON.parse(GAME_ENGINE_CONFIG.encode(wrapped).replace(JSON.stringify(p.journey.seed), JSON.stringify(testJourneySeed("foreign-wrapper"))));
      expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(bad))).toThrow();
    }
  });
  it("resumes a cold checkpoint on the actual local log and settles one start", () => {
    provider(); const p = pending(), cfg = config(p, registry());
    const state = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(p));
    const log = createLocalLog({ config: cfg, genesis: { ...GENESIS, seed: p.journey.seed }, localActor: testEventActor("alice"), base: { seq: 10, state, intentKeys: [] } });
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(state, [state.journey.deck[0].entryId]) });
    const checkpoint = log.checkpoint();
    const reopened = createLocalLog({ config: cfg, genesis: { ...GENESIS, seed: p.journey.seed }, localActor: testEventActor("alice"), base: { ...checkpoint, state: GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(checkpoint.state)) } });
    reopened.append({ type: "RESOLVE_JOURNEY_PURGE", payload: payload(state) });
    expect(reopened.state()).toEqual(checkpoint.state); expect(reopened.state().battle).not.toBeNull();
  });
});
