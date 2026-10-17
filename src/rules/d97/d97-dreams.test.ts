// Every D97 rule is scoped to the run's dream: with synthetic dreams A and B
// registered and a run in A, shop, waypoint, door, preview and dialogue-effect
// intents at B's anchors bounce while the same intents at A's anchors apply.
// `registerDream` keys each dream's challengers and speakers by its own
// anchors, and `runDreamAnchor` finds only the run's own dream.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { D97DialogueModule } from "../../content/d97/dialogue/schema";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import {
  parseD97DialogueId,
  parseD97DialogueNodeId,
  parseD97FlagId,
  type DreamAnchorId,
} from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { d97ContentProvider, registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { registerDream, runDreamAnchor } from "./d97-dreams";
import { speakingResident, syntheticDream, syntheticDreamAnchor } from "./d97-dreams.fixtures";
import type { D97Encounter, D97Run } from "./d97-state";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-dreams-avatar");
const FLAG = parseD97FlagId("d97f1a90-0000-4000-8000-000000000001");

/** A one-node dialogue offering to set the flag. */
function flagSetter(index: number): D97DialogueModule {
  const node = parseD97DialogueNodeId(`d97f1a91-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
  return {
    id: parseD97DialogueId(`d97f1a92-0000-4000-8000-${index.toString(16).padStart(12, "0")}`),
    speaker: { name: "Speaker", kind: "friendly" },
    entries: [{ node }],
    nodes: [{ id: node, lines: ["Line."], choices: [{ label: "Choice.", effect: { kind: "setFlag", flagId: FLAG, value: true }, next: null }] }],
  };
}

const SPEAKER_A = flagSetter(1);
const SPEAKER_B = flagSetter(2);
const DREAM_A = syntheticDream(1, [speakingResident(syntheticDreamAnchor(1, 10), SPEAKER_A.id)]);
const DREAM_B = syntheticDream(2, [speakingResident(syntheticDreamAnchor(2, 10), SPEAKER_B.id)]);

let seq = 0;

function apply(state: FoldState, type: string, payload: Record<string, unknown>) {
  seq += 1;
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

/** A run in dream A, with every exit guardian recorded as beaten so doors may open. */
function startedInA(): FoldState {
  const result = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR, dreamId: DREAM_A.id });
  expect(result.outcome).toBe("applied");
  const run = runOf(result.state);
  const beaten = (anchorId: DreamAnchorId) => ({ anchorId, role: "guardian", beaten: true }) as D97Encounter;
  const encounters = {
    [DREAM_A.topology.exitGuardianAnchorId]: beaten(DREAM_A.topology.exitGuardianAnchorId),
    [DREAM_B.topology.exitGuardianAnchorId]: beaten(DREAM_B.topology.exitGuardianAnchorId),
  };
  return { ...result.state, d97: { ...result.state.d97!, run: { ...run, encounters } } };
}

/** Each scoped intent at `dream`'s anchors. */
function intents(dream: typeof DREAM_A, speaker: DreamAnchorId): readonly (readonly [string, Record<string, unknown>])[] {
  return [
    ["D97_OPEN_SHOP", { anchorId: dream.topology.shopAnchorId }],
    ["D97_ACTIVATE_WAYPOINT", { anchorId: dream.topology.waypointAnchorId }],
    ["D97_STEP_THROUGH_DOOR", { anchorId: dream.topology.exitDoorAnchorId }],
    ["D97_PREVIEW_ENCOUNTER", { anchorId: syntheticDreamAnchor(dream === DREAM_A ? 1 : 2, 6) }],
    ["D97_SET_FLAG", { flagId: FLAG, value: true, anchorId: speaker }],
  ];
}

beforeEach(() => {
  seq = 0;
  registerD97ContentProvider(
    syntheticD97Content({ avatarIds: [AVATAR], poolSize: 40, dreams: [DREAM_A, DREAM_B], dialogues: [SPEAKER_A, SPEAKER_B] }),
  );
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("a run in dream A", () => {
  it.each(intents(DREAM_B, syntheticDreamAnchor(2, 10)))("bounces %s at dream B's anchor", (type, payload) => {
    expect(apply(startedInA(), type, payload).outcome).toBe("bounced");
  });

  it.each(intents(DREAM_A, syntheticDreamAnchor(1, 10)))("applies %s at dream A's anchor", (type, payload) => {
    expect(apply(startedInA(), type, payload).outcome).toBe("applied");
  });
});

describe("registerDream", () => {
  it("keys challengers and speakers by the dream's own anchors", () => {
    const dialogues = new Map([[SPEAKER_A.id, SPEAKER_A]]);
    const dream = registerDream(DREAM_A, [{ id: syntheticDreamAnchor(1, 30), kind: "object" }], dialogues);
    expect([...dream.challengers.keys()].sort()).toEqual(
      [syntheticDreamAnchor(1, 4), syntheticDreamAnchor(1, 6), syntheticDreamAnchor(1, 7)].sort(),
    );
    expect(dream.challengers.get(syntheticDreamAnchor(1, 4))?.role).toBe("guardian");
    expect([...dream.speakerDialogues]).toEqual([[syntheticDreamAnchor(1, 10), SPEAKER_A]]);
    expect(dream.anchorIds.has(syntheticDreamAnchor(1, 30))).toBe(true);
    expect(dream.anchorIds.has(DREAM_A.topology.waypointAnchorId)).toBe(true);
    expect(dream.anchorIds.has(DREAM_B.topology.waypointAnchorId)).toBe(false);
  });

  it("leaves a resident whose dialogue is unregistered silent", () => {
    expect(registerDream(DREAM_A, [], new Map()).speakerDialogues.size).toBe(0);
  });
});

describe("runDreamAnchor", () => {
  it("finds the run's dream only for its own anchors", () => {
    const run = runOf(startedInA());
    const content = d97ContentProvider()!;
    expect(runDreamAnchor(run, content, DREAM_A.topology.shopAnchorId)?.definition.id).toBe(DREAM_A.id);
    expect(runDreamAnchor(run, content, DREAM_B.topology.shopAnchorId)).toBeNull();
    expect(runDreamAnchor(run, content, null)).toBeNull();
    expect(runDreamAnchor({ ...run, dreamId: syntheticDream(3).id }, content, DREAM_A.topology.shopAnchorId)).toBeNull();
  });
});
