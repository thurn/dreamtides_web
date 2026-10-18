// The run's act as the rules store and read it: `D97_START_RUN` in a dream
// outside the act catalog stores that dream's one-dream act, and in a catalog
// dream stores the act assembly makes from the run's seed, logging it and
// each failed attempt with UUIDs; an encounter at an assembled generic
// challenger's anchor fights as its persona and deck source; a guardian anchor
// whose seat the dream module does not hold has no one to preview; and the
// exit door the act names is the one door that opens once its guardian falls.

import { afterEach, describe, expect, it } from "vitest";
import { D97_ACT_SHAPE } from "../../content/d97/acts";
import { assembleAct } from "../../d97/assembly/assemble";
import { DECK_SOURCES, startDream, SYNTHETIC_ACT_CATALOG, SYNTHETIC_ACT_DREAMS } from "../../d97/assembly/assembly.fixtures";
import { eventRng } from "../../eventlog/rng";
import type { Genesis } from "../../eventlog/types";
import { testAvatarId } from "../../types/test-identities";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { ctx, event, GENESIS } from "../reducer-fixtures";
import { registerD97ContentProvider } from "./d97-content";
import { syntheticD97Content } from "./d97-content.fixtures";
import { registerDream } from "./d97-dreams";
import { SYNTHETIC_DREAM_A } from "./d97-dreams.fixtures";
import type { D97Run } from "./d97-state";
import { doorRefusal } from "./d97-travel";

const D97_GENESIS: Genesis = { ...GENESIS, mode: "d97" };
const AVATAR = testAvatarId("d97-roster-avatar");
const START = SYNTHETIC_ACT_DREAMS[0];

function apply(state: FoldState, type: string, payload: Record<string, unknown>, seq: number) {
  return reduceGameEvent(state, event(type as never, payload), ctx({ seq, rng: eventRng(D97_GENESIS.seed, seq) }));
}

function runOf(state: FoldState): D97Run {
  const run = state.d97?.run;
  if (run === undefined || run === null) throw new Error("no D97 run");
  return run;
}

/** Synthetic content whose act catalog, and registered dreams, are the synthetic catalog dreams. */
function registerCatalogContent(): void {
  const content = syntheticD97Content({ avatarIds: [AVATAR, ...DECK_SOURCES], actCatalog: SYNTHETIC_ACT_CATALOG });
  const dreams = new Map(SYNTHETIC_ACT_DREAMS.map((entry) => [entry.dream.id, registerDream(entry.dream, entry.anchors, new Map())]));
  registerD97ContentProvider({ ...content, dreams, defaultDreamId: START.dream.id });
}

afterEach(() => registerD97ContentProvider(null));

describe("the run's act", () => {
  it("is the start dream's one-dream act when the start dream is outside the act catalog", () => {
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR] }));
    const result = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1);
    const run = runOf(result.state);
    expect(run.acts).toHaveLength(1);
    expect(run.acts[0]).toMatchObject({
      number: 1,
      fallback: "startOutsideCatalog",
      dreamIds: [SYNTHETIC_DREAM_A.id],
      exitDoor: { dreamId: SYNTHETIC_DREAM_A.id, anchorId: SYNTHETIC_DREAM_A.topology.exitDoorAnchorId },
    });
    const logged = result.logRecords?.find((record) => record.event === "d97_act_assembled");
    expect(logged?.fields).toMatchObject({ runId: run.runId, actId: run.acts[0].actId, fallback: "startOutsideCatalog", dreamIds: [SYNTHETIC_DREAM_A.id] });
  });

  it("is the act assembled from the run seed when the run starts in a catalog dream, logged with each failed attempt", () => {
    registerCatalogContent();
    const result = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1);
    const run = runOf(result.state);
    const expected = assembleAct({ runSeed: run.runSeed, number: 1, start: startDream(START), catalog: SYNTHETIC_ACT_CATALOG, shape: D97_ACT_SHAPE });
    if (!expected.ok) throw new Error("the synthetic catalog did not assemble");
    expect(run.acts).toEqual([expected.act]);
    expect(run.acts[0]).toMatchObject({ fallback: null, entryDreamId: START.dream.id });
    const events = result.logRecords?.map((record) => record.event) ?? [];
    expect(events.filter((name) => name === "d97_act_attempt_failed")).toHaveLength(expected.failures.length);
    const logged = result.logRecords?.find((record) => record.event === "d97_act_assembled");
    expect(logged?.fields).toMatchObject({ actId: expected.act.actId, salt: expected.act.salt, doors: expected.act.doors, guardians: expected.act.guardians, quests: expected.act.quests });
  });

  it("seats a generic challenger that fights as its persona and deck source, and leaves an unauthored guardian seat to its rules", () => {
    registerCatalogContent();
    const started = apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1).state;
    const act = runOf(started).acts[0];
    const seat = act.challengers.find((candidate) => candidate.dreamId === START.dream.id && candidate.occupant.kind === "generic")!;
    if (seat.occupant.kind !== "generic") throw new Error("no generic challenger");
    const previewed = apply(started, "D97_PREVIEW_ENCOUNTER", { anchorId: seat.anchorId }, 2);
    expect(previewed.outcome).toBe("applied");
    expect(runOf(previewed.state).encounters[seat.anchorId]).toMatchObject({
      characterId: seat.occupant.characterId,
      avatarId: seat.occupant.deckSourceAvatarId,
      kind: "generic",
      role: "challenger",
    });
    const guardian = act.guardians.find((candidate) => candidate.dreamId === START.dream.id)!;
    expect(guardian.authored).toBe(false);
    expect(apply(started, "D97_PREVIEW_ENCOUNTER", { anchorId: guardian.anchorId }, 2).outcome).toBe("bounced");
  });

  it("opens only the act's exit door, once the guardian at its incarnation seat is beaten", () => {
    registerD97ContentProvider(syntheticD97Content({ avatarIds: [AVATAR] }));
    const run = runOf(apply(genesisFoldState(D97_GENESIS), "D97_START_RUN", { avatarId: AVATAR }, 1).state);
    const { exitDoorAnchorId, exitGuardianAnchorId, arrivalDoorAnchorId } = SYNTHETIC_DREAM_A.topology;
    expect(doorRefusal(run, arrivalDoorAnchorId)).toBe("noDestination");
    expect(doorRefusal(run, exitDoorAnchorId)).toBe("guardianStanding");
    const beaten = { ...run, encounters: { [exitGuardianAnchorId]: { anchorId: exitGuardianAnchorId, beaten: true } } } as unknown as D97Run;
    expect(doorRefusal(beaten, exitDoorAnchorId)).toBeNull();
    expect(doorRefusal({ ...beaten, acts: [] }, exitDoorAnchorId)).toBe("noDestination");
  });
});
