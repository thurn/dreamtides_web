import type { TutorialView } from "../../cumulus/screens/TutorialScreen";
import type { MobileBattleCardView, MobileBattleSideView, MobileBattleView } from "../../cumulus/screens/MobileBattleScreen";
import type { Engine, BattleState, InstanceId } from "../../engine";
import type { CardData } from "../../types/cards";
import type { DreamwellCard } from "../../data/dreamwell-database";
import type { AvatarContent } from "../../types/content";
import type { TutorialAction, TutorialBattleConfiguration, TutorialPlaybackState } from "../../types/tutorial";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import { tutorialStarterDeckSize } from "../../data/tutorial-actions";
import { parseBattleCardId, parseBattleId, parseBattleSlotViewId } from "../../types/identifiers";
import type { TutorialPrefixState } from "../../rules/battle/tutorial-prefix";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { lookupFigmentCatalogEntryById } from "../../battle/state/figment-catalog";
import { buildBattleAvatarStatus } from "../../battle/ui/battle-avatar-status";
import { buildEngineBattleScreenModel, enginePrintedKeywords } from "./engine-battle-view-model";
export { tutorialActionLogDetails } from "./tutorial-action-log";
function cardIdOf(state: BattleState, id: InstanceId) { const printing = state.instances[id]?.printing; return printing?.kind === "card" || printing?.kind === "figmentCopy" ? printing.cardId : null; }
function frameFor(prefix: TutorialPrefixState, actions: readonly TutorialAction[], at: number | null): BattleState {
    const action = at === null ? null : actions[at];
    const draw = action === null ? undefined : prefix.draws.find(draw => draw.actionId === action?.id);
    if (draw?.eventIndex != null)
        return prefix.events[draw.eventIndex]?.before ?? prefix.engine.slice.committed;
    if (action?.action === "reveal-and-play-opponent-card") {
        const event = prefix.events.find(entry => entry.event.kind === "cardPlayed" && entry.event.side === "enemy" && cardIdOf(entry.state, entry.event.instance) === action.cardId);
        if (event !== undefined)
            return event.before;
    }
    const well = action?.action === "draw-dreamwell-card" ? action : action?.action === "display-how-to-play" && action.companion === "dreamwell-card" ? actions.slice(0, at ?? 0).reverse().find(cue => cue.action === "draw-dreamwell-card") : undefined;
    if (well?.action === "draw-dreamwell-card") {
        const event = prefix.events.find(entry => entry.event.kind === "dreamwellDrawn" && entry.event.side === well.owner && entry.event.card === well.cardId);
        if (event !== undefined)
            return event.state;
    }
    const challengeAt = actions.findIndex(cue => cue.action === "resolve-challenge");
    const playerWellAt = actions.findIndex((cue, index) => index > challengeAt && cue.action === "draw-dreamwell-card" && cue.owner === "player");
    if (at !== null && challengeAt >= 0 && at >= challengeAt && (playerWellAt < 0 || at < playerWellAt)) {
        const lane = prefix.events.find(entry => entry.event.kind === "laneResolved");
        if (lane !== undefined) {
            if (at === challengeAt)
                return prefix.events.find(entry => entry.event.kind === "phaseChanged" && entry.event.phase === "challenge" && entry.state.turn.turnNumber === lane.state.turn.turnNumber)?.state ?? lane.before;
            return lane.state;
        }
    }
    return prefix.engine.slice.committed;
}
function emptyIntro(configuration: TutorialBattleConfiguration): MobileBattleView {
    const count = tutorialStarterDeckSize(configuration);
    const side = (owner: "player" | "enemy"): MobileBattleSideView => ({ owner, position: owner === "player" ? "near" : "far", deckCardIds: Array.from({ length: count }, (_, index) => parseBattleCardId(`tutorial:${owner}:pile:${index}`)), banishedCardCount: 0, voidCards: [], backRank: Array.from({ length: 3 }, (_, index) => ({ id: parseBattleSlotViewId(`B${index}`), card: null })), frontRank: Array.from({ length: 2 }, (_, index) => ({ id: parseBattleSlotViewId(`F${index}`), card: null })), status: { avatar: null, currentEnergy: configuration.startingEnergy, maxEnergy: configuration.startingEnergy, points: 0, pointsToWin: configuration.scoreToWin } });
    const near = side("player"), far = side("enemy");
    const inspectorSide = (owner: "player" | "enemy"): import("../../cumulus/screens/MobileBattleScreen").MobileBattleInspectorSideView => ({ side: owner, heading: owner === "player" ? "Player" : "Enemy", points: 0, currentEnergy: configuration.startingEnergy, maxEnergy: configuration.startingEnergy, zones: { hand: 0, deck: count, void: 0, banished: 0, backRank: 0, frontRank: 0 }, canDiscard: false, canShuffle: false });
    return { battleId: parseBattleId("tutorial-prefix-pending"), perspective: "player", near, far, nearHand: { owner: "player", position: "near", cardIds: [], cards: [] }, farHand: { owner: "enemy", position: "far", cardIds: [], cards: [] }, prompt: { host: null, surface: { kind: "none" } }, turn: "1", dreamwell: null, activeSide: "enemy", isOpeningTurn: true, phase: "day", inspector: { opponentName: "Awaiting Avatar", perspective: "player", turn: "1", phase: "Day", activeSide: "Enemy", result: "In progress", nextDreamwellOrder: "Complete", isOpponentHandRevealed: false, isPlayerHandHidden: false, isFarHandRevealed: false, isNearHandHidden: false, sides: { player: inspectorSide("player"), enemy: inspectorSide("enemy") } }, result: null };
}
/** Authored overlays are presented over genuine engine snapshots and physical identities. */
export function buildTutorialView(avatars: readonly AvatarContent[], configuration: TutorialBattleConfiguration, playback: TutorialPlaybackState | null = null, cards: readonly CardData[] | null = null, dreamwellCards: readonly DreamwellCard[] | null = null, engine: Engine | null = null): TutorialView {
    const player = avatars.find(avatar => avatar.id === configuration.playerAvatarId), enemy = avatars.find(avatar => avatar.id === configuration.enemyAvatarId);
    if (player === undefined || enemy === undefined)
        throw Error("Tutorial Avatar UUID is absent");
    const actions = playback?.actions ?? [], at = playback?.currentActionIndex ?? null, current = at === null ? null : actions[at] ?? null;
    const completed = at === null && playback !== null ? actions.length : at ?? 0;
    const settled = (owner: "player" | "enemy") => { const index = actions.findIndex(cue => cue.action === "animate-avatar-portrait" && cue.owner === owner); return index >= 0 && completed > index; };
    const avatarView = (avatar: AvatarContent, owner: "player" | "enemy") => ({ visual: { imageNumber: avatar.imageNumber, name: avatar.name, title: avatar.title, ...(avatar.portraitFocus === undefined ? {} : { portraitFocus: avatar.portraitFocus }) }, profile: { id: avatar.id, ability: "Avatar ability is not active", unavailable: true }, settled: settled(owner) });
    const prefix = playback?.prefix;
    let battle = emptyIntro(configuration);
    let physical: (id: InstanceId) => MobileBattleCardView | null = () => null;
    if (prefix !== undefined && engine !== null) {
        const frame = frameFor(prefix, actions, at);
        const models = createEngineCardModels({ definitions: prefix.init.cardDefinitions, cards: new Map((cards ?? []).map(card => [card.id, card])), figment: lookupFigmentCatalogEntryById });
        const publicView = engine.view(frame, "player");
        const built = buildEngineBattleScreenModel({ battleId: prefix.init.battleId, human: "player", view: publicView, legal: engine.decision(frame)?.side === "player" ? engine.legalActions(frame, "player") : [], prompt: null, playing: null, decision: null, presented: true, notice: null, cards: models, catalog: engine.catalog, printedKeywords: enginePrintedKeywords(engine.catalog), avatars: { player: buildBattleAvatarStatus(null, true), enemy: buildBattleAvatarStatus(null, true) }, opponentName: enemy.name, essenceReward: 0, resultDismissed: true });
        physical = id => {
            // The script explicitly reveals its authored cards; the declared instance supplies values.
            const source = frame.instances[id] ?? prefix.engine.slice.committed.instances[id];
            if (source === undefined)
                return null;
            const owner = source.owner;
            const association = prefix.draws.find(draw => draw.instance === id && draw.eventIndex !== null);
            const revealedFrame = association?.eventIndex == null ? undefined : prefix.events[association.eventIndex]?.state;
            const visible = engine.view(frame, owner).instances[id] ?? (revealedFrame === undefined ? undefined : engine.view(revealedFrame, owner).instances[id]);
            if (visible === undefined)
                return null;
            return { id: parseBattleCardId(id), model: models(visible), exhausted: visible.status.exhausted, figment: visible.printing.kind !== "card", storedTime: visible.status.counters, showPlayableOutline: owner === "player" && built.affordances.plays.has(parseBattleCardId(id)) };
        };
        const compact = (side: MobileBattleSideView) => ({ ...side, backRank: side.backRank.filter((slot, index) => index < 3 || slot.card !== null), frontRank: side.frontRank.filter((slot, index) => index < 2 || slot.card !== null), status: { ...side.status, avatar: null, avatarProfile: undefined } });
        const knownDraws = (side: "player" | "enemy") => prefix.events.filter(entry => entry.event.kind === "cardDrawn" && entry.event.side === side);
        const shownDraws = prefix.draws.filter(draw => actions.findIndex(cue => cue.id === draw.actionId) < completed);
        const firstPlayer = knownDraws("player")[0];
        const firstPlayerInstance = firstPlayer?.event.kind === "cardDrawn" ? firstPlayer.event.instance : null;
        const firstHowTo = actions.findIndex(cue => cue.action === "display-how-to-play");
        const playerTurnStarted = firstHowTo >= 0 && completed >= firstHowTo;
        const playerShown = [...(playerTurnStarted && firstPlayerInstance !== null ? [firstPlayerInstance] : []), ...shownDraws.filter(draw => (() => { const cue = actions.find(cue => cue.id === draw.actionId); return cue?.action === "draw-card" && cue.owner === "player"; })()).map(draw => draw.instance)].filter(id => frame.sides.player.hand.includes(id));
        const enemyShown = shownDraws.filter(draw => frame.instances[draw.instance]?.owner === "enemy" && frame.sides.enemy.hand.includes(draw.instance)).map(draw => draw.instance);
        const cinematicCount = tutorialStarterDeckSize(configuration);
        const consumedDraws = (side: "player" | "enemy") => shownDraws.filter(draw => prefix.engine.slice.committed.instances[draw.instance]?.owner === side).length + (side === "player" && playerTurnStarted ? 1 : 0);
        battle = { ...built.view, turn: String(frame.turn.round), near: { ...compact(built.view.near), deckCardIds: built.view.near.deckCardIds.slice(0, Math.max(0, cinematicCount - consumedDraws("player"))) }, far: { ...compact(built.view.far), deckCardIds: built.view.far.deckCardIds.slice(0, Math.max(0, cinematicCount - consumedDraws("enemy"))) }, nearHand: { owner: "player", position: "near", cardIds: playerShown.map(parseBattleCardId), cards: playerShown.flatMap(id => { const card = physical(id); return card === null ? [] : [card]; }) }, farHand: { owner: "enemy", position: "far", cardIds: enemyShown.map(parseBattleCardId), cards: [] }, prompt: { host: null, surface: { kind: "none" } }, result: null };
    }
    const boundDraw = current === null || prefix === undefined ? undefined : prefix.draws.find(draw => draw.actionId === current.id);
    if (boundDraw !== undefined) {
        const id = parseBattleCardId(boundDraw.instance);
        const owner = prefix?.engine.slice.committed.instances[boundDraw.instance]?.owner;
        const side = owner === "player" ? battle.near : battle.far;
        const projected = { ...side, deckCardIds: [id, ...side.deckCardIds.filter(candidate => candidate !== id).slice(0, Math.max(0, side.deckCardIds.length - 1))] };
        battle = owner === "player" ? { ...battle, near: projected } : { ...battle, far: projected };
    }
    const drawCard = boundDraw === undefined ? null : physical(boundDraw.instance);
    const cardDraw = current?.action === "draw-card" && drawCard !== null ? { actionId: current.id, owner: current.owner, card: drawCard } : null;
    const revealDraw = current?.action === "reveal-and-play-opponent-card" && prefix !== undefined ? prefix.draws.filter(draw => { const cue = actions.find(cue => cue.id === draw.actionId); return cue !== undefined && "cardId" in cue && cue.cardId === current.cardId && actions.indexOf(cue) < (at ?? 0); }).slice(-1)[0] : undefined;
    const opponentCardToReveal = revealDraw === undefined ? null : physical(revealDraw.instance);
    const dialogueAction = current?.action === "display-speech-bubble" || current?.action === "reveal-and-play-opponent-card" || current?.action === "end-turn" && playback?.playerCardPlay != null ? current : null;
    const speech = dialogueAction !== null && "speechBubble" in dialogueAction ? dialogueAction.speechBubble ?? null : null;
    const dialogue = speech === null || dialogueAction === null ? null : speech.speaker === "mira" ? { actionId: dialogueAction.id, parentAction: dialogueAction.action, kind: "guide" as const, delay: tutorialSpeechBubbleDelaySeconds(speech), duration: speech.duration, horizontalOffset: speech.horizontalOffset, verticalOffset: speech.verticalOffset, bubbleWidth: speech.bubbleWidth, model: { portrait: { kind: "character-portrait" as const, characterId: "mira" as const }, portraitAlt: "Mira", speakerName: "Mira", text: speech.text } } : { actionId: dialogueAction.id, parentAction: dialogueAction.action, kind: "avatar" as const, owner: speech.speaker, delay: tutorialSpeechBubbleDelaySeconds(speech), duration: speech.duration, horizontalOffset: speech.horizontalOffset, verticalOffset: speech.verticalOffset, bubbleWidth: speech.bubbleWidth, speakerName: speech.speaker === "player" ? player.name : enemy.name, text: speech.text };
    const previousWell = actions.slice(0, (at ?? actions.length) + 1).reverse().find(cue => cue.action === "draw-dreamwell-card");
    const well = previousWell?.action === "draw-dreamwell-card" ? dreamwellCards?.find(card => card.id === previousWell.cardId) : undefined;
    const wellModel = well === undefined ? null : { cardId: well.id, displaySnapshot: { id: well.id, name: well.name, renderedText: well.renderedText, energyAdded: well.energyAdded, imageNumber: well.imageNumber ?? 0, ...(well.art === undefined ? {} : { art: well.art }) } };
    if (current?.action === "draw-dreamwell-card" || current?.action === "display-how-to-play" && current.companion === "dreamwell-card")
        battle = { ...battle, dreamwell: wellModel === null || previousWell?.action !== "draw-dreamwell-card" ? null : { side: previousWell.owner, model: wellModel } };
    const playerInstance = prefix?.events.find(entry => entry.event.kind === "cardDrawn" && entry.event.side === "player");
    const playerCardId = playerInstance?.event.kind === "cardDrawn" ? playerInstance.event.instance : null;
    const playerCard = playerCardId === null ? null : physical(playerCardId);
    const lane = prefix?.events.find(entry => entry.event.kind === "laneResolved");
    const laneEvent = lane?.event.kind === "laneResolved" ? lane.event : null;
    const challenger = laneEvent === null ? null : physical(laneEvent.challenger), blocker = laneEvent?.blocker == null ? null : physical(laneEvent.blocker);
    return { battle, avatars: { player: avatarView(player, "player"), enemy: avatarView(enemy, "enemy") }, playbackRunId: playback?.runId ?? null, currentAction: current, dialogue, cardDraw, opponentCardToReveal, howToPlay: current?.action !== "display-how-to-play" ? null : { actionId: current.id, text: current.text, wait: current.wait, trigger: current.trigger ?? "player-turn-announcement-complete", ...(current.cardWidth === undefined ? {} : { cardWidth: current.cardWidth }), ...(current.companion === "dreamwell-card" ? { companion: wellModel } : {}) }, endTurn: current?.action !== "end-turn" || playerCard === null ? null : { actionId: current.id, triggerCardId: playerCard.model.cardId, ready: playback?.playerCardPlay != null }, playerReposition: current?.action !== "reposition-player-character" || playerCard === null ? null : { actionId: current.id, cardInstanceId: playerCard.id, cardId: current.cardId, opposingCardId: current.opposingCardId }, challenge: current?.action !== "resolve-challenge" || laneEvent === null || challenger === null || blocker === null || laneEvent.winner === null ? null : { actionId: current.id, challenger: { owner: "enemy", card: challenger, spark: laneEvent.challengerSpark }, blocker: { owner: "player", card: blocker, spark: laneEvent.blockerSpark }, winnerOwner: laneEvent.winner, loserOwner: laneEvent.winner === "player" ? "enemy" : "player" } };
}
