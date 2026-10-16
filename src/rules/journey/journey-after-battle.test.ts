import { EVENT_CARD_SUBTYPE } from "../../types/card-identity";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEngine } from "../../engine";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import type { EngineCardDefinition } from "../../engine/catalog";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { reduceGameEvent } from "../reducer";
import { event } from "./lifecycle-fixtures";
import { registry } from "./transfiguration-fixtures";
import { testJourneySeed } from "../../types/test-identities";
import { createHash } from "node:crypto";
import type { ActiveAfterBattle } from "./journey-after-battle";
import { afterBattleChoice, projectAfterBattleCursor } from "./journey-after-battle";
import { createJourneyModifierRegistry, type JourneyModifierRegistry } from "./modifier-registry";
import { journeyDuplication } from "./journey-duplication";
import { journeyOnGain } from "./journey-on-gain";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { registerSiteContentProvider } from "./sites";
import { makeAuguryTestContent, makeAuguryTestDreamsignTemplate } from "../../journey_v2/testing/fixtures";
import { testDreamsignId, testGuideId, testGuideArtKey, testDreamscapeId } from "../../types/test-identities";
import { buildJourneyPurgeView } from "../../screens/cumulus_adapters/journey-purge-view-model";
import { buildJourneyTransfigurationView } from "../../screens/cumulus_adapters/journey-transfiguration-view-model";
import { buildJourneyDuplicationView } from "../../screens/cumulus_adapters/journey-duplication-view-model";
import { buildJourneyDreamsignView } from "../../screens/cumulus_adapters/journey-dreamsign-view-model";
import type { DreamsignId } from "../../types/identifiers";
import { genesisFoldState } from "../fold-state";
import type { FoldState } from "../fold-state";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_MODE, registerReplayFixtureProviders, fixtureBattleInitProvider } from "../replay/fixture-providers";
import { ctx, GENESIS } from "./lifecycle-fixtures";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { accepted, apply, card, choicePayload, entries, installProviders, SLIME, SLUG, TOME } from "./transfiguration-fixtures";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";

beforeEach(installProviders); afterEach(clearGameProviders);
let lastBattleSlice: FoldState["battle"] = null;
function battle(ids: readonly DreamsignId[], outcome: "victory" | "final" | "defeat" | "draw" = "victory", useRegistry: JourneyModifierRegistry = registry, beforeEnd?: (state: FoldState) => FoldState): FoldState {
  const accepted: typeof import("./transfiguration-fixtures").accepted = (state, type, payload = {}, context = ctx()) => {
    const result = reduceGameEvent(state, event(type, payload), context, useRegistry);
    if (result.outcome !== "applied") throw new Error(`Synthetic ${type} bounced`);
    return result.state;
  };
  registerReplayFixtureProviders(); installProviders();
  if (outcome === "draw" || outcome === "defeat") {
    const loss: EngineCardDefinition = { id: syntheticId(0x4261), cardType: "event", costs: [energy(0)], spark: null,
      subtype: "", speed: "standard", status: "authored", abilities: () => [eventAbility(gainPoints(1, "opponent"))] };
    const engine = outcome === "defeat" ? createEngine(testCatalog([loss])) : FIXTURE_ENGINE;
    const provider = fixtureBattleInitProvider();
    registerBattleInitProvider({ ...provider, engine, beginBattle(input) {
      const start = provider.beginBattle(input);
      return start === null ? null : { ...start, engineInit: { ...start.engineInit, turnLimit: 1,
        ...(outcome === "defeat" ? { decks: { player: Array.from({ length: 10 }, () => ({ cardId: loss.id })), enemy: start.engineInit.decks.enemy } } : {}) } };
    } });
  }
  let s = accepted(genesisFoldState({ ...GENESIS, seed: testJourneySeed("fixture-battle") }), "START_JOURNEY", { avatarId: AVATAR_ID });
  for (const id of ids) s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: id });
  s = accepted(s, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
  if (outcome === "final") s = { ...s, journey: { ...s.journey, atlas: { ...s.journey.atlas, layers: [s.journey.atlas.layers[0]] } } };
  s = accepted(s, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
  if (outcome !== "draw") {
    const board = journeyBattleOf(s.battle)!.engine.slice.committed;
    s = accepted(s, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: board.sides.player.hand[0], from: "hand" } });
    if (outcome !== "defeat") {
      const prompt = pendingEnginePrompt(s.battle, FIXTURE_ENGINE)!;
      s = accepted(s, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE });
    }
  }
  for (let count = 0; outcome === "draw" && count < 12 && journeyBattleOf(s.battle)?.engine.slice.committed.result === null; count++) {
    const board = journeyBattleOf(s.battle)!.engine.slice.committed;
    const side = (["player", "enemy"] as const).find((actor) => FIXTURE_ENGINE.legalActions(board, actor).some((action) => action.kind === "pass"));
    s = accepted(s, "BATTLE_ACTION", { side, action: { kind: "pass" } });
  }
  s = { ...s, journey: { ...s.journey, deck: entries() } };
  lastBattleSlice = s.battle;
  if (beforeEnd !== undefined) s = beforeEnd(s);
  return accepted(s, "END_BATTLE");
}
function resolve(s: FoldState, ids: readonly string[] = []) {
  return accepted(s, s.journey.screen.type === "journeyTransfiguration" ? "RESOLVE_JOURNEY_TRANSFIGURATION" : "RESOLVE_JOURNEY_PURGE", choicePayload(s.journey, ids));
}

