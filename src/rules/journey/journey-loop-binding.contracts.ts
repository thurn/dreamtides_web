import { tutorialBattleOf } from "../battle/fold";
import { afterEach, describe, expect, it } from "vitest";
import { parseBattleId } from "../../types/identifiers";
import { testAvatarId, testTutorialRunId } from "../../types/test-identities";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "../battle/tutorial-lifecycle";
import { CARDS, display, engine, init, prefixActions, prefixSetup } from "../battle/tutorial-contracts-fixture";
import { genesisFoldState } from "../fold-state";
import { createLocalLog } from "../../eventlog/local-log";
import { event } from "./lifecycle-fixtures";
import { accept, apply, ENTRY_ID, fixture, GENESIS, SITE_ID, config, type LoopFixture } from "./journey-loop.fixtures";

function liveTutorial(f: LoopFixture) {
  registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("journey-loop-tutorial-avatar") });
  registerTutorialBattleInitProvider({ engine, overrides: [], beginTutorialPrefix: () => prefixSetup(),
    beginTutorialBattle: input => ({ init: { ...display(), battleId: parseBattleId(`journey-loop-tutorial:${input.tutorialRunId}`) }, engineInit: init("player", CARDS.strong) }) });
  const beginning = apply(f, genesisFoldState({ ...GENESIS, frontDoorEntry: "tutorial" }), "BEGIN_TUTORIAL", { actions: prefixActions, startAtEnd: true });
  expect(beginning.outcome).toBe("applied");
  const live = apply(f, beginning.state, "BEGIN_TUTORIAL_BATTLE", { tutorialRunId: beginning.state.frontDoor.tutorial?.runId });
  expect(live.outcome).toBe("applied"); expect(live.state.battle?.mode.kind).toBe("tutorial");
  return { ...f, state: { ...live.state, journey: f.state.journey } };
}
describe("journey loop actual tutorial binding", () => {
  afterEach(() => { clearGameProviders(); registerReplayFixtureProviders(); });
  it("records the actual initialized tutorial battle and run before teardown and exposes reset in journey routing", () => {
    const f = liveTutorial(fixture()), before = structuredClone(f.state), out = accept(f);
    expect(out.outcome).toBe("applied");
    expect(out.state.journey).toMatchObject({ journeyDraw: { abandonedBattle: {
      battleId: before.battle!.init.battleId, mode: "tutorial", tutorialRunId: before.frontDoor.tutorial!.runId,
    } } });
    expect(out.state.battle).toBeNull(); expect(out.state.frontDoor.phase).toBe("journey");
    expect(out.state.frontDoor.tutorial).toEqual(before.frontDoor.tutorial);
    const reset = apply(f, out.state, "RESET_JOURNEY");
    expect(reset.state.frontDoor.phase).toBe("journey"); expect(reset.state.journey.screen.type).toBe("journeyStart");
    expect(reset.state.tutorialTriggerIdsSeen).toEqual(before.tutorialTriggerIdsSeen);
    expect(f.state).toEqual(before);
  });
  it("does not clear an unrelated tutorial run or commit a partial form/cost when binding is inconsistent", () => {
    const f = liveTutorial(fixture());
    if (f.state.battle?.mode.kind !== "tutorial") throw new Error("Missing real tutorial host");
    const battle = tutorialBattleOf(f.state.battle);
    if (battle === null) throw new Error("Missing real tutorial host");
    const wrong = { ...f.state, battle: { ...battle, mode: { ...battle.mode, tutorialRunId: testTutorialRunId("foreign-loop-tutorial") } } };
    const log = createLocalLog({ config: config(f, wrong), genesis: GENESIS, localActor: event("ADD_CARD", {}).actor, devMode: false });
    log.append({ type: "ACCEPT_TRANSFIGURATION_CHOICE", payload: { siteId: SITE_ID, entryId: ENTRY_ID } });
    expect(log.state()).toEqual(wrong);
    expect(log.state().battle).toBe(wrong.battle);
  });
});
