import { afterEach, describe, expect, it } from "vitest";
import { reduceGameEvent } from "../reducer";
import { journeyOnGain } from "./journey-on-gain";
import * as beforeBattle from "./journey-before-battle-purge-fixtures";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { testEventActor } from "../../types/test-identities";
import { parseAtlasNodeId, parseBattleId, parseDreamsignId } from "../../types/identifiers";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { makeSite, stateWithSites } from "./sites-fixtures";
import { battleWorld, tutorialBattle } from "./journey-rewards272-fixtures";
import { beginBattle } from "./journey-on-gain-fixtures";
import { journeyBattleOf } from "../battle/fold";
import { FIXTURE_ENGINE, FIXTURE_POINTS_MODE } from "../replay/fixture-providers";
import { registerSiteContentProvider } from "./sites";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { makeAuguryTestContent } from "../../journey_v2/testing/fixtures";
import { afterBattleChoice } from "./journey-after-battle";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { MASK, OTHER, DOLL, TEETH, TYPES, nightmareAcquisition, initial, apply, accepted, choicePayload, auguryGains, cards, RED, SLUG, SLIME, SPIDER, sign, install, clear, event, ctx, GENESIS } from "./journey-type-remap-fixtures";
afterEach(clear);

describe("earned run type remap", () => {
  it.each([false, true])("retains acquired Nightmare additions and prohibition before the C12 wrapper, prevented=%s", prevented => {
    const { before, result, modifiers, acquired, prohibition } = nightmareAcquisition(prevented);
    expect(result.outcome).toBe("applied");
    const addition = result.logRecords?.find(row => row.fields.dreamsignId === acquired);
    if (addition === undefined) throw new Error("Missing acquired source log");
    expect(addition.fields.after).toMatchObject({ attempted: 3, gained: prevented ? 0 : 3, prevented: prevented ? 3 : 0 });
    const attempts = addition.fields.attemptedEntryIds;
    if (!Array.isArray(attempts)) throw new Error("Missing physical acquisition diagnostics");
    expect(attempts).toHaveLength(3); expect(new Set(attempts).size).toBe(3);
    const retained = result.state.journey.deck.filter(entry => attempts.includes(entry.entryId));
    expect(retained).toHaveLength(prevented ? 0 : 3);
    expect(result.state.journey.deck.slice(0, before.journey.deck.length)).toEqual(before.journey.deck);
    expect(result.logRecords?.filter(row => row.fields.dreamsignId === prohibition)).toHaveLength(prevented ? 1 : 0);
    expect(result.state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "typeRemap" } });
    const chosen = reduceGameEvent(result.state, event("RESOLVE_TYPE_REMAP", choicePayload(result.state)), ctx({ seq: 11 }), modifiers);
    expect(chosen.outcome).toBe("applied"); expect(chosen.state.journey.typeRemap).toBe("Mage");
    expect(chosen.state.journey.screen).toEqual(before.journey.screen); expect(chosen.state.journey.deck).toEqual(result.state.journey.deck);
  });

  it("restores the exact earned pre-battle permission after C12 and hands the drained scalar/deck to ordinary initialization", () => {
    const modifiers = beforeBattle.registry([journeyOnGain(MASK, { kind: "typeRemapOnGain" })]);
    const inputs: Parameters<ReturnType<typeof beforeBattle.provider>["beginBattle"]>[0][] = [];
    beforeBattle.provider(input => inputs.push(input));
    const pending = beforeBattle.pending(beforeBattle.initial(), modifiers);
    registerJourneyTypeRemapProvider(TYPES);
    const result = beforeBattle.apply(pending, "ADD_DREAMSIGN", { dreamsignId: MASK }, modifiers, { seq: 11 });
    expect(result.outcome).toBe("applied"); expect(result.state.battle).toBeNull(); expect(inputs).toHaveLength(0);
    const screen = result.state.journey.screen;
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap" || screen.choice.continuation.type !== "journeyPurge") throw new Error("Missing wrapped pre-battle permission");
    expect(screen.choice.continuation).toEqual(pending.journey.screen);
    const loaded = beforeBattle.apply(result.state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(result.state.journey)) }, modifiers, { seq: 12 });
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.screen).toEqual(screen);
    const forged = { ...result.state.journey, screen: { ...screen, choice: { ...screen.choice, continuation: { ...screen.choice.continuation, choice: { ...screen.choice.continuation.choice, minimumDeckSize: -1 } } } } };
    const refused = beforeBattle.apply(result.state, "LOAD_STATE", { snapshot: forged }, modifiers, { seq: 12 });
    expect(refused.outcome).toBe("bounced"); expect(refused.state).toBe(result.state);
    const chosen = beforeBattle.apply(loaded.state, "RESOLVE_TYPE_REMAP", choicePayload(loaded.state), modifiers, { seq: 13 });
    expect(chosen.outcome).toBe("applied"); expect(chosen.state.journey.screen).toEqual(pending.journey.screen);
    const removed = chosen.state.journey.deck[0].entryId;
    const started = beforeBattle.apply(chosen.state, "RESOLVE_JOURNEY_PURGE", beforeBattle.payload(chosen.state, [removed]), modifiers, { seq: 14 });
    expect(started.outcome).toBe("applied"); expect(started.state.battle).not.toBeNull(); expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({ seq: 10, timestamp: "1970-01-01T00:00:00.000Z", journey: { typeRemap: "Mage" } });
    expect(inputs[0].journey.deck).toEqual(chosen.state.journey.deck.filter(entry => entry.entryId !== removed));
    expect(started.state.journey.typeRemap).toBe("Mage");
  });

  for (const actor of ["alice", "bob"]) it(`records a genuine choice, source loss, future entries and reset for ${actor}`, () => {
    const before = initial([OTHER]);
    let state = accepted(before, "ADD_DREAMSIGN", { dreamsignId: MASK }, { seq: 21 }, actor);
    expect(state.journey.typeRemap).toBeUndefined();
    const permission = structuredClone(state.journey.screen), payload = choicePayload(state);
    state = accepted(state, "REMOVE_DREAMSIGN", { dreamsignId: MASK });
    expect(state.journey.screen).toEqual(permission);
    state = accepted(state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(state.journey)) });
    const chosen = apply(state, "RESOLVE_TYPE_REMAP", payload, {}, actor);
    expect(chosen.outcome).toBe("applied"); state = chosen.state;
    expect(state.journey.typeRemap).toBe("Mage"); expect(state.journey.screen).toEqual(before.journey.screen);
    expect(chosen.logRecords?.[0].fields).toMatchObject({ dreamsignId: MASK, heldIndex: 1, permissionSeq: 21, chosenSubtype: "Mage", priorTypeRemap: null });
    state = accepted(state, "ADD_CARD", { cardId: cards[2].id });
    expect(state.journey.deck).toHaveLength(3); expect(state.journey.typeRemap).toBe("Mage");
    const replayed = accepted(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) });
    expect(replayed.journey).toEqual(state.journey);
    expect(accepted(state, "RESET_JOURNEY").journey.typeRemap).toBeUndefined();
    expect(before.journey.dreamsigns.map(sign => sign.id)).toEqual([OTHER]);
  });

  it("refuses partial/stale/foreign choices and other gameplay atomically", () => {
    const state = accepted(initial(), "ADD_DREAMSIGN", { dreamsignId: MASK }, { seq: 17 });
    const payload = choicePayload(state);
    for (const patch of [{ sourceDreamsignId: OTHER }, { heldIndex: 1 }, { permissionSeq: 16 }, { choiceIndex: 1 }, { chosenSubtype: "" }, { chosenSubtype: "*" }, { chosenSubtype: "Unknown" }, { chosenSubtype: null }]) {
      const result = apply(state, "RESOLVE_TYPE_REMAP", { ...payload, ...patch }); expect(result.outcome).toBe("bounced"); expect(result.state).toBe(state);
    }
    expect(apply(state, "RESOLVE_TYPE_REMAP", {}).state).toBe(state);
    expect(apply(state, "RESOLVE_TYPE_REMAP", payload, { intervening: "unknown" }).state).toBe(state);
    expect(apply(state, "RESOLVE_TYPE_REMAP", payload, { intervening: [{ seq: 12, type: "ADD_CARD", actor: testEventActor("other") }] }).state).toBe(state);
    for (const [type, data] of [["ADD_CARD", { cardId: cards[0].id }], ["ADD_DREAMSIGN", { dreamsignId: MASK }], ["BEGIN_BATTLE", {}], ["BATTLE_CANCEL", { side: "player" }], ["BATTLE_DEBUG", {}]] as const) expect(apply(state, type, data).state).toBe(state);
    const done = accepted(state, "RESOLVE_TYPE_REMAP", payload);
    expect(apply(done, "RESOLVE_TYPE_REMAP", payload).state).toBe(done);
  });

  it("resolves duplicate genuine acquisitions in order and replaces the completed scalar", () => {
    let state = auguryGains([MASK, MASK]);
    const first = choicePayload(state, "Warrior"); expect(first).toMatchObject({ heldIndex: 0, choiceIndex: 0 });
    state = accepted(state, "RESOLVE_TYPE_REMAP", first);
    expect(state.journey.typeRemap).toBe("Warrior"); expect(choicePayload(state)).toMatchObject({ heldIndex: 1, choiceIndex: 1 });
    state = accepted(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) });
    state = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state, "Shadow"));
    expect(state.journey.typeRemap).toBe("Shadow");
    state = accepted(state, "ADD_DREAMSIGN", { dreamsignId: MASK, purgeIndex: 0 }, { seq: 25 });
    expect(choicePayload(state)).toMatchObject({ heldIndex: 0, permissionSeq: 25 });
    expect(apply(state, "RESOLVE_TYPE_REMAP", first).state).toBe(state);
    state = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state, "Mage"));
    expect(state.journey.typeRemap).toBe("Mage");
  });

  it.each([[MASK, TEETH, DOLL], [DOLL, MASK, TEETH]])("keeps mixed acquisition permissions and refuses destructive nested removal: %s/%s/%s", (...gains) => {
    let state = auguryGains(gains, [OTHER]);
    expect(apply(state, "REMOVE_DREAMSIGN", { dreamsignId: MASK }).state).toBe(state);
    state = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state));
    expect(state.journey.screen.type).toBe("journeyStarterPurge");
    if (state.journey.screen.type !== "journeyStarterPurge") throw new Error("missing starter permission");
    const starter = state.journey.screen.choice, source = starter.sources[starter.index];
    state = accepted(state, "RESOLVE_STARTER_PURGE", { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: starter.index, permissionSeq: starter.permissionSeq, entryIds: [] });
    if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "copy") throw new Error("missing copy permission");
    const copy = state.journey.screen.choice, doll = copy.sources[copy.index];
    state = accepted(state, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: doll.dreamsignId, heldIndex: doll.heldIndex, choiceIndex: copy.index, permissionSeq: copy.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: OTHER });
    expect(state.journey.screen).toEqual(copy.continuation); expect(state.journey.typeRemap).toBe("Mage");
  });

  it.each([false, true])("resumes the actual remaining earned purposes after an earned Mask, final=%s", final => {
    let state = beginBattle([RED, SLUG, SLIME, SPIDER, RED]); install();
    if (final) state = { ...state, journey: { ...state.journey, atlas: { ...state.journey.atlas, layers: [state.journey.atlas.layers[0]] } } };
    registerSiteContentProvider(createSiteContentProvider(makeAuguryTestContent({ cards, dreamsignTemplates: [{ ...sign(MASK), imageName: "synthetic.png" }] })));
    state = { ...state, journey: { ...state.journey, remainingDreamsignPool: [MASK] } };
    const card = journeyBattleOf(state.battle)!.engine.slice.committed.sides.player.hand[0];
    state = accepted(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    const prompt = pendingEnginePrompt(state.battle, FIXTURE_ENGINE)!;
    state = accepted(state, "BATTLE_ANSWER", { side: "player", promptId: prompt.prompt.id, value: FIXTURE_POINTS_MODE });
    state = accepted(state, "END_BATTLE", {}, { seq: 30 });
    const earned = afterBattleChoice(state.journey.screen)!;
    expect(earned.sources.map(source => source.kind ?? "purge")).toEqual(["dreamsign", "purge", "transfiguration", "duplication", "dreamsign"]);
    const source = earned.sources[0]; if (source.kind !== "dreamsign") throw new Error("Missing prepared offer");
    expect(source.offeredDreamsigns.map(sign => sign.id)).toEqual([MASK]);
    state = accepted(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: earned.siteId, dreamsignId: RED, heldIndex: 0, choiceIndex: 0, earnedSeq: source.earnedSeq, offeredDreamsignId: MASK }, { seq: 31 });
    const screen = state.journey.screen; if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap") throw new Error("Missing earned type choice");
    const continuation = structuredClone(screen.choice.continuation);
    expect(continuation).toMatchObject({ type: "journeyPurge", choice: { ...earned, index: 1 } });
    state = accepted(state, "LOAD_STATE", { snapshot: JSON.parse(JSON.stringify(state.journey)) });
    state = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state));
    expect(state.journey.screen).toEqual(continuation); expect(state.battle).toBeNull();
    for (const expectedKind of ["purge", "transfiguration", "duplication", "dreamsign"]) {
      const choice = afterBattleChoice(state.journey.screen)!;
      const next = choice.sources[choice.index]; expect(next.kind ?? "purge").toBe(expectedKind);
      const common = { siteId: choice.siteId, dreamsignId: next.dreamsignId, heldIndex: next.heldIndex, choiceIndex: choice.index, ...("earnedSeq" in next ? { earnedSeq: next.earnedSeq } : {}) };
      if (next.kind === "dreamsign") state = accepted(state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { ...common, offeredDreamsignId: null });
      else if (next.kind === "duplication") state = accepted(state, "RESOLVE_JOURNEY_DUPLICATION", { ...common, entryId: null });
      else state = accepted(state, next.kind === "transfiguration" ? "RESOLVE_JOURNEY_TRANSFIGURATION" : "RESOLVE_JOURNEY_PURGE", { ...common, entryIds: [] });
    }
    expect(state.journey.screen.type).toBe(final ? "journeyComplete" : "atlas"); expect(state.journey.typeRemap).toBe("Mage");
  });

  it("holding, loading and copying a source do not create acquisition choices", () => {
    let state = initial([MASK]);
    state = accepted(state, "LOAD_STATE", { snapshot: structuredClone(state.journey) });
    expect(state.journey.screen.type).toBe("journeyStart");
    state = accepted(state, "ADD_DREAMSIGN", { dreamsignId: DOLL });
    if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "copy") throw new Error("missing copy");
    const copy = state.journey.screen.choice;
    state = accepted(state, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: copy.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: MASK });
    expect(state.journey.dreamsigns.map(sign => sign.id)).toEqual([MASK, MASK]); expect(state.journey.typeRemap).toBeUndefined();
  });

  it("refuses unavailable choice content without committing the acquisition", () => {
    const state = initial(); registerJourneyTypeRemapProvider(null);
    const config = { ...GAME_ENGINE_CONFIG, genesisState: () => state, reducer: (before: typeof state, intent: ReturnType<typeof event>, context: ReturnType<typeof ctx>) => apply(before, intent.type as "ADD_DREAMSIGN", intent.payload, context) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("alice"), devMode: false, now: () => ctx().timestamp });
    const outcomes: unknown[] = []; log.subscribe(row => outcomes.push(row));
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: MASK } }); expect(log.state()).toEqual(state); expect(outcomes[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    install(); log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: MASK } }); expect(choicePayload(log.state())).toMatchObject({ sourceDreamsignId: MASK });
  });

  it("round-trips the actual compacted codec and rejects forged scalar, source order and foreign-node site", () => {
    const state = accepted(initial(), "ADD_DREAMSIGN", { dreamsignId: MASK });
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state))).toEqual(state);
    const screen = state.journey.screen; if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap") throw new Error("missing choice");
    const siteState = stateWithSites([makeSite("Augury")]);
    const ownNode = siteState.journey.currentDreamscape!;
    const foreignNode = parseAtlasNodeId("remap-foreign-node");
    const candidate = { ...siteState.journey, atlas: { ...siteState.journey.atlas, nodes: { ...siteState.journey.atlas.nodes, [foreignNode]: { ...siteState.journey.atlas.nodes[ownNode], id: foreignNode, sites: [] } } }, currentDreamscape: foreignNode, screen: { ...screen, choice: { ...screen.choice, continuation: { type: "site", siteId: makeSite("Augury").id } } } };
    for (const journey of [{ ...state.journey, typeRemap: "Unknown" }, { ...state.journey, screen: { ...screen, choice: { ...screen.choice, sources: [screen.choice.sources[0], screen.choice.sources[0]] } } }, candidate]) {
      expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify({ ...state, journey }))).toThrow();
      expect(apply(state, "LOAD_STATE", { snapshot: journey }).state).toBe(state);
    }
    const complete = accepted(state, "RESOLVE_TYPE_REMAP", choicePayload(state));
    expect(GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(complete))).toEqual(complete);
  });

  it("rejects inconsistent null versus nested suspended bindings in the actual codec", () => {
    const state = accepted(initial(), "ADD_DREAMSIGN", { dreamsignId: MASK });
    const screen = state.journey.screen; if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap") throw new Error("missing choice");
    const teeth = parseDreamsignId("1328e611-fa2f-426f-87e2-97f26c061866");
    const continuation = { type: "journeyStarterPurge", choice: { kind: "starterPurge", sources: [{ dreamsignId: teeth, heldIndex: 0, maxCount: 4, entries: [] }], index: 0, permissionSeq: 10, continuation: { type: "journeyStart" }, suspendedBattle: null } };
    const pending = { ...state, journey: { ...state.journey, screen: { ...screen, choice: { ...screen.choice, continuation } } } };
    expect(GAME_ENGINE_CONFIG.decode(JSON.stringify(pending))).toEqual(pending);
    const forged = { ...pending, journey: { ...pending.journey, screen: { ...screen, choice: { ...screen.choice, continuation: { ...continuation, choice: { ...continuation.choice, suspendedBattle: { mode: "tutorial", battleId: parseBattleId("remap-forged") } } } } } } };
    expect(() => GAME_ENGINE_CONFIG.decode(JSON.stringify(forged))).toThrow();
    expect(apply(state, "LOAD_STATE", { snapshot: forged.journey }).state).toBe(state);
  });

  it("replays the real local event stream with completed and pending state intact", () => {
    const start = initial(), config = { ...GAME_ENGINE_CONFIG, genesisState: () => start, reducer: (state: typeof start, intent: ReturnType<typeof event>, context: ReturnType<typeof ctx>) => apply(state, intent.type as "ADD_DREAMSIGN", intent.payload, context) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("alice"), devMode: false, now: () => ctx().timestamp });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: MASK } });
    log.append({ type: "RESOLVE_TYPE_REMAP", payload: choicePayload(log.state()) });
    const replayed = foldEvents(config, GENESIS, { seq: 0, state: start }, [...log.events()], { devMode: false });
    expect(replayed.state).toEqual(log.state()); expect(replayed.state.journey.typeRemap).toBe("Mage");
  });

  it("resolves a restored earned choice while the actual suspended battle owes a prompt", () => {
    const world = battleWorld({ held: [], discard: true }); install();
    const paused = accepted(world.state, "ADD_DREAMSIGN", { dreamsignId: MASK });
    const card = world.state.battle!.engine.slice.committed.sides.player.hand[0];
    let played = accepted(world.state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    for (let n = 0; n < 4 && pendingEnginePrompt(played.battle, world.engine) === null; n++) {
      const side = world.engine.decision(played.battle!.engine.slice.committed)?.side;
      if (side === undefined) throw new Error("No public decision before prompt");
      played = accepted(played, "BATTLE_ACTION", { side, action: { kind: "pass" } });
    }
    const prompt = pendingEnginePrompt(played.battle, world.engine); expect(prompt).not.toBeNull();
    const restored = accepted(paused, "LOAD_STATE", { snapshot: structuredClone(paused.journey), battle: structuredClone(played.battle) });
    expect(apply(restored, "BATTLE_CANCEL", { side: "player", promptId: prompt!.prompt.id }).state).toBe(restored);
    const complete = accepted(restored, "RESOLVE_TYPE_REMAP", choicePayload(restored));
    expect(complete.battle).toBe(restored.battle); expect(pendingEnginePrompt(complete.battle, world.engine)?.prompt.id).toBe(prompt!.prompt.id);
  });

  it.each([false, true])("preserves a live battle through choice and reload, tutorial=%s", tutorial => {
    const world = tutorial ? null : battleWorld({ held: [], discard: true });
    const before = tutorial ? tutorialBattle() : world!.state; install();
    let state = accepted(before, "ADD_DREAMSIGN", { dreamsignId: MASK });
    expect(state.battle).toBe(before.battle); const payload = choicePayload(state);
    state = accepted(state, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) });
    const engineBefore = structuredClone(state.battle);
    expect(apply(state, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } }).state).toBe(state);
    state = accepted(state, "RESOLVE_TYPE_REMAP", payload);
    expect(state.battle).toEqual(engineBefore); expect(state.journey.screen).toEqual(before.journey.screen);
    if (world !== null) expect(pendingEnginePrompt(state.battle, world.engine)).toEqual(pendingEnginePrompt(before.battle, world.engine));
  });
});