describe("earned two-kind battle permissions through public engine/fold", () => {
  it.each(["victory", "final", "defeat", "draw"] as const)("preserves every earned source in both held orders and exact %s route", (outcome) => {
    for (const held of [[SLUG, SLIME, SLUG, SLIME], [SLIME, SLUG, SLIME, SLUG]]) {
      let s = battle(held, outcome);
      const summary = s.journey.failureSummary, essence = s.journey.essence;
      for (let index = 0; index < held.length; index++) {
        expect(s.journey.screen.type).toBe(held[index] === SLIME ? "journeyTransfiguration" : "journeyPurge");
        expect(choicePayload(s.journey)).toMatchObject({ dreamsignId: held[index], heldIndex: index, choiceIndex: index });
        s = accepted(s, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(s.journey)) });
        const stale = choicePayload(s.journey); s = resolve(s);
        expect(apply(s, held[index] === SLIME ? "RESOLVE_JOURNEY_TRANSFIGURATION" : "RESOLVE_JOURNEY_PURGE", stale).state).toBe(s);
      }
      expect(s.journey.screen.type).toBe(outcome === "victory" ? "atlas" : outcome === "final" ? "journeyComplete" : "journeyFailed");
      expect(s.journey.failureSummary).toEqual(summary); expect(s.journey.essence).toBe(essence); expect(s.battle).toBeNull();
    }
  });
  it("keeps earned lost-source windows without granting a newly acquired copy", () => {
    let s = battle([SLIME, SLUG]);
    s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: SLIME }); s = accepted(s, "REMOVE_DREAMSIGN", { dreamsignId: SLUG });
    s = accepted(s, "ADD_DREAMSIGN", { dreamsignId: SLIME }); s = accepted(s, "LOAD_STATE", { snapshot: s.journey });
    s = resolve(s); expect(s.journey.screen.type).toBe("journeyPurge");
    s = resolve(s); expect(s.journey.screen.type).toBe("atlas");
  });
  it.each([1, 3])("transfigures all %s selected concrete entries, free, with deterministic applicable forms and Tome copies", (count) => {
    const s = battle([SLIME, TOME]);
    const ids = entries().slice(0, count).map((entry) => entry.entryId), rng = vi.fn((index: number) => index % 2 ? 0.9 : 0);
    const payload = choicePayload(s.journey, ids);
    const out = apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", payload, ctx({ rng }));
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.slice(0, count).map((entry) => entry.transfiguration)).toEqual(ids.map((_, index) => index % 2 ? "Enduring" : "Inspired"));
    expect(out.state.journey.deck).toHaveLength(4 + count); expect(out.state.journey.essence).toBe(s.journey.essence);
    expect(rng).toHaveBeenCalledTimes(count);
    expect(apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", payload, ctx({ rng: (index) => index % 2 ? 0.9 : 0 })).state).toEqual(out.state);
    expect(out.logRecords?.[0]).toMatchObject({ fields: { dreamsignId: SLIME, choiceIndex: 0, transformations: ids.map((entryId) => ({ entryId })) } });
  });
  it("declines with zero random draws, including no eligible cards", () => {
    const s = battle([SLIME]), rng = vi.fn(() => 0);
    const formed = { ...s, journey: { ...s.journey, deck: s.journey.deck.map((entry) => ({ ...entry, transfiguration: "Inspired" as const })) } };
    const out = apply(formed, "RESOLVE_JOURNEY_TRANSFIGURATION", choicePayload(formed.journey), ctx({ rng }));
    expect(out.state.journey.screen.type).toBe("atlas"); expect(rng).not.toHaveBeenCalled(); expect(out.state.journey.deck).toEqual(formed.journey.deck);
  });
  it("rejects stale/duplicate/excess/ineligible targets and wrong permission without partial mutation or random draws", () => {
    const s = battle([SLIME, TOME]), payload = choicePayload(s.journey), rng = vi.fn(() => 0);
    for (const patch of [{ entryIds: ["entry-1", "entry-1"] }, { entryIds: ["entry-1", "missing"] }, { entryIds: entries().map((entry) => entry.entryId) },
      { entryIds: ["entry-1"], dreamsignId: SLUG }, { heldIndex: 1 }, { choiceIndex: 1 }, { siteId: "foreign" }]) {
      const out = apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", { ...payload, ...patch }, ctx({ rng }));
      expect(out.state).toBe(s); expect(out.logRecords).toBeUndefined();
    }
    registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: syntheticId(0x4262), cardType: "Event", subtype: EVENT_CARD_SUBTYPE, forms: entry.entryId === "entry-2" ? [] : ["Inspired"] }) });
    expect(apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", { ...payload, entryIds: ["entry-1", "entry-2"] }, ctx({ rng })).state).toBe(s);
    expect(rng).not.toHaveBeenCalled();
  });
  it("contains a second-target provider error before RNG or any card changes and resumes from the committed checkpoint", () => {
    const initial = battle([SLIME, TOME]), rng = vi.fn(() => 0);
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve: (entry) => {
      if (fail && entry.entryId === "entry-2") throw new Error("synthetic second-target failure");
      return { cardId: syntheticId(0x4263), cardType: "Event", subtype: EVENT_CARD_SUBTYPE, forms: ["Inspired"] };
    } });
    const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial,
      reducer: (s, e, c) => reduceGameEvent(s, e, { ...c, rng }, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, now: () => ctx().timestamp, devMode: false });
    const payload = choicePayload(initial.journey, ["entry-1", "entry-2"]);
    log.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload }); expect(log.state()).toBe(initial); expect(rng).not.toHaveBeenCalled();
    fail = false; log.append({ type: "RESOLVE_JOURNEY_TRANSFIGURATION", payload });
    expect(log.state().journey.deck).toHaveLength(6); expect(log.state().journey.screen.type).toBe("atlas");
    expect(foldEvents(config, GENESIS, { seq: 1, state: initial }, [...log.events()].filter(({ seq }) => seq > 1)).state).toEqual(log.state());
  });
  it("rejects concurrent source choices without consuming the permission", () => {
    const s = battle([SLIME]), payload = choicePayload(s.journey, ["entry-1"]);
    for (const intervening of ["unknown" as const, [{ seq: 1, actor: event("END_BATTLE", {}, "partner").actor, type: "ADD_DREAMSIGN" as const }]]) {
      const out = apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", payload, ctx({ intervening }));
      expect(out.state).toBe(s); expect(out.logRecords).toBeUndefined();
    }
  });
  it("rejects malformed saved two-kind purposes and live battle slices, preserving legacy Slug source syntax", () => {
    const s = battle([SLIME, SLUG]), screen = s.journey.screen;
    if (screen.type !== "journeyTransfiguration") throw new Error("missing window");
    for (const patch of [{ index: 9 }, { returnTo: "journeyFailed" }, { sources: [] }, { sources: [{ ...screen.choice.sources[0], kind: "purge" }] },
      { sources: [{ ...screen.choice.sources[0], maxCount: 99 }] }, { sources: [screen.choice.sources[0], screen.choice.sources[0]] }]) {
      expect(apply(s, "LOAD_STATE", { snapshot: { ...s.journey, screen: { ...screen, choice: { ...screen.choice, ...patch } } } }).state).toBe(s);
    }
    expect(apply(s, "LOAD_STATE", { snapshot: s.journey, battle: lastBattleSlice }).state).toBe(s);
    const slug = battle([SLUG]); expect(accepted(slug, "LOAD_STATE", { snapshot: slug.journey }).journey.screen).toEqual(slug.journey.screen);
  });
});


