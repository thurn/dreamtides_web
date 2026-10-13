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
                const next = playPrefixPlayer(engine, prefix, card, 101, actions);
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
                prefix = playPrefixPlayer(engine, prefix, card, 201, actions)!;
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
