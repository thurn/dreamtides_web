import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { GameEvent, Genesis } from "../../eventlog/types";
import { makeAuguryTestContent, makeAuguryTestDreamsignTemplate } from "../../journey_v2/testing/fixtures";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createDeckContentProvider } from "../../session/providers/deck-provider";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseJourneyId, parseSiteId, type DreamsignId } from "../../types/identifiers";
import { testDreamsignId, testEventActor } from "../../types/test-identities";
import type { JourneyState, SiteState, SiteType } from "../../types/journey";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerDeckContentProvider } from "./deck";
import { ctx, NODE_ID, poolDraftState, stateWithDraftSites } from "./draft-fixtures";
import { journeySites, projectJourneySite } from "./journey-sites";
import { createJourneyModifierRegistry, type JourneyModifierRegistry } from "./modifier-registry";
import { isEnhancedDreamsignReward, registerSiteContentProvider } from "./sites";

const TARGET = testDreamsignId("sites-targeted"), RANDOM = testDreamsignId("sites-random"), OTHER = testDreamsignId("sites-other");
const SITE = parseSiteId("target-site"), GUIDE = parseSiteId("other-guide"), ACTOR = testEventActor("sites-owner");
const IDS = Array.from({ length: 8 }, (_, i) => testDreamsignId(`site-choice-${i}`));
const baseContent = makeAuguryTestContent({ cards: [], dreamsignTemplates: IDS.map((id) => makeAuguryTestDreamsignTemplate({ id, name: "Same synthetic name", imageName: "synthetic.png", imageAlt: "Synthetic" })) });
const content = { ...baseContent,
  sitesData: { ...baseContent.sitesData, rewards: { ...baseContent.sitesData.rewards, reward: { ...baseContent.sitesData.rewards.reward, enhancedOfferCount: 4 } } },
  economyData: { ...baseContent.economyData, siteRewards: { ...baseContent.economyData.siteRewards, dreamsignRevelation: { standardOfferCount: 2, enhancedOfferCount: 5 } } },
};
const target = journeySites(TARGET, { kind: "enhanceSiteTypes", siteTypes: ["Reward", "DreamsignRevelation"] });
const random = journeySites(RANDOM, { kind: "additionalEnhancedSite", count: 1 });
const registry = createJourneyModifierRegistry([random, target]);
const sign = (id: DreamsignId) => ({ id, name: "Same synthetic name", effectDescription: "" });
const site = (type: SiteType, id = SITE, isEnhanced = false): SiteState => ({ id, type, isEnhanced, isVisited: false });
function fixture(type: SiteType = "Reward", ids: DreamsignId[] = [TARGET], extra: Partial<JourneyState> = {}, sites?: SiteState[]): FoldState {
  const base = stateWithDraftSites(poolDraftState());
  const node = base.journey.atlas.nodes[NODE_ID];
  return { ...base, journey: { ...base.journey, runId: parseJourneyId("site-contract-run"), dreamsigns: ids.map(sign), remainingDreamsignPool: IDS,
    screen: { type: "dreamscape" }, atlas: { ...base.journey.atlas, nodes: { [NODE_ID]: { ...node, sites: sites ?? [site(type)] } } }, ...extra } };
}
const event = (type: GameEvent["type"], payload: Record<string, unknown> = {}): GameEvent =>
  ({ type, payload: { siteId: SITE, ...payload }, actor: ACTOR, clientTimestamp: ctx().timestamp});
const apply = (state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, use: JourneyModifierRegistry = registry) =>
  reduceGameEvent(state, event(type, payload), ctx(), use);
const open = (state: FoldState) => apply(state, "OPEN_SITE", { selectionRulesVersion: SELECTION_RULES_VERSION });
const modifierRows = (r: ReturnType<typeof apply>) => (r.logRecords ?? []).filter((row) => row.event === "journey_modifier_applied");
const storedSite = (state: FoldState) => state.journey.atlas.nodes[NODE_ID].sites.find((s) => s.id === SITE)!;
function offeredIds(state: FoldState): DreamsignId[] {
  const runtime = state.journey.siteRuntime[SITE];
  if (runtime?.kind === "dreamsignOffer") return runtime.offeredDreamsigns.map((s) => s.id);
  if (isEnhancedDreamsignReward(runtime)) return runtime.enhancedDreamsignOffer.offeredDreamsigns.map((s) => s.id);
  if (runtime?.kind === "reward" && runtime.reward.rewardType === "dreamsign") return [runtime.reward.dreamsign.id];
  throw new Error("Missing synthetic offer");
}

