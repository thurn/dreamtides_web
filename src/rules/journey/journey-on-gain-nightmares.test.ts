import { afterEach, describe, expect, it } from "vitest";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import type { EngineConfig } from "../../eventlog/types";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { testEventActor } from "../../types/test-identities";
import { registerDeckContentProvider } from "./deck";
import { ctx, GENESIS } from "./lifecycle-fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import type { FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { journeyOnGain } from "./journey-on-gain";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { HERBS, RAVEN, RAT, DOLL, CRYSTAL, TOME, ACORN, WARRIOR, sign, entry, registry, initial, install, apply, compound, clear } from "./journey-nightmares274-fixtures";
import { beginBattle } from "./journey-on-gain-fixtures";

function refusal(before: FoldState) {
  const modifiers = registry();
  const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
    reducer: (state, event, context) => reduceGameEvent(state, event, context, modifiers) };
  const genesis = { ...GENESIS, seed: before.journey.seed };
  const log = createLocalLog({ config: engine, genesis, localActor: testEventActor("nightmare-refusal"), now: () => ctx().timestamp, devMode: false });
  log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: HERBS } });
  expect(log.state()).toBe(before);
  expect(foldEvents(engine, genesis, { seq: 0, state: before }, [...log.events()], { devMode: false }).state).toEqual(before);
}

