import { describe, expect, it } from "vitest";
import { collectEngineWork, takeEngineLogRecords } from "./engine-battle";
import { engine, CARDS, prefixActions as actions, prefixSetup } from "./tutorial-contracts-fixture";
import { startTutorialPrefix, completePrefixAction, playPrefixPlayer } from "./tutorial-prefix";
import { testTutorialActionId } from "../../types/test-identities";
function start() {
    const setup = prefixSetup();
    const prefix = startTutorialPrefix(engine, setup, actions, 100);
    if (prefix === null)
        throw Error("prefix refused");
    return prefix;
}
describe("authored prefix uses ordinary engine actions", () => {
    it("declares only the first reveal, then binds the real normal draw and challenge", () => {
        let prefix = start();
        expect(prefix.draws).toMatchObject([{ actionId: actions[0].id, source: "setup", eventIndex: null }]);
        expect(prefix.events).toEqual([]);
        for (const action of actions) {
            if (action.action === "end-turn") {
                const card = prefix.engine.slice.committed.sides.player.hand[0];
                if (card === undefined)
                    throw Error("player did not draw");
                const next = playPrefixPlayer(engine, prefix, card, 101, actions, null);
                if (next === null)
                    throw Error("player play refused");
                prefix = next;
            }
            const next = completePrefixAction(engine, prefix, action, actions, 102);
            if (next === null)
                throw Error(`beat refused ${action.action}`);
            prefix = next;
        }
        const draw = prefix.events.find(entry => entry.event.kind === "cardDrawn" && entry.event.side === "player");
        expect(draw?.state.turn).toMatchObject({ round: 1, turnNumber: 2 });
        expect(draw?.state.sides.player.hand).toHaveLength(1);
        expect(prefix.draws[1]).toMatchObject({ actionId: actions[4].id, source: "turn-draw" });
        const lane = prefix.events.find(entry => entry.event.kind === "laneResolved");
        expect(lane?.event).toMatchObject({ kind: "laneResolved", lane: 0, challengerSpark: 2, blockerSpark: 4, winner: "player", scored: 0 });
        expect(prefix.engine.slice.committed.sides.enemy.void).toHaveLength(1);
        expect(prefix.engine.slice.committed.sides.enemy.score).toBe(2);
        expect(prefix.engine.slice.committed.sides.player.fatigueCount).toBe(0);
        expect(JSON.parse(JSON.stringify(prefix))).toEqual(prefix);
    });
    it("retains both reposition and challenge actions from nested same-event work", () => {
        let prefix = start();
        for (const action of actions.slice(0, 7)) {
            if (action.action === "end-turn") {
                const card = prefix.engine.slice.committed.sides.player.hand[0];
                prefix = playPrefixPlayer(engine, prefix, card, 201, actions, null)!;
            }
            prefix = completePrefixAction(engine, prefix, action, actions, 202)!;
        }
        const seq = 203;
        collectEngineWork(seq, () => { prefix = completePrefixAction(engine, prefix, actions[7], actions, seq)!; prefix = completePrefixAction(engine, prefix, actions[8], actions, seq)!; });
        const logs = takeEngineLogRecords(seq).filter(record => record.event === "engine.action");
        expect(logs.some(record => record.event === "engine.action" && record.action.kind === "reposition")).toBe(true);
        expect(logs.filter(record => record.event === "engine.action" && record.action.kind === "pass").length).toBeGreaterThan(0);
        expect(takeEngineLogRecords(seq)).toEqual([]);
    });
    it("does not synthesize a draw whose authored UUID or reason has no producer", () => {
        const prefix = start();
        expect(completePrefixAction(engine, prefix, { id: testTutorialActionId("absent"), action: "draw-card", owner: "player", cardId: CARDS.strong, reason: "dreamwell-effect", wait: 0 }, actions, 300)).toBeNull();
    });
});

