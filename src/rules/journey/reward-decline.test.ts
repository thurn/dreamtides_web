import { describe, expect, it } from "vitest";
import { createLocalLog, type CommittedEvent, type EventDraft, type LocalLogBase, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig, GameEvent, Genesis } from "../../eventlog/types";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { parseAtlasNodeId, parseIntentKey, parseSiteId } from "../../types/identifiers";
import { testEventActor, testJourneyId } from "../../types/test-identities";
import type { RewardSiteRuntime } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { dreamsign, makeSite, NODE_ID, SITE_ID, siteState, stateWithSites } from "./sites-fixtures";

const HELD = dreamsign("ordinary-held");
const INCOMING = dreamsign("ordinary-incoming");
const POOL = dreamsign("ordinary-pool").id;
const ACTOR = testEventActor("ordinary-reward-owner");
const PARTNER = testEventActor("ordinary-reward-partner");
const TIMESTAMP = "1970-01-01T00:00:00.000Z";
const registry = createJourneyModifierRegistry([]);
const context = { seq: 1, contentConfig: TEST_CONTENT_CONFIG, rng: () => 0, intervening: [], timestamp: TIMESTAMP };
const runtime = (): RewardSiteRuntime => ({ kind: "reward", accepted: false,
  reward: { rewardType: "dreamsign", dreamsign: INCOMING }, remainingDreamsignPoolIds: [POOL] });
const pending = (): FoldState => {
  const state = siteState("Reward", { screen: { type: "dreamscape" },
    runId: testJourneyId("ordinary-reward-run"), completionLevel: 0, essence: 105, maxDreamsigns: 1, dreamsigns: [HELD], remainingDreamsignPool: [POOL], siteRuntime: { [SITE_ID]: runtime() } });
  state.journey.atlas.nodes[NODE_ID].layer = LayerName.One;
  return state;
};
const event = (type: GameEvent["type"] = "COMPLETE_SITE", payload: Record<string, unknown> = { siteId: SITE_ID }): GameEvent =>
  ({ type, payload, actor: ACTOR, basedOnSeq: 0, clientTimestamp: TIMESTAMP });
const apply = (state: FoldState, e = event()) => reduceGameEvent(state, e, context, registry);
const config = (state: FoldState): EngineConfig<FoldState> => ({ ...GAME_ENGINE_CONFIG,
  genesisState: () => state, reducer: (before, e, ctx) => reduceGameEvent(before, e, ctx, registry) });
const genesis = (state: FoldState): Genesis => ({ seed: state.journey.seed, reducerVersion: "test", createdAt: 0, contentConfig: TEST_CONTENT_CONFIG });
const holdings = (state: FoldState) => ({ dreamsigns: state.journey.dreamsigns, pool: state.journey.remainingDreamsignPool,
  essence: state.journey.essence, runtime: state.journey.siteRuntime, deck: state.journey.deck });
const visited = (state: FoldState) => state.journey.atlas.nodes[NODE_ID].sites[0].isVisited;

