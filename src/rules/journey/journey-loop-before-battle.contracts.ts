import { afterEach, describe, expect, it } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { ordinaryBeforeBattleLoop } from "./journey-loop-integration.fixtures";
import { apply } from "./journey-loop.fixtures";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { eventRng } from "../../eventlog/rng";
import type { BattleInitProvider } from "../battle/journey-battle";

describe("journey loop canonical before-battle compatibility", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("starts after the actual purge with the original context and no loop instruction", () => {
    const starts: Parameters<BattleInitProvider["beginBattle"]>[0][] = [];
    const f = ordinaryBeforeBattleLoop(input => starts.push(input));
    expect(starts).toHaveLength(0); expect(f.state.battle).toBeNull();
    const saved = GAME_ENGINE_CONFIG.decode(GAME_ENGINE_CONFIG.encode(f.state));
    const out = apply(f, saved, "RESOLVE_JOURNEY_PURGE", { siteId: f.originalChoice.siteId, dreamsignId: f.SOURCE, heldIndex: 1, choiceIndex: 0, earnedSeq: 10, entryIds: [f.state.journey.deck[1].entryId] }, { seq: 11 });
    expect(out.outcome).toBe("applied"); expect(starts).toHaveLength(1);
    expect(starts[0].seq).toBe(10); expect(starts[0].timestamp).toBe(f.originalChoice.timestamp);
    expect(starts[0].rng(0)).toBe(eventRng(f.originalChoice.seed, 10)(0));
    expect(out.state.battle).not.toBeNull(); expect(out.state.journey.deck).toHaveLength(1);
    expect(out.state.journey).not.toHaveProperty("pendingJourneyLoop"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
    expect(out.logRecords?.filter(record => record.event === "journey_before_battle_started")).toHaveLength(1);
  });
});
