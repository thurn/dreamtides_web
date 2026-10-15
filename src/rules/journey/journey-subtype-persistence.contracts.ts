import { registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "../battle/tutorial-lifecycle";
import { engine as tutorialEngine, CARDS, prefixSetup, prefixActions, init as tutorialInit, display } from "../battle/tutorial-contracts-fixture";
import { genesisFoldState } from "../fold-state";
import { parseBattleId } from "../../types/identifiers";
import { testCardId, testAvatarId } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { setup, apply, intent, clear, TOAD, MASK, sign, registry } from "./journey-subtype.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { assertJourneySubtypeCheckpoint } from "./journey-subtype";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GENESIS, ctx, event } from "./lifecycle-fixtures";
import { reduceGameEvent } from "../reducer";
import type { EngineConfig } from "../../eventlog/types";
import type { FoldState } from "../fold-state";
import toad from "../../content/dreamsigns/toad-8e2d26a8";
import mirror from "../../content/dreamsigns/cracked-mirror-1cf06f9b";
import { parseDreamsignId } from "../../types/identifiers";
import { LayerName } from "../../types/layer-name";
import { cardSlot, dreamsignSlot, shopState, SITE_ID } from "./shop-fixtures";
import { validShopReplenishmentRuntime } from "./journey-shop";
import type { JourneyDreamsignSubtypeChoice, ShopSiteRuntime } from "../../types/journey";

const purchasedToad = parseDreamsignId(toad.id), heldMirror = parseDreamsignId(mirror.id);
function shopAcquisition(prior: "none" | "card" | "dreamsign" = "none", revisions = false) {
  const synthetic = setup([heldMirror]);
  const priorSlots = prior === "none" ? [] : [prior === "card" ? cardSlot({ cardNumber: 1, transfiguration: "Kindled" }) : dreamsignSlot("subtype-prior")];
  const initial = shopState([...priorSlots, { itemType: "dreamsign", dreamsign: sign(purchasedToad), basePrice: 100, discountPercent: 0, purchased: false }, cardSlot({ cardNumber: 2 })],
    { deck: synthetic.journey.deck, dreamsigns: synthetic.journey.dreamsigns, essence: 1000 });
  initial.journey.atlas.nodes[initial.journey.currentDreamscape!].layer = LayerName.One;
  let state = initial;
  const buy = (slotIndex: number, seq: number) => {
    const result = reduceGameEvent(state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex,
      ...(revisions ? { expectedOffer: { purchaseCount: slotIndex, rerollCount: 0 } } : {}) }), ctx({ seq }));
    expect(result.outcome).toBe("applied"); state = result.state;
  };
  if (prior !== "none") buy(0, 8);
  buy(priorSlots.length, 10);
  if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "subtype") throw new Error("Missing purchased subtype permission");
  return { initial, pending: state, choice: state.journey.screen.choice, nextCardSlot: priorSlots.length + 1 };
}
function replaceHistoricalShop(pending: FoldState, patch: Record<string, unknown>) {
  if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Missing purchased subtype permission");
  const choice = pending.journey.screen.choice, before = choice.resume.before;
  return { ...pending, journey: { ...pending.journey, screen: { ...pending.journey.screen,
    choice: { ...choice, resume: { ...choice.resume, before: { ...before, siteRuntime: { ...before.siteRuntime,
      [SITE_ID]: { ...before.siteRuntime[SITE_ID], ...patch } } } } } } } };
}
function historicalShop(choice: JourneyDreamsignSubtypeChoice): ShopSiteRuntime {
  const runtime = choice.resume.before.siteRuntime[SITE_ID];
  if (runtime?.kind !== "shop") throw new Error("Missing historical shop");
  return runtime;
}
afterEach(clear);
describe("saved journey subtype acquisition", () => {
  it.each(["none", "card", "dreamsign"] as const)("restores a purchased subtype with %s prior history and preserves the purchase observer", prior => {
    const { initial, pending, choice, nextCardSlot } = shopAcquisition(prior), current = pending.journey.siteRuntime;
    expect(validShopReplenishmentRuntime(current[SITE_ID])).toBe(true);
    expect(historicalShop(choice).purchaseHistory).toHaveLength(prior === "none" ? 0 : 1);
    expect(historicalShop(choice).purchaseHistory.every(receipt => receipt.expectedOffer === undefined && receipt.slotReplacement === undefined)).toBe(true);
    const loaded = reduceGameEvent(pending, event("LOAD_STATE", { snapshot: structuredClone(pending.journey) }), ctx());
    expect(loaded.outcome).toBe("applied");
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(pending));
    expect(decoded).toEqual(pending); expect(GAME_ENGINE_CONFIG.hash(decoded)).toBe(GAME_ENGINE_CONFIG.hash(pending));
    for (const restored of [loaded.state, decoded]) {
      const resolved = reduceGameEvent(restored, event("RESOLVE_JOURNEY_SUBTYPE", intent(restored)), ctx({ seq: 11 }));
      expect(resolved.outcome).toBe("applied"); expect(resolved.state.journey.screen).toEqual(initial.journey.screen);
      expect(resolved.state.journey.siteRuntime).toEqual(current); expect(resolved.state.journey.essence).toBe(pending.journey.essence);
      expect(resolved.state.journey.deck.map(entry => entry.entryId)).toEqual(pending.journey.deck.map(entry => entry.entryId));
      expect(resolved.state.journey.deck.filter(entry => entry.cardNumber !== 3).every(entry => entry.typeChange?.subtype === "Mage")).toBe(true);
      expect(reduceGameEvent(resolved.state, event("RESOLVE_JOURNEY_SUBTYPE", intent(restored)), ctx({ seq: 12 })).state).toBe(resolved.state);
      const bought = reduceGameEvent(resolved.state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: nextCardSlot }), ctx({ seq: 13 }));
      expect(bought.outcome).toBe("applied"); expect(bought.state.journey.deck).toHaveLength(resolved.state.journey.deck.length + (prior === "card" ? 1 : 2));
    }
  });
  it("restores historical shop receipts with optional offer provenance", () => {
    const { initial, pending } = shopAcquisition("dreamsign", true);
    const loaded = reduceGameEvent(pending, event("LOAD_STATE", { snapshot: structuredClone(pending.journey) }), ctx());
    expect(loaded.outcome).toBe("applied");
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(pending));
    for (const restored of [loaded.state, decoded]) {
      const resolved = reduceGameEvent(restored, event("RESOLVE_JOURNEY_SUBTYPE", intent(restored)), ctx({ seq: 11 }));
      expect(resolved.outcome).toBe("applied"); expect(resolved.state.journey.screen).toEqual(initial.journey.screen);
    }
  });
  it.each<[string, Record<string, unknown>]>([
    ["missing history", { purchaseHistory: undefined }], ["null history", { purchaseHistory: null }],
    ["object history", { purchaseHistory: {} }], ["string history", { purchaseHistory: "history" }],
    ...[null, 7, {}, { item: null }, { item: [] }, { item: {} }, { item: { kind: "other" } }].map((receipt, n): [string, Record<string, unknown>] => [`malformed receipt ${n}`, { purchaseHistory: [receipt] }]),
    ["invalid optional provenance", { purchaseHistory: [{ item: { kind: "dreamsign" }, expectedOffer: { purchaseCount: 8, rerollCount: 0 } }] }],
  ])("rejects historical shop %s at both persisted intakes", (_label, patch) => {
    const { pending } = shopAcquisition("dreamsign"), current = pending.journey.siteRuntime;
    const bad = replaceHistoricalShop(pending, patch);
    expect(bad.journey.siteRuntime).toBe(current); expect(validShopReplenishmentRuntime(current[SITE_ID])).toBe(true);
    const loaded = reduceGameEvent(pending, event("LOAD_STATE", { snapshot: bad.journey }), ctx());
    expect.soft(loaded.outcome).toBe("bounced"); expect.soft(loaded.state).toBe(pending);
    expect.soft(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(bad))).toThrow();
  });
  it.each<[string, Record<string, unknown>]>([
    ["missing slots", { slots: undefined }], ["object slots", { slots: {} }], ["null slot", { slots: [null] }],
    ["missing reroll count", { rerollCount: undefined }], ["negative reroll count", { rerollCount: -1 }], ["fractional reroll count", { rerollCount: 0.5 }],
    ...[{ purchased: null }, { basePrice: null }, { basePrice: -1 }, { discountPercent: "0" }, { discountPercent: 101 },
      { dreamsign: null }, { dreamsign: { id: "invalid" } }, { itemType: "other" }].map((slot, n): [string, Record<string, unknown>] => [`malformed dreamsign slot ${n}`, { slots: [{ ...dreamsignSlot("historical-valid"), ...slot }] }]),
    ...[{ cardNumber: "1" }, { cardNumber: -1 }, { transfiguration: null }, { transfiguration: "other" }].map((slot, n): [string, Record<string, unknown>] => [`malformed card slot ${n}`, { slots: [{ ...cardSlot(), ...slot }] }]),
  ])("rejects historical consumed shop field %s without altering the current shop", (_label, patch) => {
    const { pending } = shopAcquisition(), current = pending.journey.siteRuntime, bad = replaceHistoricalShop(pending, patch);
    expect(bad.journey.siteRuntime).toBe(current); expect(validShopReplenishmentRuntime(current[SITE_ID])).toBe(true);
    expect(reduceGameEvent(pending, event("LOAD_STATE", { snapshot: bad.journey }), ctx()).state).toBe(pending);
    expect(() => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(bad))).toThrow();
  });
  it("preserves ordinary C12 and nonshop subtype continuation through reload", () => {
    const ordinary = setup(), remap = apply(ordinary, "ADD_DREAMSIGN", { dreamsignId: MASK });
    expect(remap.outcome).toBe("applied");
    const loadedRemap = apply(remap.state, "LOAD_STATE", { snapshot: structuredClone(remap.state.journey) }); expect(loadedRemap.outcome).toBe("applied");
    if (loadedRemap.state.journey.screen.type !== "journeyDreamsign" || loadedRemap.state.journey.screen.choice.kind !== "typeRemap") throw new Error("Missing ordinary C12 choice");
    const choice = loadedRemap.state.journey.screen.choice, source = choice.sources[choice.index];
    const remapped = apply(loadedRemap.state, "RESOLVE_TYPE_REMAP", { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, permissionSeq: choice.permissionSeq, chosenSubtype: "Mage" });
    expect(remapped.outcome).toBe("applied"); expect(remapped.state.journey.screen).toEqual(ordinary.journey.screen); expect(remapped.state.journey.typeRemap).toBe("Mage");
    const nonshop = setup(); nonshop.journey.siteRuntime[SITE_ID] = { kind: "essence", amount: 40, accepted: true };
    const pending = apply(nonshop, "ADD_DREAMSIGN", { dreamsignId: TOAD }).state;
    const loaded = apply(pending, "LOAD_STATE", { snapshot: structuredClone(pending.journey) }); expect(loaded.outcome).toBe("applied");
    const resolved = apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)); expect(resolved.outcome).toBe("applied");
    expect(resolved.state.journey.screen).toEqual(nonshop.journey.screen); expect(resolved.state.journey.siteRuntime).toEqual(nonshop.journey.siteRuntime);
  });
  it("pairs a public tutorial battle acquisition with its front-door identity and continuation", () => {
    setup();
    registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("subtype-tutorial") });
    registerTutorialBattleInitProvider({ engine: tutorialEngine, overrides: [], beginTutorialPrefix: () => prefixSetup(), beginTutorialBattle: input => ({ init: { ...display(), battleId: parseBattleId(`subtype-tutorial:${input.tutorialRunId}`) }, engineInit: tutorialInit("player", CARDS.strong) }) });
    let state = genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" });
    state = apply(state, "BEGIN_TUTORIAL", { actions: prefixActions, startAtEnd: true }).state;
    state = apply(state, "BEGIN_TUTORIAL_BATTLE", { tutorialRunId: state.frontDoor.tutorial!.runId }).state;
    expect(state.battle?.mode.kind).toBe("tutorial");
    const original = state, acquired = apply(state, "ADD_DREAMSIGN", { dreamsignId: TOAD }); expect(acquired.outcome).toBe("applied"); state = acquired.state;
    const loaded = apply(state, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }); expect(loaded.outcome).toBe("applied");
    const wrong = { ...state, frontDoor: { ...state.frontDoor, phase: "journey" as const } };
    expect(apply(wrong, "LOAD_STATE", { snapshot: structuredClone(state.journey), battle: structuredClone(state.battle) }).state).toBe(wrong);
    const done = apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)); expect(done.outcome).toBe("applied");
    expect(done.state.battle).toBe(loaded.state.battle); expect(done.state.frontDoor).toEqual(original.frontDoor); expect(done.state.journey.screen).toEqual(original.journey.screen);
  });
  it("reloads an earned cohort and reproduces a durable event fold and hash", () => {
    const initial = setup(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, action, context) => reduceGameEvent(state, action, context, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_DREAMSIGN", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: TOAD } });
    const pending = log.state(), loaded = apply(pending, "LOAD_STATE", { snapshot: structuredClone(pending.journey) }); expect(loaded.outcome).toBe("applied");
    log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) });
    const replay = foldEvents(config, GENESIS, { seq: 0, state: initial }, [...log.events()]);
    expect(replay.state).toEqual(log.state()); expect(config.hash(replay.state)).toBe(config.hash(log.state()));
    expect(apply(loaded.state, "RESOLVE_JOURNEY_SUBTYPE", intent(loaded.state)).state.journey.deck).toEqual(log.state().journey.deck);
  });
  it("round-trips the production registered role through the canonical checkpoint codec", () => {
    const state = setup(), id = parseDreamsignId(toad.id);
    const result = reduceGameEvent(state, event("ADD_DREAMSIGN", { dreamsignId: id }), ctx()); expect(result.outcome).toBe("applied");
    const decoded = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(result.state)); expect(decoded).toEqual(result.state); expect(GAME_ENGINE_CONFIG.hash(decoded)).toBe(GAME_ENGINE_CONFIG.hash(result.state));
  });
  it("rejects malformed saved roles at LOAD and checkpoint intake", () => {
    const pending = apply(setup(), "ADD_DREAMSIGN", { dreamsignId: TOAD }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Missing permission");
    const choice = pending.journey.screen.choice;
    const transformed = { entry: { ...pending.journey.deck[0], transfiguration: "Kindled" }, cardId: testCardId(`subtype-card-${pending.journey.deck[0].cardNumber}`), cardType: "Character" };
    const patches: Record<string, unknown>[] = [
      { resume: { ...choice.resume, transfigurations: [transformed, transformed] } },
      { resume: { ...choice.resume, copySources: [choice.resume.sources[0]] } },
      { resume: { ...choice.resume, starterSources: [{ ...choice.resume.sources[0], maxCount: 1, entries: [] }] } },
      ...[{ keywordModification: "invalid" }, { keywordModification: { fast: 1 } }, { keywordModification: { reclaim: "invalid" } }, { statOverride: null }, { statOverride: { spark: "invalid" } }].map(patch => ({ resume: { ...choice.resume, before: { ...choice.resume.before, deck: [{ ...pending.journey.deck[0], ...patch }] } } })),
      { current: { kind: "other" } }, { current: { kind: "deckSubtype", entries: [] } }, { current: { kind: "deckSubtype", entries: [{ entryId: "invalid", cardId: "invalid" }] } },
      { resume: { ...choice.resume, sourceIndex: 999 } }, { resume: { ...choice.resume, sources: [...choice.resume.sources, choice.resume.sources[0]] } },
      { resume: { ...choice.resume, observerSources: [{ ...choice.resume.observerSources[0], heldIndex: 8 }] } },
      { resume: { ...choice.resume, before: {} } }, { resume: { ...choice.resume, before: { ...choice.resume.before, essence: null } } },
      ...["attemptedEntries", "purges", "transfigurations", "starterSources", "copySources"].map(key => ({ resume: { ...choice.resume, [key]: [{}] } })),
      { resume: { ...choice.resume, eventType: "LOAD_STATE" } }, { continuation: { type: "journeyDreamsign", choice: {} } },
      { suspendedBattle: { battleId: "unknown", mode: "journey" } },
    ];
    for (const patch of patches) {
      const bad = { ...pending, journey: { ...pending.journey, screen: { type: "journeyDreamsign", choice: { ...choice, ...patch } } } };
      expect(apply(pending, "LOAD_STATE", { snapshot: bad.journey }).state).toBe(pending);
      expect(() => assertJourneySubtypeCheckpoint(bad, registry)).toThrow();
    }
  });
  it("contains unavailable content before any partial write and resumes the same permission on retry", () => {
    const initial = setup(), config: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => initial, reducer: (state, action, context) => reduceGameEvent(state, action, context, registry) };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: event("ADD_DREAMSIGN", {}).actor, now: () => ctx().timestamp, devMode: false });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: TOAD } }); const pending = log.state();
    const rows: LocalLogRecord<FoldState>[] = []; log.subscribe(row => rows.push(row));
    clear(); log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) }); expect(log.state()).toEqual(pending);
    setup(); log.append({ type: "RESOLVE_JOURNEY_SUBTYPE", payload: intent(pending) }); expect(log.state().journey.screen.type).toBe("journeyStart");
    expect(rows[0].outcome).toBe("bounced"); expect(rows[0].logRecords).toBeUndefined();
  });
});
