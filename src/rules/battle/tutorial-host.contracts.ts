import { currentTutorialPresentation } from "./tutorial-checkpoints";
import { testTutorialTriggerId } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { policyOverride } from "../../engine/policy/overrides";
import { parsePresentationId } from "../../types/identifiers";
import { tutorialBattleOf } from "./fold";
import { completeTutorialCheckpoint, tutorialCardAttempt } from "./tutorial-presentation";
import { pendingEnginePrompt, reduceEngineIntent } from "./engine-battle";
import { parseTutorialBattleFoldState } from "./tutorial-load";
import { registerBattleInitProvider } from "./journey-battle";
import { engine, host, context, CARDS, trigger } from "./tutorial-contracts-fixture";
function battle(state: ReturnType<typeof host>) { const result = tutorialBattleOf(state.battle); if (result === null)
    throw Error("no tutorial"); return result; }
function choice(state: ReturnType<typeof host>) {
    const current = battle(state), board = current.engine.slice.committed, decision = engine.decision(board);
    if (decision === null)
        throw Error("no decision");
    const result = policyOverride(engine.view(board, decision.side), { kind: "topLevel", decision, legal: engine.legalActions(board, decision.side) }, current.overrides);
    if (result?.kind !== "selected")
        throw Error("no override");
    return result;
}
function start(state: ReturnType<typeof host>) { const result = choice(state); const next = reduceEngineIntent(state, "BATTLE_ACTION", { side: battle(state).engine.slice.committed.turn.active, action: result.choice.action, override: result.selection }, context(), engine); if (next === null)
    throw Error("play refused"); return { next, selection: result.selection }; }
