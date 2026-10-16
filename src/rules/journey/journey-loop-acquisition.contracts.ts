import { parseDeckEntryId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { createSiteContentProvider } from "../../session/providers/site-provider";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { registerJourneyTransfigurationProvider, journeyTransfiguration, journeyLoopTransfiguration } from "./journey-transfiguration";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { registerSiteContentProvider } from "./sites";
import { registerJourneyTypeRemapProvider } from "./journey-type-remap";
import { journeyOnGain } from "./journey-on-gain";
import { parseCardSubtype } from "../../types/card-identity";
import { testDreamsignId } from "../../types/test-identities";
import { apply, CARD_ID, ENTRY_ID, LOOP, EXTRA, loopDefinition, resolveWindow, TOME, WINDOW, TAIL } from "./journey-loop.fixtures";
import { endLoopBattle, liveLoopBattle, preventedLoopCopies } from "./journey-loop-integration.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";

const RED = testDreamsignId("loop-earned-red"), INCOMING = testDreamsignId("loop-earned-incoming");
function earned(kind: "copy" | "starter" | "remap" | "subtype", replace = false) {
  const f = liveLoopBattle("victory", false, { cardType: "Event", held: [LOOP, WINDOW, RED, TOME] });
  const base = { ...f.base, isStarter: kind === "starter" }, content = { ...f.content,
    cardDatabase: new Map([[base.cardNumber, base], [f.neighbor.cardNumber, f.neighbor]]),
    dreamsignTemplates: [LOOP, WINDOW, RED, TOME, INCOMING].map(id => ({ id, name: "Synthetic", effectDescription: "", imageName: "synthetic.png" })) };
  const provider = createJourneyTransfigurationProvider(content); registerJourneyTransfigurationProvider(provider);
  registerJourneyTypeRemapProvider([parseCardSubtype("Warrior")]);
  registerSiteContentProvider(createSiteContentProvider(content));
  const registry = createJourneyModifierRegistry([loopDefinition(provider), journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
    journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 1 }), journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 1 }),
    journeyOnGain(INCOMING, kind === "copy" ? { kind: "copyOwnedDreamsignOnGain" } : kind === "starter" ? { kind: "purgeStarterOnGain", maxCount: 1 } : kind === "remap" ? { kind: "typeRemapOnGain" } : { kind: "deckSubtypeOnGain" })]);
  const configured = { ...f, base, content, provider, registry, state: { ...f.state, journey: { ...f.state.journey, remainingDreamsignPool: [INCOMING] } } };
  const ended = endLoopBattle(configured, "victory"), transformed = resolveWindow(configured, ended, [ENTRY_ID], { seq: 41 });
  if (transformed.outcome !== "applied" || transformed.state.journey.screen.type !== "journeyDreamsign" || transformed.state.journey.screen.choice.kind !== "afterBattle") throw new Error("Actual earned Dreamsign window missing");
  const choice = transformed.state.journey.screen.choice, source = choice.sources[choice.index];
  if (source.kind !== "dreamsign") throw new Error("Wrong actual earned role");
  const acquired = apply(configured, transformed.state, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: choice.index, earnedSeq: source.earnedSeq, offeredDreamsignId: INCOMING, ...(replace ? { purgeIndex: 0 } : {}) }, { seq: 42 });
  if (acquired.outcome !== "applied") throw new Error("Actual earned acquisition refused");
  return { ...configured, state: acquired.state, prefix: ended.journey };
}
describe("journey loop actual earned acquisition prefix", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each([false, true])("completes actual copy replacement before its child, original replaced=%s", replace => {
    const f = earned("copy", replace), choice = f.state.journey.screen;
    expect(choice).toMatchObject({ type: "journeyDreamsign", choice: { kind: "copy", permissionSeq: 42 } });
    expect(f.state.journey).toHaveProperty("pendingJourneyLoop"); expect(f.state.journey).not.toHaveProperty("journeyDraw");
    if (choice.type !== "journeyDreamsign" || choice.choice.kind !== "copy") throw new Error("copy fixture");
    const saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(f.state));
    const targetHeldIndex = replace ? 3 : 0, source = choice.choice.sources[0];
    const out = apply(f, saved, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: INCOMING, heldIndex: source.heldIndex, choiceIndex: 0, permissionSeq: 42, targetHeldIndex, expectedTargetDreamsignId: replace ? TOME : LOOP }, { seq: 43 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(f.prefix.essence);
    if (replace) {
      expect(out.state.journey).not.toHaveProperty("journeyDraw"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
      expect(out.state.journey.deck[0].transfigurationApplications).toHaveLength(2);
      expect(out.state.journey.deck).toHaveLength(5); // Root copy, then one copy per currently held Tome.
      expect(out.logRecords?.find(row => row.event === "journey_loop_finite_application")?.fields).toMatchObject({ parentCause: { eventSeq: 41, cardId: CARD_ID }, drawIndex: 0 });
    } else {
      expect(out.state.journey.journeyDraw?.continuingSources).toEqual([{ dreamsignId: LOOP, heldIndex: 0 }, { dreamsignId: LOOP, heldIndex: 4 }]);
      expect(out.state.journey.journeyDraw?.earnedSource).toEqual({ dreamsignId: LOOP, heldIndex: 0 });
      expect(out.state.journey.deck).toHaveLength(3);
    }
  });
  it("honors a real starter permission that purges the original before its child", () => {
    const f = earned("starter"), screen = f.state.journey.screen;
    expect(screen.type).toBe("journeyStarterPurge"); if (screen.type !== "journeyStarterPurge") throw new Error("starter fixture");
    expect(screen.choice.sources[0].entries).toContainEqual({ entryId: ENTRY_ID, cardId: CARD_ID });
    const out = apply(f, f.state, "RESOLVE_STARTER_PURGE", { dreamsignId: INCOMING, heldIndex: screen.choice.sources[0].heldIndex, choiceIndex: 0, permissionSeq: 42, entryIds: [ENTRY_ID] }, { seq: 43 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.some(entry => entry.entryId === ENTRY_ID)).toBe(false);
    expect(out.state.journey).not.toHaveProperty("journeyDraw"); expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
  });
  it("commits a real type-remap choice before the journey draw", () => {
    const f = earned("remap"), screen = f.state.journey.screen;
    expect(screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "typeRemap" } });
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "typeRemap") throw new Error("remap fixture");
    const out = apply(f, f.state, "RESOLVE_TYPE_REMAP", { sourceDreamsignId: INCOMING, heldIndex: screen.choice.sources[0].heldIndex, choiceIndex: 0, permissionSeq: 42, chosenSubtype: parseCardSubtype("Warrior") }, { seq: 43 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.typeRemap).toBe(parseCardSubtype("Warrior")); expect(out.state.journey).toHaveProperty("journeyDraw.result", "draw");
  });
  it("retains actual operation witnesses when a later earned Rat acquisition transfigures another original", () => {
    const f = liveLoopBattle("victory", true, { cardType: "Event", held: [LOOP, WINDOW, RED, TAIL] });
    const content = { ...f.content, dreamsignTemplates: [LOOP, WINDOW, RED, TAIL, INCOMING].map(id => ({ id, name: "Synthetic", effectDescription: "", imageName: "synthetic.png" })) };
    registerSiteContentProvider(createSiteContentProvider(content));
    const registry = createJourneyModifierRegistry([loopDefinition(f.provider), journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 1 }),
      journeyTransfiguration(TAIL, { kind: "afterBattleTransfiguration", maxCount: 1 }), journeyOnGain(RED, { kind: "afterBattleDreamsignChoice", offerCount: 1 }),
      journeyOnGain(INCOMING, { kind: "randomTransfigurationOnGain", numerator: 1, denominator: 1 })]);
    const secondId = parseDeckEntryId("loop-later-rat-original"), configured = { ...f, registry, state: { ...f.state, journey: { ...f.state.journey,
      deck: [...f.state.journey.deck, { ...f.state.journey.deck[0], entryId: secondId }], remainingDreamsignPool: [INCOMING] } } };
    const ended = endLoopBattle(configured, "victory"), first = resolveWindow(configured, ended, [ENTRY_ID], { seq: 41 }).state;
    const choice = first.journey.screen;
    if (choice.type !== "journeyDreamsign" || choice.choice.kind !== "afterBattle") throw new Error("Actual later Dreamsign window missing");
    const source = choice.choice.sources[choice.choice.index]; if (source.kind !== "dreamsign") throw new Error("Actual Dreamsign source missing");
    const acquired = apply(configured, first, "RESOLVE_AFTER_BATTLE_DREAMSIGN", { siteId: choice.choice.siteId, dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
      choiceIndex: choice.choice.index, earnedSeq: source.earnedSeq, offeredDreamsignId: INCOMING }, { seq: 42, rng: () => 0 });
    expect(acquired.outcome).toBe("applied"); expect(acquired.state.journey.screen.type).toBe("journeyTransfiguration");
    const pending = acquired.state.journey.pendingJourneyLoop!;
    expect(pending.instructions.map(item => [item.permissionSeq, item.cause.eventSeq, item.cause.entryId])).toEqual([[41, 41, ENTRY_ID], [42, 42, secondId]]);
    expect(pending.observerSources).toHaveLength(4); expect(pending.instructions[1].sourceObserverSources).toHaveLength(5);
    const saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(acquired.state));
    const loaded = apply(configured, acquired.state, "LOAD_STATE", { snapshot: saved.journey }, { seq: 43 }); expect(loaded.outcome).toBe("applied");
    const removed = apply(configured, loaded.state, "REMOVE_DREAMSIGN", { dreamsignId: LOOP }, { seq: 44 });
    const final = resolveWindow(configured, removed.state, [], { seq: 45, rng: () => 0 });
    expect(final.outcome).toBe("applied"); expect(final.logRecords?.filter(record => record.event === "journey_loop_finite_application")).toHaveLength(2);
    for (const id of [ENTRY_ID, secondId]) expect(final.state.journey.deck.find(entry => entry.entryId === id)?.transfigurationApplications).toHaveLength(2);
    expect(final.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(final.state.journey).not.toHaveProperty("journeyDraw");
  });
  it.each([EXTRA, LOOP])("visits mixed-UUID children in causal order after source loss %s", lost => {
    const f = liveLoopBattle("victory", true, { cardType: "Event", held: [LOOP, EXTRA, TOME, WINDOW, TAIL] });
    const second = journeyLoopTransfiguration(EXTRA, f.provider, f.neighbor.id); if (!second.ok) throw new Error("Actual second canonical source refused");
    const registry = createJourneyModifierRegistry([loopDefinition(f.provider), second.definition, journeyTransfiguration(TOME, { kind: "copyTransfiguredEvent" }),
      journeyTransfiguration(WINDOW, { kind: "afterBattleTransfiguration", maxCount: 2 }), journeyTransfiguration(TAIL, { kind: "afterBattleTransfiguration", maxCount: 1 })]);
    const configured = { ...f, registry }, ended = endLoopBattle(configured, "victory"), neighborId = f.state.journey.deck[1].entryId;
    const root = resolveWindow(configured, ended, [ENTRY_ID, neighborId], { seq: 41, rng: () => 0 });
    expect(root.outcome).toBe("applied"); expect(root.state.journey.deck).toHaveLength(4);
    expect(root.state.journey.pendingJourneyLoop?.instructions.map(item => item.cause.cardId)).toEqual([CARD_ID, f.neighbor.id]);
    const removed = apply(configured, root.state, "REMOVE_DREAMSIGN", { dreamsignId: lost }, { seq: 42 }), draws: number[] = [];
    const out = resolveWindow(configured, removed.state, [], { seq: 43, rng: index => { draws.push(index); return 0; } });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.journeyDraw?.cause.cardId).toBe(lost === EXTRA ? CARD_ID : f.neighbor.id);
    expect(out.state.journey.essence).toBe(ended.journey.essence); expect(out.state.journey.completionLevel).toBe(ended.journey.completionLevel);
    expect(out.state.journey.deck.find(entry => entry.entryId === neighborId)?.transfigurationApplications).toHaveLength(1);
    expect(out.state.journey.deck.find(entry => entry.entryId === ENTRY_ID)?.transfigurationApplications).toHaveLength(lost === EXTRA ? 1 : 2);
    expect(out.state.journey.deck).toHaveLength(lost === EXTRA ? 4 : 5); expect(draws).toEqual(lost === EXTRA ? [] : [0]);
    expect((out.logRecords ?? []).filter(record => record.event === "journey_loop_finite_application")).toHaveLength(lost === EXTRA ? 0 : 1);
    expect(out.state.journey.journeyDraw?.abandonedBattle).toBeNull();
  });
  it("keeps prevented physical copy attempts reserved across multiple finite child Tomes", () => {
    const f = preventedLoopCopies(), first = resolveWindow(f, f.state, [ENTRY_ID], { seq: 41 });
    expect(first.outcome).toBe("applied"); expect(first.state.journey.deck).toHaveLength(2);
    const removed = apply(f, first.state, "REMOVE_DREAMSIGN", { dreamsignId: LOOP }, { seq: 42 });
    const out = resolveWindow(f, removed.state, [], { seq: 43 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(2);
    const attempts = (out.logRecords ?? []).flatMap(row => (row.fields.target as { copies?: readonly { entryId: DeckEntryId }[] } | undefined)?.copies ?? []);
    expect(attempts).toHaveLength(2); expect(new Set(attempts.map(attempt => attempt.entryId)).size).toBe(2);
    expect(out.state.journey.deck.every(entry => attempts.every(attempt => attempt.entryId !== entry.entryId))).toBe(true);
    expect(out.state.journey.deck[0].transfigurationApplications).toHaveLength(2);
  });
  it("uses the actual subtype resume consumer with distinct permission and committing sequence", () => {
    const f = earned("subtype"), screen = f.state.journey.screen;
    expect(screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "subtype", permissionSeq: 42 } });
    if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "subtype") throw new Error("subtype fixture");
    const source = screen.choice.resume.sources[screen.choice.resume.sourceIndex];
    const out = apply(f, f.state, "RESOLVE_JOURNEY_SUBTYPE", { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex, choiceIndex: screen.choice.resume.sourceIndex, permissionSeq: 42, chosenSubtype: parseCardSubtype("Warrior") }, { seq: 47 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey).toHaveProperty("journeyDraw.committedSeq", 47);
    expect(out.state.journey.journeyDraw?.cause.eventSeq).toBe(41);
    expect(out.logRecords?.some(row => row.fields.permissionSeq === 42 && row.fields.rngEventSeq === 47)).toBe(true);
  });
});
