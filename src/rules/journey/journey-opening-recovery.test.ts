import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { testEventActor } from "../../types/test-identities";
import { parseDeckEntryId, parseDreamsignId, parseBattleId, parseAtlasNodeId } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import { layerAtOrdinal } from "../../types/layer-name";
import type { JourneyState } from "../../types/journey";
import { makeBattleTestState, makeBattleTestSite } from "../../battle/test-support";
import { appendAfterBattleSource } from "./journey-after-battle";
import { journeyModifierRegistry } from "./modifier-registry";
import { battleWorld, tutorialBattle } from "./journey-rewards272-fixtures";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import herbs from "../../content/dreamsigns/twisted-herbs-1cd25b9a";
import jellyfish from "../../content/dreamsigns/rainbow-jellyfish-e7d23bf7";
import { pendingEnginePrompt } from "../battle/engine-battle";
import { REGISTERED_MUG as MUG, TOAD, MASK, OTHER, openingSign, openingContent, openingEntry,
  productionOpeningInitial, openingApply, openingAccepted, openingPayload, openingTypePayload, openingBundle, ctx, GENESIS } from "./journey-battle-init-fixtures";

afterEach(clearGameProviders);
const codec = (state: FoldState) => GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(state));
function replaceResume(state: FoldState, patch: Record<string, unknown>): FoldState {
  const screen = state.journey.screen;
  if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
  return { ...state, journey: { ...state.journey, screen: { ...screen, choice: { ...screen.choice,
    resume: { ...screen.choice.resume, ...patch } } } } };
}
function refusesSave(state: FoldState, forged: FoldState) {
  expect(openingApply(state, "LOAD_STATE", { snapshot: forged.journey, ...(forged.battle === null ? {} : { battle: forged.battle }) }).state).toBe(state);
  expect(() => codec(forged)).toThrow();
}

