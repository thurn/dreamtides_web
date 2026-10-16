import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { apply, afterBattle, CARD_ID, ENTRY_ID, fixture, historicalFailure, LOOP, resolveWindow, TOME } from "./journey-loop.fixtures";

describe("journey loop earned finite prefix", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each(["defeat", "draw"] as const)("preserves a prior real battle %s and its remaining earned window before a later journey draw", result => {
    const previous = historicalFailure(result), f = afterBattle(fixture({ cardType: "Event", held: [LOOP, TOME] }), "transfiguration", previous);
    const first = resolveWindow(f, f.state);
    expect(first.outcome).toBe("applied");
    expect(first.state.journey.screen).toMatchObject({ type: "journeyTransfiguration", choice: { index: 1 } });
    expect(first.state.journey.failureSummary).toEqual(previous);
    expect(first.state.journey).toHaveProperty("pendingJourneyLoop");
    expect(first.state.journey).not.toHaveProperty("journeyDraw");
    const restored = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(first.state));
    const final = resolveWindow(f, restored, []);
    expect(final.outcome).toBe("applied");
    expect(final.state.journey.failureSummary).toEqual(previous);
    expect(final.state.journey).toMatchObject({ journeyDraw: { result: "draw", abandonedBattle: null } });
    expect(final.state.battle).toBeNull();
  });
  it("settles the already-earned actual application once after its source is removed", () => {
    const f = afterBattle(fixture({ cardType: "Character" }));
    const first = resolveWindow(f, f.state);
    expect(first.outcome).toBe("applied");
    expect(first.state.journey).toHaveProperty("pendingJourneyLoop");
    const removed = apply(f, first.state, "REMOVE_DREAMSIGN", { dreamsignId: LOOP });
    expect(removed.outcome).toBe("applied");
    const final = resolveWindow(f, removed.state, [], { seq: 45, rng: () => 0.75 });
    expect(final.outcome).toBe("applied");
    expect(final.state.journey.deck.find(entry => entry.entryId === ENTRY_ID)?.transfigurationApplications).toHaveLength(2);
    expect(final.state.journey).not.toHaveProperty("journeyDraw"); expect(final.state.journey).not.toHaveProperty("pendingJourneyLoop");
    const finite = (final.logRecords ?? []).filter(record => record.event === "journey_loop_finite_application");
    expect(finite).toHaveLength(1);
    expect(finite[0].fields).toMatchObject({ parentCause: { entryId: ENTRY_ID, cardId: CARD_ID } });
  });
  it("gives each legal next form its actual one-step branch after source loss", () => {
    const initial = afterBattle(fixture({ cardType: "Event", authored: true }));
    const first = resolveWindow(initial, initial.state);
    expect(first.outcome).toBe("applied");
    const forms = initial.provider.resolve(first.state.journey.deck[0])?.applicableForms ?? [];
    expect(forms).toContain("Perfected");
    for (const [index, form] of forms.entries()) {
      const removed = apply(initial, first.state, "REMOVE_DREAMSIGN", { dreamsignId: LOOP });
      const out = resolveWindow(initial, removed.state, [], { seq: 45, rng: () => (index + 0.5) / forms.length });
      expect(out.outcome).toBe("applied");
      expect(out.state.journey.deck[0].transfigurationApplications?.[out.state.journey.deck[0].transfigurationApplications.length - 1]?.form).toBe(form);
      expect(out.state.journey.deck[0].transfigurationApplications).toHaveLength(2);
      expect(out.state.journey).not.toHaveProperty("journeyDraw");
    }
  });
  it("honors an earned purge before checking the child and does not transfigure a missing original", () => {
    const f = afterBattle(fixture({ cardType: "Character" }), "purge");
    const first = resolveWindow(f, f.state);
    expect(first.outcome).toBe("applied"); expect(first.state.journey).toHaveProperty("pendingJourneyLoop");
    const out = resolveWindow(f, first.state, [ENTRY_ID]);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck.some(entry => entry.entryId === ENTRY_ID)).toBe(false);
    expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
});
