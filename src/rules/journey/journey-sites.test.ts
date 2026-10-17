import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, Genesis } from "../../eventlog/types";
import { makeTestAtlasNode } from "../../testing/atlas-fixtures";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testCardId, testDreamsignId, testEventActor, testExplorationActionId, testJourneySeed } from "../../types/test-identities";
import { parseAtlasNodeId, parseSiteId, type DreamsignId } from "../../types/identifiers";
import type { ExplorationSiteRuntime, SiteState, SiteType } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { initialFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import type { GameEventType } from "../events";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerSiteContentProvider } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { explorationRerollCount, journeySites } from "./journey-sites";

const ENHANCE = testDreamsignId("enhance-source");
const REROLL = testDreamsignId("reroll-source");
const OTHER = testDreamsignId("same-name-other-source");
const NODE = parseAtlasNodeId("sites-node");
const SITE = parseSiteId("exploration-site");
const ACTOR = testEventActor("sites-player");
const OLD = testCardId("old-encounter");
const NEW = testCardId("new-encounter");
const GENESIS: Genesis = { seed: testJourneySeed("journey-sites"), reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
const registry = createJourneyModifierRegistry([
  journeySites(ENHANCE, { kind: "additionalEnhancedSite", count: 1 }),
  journeySites(REROLL, { kind: "rerollExploration", rerollsPerSite: 1 }),
]);
const context = { seq: 1, contentConfig: TEST_CONTENT_CONFIG, rng: () => { throw new Error("unexpected intent RNG read"); }, timestamp: "1970-01-01T00:00:00Z" };
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "Synthetic effect" });
const site = (idSeed: string, type: SiteType, extra: Partial<SiteState> = {}): SiteState => ({ id: parseSiteId(idSeed), type, isVisited: false, isEnhanced: false, ...extra });
const exploration = (extra: Partial<ExplorationSiteRuntime> = {}): ExplorationSiteRuntime => ({ kind: "exploration", selectionRulesVersion: SELECTION_RULES_VERSION, encounterCardId: OLD, actionOffers: [], resolution: null, ...extra });
function state(ids: readonly DreamsignId[] = [ENHANCE], sites = [site("shop", "Shop"), site("purge", "Purge"), site("battle", "Battle")]): FoldState {
  const base = initialFoldState(GENESIS.seed, TEST_CONTENT_CONFIG);
  return { ...base, journey: { ...base.journey, currentDreamscape: NODE, screen: { type: "dreamscape" }, dreamsigns: ids.map(sign), atlas: { ...base.journey.atlas, nodes: { [NODE]: makeTestAtlasNode(NODE, sites) } } } };
}
function event(type: GameEventType, payload: Record<string, unknown>) {
  return { type, payload, actor: ACTOR, clientTimestamp: context.timestamp };
}
function apply(before: FoldState, type: GameEventType = "ADJUST_ESSENCE", payload: Record<string, unknown> = { delta: 1 }) {
  return reduceGameEvent(before, event(type, payload), context, registry);
}
function rerollState(ids: readonly DreamsignId[] = [REROLL]): FoldState {
  const base = state(ids, [site(SITE, "Exploration")]);
  return { ...base, journey: { ...base.journey, screen: { type: "site", siteId: SITE }, siteRuntime: { [SITE]: exploration() } } };
}
const payload = (counter = 0, cardId = OLD) => ({ siteId: SITE, dreamsignId: REROLL, expectedEncounterCardId: cardId, expectedRerollCount: counter, selectionRulesVersion: SELECTION_RULES_VERSION });
const grants = (s: FoldState) => s.journey.atlas.nodes[NODE].journeySiteEnhancements ?? [];
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider({ rerollExploration: () => exploration({ encounterCardId: NEW }) }));
  registerDeckContentProvider({ resolveCardNumber: () => null, resolveDreamsign: (id) => sign(id) });
});
afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); });

