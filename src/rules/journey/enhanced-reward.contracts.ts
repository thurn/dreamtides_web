import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog, type EventDraft, type CommittedEvent, type LocalLogBase } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { makeActions } from "../../session/actions";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createDeckContentProvider } from "../../session/providers/deck-provider";
import { makeAuguryTestContent, makeAuguryTestDeckEntry, makeAuguryTestCard,
  makeAuguryTestDreamsignTemplate, makeAuguryTestJourneyState, makeAuguryTestSite,
  makeAuguryTestResolvedPackage } from "../../journey_v2/testing/fixtures";
import { parseAtlasNodeId, parseDeckEntryId, parseDreamsignId, parseIntentKey, parseSiteId } from "../../types/identifiers";
import { testCardId, testDreamscapeId, testEventActor } from "../../types/test-identities";
import { LayerName } from "../../types/layer-name";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import type { Dreamsign, JourneyState, RewardSiteRuntime } from "../../types/journey";
import { initialFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { isEnhancedDreamsignReward, registerSiteContentProvider } from "./sites";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { testJourneyLifecycleContentProvider } from "./test-content-providers";
import { registerDeckContentProvider } from "./deck";

const IDS = [1, 2, 3, 4].map((n) => parseDreamsignId(`5e5e5e5e-0598-4000-8000-${String(n).padStart(12, "0")}`));
const SITE = parseSiteId("enhanced-reward-site"), NODE = parseAtlasNodeId("enhanced-reward-node");
const ACTOR = testEventActor("enhanced-reward-owner");
const TIME = "1970-01-01T00:00:00.000Z", REGISTRY = createJourneyModifierRegistry([]);
const templates = IDS.map((id) => makeAuguryTestDreamsignTemplate({ id, name: "Same synthetic name" }));
const card = makeAuguryTestCard({ id: testCardId("enhanced-reward-card"), cardNumber: 31 });
const baseContent = makeAuguryTestContent({ cards: [card], dreamsignTemplates: templates });
const content = { ...baseContent, sitesData: { ...baseContent.sitesData, rewards: {
  ...baseContent.sitesData.rewards, reward: { ...baseContent.sitesData.rewards.reward, enhancedOfferCount: 3 },
} } };
const provider = () => createSiteContentProvider(content);
const context: EventContext = { seq: 1, rng: () => 0.25, timestamp: TIME, contentConfig: TEST_CONTENT_CONFIG };
const event = (type: GameEvent["type"], payload: Record<string, unknown> = {}): GameEvent =>
  ({ type, payload: { siteId: SITE, ...payload }, actor: ACTOR, clientTimestamp: TIME });
const apply = (state: FoldState, type: GameEvent["type"], payload: Record<string, unknown> = {}, ctx = context) =>
  reduceGameEvent(state, event(type, payload), ctx, REGISTRY);
function fixture(isEnhanced = true, overrides: Partial<JourneyState> = {}): FoldState {
  const site = makeAuguryTestSite({ id: SITE, type: "Reward", isEnhanced });
  const journey = makeAuguryTestJourneyState({ remainingDreamsignPool: [...IDS],
    deck: [makeAuguryTestDeckEntry({ entryId: parseDeckEntryId("enhanced-reward-entry"), cardNumber: 31 })],
    currentDreamscape: NODE, screen: { type: "dreamscape" },
    atlas: { ...makeAuguryTestJourneyState().atlas, nodes: { [NODE]: { id: NODE,
      layer: LayerName.One, indexInLayer: 0, dreamscapeId: testDreamscapeId("enhanced-reward-dreamscape"),
      sites: [site], position: { x: 0, y: 0 }, state: "available", enhancedSiteType: null,
      forwardIds: [], backwardIds: [], knownDreamsignId: null } }, currentNodeId: NODE, startingNodeId: NODE },
    ...overrides });
  return { ...initialFoldState(journey.seed, content.economyData.journey), journey };
}
const opening = (state = fixture()) => apply(state, "OPEN_SITE", { selectionRulesVersion: SELECTION_RULES_VERSION });
const pending = (state = fixture()) => {
  const result = opening(state); expect(result.outcome).toBe("applied"); return result.state;
};
function quoted(state: FoldState) {
  const runtime = state.journey.siteRuntime[SITE];
  if (!isEnhancedDreamsignReward(runtime)) throw new Error("expected enhanced Reward quote");
  return runtime;
}
const visited = (state: FoldState) => state.journey.atlas.nodes[NODE].sites[0].isVisited;
const resources = (state: FoldState) => ({ pool: state.journey.remainingDreamsignPool,
  deck: state.journey.deck, essence: state.journey.essence, dreamsigns: state.journey.dreamsigns });
const config = (state: FoldState) => ({ ...GAME_ENGINE_CONFIG, genesisState: () => state,
  reducer: (before: FoldState, e: GameEvent, ctx: EventContext) => reduceGameEvent(before, e, ctx, REGISTRY) });
const genesis = (state: FoldState): Genesis => ({ seed: state.journey.seed, reducerVersion: "test", createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG });

/** Coherent public provider, fold, persistence and UUID-choice contracts. */
export function registerEnhancedRewardContracts() {
  describe("enhanced free Dreamsign Reward choices", () => {
    beforeEach(() => { registerSiteContentProvider(provider()); registerDeckContentProvider(createDeckContentProvider(content)); });
    afterEach(() => { registerSiteContentProvider(null); registerDeckContentProvider(null); registerJourneyLifecycleContentProvider(null); });

    it("quotes distinct alternatives including the exact standard draw without mutating inputs", () => {
      const source = fixture(), saved = structuredClone(source);
      const standard = pending(fixture(false)).journey.siteRuntime[SITE] as RewardSiteRuntime;
      const result = opening(source), runtime = quoted(result.state), quote = runtime.enhancedDreamsignOffer;
      expect(source).toEqual(saved);
      expect(standard.reward.rewardType).toBe("dreamsign");
      if (standard.reward.rewardType !== "dreamsign") throw new Error("expected standard Dreamsign");
      expect(quote.standardDreamsignId).toBe(standard.reward.dreamsign.id);
      expect(quote.offeredDreamsigns).toHaveLength(3);
      const offered = quote.offeredDreamsigns.map((sign) => sign.id);
      expect(new Set(offered).size).toBe(3);
      expect(offered).toContain(quote.standardDreamsignId);
      expect(result.state.journey.remainingDreamsignPool).toEqual(IDS.filter((id) => !offered.includes(id)));
      expect(runtime.remainingDreamsignPoolIds).toEqual(result.state.journey.remainingDreamsignPool);
      expect(result.state.journey.deck).toEqual(source.journey.deck);
      expect(result.state.journey.dreamsigns).toEqual([]);
      expect(opening(source).state).toEqual(result.state);
      expect(result.logRecords?.[0]).toMatchObject({ event: "enhanced_reward_prepared", fields: {
        siteId: SITE, offeredDreamsignIds: offered, standardDreamsignId: quote.standardDreamsignId,
        offeredCount: 3, requestedCount: 3, selectionRulesVersion: SELECTION_RULES_VERSION,
      } });
      expect(apply(result.state, "OPEN_SITE", { selectionRulesVersion: SELECTION_RULES_VERSION }).state).toBe(result.state);
    });

    it.each([1, 2])("retains an explicit choice with only %s available UUIDs", (count) => {
      const state = pending(fixture(true, { remainingDreamsignPool: IDS.slice(0, count) }));
      expect(quoted(state).enhancedDreamsignOffer.offeredDreamsigns).toHaveLength(count);
      expect(apply(state, "ACCEPT_REWARD").state).toBe(state);
      expect(apply(state, "COMPLETE_SITE").state).toBe(state);
    });

    it("recreates alternatives without duplicating or reinserting the standard UUID", () => {
      const state = pending(fixture(true, { remainingDreamsignPool: [IDS[0], IDS[0]],
        resolvedPackage: makeAuguryTestResolvedPackage({ dreamsignPoolIds: [IDS[0], IDS[1], IDS[2], IDS[2]] }) }));
      const quote = quoted(state).enhancedDreamsignOffer;
      expect(quote.offeredDreamsigns.map((sign) => sign.id).sort()).toEqual(IDS.slice(0, 3).sort());
      expect(state.journey.remainingDreamsignPool).toEqual([]);
    });

    it("preserves ordinary Reward and empty-pool Essence fallback, with no choice quote", () => {
      for (const enhanced of [false, true]) {
        const state = pending(fixture(enhanced, { remainingDreamsignPool: [] }));
        const runtime = state.journey.siteRuntime[SITE];
        expect(runtime?.kind).toBe("reward");
        if (runtime?.kind !== "reward") throw new Error("expected Reward");
        expect(runtime.reward.rewardType).toBe("essence");
        expect(runtime.enhancedDreamsignOffer).toBeUndefined();
        const next = apply(state, "ACCEPT_REWARD");
        expect(next.outcome).toBe("applied");
        expect(visited(next.state)).toBe(true);
        expect(next.state.journey.remainingDreamsignPool).toEqual([]);
      }
      const ordinary = pending(fixture(false)), runtime = ordinary.journey.siteRuntime[SITE];
      expect(runtime?.kind === "reward" && runtime.enhancedDreamsignOffer).toBeUndefined();
      expect(apply(ordinary, "ACCEPT_REWARD").outcome).toBe("applied");
    });

    it("accepts a nonfirst stored UUID through the existing action and logs only applied completion", async () => {
      const state = pending(), runtime = quoted(state), incoming = runtime.enhancedDreamsignOffer.offeredDreamsigns[1];
      const drafts: { type: GameEvent["type"]; payload?: unknown }[] = [];
      const actions = makeActions((draft) => { drafts.push(draft); return Promise.resolve(drafts.length); });
      await actions.acceptDreamsignOffer(SITE, incoming.id);
      expect(drafts[0]).toEqual({ type: "ACCEPT_DREAMSIGN_OFFER", payload: { siteId: SITE, dreamsignId: incoming.id } });
      const result = apply(state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id });
      expect(result.outcome).toBe("applied"); expect(visited(result.state)).toBe(true);
      expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([incoming.id]);
      expect(resources(result.state)).toEqual({ ...resources(state), dreamsigns: [incoming] });
      expect(result.logRecords).toEqual([{ event: "enhanced_reward_accepted", fields: {
        siteId: SITE, dreamsignId: incoming.id, selectionRulesVersion: SELECTION_RULES_VERSION } }]);
      expect(apply(result.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id })).toMatchObject({ outcome: "bounced" });
      expect(apply(result.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id }).logRecords).toBeUndefined();
    });

    it("replaces a live cap slot and declines at either capacity without another pool spend", () => {
      const held = templates.map((template) => ({ id: template.id, name: template.name, effectDescription: "" }));
      const state = pending(fixture(true, { dreamsigns: [held[3]], maxDreamsigns: 1 }));
      const incoming = quoted(state).enhancedDreamsignOffer.offeredDreamsigns[1];
      expect(apply(state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id }).state).toBe(state);
      for (const purgeIndex of [-1, 1, 0.5, "0", null]) {
        expect(apply(state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id, purgeIndex }).state).toBe(state);
      }
      const replacement = apply(state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id, purgeIndex: 0 });
      expect(replacement.state.journey.dreamsigns).toEqual([incoming]);
      expect(replacement.logRecords?.[0].fields.replacedDreamsignId).toBe(held[3].id);
      expect(resources(replacement.state)).toEqual({ ...resources(state), dreamsigns: [incoming] });
      for (const source of [state, pending()]) {
        const declined = apply(source, "REJECT_DREAMSIGN_OFFER");
        expect(declined.outcome).toBe("applied"); expect(visited(declined.state)).toBe(true);
        expect(resources(declined.state)).toEqual(resources(source));
        expect(apply(declined.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming.id }).state).toBe(declined.state);
      }
    });

    it("keeps an opened quote fixed through administrative balance, duplicate gain and loss", () => {
      let state = pending();
      const quote = quoted(state).enhancedDreamsignOffer;
      const pool = state.journey.remainingDreamsignPool;
      for (const [type, payload] of [
        ["SET_ESSENCE", { value: 19 }], ["ADD_DREAMSIGN", { dreamsignId: IDS[3] }],
        ["ADD_DREAMSIGN", { dreamsignId: IDS[3] }], ["REMOVE_DREAMSIGN", { dreamsignId: IDS[3] }],
        ["SET_MAX_DREAMSIGNS", { value: 1 }],
      ] as [GameEvent["type"], Record<string, unknown>][]) {
        const result = apply(state, type, payload); expect(result.outcome).toBe("applied"); state = result.state;
        expect(quoted(state).enhancedDreamsignOffer).toEqual(quote);
        expect(state.journey.remainingDreamsignPool).toEqual(pool);
      }
      expect(state.journey.essence).toBe(19);
      state.journey.atlas.nodes[NODE].sites[0].isEnhanced = false;
      const selected = quote.offeredDreamsigns[1];
      expect(apply(state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: selected.id, purgeIndex: 0 }).outcome).toBe("applied");
    });

    it("bounces missing providers, null generation and invalid protocol without partial state", () => {
      const state = fixture(), saved = structuredClone(state);
      registerSiteContentProvider(null); expect(opening(state).state).toBe(state);
      registerSiteContentProvider({ ...provider(), openSite: () => null }); expect(opening(state).state).toBe(state);
      registerSiteContentProvider(provider());
      for (const selectionRulesVersion of [undefined, "", 7, "stale-generation"]) {
        expect(apply(state, "OPEN_SITE", { selectionRulesVersion }).state).toBe(state);
      }
      expect(state).toEqual(saved);
      for (const count of [0, -1, 1.5, Number.NaN]) {
        const invalidProvider = createSiteContentProvider({ ...content, sitesData: { ...content.sitesData,
          rewards: { ...content.sitesData.rewards, reward: { ...content.sitesData.rewards.reward, enhancedOfferCount: count } } } });
        registerSiteContentProvider(invalidProvider);
        expect(opening(state).state).toBe(state);
      }
    });

    it("contains thrown generation at the public event-log boundary without adopting partial state", () => {
      const state = fixture(); registerSiteContentProvider({ ...provider(), openSite: () => { throw new Error("synthetic generation failure"); } });
      const result = foldEvents(config(state), genesis(state), { seq: 0, state }, [
        { seq: 1, event: event("OPEN_SITE", { selectionRulesVersion: SELECTION_RULES_VERSION }) },
      ], { devMode: false });
      expect(result.state).toBe(state); expect(result.outcomes[0].bounceReason).toBe("fold_error");
    });

    it("rejects unoffered, malformed, missing, foreign, visited and accepted choices independently", () => {
      const pendingState = pending(), incoming = quoted(pendingState).enhancedDreamsignOffer.offeredDreamsigns[1].id;
      for (const dreamsignId of [undefined, 7, "", parseDreamsignId("5e5e5e5e-0598-4000-8000-999999999999")]) {
        expect(apply(pendingState, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId }).state).toBe(pendingState);
      }
      const variants: ((state: FoldState) => void)[] = [
        (state) => { delete state.journey.siteRuntime[SITE]; },
        (state) => { state.journey.currentDreamscape = parseAtlasNodeId("foreign-node"); },
        (state) => { state.journey.screen = { type: "atlas" }; },
        (state) => { state.journey.screen = { type: "site", siteId: parseSiteId("foreign-site") }; },
        (state) => { state.journey.atlas.nodes[NODE].sites[0].type = "Essence"; },
        (state) => { state.journey.atlas.nodes[NODE].sites[0].isVisited = true; },
        (state) => { quoted(state).accepted = true; },
        (state) => { quoted(state).journeyEssenceSource = IDS[0]; },
      ];
      for (const change of variants) {
        const state = structuredClone(pendingState); change(state); const saved = structuredClone(state);
        for (const type of ["ACCEPT_DREAMSIGN_OFFER", "REJECT_DREAMSIGN_OFFER"] as const) {
          expect(apply(state, type, { dreamsignId: incoming }).state).toBe(state);
        }
        expect(state).toEqual(saved);
      }
    });

    it("validates new optional saved quotes strictly while accepting legacy and stored catalog versions", () => {
      const state = pending(), snapshot = structuredClone(state.journey);
      const savedRuntime = snapshot.siteRuntime[SITE] as RewardSiteRuntime;
      expect(savedRuntime.enhancedDreamsignOffer).toBeDefined();
      Object.assign(savedRuntime.enhancedDreamsignOffer!, { requestedCount: 9, selectionRulesVersion: "retained-quote-version" });
      snapshot.atlas.nodes[NODE].sites[0].isEnhanced = false;
      const loaded = apply(state, "LOAD_STATE", { snapshot });
      expect(loaded.outcome).toBe("applied");
      expect(quoted(loaded.state).enhancedDreamsignOffer).toEqual(savedRuntime.enhancedDreamsignOffer);
      const incoming = quoted(loaded.state).enhancedDreamsignOffer.offeredDreamsigns[1].id;
      expect(apply(loaded.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming }).outcome).toBe("applied");
      const invalid: ((runtime: RewardSiteRuntime) => void)[] = [
        (runtime) => { Reflect.set(runtime, "enhancedDreamsignOffer", null); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { requestedCount: 0 }); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { requestedCount: 1 }); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { selectionRulesVersion: 1 }); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { selectionRulesVersion: "" }); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { standardDreamsignId: IDS[3] }); },
        (runtime) => { Object.assign(runtime.enhancedDreamsignOffer!, { offeredDreamsigns: [] }); },
        (runtime) => { const quote = runtime.enhancedDreamsignOffer!; Object.assign(quote, { offeredDreamsigns: [quote.offeredDreamsigns[0], quote.offeredDreamsigns[0]] }); },
        (runtime) => { Reflect.set(runtime.enhancedDreamsignOffer!.offeredDreamsigns[0], "id", "invalid"); },
        (runtime) => { Reflect.set(runtime.enhancedDreamsignOffer!.offeredDreamsigns[0], "name", 1); },
        (runtime) => { Reflect.set(runtime.enhancedDreamsignOffer!.offeredDreamsigns[0], "imageName", {}); },
        (runtime) => { Reflect.set(runtime.enhancedDreamsignOffer!.offeredDreamsigns[0], "imageAlt", 9); },
        (runtime) => { const quote = runtime.enhancedDreamsignOffer!; Object.assign(quote, { offeredDreamsigns: [[], ...quote.offeredDreamsigns.slice(1)] }); },
        (runtime) => { if (runtime.reward.rewardType === "dreamsign") Reflect.set(runtime.reward.dreamsign, "imageName", {}); },
        (runtime) => { runtime.remainingDreamsignPoolIds = [runtime.enhancedDreamsignOffer!.standardDreamsignId]; },
        (runtime) => { runtime.journeyEssenceSource = IDS[0]; },
      ];
      for (const corrupt of invalid) {
        const broken = structuredClone(state.journey); corrupt(broken.siteRuntime[SITE] as RewardSiteRuntime);
        expect(apply(state, "LOAD_STATE", { snapshot: broken }).state).toBe(state);
        const forged = { ...state, journey: broken };
        expect(apply(forged, "ACCEPT_REWARD").state).toBe(forged);
      }
      const ordinary = pending(fixture(false));
      expect(apply(ordinary, "LOAD_STATE", { snapshot: structuredClone(ordinary.journey) }).outcome).toBe("applied");
    });

    it("rejects incoherent standard duplicates at load, online decisions and provider adoption", () => {
      const source = fixture(), opened = pending(source), prepared = quoted(opened);
      if (prepared.reward.rewardType !== "dreamsign") throw new Error("expected standard Dreamsign");
      for (const sign of [prepared.reward.dreamsign, ...prepared.enhancedDreamsignOffer.offeredDreamsigns]) {
        Object.assign(sign, { imageName: "synthetic-art", imageAlt: "synthetic-alt" });
      }
      const corruptions: ((standard: Dreamsign, offered: Dreamsign) => void)[] = [
        (_standard, offered) => { offered.name += " altered"; },
        (_standard, offered) => { offered.effectDescription += " altered"; },
        (_standard, offered) => { offered.imageName += " altered"; },
        (_standard, offered) => { offered.imageAlt += " altered"; },
        (_standard, offered) => { delete offered.imageName; },
        (_standard, offered) => { delete offered.imageAlt; },
        (standard) => { delete standard.imageName; },
        (standard) => { delete standard.imageAlt; },
      ];
      for (const corrupt of corruptions) {
        // JSON persistence gives the two stored representations independent objects.
        const malformed = JSON.parse(JSON.stringify(opened)) as FoldState, runtime = quoted(malformed);
        if (runtime.reward.rewardType !== "dreamsign") throw new Error("expected standard Dreamsign");
        const standard = runtime.reward.dreamsign;
        const offered = runtime.enhancedDreamsignOffer.offeredDreamsigns.find((sign) => sign.id === standard.id)!;
        expect(offered).not.toBe(standard); corrupt(standard, offered);
        const saved = JSON.stringify(malformed);
        const load = apply(source, "LOAD_STATE", { snapshot: malformed.journey });
        expect(load.outcome).toBe("bounced"); expect(load.state).toBe(source);
        for (const type of ["ACCEPT_DREAMSIGN_OFFER", "ACCEPT_REWARD", "REJECT_DREAMSIGN_OFFER"] as const) {
          const decision = apply(malformed, type, { dreamsignId: standard.id });
          expect(decision.outcome).toBe("bounced"); expect(decision.state).toBe(malformed);
        }
        const replay = foldEvents(config(malformed), genesis(malformed), { seq: 0, state: malformed }, [
          { seq: 1, event: event("ACCEPT_DREAMSIGN_OFFER", { dreamsignId: standard.id }) },
        ]);
        expect(replay.outcomes[0].outcome).toBe("bounced"); expect(replay.state).toBe(malformed);
        registerSiteContentProvider({ ...provider(), openSite: () => ({ runtime,
          remainingDreamsignPool: [...runtime.remainingDreamsignPoolIds] }) });
        const adoption = opening(source);
        expect(adoption.outcome).toBe("bounced"); expect(adoption.state).toBe(source);
        expect(JSON.stringify(malformed)).toBe(saved);
      }
    });

    it("loads coherent independent standard duplicates at any index and selects by UUID", () => {
      for (const hasArt of [false, true]) {
        const source = fixture(), opened = pending(source), runtime = quoted(opened);
        if (runtime.reward.rewardType !== "dreamsign") throw new Error("expected standard Dreamsign");
        if (hasArt) {
          for (const sign of [runtime.reward.dreamsign, ...runtime.enhancedDreamsignOffer.offeredDreamsigns]) {
            Object.assign(sign, { imageName: "synthetic-art", imageAlt: "synthetic-alt" });
          }
        }
        const snapshot = JSON.parse(JSON.stringify(opened.journey)) as JourneyState;
        const stored = snapshot.siteRuntime[SITE] as RewardSiteRuntime;
        if (stored.reward.rewardType !== "dreamsign") throw new Error("expected standard Dreamsign");
        const quote = stored.enhancedDreamsignOffer!, standard = stored.reward.dreamsign;
        const offered = quote.offeredDreamsigns.find((sign) => sign.id === standard.id)!;
        expect(offered).not.toBe(standard);
        const reordered = [...quote.offeredDreamsigns.filter((sign) => sign.id !== standard.id), offered];
        stored.enhancedDreamsignOffer = { ...quote, offeredDreamsigns: reordered };
        const loaded = apply(source, "LOAD_STATE", { snapshot });
        expect(loaded.outcome).toBe("applied");
        for (const selected of [standard, reordered[0]]) {
          const accepted = apply(loaded.state, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: selected.id });
          expect(accepted.outcome).toBe("applied"); expect(accepted.state.journey.dreamsigns).toEqual([selected]);
          expect(visited(accepted.state)).toBe(true);
        }
      }
    });

    it("reloads strict historical quotes after public regeneration without granting orphaned pending offers", () => {
      const opened = pending(), incoming = quoted(opened).enhancedDreamsignOffer.offeredDreamsigns[1].id;
      const settled = apply(opened, "ACCEPT_DREAMSIGN_OFFER", { dreamsignId: incoming }).state;
      for (const source of [opened, settled]) {
        for (const absent of [false, true]) {
          registerJourneyLifecycleContentProvider(testJourneyLifecycleContentProvider({
            regenerateAtlas: ({ journey }) => ({ ...journey, atlas: { ...journey.atlas, nodes: {
              [NODE]: { ...journey.atlas.nodes[NODE], sites: absent ? [] : journey.atlas.nodes[NODE].sites
                .map((site) => ({ ...site, type: "Essence" as const })) },
            } } }),
          }));
          const regenerated = apply(source, "REGENERATE_ATLAS", { completionLevel: 0 });
          expect(regenerated.outcome).toBe("applied");
          expect(regenerated.state.journey.siteRuntime).toEqual(source.journey.siteRuntime);
          const loaded = apply(regenerated.state, "LOAD_STATE", { snapshot: structuredClone(regenerated.state.journey) });
          expect(loaded.outcome).toBe("applied");
          expect(quoted(loaded.state).enhancedDreamsignOffer).toEqual(quoted(source).enhancedDreamsignOffer);
          for (const type of ["ACCEPT_DREAMSIGN_OFFER", "REJECT_DREAMSIGN_OFFER"] as const) {
            expect(apply(loaded.state, type, { dreamsignId: incoming }).state).toBe(loaded.state);
          }
          expect(resources(loaded.state)).toEqual(resources(source));
        }
      }
      const invalid = structuredClone(opened.journey);
      Reflect.set(invalid.siteRuntime, "", invalid.siteRuntime[SITE]); delete invalid.siteRuntime[SITE];
      Reflect.set(invalid.atlas.nodes[NODE].sites[0], "id", "");
      expect(apply(opened, "LOAD_STATE", { snapshot: invalid }).state).toBe(opened);
      expect(apply(opened, "LOAD_STATE", { snapshot: structuredClone(opened.journey) }).outcome).toBe("applied");
    });

    it("bounces malformed provider quotes and pool/provenance mismatches before adoption", () => {
      const source = fixture();
      const generated = provider().openSite({ journey: source.journey, site: source.journey.atlas.nodes[NODE].sites[0], rng: context.rng,
        selectionRulesVersion: SELECTION_RULES_VERSION });
      if (generated === null || !isEnhancedDreamsignReward(generated.runtime)) throw new Error("expected generated quote");
      const corruptions: (() => typeof generated)[] = [
        () => ({ ...generated, runtime: { kind: "essence", amount: 7, accepted: false } }),
        () => ({ ...generated, remainingDreamsignPool: undefined }),
        () => ({ ...generated, remainingDreamsignPool: [IDS[1]] }),
        () => ({ ...generated, runtime: { ...generated.runtime, enhancedDreamsignOffer: undefined } }),
        () => ({ ...generated, runtime: { ...generated.runtime, accepted: true } }),
      ];
      for (const corrupt of corruptions) {
        registerSiteContentProvider({ ...provider(), openSite: corrupt });
        expect(opening(source).state).toBe(source);
      }
    });

    it("resumes and replays quote reveal, nonfirst acceptance and single durable completion", async () => {
      const state = fixture(), cfg = config(state), start = genesis(state);
      const log = createLocalLog({ config: cfg, genesis: start, localActor: ACTOR, now: () => TIME });
      const actions = makeActions((draft) => Promise.resolve(log.append(draft)));
      await actions.openSite(SITE, undefined, "Reward");
      const quote = quoted(log.state()).enhancedDreamsignOffer;
      const checkpoint = JSON.parse(JSON.stringify(log.checkpoint())) as LocalLogBase<FoldState>;
      const resumed = createLocalLog({ config: cfg, genesis: start, localActor: ACTOR, base: checkpoint,
        history: log.events(), now: () => TIME });
      expect(quoted(resumed.state()).enhancedDreamsignOffer).toEqual(quote);
      const draft: EventDraft = { type: "ACCEPT_DREAMSIGN_OFFER", payload: { siteId: SITE, dreamsignId: quote.offeredDreamsigns[1].id },
        intentKey: parseIntentKey("enhanced-reward-once") };
      expect(resumed.append(draft)).toBe(2); expect(resumed.append(draft)).toBe(2);
      expect(resumed.events()).toHaveLength(2); expect(visited(resumed.state())).toBe(true);
      const replay = foldEvents(cfg, start, { seq: 0, state }, JSON.parse(JSON.stringify(resumed.events())) as CommittedEvent[]);
      expect(replay.state).toEqual(resumed.state());
      expect(replay.outcomes.map((outcome) => outcome.outcome)).toEqual(["applied", "applied"]);
      expect(resumed.state().journey.dreamsigns[0].id).toBe(quote.offeredDreamsigns[1].id);
    });

    it("applies one choice and bounces a duplicate choice of the same offer", () => {
      const state = pending(), selected = quoted(state).enhancedDreamsignOffer.offeredDreamsigns[1].id;
      const choose = event("ACCEPT_DREAMSIGN_OFFER", { dreamsignId: selected });
      const result = foldEvents(config(state), genesis(state), { seq: 0, state }, [
        { seq: 1, event: choose }, { seq: 2, event: choose },
      ]);
      expect(result.outcomes.map((outcome) => outcome.outcome)).toEqual(["applied", "bounced"]);
      expect(result.outcomes[1].bounceReason).toBe("invalid_action");
      expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([selected]);
    });
  });
}