afterEach(clear);
describe("acquired Nightmare physical-entry contracts", () => {
  it("adds canonical fresh entries and repeats for same-UUID replacement and reacquisition", () => {
    const before = initial(), saved = structuredClone(before);
    const first = apply(before, "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(first.outcome).toBe("applied"); expect(before).toEqual(saved);
    expect(first.state.journey.deck.slice(5)).toEqual(expect.arrayContaining([expect.objectContaining({ cardNumber: 99, isBane: true, transfiguration: null })]));
    expect(first.state.journey.deck).toHaveLength(8);
    const again = apply(first.state, "ADD_DREAMSIGN", { dreamsignId: HERBS, purgeIndex: 0 }, { seq: 11 });
    expect(again.outcome).toBe("applied"); expect(again.state.journey.deck).toHaveLength(11);
    expect(new Set(again.state.journey.deck.map((e) => e.entryId)).size).toBe(11);
    const lost = apply(again.state, "REMOVE_DREAMSIGN", { dreamsignId: HERBS }).state;
    expect(lost.journey.deck).toEqual(again.state.journey.deck);
    expect(apply(lost, "ADD_DREAMSIGN", { dreamsignId: HERBS }, { seq: 12 }).state.journey.deck).toHaveLength(14);
    expect(first.logRecords?.[0].fields).toMatchObject({ dreamsignId: HERBS, heldIndex: 0, hook: "on_dreamsign_gain", cardId: NIGHTMARE_CARD_ID,
      before: { deckSize: 5 }, after: { deckSize: 8, attempted: 3, gained: 3, prevented: 0 } });
    expect(first.state.journey.screen).toEqual(before.journey.screen);
  });

  it("keeps every acquired copy distinct including reserved identities across prevented batches", () => {
    const result = compound(initial(), [HERBS, HERBS]);
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck).toHaveLength(11);
    expect(new Set(result.state.journey.deck.map((e) => e.entryId)).size).toBe(11);
    expect(result.logRecords?.filter((row) => row.fields.dreamsignId === HERBS).map((row) => row.fields.heldIndex)).toEqual([0, 1]);
    const denied = compound(initial([RAVEN]), [HERBS, HERBS]);
    expect(denied.outcome).toBe("applied"); expect(denied.state.journey.deck).toHaveLength(5);
    const attempts = denied.logRecords?.filter((row) => row.fields.dreamsignId === HERBS).flatMap((row) => row.fields.attemptedEntryIds as string[]) ?? [];
    expect(attempts).toHaveLength(6); expect(new Set(attempts).size).toBe(6);
    expect(denied.logRecords?.filter((row) => row.fields.dreamsignId === RAVEN)).toHaveLength(2);
    expect(denied.logRecords?.filter((row) => row.fields.dreamsignId === HERBS).every((row) => (row.fields.after as Record<string, number>).gained === 0)).toBe(true);
  });

  it.each([[HERBS, RAT], [RAT, HERBS]])("filters each acquired batch before later measurements and preserves log order, %s/%s", (...acquired) => {
    const before = initial([RAVEN]); before.journey.deck[0] = entry(0, 99, { isBane: true, sparkBonus: 2 });
    const saved = structuredClone(before), out = compound(before, acquired);
    expect(out.outcome).toBe("applied"); expect(before).toEqual(saved);
    expect(out.state.journey.deck).toHaveLength(5); expect(out.state.journey.deck[0].sparkBonus).toBe(2);
    const rat = out.logRecords?.find((row) => row.fields.dreamsignId === RAT);
    expect(rat?.fields.before).toMatchObject({ deckSize: 5 });
    expect(rat?.fields.after).toMatchObject({ requested: 2, transformed: 2 });
    const sources = out.logRecords?.map((row) => row.fields.dreamsignId);
    expect(sources).toEqual(acquired[0] === RAT ? [RAT, HERBS, RAVEN] : [HERBS, RAVEN, RAT]);
    expect(out.state.journey.essence).toBe(13); expect(out.state.journey.screen).toEqual(before.journey.screen);
  });

  it.each([[HERBS, RAVEN, RAT], [RAT, HERBS, RAVEN]])("uses final holdings for protection gained in the same reward (%j)", (a, b, c) => {
    const out = compound(initial(), [a, b, c]);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(5);
    expect(out.state.journey.deck.some((e) => e.cardNumber === 99)).toBe(false);
    expect(out.logRecords?.find((row) => row.fields.dreamsignId === RAT)?.fields.before).toMatchObject({ deckSize: 5 });
  });

  it.each([[HERBS, RAT, 4], [RAT, HERBS, 2]] as const)("uses actual acquisition order without protection, %s/%s", (a, b, transformed) => {
    const out = compound(initial(), [a, b]);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(8);
    expect(out.state.journey.deck.filter((e) => e.transfiguration !== null)).toHaveLength(transformed);
  });

  it.each([4, 5])("observes surviving acquisition additions in one inclusive threshold batch, old size=%i", (count) => {
    const out = apply(initial([CRYSTAL], count), "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.slice(count).filter((e) => e.transfiguration !== null)).toHaveLength(count === 5 ? 3 : 0);
    const protectedOut = apply(initial([CRYSTAL, RAVEN], count), "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(protectedOut.state.journey.deck).toHaveLength(count);
    expect(protectedOut.logRecords?.filter((row) => row.fields.dreamsignId === CRYSTAL)).toHaveLength(0);
  });

  it("gives domain entries the final acquisition threshold and each later copy its ordinary bonus wave", () => {
    const before = initial([CRYSTAL, ACORN], 4), out = compound(before, [HERBS], [entry(100, 2, { sparkBonus: 1 })]);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck).toHaveLength(8);
    expect(out.state.journey.deck.find((e) => e.cardNumber === 2)).toMatchObject({ transfiguration: "Kindled", sparkBonus: 3 });
    const copied = apply(initial([CRYSTAL, TOME], 5), "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(copied.state.journey.deck).toHaveLength(11);
    expect(copied.state.journey.deck.slice(5).every((e) => e.transfiguration === "Inspired")).toBe(true);
    expect(copied.logRecords?.filter((row) => row.fields.dreamsignId === CRYSTAL)).toHaveLength(1);
    expect(copied.logRecords?.filter((row) => row.fields.dreamsignId === TOME)).toHaveLength(1);
  });

  it("requires canonical content even under protection and preserves atomic refusal", () => {
    for (const held of [[], [RAVEN]]) {
      const before = initial(held), saved = structuredClone(before);
      registerDeckContentProvider({ resolveCardNumber: () => null, resolveDreamsign: sign });
      refusal(before); expect(before).toEqual(saved);
    }
    const before = initial(); registerJourneyTransfigurationProvider(null);
    expect(apply(before, "ADD_DREAMSIGN", { dreamsignId: HERBS }).state.journey.deck).toHaveLength(8);
    const unavailable = initial([RAVEN]); registerJourneyTransfigurationProvider(null);
    refusal(unavailable);
  });

  it("does not treat loading or Doll record conversion as acquisition", () => {
    const before = apply(initial(), "ADD_DREAMSIGN", { dreamsignId: HERBS }).state;
    const loaded = apply(before, "LOAD_STATE", { snapshot: structuredClone(before.journey) });
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey.deck).toEqual(before.journey.deck);
    expect(loaded.logRecords).toBeUndefined();
    const pending = apply(before, "ADD_DREAMSIGN", { dreamsignId: DOLL }).state;
    if (pending.journey.screen.type !== "journeyDreamsign" || pending.journey.screen.choice.kind !== "copy") throw new Error("Missing synthetic copy permission");
    const choice = pending.journey.screen.choice, source = choice.sources[0];
    const result = apply(pending, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
      choiceIndex: choice.index, permissionSeq: choice.permissionSeq, targetHeldIndex: 0, expectedTargetDreamsignId: HERBS });
    expect(result.outcome).toBe("applied"); expect(result.state.journey.deck).toEqual(before.journey.deck);
    expect(result.logRecords?.filter((row) => row.fields.dreamsignId === HERBS)).toHaveLength(0);
  });

  it("rejects stale acquisitions and replays exact physical identities", () => {
    const before = initial(), modifiers = registry();
    const out = apply(before, "ADD_DREAMSIGN", { dreamsignId: HERBS, purgeIndex: 999 }); expect(out.state).toBe(before); expect(out.logRecords).toBeUndefined();
    const engine: EngineConfig<FoldState> = { ...GAME_ENGINE_CONFIG, genesisState: () => before,
      reducer: (state, event, context) => reduceGameEvent(state, event, context, modifiers) };
    const genesis = { ...GENESIS, seed: before.journey.seed };
    const log = createLocalLog({ config: engine, genesis, localActor: testEventActor("nightmare-owner"), now: () => ctx().timestamp });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: HERBS } });
    log.append({ type: "ADD_DREAMSIGN", payload: { dreamsignId: HERBS, purgeIndex: 0 } });
    expect(foldEvents(engine, genesis, { seq: 0, state: before }, [...log.events()]).state).toEqual(log.state());
    expect(new Set(log.state().journey.deck.map((e) => e.entryId)).size).toBe(11);
    expect(log.state().journey.deck.slice(5).every((e) => e.cardNumber === 99)).toBe(true);
  });

  it("preserves an actual live battle and refuses acquisition during an earned copy choice", () => {
    const before = beginBattle([]), snapshot = structuredClone(before.battle);
    install();
    const gained = apply(before, "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(gained.outcome).toBe("applied");
    expect(gained.state.battle).toBe(before.battle); expect(gained.state.battle).toEqual(snapshot);
    expect(gained.state.journey.screen).toEqual(before.journey.screen);
    expect(gained.state.journey.deck).toHaveLength(before.journey.deck.length + 3);
    const pending = apply(gained.state, "ADD_DREAMSIGN", { dreamsignId: DOLL });
    expect(pending.outcome).toBe("applied");
    expect(pending.state.journey.screen.type).toBe("journeyDreamsign");
    const rejected = apply(pending.state, "ADD_DREAMSIGN", { dreamsignId: HERBS });
    expect(rejected.state).toBe(pending.state); expect(rejected.logRecords).toBeUndefined();
    expect(pending.state.battle).toBe(before.battle);
  });

  it("validates catalog counts independently of production tuning", () => {
    for (const count of [0, -1, .5, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => journeyOnGain(HERBS, { kind: "addNightmaresOnGain", count })).toThrow(RangeError);
    const before = initial([ACORN]);
    expect(apply(before, "ADD_CARD", { cardId: WARRIOR }).state.journey.deck.slice(-1)[0]?.sparkBonus).toBe(2);
  });
});
