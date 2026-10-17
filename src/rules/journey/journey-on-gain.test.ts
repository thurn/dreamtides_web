import "./journey-subtype.contracts";
import "./journey-subtype-persistence.contracts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { RAT, DOLL, RED, apply, initial, clear, beginBattle, registry, RAVEN, TOME, sign } from "./journey-on-gain-fixtures";
import { makeEntry, makeSite, SITE_ID, stateWithSites } from "./sites-fixtures";
import { testSiteContentProvider } from "./test-content-providers";
import { registerSiteContentProvider } from "./sites";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { parseCardSubtype } from "../../types/card-identity";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testExplorationActionId } from "../../types/test-identities";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { SELECTION_RULES_VERSION } from "../../reward-selection";
import type { GameEventType } from "../events";
import type { ExplorationSiteRuntime } from "../../types/journey";
import { journeyBattleOf } from "../battle/fold";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { FIXTURE_ENGINE } from "../replay/fixture-providers";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { reduceGameEvent } from "../reducer";
import { registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "../battle/tutorial-lifecycle";
import { engine as tutorialEngine, CARDS, prefixSetup, prefixActions, init as tutorialInit, display } from "../battle/tutorial-contracts-fixture";
import { genesisFoldState } from "../fold-state";
import { parseBattleId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import { GENESIS, ctx, event } from "./lifecycle-fixtures";
import type { EngineConfig } from "../../eventlog/types";
import type { FoldState } from "../fold-state";
afterEach(clear);
describe("journey acquisition public contracts", () => {
  it("transforms two original entries on a five-card Rat acquisition", () => {
    const before = initial([RED]), result = apply(before, "ADD_DREAMSIGN", { dreamsignId: RAT });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck.filter((entry) => entry.transfiguration !== null)).toHaveLength(2);
    expect(before.journey.deck.every((entry) => entry.transfiguration === null)).toBe(true);
  });
  it("prepares a durable physical Doll target choice", () => {
    const before = initial([RED]), result = apply(before, "ADD_DREAMSIGN", { dreamsignId: DOLL });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "copy", index: 0 } });
    expect(result.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([RED, DOLL]);
  });
  it("rejects a nonexistent replacement without effects", () => {
    const before = initial([RED]), result = apply(before, "ADD_DREAMSIGN", { dreamsignId: RAT, purgeIndex: 999 });
    expect(result.state).toBe(before); expect(result.logRecords).toBeUndefined();
  });
  it.each([[RAVEN, TOME], [TOME, RAVEN]])("excludes prohibited additions before Rat, with held sources %s/%s", (...held) => {
    initial();
    const oldDeck = [1, 2, 3].map((n) => makeEntry({ entryId: parseDeckEntryId(`survivor-${n}`), cardNumber: n }));
    const denied = makeEntry({ entryId: parseDeckEntryId("denied-nightmare"), cardNumber: 99, isBane: true });
    registerJourneyTransfigurationProvider({ resolve: (entry) => ({ cardId: entry.cardNumber === 99 ? NIGHTMARE_CARD_ID : testCardId(`survivor-${entry.cardNumber}`), cardType: "Event", subtype: parseCardSubtype(""), forms: entry.transfiguration === null ? ["Enduring"] : [] }) });
    const runtime: ExplorationSiteRuntime = { kind: "exploration", encounterCardId: testCardId("compound-gain"), selectionRulesVersion: SELECTION_RULES_VERSION, actionOffers: [], resolution: null };
    const before = stateWithSites([makeSite("Exploration")], { deck: oldDeck, dreamsigns: held.map(sign), screen: { type: "site", siteId: SITE_ID }, siteRuntime: { [SITE_ID]: runtime } });
    const snapshot = structuredClone(before), rng = vi.fn(() => 0);
    registerSiteContentProvider(testSiteContentProvider({ resolveExploration: ({ journey }) => ({ purges: [], journey: { ...journey, dreamsigns: [...journey.dreamsigns, sign(RAT)], deck: [...journey.deck, denied], siteRuntime: { ...journey.siteRuntime, [SITE_ID]: { ...runtime, resolution: { actionId: testExplorationActionId("compound-rat"), gainedCardIds: [NIGHTMARE_CARD_ID], gainedEntryIds: [denied.entryId], gainedDreamsignIds: [RAT], purgedCardIds: [], affectedEntryIds: [], essenceGained: 0, nightmareGains: [{ entryId: denied.entryId, cardId: NIGHTMARE_CARD_ID }] } } } } }) }));
    const result = apply(before, "RESOLVE_EXPLORATION_CHOICE", { siteId: SITE_ID }, { rng });
    expect(result.outcome).toBe("applied");
    expect(before).toEqual(snapshot);
    expect(result.state.journey.deck).toHaveLength(4);
    expect(result.state.journey.deck.some((entry) => entry.cardNumber === 99)).toBe(false);
    expect(rng).toHaveBeenCalledTimes(2);
    const records = result.logRecords ?? [];
    expect(records.map((row) => row.fields.dreamsignId)).toEqual([RAVEN, RAT, TOME]);
    expect(records[1].fields).toMatchObject({ before: { deckSize: 3, eligible: 3 }, after: { requested: 1, transformed: 1 }, eligibleEntryIds: oldDeck.map((entry) => entry.entryId), transformations: [{ entryId: oldDeck[0].entryId, cardId: testCardId("survivor-1"), targetDrawIndex: 0, formDrawIndex: 1 }] });
    expect(records[0].fields.target).toMatchObject({ prevented: [{ entryId: denied.entryId, cardId: NIGHTMARE_CARD_ID, dreamsignId: RAVEN, heldIndex: held.indexOf(RAVEN) }] });
    expect(records[2].fields.target).toMatchObject({ copies: [{ fromEntryId: oldDeck[0].entryId, cardId: testCardId("survivor-1") }] });
  });

  it("applies same-UUID replacement acquisition once while conversion supplies no acquisition", () => {
    const before = initial([RAT, RED]);
    const replacement = apply(before, "ADD_DREAMSIGN", { dreamsignId: RAT, purgeIndex: 0 });
    expect(replacement.outcome).toBe("applied");
    expect(replacement.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([RAT, RED]);
    expect(replacement.logRecords?.filter((row) => row.fields.hook === "on_dreamsign_gain")).toHaveLength(1);
    expect(replacement.state.journey.deck.filter((entry) => entry.transfiguration !== null)).toHaveLength(2);
    const pending = apply(initial([RAT]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing copy permission");
    const choice = pending.journey.screen.choice, source = choice.sources[choice.index];
    const result = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RAT });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.dreamsigns).toEqual([sign(RAT), sign(RAT)]);
    expect(result.state.journey.deck).toEqual(pending.journey.deck);
    expect(result.logRecords?.filter((row) => row.fields.hook === "on_dreamsign_gain")).toHaveLength(0);
  });
  it("converts to another same-UUID physical record without adding a slot", () => {
    const before = initial([DOLL]);
    before.journey.dreamsigns[0] = { ...sign(DOLL), imageName: "synthetic-record.png", effectDescription: "record payload" };
    const pending = apply(before, "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing copy permission");
    const choice = pending.journey.screen.choice;
    const result = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: choice.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: DOLL });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.dreamsigns).toEqual([before.journey.dreamsigns[0], before.journey.dreamsigns[0]]);
    expect(result.state.journey.screen).toEqual(before.journey.screen);
  });
  it("records a limited no-target Doll without creating a permission", () => {
    const before = initial(), result = apply(before, "ADD_DREAMSIGN", { dreamsignId: DOLL });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.screen).toEqual(before.journey.screen);
    expect(result.logRecords?.[0].fields).toMatchObject({ dreamsignId: DOLL, heldIndex: 0, targetCount: 0, choicePrepared: false });
  });
  it("preserves the durable copy through reload and rejects malformed and stale intentions atomically", () => {
    const pending = apply(initial([RED]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing copy permission");
    const choice = pending.journey.screen.choice, rng = vi.fn(() => 0);
    const payload = { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: choice.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED };
    const restored = apply(pending, "LOAD_STATE", { snapshot: structuredClone(pending.journey) });
    expect(restored.outcome).toBe("applied"); expect(restored.state.journey.screen).toEqual(pending.journey.screen); expect(restored.state.journey.dreamsigns).toEqual(pending.journey.dreamsigns);
    for (const invalid of [{ ...payload, targetHeldIndex: 999, expectedTargetDreamsignId: undefined }, { ...payload, expectedTargetDreamsignId: undefined }, { ...payload, targetHeldIndex: 1, expectedTargetDreamsignId: DOLL }, { ...payload, expectedTargetDreamsignId: RAT }, { ...payload, permissionSeq: choice.permissionSeq + 1 }]) {
      const result = apply(pending, "RESOLVE_DREAMSIGN_COPY", invalid, { rng });
      expect(result.state).toBe(pending); expect(result.logRecords).toBeUndefined();
    }
    for (const [type, body] of [["ADD_DREAMSIGN", { dreamsignId: RAT }], ["REMOVE_DREAMSIGN", { dreamsignId: RED }], ["BATTLE_DEBUG", {}], ["ADD_CARD", { cardId: testCardId("denied-during-copy") }]] as [GameEventType, Record<string, unknown>][]) expect(apply(pending, type, body, { rng }).state).toBe(pending);
    const completed = apply(pending, "RESOLVE_DREAMSIGN_COPY", payload);
    expect(completed.outcome).toBe("applied"); expect(apply(completed.state, "RESOLVE_DREAMSIGN_COPY", payload, { rng }).state).toBe(completed.state);
    expect(rng).not.toHaveBeenCalled();
    expect(apply(pending, "RESOLVE_DREAMSIGN_COPY", payload).state).toEqual(completed.state);
  });
  it("rejects forged saved target holdings, source order and continuation purposes", () => {
    const pending = apply(initial([RED]), "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("missing copy permission");
    const choice = pending.journey.screen.choice;
    for (const patch of [{ heldIds: [RED] }, { sources: [{ dreamsignId: DOLL, heldIndex: 9 }] }, { sources: [{ dreamsignId: DOLL, heldIndex: 1 }, { dreamsignId: DOLL, heldIndex: 1 }] }, { continuation: { type: "journeyPurge" } }, { continuation: { type: "journeyTransfiguration", choice: {} } }, { continuation: { type: "journeyDreamsign", choice: { kind: "copy" } } }]) {
      expect(apply(pending, "LOAD_STATE", { snapshot: { ...pending.journey, screen: { ...pending.journey.screen, choice: { ...choice, ...patch } } } }).state).toBe(pending);
    }
    expect(apply(pending, "LOAD_STATE", { snapshot: { ...pending.journey, dreamsigns: [sign(DOLL)], screen: { ...pending.journey.screen, choice: { ...choice, sources: [{ dreamsignId: DOLL, heldIndex: 0 }], heldIds: [DOLL] } } } }).state).toBe(pending);
  });
  it.each([0, 1, 3, 4])("limits Rat to floor of total %i while preserving formed identities and modifiers", (count) => {
    const before = initial(); before.journey.deck = before.journey.deck.slice(0, count);
    if (count > 1) before.journey.deck[0] = { ...before.journey.deck[0], transfiguration: "Enduring", sparkBonus: 4, keywordModification: { fast: true } };
    const rng = vi.fn(() => 0), result = apply(before, "ADD_DREAMSIGN", { dreamsignId: RAT }, { rng });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck.map((entry) => entry.entryId)).toEqual(before.journey.deck.map((entry) => entry.entryId));
    if (count > 1) expect(result.state.journey.deck[0]).toEqual(before.journey.deck[0]);
    expect(result.logRecords?.[0].fields.after).toMatchObject({ requested: Math.floor(count / 2), transformed: Math.floor(count / 2) });
    expect(rng).toHaveBeenCalledTimes(Math.floor(count / 2) * 2);
  });

  it("suspends a real battle unchanged and resolves a restored copy with a pending prompt", () => {
    const before = beginBattle([RED]), battleSnapshot = structuredClone(before.battle);
    const acquired = apply(before, "ADD_DREAMSIGN", { dreamsignId: DOLL }); expect(acquired.outcome).toBe("applied");
    const suspended = acquired.state;
    expect(suspended.battle).toBe(before.battle); expect(suspended.battle).toEqual(battleSnapshot);
    if (suspended.journey.screen.type !== "journeyDreamsign" || suspended.journey.screen.choice.kind !== "copy") throw new Error("missing copy");
    const copy = suspended.journey.screen.choice;
    const card = journeyBattleOf(before.battle)!.engine.slice.committed.sides.player.hand[0];
    const played = apply(before, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } }); expect(played.outcome).toBe("applied");
    expect(pendingEnginePrompt(played.state.battle, FIXTURE_ENGINE)).not.toBeNull();
    expect(apply(played.state, "ADD_DREAMSIGN", { dreamsignId: DOLL }).state).toBe(played.state);
    const restored = apply(suspended, "LOAD_STATE", { snapshot: structuredClone(suspended.journey), battle: structuredClone(played.state.battle) }); expect(restored.outcome).toBe("applied");
    const promptId = pendingEnginePrompt(restored.state.battle, FIXTURE_ENGINE)!.prompt.id;
    expect(apply(restored.state, "BATTLE_ANSWER", { side: "player", promptId, value: 1 }).state).toBe(restored.state);
    expect(apply(restored.state, "BATTLE_CANCEL", { side: "player", promptId }).state).toBe(restored.state);
    const payload = { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: copy.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED };
    expect(apply(restored.state, "RESOLVE_DREAMSIGN_COPY", { ...payload, targetHeldIndex: 999 }).state).toBe(restored.state);
    const resolved = apply(restored.state, "RESOLVE_DREAMSIGN_COPY", payload); expect(resolved.outcome).toBe("applied");
    expect(resolved.state.battle).toBe(restored.state.battle); expect(resolved.state.battle).toEqual(played.state.battle);
    expect(resolved.state.journey.screen).toEqual(before.journey.screen);
    expect(apply(suspended, "LOAD_STATE", { snapshot: structuredClone(suspended.journey) }).state).toBe(suspended);
  });
  it.each(["null", "throw"])("contains Rat content %s before partial writes and retries/replays the same event once", (failure) => {
    const initialState = initial([RED]), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initialState, reducer: (state, intent, context) => reduceGameEvent(state, intent, context, registry) };
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve: (entry) => { if (fail && entry.cardNumber === 3) { if (failure === "throw") throw new Error("synthetic unavailable form"); return null; } return { cardId: testCardId(`atomic-${entry.cardNumber}`), cardType: "Event", subtype: parseCardSubtype(""), forms: entry.transfiguration === null ? ["Enduring"] : [] }; } });
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_DREAMSIGN", {}).actor, now: () => ctx().timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe((record) => records.push(record));
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: RAT } });
    expect(log.state()).toEqual(initialState);
    expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" }); expect(records[0].logRecords).toBeUndefined(); expect(log.events()).toHaveLength(1);
    fail = false;
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: RAT } });
    expect(log.state().journey.deck.filter((entry) => entry.transfiguration !== null)).toHaveLength(2);
    expect(log.state().journey.dreamsigns.map((sign) => sign.id)).toEqual([RED, RAT]);
    expect(foldEvents(config, GENESIS, { seq: 1, state: initialState }, log.events().filter(({ seq }) => seq > 1)).state).toEqual(log.state());
  });

  it("pairs a real public tutorial battle copy with its front-door identity on reload and continuation", () => {
    initial();
    registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("copy-tutorial-avatar") });
    registerTutorialBattleInitProvider({ engine: tutorialEngine, overrides: [], beginTutorialPrefix: () => prefixSetup(), beginTutorialBattle: (input) => ({ init: { ...display(), battleId: parseBattleId(`copy-tutorial:${input.tutorialRunId}`) }, engineInit: tutorialInit("player", CARDS.strong) }) });
    let state = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    const prefix = apply(state, "BEGIN_TUTORIAL", { actions: prefixActions, startAtEnd: true }); expect(prefix.outcome).toBe("applied"); state = prefix.state;
    const live = apply(state, "BEGIN_TUTORIAL_BATTLE", { tutorialRunId: state.frontDoor.tutorial!.runId }); expect(live.outcome).toBe("applied"); state = live.state;
    state = apply(state, "ADD_DREAMSIGN", { dreamsignId: RED }).state;
    const original = state;
    const acquired = apply(state, "ADD_DREAMSIGN", { dreamsignId: DOLL }); expect(acquired.outcome).toBe("applied"); state = acquired.state;
    expect(state.battle).toBe(original.battle); expect(state.frontDoor).toBe(original.frontDoor);
    if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "copy") throw new Error("missing tutorial copy");
    const copy = state.journey.screen.choice;
    const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }); expect(loaded.outcome).toBe("applied");
    const wrongPhase = { ...state, frontDoor: { ...state.frontDoor, phase: "journey" as const } };
    expect(apply(wrongPhase, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }).state).toBe(wrongPhase);
    const resolved = apply(loaded.state, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: DOLL, heldIndex: 1, choiceIndex: 0, permissionSeq: copy.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: RED }); expect(resolved.outcome).toBe("applied");
    expect(resolved.state.battle).toBe(loaded.state.battle); expect(resolved.state.journey.screen).toEqual(original.journey.screen); expect(resolved.state.frontDoor).toEqual(original.frontDoor);
  });

});
