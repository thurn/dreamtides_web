import type { JourneyContent } from "../../data/journey-content";
import { tutorialCardConstantId } from "../../data/tutorial-actions";
import type { BattleInit, BattlePlacement, DeckEntry, Side } from "../../engine";
import { battleSeed } from "../../engine/state/ids";
import type { TutorialBattleDisplayInit } from "../../rules/battle/fold";
import type { CardId } from "../../types/card-identity";
import type { JourneyState } from "../../types/journey";
import type { TutorialAction } from "../../types/tutorial";
import { parseBattleEntryKey, parseBattleId, parseDeckEntryId, parseOpponentId, parseSiteId, type TutorialRunId, type BattleId } from "../../types/identifiers";
import { createBaseBattleDeckCardDefinition } from "../card-definition";
import { createBattleRng, deriveBattleSeed } from "../random";
import type { BattleDeckCardDefinition, DreamwellCardDefinition } from "../types";
export interface TutorialSetupInput {
    readonly journey: JourneyState;
    readonly actions: readonly TutorialAction[];
    readonly tutorialRunId: TutorialRunId;
    readonly restartNumber: number;
}
export interface TutorialSetup {
    readonly init: TutorialBattleDisplayInit;
    readonly engineInit: BattleInit;
}
/** Stable identity of one declared tutorial scenario. */
export function tutorialBattleId(run:TutorialRunId,restart:number,prefix=false):BattleId {
  return parseBattleId(`tutorial-battle:${run}:${String(restart)}${prefix ? ":prefix" : ""}`);
}

