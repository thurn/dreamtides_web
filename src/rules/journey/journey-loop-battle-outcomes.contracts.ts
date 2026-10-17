import { journeyBattleOf } from "../battle/fold";
import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { apply, resolveWindow } from "./journey-loop.fixtures";
import { endLoopBattle, liveLoopBattle } from "./journey-loop-integration.fixtures";

describe("journey draw after actual battle bookkeeping", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it.each([{ outcome: "victory", final: false }, { outcome: "victory", final: true }, { outcome: "defeat", final: false }, { outcome: "draw", final: false }] as const)("preserves actual $outcome reward/completion and earlier summary, final=$final", ({ outcome, final }) => {
    const f = liveLoopBattle(outcome, final), beforeEssence = f.state.journey.essence, reward = journeyBattleOf(f.state.battle)!.init.essenceReward;
    const ended = endLoopBattle(f, outcome), prefix = structuredClone(ended.journey);
    expect(ended.battle).toBeNull(); expect(ended.journey.screen).toMatchObject({ type: "journeyTransfiguration", choice: { returnTo: outcome === "victory" ? final ? "journeyComplete" : "atlas" : "journeyFailed" } });
    expect(prefix.essence).toBe(beforeEssence + (outcome === "victory" ? reward : 0));
    expect(prefix.completionLevel).toBe(outcome === "victory" ? 1 : 0);
    expect(prefix.failureSummary?.result ?? null).toBe(outcome === "victory" ? null : outcome);
    const first = resolveWindow(f, ended, undefined, { seq: 41 });
    expect(first.outcome).toBe("applied"); expect(first.state.journey).toHaveProperty("pendingJourneyLoop");
    const loaded = apply(f, first.state, "LOAD_STATE", { snapshot: structuredClone(first.state.journey) }, { seq: 42 });
    expect(loaded.outcome).toBe("applied");
    const out = resolveWindow(f, loaded.state, [], { seq: 43 });
    expect(out.outcome).toBe("applied"); expect(out.state.journey).toHaveProperty("journeyDraw.abandonedBattle", null);
    expect(out.state.journey.essence).toBe(prefix.essence); expect(out.state.journey.completionLevel).toBe(prefix.completionLevel);
    expect(out.state.journey.failureSummary).toEqual(prefix.failureSummary); expect(out.state.journey.atlas).toEqual(prefix.atlas);
    expect(out.state.journey.journeyDraw?.cause.eventSeq).toBe(41);
    expect(apply(f, out.state, "END_BATTLE", {}, { seq: 44 }).outcome).toBe("bounced");
  });
});
