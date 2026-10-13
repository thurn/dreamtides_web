import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";
import { parseShuffleCommitment } from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import type { FourSuitRepriseSiteRuntime } from "../../types/journey";
import type { GameEventType } from "../events";
import { parseAtlasNodeId, parseSiteId } from "../../types/identifiers";
import { createEngine } from "../../engine";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import type { EngineCardDefinition } from "../../engine/catalog";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { testDreamsignId, testEventActor, testJourneySeed } from "../../types/test-identities";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";
import type { JourneyPurgeEffect } from "../../types/journey";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import { reduceGameEvent } from "../reducer";
import type { FoldState } from "../fold-state";
import { genesisFoldState } from "../fold-state";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_MODE, clearReplayFixtureProviders, registerReplayFixtureProviders } from "../replay/fixture-providers";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { testSiteContentProvider } from "./test-content-providers";
import { stateWithSites, makeSite, makeEntry, SITE_ID } from "./sites-fixtures";
import { ctx, event, GENESIS } from "./lifecycle-fixtures";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyEssence } from "./journey-essence";
import { currentPurgeSource, journeyPurge } from "./journey-purge";

const FRUIT = testDreamsignId("synthetic-purge-essence"), SLUG = testDreamsignId("synthetic-after-battle"),
  SICKLE = testDreamsignId("synthetic-essence-exchange"), PEARL = testDreamsignId("synthetic-essence-replacement"),
  STAR = testDreamsignId("synthetic-essence-multiplier"), OTHER = testDreamsignId("same-name-control");
const registry = createJourneyModifierRegistry([
  journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 7 }),
  journeyEssence(STAR, { kind: "multiplyEssenceSiteGain", factor: 3 }),
  journeyEssence(PEARL, { kind: "replaceEssenceSiteReward", offerCount: 1 }),
  journeyPurge(SLUG, { kind: "afterBattlePurge", maxCount: 2 }),
  journeyPurge(SICKLE, { kind: "replaceEssenceWithPurge", count: 2 }),
]);
const sign = (id: DreamsignId) => ({ id, name: "same fixture name", effectDescription: "" });
const entries = () => [makeEntry({ entryId: parseDeckEntryId("one"), cardNumber: 1 }),
  makeEntry({ entryId: parseDeckEntryId("two"), cardNumber: 1 }), makeEntry({ entryId: parseDeckEntryId("bane"), isBane: true })];
function state(type: "Purge" | "Essence", ids: readonly DreamsignId[] = []) {
  return stateWithSites([makeSite(type)], { essence: 100, dreamsigns: ids.map(sign), deck: entries() });
}
const apply = (s: FoldState, type: GameEventType, payload: Record<string, unknown> = {}) => reduceGameEvent(s, event(type, payload), ctx(), registry);
function accepted(s: FoldState, type: GameEventType, payload: Record<string, unknown> = {}) {
  const result = apply(s, type, payload); expect(result.outcome).toBe("applied"); return result.state;
}
function purgePayload(s: FoldState, ids: readonly string[]) {
  if (s.journey.screen.type !== "journeyPurge") throw new Error("missing folded purge permission");
  const choice = s.journey.screen.choice, source = currentPurgeSource(choice);
  if (source === undefined) throw new Error("missing current source");
  return { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.kind === "afterBattle" ? choice.index : 0, entryIds: ids };
}
const open = { siteId: SITE_ID, selectionRulesVersion: SELECTION_RULES_VERSION };
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider({ openEssenceDreamsignReward: () => ({
    runtime: { kind: "reward", accepted: false, reward: { rewardType: "dreamsign", dreamsign: sign(OTHER) }, remainingDreamsignPoolIds: [] } }) }));
  registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
});
afterEach(clearReplayFixtureProviders);