describe("earned choices suspend unrelated same-actor gameplay", () => {
  const intents = () => [
    { type: "ADJUST_ESSENCE", payload: { delta: 7 } },
    { type: "ADD_CARD", payload: { cardId: card.id } },
    { type: "REMOVE_DECK_ENTRY", payload: { entryId: "entry-1" } },
  ] as const;

  it.each([[SLIME], [SLIME, SLUG], [SLUG, SLIME]])("preserves the complete pending window for held sources %j", (...held) => {
    const pending = battle(held);
    const saved = JSON.parse(JSON.stringify(pending)) as FoldState;
    for (const intent of intents()) {
      const out = apply(pending, intent.type, intent.payload, ctx({ intervening: [] }));
      expect.soft(out.outcome, intent.type).toBe("bounced");
      expect.soft(out.state, intent.type).toBe(pending);
      expect.soft(out.state, intent.type).toEqual(saved);
      expect.soft(out.logRecords, intent.type).toBeUndefined();
    }
    const wrong = pending.journey.screen.type === "journeyTransfiguration"
      ? "RESOLVE_JOURNEY_PURGE" : "RESOLVE_JOURNEY_TRANSFIGURATION";
    const out = apply(pending, wrong, choicePayload(pending.journey));
    expect(out.outcome).toBe("bounced");
    expect(out.state).toBe(pending);
    expect(out.logRecords).toBeUndefined();
    const reloaded = accepted(pending, "LOAD_STATE", { snapshot: saved.journey });
    expect(reloaded.journey.screen).toEqual(pending.journey.screen);
    expect(resolve(reloaded).journey.screen.type).toBe(held.length === 1 ? "atlas"
      : held[1] === SLIME ? "journeyTransfiguration" : "journeyPurge");
  });

  it("applies the same unrelated gameplay intents outside a pending window", () => {
    const ordinary = battle([]);
    const [essence, added, removed] = intents().map((intent) => apply(ordinary, intent.type, intent.payload));
    for (const result of [essence, added, removed]) expect(result.outcome).toBe("applied");
    expect(essence.state.journey.essence).toBe(ordinary.journey.essence + 7);
    expect(added.state.journey.deck).toHaveLength(ordinary.journey.deck.length + 1);
    expect(removed.state.journey.deck.map((entry) => entry.entryId)).toEqual(ordinary.journey.deck.slice(1).map((entry) => entry.entryId));
  });
});


