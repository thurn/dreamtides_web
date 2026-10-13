import { BATTLE } from "../../content/battle";
import type { Engine, EngineEvent, InstanceId, Action, BattleState } from "../../engine";
import type { TutorialAction } from "../../types/tutorial";
import type { BattleSlotViewId, TutorialActionId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { TutorialBattleDisplayInit, EngineBattleFold } from "./fold";
import { applyEngineBattleIntent, batchStates, collectEngineWork, foldAdapterFor, startEngineBattle } from "./engine-battle";
import type { TutorialSetup } from "../../battle/integration/tutorial-setup";
/** A genuine published engine event and its public presentation frame. */
export interface TutorialPrefixEvent {
    readonly event: EngineEvent;
    readonly before: BattleState;
    readonly state: BattleState;
    readonly index: number;
}
/** Authored draw presentation bound to a real physical copy and producer. */
export interface TutorialPrefixDraw {
    readonly actionId: TutorialActionId;
    readonly instance: InstanceId;
    readonly source: "setup" | "turn-draw" | "dreamwell-effect";
    readonly eventIndex: number | null;
}
export interface TutorialPrefixState {
    readonly init: TutorialBattleDisplayInit;
    readonly engine: EngineBattleFold;
    readonly events: readonly TutorialPrefixEvent[];
    readonly draws: readonly TutorialPrefixDraw[];
    readonly actionFrames: readonly {
        readonly actionId: TutorialActionId;
        readonly state: BattleState;
    }[];
}
export function startTutorialPrefix(engine: Engine, setup: TutorialSetup, actions: readonly TutorialAction[], seq: number): TutorialPrefixState | null {
    const fold = startEngineBattle(setup.engineInit, engine, seq);
    if (fold === null)
        return null;
    const first = actions.find(action => action.action === "draw-opponent-card");
    if (first?.action !== "draw-opponent-card")
        return null;
    const instance = fold.slice.committed.sides.enemy.hand.find(id => cardIdOf(fold.slice.committed, id) === first.cardId);
    if (instance === undefined)
        return null;
    return { init: setup.init, engine: fold, events: [], draws: [{ actionId: first.id, instance, source: "setup", eventIndex: null }], actionFrames: [] };
}
export function prefixPlayerInstance(prefix: TutorialPrefixState, playerCardId: CardId): InstanceId | null {
    return prefix.engine.slice.committed.sides.player.hand.find(id => cardIdOf(prefix.engine.slice.committed, id) === playerCardId) ?? null;
}
function cardIdOf(state: BattleState, id: InstanceId): CardId | null {
    const printing = state.instances[id]?.printing;
    return printing?.kind === "card" || printing?.kind === "figmentCopy" ? printing.cardId : null;
}
/** Every derived action is an ordinary legal intent on the public engine fold. */
function act(engine: Engine, prefix: TutorialPrefixState, action: Action, seq: number, actions: readonly TutorialAction[]): TutorialPrefixState | null {
    const side = engine.decision(prefix.engine.slice.committed)?.side;
    if (side === undefined)
        return null;
    const from = prefix.engine.slice;
    const outcome = applyEngineBattleIntent(engine, prefix.engine, { kind: "battleAction", side, action }, seq, { presented: () => true, limit: BATTLE.presentation.maxObservedEventStates });
    if (outcome.kind !== "applied" || outcome.error !== null || outcome.slice.inFlight !== null)
        return null;
    const states = batchStates(foldAdapterFor(engine), from, outcome.slice, outcome.published);
    let phase = states.before.turn.phase;
    const events = [...prefix.events];
    const draws = [...prefix.draws];
    const already = new Set(draws.map(draw => draw.actionId));
    for (const [at, event] of outcome.published.entries()) {
        if (event.kind === "phaseChanged")
            phase = event.phase;
        const state = states.eventStates[at] ?? states.state;
        const index = events.length;
        events.push({ event, before: at === 0 ? states.before : events[events.length - 1].state, state, index });
        if (event.kind !== "cardDrawn" || event.instance === null)
            continue;
        const cardId = cardIdOf(state, event.instance);
        const source = phase === "dreamwell" ? "dreamwell-effect" : "turn-draw";
        const authored = actions.find(action => !already.has(action.id) && (action.action === "draw-opponent-card" && event.side === "enemy" && action.cardId === cardId && source === "turn-draw" ||
            action.action === "draw-card" && action.owner === event.side && action.cardId === cardId && action.reason === source));
        if (authored !== undefined) {
            already.add(authored.id);
            draws.push({ actionId: authored.id, instance: event.instance, source, eventIndex: index });
        }
    }
    return { ...prefix, engine: { ...prefix.engine, slice: outcome.slice }, events, draws };
}
function passes(engine: Engine, prefix: TutorialPrefixState, seq: number, actions: readonly TutorialAction[], at: (state: BattleState) => boolean): TutorialPrefixState | null {
    let current: TutorialPrefixState | null = prefix;
    // The exact authored two normal turns cross three main windows each.
    while (current !== null && !at(current.engine.slice.committed)) {
        const next = act(engine, current, { kind: "pass" }, seq, actions);
        if (next === null || next.engine.slice.committed.version === current.engine.slice.committed.version)
            return null;
        current = next;
    }
    return current;
}
export function playPrefixPlayer(engine: Engine, prefix: TutorialPrefixState, card: InstanceId, seq: number, actions: readonly TutorialAction[], targetSlotId: BattleSlotViewId | null): TutorialPrefixState | null {
    let slot: import("../../engine").Slot | undefined;
    if (targetSlotId !== null) {
        const match = /^(?:B|player-back-)(\d+)$/.exec(targetSlotId);
        if (match === null) return null;
        const index = Number(match[1]);
        if (!Number.isSafeInteger(index)) return null;
        slot = { rank: "back", index };
    }
    return collectEngineWork(seq, () => act(engine, prefix, { kind: "play", card, from: "hand", ...(slot === undefined ? {} : { slot }) }, seq, actions));
}
/** Advance the authored beat; draws bind published events and never execute a second draw. */
export function completePrefixAction(engine: Engine, prefix: TutorialPrefixState, action: TutorialAction, actions: readonly TutorialAction[], seq: number): TutorialPrefixState | null {
    if (prefix.actionFrames.some(frame => frame.actionId === action.id))
        return prefix;
    return collectEngineWork(seq, () => {
        let next: TutorialPrefixState | null = prefix;
        const state = prefix.engine.slice.committed;
        switch (action.action) {
            case "reveal-and-play-opponent-card": {
                const card = state.sides.enemy.hand.find(id => cardIdOf(state, id) === action.cardId);
                if (card === undefined)
                    return null;
                const slot = state.sides.enemy.backRank.findIndex(id => id === null);
                next = act(engine, prefix, { kind: "play", card, from: "hand", slot: { rank: "back", index: slot } }, seq, actions);
                if (next !== null && state.turn.turnNumber === 1)
                    next = passes(engine, next, seq, actions, s => s.turn.turnNumber === 2 && s.turn.phase === "day");
                break;
            }
            case "end-turn":
                next = passes(engine, prefix, seq, actions, s => s.turn.turnNumber === 3 && s.turn.phase === "day");
                break;
            case "reposition-opponent-character": {
                const card = state.sides.enemy.backRank.find(id => id !== null && cardIdOf(state, id) === action.cardId);
                if (card === undefined || card === null)
                    return null;
                next = act(engine, prefix, { kind: "reposition", card, to: { rank: "front", index: 0 } }, seq, actions);
                if (next !== null)
                    next = passes(engine, next, seq, actions, s => s.turn.phase === "dusk");
                break;
            }
            case "reposition-player-character": {
                const card = state.sides.player.backRank.find(id => id !== null && cardIdOf(state, id) === action.cardId);
                if (card === undefined || card === null)
                    return null;
                next = act(engine, prefix, { kind: "reposition", card, to: { rank: "front", index: 0 } }, seq, actions);
                break;
            }
            case "resolve-challenge":
                next = passes(engine, prefix, seq, actions, s => s.turn.turnNumber === 4 && s.turn.phase === "day");
                break;
            case "draw-card":
            case "draw-opponent-card":
                if (!prefix.draws.some(draw => draw.actionId === action.id))
                    return null;
                break;
            case "draw-dreamwell-card":
                if (!prefix.events.some(({ event }) => event.kind === "dreamwellDrawn" && event.side === action.owner && event.card === action.cardId))
                    return null;
                break;
        }
        return next === null ? null : { ...next, actionFrames: [...next.actionFrames, { actionId: action.id, state: next.engine.slice.committed }] };
    });
}
/** Automatic authored work executes as a beat enters, while its snapshot supplies the cinematic. */
export function enterPrefixAction(engine: Engine, prefix: TutorialPrefixState, action: TutorialAction | undefined, actions: readonly TutorialAction[], seq: number): TutorialPrefixState | null {
    return action?.action === "reveal-and-play-opponent-card" || action?.action === "reposition-opponent-character" || action?.action === "resolve-challenge" ? completePrefixAction(engine, prefix, action, actions, seq) : prefix;
}