afterEach(() => registerBattleInitProvider(null));
describe("tutorial engine host contracts", () => {
    it.each(["player", "enemy"] as const)("consumes an override only after %s commits its ordinary cost prompt", side => {
        const initial = host(side), { next, selection } = start(initial), opened = pendingEnginePrompt(next.battle, engine);
        expect(opened?.prompt.kind).toBe("chooseNumber");
        expect(battle(next).overrides.consumed).toEqual([]);
        expect(battle(next).pendingOverride).toEqual(selection);
        expect(battle(next).engine.slice.committed).toEqual(battle(initial).engine.slice.committed);
        expect(reduceEngineIntent(next, "BATTLE_ANSWER", { side, promptId: parsePresentationId("stale"), value: 0 }, context(11), engine)).toBeNull();
        if (opened === null)
            throw Error("missing prompt");
        const committed = reduceEngineIntent(next, "BATTLE_ANSWER", { side, promptId: opened.prompt.id, value: 0 }, context(12), engine);
        if (committed === null)
            throw Error("answer refused");
        expect(battle(committed).overrides.consumed).toEqual([selection.id]);
        expect(battle(committed).overrideCommits).toEqual([selection]);
        expect(battle(committed).pendingOverride).toBeNull();
        if (side === "enemy")
            expect(parseTutorialBattleFoldState(roundTrip(battle(committed)))).toEqual(battle(committed));
        const replay = start(initial);
        const replayPrompt = pendingEnginePrompt(replay.next.battle, engine);
        if (replayPrompt === null)
            throw Error("missing replay prompt");
        expect(reduceEngineIntent(replay.next, "BATTLE_ANSWER", { side, promptId: replayPrompt.prompt.id, value: 0 }, context(12), engine)).toEqual(committed);
    });
    it("cancellation retains the committed state and makes the override available again", () => {
        const initial = host(), { next } = start(initial), opened = pendingEnginePrompt(next.battle, engine);
        if (opened === null)
            throw Error("missing prompt");
        const cancelled = reduceEngineIntent(next, "BATTLE_CANCEL", { side: "enemy", promptId: opened.prompt.id }, context(11), engine);
        if (cancelled === null)
            throw Error("cancel refused");
        expect(battle(cancelled).overrides.consumed).toEqual([]);
        expect(battle(cancelled).pendingOverride).toBeNull();
        expect(battle(cancelled).engine.slice.committed).toEqual(battle(initial).engine.slice.committed);
        expect(choice(cancelled).kind).toBe("selected");
    });
    it("durable guidance preserves delay, shared history and exact completion identity", () => {
        const early = trigger(testTutorialTriggerId("early"), "card-play", 0), late = trigger(testTutorialTriggerId("late"), "card-play", 1), initial = host("enemy", CARDS.strong, [late, early]);
        const { next } = start(initial), current = battle(next), first = currentTutorialPresentation(current);
        expect(next.tutorialTriggerIdsSeen).toEqual([early.id]);
        expect(first?.kind).toBe("tutorial-guidance");
        if (first?.kind !== "tutorial-guidance")
            throw Error("missing guidance");
        expect(first.messages[0]?.delay).toBe(0.5);
        expect(completeTutorialCheckpoint(next, { presentationId: first.id, messageIndex: 1 })).toBeNull();
        expect(completeTutorialCheckpoint(next, { presentationId: "other", messageIndex: 0 })).toBeNull();
        const completed = completeTutorialCheckpoint(next, { presentationId: first.id, messageIndex: 0 });
        if (completed === null)
            throw Error("completion refused");
        expect(battle(completed).checkpoints).toEqual([]);
        expect(completed.tutorialTriggerIdsSeen).toEqual([early.id]);
        expect(completeTutorialCheckpoint(completed, { presentationId: first.id, messageIndex: 0 })).toBeNull();
        expect(parseTutorialBattleFoldState(roundTrip(current))).toEqual(current);
    });
    it("no-target guidance is a presentation intent whose probe cannot change engine state", () => {
        registerBattleInitProvider({ engine, beginBattle: () => null });
        const initial = host("player", CARDS.target, [trigger(testTutorialTriggerId("refusal"), "card-no-valid-targets")]);
        const instance = battle(initial).engine.slice.committed.sides.player.hand[0];
        const next = tutorialCardAttempt(initial, { battleId: battle(initial).init.battleId, instance }, context());
        expect(next).not.toBeNull();
        if (next === null)
            throw Error("refusal absent");
        expect(battle(next).engine).toEqual(battle(initial).engine);
        expect(next.tutorialTriggerIdsSeen).toHaveLength(1);
        expect(tutorialCardAttempt(initial, { battleId: "wrong", instance }, context())).toBeNull();
        expect(tutorialCardAttempt(initial, { battleId: battle(initial).init.battleId, instance: "unknown" }, context())).toBeNull();
    });
});
import { beginTutorial, completeTutorialAction, registerTutorialFrontDoorContentProvider } from "../front-door";
import { beginTutorialBattle, restartTutorialBattle, exitTutorialBattle, registerTutorialBattleInitProvider } from "./tutorial-lifecycle";
import { prefixSetup, prefixActions, init, display, root } from "./tutorial-contracts-fixture";
import { parseBattleId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
function provider() {
    registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("tutorial-contract-avatar") });
    registerTutorialBattleInitProvider({ engine, overrides: [], beginTutorialPrefix: () => prefixSetup(), beginTutorialBattle: input => ({ init: { ...display(), battleId: parseBattleId(`tutorial-contract:${input.tutorialRunId}:${input.restartNumber}`) }, engineInit: init("player", CARDS.strong) }) });
}
afterEach(() => { registerTutorialBattleInitProvider(null); registerTutorialFrontDoorContentProvider(null); });
describe("tutorial lifecycle identities and explicit reset", () => {
    it("replays the prefix to its terminal cursor then creates an independent live engine init", () => {
        provider();
        const initial = root();
        const prefix = beginTutorial(initial.frontDoor, { actions: prefixActions, startAtEnd: true }, context(20), initial.journey);
        if (prefix === null || prefix.tutorial === null)
            throw Error("prefix refused");
        expect(prefix.tutorial.currentActionIndex).toBeNull();
        expect(prefix.tutorial.prefix?.engine.slice.committed.turn.turnNumber).toBe(4);
        const completed = { ...initial, frontDoor: prefix }, opened = beginTutorialBattle(completed, { tutorialRunId: prefix.tutorial.runId }, context(21));
        if (opened === null)
            throw Error("live init refused");
        expect(battle(opened).engine.slice.committed.turn.turnNumber).toBe(1);
        expect(battle(opened).engine.slice.committed.sides.player.hand).toHaveLength(1);
        expect(beginTutorialBattle(opened, { tutorialRunId: prefix.tutorial.runId }, context(22))).toBeNull();
        expect(restartTutorialBattle(opened, { battleId: "wrong" }, context(22))).toBeNull();
        const restarted = restartTutorialBattle(opened, { battleId: battle(opened).init.battleId }, context(22));
        if (restarted === null)
            throw Error("restart refused");
        expect(battle(restarted).mode.restartNumber).toBe(1);
        expect(battle(restarted).init.battleId).not.toBe(battle(opened).init.battleId);
        expect(exitTutorialBattle(restarted, { battleId: battle(restarted).init.battleId }, context(23))).toBeNull();
        expect(exitTutorialBattle(restarted, { battleId: battle(opened).init.battleId }, context(23))).toBeNull();
    });
    it("rejects missing providers, wrong runs, and stale or duplicate authored completion", () => {
        const initial = root();
        registerTutorialBattleInitProvider(null);
        expect(beginTutorial(initial.frontDoor, { actions: prefixActions }, context(), initial.journey)).toBeNull();
        provider();
        const opened = beginTutorial(initial.frontDoor, { actions: prefixActions }, context(), initial.journey);
        if (opened?.tutorial == null)
            throw Error("prefix refused");
        expect(completeTutorialAction(opened, { runId: "other", actionId: prefixActions[0].id }, context(11))).toBeNull();
        const completed = completeTutorialAction(opened, { runId: opened.tutorial.runId, actionId: prefixActions[0].id }, context(11));
        if (completed === null)
            throw Error("completion refused");
        expect(completeTutorialAction(completed, { runId: opened.tutorial.runId, actionId: prefixActions[0].id }, context(12))).toBeNull();
        expect(beginTutorialBattle({ ...initial, frontDoor: completed }, { tutorialRunId: opened.tutorial.runId }, context(13))).toBeNull();
    });
    it.each(["player", "enemy"] as const)("maps a genuine %s blocker designation to its defending lane", side => {
        const other = side === "player" ? "enemy" : "player", base = init(other, CARDS.weak);
        const initial = host(other, CARDS.weak, [], { ...base, decks: { player: [{ cardId: CARDS.strong }], enemy: [{ cardId: CARDS.strong }] }, setup: { ...base.setup!, placements: [{ side: other, deckIndex: 0, zone: "play", slot: { rank: "front", index: 4 } }, { side, deckIndex: 0, zone: "play", slot: { rank: "front", index: 4 } }], turn: base.setup!.turn } });
        const dusk = reduceEngineIntent(initial, "BATTLE_ACTION", { side: other, action: { kind: "pass" } }, context(), engine);
        if (dusk === null)
            throw Error("dusk refused");
        const next = reduceEngineIntent(dusk, "BATTLE_ACTION", { side, action: { kind: "pass" } }, context(11), engine);
        if (next === null)
            throw Error("designation refused");
        const checkpoint = battle(next).checkpoints.find(c => c.presentation.kind === "opponent-block");
        expect(checkpoint?.presentation).toMatchObject({ kind: "opponent-block", activeSide: other, blockers: [{ slotId: "F4" }] });
    });
});
describe("pending override reload references", () => {
    it("accepts a genuine suspended play and rejects forged UUID/id/physical references", () => {
        const { next } = start(host()), current = battle(next), saved = roundTrip(current);
        expect(parseTutorialBattleFoldState(saved)).toEqual(current);
        for (const change of [{ id: trigger(testTutorialTriggerId("foreign"), "card-play").id }, { triggerCardId: CARDS.weak }, { actionCardId: CARDS.weak }, { instance: current.engine.slice.committed.sides.enemy.deck[0] }]) {
            expect(parseTutorialBattleFoldState({ ...saved, pendingOverride: { ...saved.pendingOverride, ...change } })).toBeNull();
        }
        expect(parseTutorialBattleFoldState({ ...saved, engine: { ...saved.engine, slice: { ...saved.engine.slice, inFlight: null, publishedEvents: 0 } } })).toBeNull();
    });
});
describe("override commitment across real target and repeated-instance prompts", () => {
    it("does not consume a previous same-turn play when that copy returns and suspends again", () => {
        const base = init("player", CARDS.choice), initial = host("player", CARDS.choice, [], { ...base, decks: { player: [{ cardId: CARDS.choice }, { cardId: CARDS.bounce }], enemy: [{ cardId: CARDS.weak }] }, setup: { ...base.setup!, placements: [{ side: "player", deckIndex: 0, zone: "hand" }, { side: "player", deckIndex: 1, zone: "hand" }] } });
        const instance = battle(initial).engine.slice.committed.sides.player.hand[0];
        const play = engine.legalActions(battle(initial).engine.slice.committed, "player").find(action => action.kind === "play" && action.card === instance)!;
        const first = reduceEngineIntent(initial, "BATTLE_ACTION", { side: "player", action: play }, context(40), engine)!;
        const cost = pendingEnginePrompt(first.battle, engine)!;
        const committed = reduceEngineIntent(first, "BATTLE_ANSWER", { side: "player", promptId: cost.prompt.id, value: 0 }, context(41), engine)!;
        const bounce = engine.legalActions(battle(committed).engine.slice.committed, "player").find(action => action.kind === "play")!;
        let returned = reduceEngineIntent(committed, "BATTLE_ACTION", { side: "player", action: bounce }, context(42), engine)!;
        const target = pendingEnginePrompt(returned.battle, engine);
        if (target !== null)
            returned = reduceEngineIntent(returned, "BATTLE_ANSWER", { side: "player", promptId: target.prompt.id, value: [instance] }, context(43), engine)!;
        expect(battle(returned).engine.slice.committed.sides.player.hand).toContain(instance);
        expect(battle(returned).engine.slice.committed.turnLog.played.player.filter(play => play.instance === instance)).toHaveLength(1);
        const suspended = start(returned);
        expect(battle(suspended.next).overrides.consumed).toEqual([]);
        const nextCost = pendingEnginePrompt(suspended.next.battle, engine)!;
        const cancelled = reduceEngineIntent(suspended.next, "BATTLE_CANCEL", { side: "player", promptId: nextCost.prompt.id }, context(44), engine)!;
        expect(battle(cancelled).overrides.consumed).toEqual([]);
        expect(battle(cancelled).pendingOverride).toBeNull();
        const again = start(cancelled), againCost = pendingEnginePrompt(again.next.battle, engine)!;
        const twice = reduceEngineIntent(again.next, "BATTLE_ANSWER", { side: "player", promptId: againCost.prompt.id, value: 0 }, context(45), engine)!;
        expect(battle(twice).overrides.consumed).toEqual([again.selection.id]);
        expect(battle(twice).engine.slice.committed.turnLog.played.player.filter(play => play.instance === instance)).toHaveLength(2);
    });
    it("retains the UUID selection through an actual target prompt then consumes on commit", () => {
        const base = init("enemy", CARDS.target), initial = host("enemy", CARDS.target, [], { ...base, decks: { player: [{ cardId: CARDS.strong }, { cardId: CARDS.strong }], enemy: [{ cardId: CARDS.target }] }, setup: { ...base.setup!, placements: [{ side: "enemy", deckIndex: 0, zone: "hand" }, { side: "player", deckIndex: 0, zone: "play", slot: { rank: "back", index: 4 } }, { side: "player", deckIndex: 1, zone: "play", slot: { rank: "back", index: 5 } }] } });
        const { next, selection } = start(initial), pending = pendingEnginePrompt(next.battle, engine);
        expect(pending?.prompt.kind).toBe("chooseTargets");
        expect(battle(next).overrides.consumed).toEqual([]);
        expect(parseTutorialBattleFoldState(roundTrip(battle(next)))).toEqual(battle(next));
        if (pending?.prompt.kind !== "chooseTargets")
            throw Error("missing targets");
        const answer = reduceEngineIntent(next, "BATTLE_ANSWER", { side: "enemy", promptId: pending.prompt.id, value: [pending.prompt.candidates[0]] }, context(46), engine)!;
        expect(battle(answer).overrideCommits).toEqual([selection]);
        expect(battle(answer).overrides.consumed).toEqual([selection.id]);
    });
});