/** Targeted preparation and effective enhancement composition through the public fold. */
export function registerJourneyDraftSiteContracts() {
  describe("journeySites targeted enhancement", () => {
    beforeEach(() => { registerSiteContentProvider(createSiteContentProvider(content));
      const provider = createDeckContentProvider(content);
      registerDeckContentProvider({ ...provider, resolveDreamsign: (id) => id === TARGET || id === RANDOM || id === OTHER ? sign(id) : provider.resolveDreamsign(id) }); });
    afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); });

    it.each<SiteType>(["Reward", "DreamsignRevelation"])("projects only unopened %s and prepares the catalog enhanced count once", (type) => {
      const before = fixture(type, [TARGET, TARGET]), saved = structuredClone(before);
      expect(projectJourneySite(before.journey, storedSite(before), registry).isEnhanced).toBe(true);
      expect(storedSite(before).isEnhanced).toBe(false);
      const result = open(before), offered = offeredIds(result.state);
      expect(result.outcome).toBe("applied");
      expect(offered).toHaveLength(type === "Reward" ? 4 : 5);
      expect(new Set(offered).size).toBe(offered.length);
      expect(result.state.journey.remainingDreamsignPool).toEqual(IDS.filter((id) => !offered.includes(id)));
      expect(storedSite(result.state).isEnhanced).toBe(true);
      expect(modifierRows(result)).toHaveLength(1);
      expect(modifierRows(result)[0].fields).toMatchObject({ dreamsignId: TARGET, target: { siteIds: [SITE] }, before: { enhanced: 0 }, after: { enhanced: 1 } });
      expect(before).toEqual(saved);
      expect(open(result.state).state).toBe(result.state);
    });

    it.each<SiteType>(["Reward", "DreamsignRevelation"])("uses live holdings before %s preparation and keeps prepared mode after loss", (type) => {
      const source = fixture(type), absent = apply(source, "REMOVE_DREAMSIGN", { dreamsignId: TARGET }).state;
      expect(projectJourneySite(absent.journey, storedSite(absent), registry).isEnhanced).toBe(false);
      expect(offeredIds(open(absent).state)).toHaveLength(type === "Reward" ? 1 : 2);
      const prepared = open(source).state, oldRuntime = structuredClone(prepared.journey.siteRuntime[SITE]);
      const lost = apply(prepared, "REMOVE_DREAMSIGN", { dreamsignId: TARGET }).state;
      const poor = apply(lost, "SET_ESSENCE", { value: 0 }).state;
      expect(poor.journey.siteRuntime[SITE]).toEqual(oldRuntime);
      expect(poor.journey.remainingDreamsignPool).toEqual(prepared.journey.remainingDreamsignPool);
      expect(projectJourneySite(poor.journey, storedSite(poor), registry).isEnhanced).toBe(true);
      const snapshot = JSON.parse(JSON.stringify(poor.journey)) as JourneyState;
      const loaded = JSON.parse(JSON.stringify(apply(source, "LOAD_STATE", { snapshot }).state.journey)) as JourneyState;
    // Import starts a new run; the portable choices and resources stay exact.
    expect({ ...loaded, runId: snapshot.runId }).toEqual(snapshot);
    });

    it("preserves an ordinary already prepared site when the targeted Dreamsign is gained", () => {
      for (const type of ["Reward", "DreamsignRevelation"] as const) {
        const ordinary = open(fixture(type, [])).state, runtime = structuredClone(ordinary.journey.siteRuntime[SITE]);
        const gained = apply(ordinary, "ADD_DREAMSIGN", { dreamsignId: TARGET });
        expect(gained.state.journey.siteRuntime[SITE]).toEqual(runtime);
        expect(storedSite(gained.state).isEnhanced).toBe(false);
        expect(modifierRows(gained)).toEqual([]);
      }
    });

    it("preserves natural mode and leaves unrelated, visited and prepared sites outside live projection", () => {
      const before = fixture("DreamsignRevelation", [TARGET], {}, [site("DreamsignRevelation", SITE, true)]);
      expect(modifierRows(open(before))).toEqual([]);
      for (const type of ["Draft", "DreamsignBazaar", "Essence", "Purge"] as const) {
        const candidate = site(type); expect(projectJourneySite(before.journey, candidate, registry)).toBe(candidate);
      }
      const visited = { ...site("Reward"), isVisited: true };
      expect(projectJourneySite(before.journey, visited, registry)).toBe(visited);
    });

    it.each<SiteType>(["Reward", "DreamsignRevelation"])("accepts an exact shown %s UUID with replacement, rejects stale answers and supports decline", (type) => {
      const prepared = open(fixture(type, [TARGET], { maxDreamsigns: 1 })).state;
      const ids = offeredIds(prepared), chosen = content.dreamsignTemplates.find((s) => s.id === ids[ids.length - 1])!;
      expect(apply(prepared, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: OTHER }).state).toBe(prepared);
      const selected = apply(prepared, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: chosen.id, purgeIndex: 0 });
      expect(selected.outcome).toBe("applied");
      expect(selected.state.journey.dreamsigns.map((s) => s.id)).toEqual([chosen.id]);
      expect(storedSite(selected.state).isVisited).toBe(true);
      expect(storedSite(selected.state).isEnhanced).toBe(true);
      expect(apply(selected.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: chosen.id, purgeIndex: 0 }).state).toBe(selected.state);
      const declined = apply(prepared, "REJECT_DREAMSIGN_OFFER");
      expect(declined.state.journey.dreamsigns).toEqual(prepared.journey.dreamsigns);
      expect(storedSite(declined.state).isVisited).toBe(true);
    });

    it("contains provider failure without a partial prepared mode or pool write", () => {
      const before = fixture(), saved = structuredClone(before);
      const provider = createSiteContentProvider(content);
      registerSiteContentProvider({ ...provider, openSite: () => { throw new Error("synthetic site preparation failure"); } });
      const config = { ...GAME_ENGINE_CONFIG, genesisState: () => before, reducer: (s: FoldState, e: GameEvent, context: ReturnType<typeof ctx>) => reduceGameEvent(s, e, context, registry) };
      const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
      const log = createLocalLog({ config, genesis, localActor: ACTOR, devMode: false, now: () => ctx().timestamp });
      log.append({ type: "OPEN_SITE", payload: { siteId: SITE, selectionRulesVersion: SELECTION_RULES_VERSION } });
      expect(log.state()).toEqual(saved);
      expect(foldEvents(config, genesis, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(saved);
    });

    it.each([{ ids: [RANDOM, TARGET] }, { ids: [TARGET, RANDOM] }, { ids: [TARGET, RANDOM, TARGET] }])("excludes live targeted mode from an additional random entitlement in held order %j", ({ ids }) => {
      const before = fixture("DreamsignRevelation", ids, {}, [site("DreamsignRevelation"), site("Purge", GUIDE)]);
      const result = apply(before, "ADJUST_ESSENCE", { delta: 1 }), node = result.state.journey.atlas.nodes[NODE_ID];
      expect(node.journeySiteEnhancements?.map((grant) => grant.siteId)).toEqual([GUIDE]);
      expect(node.sites.find((s) => s.id === GUIDE)?.isEnhanced).toBe(true);
      expect(storedSite(result.state).isEnhanced).toBe(false);
      expect(projectJourneySite(result.state.journey, storedSite(result.state), registry).isEnhanced).toBe(true);
      expect(modifierRows(result).map((r) => r.fields.dreamsignId)).toEqual([RANDOM]);
    });

    it.each([{ ids: [RANDOM, TARGET] }, { ids: [TARGET, RANDOM] }])("retains prepared mode and random history on loss and replay (%j)", ({ ids }) => {
      const before = fixture("DreamsignRevelation", ids, {}, [site("DreamsignRevelation"), site("Purge", GUIDE)]);
      const config = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
        reducer: (s: FoldState, e: GameEvent, context: ReturnType<typeof ctx>) => reduceGameEvent(s, e, context, registry) };
      const genesis: Genesis = { seed: before.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG };
      const log = createLocalLog({ config, genesis, localActor: ACTOR, now: () => ctx().timestamp });
      log.append({ type: "OPEN_SITE", payload: { siteId: SITE, selectionRulesVersion: SELECTION_RULES_VERSION } });
      const prepared = structuredClone(log.state().journey.siteRuntime[SITE]);
      log.append({ type: "REMOVE_DREAMSIGN", payload: { dreamsignId: TARGET } });
      expect(log.state().journey.siteRuntime[SITE]).toEqual(prepared);
      expect(storedSite(log.state()).isEnhanced).toBe(true);
      expect(log.state().journey.atlas.nodes[NODE_ID].journeySiteEnhancements?.map((g) => g.siteId)).toEqual([GUIDE]);
      expect(foldEvents(config, genesis, { seq: 0, state: before }, [...log.events()]).state).toEqual(log.state());
    });

    it("keeps natural enhancement and duplicate-source history separate from live targeted mode", () => {
      const natural = fixture("DreamsignRevelation", [TARGET, RANDOM], {}, [site("DreamsignRevelation", SITE, true), site("Purge", GUIDE)]);
      expect(apply(natural, "ADJUST_ESSENCE", { delta: 1 }).state.journey.atlas.nodes[NODE_ID].journeySiteEnhancements?.map((g) => g.siteId)).toEqual([GUIDE]);
      const duplicates = fixture("DreamsignRevelation", [RANDOM, TARGET, RANDOM], {}, [site("DreamsignRevelation"), site("Purge", GUIDE)]);
      const first = apply(duplicates, "ADJUST_ESSENCE", { delta: 1 }).state;
      expect(first.journey.atlas.nodes[NODE_ID].journeySiteEnhancements).toHaveLength(1);
      const lost = apply(first, "REMOVE_DREAMSIGN", { dreamsignId: TARGET }).state;
      expect(lost.journey.atlas.nodes[NODE_ID].journeySiteEnhancements?.map((g) => g.siteId)).toEqual([GUIDE, SITE]);
      const history = lost.journey.atlas.nodes[NODE_ID].journeySiteEnhancements;
      const regained = apply(lost, "ADD_DREAMSIGN", { dreamsignId: TARGET }).state;
      expect(regained.journey.atlas.nodes[NODE_ID].journeySiteEnhancements).toEqual(history);
      expect(apply(regained, "ADJUST_ESSENCE", { delta: 1 }).state.journey.atlas.nodes[NODE_ID].journeySiteEnhancements).toEqual(history);
    });
  });
}