describe("journeySites registered hooks", () => {
  it.each<SiteType>(["Shop", "Purge", "Transfiguration", "Duplication", "Augury", "DreamsignBazaar", "DreamsignRevelation", "Gamble", "Exploration"])("enhances an unopened %s guide site, with UUID provenance", (type) => {
    const before = state([ENHANCE], [site("target", type), site("battle", "Battle")]);
    const result = apply(before);
    expect(result.state.journey.atlas.nodes[NODE].sites[0].isEnhanced).toBe(true);
    expect(grants(result.state)).toEqual([{ dreamsignId: ENHANCE, siteId: parseSiteId("target"), entitlement: 0 }]);
    expect(result.logRecords).toHaveLength(1);
    expect(result.logRecords?.[0].fields).toMatchObject({ dreamsignId: ENHANCE, target: { nodeId: NODE, siteIds: [parseSiteId("target")] } });
    expect(before.journey.atlas.nodes[NODE].sites[0].isEnhanced).toBe(false);
  });
  it("excludes nonguide, visited, opened and already enhanced sites without spending entitlement", () => {
    const before = state([ENHANCE], [site("battle", "Battle"), site("draft", "Draft"), site("essence", "Essence"), site("reward", "Reward"), site("visited", "Purge", { isVisited: true }), site("base", "RandomSite", { isEnhanced: true }), site("opened", "Shop")]);
    before.journey.siteRuntime[parseSiteId("opened")] = { kind: "essence", amount: 1, accepted: false };
    const result = apply(before);
    expect(grants(result.state)).toEqual([]);
    expect(result.logRecords).toBeUndefined();
    expect(result.state.journey.atlas.nodes[NODE].sites).toEqual(before.journey.atlas.nodes[NODE].sites);
  });
  it("gain excludes an active runtime-less Purge while enhancing another unopened guide site", () => {
    const before = state([], [site("active-purge", "Purge"), site("unopened-shop", "Shop")]);
    before.journey.screen = { type: "site", siteId: parseSiteId("active-purge") };
    expect(before.journey.siteRuntime[parseSiteId("active-purge")]).toBeUndefined();
    const result = apply(before, "ADD_DREAMSIGN", { dreamsignId: ENHANCE });
    expect(result.state.journey.atlas.nodes[NODE].sites.map((s) => s.isEnhanced)).toEqual([false, true]);
    expect(grants(result.state)[0].siteId).toBe(parseSiteId("unopened-shop"));
  });
  it("caps duplicate copies, leaves base enhancements separate, and never replenishes historical uses", () => {
    const before = state([ENHANCE, OTHER, ENHANCE], [site("base", "Shop", { isEnhanced: true }), site("first", "Purge"), site("second", "Augury"), site("third", "Duplication")]);
    const first = apply(before);
    expect(grants(first.state)).toHaveLength(2);
    expect(first.logRecords).toHaveLength(2);
    expect(first.state.journey.atlas.nodes[NODE].sites.filter((s) => s.isEnhanced)).toHaveLength(3);
    const reordered = { ...first.state, journey: { ...first.state.journey, dreamsigns: [sign(ENHANCE), sign(ENHANCE), sign(OTHER)] } };
    expect(apply(reordered).logRecords).toBeUndefined();
    const lost = apply(first.state, "REMOVE_DREAMSIGN", { dreamsignId: ENHANCE });
    const regained = apply(lost.state, "ADD_DREAMSIGN", { dreamsignId: ENHANCE });
    expect(grants(regained.state)).toHaveLength(2);
    expect(regained.logRecords).toBeUndefined();
  });
  it("gain applies on that change, administrative writes are exact, and eligible starter/final nodes are included", () => {
    const empty = state([]);
    const gain = apply(empty, "ADD_DREAMSIGN", { dreamsignId: ENHANCE });
    expect(grants(gain.state)).toHaveLength(1);
    expect(grants(apply(state(), "SET_ESSENCE", { value: 5 }).state)).toEqual([]);
    for (const layer of ["One", "Seven"] as const) {
      const before = state();
      // Literal layer values are supplied by the stable layer enum below.
      before.journey.atlas.nodes[NODE].layer = layer === "One" ? LayerName.One : LayerName.Seven;
      expect(grants(apply(before).state)).toHaveLength(1);
    }
  });
  it("uses identity and canonical candidate order and activates a fresh node with a new entitlement", () => {
    expect(grants(apply(state([OTHER])).state)).toEqual([]);
    const before = state();
    const reverse = { ...before, journey: { ...before.journey, atlas: { ...before.journey.atlas, nodes: { [NODE]: { ...before.journey.atlas.nodes[NODE], sites: [...before.journey.atlas.nodes[NODE].sites].reverse() } } } } };
    expect(grants(apply(before).state)).toEqual(grants(apply(reverse).state));
    const nextNode = parseAtlasNodeId("next-node");
    const first = apply(before).state;
    const next = { ...first, journey: { ...first.journey, currentDreamscape: null, screen: { type: "atlas" as const }, atlas: { ...first.journey.atlas, currentNodeId: NODE, nodes: { ...first.journey.atlas.nodes, [NODE]: { ...first.journey.atlas.nodes[NODE], forwardIds: [nextNode] }, [nextNode]: makeTestAtlasNode(nextNode, [site("next-purge", "Purge")]) } } } };
    const travelled = apply(next, "TRAVEL_TO_DREAMSCAPE", { nodeId: nextNode });
    expect(travelled.state.journey.atlas.nodes[nextNode].journeySiteEnhancements).toHaveLength(1);
  });
});

