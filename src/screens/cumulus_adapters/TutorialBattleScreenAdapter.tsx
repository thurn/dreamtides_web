import { currentTutorialPresentation } from "../../rules/battle/tutorial-checkpoints";
import { useCallback, useMemo } from "react";
import { TutorialBattleScreen } from "../../cumulus/screens/TutorialBattleScreen";
import { useFrontDoor } from "../../state/front-door-context";
import { useJourney } from "../../state/journey-context";
import { useTutorialBattleController } from "../../state/use-tutorial-battle-controller";
import { useTutorialBattleInteractions } from "../../state/use-tutorial-battle-interactions";
import { useBattleTutorialGuidance } from "../../state/use-battle-tutorial-guidance";
import { useEngineAi } from "../../battle/engine-ai/use-engine-ai";
import { PAGE_ENEMY_POLICY } from "../../runtime/runtime-config";
import { getBattleInitProvider } from "../../rules/battle/journey-battle";
import { tutorialBattleOf, type TutorialBattleFoldState } from "../../rules/battle/fold";
import { createEngineCardModels } from "../../battle/ui/engine-card-model";
import { lookupFigmentCatalogEntryById } from "../../battle/state/figment-catalog";
import type { JourneyContent } from "../../data/journey-content";
import type { Engine } from "../../engine";
import { buildTutorialBattleView } from "./tutorial-battle-view-model";
import { buildBattleTutorialGuidanceView } from "./battle-tutorial-guidance-view-model";
export function TutorialBattleScreenAdapter({ previewVictory = false }: {
    readonly previewVictory?: boolean;
}) {
    const { battle: contextBattle, mutations } = useFrontDoor();
    const { journeyContent } = useJourney();
    const battle = tutorialBattleOf(contextBattle ?? null);
    const engine = getBattleInitProvider()?.engine ?? null;
    if (battle === null || engine === null)
        return null;
    return <TutorialBattleBody battle={battle} engine={engine} content={journeyContent} previewVictory={previewVictory} onExit={() => { void mutations.exitTutorialBattle?.(battle.init.battleId); }}/>;
}
function TutorialBattleBody({ battle, engine, content, previewVictory, onExit }: {
    readonly battle: TutorialBattleFoldState;
    readonly engine: Engine;
    readonly content: JourneyContent;
    readonly previewVictory: boolean;
    readonly onExit: () => void;
}) {
    useEngineAi(PAGE_ENEMY_POLICY, !previewVictory);
    const cards = useMemo(() => createEngineCardModels({ definitions: battle.init.cardDefinitions, cards: new Map([...content.cardDatabase.values()].map(card => [card.id, card])), figment: lookupFigmentCatalogEntryById }), [battle.init.cardDefinitions, content.cardDatabase]);
    const built = useMemo(() => buildTutorialBattleView(battle, engine, cards, previewVictory), [battle, engine, cards, previewVictory]);
    const guidance = useMemo(() => buildBattleTutorialGuidanceView(battle, engine, cards), [battle, engine, cards]);
    const controller = useTutorialBattleController({ paused: previewVictory });
    const interactions = useTutorialBattleInteractions(built.model);
    const guidanceController = useBattleTutorialGuidance();
    const startNewJourney = useCallback(() => { if (previewVictory || currentTutorialPresentation(battle) === null && battle.engine.slice.committed.result?.kind === "victory" && battle.engine.slice.committed.result.winner === "player")
        onExit(); }, [battle, onExit, previewVictory]);
    return <TutorialBattleScreen view={built.view} interactions={interactions.interactions} movementStatusMessage={interactions.movementStatusMessage} onMovementStatusDismiss={interactions.dismissMovementStatus} onNewJourney={startNewJourney} guidance={guidance} onGuidanceContinue={guidanceController.advance} onGuidanceDurationComplete={guidanceController.completeDuration} onPresentationVisible={controller.onPresentationVisible}/>;
}
