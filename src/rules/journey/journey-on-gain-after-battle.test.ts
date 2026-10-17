import { afterEach, expect, it, vi } from "vitest";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { FIXTURE_ENGINE, FIXTURE_POINTS_MODE } from "../replay/fixture-providers";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { createEngine } from "../../engine";
import { energy, event as eventAbility } from "../../engine/dsl/builders";
import { gainPoints } from "../../engine/effects/primitives";
import { syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import type { EngineCardDefinition } from "../../engine/catalog";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { registerSiteContentProvider } from "./sites";
import type { FoldState } from "../fold-state";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GENESIS, ctx, event } from "./lifecycle-fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { reduceGameEvent } from "../reducer";
import { makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { sign } from "./journey-on-gain-fixtures";
import { testSiteContentProvider } from "./test-content-providers";
import type { EngineConfig } from "../../eventlog/types";
import { afterBattleChoice } from "./journey-after-battle";
import { RED, SLUG, SLIME, DOLL, templates, registry, apply, beginBattle, clear } from "./journey-on-gain-fixtures";
afterEach(clear);
function victory(held: Parameters<typeof beginBattle>[0], final = false, pool?: Parameters<typeof beginBattle>[0], beforeEnd?: () => void) {
  let state = beginBattle(held);
  if (final) state = { ...state, journey: { ...state.journey, atlas: { ...state.journey.atlas, layers: [state.journey.atlas.layers[0]] } } };
  const card = journeyBattleOf(state.battle)!.engine.slice.committed.sides.player.hand[0];
  state = apply(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }).state;
  const prompt = pendingEnginePrompt(state.battle, FIXTURE_ENGINE)!;
  state = apply(state, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE }).state;
  if (pool !== undefined) state = { ...state, journey: { ...state.journey, remainingDreamsignPool: [...pool] } };
  beforeEnd?.();
  const ended = apply(state, "END_BATTLE"); expect(ended.outcome).toBe("applied"); return ended.state;
}
function resolveEarned(state: FoldState) {
  const choice = afterBattleChoice(state.journey.screen); if (choice === null) throw new Error("missing earned choice");
  const source = choice.sources[choice.index], payload = { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index };
  const result = source.kind === "dreamsign" ? apply(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { ...payload, earnedSeq: source.earnedSeq, offeredDreamsignId: source.offeredDreamsigns.find((sign) => sign.id !== DOLL)?.id ?? null }) : apply(state, source.kind === "transfiguration" ? "RESOLVE_JOURNEY_TRANSFIGURATION" : "RESOLVE_JOURNEY_PURGE", { ...payload, entryIds: [] });
  expect(result.outcome).toBe("applied"); return result.state;
}

it("earns a concrete Dreamsign purpose after an actual terminal battle", () => {
  let state = beginBattle([RED]);
  const card = journeyBattleOf(state.battle)!.engine.slice.committed.sides.player.hand[0];
  state = apply(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }).state;
  const prompt = pendingEnginePrompt(state.battle, FIXTURE_ENGINE)!;
  state = apply(state, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE }).state;
  const result = apply(state, "END_BATTLE");
  expect(result.outcome).toBe("applied"); expect(result.state.battle).toBeNull();
  expect(result.state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "afterBattle", sources: [{ kind: "dreamsign" }], returnTo: "atlas" } });
});