function roundTrip<T extends object>(value:T):T & Record<string,unknown> {return JSON.parse(JSON.stringify(value)) as T & Record<string,unknown>;}

import { replayEngineBattle } from "./engine-battle";
import { tutorialBattleId } from "../../battle/integration/tutorial-setup";
import { RUN } from "./tutorial-contracts-fixture";
import { testEventActor } from "../../types/test-identities";
import type { CommittedEvent } from "../../eventlog/local-log";
function recorded(type:CommittedEvent["event"]["type"],payload:Record<string,unknown>,seq:number):CommittedEvent {
 return {seq,event:{type,payload,actor:testEventActor("tutorial-contract-client"),basedOnSeq:seq-1,clientTimestamp:context().timestamp}};
}
describe("tutorial engine replay start identities",()=>{
 it("replays the actual action and answer from its tutorial run",()=>{
   const initial=host(),started=start(initial),prompt=pendingEnginePrompt(started.next.battle,engine)!;
   const answered=reduceEngineIntent(started.next,"BATTLE_ANSWER",{side:"enemy",promptId:prompt.prompt.id,value:0},context(11),engine)!;
   const action=choice(initial).choice.action,current=battle(answered);
   const events=[recorded("BEGIN_TUTORIAL_BATTLE",{tutorialRunId:RUN},1),recorded("BATTLE_ACTION",{side:"enemy",action,override:started.selection},10),recorded("BATTLE_ANSWER",{side:"enemy",promptId:prompt.prompt.id,value:0},11)];
   const replay=replayEngineBattle(engine,current,events,batch=>batch.events);
   expect(replay.kind).toBe("done");if(replay.kind === "done")expect(replay.replay.slice).toEqual(current.engine.slice);
   expect(replayEngineBattle(engine,current,[recorded("BEGIN_TUTORIAL_BATTLE",{tutorialRunId:"foreign"},1)],()=>[]).kind).toBe("failed");
 });
 it("selects only the restart that names the exact prior tutorial battle",()=>{
   const base=battle(host()),current={...base,mode:{...base.mode,restartNumber:1},init:{...base.init,battleId:tutorialBattleId(RUN,1)}};
   const events=[recorded("BEGIN_TUTORIAL_BATTLE",{tutorialRunId:RUN},1),recorded("RESTART_TUTORIAL_BATTLE",{battleId:"foreign"},2),recorded("RESTART_TUTORIAL_BATTLE",{battleId:tutorialBattleId(RUN,0)},3)];
   const replay=replayEngineBattle(engine,current,events,()=>[]);expect(replay.kind).toBe("done");if(replay.kind === "done")expect(replay.replay.start).toBe(2);
 });
});