describe("journeyPurge public folded contracts", () => {
  it("rejects malformed descriptor discriminants/counts", () => {
    for (const descriptor of [{ kind: "unknown", count: 2 }, { kind: "afterBattlePurge", maxCount: 0 },
      { kind: "replaceEssenceWithPurge", count: 1.5 }, { kind: "afterBattlePurge", maxCount: Infinity }]) {
      expect(() => journeyPurge(SLUG, descriptor as JourneyPurgeEffect)).toThrow(RangeError);
    }
  });
  it("awards each paid/Bane occurrence for each held copy after paying, with exact entry receipts", () => {
    const before = state("Purge", [FRUIT, OTHER, FRUIT]);
    const out = apply(before, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds: ["one", "bane"] });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(88);
    expect(out.state.journey.deck.map(({ entryId }) => entryId)).toEqual(["two"]);
    if (out.outcome !== "applied") throw new Error("expected validated paid purge");
    expect(out.purges).toEqual([{ entryId: "one" }, { entryId: "bane" }]);
    expect(out.logRecords?.map(({ fields }) => fields)).toMatchObject([
      { dreamsignId: FRUIT, heldIndex: 0, after: { gained: 14, purged: 2 } },
      { dreamsignId: FRUIT, heldIndex: 2, after: { gained: 14, purged: 2 } },
    ]);
    expect(before.journey.deck).toHaveLength(3);
    expect(apply(out.state, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds: ["two"] }).state).toBe(out.state);
    const poor = { ...before, journey: { ...before.journey, essence: 39 } };
    expect(apply(poor, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds: ["one"] }).state).toBe(poor);
  });
  it("explicit Nightmare purges count actual targets, while debug removal and rejected selections do not", () => {
    const before = state("Purge", [FRUIT]);
    expect(accepted(before, "PURGE_ALL_NIGHTMARE_CARDS").journey.essence).toBe(107);
    expect(accepted(before, "PURGE_RANDOM_NIGHTMARE_CARDS", { count: 99 }).journey.essence).toBe(107);
    expect(accepted(before, "REMOVE_DECK_ENTRY", { entryId: "one" }).journey.essence).toBe(100);
    for (const ids of [["one", "one"], ["missing"], [3], []]) {
      expect(apply(before, "PURGE_DECK_CARDS", { siteId: SITE_ID, entryIds: ids }).state).toBe(before);
    }
  });
  it.each(["clubs", "hearts", "diamonds"] as const)("counts only actual Four-Suit %s purge settlement, never stale/repeated settlement", (suit) => {
    const card = makeAuguryTestCard({ id: testCardId("four-suit-original"), cardNumber: 1 });
    const entryId = parseDeckEntryId("four-suit-entry"), commitment = parseShuffleCommitment("first-round");
    const runtime: FourSuitRepriseSiteRuntime = { kind: "gamble", gameId: "four-suit-reprise",
      selectionTrace: testGambleSelectionTrace("four-suit-reprise"), isFarpoint: false, drawCost: 25,
      shuffleCommitments: [commitment, parseShuffleCommitment("second"), parseShuffleCommitment("third")],
      committedCards: [{ rank: "7", suit }, { rank: "7", suit }, { rank: "7", suit }],
      targets: [{ entryId, cardId: card.id, cardNumber: 1, cardSnapshot: card, transfigurationOffers: [] }], rounds: [], phase: "choose" };
    const before = stateWithSites([makeSite("Gamble")], { essence: 200, dreamsigns: [sign(FRUIT)],
      deck: [makeEntry({ entryId, cardNumber: 1 })], siteRuntime: { [SITE_ID]: runtime } });
    const drawn = accepted(before, "DRAW_FOUR_SUIT_REPRISE", { siteId: SITE_ID, entryId });
    const payload = { siteId: SITE_ID, shuffleCommitment: commitment };
    expect(apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", { ...payload, shuffleCommitment: "wrong" }).state).toBe(drawn);
    const result = apply(drawn, "SETTLE_FOUR_SUIT_REPRISE", payload);
    expect(result.outcome).toBe("applied"); if (result.outcome !== "applied") throw new Error("expected settled round");
    expect(result.purges).toEqual(suit === "clubs" ? [{ entryId, cardId: card.id }] : []);
    expect((result.logRecords ?? []).filter(({ event }) => event === "journey_modifier_applied")).toHaveLength(suit === "clubs" ? 1 : 0);
    expect(apply(result.state, "SETTLE_FOUR_SUIT_REPRISE", payload).state).toBe(result.state);
  });
  it("prepares an optional exact-two exchange on open or direct acceptance without collecting", () => {
    const before = state("Essence", [SICKLE, FRUIT]);
    const opened = accepted(before, "OPEN_SITE", open);
    expect(opened.journey.screen.type).toBe("journeyPurge"); expect(opened.journey.essence).toBe(100);
    const direct = accepted(before, "ACCEPT_ESSENCE", { siteId: SITE_ID });
    expect(direct.journey.screen).toEqual(opened.journey.screen); expect(direct.journey.essence).toBe(100);
    for (const ids of [[], ["one"], ["one", "two", "bane"], ["one", "one"], ["one", "missing"]]) {
      expect(apply(opened, "RESOLVE_JOURNEY_PURGE", purgePayload(opened, ids)).state).toBe(opened);
    }
    const purged = accepted(opened, "RESOLVE_JOURNEY_PURGE", purgePayload(opened, ["one", "two"]));
    expect(purged.journey.essence).toBe(114); expect(purged.journey.deck.map(({ entryId }) => entryId)).toEqual(["bane"]);
    expect(purged.journey.siteRuntime[SITE_ID]).toMatchObject({ accepted: true }); expect(purged.journey.screen.type).toBe("dreamscape");
    expect(apply(purged, "RESOLVE_JOURNEY_PURGE", purgePayload(opened, ["one", "two"])).state).toBe(purged);
  });
  it("keeps earned sources/quotes through gain/loss, collects live multipliers and preserves Pearl precedence", () => {
    const opened = accepted(state("Essence", [SICKLE]), "OPEN_SITE", open);
    const lost = accepted(opened, "REMOVE_DREAMSIGN", { dreamsignId: SICKLE });
    const gained = accepted(lost, "ADD_DREAMSIGN", { dreamsignId: STAR });
    const amount = opened.journey.siteRuntime[SITE_ID]; if (amount?.kind !== "essence") throw new Error("missing quote");
    expect(accepted(gained, "ACCEPT_ESSENCE", { siteId: SITE_ID }).journey.essence).toBe(100 + amount.amount * 3);
    expect(accepted(lost, "RESOLVE_JOURNEY_PURGE", purgePayload(lost, ["one", "two"])).journey.deck).toHaveLength(1);
    const old = accepted(state("Essence"), "OPEN_SITE", open);
    const late = accepted(old, "ADD_DREAMSIGN", { dreamsignId: SICKLE });
    expect(accepted(late, "ACCEPT_ESSENCE", { siteId: SITE_ID }).journey.screen.type).toBe("dreamscape");
    for (const ids of [[SICKLE, PEARL], [PEARL, SICKLE], [SICKLE, SICKLE, PEARL]]) {
      const replaced = accepted(state("Essence", ids), "OPEN_SITE", open);
      expect(replaced.journey.screen.type).toBe("site"); expect(replaced.journey.siteRuntime[SITE_ID]).toMatchObject({ kind: "reward" });
    }
  });
  it("rejects wrong source/slot/ordinal/site, unrelated navigation and stale partner CAS", () => {
    const opened = accepted(state("Essence", [SICKLE]), "OPEN_SITE", open), payload = purgePayload(opened, ["one", "two"]);
    for (const patch of [{ dreamsignId: FRUIT }, { heldIndex: 1 }, { choiceIndex: 1 }, { siteId: "wrong" }]) {
      expect(apply(opened, "RESOLVE_JOURNEY_PURGE", { ...payload, ...patch }).state).toBe(opened);
    }
    expect(apply(opened, "COMPLETE_SITE", { siteId: SITE_ID }).state).toBe(opened);
    const conflict = reduceGameEvent(opened, event("RESOLVE_JOURNEY_PURGE", payload), ctx({ intervening: "unknown" }), registry);
    expect(conflict.outcome).toBe("bounced"); expect(conflict.state).toBe(opened);
    const partner = reduceGameEvent(opened, event("RESOLVE_JOURNEY_PURGE", payload), ctx({ intervening: [
      { seq: 1, actor: testEventActor("actual-partner"), type: "ADD_DREAMSIGN" },
    ] }), registry);
    expect(partner.outcome).toBe("bounced"); expect(partner.state).toBe(opened);
  });
  it("bounces CAS-exempt Sickle preparation on foreign nodes, wrong routes and a real pending battle", () => {
    const foreign = state("Essence", [SICKLE]); foreign.journey.currentDreamscape = null; foreign.journey.screen = { type: "atlas" };
    expect(apply(foreign, "OPEN_SITE", open).state).toBe(foreign);
    const elsewhere = state("Essence", [SICKLE]);
    elsewhere.journey.screen = { type: "dreamscape" };
    const current = elsewhere.journey.currentDreamscape; if (current === null) throw new Error("missing current node");
    const foreignNode = parseAtlasNodeId("foreign-node"), foreignSite = parseSiteId("foreign-essence");
    elsewhere.journey.atlas = { ...elsewhere.journey.atlas, nodes: { ...elsewhere.journey.atlas.nodes,
      [foreignNode]: { ...elsewhere.journey.atlas.nodes[current], id: foreignNode, sites: [{ ...makeSite("Essence"), id: foreignSite }] } } };
    for (const type of ["OPEN_SITE", "ACCEPT_ESSENCE"] as const) {
      const payload = { ...open, siteId: foreignSite };
      expect(apply(elsewhere, type, payload).state).toBe(elsewhere);
      const pearl = { ...elsewhere, journey: { ...elsewhere.journey, dreamsigns: [sign(SICKLE), sign(PEARL)] } };
      const replaced = apply(pearl, type, payload);
      expect(replaced.outcome).toBe("applied"); expect(replaced.state.journey.siteRuntime[foreignSite]).toMatchObject({ kind: "reward" });
      expect(replaced.state.journey.screen).toEqual(pearl.journey.screen);
    }
    const wrongRoute = state("Essence", [SICKLE]); wrongRoute.journey.screen = { type: "journeyStart" };
    expect(apply(wrongRoute, "OPEN_SITE", open).state).toBe(wrongRoute);
    registerReplayFixtureProviders(); registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
    let battle = accepted(genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
    battle = accepted(battle, "ADD_DREAMSIGN", { dreamsignId: SICKLE });
    battle = accepted(battle, "ENTER_SITE", { siteId: BATTLE_SITE_ID }); battle = accepted(battle, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    const nodeId = battle.journey.currentDreamscape; if (nodeId === null) throw new Error("missing node");
    battle = { ...battle, journey: { ...battle.journey, atlas: { ...battle.journey.atlas, nodes: { ...battle.journey.atlas.nodes,
      [nodeId]: { ...battle.journey.atlas.nodes[nodeId], sites: [...battle.journey.atlas.nodes[nodeId].sites, makeSite("Essence")] } } } } };
    expect(apply(battle, "OPEN_SITE", open).state).toBe(battle);
    const board = journeyBattleOf(battle.battle)?.engine.slice.committed; if (board === undefined) throw new Error("missing board");
    battle = accepted(battle, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: board.sides.player.hand[0], from: "hand" } });
    expect(pendingEnginePrompt(battle.battle, FIXTURE_ENGINE)).not.toBeNull();
    expect(apply(battle, "OPEN_SITE", open).state).toBe(battle);
  });
  it("keeps the first globally held Essence permission across distinct registered UUIDs", () => {
    const next = testDreamsignId("second-essence-permission");
    const both = createJourneyModifierRegistry([journeyPurge(SICKLE, { kind: "replaceEssenceWithPurge", count: 2 }),
      journeyPurge(next, { kind: "replaceEssenceWithPurge", count: 3 })]);
    const before = state("Essence", [next, SICKLE]);
    const out = reduceGameEvent(before, event("OPEN_SITE", open), ctx(), both);
    expect(out.state.journey.screen).toMatchObject({ type: "journeyPurge", choice: { dreamsignId: next, heldIndex: 0, count: 3 } });
    expect(out.logRecords).toHaveLength(1);
  });
  it("loads earned lost-source choices and rejects malformed saved purpose identities/counts/runtime", () => {
    const opened = accepted(state("Essence", [SICKLE]), "OPEN_SITE", open);
    const lost = accepted(opened, "REMOVE_DREAMSIGN", { dreamsignId: SICKLE });
    expect(apply(lost, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(lost.journey)) }).outcome).toBe("applied");
    const screen = opened.journey.screen; if (screen.type !== "journeyPurge") throw new Error("missing choice");
    for (const patch of [{ dreamsignId: FRUIT }, { dreamsignId: OTHER }, { count: 99 }, { count: NaN }, { heldIndex: -1 },
      { kind: "unknown" }, { siteId: "missing" }]) {
      const snapshot = { ...opened.journey, screen: { ...screen, choice: { ...screen.choice, ...patch } } };
      expect(apply(opened, "LOAD_STATE", { snapshot }).state).toBe(opened);
    }
    for (const patch of [{ amount: NaN }, { amount: -1 }, { accepted: undefined }]) {
      const runtime = opened.journey.siteRuntime[SITE_ID];
      expect(apply(opened, "LOAD_STATE", { snapshot: { ...opened.journey, siteRuntime: { [SITE_ID]: { ...runtime, ...patch } } } }).state).toBe(opened);
    }
  });
  it("contains an error after the validated Sickle purge and prior Fruit hook atomically, then recovers on retry", () => {
    let fail = true;
    const faultRegistry = createJourneyModifierRegistry([
      journeyPurge(SICKLE, { kind: "replaceEssenceWithPurge", count: 2 }),
      journeyEssence(FRUIT, { kind: "purgedCardEssence", amount: 7 }),
      { dreamsignId: OTHER, afterJourneyEvent: ({ eventType }) => {
        if (fail && eventType === "RESOLVE_JOURNEY_PURGE") throw new Error("synthetic post-purge hook failure");
        return null;
      } },
    ]);
    const initial = accepted(state("Essence", [SICKLE, FRUIT, OTHER]), "OPEN_SITE", open);
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (s, e, c) => reduceGameEvent(s, e, c, faultRegistry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("rollback-player"), now: () => ctx().timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe((record) => records.push(record));
    const payload = purgePayload(initial, ["one", "two"]);
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload });
    expect(log.state()).toBe(initial); expect(log.state().journey.deck).toHaveLength(3);
    expect(log.state().journey.siteRuntime[SITE_ID]).toMatchObject({ accepted: false });
    expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(records[0].logRecords).toBeUndefined();
    fail = false; log.append({ type: "RESOLVE_JOURNEY_PURGE", payload });
    expect(records[1].outcome).toBe("applied"); expect(log.state().journey.essence).toBe(114);
    expect(log.state().journey.deck).toHaveLength(1); expect(initial.journey.essence).toBe(100);
  });
  it("replays the real local event log with stable pending/settled permissions and no repeated gain", () => {
    const initial = state("Essence", [SICKLE, FRUIT]);
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (s, e, c) => reduceGameEvent(s, e, c, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("purge-player"), now: () => ctx().timestamp });
    log.append({ type: "OPEN_SITE", payload: open });
    log.append({ type: "RESOLVE_JOURNEY_PURGE", payload: purgePayload(log.state(), ["one", "two"]) });
    const replay = foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]);
    expect(replay.state).toEqual(log.state()); expect(replay.state.journey.essence).toBe(114);
  });
  it.each([false, true])("earns every held Slug copy on an actual engine victory, final=%s, excluding expiry purges", (final) => {
    registerReplayFixtureProviders(); registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
    let s = accepted(genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: SLUG }); s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: SLUG });
    s = accepted(s, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
    if (final) s = { ...s, journey: { ...s.journey, atlas: { ...s.journey.atlas, layers: [s.journey.atlas.layers[0]] } } };
    s = accepted(s, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    const battle = journeyBattleOf(s.battle); if (battle === null) throw new Error("missing engine battle");
    s = accepted(s, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: battle.engine.slice.committed.sides.player.hand[0], from: "hand" } });
    const prompt = pendingEnginePrompt(s.battle, FIXTURE_ENGINE); if (prompt === null) throw new Error("missing prompt");
    s = accepted(s, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE });
    const temporary = entries()[2]; s = { ...s, journey: { ...s.journey, dreamsigns: [...s.journey.dreamsigns, sign(FRUIT)],
      deck: [...entries()], battleModifiers: [{ kind: "temporary_nightmare_grant", count: 1, battlesRemaining: 1, addedEntryIds: [temporary.entryId], source: "gamble" }] } };
    const balance = s.journey.essence, ended = accepted(s, "END_BATTLE");
    expect(ended.journey.essence - balance).toBe(battle.init.essenceReward);
    expect(ended.journey.screen).toMatchObject({ type: "journeyPurge", choice: { returnTo: final ? "journeyComplete" : "atlas", sources: [{ dreamsignId: SLUG, heldIndex: 0 }, { dreamsignId: SLUG, heldIndex: 1 }] } });
    const first = accepted(ended, "RESOLVE_JOURNEY_PURGE", purgePayload(ended, ["one"]));
    const second = accepted(first, "RESOLVE_JOURNEY_PURGE", purgePayload(first, []));
    expect(second.journey.screen.type).toBe(final ? "journeyComplete" : "atlas"); expect(second.journey.essence).toBe(ended.journey.essence + 7);
  });
  it.each(["draw", "defeat"] as const)("earns a Slug window after an actual engine %s and restores its exact failure summary", (outcome) => {
    registerReplayFixtureProviders(); registerDeckContentProvider({ resolveCardNumber: () => 1, resolveDreamsign: sign });
    const lossCard: EngineCardDefinition = { id: syntheticId(0x4119), cardType: "event", costs: [energy(0)], spark: null,
      subtype: "", speed: "standard", status: "authored", abilities: () => [eventAbility(gainPoints(1, "opponent"))] };
    const lossEngine = createEngine(testCatalog([lossCard]));
    const provider = fixtureBattleInitProvider(); registerBattleInitProvider({ ...provider, engine: outcome === "defeat" ? lossEngine : FIXTURE_ENGINE,
      beginBattle: (input) => {
        const start = provider.beginBattle(input); return start === null ? null : { ...start, engineInit: { ...start.engineInit, turnLimit: 1,
          ...(outcome === "defeat" ? { decks: { player: Array.from({ length: 10 }, () => ({ cardId: lossCard.id })), enemy: start.engineInit.decks.enemy } } : {}) } };
      } });
    let s = accepted(genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: SLUG }); s = accepted(s, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
    s = accepted(s, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    if (outcome === "defeat") {
      const board = journeyBattleOf(s.battle)?.engine.slice.committed; if (board === undefined) throw new Error("missing board");
      s = accepted(s, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: board.sides.player.hand[0], from: "hand" } });
    }
    for (let i = 0; outcome === "draw" && i < 12 && journeyBattleOf(s.battle)?.engine.slice.committed.result === null; i += 1) {
      const board = journeyBattleOf(s.battle)?.engine.slice.committed; if (board === undefined) throw new Error("missing board");
      const side = (["player", "enemy"] as const).find((candidate) => FIXTURE_ENGINE.legalActions(board, candidate).some((action) => action.kind === "pass"));
      if (side === undefined) throw new Error("synthetic turn has no public pass action");
      s = accepted(s, "BATTLE_ACTION", { side, action: { kind: "pass" } });
    }
    expect(journeyBattleOf(s.battle)?.engine.slice.committed.result).toEqual(outcome === "draw"
      ? { kind: "draw", reason: "turnLimit" } : { kind: "victory", winner: "enemy", reason: "score" });
    const ended = accepted(s, "END_BATTLE"), summary = ended.journey.failureSummary;
    expect(ended.journey.screen).toMatchObject({ type: "journeyPurge", choice: { returnTo: "journeyFailed" } });
    if (ended.journey.screen.type !== "journeyPurge") throw new Error("missing failed permission");
    for (const patch of [{ returnTo: "atlas" }, { index: 4 }, { sources: [] }, { sources: [{ dreamsignId: FRUIT, heldIndex: 0, maxCount: 2 }] }]) {
      const snapshot = { ...ended.journey, screen: { ...ended.journey.screen, choice: { ...ended.journey.screen.choice, ...patch } } };
      expect(apply(ended, "LOAD_STATE", { snapshot }).state).toBe(ended);
    }
    expect(apply(ended, "LOAD_STATE", { snapshot: { ...ended.journey, failureSummary: null } }).state).toBe(ended);
    const after = accepted(ended, "RESOLVE_JOURNEY_PURGE", purgePayload(ended, []));
    expect(after.journey.screen.type).toBe("journeyFailed"); expect(after.journey.failureSummary).toEqual(summary);
  });
});
