import { currentTutorialPresentation, tutorialCheckpointQueue } from "./tutorial-checkpoints";
import type { Engine } from "../../engine";
import type { EventContext } from "../../eventlog/types";
import type { TutorialSetup, TutorialSetupInput } from "../../battle/integration/tutorial-setup";
import type { FoldState } from "../fold-state";
import { configuredTutorialJourneyAvatarId } from "../front-door";
import { resetJourney } from "../journey/lifecycle";
import { startEngineBattle } from "./engine-battle";
import { tutorialBattleOf, type TutorialBattleFoldState } from "./fold";
import { completeTutorialCheckpoint, tutorialCardAttempt } from "./tutorial-presentation";
export interface TutorialBattleInitProvider {
    readonly engine: Engine;
    beginTutorialBattle(input: TutorialSetupInput): TutorialSetup | null;
    beginTutorialPrefix(input: TutorialSetupInput): TutorialSetup | null;
    readonly overrides: readonly import("../../types/tutorial").TutorialBattleAiActionOverride[];
}
let provider: TutorialBattleInitProvider | null = null;
export function registerTutorialBattleInitProvider(value: TutorialBattleInitProvider | null): void { provider = value; }
export function getTutorialBattleInitProvider(): TutorialBattleInitProvider | null { return provider; }
export function beginTutorialBattle(state: FoldState, payload: Record<string, unknown>, ctx: EventContext): FoldState | null {
    const tutorial = state.frontDoor.tutorial;
    if (state.battle !== null || state.frontDoor.phase !== "tutorial" || tutorial === null || tutorial.currentActionIndex !== null || payload.tutorialRunId !== tutorial.runId)
        return null;
    return build(state, tutorial.runId, 0, ctx);
}
export function restartTutorialBattle(state: FoldState, payload: Record<string, unknown>, ctx: EventContext): FoldState | null {
    const battle = tutorialBattleOf(state.battle);
    return battle === null || payload.battleId !== battle.init.battleId ? null : build(state, battle.mode.tutorialRunId, battle.mode.restartNumber + 1, ctx);
}
function build(state: FoldState, tutorialRunId: import("../../types/identifiers").TutorialRunId, restartNumber: number, ctx: EventContext): FoldState | null {
    if (provider === null)
        return null;
    const setup = provider.beginTutorialBattle({ journey: state.journey, actions: state.frontDoor.tutorial?.actions ?? [], tutorialRunId, restartNumber });
    if (setup === null)
        return null;
    const engine = startEngineBattle(setup.engineInit, provider.engine, ctx.seq);
    if (engine === null)
        return null;
    const battle: TutorialBattleFoldState = { mode: { kind: "tutorial", tutorialRunId, restartNumber }, init: setup.init, engine, ...tutorialCheckpointQueue([]), overrides: { definitions: provider.overrides, consumed: [], dreamwell: null }, pendingOverride: null, overrideCommits: [] };
    return { ...state, battle };
}
export function exitTutorialBattle(state: FoldState, payload: Record<string, unknown>, ctx: EventContext): FoldState | null {
    const battle = tutorialBattleOf(state.battle);
    const avatar = configuredTutorialJourneyAvatarId();
    if (battle === null || payload.battleId !== battle.init.battleId || avatar === null ||
        battle.engine.slice.committed.result?.kind !== "victory" || battle.engine.slice.committed.result.winner !== "player" ||
        battle.engine.slice.inFlight !== null || currentTutorialPresentation(battle) !== null)
        return null;
    const reset = resetJourney(state, ctx);
    return { ...reset, frontDoor: { phase: "journey", journeyId: null, tutorial: null }, journey: { ...reset.journey, screen: { type: "journeyStart", tutorialAvatarId: avatar } } };
}
export { completeTutorialCheckpoint as completeTutorialBattlePresentation, tutorialCardAttempt };
