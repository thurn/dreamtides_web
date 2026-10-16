import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../../rules/replay/fixture-providers";
import { buildJourneyFailedView } from "./journey-failed-view-model";
import { accept, fixture, historicalFailure } from "../../rules/journey/journey-loop.fixtures";

describe("journey loop typed result projection", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("projects the actual journey draw with journey statistics and gives it priority over a retained battle summary", () => {
    const f = fixture(), out = accept(f), previous = historicalFailure();
    expect(out.outcome).toBe("applied"); expect(out.state.journey).toHaveProperty("journeyDraw");
    const journey = { ...out.state.journey, failureSummary: previous }, view = buildJourneyFailedView(journey);
    expect(view).toMatchObject({ kind: "journey", result: "draw", reason: "mandatory_journey_loop" });
    expect(view?.stats.map(stat => [stat.id, stat.value])).toEqual([["battles", journey.completionLevel], ["deckEntries", journey.deck.length]]);
    expect(journey.failureSummary).toEqual(previous);
  });
  it("retains the real legacy battle summary contract without a journey draw", () => {
    const f = fixture(), summary = historicalFailure("draw"), view = buildJourneyFailedView({ ...f.state.journey, failureSummary: summary });
    expect(view).toMatchObject({ result: "draw", reason: summary.reason });
    expect(view?.stats.map(stat => [stat.id, stat.value])).toEqual([["battles", 0], ["round", 4], ["playerScore", 2], ["enemyScore", 10]]);
  });
});
