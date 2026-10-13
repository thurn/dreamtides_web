import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, Genesis } from "../../eventlog/types";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testAvatarId, testDreamsignId, testEventActor, testJourneySeed } from "../../types/test-identities";
import { parseAtlasNodeId, parseSiteId, type DreamsignId } from "../../types/identifiers";
import type { RewardSiteRuntime, SiteState } from "../../types/journey";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { initialFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import type { GameEventType } from "../events";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerSiteContentProvider, type SiteContentProvider } from "./sites";
import { testJourneyLifecycleContentProvider, testSiteContentProvider } from "./test-content-providers";
import { essenceSiteGain, journeyEssence } from "./journey-essence";

const STAR = testDreamsignId("essence-multiplier");
const PEARL = testDreamsignId("essence-replacement");
const WORM = testDreamsignId("entry-interest");
const OTHER = testDreamsignId("same-name-control");
const INCOMING = testDreamsignId("incoming-reward");
const NODE = parseAtlasNodeId("essence-node");
const SITE = parseSiteId("essence-site");
const ACTOR = testEventActor("essence-player");
const GENESIS: Genesis = { seed: testJourneySeed("journey-essence"), reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
const registry = createJourneyModifierRegistry([
  journeyEssence(STAR, { kind: "multiplyEssenceSiteGain", factor: 3 }),
  journeyEssence(PEARL, { kind: "replaceEssenceSiteReward", offerCount: 1 }),
  journeyEssence(WORM, { kind: "newDreamscapeEssence", numerator: 1, denominator: 4 }),
]);
const context = { seq: 1, contentConfig: TEST_CONTENT_CONFIG, rng: () => 0, intervening: [], timestamp: "1970-01-01T00:00:00Z" };
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "Synthetic effect" });
const site = (): SiteState => ({ id: SITE, type: "Essence", isVisited: false, isEnhanced: false });
const reward = (): RewardSiteRuntime => ({ kind: "reward", reward: { rewardType: "dreamsign", dreamsign: sign(INCOMING) }, remainingDreamsignPoolIds: [OTHER], accepted: false });
function state(ids: readonly DreamsignId[] = []): FoldState {
  const base = initialFoldState(GENESIS.seed, TEST_CONTENT_CONFIG);
  return { ...base, journey: { ...base.journey, essence: 105, currentDreamscape: NODE, screen: { type: "dreamscape" }, dreamsigns: ids.map(sign), remainingDreamsignPool: [INCOMING, OTHER], atlas: { ...base.journey.atlas, nodes: { [NODE]: makeTestAtlasNode(NODE, [site()]) } } } };
}
const event = (type: GameEventType, payload: Record<string, unknown>) => ({ type, payload, actor: ACTOR, basedOnSeq: 0, clientTimestamp: context.timestamp });
const apply = (s: FoldState, type: GameEventType, payload: Record<string, unknown> = {}) => reduceGameEvent(s, event(type, payload), context, registry);
const open = { siteId: SITE, selectionRulesVersion: SELECTION_RULES_VERSION };
function quoted(ids: readonly DreamsignId[]) {
  const s = state(ids);
  s.journey.siteRuntime[SITE] = { kind: "essence", amount: 17, accepted: false };
  return s;
}
function travel(ids: readonly DreamsignId[]) {
  const s = state(ids);
  s.journey.currentDreamscape = null;
  s.journey.screen = { type: "atlas" };
  return s;
}
const engine = (s: FoldState): EngineConfig<FoldState> => ({ ...GAME_ENGINE_CONFIG, genesisState: () => s, reducer: (before, e, ctx) => reduceGameEvent(before, e, ctx, registry) });
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: () => ({ runtime: reward(), remainingDreamsignPool: [OTHER] }) }));
  registerDeckContentProvider({ resolveCardNumber: () => null, resolveDreamsign: sign });
});
afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); registerJourneyLifecycleContentProvider(null); });

