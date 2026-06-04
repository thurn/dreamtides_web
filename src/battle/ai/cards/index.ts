import type { BattlefieldSlotId } from "../../types";
import type { ForwardModel, AiCard } from "../forward-model";

export interface AiTargetChoice {
  targetBattleCardId?: string | null; // e.g. Flashpoint's enemy body
  targetSlotId?: BattlefieldSlotId | null;
  deckReorder?: string[] | null; // Foresee/Glimpse
}

export interface StarterCardModel {
  cardNumber: number;
  canPlay(model: ForwardModel, self: AiCard): boolean;
  chooseTargets(model: ForwardModel, self: AiCard): AiTargetChoice | null;
  play(model: ForwardModel, self: AiCard, targets: AiTargetChoice | null): void; // mutates the model
  onMaterialized?(model: ForwardModel, self: AiCard): void;
  onDawn?(model: ForwardModel, self: AiCard): void;
  onDissolved?(model: ForwardModel, self: AiCard): void;
  supportSpark?(model: ForwardModel, self: AiCard): number | null; // feeds effectiveSpark's supportSources
  valueHint?(model: ForwardModel, self: AiCard): number;
}

export const starterCardModels: ReadonlyMap<number, StarterCardModel> = new Map<
  number,
  StarterCardModel
>();