describe("site-local optional Exploration reroll", () => {
  it("atomically redraws and consumes one use, logging exactly once with duplicate holdings", () => {
    const before = rerollState([REROLL, OTHER, REROLL]);
    const result = apply(before, "REROLL_EXPLORATION", payload());
    expect(result.outcome).toBe("applied");
    const runtime = result.state.journey.siteRuntime[SITE] as ExplorationSiteRuntime;
    expect(runtime.encounterCardId).toBe(NEW);
    expect(runtime.journeySiteRerolls).toEqual({ [REROLL]: 1 });
    expect(result.state.journey.deck).toEqual(before.journey.deck);
    expect(result.state.journey.essence).toBe(before.journey.essence);
    expect(result.state.journey.atlas).toEqual(before.journey.atlas);
    expect(result.logRecords).toHaveLength(1);
    expect(result.logRecords?.[0].fields).toMatchObject({ dreamsignId: REROLL, target: { siteIds: [SITE], beforeCardId: OLD, afterCardId: NEW }, before: { rerollsUsed: 0 }, after: { rerollsUsed: 1 } });
    registerSiteContentProvider(testSiteContentProvider({ rerollExploration: () => exploration({ encounterCardId: OLD }) }));
    const second = apply(result.state, "REROLL_EXPLORATION", payload(1, NEW));
    expect(second.logRecords).toHaveLength(1);
    expect(explorationRerollCount(second.state.journey.siteRuntime[SITE] as ExplorationSiteRuntime)).toBe(2);
    expect(apply(second.state, "REROLL_EXPLORATION", payload(2, OLD)).outcome).toBe("bounced");
  });
  it.each([
    { dreamsignId: OTHER }, { siteId: parseSiteId("foreign-site") },
    { expectedEncounterCardId: NEW }, { expectedRerollCount: 1 },
    { expectedRerollCount: Number.NaN }, { selectionRulesVersion: "foreign" },
  ])("rejects invalid/stale input before invoking the provider (%j)", (patch) => {
    const redraw = vi.fn(() => exploration({ encounterCardId: NEW }));
    registerSiteContentProvider(testSiteContentProvider({ rerollExploration: redraw }));
    const before = rerollState();
    const result = apply(before, "REROLL_EXPLORATION", { ...payload(), ...patch });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toBe(before);
    expect(redraw).not.toHaveBeenCalled();
    expect(result.logRecords).toBeUndefined();
  });
  it("bounces wrong screen, absent holding, visited and resolved sites", () => {
    const cases = [rerollState([]), rerollState(), rerollState(), rerollState()];
    cases[1].journey.screen = { type: "dreamscape" };
    cases[2].journey.atlas.nodes[NODE].sites[0].isVisited = true;
    cases[3].journey.siteRuntime[SITE] = exploration({ resolution: { actionId: testExplorationActionId("resolved"), gainedCardIds: [], gainedDreamsignIds: [], purgedCardIds: [], affectedEntryIds: [], essenceGained: 0 } });
    for (const before of cases) expect(apply(before, "REROLL_EXPLORATION", payload()).state).toBe(before);
  });
  it("provider null, unchanged result and exception cannot partially write or consume an allowance", () => {
    const before = rerollState();
    for (const redraw of [() => null, () => exploration()]) {
      registerSiteContentProvider(testSiteContentProvider({ rerollExploration: redraw }));
      expect(apply(before, "REROLL_EXPLORATION", payload()).state).toBe(before);
    }
    registerSiteContentProvider(testSiteContentProvider({ rerollExploration: () => { throw new Error("synthetic generation failure"); } }));
    expect(() => apply(before, "REROLL_EXPLORATION", payload())).toThrow("synthetic generation failure");
    expect(explorationRerollCount(before.journey.siteRuntime[SITE] as ExplorationSiteRuntime)).toBe(0);
  });
  it("the public event log contains a mid-step exception as an unchanged atomic result on replay", () => {
    const before = rerollState();
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (s, e, ctx) => reduceGameEvent(s, e, ctx, registry) };
    registerSiteContentProvider(testSiteContentProvider({ rerollExploration: () => { throw new Error("synthetic provider failure"); } }));
    const log = createLocalLog({ config, genesis: GENESIS, localActor: ACTOR, now: () => context.timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe((record) => records.push(record));
    log.append({ type: "REROLL_EXPLORATION", payload: payload() });
    expect(records[0].outcome).toBe("bounced");
    expect(records[0].error).toBeDefined();
    expect(records[0].logRecords).toBeUndefined();
    expect(log.state()).toBe(before);
    const replay = foldEvents(config, GENESIS, { seq: 0, state: before }, [...log.events()], { devMode: false });
    expect(replay.state).toEqual(before);
    expect(explorationRerollCount(replay.state.journey.siteRuntime[SITE] as ExplorationSiteRuntime)).toBe(0);
  });

  it("loss and reacquisition keep consumption, while another site starts with its own allowance", () => {
    const consumed = apply(rerollState(), "REROLL_EXPLORATION", payload()).state;
    const lost = apply(consumed, "REMOVE_DREAMSIGN", { dreamsignId: REROLL }).state;
    const gained = apply(lost, "ADD_DREAMSIGN", { dreamsignId: REROLL }).state;
    expect(apply(gained, "REROLL_EXPLORATION", payload(1, NEW)).outcome).toBe("bounced");
    const otherSite = parseSiteId("second-exploration-site");
    const fresh = { ...gained, journey: { ...gained.journey,
      screen: { type: "site" as const, siteId: otherSite },
      atlas: { ...gained.journey.atlas, nodes: { [NODE]: { ...gained.journey.atlas.nodes[NODE], sites: [...gained.journey.atlas.nodes[NODE].sites, site(otherSite, "Exploration")] } } },
      siteRuntime: { ...gained.journey.siteRuntime, [otherSite]: exploration() },
    } };
    expect(apply(fresh, "REROLL_EXPLORATION", { ...payload(), siteId: otherSite }).outcome).toBe("applied");
  });
  it("reload/replay retain one atomic result and repeated intents cannot consume twice", () => {
    const before = rerollState();
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (s, e, ctx) => reduceGameEvent(s, e, ctx, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: ACTOR, now: () => context.timestamp, devMode: true });
    log.append({ type: "REROLL_EXPLORATION", payload: payload() });
    log.append({ type: "REROLL_EXPLORATION", payload: payload() });
    const replay = foldEvents(config, GENESIS, { seq: 0, state: before }, [...log.events()], { devMode: true });
    expect(replay.state).toEqual(log.state());
    expect(explorationRerollCount(replay.state.journey.siteRuntime[SITE] as ExplorationSiteRuntime)).toBe(1);
  });
  it("saved-state reload is exact and rejects malformed optional counter/provenance fields", () => {
    const consumed = apply(rerollState(), "REROLL_EXPLORATION", payload()).state;
    const loaded = apply(consumed, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(consumed.journey)) });
    expect(loaded.outcome).toBe("applied");
    expect(loaded.logRecords).toBeUndefined();
    expect(apply(loaded.state, "REROLL_EXPLORATION", payload(1, NEW)).outcome).toBe("bounced");
    for (const count of [-1, 0.5, "1"]) {
      const snapshot = { ...consumed.journey, siteRuntime: { [SITE]: exploration({ journeySiteRerolls: { [REROLL]: count as number } }) } };
      expect(apply(consumed, "LOAD_STATE", { snapshot }).outcome).toBe("bounced");
    }
    const enhanced = apply(state()).state;
    const node = enhanced.journey.atlas.nodes[NODE];
    const snapshot = { ...enhanced.journey, atlas: { ...enhanced.journey.atlas, nodes: { [NODE]: { ...node, journeySiteEnhancements: [{ dreamsignId: ENHANCE, siteId: SITE, entitlement: -1 }] } } } };
    expect(apply(enhanced, "LOAD_STATE", { snapshot }).outcome).toBe("bounced");
  });
});