it.each([[RED, SLUG, SLIME], [RED, SLIME, SLUG], [SLUG, RED, SLIME], [SLUG, SLIME, RED], [SLIME, RED, SLUG], [SLIME, SLUG, RED]])("retains every earned purpose in physical held order %s/%s/%s", (...held) => {
  let state = victory(held); const balance = state.journey.essence;
  const choice = afterBattleChoice(state.journey.screen)!;
  expect(choice.sources.map((source) => source.dreamsignId)).toEqual(held);
  expect(choice.sources.map((source) => source.heldIndex)).toEqual([0, 1, 2]);
  expect(choice.sources.map((source) => source.kind ?? "purge")).toEqual(held.map((id) => id === RED ? "dreamsign" : id === SLIME ? "transfiguration" : "purge"));
  state = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) }).state;
  for (let n = 0; n < 3; n++) state = resolveEarned(state);
  expect(state.journey.screen.type).toBe("atlas"); expect(state.journey.essence).toBe(balance);
});
it.each([false, true])("preserves duplicate earned rights through source loss and exact terminal continuation, final=%s", (final) => {
  let state = victory([RED, RED, SLUG, SLIME], final);
  const choice = afterBattleChoice(state.journey.screen)!;
  expect(choice.sources).toHaveLength(4);
  state = apply(state, "REMOVE_DREAMSIGN", { dreamsignId: RED }).state;
  state = apply(state, "REMOVE_DREAMSIGN", { dreamsignId: RED }).state;
  expect(afterBattleChoice(state.journey.screen)).toEqual(choice);
  const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) }); expect(loaded.outcome).toBe("applied"); state = loaded.state;
  for (let n = 0; n < 4; n++) state = resolveEarned(state);
  expect(state.journey.screen.type).toBe(final ? "journeyComplete" : "atlas");
});
it.each([false, true])("suspends Red→Doll before remaining Slug/Slime and reloads the exact terminal queue, final=%s", (final) => {
  let state = victory([RED, SLUG, SLIME], final, [DOLL]);
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "afterBattle") throw new Error("missing Red choice");
  const earned = state.journey.screen.choice, source = earned.sources[0]; if (source.kind !== "dreamsign") throw new Error("wrong source");
  // Choose a real prepared Doll if available; a controlled pool supplies this registered template.
  expect(source.offeredDreamsigns.some((sign) => sign.id === DOLL)).toBe(true);
  const selected = apply(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: earned.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: DOLL }); expect(selected.outcome).toBe("applied"); state = selected.state;
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "copy") throw new Error("missing Doll");
  const copy = state.journey.screen.choice;
  expect(copy.continuation).toMatchObject({ type: "journeyPurge", choice: { index: 1, returnTo: final ? "journeyComplete" : "atlas" } });
  const bad = { ...state.journey, screen: { ...state.journey.screen, choice: { ...copy, continuation: { type: "journeyPurge", choice: { ...earned, index: 0 } } } } };
  expect(apply(state, "LOAD_STATE", { snapshot: bad }).state).toBe(state);
  const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) }); expect(loaded.outcome).toBe("applied"); state = loaded.state;
  state = apply(state, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: copy.sources[copy.index].heldIndex, choiceIndex: copy.index, permissionSeq: copy.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED }).state;
  expect(state.journey.dreamsigns[state.journey.dreamsigns.length - 1]).toEqual(state.journey.dreamsigns[0]);
  state = resolveEarned(state); state = resolveEarned(state);
  expect(state.journey.screen.type).toBe(final ? "journeyComplete" : "atlas");
});

it.each(["defeat", "draw"] as const)("earns all three purposes from an actual engine %s and preserves its failure summary", (outcome) => {
  const lossCard: EngineCardDefinition = { id: syntheticId(0x263), cardType: "event", costs: [energy(0)], spark: null, subtype: "", speed: "standard", status: "authored", abilities: () => [eventAbility(gainPoints(1, "opponent"))] };
  const lossEngine = createEngine(testCatalog([lossCard]));
  let state = beginBattle([RED, SLIME, SLUG], () => {
    const provider = fixtureBattleInitProvider(); registerBattleInitProvider({ ...provider, engine: outcome === "defeat" ? lossEngine : FIXTURE_ENGINE, beginBattle: (input) => {
      const start = provider.beginBattle(input); return start === null ? null : { ...start, engineInit: { ...start.engineInit, turnLimit: 1, ...(outcome === "defeat" ? { decks: { player: Array.from({ length: 10 }, () => ({ cardId: lossCard.id })), enemy: start.engineInit.decks.enemy } } : {}) } };
    } });
  });
  if (outcome === "defeat") state = apply(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: journeyBattleOf(state.battle)!.engine.slice.committed.sides.player.hand[0], from: "hand" } }).state;
  for (let n = 0; outcome === "draw" && n < 12 && journeyBattleOf(state.battle)!.engine.slice.committed.result === null; n++) {
    const board = journeyBattleOf(state.battle)!.engine.slice.committed;
    const side = (["player", "enemy"] as const).find((side) => FIXTURE_ENGINE.legalActions(board, side).some((action) => action.kind === "pass")); if (side === undefined) throw new Error("no public pass");
    const passed = apply(state, "BATTLE_ACTION", { side, action: { kind: "pass" } }); expect(passed.outcome).toBe("applied"); state = passed.state;
  }
  expect(journeyBattleOf(state.battle)!.engine.slice.committed.result).not.toBeNull();
  const ended = apply(state, "END_BATTLE"); expect(ended.outcome).toBe("applied"); state = ended.state;
  const summary = structuredClone(state.journey.failureSummary), choice = afterBattleChoice(state.journey.screen)!;
  expect(choice.returnTo).toBe("journeyFailed"); expect(choice.sources.map((source) => source.dreamsignId)).toEqual([RED, SLIME, SLUG]);
  expect(summary?.result).toBe(outcome);
  const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) }); expect(loaded.outcome).toBe("applied"); state = loaded.state;
  for (let n = 0; n < 3; n++) state = resolveEarned(state);
  expect(state.journey.screen.type).toBe("journeyFailed"); expect(state.journey.failureSummary).toEqual(summary);
});
it.each(["keep", "replace"])("permits an earned cap %s while preserving one terminal completion", (mode) => {
  const ended = victory([RED], false, [SLUG]);
  const state = { ...ended, journey: { ...ended.journey, maxDreamsigns: 1 } };
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "afterBattle") throw new Error("missing earned choice");
  const source = state.journey.screen.choice.sources[0]; if (source.kind !== "dreamsign") throw new Error("wrong source");
  const payload = { siteId: state.journey.screen.choice.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: mode === "keep" ? null : source.offeredDreamsigns[0].id, ...(mode === "replace" ? { purgeIndex: 0 } : {}) };
  const result = apply(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", payload); expect(result.outcome).toBe("applied");
  expect(result.state.journey.screen.type).toBe("atlas"); expect(result.state.journey.dreamsigns).toHaveLength(1);
  expect(result.state.journey.dreamsigns[0].id).toBe(mode === "keep" ? RED : source.offeredDreamsigns[0].id);
  expect(apply(result.state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", payload).state).toBe(result.state);
});
it("continues an actual empty prepared catalog without Essence or a fake reward", () => {
  const ended = victory([RED], false, [], () => registerSiteContentProvider(createSiteContentProvider(makeAuguryTestContent({ cards: [], dreamsignTemplates: [] }))));
  if (ended.journey.screen.type !== "journeyDreamsign" || ended.journey.screen.choice.kind !== "afterBattle") throw new Error("missing empty choice");
  const choice = ended.journey.screen.choice, source = choice.sources[0]; if (source.kind !== "dreamsign") throw new Error("wrong source");
  expect(source.offeredDreamsigns).toEqual([]);
  const result = apply(ended, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: choice.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: null }); expect(result.outcome).toBe("applied");
  expect(result.state.journey.screen.type).toBe("atlas"); expect(result.state.journey.essence).toBe(ended.journey.essence); expect(result.state.journey.dreamsigns).toEqual(ended.journey.dreamsigns);
});
it("rejects a premature free decline and stale earned choice without effects or draws", () => {
  const state = victory([RED], false, [SLUG]);
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "afterBattle") throw new Error("missing choice");
  const choice = state.journey.screen.choice, source = choice.sources[0]; if (source.kind !== "dreamsign") throw new Error("wrong source");
  const payload = { siteId: choice.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: source.offeredDreamsigns[0].id }, rng = vi.fn(() => 0);
  for (const patch of [{ offeredDreamsignId: null }, { offeredDreamsignId: DOLL }, { earnedSeq: source.earnedSeq + 1 }, { purgeIndex: 999 }, { heldIndex: 1 }]) {
    const result = apply(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { ...payload, ...patch }, { rng }); expect(result.state).toBe(state); expect(result.logRecords).toBeUndefined();
  }
  expect(rng).not.toHaveBeenCalled();
});