describe("journeyEssence public hooks", () => {
  it("validates catalog arithmetic and projects immutable base quotes from live UUID holdings", () => {
    expect(() => journeyEssence(STAR, { kind: "multiplyEssenceSiteGain", factor: NaN })).toThrow(RangeError);
    expect(() => journeyEssence(WORM, { kind: "newDreamscapeEssence", numerator: 1, denominator: 0 })).toThrow(RangeError);
    expect(essenceSiteGain(state([STAR, OTHER, STAR]).journey, 17, registry)).toBe(153);
    expect(essenceSiteGain(state([OTHER]).journey, 17, registry)).toBe(17);
  });
  it("multiplies a successful collection once per held copy, preserving the base quote and logging UUIDs", () => {
    const before = quoted([STAR, OTHER, STAR]);
    const result = apply(before, "ACCEPT_ESSENCE", { siteId: SITE });
    expect(result.state.journey.essence).toBe(258);
    expect(result.state.journey.siteRuntime[SITE]).toEqual({ kind: "essence", amount: 17, accepted: true });
    expect(result.logRecords).toHaveLength(2);
    expect(result.logRecords?.map((log) => log.fields)).toMatchObject([
      { dreamsignId: STAR, before: { gained: 17 }, after: { gained: 51 }, target: { siteIds: [SITE], nodeId: NODE } },
      { dreamsignId: STAR, before: { gained: 51 }, after: { gained: 153 } },
    ]);
    expect(before.journey.essence).toBe(105);
    expect(apply(result.state, "ACCEPT_ESSENCE", { siteId: SITE }).state).toBe(result.state);
  });
  it("uses live gain/loss at acceptance and leaves opening/admin/unrelated gains unmultiplied", () => {
    const opened = apply(state(), "OPEN_SITE", open);
    expect(opened.state.journey.essence).toBe(105);
    const gained = apply(quoted([]), "ADD_DREAMSIGN", { dreamsignId: STAR }).state;
    expect(apply(gained, "ACCEPT_ESSENCE", { siteId: SITE }).state.journey.essence).toBe(156);
    const lost = apply(quoted([STAR]), "REMOVE_DREAMSIGN", { dreamsignId: STAR }).state;
    expect(apply(lost, "ACCEPT_ESSENCE", { siteId: SITE }).state.journey.essence).toBe(122);
    expect(apply(state([STAR]), "ADJUST_ESSENCE", { delta: 7 }).state.journey.essence).toBe(112);
    const administrative = apply(state([STAR, WORM]), "SET_ESSENCE", { value: 19 });
    expect(administrative.outcome).toBe("applied");
    expect(administrative.state.journey.essence).toBe(19);
    expect(administrative.logRecords).toBeUndefined();
    const deniedBefore = state([STAR, WORM]);
    const malformed = apply(deniedBefore, "SET_ESSENCE", { essence: 19 });
    expect(malformed.outcome).toBe("bounced");
    expect(malformed.state).toBe(deniedBefore);
    const sentinel = createJourneyModifierRegistry([{
      dreamsignId: STAR,
      afterJourneyEvent: ({ journey }) => ({
        journey: { ...journey, essence: journey.essence + 1 },
        before: { essence: journey.essence }, after: { essence: journey.essence + 1 },
      }),
    }]);
    const excluded = reduceGameEvent(state([STAR, WORM]), event("SET_ESSENCE", { value: 19 }), context, sentinel);
    expect(excluded.outcome).toBe("applied");
    expect(excluded.state.journey.essence).toBe(19);
    expect(excluded.logRecords).toBeUndefined();
    const gameplay = reduceGameEvent(state([STAR, WORM]), event("ADJUST_ESSENCE", { delta: 7 }), context, sentinel);
    expect(gameplay.outcome).toBe("applied");
    expect(gameplay.state.journey.essence).toBe(113);
    expect(gameplay.logRecords).toHaveLength(1);
    const legacy = apply(state([STAR]), "ACCEPT_ESSENCE", { siteId: SITE });
    const runtime = legacy.state.journey.siteRuntime[SITE];
    if (runtime?.kind !== "essence") throw new Error("expected base quote");
    expect(legacy.state.journey.essence).toBe(105 + runtime.amount * 3);
  });
  it.each(["OPEN_SITE", "ACCEPT_ESSENCE"] as const)("%s prepares exactly one Pearl reward atomically, without Essence", (type) => {
    const generate = vi.fn<SiteContentProvider["openEssenceDreamsignReward"]>(() => ({ runtime: reward(), remainingDreamsignPool: [OTHER] }));
    registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: generate }));
    const before = state([PEARL, STAR, PEARL]);
    const prepared = apply(before, type, type === "OPEN_SITE" ? open : { siteId: SITE });
    expect(prepared.state.journey.siteRuntime[SITE]).toMatchObject({ kind: "reward", journeyEssenceSource: PEARL, accepted: false });
    expect(prepared.state.journey.essence).toBe(105);
    expect(prepared.state.journey.remainingDreamsignPool).toEqual([OTHER]);
    expect(before.journey.remainingDreamsignPool).toEqual([INCOMING, OTHER]);
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({ offerCount: 1 });
    expect(prepared.logRecords).toHaveLength(1);
    expect(prepared.logRecords?.[0].fields).toMatchObject({ dreamsignId: PEARL, target: { nodeId: NODE, siteIds: [SITE], incomingDreamsignId: INCOMING }, after: { offered: 1 } });
    const committed = apply(prepared.state, "ACCEPT_REWARD", { siteId: SITE });
    expect(committed.state.journey.dreamsigns.map(({ id }) => id)).toEqual([PEARL, STAR, PEARL, INCOMING]);
    expect(committed.state.journey.essence).toBe(105);
    expect(committed.logRecords).toBeUndefined();
    expect(apply(committed.state, "ACCEPT_REWARD", { siteId: SITE }).state).toBe(committed.state);
  });
  it("persists a prepared replacement across loss/reload, without rewriting an ordinary quote on later gain", () => {
    const prepared = apply(state([PEARL]), "OPEN_SITE", open).state;
    const lost = apply(prepared, "REMOVE_DREAMSIGN", { dreamsignId: PEARL }).state;
    const loaded = apply(lost, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(lost.journey)) });
    expect(loaded.state.journey.siteRuntime[SITE]).toEqual(prepared.journey.siteRuntime[SITE]);
    expect(loaded.logRecords).toBeUndefined();
    expect(apply(loaded.state, "ACCEPT_REWARD", { siteId: SITE }).state.journey.dreamsigns.map(({ id }) => id)).toEqual([INCOMING]);
    const normal = apply(quoted([]), "ADD_DREAMSIGN", { dreamsignId: PEARL }).state;
    expect(apply(normal, "ACCEPT_ESSENCE", { siteId: SITE }).state.journey.essence).toBe(122);
    const snapshot = { ...prepared.journey, siteRuntime: { [SITE]: { ...reward(), journeyEssenceSource: 7 } } };
    expect(apply(prepared, "LOAD_STATE", { snapshot }).outcome).toBe("bounced");
  });
  it("cap replacement/decline use ordinary reward completion and stale preparation cannot regenerate", () => {
    const before = state([PEARL]);
    before.journey.maxDreamsigns = 1;
    const prepared = apply(before, "OPEN_SITE", open).state;
    expect(apply(prepared, "ACCEPT_REWARD", { siteId: SITE }).state).toBe(prepared);
    expect(apply(prepared, "ACCEPT_ESSENCE", { siteId: SITE }).state).toBe(prepared);
    expect(apply(prepared, "ACCEPT_REWARD", { siteId: SITE, purgeIndex: 5 }).state).toBe(prepared);
    const replaced = apply(prepared, "ACCEPT_REWARD", { siteId: SITE, purgeIndex: 0 });
    expect(replaced.state.journey.dreamsigns.map(({ id }) => id)).toEqual([INCOMING]);
    const declined = apply(prepared, "COMPLETE_SITE", { siteId: SITE });
    expect(declined.state.journey.dreamsigns.map(({ id }) => id)).toEqual([PEARL]);
    expect(declined.state.journey.atlas.nodes[NODE].sites[0].isVisited).toBe(true);
    expect(apply(declined.state, "OPEN_SITE", open).state).toBe(declined.state);
  });
  it("permits only a current pending Pearl decline, independently of current holding", () => {
    const prepared = apply(state([PEARL]), "OPEN_SITE", open).state;
    const lost = apply(prepared, "REMOVE_DREAMSIGN", { dreamsignId: PEARL }).state;
    expect(apply(lost, "COMPLETE_SITE", { siteId: SITE }).state.journey.atlas.nodes[NODE].sites[0].isVisited).toBe(true);
    const cases = [state(), state(), state(), state(), state(), state(), state()];
    cases.forEach((s) => { s.journey.siteRuntime[SITE] = { ...reward(), journeyEssenceSource: PEARL }; });
    cases[0].journey.currentDreamscape = parseAtlasNodeId("foreign-node");
    cases[1].journey.atlas.nodes[NODE].sites[0].isVisited = true;
    cases[2].journey.siteRuntime[SITE] = { ...reward(), journeyEssenceSource: PEARL, accepted: true };
    cases[3].journey.siteRuntime[SITE] = reward();
    cases[4].journey.siteRuntime[SITE] = { kind: "essence", amount: 17, accepted: false };
    cases[5].journey.atlas.nodes[NODE].sites[0].type = "Reward";
    cases[6].journey.screen = { type: "atlas" };
    for (const before of cases) expect(apply(before, "COMPLETE_SITE", { siteId: SITE }).state).toBe(before);
    const decline = apply(prepared, "COMPLETE_SITE", { siteId: SITE }).state;
    expect(apply(decline, "COMPLETE_SITE", { siteId: SITE }).state).toBe(decline);
    const conflict = reduceGameEvent(prepared, event("COMPLETE_SITE", { siteId: SITE }), { ...context, intervening: [{ seq: 1, actor: testEventActor("partner"), type: "COMPLETE_SITE" }] }, registry);
    expect(conflict.bounceReason).toBe("partner_conflict");
  });
  it("null and invalid replacement generation bounce atomically without an Essence fallback", () => {
    const before = state([PEARL]);
    for (const runtime of [null, { runtime: { kind: "essence" as const, amount: 999, accepted: false }, remainingDreamsignPool: [] }]) {
      registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: () => runtime }));
      for (const type of ["OPEN_SITE", "ACCEPT_ESSENCE"] as const) {
        const result = apply(before, type, type === "OPEN_SITE" ? open : { siteId: SITE });
        expect(result.state).toBe(before);
        expect(result.logRecords).toBeUndefined();
      }
    }
  });
  it("rejects stale/foreign/visited preparations before RNG or provider work", () => {
    const generate = vi.fn(() => ({ runtime: reward() }));
    registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: generate }));
    const before = state([PEARL]);
    before.journey.atlas.nodes[NODE].sites[0].isVisited = true;
    expect(apply(before, "OPEN_SITE", open).state).toBe(before);
    expect(apply(state([PEARL]), "OPEN_SITE", { ...open, siteId: parseSiteId("foreign") }).outcome).toBe("bounced");
    expect(apply(state([PEARL]), "OPEN_SITE", { siteId: SITE }).outcome).toBe("bounced");
    expect(generate).not.toHaveBeenCalled();
  });
  it("contains interrupted generation in the public log, then recovers on a later valid preparation", () => {
    const before = state([PEARL]);
    const config = engine(before);
    registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: () => { throw new Error("synthetic interruption"); } }));
    const log = createLocalLog({ config, genesis: GENESIS, localActor: ACTOR, now: () => context.timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "OPEN_SITE", payload: open });
    expect(log.state()).toBe(before);
    expect(records[0].outcome).toBe("bounced");
    expect(records[0].error).toBeDefined();
    expect(records[0].logRecords).toBeUndefined();
    expect(foldEvents(config, GENESIS, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(before);
    registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: () => ({ runtime: reward(), remainingDreamsignPool: [OTHER] }) }));
    log.append({ type: "OPEN_SITE", payload: open });
    log.append({ type: "ACCEPT_REWARD", payload: { siteId: SITE } });
    expect(log.state().journey.dreamsigns.map(({ id }) => id)).toEqual([PEARL, INCOMING]);
  });
  it("JSON replay and competing/repeated collection intents preserve one atomic grant", () => {
    const before = state([PEARL]);
    const config = engine(before);
    const log = createLocalLog({ config, genesis: GENESIS, localActor: ACTOR, now: () => context.timestamp, devMode: true });
    log.append({ type: "OPEN_SITE", payload: open });
    log.append({ type: "OPEN_SITE", payload: open });
    log.append({ type: "ACCEPT_REWARD", payload: { siteId: SITE } });
    log.append({ type: "ACCEPT_REWARD", payload: { siteId: SITE } });
    const events = [...log.events()];
    const persisted = JSON.parse(JSON.stringify(events)) as typeof events;
    const replay = foldEvents(config, GENESIS, { seq: 0, state: before }, persisted, { devMode: true });
    expect(replay.state).toEqual(log.state());
    expect(replay.state.journey.dreamsigns.map(({ id }) => id)).toEqual([PEARL, INCOMING]);
    const prepared = apply(before, "OPEN_SITE", open).state;
    const conflict = reduceGameEvent(prepared, event("ACCEPT_REWARD", { siteId: SITE }), { ...context, intervening: [{ seq: 1, actor: testEventActor("partner"), type: "ACCEPT_REWARD" }] }, registry);
    expect(conflict.bounceReason).toBe("partner_conflict");
    expect(conflict.state).toBe(prepared);
  });
  it("applies fractional entry gains sequentially by held UUID order, with same-node/admin controls", () => {
    const before = travel([WORM, STAR, WORM]);
    const entered = apply(before, "TRAVEL_TO_DREAMSCAPE", { nodeId: NODE });
    expect(entered.state.journey.essence).toBe(164.0625);
    expect(entered.logRecords).toHaveLength(2);
    expect(entered.logRecords?.map((log) => log.fields)).toMatchObject([
      { dreamsignId: WORM, before: { essence: 105 }, after: { essence: 131.25 }, target: { nodeId: NODE, siteIds: [] } },
      { dreamsignId: WORM, before: { essence: 131.25 }, after: { essence: 164.0625 } },
    ]);
    const same = { ...entered.state, journey: { ...entered.state.journey, screen: { type: "atlas" as const } } };
    expect(apply(same, "TRAVEL_TO_DREAMSCAPE", { nodeId: NODE }).state.journey.essence).toBe(164.0625);
    expect(apply(same, "TRAVEL_TO_DREAMSCAPE", { nodeId: NODE }).logRecords).toBeUndefined();
    expect(apply(entered.state, "ADJUST_ESSENCE", { delta: 4 }).state.journey.essence).toBe(168.0625);
    const zero = travel([WORM]); zero.journey.essence = 0;
    expect(apply(zero, "TRAVEL_TO_DREAMSCAPE", { nodeId: NODE }).state.journey.essence).toBe(0);
    const loaded = apply(entered.state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(entered.state.journey)) });
    expect(loaded.state.journey.essence).toBe(164.0625);
    expect(loaded.logRecords).toBeUndefined();
  });
  it("uses post-start holdings/current balance and bounces invalid travel without applying entry gains", () => {
    const before = state(); before.journey.currentDreamscape = null;
    registerJourneyLifecycleContentProvider(testJourneyLifecycleContentProvider({ startJourney: () => state([WORM, WORM]).journey }));
    const started = apply(before, "START_JOURNEY", { avatarId: testAvatarId("synthetic") });
    expect(started.state.journey.essence).toBe(164.0625);
    expect(started.logRecords).toHaveLength(2);
    expect(apply(travel([WORM]), "TRAVEL_TO_DREAMSCAPE", { nodeId: parseAtlasNodeId("foreign") }).outcome).toBe("bounced");
  });
});
