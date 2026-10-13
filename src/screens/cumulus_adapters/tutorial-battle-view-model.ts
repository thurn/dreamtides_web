import type { Engine } from "../../engine";
import type { BattleState } from "../../engine";
import type { TutorialBattleFoldState } from "../../rules/battle/fold";
import { foldAdapterFor } from "../../rules/battle/engine-battle";
import type { TutorialBattleView } from "../../cumulus/screens/TutorialBattleScreen";
import { buildEngineBattleScreenModel, enginePrintedKeywords, type EngineBattleScreenModel } from "./engine-battle-view-model";
import type { EngineCardModels } from "../../battle/ui/engine-card-model";
import { buildBattleAvatarStatus } from "../../battle/ui/battle-avatar-status";
import { dreamwellCardModel } from "../../battle/ui/dreamwell-card-model";
import { parseBattleCardId } from "../../types/identifiers";
const INACTIVE_TUTORIAL_AVATAR_ABILITY = "Avatar ability is not active";
export interface TutorialBattleModel {
    readonly view: TutorialBattleView;
    readonly model: EngineBattleScreenModel;
}
/** The tutorial uses the same engine projection, prompts and legal affordances as journey battles. */
export function buildTutorialBattleView(battle: TutorialBattleFoldState, engine: Engine, cards: EngineCardModels, previewVictory = false): TutorialBattleModel {
    const checkpoint = battle.checkpoints[0];
    const presentation = battle.tutorialPresentation;
    const pending = foldAdapterFor(engine).pending(battle.engine.slice);
    const display = checkpoint?.state ?? pending?.display ?? battle.engine.slice.committed;
    const reveal = presentation?.kind === "opponent-play";
    const render = (state: BattleState): EngineBattleScreenModel => {
        const view = engine.view(state, "player");
        const decision = battle.engine.slice.inFlight === null ? engine.decision(battle.engine.slice.committed) : null;
        const result = buildEngineBattleScreenModel({ battleId: battle.init.battleId, human: "player", view, legal: checkpoint === undefined && decision?.side === "player" ? engine.legalActions(battle.engine.slice.committed, "player") : [], prompt: pending?.prompt ?? null, drawnForDiscard: pending?.drawnForDiscard, playing: battle.engine.slice.inFlight?.step.kind === "play" ? battle.engine.slice.inFlight.step.card : null, decision, presented: checkpoint === undefined, notice: null, cards, catalog: engine.catalog, printedKeywords: enginePrintedKeywords(engine.catalog), avatars: { player: buildBattleAvatarStatus(battle.init.avatarSummary, true), enemy: buildBattleAvatarStatus({ id: battle.init.enemyDescriptor.avatarId ?? battle.init.enemyDescriptor.id, name: battle.init.enemyDescriptor.name, title: battle.init.enemyDescriptor.subtitle, renderedText: battle.init.enemyDescriptor.abilityText, imageNumber: battle.init.enemyDescriptor.imageNumber ?? "001" }, true) }, opponentName: battle.init.enemyDescriptor.name, essenceReward: 0, resultDismissed: true, dreamwellCard: id => { const definition = battle.init.dreamwellDeck.find(card => card.id === id); return definition === undefined ? null : dreamwellCardModel(definition); }, ...(presentation?.kind === "dreamwell-reveal" ? { visual: { key: presentation.id, visual: { kind: "dreamwell", card: presentation.cardId, side: presentation.side } } as const } : {}) });
        const inactive = (side: typeof result.view.near) => side.status.avatarProfile === undefined ? side : { ...side, status: { ...side.status, avatarProfile: { ...side.status.avatarProfile, ability: INACTIVE_TUTORIAL_AVATAR_ABILITY, unavailable: true } } };
        return { ...result, view: { ...result.view, near: inactive(result.view.near), far: inactive(result.view.far), turn: String(state.turn.round), result: null } };
    };
    const cardGuidance = presentation?.kind === "tutorial-guidance" && presentation.source.kind === "card" && !presentation.id.endsWith(":refusal") ? presentation.source : null;
    const cinematic = cardGuidance === null || checkpoint === undefined ? null : checkpoint.before;
    let model = render(cinematic ?? (reveal ? checkpoint.before : display));
    if (cinematic !== null && cardGuidance !== null) {
        const outlined = new Set(engine.legalActions(cinematic, "player").flatMap(action => action.kind === "play" && action.from === "hand" ? [parseBattleCardId(action.card)] : []));
        const held = cardGuidance.side === "player" ? cardGuidance.battleCardId : null;
        model = { ...model, view: { ...model.view, inspector: render(display).view.inspector, nearHand: { ...model.view.nearHand, cardIds: model.view.nearHand.cardIds.filter(id => id !== held), cards: model.view.nearHand.cards.filter(card => card.id !== held).map(card => ({ ...card, showPlayableOutline: outlined.has(card.id) })) } } };
    }
    const shown = presentation === null || presentation.kind === "tutorial-guidance" ? null : presentation.kind === "opponent-play" ? (() => {
        const after = render(checkpoint.state), card = after.instances.get(presentation.battleCardId);
        return card === undefined ? null : { kind: "opponent-play" as const, presentationId: presentation.id, cardId: presentation.cardId, battleCardId: presentation.battleCardId, cardKind: presentation.cardKind, card: { id: parseBattleCardId(card.id), model: cards(card), exhausted: card.status.exhausted, figment: card.printing.kind !== "card", storedTime: card.status.counters, showPlayableOutline: false } };
    })() : presentation.kind === "dreamwell-reveal" ? { kind: "dreamwell-reveal" as const, presentationId: presentation.id, cardId: presentation.cardId, side: presentation.side } : presentation.kind === "opponent-block" ? { kind: "opponent-block" as const, presentationId: presentation.id } : { kind: "challenge-resolved" as const, presentationId: presentation.id, paired: presentation.blockerBattleCardId !== null, dissolved: presentation.dissolved, scored: presentation.scored };
    return { model, view: { battle: model.view, challengeOriginBattle: presentation?.kind === "challenge-resolved" && checkpoint !== undefined ? render(checkpoint.before).view : null, manualControls: checkpoint === undefined && model.affordances.canAct, presentationId: presentation === null || presentation.kind === "tutorial-guidance" ? null : presentation.id, presentation: shown, victoryVisible: previewVictory || checkpoint === undefined && battle.engine.slice.committed.result?.kind === "victory" && battle.engine.slice.committed.result.winner === "player" } };
}