describe("earned four-purpose cursor public contracts", () => {
  const SPIDER = testDreamsignId("cursor-spider"), RED = testDreamsignId("cursor-red"), OFFER = testDreamsignId("cursor-offer");
  const mixedRegistry = createJourneyModifierRegistry([registry.lookup(SLUG)!, registry.lookup(SLIME)!,
    journeyDuplication(SPIDER, { kind: "afterBattleDuplication" }), journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 1 })]);
  const content = () => {
    const value = makeAuguryTestContent({ cards: [card], dreamsignTemplates: [makeAuguryTestDreamsignTemplate({ id: OFFER })] });
    value.guides = (["Purge", "Transfiguration", "Duplication"] as const).map((siteType) => ({
      id: testGuideId(`cursor-${siteType}`), name: "", homeDreamscapeId: testDreamscapeId("cursor-home"), siteType,
      portraitSource: "", artKey: testGuideArtKey(`cursor-${siteType}`), headTargetX: 0.5, dialogue: { site: [] }, homeSpecialty: "" }));
    return value;
  };
  const run = (state: FoldState, type: Parameters<typeof apply>[1], payload: Record<string, unknown> = {}) =>
    reduceGameEvent(state, event(type, payload), ctx(), mixedRegistry);
  const prepare = () => {
    const value = content();
    const state = battle([SLUG, SLIME, SPIDER, RED], "victory", mixedRegistry,
      (before) => {
        registerSiteContentProvider(createSiteContentProvider(value));
        return { ...before, journey: { ...before.journey, remainingDreamsignPool: [OFFER] } };
      });
    return { state, value };
  };

  it("reloads a mixed earned queue and resolves each projected physical permission exactly once", () => {
    const { state: initial, value } = prepare();
    let state = initial;
    const held = [SLUG, SLIME, SPIDER, RED];
    for (let ordinal = 0; ordinal < held.length; ordinal++) {
      const raw = JSON.stringify(state.journey.screen), reloaded = run(state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(state.journey)) });
      expect(reloaded.outcome).toBe("applied"); state = reloaded.state;
      expect(JSON.stringify(state.journey.screen)).toBe(raw);
      const choice = afterBattleChoice(state.journey.screen)!;
      const common = { siteId: choice.siteId, dreamsignId: held[ordinal], heldIndex: ordinal, choiceIndex: ordinal };
      const target = state.journey.deck[0].entryId;
      let type: Parameters<typeof apply>[1], payload: Record<string, unknown>;
      if (ordinal === 0) {
        const view = buildJourneyPurgeView(state.journey, value, mixedRegistry)!;
        expect(view).toMatchObject(common); expect(view.cards.map(item => item.entryId)).toEqual(state.journey.deck.filter(entry => entry.cardNumber === card.cardNumber).map(entry => entry.entryId));
        type = "RESOLVE_JOURNEY_PURGE"; payload = { ...common, entryIds: [target] };
      } else if (ordinal === 1) {
        const view = buildJourneyTransfigurationView(state.journey, value)!;
        expect(view).toMatchObject(common); expect(view.cards.map(entry => entry.entryId)).toContain(target);
        type = "RESOLVE_JOURNEY_TRANSFIGURATION"; payload = { ...common, entryIds: [target] };
      } else if (ordinal === 2) {
        const view = buildJourneyDuplicationView(state.journey, value, mixedRegistry)!;
        expect(view).toMatchObject(common); expect(view.cards.map(entry => entry.entryId)).toContain(target);
        type = "RESOLVE_JOURNEY_DUPLICATION"; payload = { ...common, earnedSeq: view.earnedSeq, entryId: target };
      } else {
        const view = buildJourneyDreamsignView(state.journey, value)!;
        expect(view).toMatchObject({ siteId: choice.siteId, sourceDreamsignId: RED, heldIndex: ordinal, choiceIndex: ordinal });
        expect(view.options.map(option => option.dreamsign.id)).toEqual([OFFER]);
        type = "RESOLVE_AFTER_BATTLE_DREAMSIGN"; payload = { ...common, earnedSeq: view.permissionSeq, offeredDreamsignId: OFFER };
      }
      for (const wrong of ["RESOLVE_JOURNEY_PURGE", "RESOLVE_JOURNEY_TRANSFIGURATION", "RESOLVE_JOURNEY_DUPLICATION", "RESOLVE_AFTER_BATTLE_DREAMSIGN"] as const) {
        if (wrong === type) continue;
        const rejected = run(state, wrong, payload);
        expect(rejected.state).toBe(state); expect(rejected.logRecords).toBeUndefined();
      }
      const before = state, settled = run(state, type, payload);
      expect(settled.outcome).toBe("applied"); state = settled.state;
      if (ordinal === 0) expect(state.journey.deck.map(entry => entry.entryId)).toEqual(before.journey.deck.slice(1).map(entry => entry.entryId));
      if (ordinal === 1) expect(state.journey.deck.find(entry => entry.entryId === target)?.transfiguration).not.toBeNull();
      if (ordinal === 2) {
        expect(state.journey.deck).toHaveLength(before.journey.deck.length + 1);
        const copied = state.journey.deck[state.journey.deck.length - 1];
        expect(copied.entryId).not.toBe(target); expect({ ...copied, entryId: target }).toEqual(before.journey.deck[0]);
      }
      if (ordinal === 3) expect(state.journey.dreamsigns[state.journey.dreamsigns.length - 1]?.id).toBe(OFFER);
      const stale = run(state, type, payload); expect(stale.state).toBe(state); expect(stale.logRecords).toBeUndefined();
    }
    expect(state.journey.screen.type).toBe("atlas");
  });

  it("atomically rejects mismatched screen purposes and indices while retaining legacy purge bytes and hash", () => {
    const { state, value } = prepare(), screen = state.journey.screen;
    const original = JSON.stringify(screen), hash = createHash("sha256").update(original).digest("hex");
    const reloaded = run(state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(state.journey)) });
    expect(reloaded.outcome).toBe("applied");
    buildJourneyPurgeView(reloaded.state.journey, value, mixedRegistry);
    const saved = JSON.stringify(reloaded.state.journey.screen);
    expect(saved).toBe(original); expect(createHash("sha256").update(saved).digest("hex")).toBe(hash);
    const choice = afterBattleChoice(screen)!;
    const uppercase = { ...screen, choice: { ...choice, sources: choice.sources.map(source => ({ ...source, dreamsignId: source.dreamsignId.toUpperCase() })) } };
    const loadedUppercase = run(state, "LOAD_STATE", { snapshot: { ...state.journey, screen: uppercase } });
    expect(loadedUppercase.outcome).toBe("applied");
    expect(JSON.stringify(loadedUppercase.state.journey.screen)).toBe(JSON.stringify(uppercase));
    expect(Object.prototype.hasOwnProperty.call(choice.sources[0], "kind")).toBe(false);
    for (const badScreen of [
      { type: "journeyTransfiguration", choice }, { type: "journeyDuplication", choice }, { type: "journeyDreamsign", choice },
      { ...screen, choice: { ...choice, index: -1 } }, { ...screen, choice: { ...choice, index: choice.sources.length } },
      { ...screen, choice: { ...choice, sources: [{ ...choice.sources[0], kind: "unknown" }] } },
    ]) {
      const rejected = run(state, "LOAD_STATE", { snapshot: { ...state.journey, screen: badScreen } });
      expect(rejected.state).toBe(state); expect(rejected.logRecords).toBeUndefined();
    }
    const cursor = projectAfterBattleCursor({ ...choice, index: 2 });
    const consumesTransfiguration = (_permission: Extract<ActiveAfterBattle, { kind: "transfiguration" }>): void => undefined;
    if (cursor?.kind === "duplication") {
      // @ts-expect-error A physical duplication permission cannot satisfy a transfiguration consumer.
      consumesTransfiguration(cursor);
    }
  });
});