describe("opening permission recovery", () => {
  it.each(["LOAD", "codec"])("rejects a paired receipt downgrade at %s ingress", ingress => {
    const pending = openingBundle([MUG, TOAD]).result.state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
    const receipt = pending.journey.screen.choice.resume.openingHandAcquisitions![0];
    expect(receipt.eligibleEntries).toHaveLength(2);
    const forged = replaceResume(pending, { openingHandAcquisitions: [{ ...receipt, outcome: "limited", eligibleEntries: [] }] });
    if (ingress === "LOAD") expect(openingApply(pending, "LOAD_STATE", { snapshot: forged.journey }).state).toBe(pending);
    else expect(() => codec(forged)).toThrow();
  });

  it.each(["LOAD", "codec"])("rejects a proper subset of the earned cohort at %s ingress", ingress => {
    const pending = openingBundle([MUG, TOAD]).result.state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
    const receipt = pending.journey.screen.choice.resume.openingHandAcquisitions![0];
    expect(receipt.eligibleEntries).toHaveLength(2);
    const forged = replaceResume(pending, { openingHandAcquisitions: [{ ...receipt, eligibleEntries: receipt.eligibleEntries.slice(0, 1) }] });
    if (ingress === "LOAD") expect(openingApply(pending, "LOAD_STATE", { snapshot: forged.journey }).state).toBe(pending);
    else expect(() => codec(forged)).toThrow();
  });

  it.each([[MUG, TOAD], [MUG, MASK, TOAD]])("requires every processed earned receipt through public load and production codec: %s/%s", (...ids) => {
    const pending = openingBundle(ids).result.state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected type pause");
    const receipts = pending.journey.screen.choice.resume.openingHandAcquisitions!;
    expect(receipts).toHaveLength(1); expect(receipts[0].outcome).toBe("prepared");
    const loaded = openingAccepted(pending, "LOAD_STATE", { snapshot: codec(pending).journey });
    expect(loaded.journey.screen).toEqual(pending.journey.screen);
    for (const value of [undefined, [], [...receipts, receipts[0]], [{ ...receipts[0], heldIndex: 999 }],
      [{ ...receipts[0], outcome: "limited" }], [{ ...receipts[0], eligibleEntries: [] }],
      [{ ...receipts[0], eligibleEntries: [{ entryId: parseDeckEntryId("absent"), cardId: receipts[0].eligibleEntries[0].cardId }] }],
      [{ ...receipts[0], eligibleEntries: [receipts[0].eligibleEntries[0], receipts[0].eligibleEntries[0]] }]]) {
      refusesSave(pending, replaceResume(pending, { openingHandAcquisitions: value }));
    }
    let state = loaded;
    for (const id of ids) if (id === TOAD || id === MASK) state = openingAccepted(state, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(state));
    expect(state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "openingHand" } });
    state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state));
    expect(state.journey.dreamsigns[0].openingHandEntryId).toBe(state.journey.deck[0].entryId);
  });

  it("accepts an explicit limited receipt before a pause and rejects erasing even that processed occurrence", () => {
    const { before, result } = openingBundle([MUG, TOAD], { deck: [openingEntry("character", 2)] });
    const pending = result.state;
    expect(pending.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "subtype", resume: {
      openingHandAcquisitions: [{ dreamsignId: MUG, heldIndex: 0, outcome: "limited", eligibleEntries: [] }],
    } } });
    const loaded = openingAccepted(pending, "LOAD_STATE", { snapshot: codec(pending).journey });
    refusesSave(pending, replaceResume(pending, { openingHandAcquisitions: [] }));
    const done = openingAccepted(loaded, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(loaded));
    expect(done.journey.screen).toEqual(before.journey.screen);
    expect(done.journey.dreamsigns[0].openingHandEntryId).toBeUndefined();
  });

  it("requires a structurally valid historical basis and the complete ordered canonical cohort", () => {
    const pending = openingBundle([MUG, TOAD]).result.state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
    const receipt = pending.journey.screen.choice.resume.openingHandAcquisitions![0];
    for (const deckAtAcquisition of [undefined, null, {}, [receipt.deckAtAcquisition[0], receipt.deckAtAcquisition[0]],
      [{ ...receipt.deckAtAcquisition[0], entryId: "" }], [{ ...receipt.deckAtAcquisition[0], cardNumber: 999999 }]]) {
      refusesSave(pending, replaceResume(pending, { openingHandAcquisitions: [{ ...receipt, deckAtAcquisition }] }));
    }
    const missing: Record<string, unknown> = { ...receipt };
    delete missing.deckAtAcquisition;
    refusesSave(pending, replaceResume(pending, { openingHandAcquisitions: [missing] }));
    refusesSave(pending, replaceResume(pending, { openingHandAcquisitions: [{ ...receipt, eligibleEntries: [...receipt.eligibleEntries].reverse() }] }));
  });

  it.each([false, true])("keeps source-time eligibility when Nightmare Events are acquired before or after Mug: earlier=%s", earlier => {
    const HERBS = parseDreamsignId(herbs.id);
    const ids = earlier ? [HERBS, MUG, TOAD] : [MUG, HERBS, TOAD];
    const { before, result } = openingBundle(ids, { deck: [openingEntry("original-character", 2)] }, [
      makeAuguryTestCard({ id: NIGHTMARE_CARD_ID, cardNumber: 3, cardType: "Event", spark: null }),
    ]);
    const pending = result.state;
    expect(result.outcome).toBe("applied");
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
    const receipt = pending.journey.screen.choice.resume.openingHandAcquisitions![0];
    expect(receipt.outcome).toBe(earlier ? "prepared" : "limited");
    const initialIds = new Set(before.journey.deck.map(entry => entry.entryId));
    const added = pending.journey.deck.filter(entry => !initialIds.has(entry.entryId));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every(entry => entry.cardNumber === 3)).toBe(true);
    expect(receipt.eligibleEntries).toEqual(earlier ? added.map(entry => ({ entryId: entry.entryId, cardId: NIGHTMARE_CARD_ID })) : []);
    expect(receipt.deckAtAcquisition.map(entry => entry.entryId)).toEqual((earlier ? pending.journey.deck : before.journey.deck).map(entry => entry.entryId));
    expect(pending.journey.deck.filter(entry => initialIds.has(entry.entryId))).toEqual(before.journey.deck);
    const loaded = openingAccepted(pending, "LOAD_STATE", { snapshot: codec(pending).journey });
    let done = openingAccepted(loaded, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(loaded));
    if (earlier) done = openingAccepted(done, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(done, receipt.eligibleEntries[0].entryId));
    expect(done.journey.screen).toEqual(before.journey.screen);
    expect(done.journey.dreamsigns[earlier ? 1 : 0].openingHandEntryId).toBe(earlier ? receipt.eligibleEntries[0].entryId : undefined);
  });

  it("retains an acquisition basis through later starter forms and actual subtype changes", () => {
    const JELLYFISH = parseDreamsignId(jellyfish.id);
    const pending = openingBundle([MUG, JELLYFISH, TOAD, MASK]).result.state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "subtype") throw new Error("Expected subtype pause");
    const receipt = pending.journey.screen.choice.resume.openingHandAcquisitions![0];
    expect(receipt.deckAtAcquisition.every(entry => entry.transfiguration === null)).toBe(true);
    expect(pending.journey.deck.some(entry => entry.transfiguration !== null)).toBe(true);
    const savedBasis = structuredClone(receipt.deckAtAcquisition);
    let state = openingAccepted(pending, "LOAD_STATE", { snapshot: codec(pending).journey });
    state = openingAccepted(state, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(state));
    if (state.journey.screen.type !== "journeyDreamsign" || state.journey.screen.choice.kind !== "subtype") throw new Error("Expected C12 pause");
    expect(state.journey.screen.choice.resume.openingHandAcquisitions![0].deckAtAcquisition).toEqual(savedBasis);
    expect(state.journey.deck.some(entry => entry.typeChange !== undefined)).toBe(true);
    state = openingAccepted(state, "LOAD_STATE", { snapshot: codec(state).journey });
    state = openingAccepted(state, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(state));
    const done = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state, receipt.eligibleEntries[0].entryId));
    expect(done.journey.dreamsigns[0].openingHandEntryId).toBe(receipt.eligibleEntries[0].entryId);
  });

  it("refuses malformed bindings, cursor roles, source basis, target identities and conflicting or repeated confirmations", () => {
    const pending = openingAccepted(productionOpeningInitial({ dreamsigns: [openingSign(OTHER)] }), "ADD_DREAMSIGN", { dreamsignId: MUG });
    const payload = openingPayload(pending), screen = pending.journey.screen;
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "openingHand") throw new Error("Expected permission");
    for (const patch of [{ permissionSeq: payload.permissionSeq + 1 }, { heldIndex: 0 }, { dreamsignId: OTHER }, { choiceIndex: 1 },
      { entryId: parseDeckEntryId("missing") }, { entryId: pending.journey.deck[2].entryId }, { entryId: null }]) {
      expect(openingApply(pending, "RESOLVE_OPENING_HAND_ENTRY", { ...payload, ...patch }).state).toBe(pending);
    }
    for (const intervening of ["unknown" as const, [{ seq: 1, actor: testEventActor("partner"), type: "ADD_DREAMSIGN" as const }]]) {
      expect(openingApply(pending, "RESOLVE_OPENING_HAND_ENTRY", payload, { intervening }).state).toBe(pending);
    }
    for (const patch of [{ kind: "copy" }, { heldIds: [MUG] }, { sources: [{ dreamsignId: MUG, heldIndex: 99 }] },
      { continuation: { type: "site", siteId: "absent" } }, { suspendedBattle: { battleId: "wrong", mode: "journey" } }]) {
      refusesSave(pending, { ...pending, journey: { ...pending.journey, screen: { ...screen, choice: { ...screen.choice, ...patch } } } } as FoldState);
    }
    const done = openingAccepted(pending, "RESOLVE_OPENING_HAND_ENTRY", payload);
    expect(openingApply(done, "RESOLVE_OPENING_HAND_ENTRY", payload).state).toBe(done);
    for (const openingHandEntryId of [null, 7, ""]) {
      refusesSave(done, { ...done, journey: { ...done.journey, dreamsigns: [{ ...openingSign(MUG), openingHandEntryId }] } } as unknown as FoldState);
    }
    expect(openingApply(done, "LOAD_STATE", { snapshot: { ...done.journey, dreamsigns: [{ ...openingSign(MUG), openingHandEntryId: undefined }] } }).state).toBe(done);
    const purged = { ...done, journey: { ...done.journey, deck: done.journey.deck.filter(entry => entry.entryId !== payload.entryId) } };
    expect(codec(purged).journey.dreamsigns[1].openingHandEntryId).toBe(payload.entryId);
  });

  it.each(["null", "throw"])("contains unavailable canonical content on acquisition and replays only the later valid retry: %s", failure => {
    const before = productionOpeningInitial(), provider = createJourneyTransfigurationProvider(openingContent());
    let fail = true;
    registerJourneyTransfigurationProvider({ resolve(entry) {
      if (fail && entry.cardNumber === 2) { if (failure === "throw") throw new Error("Synthetic unavailable canonical card"); return null; }
      return provider.resolve(entry);
    } });
    const config = { ...GAME_ENGINE_CONFIG, genesisState: () => before };
    const log = createLocalLog({ config, genesis: GENESIS, localActor: testEventActor("alice"), now: () => ctx().timestamp, devMode: false });
    const records: LocalLogRecord<FoldState>[] = []; log.subscribe(record => records.push(record));
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: MUG } });
    expect(log.state()).toEqual(before); expect(records[0]).toMatchObject({ outcome: "bounced", bounceReason: "fold_error" });
    expect(records[0].logRecords).toBeUndefined();
    fail = false;
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: MUG } });
    const pending = log.state();
    log.append({ type: "RESOLVE_OPENING_HAND_ENTRY", payload: openingPayload(pending) });
    expect(log.state().journey.dreamsigns[0].openingHandEntryId).toBe(before.journey.deck[0].entryId);
    expect(foldEvents(config, GENESIS, { seq: 1, state: before }, log.events().filter(row => row.seq > 1)).state).toEqual(log.state());
    const suffix = log.events().filter(row => row.seq > 2);
    expect(foldEvents(config, GENESIS, { seq: 2, state: codec(pending) }, suffix).state).toEqual(log.state());
  });

  it("keeps a suspended normal battle and its actual pending prompt immutable through load and resolution", () => {
    const world = battleWorld({ held: [], discard: true }), opening = productionOpeningInitial();
    const before = { ...world.state, journey: { ...world.state.journey, deck: opening.journey.deck, dreamsigns: [] } };
    const pending = openingAccepted(before, "ADD_DREAMSIGN", { dreamsignId: MUG });
    const card = before.battle!.engine.slice.committed.sides.player.hand[0];
    let played = openingAccepted(before, "BATTLE_ACTION", { side: "player", action: { kind: "play", card, from: "hand" } });
    for (let n = 0; n < 4 && pendingEnginePrompt(played.battle, world.engine) === null; n++) {
      const side = world.engine.decision(played.battle!.engine.slice.committed)?.side;
      if (side === undefined) throw new Error("Expected public decision before prompt");
      played = openingAccepted(played, "BATTLE_ACTION", { side, action: { kind: "pass" } });
    }
    expect(pendingEnginePrompt(played.battle, world.engine)).not.toBeNull();
    const loaded = openingAccepted(pending, "LOAD_STATE", { snapshot: pending.journey, battle: played.battle });
    const payload = openingPayload(loaded);
    expect(openingApply(loaded, "RESOLVE_OPENING_HAND_ENTRY", payload, { intervening: "unknown" }).state).toBe(loaded);
    expect(openingApply(loaded, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } }).state).toBe(loaded);
    const resolved = openingAccepted(loaded, "RESOLVE_OPENING_HAND_ENTRY", payload);
    expect(resolved.battle).toBe(loaded.battle); expect(resolved.battle).toEqual(played.battle);
    expect(resolved.journey.screen).toEqual(before.journey.screen);
    expect(() => codec(loaded)).not.toThrow();
  });

  it("pairs a tutorial opening permission with its actual run and refuses a foreign front door at codec ingress", () => {
    const tutorial = tutorialBattle(), opening = productionOpeningInitial();
    const before = { ...tutorial, journey: { ...tutorial.journey, deck: opening.journey.deck, dreamsigns: [] } };
    const pending = openingAccepted(before, "ADD_DREAMSIGN", { dreamsignId: MUG });
    const loaded = openingAccepted(pending, "LOAD_STATE", { snapshot: codec(pending).journey, battle: pending.battle });
    const done = openingAccepted(loaded, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(loaded));
    expect(done.battle).toBe(loaded.battle); expect(done.journey.screen).toEqual(before.journey.screen);
    expect(() => codec({ ...pending, frontDoor: { ...pending.frontDoor, phase: "journey" } })).toThrow();
  });
  // Synthetic earned worlds exercise public source/terminal contracts; no played battle is claimed.
  it.each(["victory", "final", "defeat", "draw"] as const)("preserves a Mug accepted from an earned offer through the exact %s terminal", outcome => {
    const red = parseDreamsignId("7e8c86cc-788f-4648-be84-e0935c40c31e"), parts = makeBattleTestState(), siteId = makeBattleTestSite().id;
    const effect = journeyModifierRegistry.lookup(red)?.journeyOnGain;
    if (effect?.kind !== "afterBattleDreamsignChoice") throw new Error("Expected registered earned-offer source");
    const base = productionOpeningInitial(), loss = outcome === "defeat" || outcome === "draw";
    const returnTo = loss ? "journeyFailed" : outcome === "final" ? "journeyComplete" : "atlas";
    const current = parts.atlas.nodes[parts.currentDreamscape!], frontierId = parseAtlasNodeId("opening-earned-frontier");
    const completed = { ...current, state: loss ? "available" as const : "completed" as const,
      sites: current.sites.map(site => ({ ...site, isVisited: true })) };
    const frontier = { ...current, id: frontierId, layer: layerAtOrdinal(1)!, state: "available" as const, sites: [] };
    const atlas = { ...parts.atlas, nodes: outcome === "final" ? { [current.id]: completed } : { [current.id]: completed, [frontierId]: frontier },
      layers: outcome === "final" ? [[current.id]] : [[current.id], [frontierId]] };
    let journey: JourneyState = { ...base.journey, atlas, currentDreamscape: loss ? parts.currentDreamscape : null,
      completionLevel: loss ? 0 : 1, screen: { type: returnTo }, maxDreamsigns: 3,
      dreamsigns: [openingSign(red), openingSign(red)], failureSummary: loss ? {
        battleId: parseBattleId(`opening-earned-${outcome}`), result: outcome === "defeat" ? "defeat" : "draw", reason: outcome === "defeat" ? "score_target_reached" : "turn_limit_reached", siteId,
        siteLabel: "Synthetic", nodeIdOrNone: parts.currentDreamscape, turnNumber: 1, playerScore: 0, enemyScore: outcome === "defeat" ? 1 : 0,
      } : null };
    for (const heldIndex of [0, 1]) {
      const earned = appendAfterBattleSource(journey, siteId, { kind: "dreamsign", dreamsignId: red, heldIndex,
        earnedSeq: 17, offerCount: effect.offerCount, offeredDreamsigns: heldIndex === 0 ? [openingSign(MUG)] : [], remainingPoolIds: [] });
      if (earned === null) throw new Error("Expected public earned source construction");
      journey = earned;
    }
    const before = { ...base, journey }, first = journey.screen;
    if (first.type !== "journeyDreamsign" || first.choice.kind !== "afterBattle") throw new Error("Expected earned offer");
    const accepted = openingAccepted(before, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId, dreamsignId: red,
      heldIndex: 0, choiceIndex: 0, earnedSeq: 17, offeredDreamsignId: MUG }, { seq: 30 });
    if (accepted.journey.screen.type !== "journeyDreamsign" || accepted.journey.screen.choice.kind !== "openingHand") throw new Error("Expected acquired Mug permission");
    const continuation = accepted.journey.screen.choice.continuation;
    expect(continuation).toEqual({ type: "journeyDreamsign", choice: { ...first.choice, index: 1 } });
    const restored = openingAccepted(accepted, "LOAD_STATE", { snapshot: codec(accepted).journey }, { seq: 31 });
    const selected = openingPayload(restored), resolved = openingAccepted(restored, "RESOLVE_OPENING_HAND_ENTRY", selected, { seq: 32 });
    expect(resolved.journey.screen).toEqual(continuation);
    const done = openingAccepted(resolved, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId, dreamsignId: red,
      heldIndex: 1, choiceIndex: 1, earnedSeq: 17, offeredDreamsignId: null }, { seq: 33 });
    expect(done.journey.screen).toEqual({ type: returnTo });
    expect(done.journey.failureSummary).toEqual(before.journey.failureSummary);
    expect(done.journey.dreamsigns[2].openingHandEntryId).toBe(selected.entryId);
    expect(codec(done).journey.screen).toEqual({ type: returnTo });
  });

});
