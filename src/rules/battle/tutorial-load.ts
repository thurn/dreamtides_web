import { knows } from "../../engine/view/knowledge";
import { parseTutorialTriggers } from "../../data/tutorial-actions";
import { isTutorialBattleAiActionOverrides } from "../../types/tutorial-ai-action-overrides";
import { cardIdFromUnknown } from "../../types/card-identity";
import { dreamwellCardIdFromUnknown, tutorialAiActionOverrideIdFromUnknown, parseTutorialTriggerId, parsePresentationId, parseTutorialRunId } from "../../types/identifiers";
import { parseEngineBattleFold, parseJourneyBattleFoldState, type TutorialBattleFoldState } from "./fold";
import type { EngineBattleFold, JourneyBattleGuidance } from "./fold";
function identity(parser: (value: unknown) => unknown, value: unknown): unknown { try {
    return parser(value);
}
catch {
    return null;
} }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function index(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function side(value: unknown): boolean { return value === "player" || value === "enemy"; }
function instance(value: unknown): boolean { return typeof value === "string" && /^i\d+$/u.test(value); }
function selection(value: unknown): boolean { return record(value) && tutorialAiActionOverrideIdFromUnknown(value.id) !== null && dreamwellCardIdFromUnknown(value.triggerCardId) !== null && cardIdFromUnknown(value.actionCardId) !== null && instance(value.instance); }
function frame(value: unknown, engine: EngineBattleFold): boolean {
    return parseEngineBattleFold({ init: engine.init, slice: { ...engine.slice, committed: value, inFlight: null, publishedEvents: 0 } }) !== null;
}
function source(value: unknown): boolean {
    if (!record(value))
        return false;
    if (value.kind === "card" || value.kind === "figment")
        return cardIdFromUnknown(value.cardId) !== null && instance(value.battleCardId) && side(value.side) && (value.kind === "figment" || value.cardKind === "character" || value.cardKind === "event");
    if (value.kind === "dreamwell")
        return dreamwellCardIdFromUnknown(value.cardId) !== null && side(value.side);
    return (value.kind === "battle" || value.kind === "challenge") && side(value.activeSide) && index(value.turnNumber) && (value.kind === "battle" || typeof value.slotId === "string" && /^F[0-8]$/u.test(value.slotId));
}
function presentation(value: unknown): boolean {
    if (!record(value) || identity(parsePresentationId, value.id) === null)
        return false;
    switch (value.kind) {
        case "tutorial-guidance":
            return source(value.source) && typeof value.automatic === "boolean" && index(value.messageIndex) && Array.isArray(value.messages) && value.messages.length > value.messageIndex && value.messages.every(message => record(message) && identity(parseTutorialTriggerId, message.triggerId) !== null && ["mira", "player", "enemy"].includes(String(message.speaker)) && typeof message.text === "string" && typeof message.duration === "number" && Number.isFinite(message.duration) && message.duration >= 0 && (message.delay === undefined || typeof message.delay === "number" && Number.isFinite(message.delay) && message.delay >= 0) && [message.horizontalOffset, message.verticalOffset, message.bubbleWidth].every(number => typeof number === "number" && Number.isFinite(number)));
        case "opponent-play":
            return cardIdFromUnknown(value.cardId) !== null && instance(value.battleCardId) && (value.cardKind === "character" || value.cardKind === "event");
        case "dreamwell-reveal":
            return dreamwellCardIdFromUnknown(value.cardId) !== null && side(value.side) && index(value.turnNumber);
        case "opponent-block":
            return side(value.activeSide) && Array.isArray(value.blockers) && value.blockers.every(entry => record(entry) && instance(entry.battleCardId) && instance(entry.challengerBattleCardId) && typeof entry.slotId === "string" && /^F[0-8]$/u.test(entry.slotId));
        case "challenge-resolved":
            return side(value.activeSide) && typeof value.slotId === "string" && /^F[0-8]$/u.test(value.slotId) && instance(value.challengerBattleCardId) && (value.blockerBattleCardId === null || instance(value.blockerBattleCardId)) && Array.isArray(value.dissolved) && value.dissolved.every(entry => record(entry) && side(entry.side) && instance(entry.battleCardId)) && (value.scored === null || record(value.scored) && side(value.scored.side) && instance(value.scored.battleCardId) && typeof value.scored.points === "number" && Number.isFinite(value.scored.points) && value.scored.points >= 0);
        default: return false;
    }
}

function dreamwellDefinitions(value: unknown): boolean {
    return Array.isArray(value) && value.every(card => record(card) && dreamwellCardIdFromUnknown(card.id) !== null && typeof card.renderedText === "string" && typeof card.name === "string" && [card.energyAdded, card.order, card.cardNumber, card.imageNumber].every(number => typeof number === "number" && Number.isFinite(number)));
}

/** Legacy journey saves omit the host; present hosts must retain their exact queue. */
export function parseJourneyBattleGuidance(value: unknown, engine: EngineBattleFold): JourneyBattleGuidance | null {
    if (!record(value) || !dreamwellDefinitions(value.dreamwellDeck)) return null;
    try { parseTutorialTriggers(value.tutorialTriggers); } catch { return null; }
    if (!Array.isArray(value.checkpoints) || !value.checkpoints.every(checkpoint => record(checkpoint) && record(checkpoint.presentation) && checkpoint.presentation.kind === "tutorial-guidance" && presentation(checkpoint.presentation) && frame(checkpoint.before, engine) && frame(checkpoint.state, engine) && (checkpoint.producer === undefined || record(checkpoint.producer) && index(checkpoint.producer.seq) && index(checkpoint.producer.index)))) return null;
    const guidance = value as unknown as JourneyBattleGuidance;
    const triggerIds = new Set(guidance.tutorialTriggers.map(trigger => trigger.id));
    const ids = new Set(guidance.checkpoints.map(checkpoint => checkpoint.presentation.id));
    if (ids.size !== guidance.checkpoints.length || guidance.checkpoints.some(checkpoint => {
        const current = checkpoint.presentation;
        if (current.messages.some(message => !triggerIds.has(message.triggerId))) return true;
        const source = current.source;
        if (source.kind === "dreamwell") return !guidance.dreamwellDeck.some(card => card.id === source.cardId);
        if (source.kind !== "card" && source.kind !== "figment") return false;
        const physical = Object.values(checkpoint.state.instances).find(instance => instance.id === source.battleCardId);
        const printing = physical?.printing;
        return physical === undefined || !knows(checkpoint.state, physical, "player") || printing === undefined || (printing.kind === "figment" ? cardIdFromUnknown(printing.figment) !== source.cardId : printing.cardId !== source.cardId);
    })) return null;
    return JSON.stringify(value.tutorialPresentation) === JSON.stringify(guidance.checkpoints[0]?.presentation ?? null) ? guidance : null;
}
/** Tutorial loads use the shared engine validators and validate only host-owned metadata. */
export function parseTutorialBattleFoldState(value: Record<string, unknown>): TutorialBattleFoldState | null {
    const engine = parseEngineBattleFold(value.engine);
    if (engine === null || !record(value.mode) || value.mode.kind !== "tutorial" || identity(parseTutorialRunId, value.mode.tutorialRunId) === null || !index(value.mode.restartNumber) || !record(value.init) || parseJourneyBattleFoldState({ mode: { kind: "journey" }, init: value.init, engine: value.engine }) === null || !dreamwellDefinitions(value.init.dreamwellDeck))
        return null;
    try {
        parseTutorialTriggers(value.init.tutorialTriggers);
    }
    catch {
        return null;
    }
    if (!record(value.overrides) || !isTutorialBattleAiActionOverrides(value.overrides.definitions) || !Array.isArray(value.overrides.consumed) || !value.overrides.consumed.every(id => tutorialAiActionOverrideIdFromUnknown(id) !== null) || new Set(value.overrides.consumed).size !== value.overrides.consumed.length || !Array.isArray(value.overrideCommits) || !value.overrideCommits.every(selection) || value.pendingOverride !== null && !selection(value.pendingOverride))
        return null;
    const dreamwell = value.overrides.dreamwell;
    if (dreamwell !== null && (!record(dreamwell) || !side(dreamwell.side) || dreamwellCardIdFromUnknown(dreamwell.cardId) === null || !index(dreamwell.turnNumber)))
        return null;
    const consumed = value.overrides.consumed;
    const definitions = value.overrides.definitions as TutorialBattleFoldState["overrides"]["definitions"];
    if (consumed.some(id => !definitions.some(definition => definition.id === id)) || value.overrideCommits.length !== consumed.length || !value.overrideCommits.every(entry => record(entry) && consumed.includes(entry.id) && definitions.some(definition => definition.id === entry.id && definition.action.cardId === entry.actionCardId && definition.trigger.cardId === entry.triggerCardId)) || new Set(value.overrideCommits.map(entry => (entry as Record<string, unknown>).id)).size !== consumed.length)
        return null;
    if (value.pendingOverride !== null) {
        const pending = value.pendingOverride as Record<string, unknown>;
        const definition = definitions.find(definition => definition.id === pending.id);
        const step = engine.slice.inFlight?.step;
        const instance = engine.slice.committed.instances[pending.instance as import("../../engine").InstanceId];
        if (definition === undefined || consumed.includes(pending.id) || definition.trigger.cardId !== pending.triggerCardId || definition.action.cardId !== pending.actionCardId || step?.kind !== "play" || step.card !== pending.instance || instance === undefined || instance.owner !== definition.trigger.side || instance.printing.kind !== "card" || instance.printing.cardId !== pending.actionCardId)
            return null;
    }
    if (!Array.isArray(value.checkpoints) || !value.checkpoints.every(checkpoint => record(checkpoint) && presentation(checkpoint.presentation) && frame(checkpoint.before, engine) && frame(checkpoint.state, engine)))
        return null;
    const first:unknown = value.checkpoints[0];
    if (value.tutorialPresentation !== null && !presentation(value.tutorialPresentation) || JSON.stringify(value.tutorialPresentation) !== JSON.stringify(record(first) ? first.presentation : null))
        return null;
    return value as unknown as TutorialBattleFoldState;
}
