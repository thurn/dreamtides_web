import { useState } from "react";
import type { Action, Answer } from "../engine";
import { decisionKeyOf } from "../engine/fold/slice";
import { tutorialBattleOf } from "../rules/battle/fold";
import { useActions, useGameState } from "../session/hooks";
import { type BattleCardId } from "../types/identifiers";
import type { MobileBattleInteractions, MobileBattleSlotTarget, MobileBattleCardSource } from "../cumulus/screens/MobileBattleScreen";
import type { TutorialBattleMovementStatus } from "../cumulus/screens/TutorialBattleScreen";
import { handPlayAction, repositionForDrop, type EngineBattleScreenModel } from "../screens/cumulus_adapters/engine-battle-view-model";
import { engineIntentKey } from "./engine-ai/engine-ai-driver";
/** Gestures name public engine actions and canonical prompt answers by physical id. */
export function useTutorialBattleInteractions(model: EngineBattleScreenModel) {
    const state = useGameState(), actions = useActions(), battle = tutorialBattleOf(state.battle);
    const [drag, setDrag] = useState<{
        readonly id: BattleCardId;
        readonly source: MobileBattleCardSource;
    } | null>(null);
    const [movementStatusMessage, setMovementStatus] = useState<TutorialBattleMovementStatus | null>(null);
    const prompt = model.prompt.surface;
    const pending = battle?.engine.slice.inFlight === null || battle === null ? null : battle.engine.slice;
    const key = battle === null ? null : decisionKeyOf(battle.engine.slice);
    const submit = (action: Action): void => {
        if (battle === null || key === null || !model.affordances.canAct)
            return;
        void actions.battleAction("player", action, undefined, engineIntentKey("engine-player", battle.init.battleId, key, JSON.stringify(action))).catch(() => setMovementStatus("send-failed"));
    };
    const answer = (value: Answer | null): void => {
        const id = model.view.prompt.host?.key;
        if (battle === null || pending === null || id === null || id === undefined || value === null)
            return;
        void actions.answerPrompt("player", id, value, undefined, engineIntentKey("engine-player", battle.init.battleId, id));
    };
    const play = (id: BattleCardId, target?: MobileBattleSlotTarget): void => {
        setDrag(null);
        const action = handPlayAction(model, "player", id, target);
        if (action !== null)
            submit(action);
        else if (battle !== null && model.affordances.canAct) {
            const instance = model.instances.get(id);
            if (instance !== undefined)
                void actions.tutorialCardAttempt(battle.init.battleId, instance.id);
        }
    };
    const move = (id: BattleCardId, target: MobileBattleSlotTarget): void => {
        setDrag(null);
        const action = repositionForDrop(model, id, target);
        if (action === null)
            setMovementStatus("no-legal-cell");
        else
            submit(action);
    };
    const slot = (target: MobileBattleSlotTarget): void => {
        if (drag === null)
            return;
        if (drag.source === "near-hand")
            play(drag.id, target);
        else
            move(drag.id, target);
    };
    const interactions: MobileBattleInteractions = {
        canInteract: model.affordances.canAct, canPrompt: prompt.kind !== "held" && prompt.kind !== "waiting" && prompt.kind !== "none", nearSide: "player", pendingCardId: drag?.id ?? null, pendingCardSource: drag?.source ?? null, pendingCardOwner: drag === null ? null : "player", targetableCardIds: prompt.kind === "targets" ? prompt.ids : [],
        eligibleSlotTargets: drag?.source === "battlefield" ? (model.affordances.repositions.get(drag.id) ?? []).map(entry => entry.target) : [],
        isSlotDropEligible: target => drag !== null && (drag.source === "near-hand" ? handPlayAction(model, "player", drag.id, target) !== null : repositionForDrop(model, drag.id, target) !== null),
        onHandCardActivate: id => play(id), onCardDragStart: (id, source) => setDrag({ id, source }), onCardDragEnd: () => setDrag(null), onSlotDrop: slot, onHandCardDrop: target => { if (drag !== null)
            play(drag.id, target); },
        onBattlefieldCardActivate: id => { if (prompt.kind === "targets")
            answer(prompt.answer(id));
        else
            setDrag({ id, source: "battlefield" }); },
        onBattlefieldDropRejected: () => { setDrag(null); setMovementStatus("no-legal-cell"); }, onZoneDrop: () => setDrag(null), onNextPhase: () => { if (model.affordances.pass !== null)
            submit(model.affordances.pass); },
        onPromptCancel: () => { const id = model.view.prompt.host?.key; if (id != null)
            void actions.cancelPrompt("player", id); }, onPromptNumberSubmit: value => { if (prompt.kind === "number")
            answer(prompt.answer(value)); }, onPromptArrangeSubmit: result => { if (prompt.kind === "arrange")
            answer(prompt.answer(result)); },
        onCardPickerSubmit: ids => { if (prompt.kind === "picker")
            answer(prompt.answer(ids)); }, onCardPickerSkip: () => { if (prompt.kind === "picker")
            answer(prompt.answer([])); }, onChoicePromptChoose: index => { if (prompt.kind === "choice") {
            const selection = prompt.options[index]?.select;
            if (selection?.kind === "answer")
                answer(selection.answer);
            else if (selection?.kind === "action")
                submit(selection.action);
        }
        else if (prompt.kind === "targets") {
            const selection = prompt.skip?.options[index]?.select;
            if (selection?.kind === "answer")
                answer(selection.answer);
        } },
    };
    return { interactions, movementStatusMessage, dismissMovementStatus: () => setMovementStatus(null) };
}