describe("ordinary inline Dreamsign Reward decline", () => {
  it("completes an at-cap ordinary inline Reward without granting or spending anything", () => {
    const before = pending();
    const result = apply(before);
    expect(result.outcome).toBe("applied");
    expect(visited(result.state)).toBe(true);
    expect(result.state.journey.screen).toEqual({ type: "dreamscape" });
    expect(holdings(result.state)).toEqual(holdings(before));
    expect(result.state.journey.siteRuntime[SITE_ID]).toBe(before.journey.siteRuntime[SITE_ID]);
    expect(visited(before)).toBe(false);
  });

  it("preserves same-name distinct held UUIDs and marks only the target at a larger live cap", () => {
    const other = dreamsign("ordinary-held-other");
    const otherSite = parseSiteId("unaffected-site");
    const before = stateWithSites([makeSite("Reward"), { ...makeSite("Essence"), id: otherSite }], {
      ...pending().journey, maxDreamsigns: 2, dreamsigns: [HELD, other],
      atlas: stateWithSites([makeSite("Reward"), { ...makeSite("Essence"), id: otherSite }]).journey.atlas,
    });
    before.journey.atlas.nodes[NODE_ID].layer = LayerName.One;
    const result = apply(before);
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.atlas.nodes[NODE_ID].sites.map(site => site.isVisited)).toEqual([true, false]);
    expect(result.state.journey.dreamsigns.map(sign => sign.id)).toEqual([HELD.id, other.id]);
    expect(holdings(result.state)).toEqual(holdings(before));
  });

  it("denies missing, foreign, visited, accepted, wrong-kind and below-cap inline completions independently", () => {
    const variants: [string, (state: FoldState) => void][] = [
      ["foreign-node", state => { state.journey.currentDreamscape = parseAtlasNodeId("foreign-node"); }],
      ["no-current-node", state => { state.journey.currentDreamscape = null; }],
      ["visited", state => { state.journey.atlas.nodes[NODE_ID].sites[0].isVisited = true; }],
      ["accepted", state => { state.journey.siteRuntime[SITE_ID] = { ...runtime(), accepted: true }; }],
      ["missing-acceptance", state => { Reflect.deleteProperty(state.journey.siteRuntime[SITE_ID] ?? {}, "accepted"); }],
      ["malformed-acceptance", state => { Reflect.set(state.journey.siteRuntime[SITE_ID] ?? {}, "accepted", 0); }],
      ["missing-runtime", state => { delete state.journey.siteRuntime[SITE_ID]; }],
      ["wrong-runtime", state => { state.journey.siteRuntime[SITE_ID] = { kind: "essence", amount: 17, accepted: false }; }],
      ["essence-reward", state => { state.journey.siteRuntime[SITE_ID] = { ...runtime(), reward: { rewardType: "essence", essenceAmount: 17 } }; }],
      ["wrong-site-kind", state => { state.journey.atlas.nodes[NODE_ID].sites[0].type = "Draft"; }],
      ["pearl-provenance", state => { state.journey.siteRuntime[SITE_ID] = { ...runtime(), journeyEssenceSource: HELD.id }; }],
      ["below-cap", state => { state.journey.maxDreamsigns = 2; }],
      ["atlas-screen", state => { state.journey.screen = { type: "atlas" }; }],
      ["foreign-site-screen", state => { state.journey.screen = { type: "site", siteId: parseSiteId("foreign-site") }; }],
    ];
    for (const [label, change] of variants) {
      const before = pending(); change(before);
      const saved = structuredClone(before);
      expect(apply(before).outcome, label).toBe("bounced");
      expect(apply(before).state, label).toBe(before);
      expect(before, label).toEqual(saved);
    }
    for (const siteId of [undefined, 7, "", parseSiteId("unknown-site")]) {
      const before = pending();
      expect(apply(before, event("COMPLETE_SITE", { siteId })).state).toBe(before);
    }
  });

  it("retains active-site and inline Pearl completion without admitting ordinary Essence", () => {
    expect(apply(siteState("Augury")).outcome).toBe("applied");
    const pearl = pending();
    pearl.journey.atlas.nodes[NODE_ID].sites[0].type = "Essence";
    pearl.journey.siteRuntime[SITE_ID] = { ...runtime(), journeyEssenceSource: HELD.id };
    expect(apply(pearl).outcome).toBe("applied");
    const essence = siteState("Essence", { screen: { type: "dreamscape" }, siteRuntime: { [SITE_ID]: { kind: "essence", amount: 17, accepted: false } } });
    expect(apply(essence).state).toBe(essence);
  });

  it("denies repeat completion and stale reward acceptance after decline", () => {
    const completed = apply(pending()).state;
    expect(visited(completed)).toBe(true);
    expect(apply(completed).state).toBe(completed);
    expect(apply(completed, event("ACCEPT_REWARD", { siteId: SITE_ID, purgeIndex: 0 })).state).toBe(completed);
  });

  it("replays and resumes a single durable completion with exact resources and UUIDs", () => {
    const before = pending(), cfg = config(before), start = genesis(before);
    const log = createLocalLog({ config: cfg, genesis: start, localActor: ACTOR, now: () => TIMESTAMP, devMode: true });
    const records: LocalLogRecord<FoldState>[] = [];
    log.subscribe(record => records.push(record));
    const draft: EventDraft = { type: "COMPLETE_SITE", payload: { siteId: SITE_ID }, intentKey: parseIntentKey("ordinary-reward-decline") };
    expect(log.append(draft)).toBe(1);
    expect(log.append(draft)).toBe(1);
    expect(log.events()).toHaveLength(1);
    expect(records.map(record => record.outcome)).toEqual(["applied"]);
    expect(visited(log.state())).toBe(true);
    expect(holdings(log.state())).toEqual(holdings(before));
    const replay = foldEvents(cfg, start, { seq: 0, state: before }, JSON.parse(JSON.stringify(log.events())) as CommittedEvent[]);
    expect(replay.state).toEqual(log.state());
    const resumed = createLocalLog({ config: cfg, genesis: start, localActor: ACTOR,
      base: JSON.parse(JSON.stringify(log.checkpoint())) as LocalLogBase<FoldState>, history: log.events(), now: () => TIMESTAMP });
    expect(resumed.append(draft)).toBe(1);
    expect(resumed.state()).toEqual(log.state());
    log.append({ type: "COMPLETE_SITE", payload: { siteId: SITE_ID } });
    expect(records.map(record => record.outcome)).toEqual(["applied", "bounced"]);
    expect(log.state()).toEqual(resumed.state());
  });

  it("imports pending and completed snapshots and rejects malformed runtime without partial adoption", () => {
    const before = pending();
    const loaded = apply(before, event("LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(before.journey)) }));
    expect(loaded.outcome).toBe("applied");
    expect(apply(loaded.state).outcome).toBe("applied");
    const completed = apply(before).state;
    const reloaded = apply(completed, event("LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(completed.journey)) }));
    expect(reloaded.outcome).toBe("applied");
    expect(reloaded.state.journey.runId).not.toBeNull();
    expect(reloaded.state.journey).toEqual({ ...completed.journey, runId: reloaded.state.journey.runId });
    expect(apply(reloaded.state).state).toBe(reloaded.state);
    const malformed = { ...before.journey, siteRuntime: null };
    const rejected = apply(before, event("LOAD_STATE", { snapshot: malformed }));
    expect(rejected.outcome).toBe("bounced");
    expect(rejected.state).toBe(before);
    expect(visited(before)).toBe(false);
  });

  it("allows only one stale concurrent completion and preserves the foreign CAS guard", () => {
    const before = pending(), cfg = config(before), start = genesis(before);
    const events = [{ seq: 1, event: event() }, { seq: 2, event: { ...event(), actor: PARTNER } }];
    const result = foldEvents(cfg, start, { seq: 0, state: before }, events);
    expect(result.outcomes.map(outcome => outcome.outcome)).toEqual(["applied", "bounced"]);
    expect(result.outcomes[1].bounceReason).toBe("partner_conflict");
    expect(visited(result.state)).toBe(true);
    expect(holdings(result.state)).toEqual(holdings(before));
    const conflict = reduceGameEvent(before, event(), { ...context,
      intervening: [{ seq: 1, actor: PARTNER, type: "COMPLETE_SITE" }] }, registry);
    expect(conflict.bounceReason).toBe("partner_conflict");
    expect(conflict.state).toBe(before);
  });
});