/** Two independent declared scenarios preserve the authored cinematic/live reset. */
export function buildTutorialSetup(content: JourneyContent, input: TutorialSetupInput, prefix: boolean): TutorialSetup {
    const configuration = content.tutorial.battle;
    const key = `tutorial:${input.journey.seed}:${input.tutorialRunId}:${String(input.restartNumber)}${prefix ? ":prefix" : ""}`;
    const cards = new Map([...content.cardDatabase.values()].map(card => [card.id, card]));
    const definition = (cardId: CardId, side: Side, copy: string): BattleDeckCardDefinition => {
        const card = cards.get(cardId);
        if (card === undefined)
            throw new Error(`Tutorial card ${cardId} is absent`);
        return { ...createBaseBattleDeckCardDefinition(card), sourceDeckEntryId: parseDeckEntryId(`${key}:${side}:${copy}:${cardId}`) };
    };
    const remaining: Record<Side, BattleDeckCardDefinition[]> = { player: [], enemy: [] };
    for (const side of ["player", "enemy"] as const) {
        const recipe = configuration.starterDeck.flatMap(({ cardId, copies }) => Array.from({ length: copies }, (_, copy) => definition(cardId, side, String(copy))));
        remaining[side] = createBattleRng(deriveBattleSeed(parseBattleEntryKey(`${key}:${side}`)), "playerDeckOrder").shuffle(recipe);
    }
    const placed: Record<Side, BattleDeckCardDefinition[]> = { player: [], enemy: [] };
    const placements: BattlePlacement[] = [];
    const take = (side: Side, cardId: CardId, extra = false): BattleDeckCardDefinition => {
        if (extra)
            return definition(cardId, side, `setup:${String(placed[side].length)}`);
        const index = remaining[side].findIndex(card => card.cardId === cardId);
        if (index < 0)
            throw new Error(`Tutorial deck cannot supply ${cardId}`);
        return remaining[side].splice(index, 1)[0];
    };
    const place = (side: Side, cardId: CardId, location: Omit<Extract<BattlePlacement, {
        zone: "play";
    }>, "side" | "deckIndex"> | {
        zone: "hand" | "void";
    }, extra = false): void => {
        const deckIndex = placed[side].length;
        placed[side].push(take(side, cardId, extra));
        placements.push({ side, deckIndex, ...location });
    };
    const authoredHands: Record<Side, CardId[]> = { player: [], enemy: [] };
    for (const action of input.actions) {
        if (action.action === "draw-opponent-card")
            authoredHands.enemy.push(action.cardId);
        if (action.action === "draw-card")
            authoredHands[action.owner].push(action.cardId);
        if (action.action === "reveal-and-play-opponent-card") {
            const at = authoredHands.enemy.indexOf(action.cardId);
            if (at < 0)
                throw new Error(`Tutorial play ${action.id} precedes its draw`);
            authoredHands.enemy.splice(at, 1);
        }
    }
    const stack = (side: Side, ids: readonly CardId[]): void => {
        const ordered = ids.map(id => take(side, id));
        remaining[side] = [...ordered, ...remaining[side]];
    };
    if (prefix) {
        const firstEnemyDraw = input.actions.find(action => action.action === "draw-opponent-card");
        if (firstEnemyDraw?.action !== "draw-opponent-card")
            throw new Error("Tutorial prefix has no opponent setup reveal");
        place("enemy", firstEnemyDraw.cardId, { zone: "hand" }, true);
        const laterEnemy = input.actions.filter(action => action.action === "draw-opponent-card").slice(1).map(action => action.cardId);
        const scriptDraws = (side: Side) => input.actions.flatMap(action => action.action === "draw-card" && action.owner === side ? [action.cardId] : []);
        // Extra declared copies enter the ordered physical deck and are drawn by the real effect.
        for (const cardId of scriptDraws("enemy"))
            if (!remaining.enemy.some(card => card.cardId === cardId))
                remaining.enemy.push(definition(cardId, "enemy", `prefix-extra:${cardId}`));
        stack("player", [configuration.tutorialCardConstants.tutorialPlayerCharacterCardId, ...scriptDraws("player")]);
        stack("enemy", [...laterEnemy, ...scriptDraws("enemy")]);
    }
    else {
        for (const placement of configuration.handoff.placements) {
            const cardId = tutorialCardConstantId(configuration.tutorialCardConstants, placement.cardRole);
            place(placement.side, cardId, placement.zone === "void" ? { zone: "void" } : { zone: "play", slot: { rank: placement.zone === "frontRank" ? "front" : "back", index: Number(placement.slotId.slice(1)) } }, placement.source === "created");
        }
        for (const side of ["player", "enemy"] as const)
            for (const cardId of authoredHands[side])
                place(side, cardId, { zone: "hand" }, !configuration.starterDeck.some(entry => entry.cardId === cardId));
        stack("player", configuration.forcedPlayerDraws);
        const enemyDraws = configuration.forcedEnemyDraws.map(id => take("enemy", id));
        const eroded = remaining.enemy.splice(0, configuration.forcedEnemyErosionPrefixCount);
        if (eroded.length !== configuration.forcedEnemyErosionPrefixCount)
            throw new Error("Tutorial enemy deck cannot reserve its erosion prefix");
        remaining.enemy = [...eroded, ...enemyDraws, ...remaining.enemy];
    }
    const definitions = { player: [...placed.player, ...remaining.player], enemy: [...placed.enemy, ...remaining.enemy] };
    const dreamwellById = new Map(content.dreamwellCards.map(card => [card.id, card]));
    const orderedDreamwell = configuration.dreamwellDraws.map(id => {
        const card = dreamwellById.get(id);
        if (card === undefined)
            throw new Error(`Tutorial Dreamwell ${id} is absent`);
        return card;
    });
    const fixed = new Set(configuration.dreamwellDraws);
    const rest = createBattleRng(deriveBattleSeed(parseBattleEntryKey(`${key}:dreamwell`)), "dreamwellDeck").shuffle(content.dreamwellCards.filter(card => !fixed.has(card.id)));
    const dreamwellDeck: DreamwellCardDefinition[] = [...orderedDreamwell, ...rest].map(card => ({ id: card.id, name: card.name, renderedText: card.renderedText, energyAdded: card.energyAdded, order: card.order, cardNumber: card.cardNumber, imageNumber: card.imageNumber ?? card.cardNumber, ...(card.art === undefined ? {} : { art: card.art }) }));
    const player = content.avatars.find(avatar => avatar.id === configuration.playerAvatarId);
    const enemy = content.avatars.find(avatar => avatar.id === configuration.enemyAvatarId);
    if (player === undefined || enemy === undefined)
        throw new Error("Tutorial Avatar UUID is absent");
    const handoff = configuration.handoff;
    const round = handoff.turnNumber;
    const engineDeck = (side: Side): DeckEntry[] => definitions[side].map(card => ({ cardId: card.cardId }));
    return {
        init: { battleId: tutorialBattleId(input.tutorialRunId,input.restartNumber,prefix), siteId: parseSiteId(prefix ? "tutorial-prefix" : "tutorial-handoff"), nodeId: null, completionLevelAtStart: input.journey.completionLevel, essenceReward: 0, opponentAbilityActive: false, cardDefinitions: [...definitions.player, ...definitions.enemy], avatarSummary: { id: player.id, name: player.name, title: player.title, renderedText: player.renderedText, imageNumber: player.imageNumber, ...(player.portraitFocus === undefined ? {} : { portraitFocus: player.portraitFocus }) }, enemyDescriptor: { id: parseOpponentId(`tutorial:${enemy.id}`), avatarId: enemy.id, name: enemy.name, subtitle: enemy.title, imageNumber: enemy.imageNumber, portraitSeed: 0, abilityText: enemy.renderedText, dreamsigns: [], signatureCards: [] }, dreamwellDeck, tutorialTriggers: content.tutorial.triggers },
        engineInit: { seed: battleSeed(String(deriveBattleSeed(parseBattleEntryKey(key)))), scoreToWin: configuration.scoreToWin, startingSide: prefix ? "enemy" : "player", decks: { player: engineDeck("player"), enemy: engineDeck("enemy") }, dreamwell: content.dreamwellCards.map(card => card.id), victorySides: ["player"], turnLimit: null, setup: { placements, sides: prefix ? { player: { currentEnergy: configuration.startingEnergy, maxEnergy: configuration.startingEnergy, score: 0 }, enemy: { currentEnergy: configuration.startingEnergy, maxEnergy: configuration.startingEnergy, score: 0 } } : { player: { currentEnergy: handoff.player.currentEnergy, maxEnergy: handoff.player.maxEnergy, score: handoff.player.score }, enemy: { currentEnergy: handoff.enemy.currentEnergy, maxEnergy: handoff.enemy.maxEnergy, score: handoff.enemy.score } }, turn: prefix ? { active: "enemy", phase: "day", round: 1, turnNumber: 1, sideTurns: { player: 0, enemy: 1 }, lastNormal: "enemy" } : { active: handoff.activeSide, phase: "dawn", round, turnNumber: round * 2 - 1, sideTurns: { player: round, enemy: round - 1 }, lastNormal: handoff.activeSide }, dreamwell: { deck: dreamwellDeck.map(card => card.id), next: prefix ? 0 : handoff.dreamwellDeckIndex } } },
    };
}