import { runStep } from "../../engine/steps/runner";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { EmptyPrompt } from "../../engine/steps/errors";
describe("refusal guidance cost boundary",()=>{
 it("an actual empty cost selection cannot be presented as no valid spell target",()=>{
   registerBattleInitProvider({engine,beginBattle:()=>null});
   const definition={...trigger(testTutorialTriggerId("cost-refusal"),"card-no-valid-targets"),match:{kind:"card-id" as const,cardId:CARDS.blockedCost}};
   const initial=host("player",CARDS.blockedCost,[definition]),board=battle(initial).engine.slice.committed,instance=board.sides.player.hand[0];
   let failure:unknown=null;try {runStep(board,{kind:"play",card:instance,from:"hand"},NO_PROMPTS,engine.catalog,{dryRun:true});}catch(error){failure=error;}
   expect(failure).toBeInstanceOf(EmptyPrompt);if(failure instanceof EmptyPrompt)expect(failure.prompt.purpose.role).not.toBe("target");
   expect(tutorialCardAttempt(initial,{battleId:battle(initial).init.battleId,instance},context())).toBeNull();
   expect(board).toEqual(battle(initial).engine.slice.committed);
 });
});

function winning(side: "player" | "enemy") {
    const base = init(side, CARDS.strong);
    let current = host(side, CARDS.strong, [], { ...base, scoreToWin: 3, victorySides: ["player", "enemy"], setup: { ...base.setup!, placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "front", index: 0 } }] } });
    const other = side === "player" ? "enemy" : "player";
    for (const [index, actor] of [side, other, side].entries()) {
        const next = reduceEngineIntent(current, "BATTLE_ACTION", { side: actor, action: { kind: "pass" } }, context(500 + index), engine);
        if (next === null) throw Error("winning pass refused");
        current = next;
    }
    expect(battle(current).engine.slice.committed.result).toMatchObject({ kind: "victory", winner: side });
    expect(battle(current).engine.slice.committed.sides[side].score).toBeGreaterThanOrEqual(3);
    return current;
}
function settle(state: ReturnType<typeof host>) {
    let current = state;
    for (const checkpoint of battle(state).checkpoints) {
        const presentation = checkpoint.presentation;
        const count = presentation.kind === "tutorial-guidance" ? presentation.messages.length : 1;
        for (let messageIndex = 0; messageIndex < count; messageIndex++) {
            const next = completeTutorialCheckpoint(current, { presentationId: presentation.id, messageIndex });
            if (next === null) throw Error("winning checkpoint refused");
            current = next;
        }
    }
    return current;
}
describe("tutorial authoritative settled victory handoff", () => {
    it("rejects active and suspended battles without changing their engine or pending choice", () => {
        provider();
        for (const current of [host("player", CARDS.strong), start(host()).next]) {
            const saved = roundTrip(current);
            expect(exitTutorialBattle(current, { battleId: battle(current).init.battleId }, context(510))).toBeNull();
            expect(current).toEqual(saved);
        }
    });
    it("requires actual player victory and all committed presentation checkpoints before one Avatar handoff", () => {
        provider();
        const won = winning("player"), saved = roundTrip(won), id = battle(won).init.battleId;
        expect(battle(won).checkpoints.length).toBeGreaterThan(0);
        expect(exitTutorialBattle(won, { battleId: id }, context(511))).toBeNull();
        expect(won).toEqual(saved);
        const settled = settle(won);
        expect(battle(settled).checkpoints).toEqual([]);
        expect(battle(settled).checkpoints).toEqual([]);
        expect(battle(settled).engine.slice.inFlight).toBeNull();
        expect(exitTutorialBattle(settled, { battleId: "foreign" }, context(512))).toBeNull();
        const exited = exitTutorialBattle(settled, { battleId: id }, context(513));
        expect(exited?.battle).toBeNull();
        expect(exited?.journey.screen).toMatchObject({ type: "journeyStart", tutorialAvatarId: testAvatarId("tutorial-contract-avatar") });
        if (exited === null) throw Error("settled player handoff refused");
        expect(exitTutorialBattle(exited, { battleId: id }, context(514))).toBeNull();
        expect(exitTutorialBattle(roundTrip(settled), { battleId: id }, context(513))).toEqual(exited);
        expect(settle(winning("player"))).toEqual(settled);
    });
    it("rejects a genuine enemy victory even after its presentations settle", () => {
        provider();
        const lost = settle(winning("enemy")), saved = roundTrip(lost);
        expect(exitTutorialBattle(lost, { battleId: battle(lost).init.battleId }, context(515))).toBeNull();
        expect(lost).toEqual(saved);
    });
});