import { afterEach } from "vitest";
import { beginTutorial, frontDoorAction, completeTutorialAction, registerTutorialFrontDoorContentProvider } from "../front-door";
import { registerTutorialBattleInitProvider } from "./tutorial-lifecycle";
import { root, context } from "./tutorial-contracts-fixture";
import { parseBattleCardId, parseBattleSlotViewId } from "../../types/identifiers";
import { testAvatarId } from "../../types/test-identities";
import type { FrontDoorState } from "../fold-state";
function playable(occupied = false): FrontDoorState {
    const setup = prefixSetup();
    if (occupied) {
        setup.engineInit = { ...setup.engineInit, setup: { ...setup.engineInit.setup!, placements: [...setup.engineInit.setup!.placements, { side: "player", deckIndex: 1, zone: "play", slot: { rank: "back", index: 0 } }] } };
    }
    registerTutorialFrontDoorContentProvider({ playerCardId: CARDS.strong, journeyAvatarId: testAvatarId("prefix-avatar") });
    registerTutorialBattleInitProvider({ engine, overrides: [], beginTutorialPrefix: () => setup, beginTutorialBattle: () => null });
    const initial = root();
    const opened = beginTutorial(initial.frontDoor, { actions, startActionId: actions[2].id }, context(400), initial.journey);
    if (opened?.tutorial?.prefix === undefined) throw Error("no playable prefix");
    return opened;
}
function playDetail(state: FrontDoorState, slot: unknown) {
    const tutorial = state.tutorial!, card = tutorial.prefix!.engine.slice.committed.sides.player.hand[0];
    if (card === undefined) throw Error("no drawn physical copy");
    return { surface: "tutorial", actionId: "play-card", detail: { runId: tutorial.runId, cardInstanceId: parseBattleCardId(card), cardId: CARDS.strong, targetSlotId: slot } };
}
afterEach(() => { registerTutorialFrontDoorContentProvider(null); registerTutorialBattleInitProvider(null); });
describe("tutorial front-door drop contract", () => {
    it.each(["B1", "player-back-2"])("commits selected %s and retains authored continuation and replay", name => {
        const initial = playable(), saved = JSON.parse(JSON.stringify(initial)) as FrontDoorState;
        const payload = playDetail(initial, parseBattleSlotViewId(name)), detail = payload.detail;
        const selected = name === "B1" ? 1 : 2;
        let next = frontDoorAction(initial, payload, context(401));
        expect(next).not.toBeNull();
        if (next?.tutorial?.prefix === undefined) throw Error("play refused");
        const board = next.tutorial.prefix.engine.slice.committed;
        expect(board.sides.player.backRank[selected]).toBe(detail.cardInstanceId);
        expect(board.sides.player.backRank[0]).toBeNull();
        expect(next.tutorial.prefix.events.filter(entry => entry.event.kind === "materialized" && parseBattleCardId(entry.event.instance) === detail.cardInstanceId).map(entry => entry.event)).toMatchObject([{ slot: { rank: "back", index: selected } }]);
        expect(next.tutorial.playerCardPlay?.targetSlotId).toBe(name);
        expect(initial).toEqual(saved);
        expect(frontDoorAction(saved, payload, context(401))).toEqual(next);
        expect(frontDoorAction(next, payload, context(402))).toBeNull();
        for (const action of actions.slice(2)) {
            const advanced = completeTutorialAction(next, { runId: next.tutorial!.runId, actionId: action.id }, context(403));
            if (advanced === null) throw Error(`continuation refused ${action.action}`);
            next = advanced;
        }
        expect(next.tutorial?.currentActionIndex).toBeNull();
        expect(next.tutorial?.prefix?.engine.slice.committed.turn.turnNumber).toBe(4);
        expect(next.tutorial?.prefix?.events.find(entry => entry.event.kind === "laneResolved")?.event).toMatchObject({ kind: "laneResolved", winner: "player", lane: 0 });
    });
    it("null selects the ordinary leftmost open cell and occupied or out-of-bounds drops bounce atomically", () => {
        const initial = playable(true), saved = JSON.parse(JSON.stringify(initial)) as FrontDoorState;
        const card = playDetail(initial, null).detail.cardInstanceId;
        const next = frontDoorAction(initial, playDetail(initial, null), context(410));
        expect(next?.tutorial?.prefix?.engine.slice.committed.sides.player.backRank[1]).toBe(card);
        const length = initial.tutorial!.prefix!.engine.slice.committed.sides.player.backRank.length;
        for (const slot of ["B0", `B${length}`, "F1", "enemy-back-1", "B-1", "B1.5", `B${Number.MAX_SAFE_INTEGER}0`]) {
            expect(frontDoorAction(initial, playDetail(initial, slot), context(411))).toBeNull();
            expect(initial).toEqual(saved);
        }
        const normal = playable();
        expect(frontDoorAction(normal, playDetail(normal, null), context(412))?.tutorial?.prefix?.engine.slice.committed.sides.player.backRank[0]).toBe(playDetail(normal, null).detail.cardInstanceId);
    });
    it("foreign run, physical copy and card UUID cannot commit a drop", () => {
        const initial = playable(), saved = JSON.parse(JSON.stringify(initial)) as FrontDoorState, payload = playDetail(initial, "B1");
        for (const fields of [{ runId: "foreign" }, { cardInstanceId: "foreign" }, { cardId: CARDS.weak }]) {
            expect(frontDoorAction(initial, { ...payload, detail: { ...payload.detail, ...fields } }, context(420))).toBeNull();
            expect(initial).toEqual(saved);
        }
    });
});
