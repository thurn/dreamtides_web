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
import type { DreamsignId } from "../../types/identifiers";
import { genesisFoldState } from "../fold-state";
import type { FoldState } from "../fold-state";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_MODE, registerReplayFixtureProviders, fixtureBattleInitProvider } from "../replay/fixture-providers";
import { ctx, GENESIS } from "./lifecycle-fixtures";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { accepted, apply, choicePayload, entries, installProviders, SLIME, SLUG, TOME } from "./transfiguration-fixtures";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";

beforeEach(installProviders); afterEach(clearGameProviders);
let lastBattleSlice: FoldState["battle"] = null;
function battle(ids: readonly DreamsignId[], outcome: "victory" | "final" | "defeat" | "draw" = "victory"): FoldState {
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
    registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: syntheticId(0x4262), cardType: "Event", forms: entry.entryId === "entry-2" ? [] : ["Inspired"] }) });
    expect(apply(s, "RESOLVE_JOURNEY_TRANSFIGURATION", { ...payload, entryIds: ["entry-1", "entry-2"] }, ctx({ rng })).state).toBe(s);
    expect(rng).not.toHaveBeenCalled();
  });
  it("contains a second-target provider error before RNG or any card changes and resumes from the committed checkpoint", () => {
    const initial = battle([SLIME, TOME]), rng = vi.fn(() => 0);
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve: (entry) => {
      if (fail && entry.entryId === "entry-2") throw new Error("synthetic second-target failure");
      return { cardId: syntheticId(0x4263), cardType: "Event", forms: ["Inspired"] };
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
