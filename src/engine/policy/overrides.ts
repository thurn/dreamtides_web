import type { CardId } from "../../types/card-identity";
import type { DreamwellCardId, TutorialAiActionOverrideId } from "../../types/identifiers";
import type { InstanceId, Side } from "../state/ids";
import type { BattleView } from "../view/view";
import type { PolicyChoice, PolicyDecision } from "./types";
/** Actual trigger facts supplied by the fold, rather than inferred from a deck count. */
export interface PolicyOverrideContext {
    readonly definitions: readonly {
        readonly id: TutorialAiActionOverrideId;
        readonly trigger: {
            readonly kind: "after-dreamwell";
            readonly side: Side;
            readonly cardId: DreamwellCardId;
        };
        readonly action: {
            readonly kind: "play-card";
            readonly cardId: CardId;
        };
    }[];
    readonly consumed: readonly TutorialAiActionOverrideId[];
    readonly dreamwell: {
        readonly side: Side;
        readonly cardId: DreamwellCardId;
        readonly turnNumber: number;
    } | null;
}
export interface PolicyOverrideSelection {
    readonly id: TutorialAiActionOverrideId;
    readonly triggerCardId: DreamwellCardId;
    readonly actionCardId: CardId;
    readonly instance: InstanceId;
}
export type PolicyOverrideBlockedReason = "not-main-window" | "card-not-in-hand" | "insufficient-energy" | "full-back-rank" | "illegal-play";
export type PolicyOverrideOutcome = {
    readonly kind: "selected";
    readonly selection: PolicyOverrideSelection;
    readonly choice: Extract<PolicyChoice, {
        kind: "action";
    }>;
} | {
    readonly kind: "blocked";
    readonly id: TutorialAiActionOverrideId;
    readonly triggerCardId: DreamwellCardId;
    readonly actionCardId: CardId;
    readonly reason: PolicyOverrideBlockedReason;
};
/** The first unconsumed trigger match owns this opportunity, even when its play is blocked. */
export function policyOverride(view: BattleView, decision: PolicyDecision, context: PolicyOverrideContext | undefined): PolicyOverrideOutcome | null {
    const trigger = context?.dreamwell;
    if (context === undefined || trigger === null || trigger === undefined || trigger.turnNumber !== view.turn.turnNumber)
        return null;
    const definition = context.definitions.find((entry) => !context.consumed.includes(entry.id) && entry.trigger.side === trigger.side && entry.trigger.cardId === trigger.cardId);
    if (definition === undefined)
        return null;
    const blocked = (reason: PolicyOverrideBlockedReason): PolicyOverrideOutcome => ({ kind: "blocked", id: definition.id, triggerCardId: trigger.cardId, actionCardId: definition.action.cardId, reason });
    if (decision.kind !== "topLevel" || decision.decision.kind !== "main" || view.turn.phase !== "day" || view.turn.active !== trigger.side || decision.decision.side !== trigger.side)
        return blocked("not-main-window");
    const side = view.sides[trigger.side];
    const instances = side.hand.known.map(({ id }) => view.instances[id]).filter((card) => card?.printing.kind === "card" && card.printing.cardId === definition.action.cardId);
    const instance = instances[0];
    if (instance === undefined)
        return blocked("card-not-in-hand");
    const action = instances.flatMap(card => decision.legal.filter(entry => entry.kind === "play" && entry.from === "hand" && entry.card === card.id))[0];
    if (action === undefined) {
        if (instances.every(card => card.characteristics.cost > side.currentEnergy))
            return blocked("insufficient-energy");
        if (instance.characteristics.cardType === "character" && side.backRank.every((id) => id !== null))
            return blocked("full-back-rank");
        return blocked("illegal-play");
    }
    return { kind: "selected", selection: { id: definition.id, triggerCardId: trigger.cardId, actionCardId: definition.action.cardId, instance: action.kind === "play" ? action.card : instance.id }, choice: { kind: "action", action } };
}
