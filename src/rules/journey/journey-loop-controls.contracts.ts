import { parseCardSubtype } from "../../types/card-identity";
import { afterEach, describe, expect, it } from "vitest";
import { activated, energy } from "../../engine/dsl/builders";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { createLocalLog, type LocalLogRecord } from "../../eventlog/local-log";
import { event } from "./lifecycle-fixtures";
import { accept, apply, CARD_ID, ENTRY_ID, EXTRA, fixture, GENESIS, LOOP, requestLoop, SITE_ID, config } from "./journey-loop.fixtures";
import { createJourneyModifierRegistry } from "./modifier-registry";

describe("journey loop public refusal and atomicity controls", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("leaves a valid ordinary action available without any mandatory source", () => {
    const f = fixture({ held: [] }), out = accept(f);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(23);
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("does not treat administrative loading or transfiguration as a gameplay occurrence", () => {
    const f = fixture(), edited = apply(f, f.state, "TRANSFIGURE_CARD", { entryId: ENTRY_ID, transfiguration: "Kindled" });
    expect(edited.outcome).toBe("applied"); expect(edited.state.journey).not.toHaveProperty("journeyDraw");
    const loaded = apply(f, f.state, "LOAD_STATE", { snapshot: edited.state.journey });
    expect(loaded.outcome).toBe("applied"); expect(loaded.state.journey).not.toHaveProperty("pendingJourneyLoop");
  });
  it("cannot certify a forged descriptor or an arbitrary callback", () => {
    const f = fixture(); let calls = 0;
    const forged = { dreamsignId: LOOP, journeyLoopContinuation: { kind: "mandatoryOriginalTransfiguration" as const, cardId: CARD_ID }, afterJourneyEvent: () => { calls++; return null; } };
    const registry = createJourneyModifierRegistry([forged]);
    const out = accept({ ...f, registry });
    expect(out.outcome).toBe("applied"); expect(calls).toBe(1); expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("refuses an injected source claim independently while preserving an ordinary valid action", () => {
    const source = { id: CARD_ID, cardType: "character" as const, subtype: parseCardSubtype("Warrior"), costs: [energy(6)], spark: 3, speed: "standard" as const,
      status: "vanilla" as const, abilities: () => [], transfigurationState: () => ({ amplified: false, resonant: null }) };
    const f = fixture({ providerSource: [source], unsupported: true });
    expect(requestLoop(f.provider)?.ok ?? false).toBe(false);
    expect(accept(f).outcome).toBe("applied"); expect(accept(f).state.journey).not.toHaveProperty("journeyDraw");
  });
  it("keeps current applicability tied to its captured actual source rather than later caller callback changes", () => {
    let changed = false;
    const f = fixture({ authored: true, abilities: () => changed ? [] : [activated([energy(2)], { op: "draw", count: 1, player: "you" }, { oncePerTurn: true })] });
    const before = f.provider.resolve(f.state.journey.deck[0])?.applicableForms;
    expect(before).toContain("Attuned"); changed = true;
    expect(f.provider.resolve(f.state.journey.deck[0])?.applicableForms).toEqual(before);
    expect(accept(f).state.journey).toHaveProperty("journeyDraw.result", "draw");
  });
  it("contains a later root sibling failure without partially committing a cost, form or terminal diagnostic", () => {
    const f = fixture({ held: [LOOP, EXTRA], definitions: [] });
    const registry = createJourneyModifierRegistry([{ dreamsignId: LOOP, afterJourneyEvent: () => null }, { dreamsignId: EXTRA, afterJourneyEvent: () => { throw new Error("owned later sibling failure"); } }]);
    const log = createLocalLog({ config: config({ ...f, registry }), genesis: GENESIS, localActor: event("ADD_CARD", {}).actor, devMode: false });
    const before = structuredClone(log.state());
    const records: LocalLogRecord<typeof before>[] = [];
    const unsubscribe = log.subscribe(record => records.push(record));
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    unsubscribe();
    expect(log.state()).toEqual(before); expect(records).toHaveLength(1);
    expect(records[0].outcome).toBe("bounced"); expect(records[0].bounceReason).toBe("fold_error");
    expect(records[0].logRecords).toBeUndefined();
  });
  it("uses existing CAS actor rules before any application or proof", () => {
    const f = fixture();
    for (const intervening of ["unknown" as const, [{ seq: 1, actor: event("ADD_CARD", {}, "other").actor, type: "ADD_DREAMSIGN" as const }]]) {
      const out = accept(f, { intervening }); expect(out.outcome).toBe("bounced"); expect(out.state).toBe(f.state); expect(out.logRecords).toBeUndefined();
    }
    expect(accept(f, { intervening: [{ seq: 1, actor: event("ADD_CARD", {}).actor, type: "ADD_DREAMSIGN" }] }).outcome).toBe("applied");
  });
});