it.each(["null", "throw"])("contains earned offer provider %s with battle/reward/pool untouched, then retries and replays", (failure) => {
  let terminal = beginBattle([RED]);
  const card = journeyBattleOf(terminal.battle)!.engine.slice.committed.sides.player.hand[0];
  terminal = apply(terminal, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }).state;
  const prompt = pendingEnginePrompt(terminal.battle, FIXTURE_ENGINE)!;
  terminal = apply(terminal, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE }).state;
  const provider = createSiteContentProvider(makeAuguryTestContent({ cards: [], dreamsignTemplates: templates }));
  let fail = true;
  registerSiteContentProvider(testSiteContentProvider({ prepareAfterBattleDreamsignOffer: (input) => { if (fail) { if (failure === "throw") throw new Error("synthetic earned offer failure"); return null; } return provider.prepareAfterBattleDreamsignOffer!(input); } }));
  const config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => terminal, reducer: (state, intent, context) => reduceGameEvent(state, intent, context, registry) };
  const log = createLocalLog({ config, genesis: GENESIS, localActor: event("END_BATTLE", {}).actor, devMode: false, now: () => ctx().timestamp });
  const records: LocalLogRecord<FoldState>[] = []; log.subscribe((record) => records.push(record));
  log.append({ type: "END_BATTLE", payload: {} }); expect(log.state()).toEqual(terminal);
  expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" }); expect(records[0].logRecords).toBeUndefined();
  fail = false; log.append({ type: "END_BATTLE", payload: {} });
  expect(log.state().battle).toBeNull(); expect(afterBattleChoice(log.state().journey.screen)?.sources).toHaveLength(1);
  expect(log.state().journey.essence - terminal.journey.essence).toBe(journeyBattleOf(terminal.battle)!.init.essenceReward);
  expect(foldEvents(config, GENESIS, { seq: 1, state: terminal }, log.events().filter(({ seq }) => seq > 1)).state).toEqual(log.state());
});

it("does not earn a Battle-only purpose or consume draws for a non-Battle hook transition", () => {
  beginBattle([]);
  const before = stateWithSites([makeSite("Exploration")], { dreamsigns: [RED, SLUG, SLIME].map(sign) }).journey;
  const journey = { ...before, screen: { type: "atlas" as const } }, random = vi.fn(() => ({ value: 0, drawIndex: 0 }));
  const result = registry.apply({ before, journey, eventType: "END_BATTLE", seq: 10, random, transfigurations: [], siteId: SITE_ID });
  expect(result.journey).toBe(journey); expect(result.logRecords).toEqual([]); expect(random).not.toHaveBeenCalled();
});
