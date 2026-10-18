// Opening a reward-bag stage on a started synthetic run: the stage its trigger
// names opens for every Avatar's bag, raising capacity, keeping draws, and is
// logged by UUID; a trigger whose stage the run already reached, or that
// names no stage, changes nothing and logs nothing.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeRewardBag, bagSize, bagWeight, rewardBagOf } from "../../d97/collection/reward-bag";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { openRunBagStage } from "./d97-bag";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { SYNTHETIC_BAG_TUNING, syntheticD97Content, syntheticFacetCardIds } from "./d97-content.fixtures";
import type { D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-bag-stage-avatar");
const OTHER = testAvatarId("d97-bag-stage-other");

function startedRun(): D97Run {
  const result = reduceGameEvent(genesisFoldState(D97_GENESIS), event("D97_START_RUN", { avatarId: AVATAR }), ctx({ seq: 1, rng: eventRng(D97_GENESIS.seed, 1) }));
  const run = result.state.d97?.run;
  if (run === undefined || run === null) throw new Error("the run did not start");
  return run;
}

beforeEach(() => registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR, OTHER] })));
afterEach(() => registerD97ContentProvider(null));

describe("openRunBagStage", () => {
  it("opens the act's stage for every bag, raising capacity and keeping draws, and logs it", () => {
    const content = d97ContentProvider()!;
    const run = startedRun();
    const facet = syntheticFacetCardIds(1)[0];
    const act2 = SYNTHETIC_BAG_TUNING.stages[1];
    const { run: next, logRecords } = openRunBagStage(run, { kind: "actEntered", act: 2 }, content);
    expect(next.bags.stage).toBe(act2.stage);
    expect(next.bags.drawn).toBe(run.bags.drawn);
    expect(bagWeight(activeRewardBag(content, next), facet)).toBe(act2.ring2Capacity);
    expect(bagWeight(rewardBagOf(content, next.bags, OTHER), facet)).toBe(act2.ring2Capacity);
    expect(bagSize(activeRewardBag(content, next))).toBeGreaterThan(bagSize(activeRewardBag(content, run)));
    expect(logRecords).toEqual([
      {
        event: "d97_bag_stage_opened",
        fields: {
          runId: run.runId,
          trigger: "actEntered",
          act: 2,
          fromStage: run.bags.stage,
          stage: act2.stage,
          ring1Capacity: act2.ring1Capacity,
          ring2Capacity: act2.ring2Capacity,
          avatarId: AVATAR,
          bagSize: bagSize(activeRewardBag(content, next)),
        },
      },
    ]);
  });

  it("opens Apollyon's stage past every act's", () => {
    const content = d97ContentProvider()!;
    const { run } = openRunBagStage(startedRun(), { kind: "apollyonFalls" }, content);
    expect(run.bags.stage).toBe(SYNTHETIC_BAG_TUNING.stages[2].stage);
    expect(openRunBagStage(run, { kind: "actEntered", act: 2 }, content)).toEqual({ run, logRecords: [] });
  });

  it("changes nothing for a stage already reached or a trigger without a stage", () => {
    const content = d97ContentProvider()!;
    const run = startedRun();
    expect(openRunBagStage(run, { kind: "runStart" }, content)).toEqual({ run, logRecords: [] });
    expect(openRunBagStage(run, { kind: "actEntered", act: 3 }, content)).toEqual({ run, logRecords: [] });
  });
});
