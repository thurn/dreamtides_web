// The D97 phase contract: each event declares one phase (Avatar select, the
// overworld out of battle, or a D97 battle) that the dispatcher checks once.
// Every event bounces outside its phase: the overworld's intents (shop,
// selling, deck editing, quests, travel, encounters) bounce while a D97
// battle runs and on the slice end, and settling a battle bounces without
// one. The same intents still apply on the overworld.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ERRAND_QUEST, QUESTS } from "../../../d97/dialogue/dialogue.fixtures";
import { eventRng } from "../../../eventlog/rng";
import type { Genesis } from "../../../eventlog/types";
import { identityKeys, parseBattleId } from "../../../types/identifiers";
import { testAvatarId } from "../../../types/test-identities";
import type { D97BattleFoldState } from "../../battle/fold";
import { genesisFoldState, type FoldState } from "../../fold-state";
import { reduceGameEvent } from "../../reducer";
import { ctx, event, GENESIS } from "../../reducer-fixtures";
import { registerD97ContentProvider } from "../d97-content";
import { syntheticD97Content } from "../d97-content.fixtures";
import { SYNTHETIC_DREAM_A, syntheticDreamAnchor } from "../d97-dreams.fixtures";
import type { D97Run } from "../d97-state";
import { withD97Run } from "../d97-state.fixtures";
import { D97_EVENTS, type D97EventType } from "./index";
import { d97PhaseInput, type D97Phase } from "./spec";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-phase-avatar");
const { shopAnchorId, waypointAnchorId } = SYNTHETIC_DREAM_A.topology;
/** Dream A's first challenger. */
const CHALLENGER = syntheticDreamAnchor(1, 6);

let seq = 1;

function apply(state: FoldState, type: D97EventType, payload: Record<string, unknown>) {
  seq += 1;
  return reduceGameEvent(state, event(type, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function applied(state: FoldState, type: D97EventType, payload: Record<string, unknown>): FoldState {
  const result = apply(state, type, payload);
  expect(result.outcome, type).toBe("applied");
  return result.state;
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

function overworld(): FoldState {
  return applied(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR, dreamId: SYNTHETIC_DREAM_A.id });
}

/** `state` with a D97 battle running against the encounter at `anchorId`. */
function inBattle(state: FoldState, anchorId = CHALLENGER): FoldState {
  const battle = {
    mode: { kind: "d97" },
    init: { battleId: parseBattleId("d97:phase-test"), anchorId },
    engine: { init: {}, slice: { committed: { result: null } } },
  } as unknown as D97BattleFoldState;
  return { ...state, battle };
}

/** `state`'s run on the slice end. */
function sliceEnd(state: FoldState): FoldState {
  return { ...state, d97: { screen: { type: "sliceEnd" }, run: runOf(state) } };
}

beforeEach(() => {
  seq = 1;
  registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR], quests: QUESTS }));
});

afterEach(() => {
  registerD97ContentProvider(null);
});

describe("D97 event phases", () => {
  it("declares the run start on Avatar select, settling in battle, and every other event on the overworld", () => {
    const phases = Object.fromEntries(identityKeys(D97_EVENTS).map((type) => [type, D97_EVENTS[type].phase]));
    for (const [type, phase] of Object.entries(phases)) {
      const expected: D97Phase = type === "D97_START_RUN" ? "avatarSelect" : type === "D97_END_BATTLE" ? "inBattle" : "overworld";
      expect(phase, type).toBe(expected);
    }
  });

  it("admits each event in exactly its phase, and none on the slice end", () => {
    const started = overworld();
    const states: Record<D97Phase | "sliceEnd", FoldState> = {
      avatarSelect: genesisFoldState(D97_GENESIS),
      overworld: started,
      inBattle: inBattle(started),
      sliceEnd: sliceEnd(started),
    };
    for (const type of identityKeys(D97_EVENTS)) {
      const declared = D97_EVENTS[type].phase;
      for (const [name, state] of Object.entries(states)) {
        expect(d97PhaseInput(declared, state) !== null, `${type} in ${name}`).toBe(name === declared);
        if (name !== declared) expect(apply(state, type, {}).outcome, `${type} in ${name}`).toBe("bounced");
      }
    }
  });

  it("bounces shop, sell, deck, quest and travel intents during a D97 battle that apply on the overworld", () => {
    const started = overworld();
    const shopOpen = applied(started, "D97_OPEN_SHOP", { anchorId: shopAnchorId });
    const opened = withD97Run(shopOpen, { ...runOf(shopOpen), essence: 5000 });
    const copyId = runOf(opened).collection.copies[0].copyId;
    const unequipped = applied(started, "D97_UNEQUIP_COPY", { copyId });
    const accepted = applied(started, "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ERRAND_QUEST.giverAnchorId });
    const cases: readonly (readonly [FoldState, D97EventType, Record<string, unknown>])[] = [
      [started, "D97_OPEN_SHOP", { anchorId: shopAnchorId }],
      [opened, "D97_RESTOCK_SHOP", { anchorId: shopAnchorId }],
      [opened, "D97_SELL_COPY", { anchorId: shopAnchorId, copyId }],
      [started, "D97_UNEQUIP_COPY", { copyId }],
      [unequipped, "D97_EQUIP_COPY", { copyId }],
      [started, "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ERRAND_QUEST.giverAnchorId }],
      [accepted, "D97_ABANDON_QUEST", { questId: ERRAND_QUEST.id }],
      [started, "D97_ACTIVATE_WAYPOINT", { anchorId: waypointAnchorId }],
      [started, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER }],
    ];
    for (const [state, type, payload] of cases) {
      applied(state, type, payload);
      const during = inBattle(state);
      const result = apply(during, type, payload);
      expect(result.outcome, type).toBe("bounced");
      expect(result.state, type).toBe(during);
    }
  });

  it("bounces previews, battles and quest intents on the slice end", () => {
    const started = overworld();
    const previewed = applied(started, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER });
    const cases: readonly (readonly [FoldState, D97EventType, Record<string, unknown>])[] = [
      [started, "D97_PREVIEW_ENCOUNTER", { anchorId: CHALLENGER }],
      [previewed, "D97_BEGIN_BATTLE", { anchorId: CHALLENGER }],
      [started, "D97_ACCEPT_QUEST", { questId: ERRAND_QUEST.id, anchorId: ERRAND_QUEST.giverAnchorId }],
      [started, "D97_OPEN_SHOP", { anchorId: shopAnchorId }],
      [started, "D97_ACTIVATE_WAYPOINT", { anchorId: waypointAnchorId }],
    ];
    for (const [state, type, payload] of cases) {
      const ended = sliceEnd(state);
      expect(d97PhaseInput(D97_EVENTS[type].phase, ended), type).toBeNull();
      const result = apply(ended, type, payload);
      expect(result.outcome, type).toBe("bounced");
      expect(result.state, type).toBe(ended);
    }
  });

  it("settles a battle only while one runs", () => {
    const started = overworld();
    expect(apply(started, "D97_END_BATTLE", {}).outcome).toBe("bounced");
    expect(d97PhaseInput("inBattle", inBattle(started))).not.toBeNull();
    expect(d97PhaseInput("inBattle", sliceEnd(inBattle(started)))).toBeNull();
  });
});
