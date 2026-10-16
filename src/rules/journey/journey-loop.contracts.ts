import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { createLocalLog } from "../../eventlog/local-log";
import { foldEvents } from "../../eventlog/fold";
import { event } from "./lifecycle-fixtures";
import { accept, apply, CARD_ID, ENTRY_ID, EXTRA, fixture, GENESIS, LOOP, SITE_ID, TOME, config } from "./journey-loop.fixtures";

describe("journey loop public terminal contract", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each(["Character", "Event"] as const)("proves a standalone mandatory %s continuation without requiring a Tome", cardType => {
    const f = fixture({ cardType }), before = structuredClone(f.state);
    const out = accept(f);
    expect(out.outcome).toBe("applied");
    expect(out.state.journey).toMatchObject({ screen: { type: "journeyFailed" }, journeyDraw: {
      kind: "mandatoryJourneyLoop", result: "draw", cause: { entryId: ENTRY_ID, cardId: CARD_ID, applicationIndex: 0 },
      continuingSources: [{ dreamsignId: LOOP, heldIndex: 0 }], proof: { cardType, anchor: cardType === "Character" ? "Kindled" : "Inspired" },
      abandonedBattle: null,
    } });
    expect(out.state.journey.essence).toBe(23);
    expect(out.state.journey.deck[0].transfiguration).toBe(cardType === "Character" ? "Kindled" : "Inspired");
    expect(out.state.journey.deck[1]).toEqual(before.journey.deck[1]);
    expect(out.state.battle).toBeNull();
    expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop");
    expect(f.state).toEqual(before);
    const committed = (out.logRecords ?? []).filter(record => record.event === "journey_draw_committed");
    expect(committed).toHaveLength(1);
    expect(committed[0].fields).toMatchObject({ cause: { cardId: CARD_ID, entryId: ENTRY_ID } });
  });
  it.each([{ held: [TOME, LOOP, EXTRA] }, { held: [LOOP, EXTRA, TOME] }] as const)("retains root copy siblings and distinct held slots for $held", ({ held }) => {
    const f = fixture({ cardType: "Event", held }), out = accept(f);
    expect(out.outcome).toBe("applied");
    expect(out.state.journey.deck).toHaveLength(3);
    const [original, neighbor, copy] = out.state.journey.deck;
    expect(copy.cardNumber).toBe(original.cardNumber); expect(copy.entryId).not.toBe(original.entryId);
    expect(copy.transfiguration).toBe(original.transfiguration); expect(neighbor.entryId).not.toBe(copy.entryId);
    expect(out.state.journey).toMatchObject({ journeyDraw: { continuingSources: held.flatMap((id, heldIndex) => id === TOME ? [] : [{ dreamsignId: id, heldIndex }]) } });
  });
  it("records the actual complete next-outcome set, including Perfected, without drawing an unexecuted child", () => {
    const f = fixture({ cardType: "Event", authored: true }); const draws: number[] = [];
    const out = accept(f, { rng: index => { draws.push(index); return 0; } });
    const forms = f.provider.resolve(out.state.journey.deck[0])?.applicableForms;
    expect(forms).toContain("Perfected");
    expect(out.state.journey).toMatchObject({ journeyDraw: { proof: { applicableForms: forms } } });
    expect(draws).toEqual([]);
    expect(out.state.journey.deck[0].transfigurationApplications?.length ?? 1).toBe(1);
  });
  it("replays the public registered terminal and permits only a new journey through gameplay", () => {
    const f = fixture(), engineConfig = config(f);
    const log = createLocalLog({ config: engineConfig, genesis: GENESIS, localActor: event("ADD_CARD", {}).actor, now: () => "1970-01-01T00:00:00.000Z" });
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    expect(log.state().journey).toHaveProperty("journeyDraw.result", "draw");
    const ended = log.state();
    expect(apply(f, ended, "ADD_CARD", { cardId: CARD_ID }).outcome).toBe("bounced");
    expect(foldEvents(engineConfig, GENESIS, { seq: 0, state: f.state }, [...log.events()]).state).toEqual(ended);
    const reset = apply(f, ended, "RESET_JOURNEY");
    expect(reset.outcome).toBe("applied"); expect(reset.state.journey.screen.type).toBe("journeyStart");
    expect(reset.state.journey).not.toHaveProperty("journeyDraw"); expect(reset.state.journey).not.toHaveProperty("pendingJourneyLoop");
    expect(reset.state.battle).toBeNull(); expect(reset.state.frontDoor.phase).toBe("journey");
  });
});
