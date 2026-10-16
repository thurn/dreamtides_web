import { currentTutorialPresentation } from "../rules/battle/tutorial-checkpoints";
import { useCallback, useEffect, useState } from "react";
import { BATTLE } from "../content/battle";
import { tutorialBattleOf } from "../rules/battle/fold";
import { useActions, useClientId, useConfirmedGameState } from "../session/hooks";
import { parseIntentKey, type PresentationId } from "../types/identifiers";
/** Visibility timers release durable checkpoints; the engine owns every game decision. */
export function useTutorialBattleController({ paused = false }: {
    readonly paused?: boolean;
} = {}) {
    const battle = tutorialBattleOf(useConfirmedGameState().battle);
    const actions = useActions(), actor = useClientId();
    const [visible, setVisible] = useState<PresentationId | null>(null);
    const presentation = currentTutorialPresentation(battle);
    const onPresentationVisible = useCallback((id: PresentationId) => setVisible(id), []);
    useEffect(() => {
        if (paused || presentation === null || presentation.kind === "tutorial-guidance" || visible !== presentation.id)
            return;
        const duration = presentation.kind === "opponent-play" ? BATTLE.presentation.opponentPlayRevealDwellMs : presentation.kind === "dreamwell-reveal" ? BATTLE.presentation.dreamwellRevealDwellMs : presentation.kind === "challenge-resolved" ? BATTLE.presentation.scoreDwellMs : BATTLE.presentation.eventDwellMs;
        const timer = setTimeout(() => { void actions.completeTutorialBattlePresentation(presentation.id, parseIntentKey(`tutorial:${presentation.id}:complete`), actor); }, duration);
        return () => clearTimeout(timer);
    }, [actions, actor, paused, presentation, visible]);
    return { onPresentationVisible };
}
