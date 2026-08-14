import type { BattlefieldSlotId } from "../../types";
import type { ForwardModel, AiCard } from "../forward-model";

export interface AiTargetChoice {
  targetBattleCardId?: BattleCardId | null; // e.g. Flashpoint's enemy body
  targetSlotId?: BattlefieldSlotId | null;
  deckReorder?: string[] | null; // Foresee/Glimpse
}

export interface StarterCardModel {
  cardNumber: number;
  canPlay(model: ForwardModel, self: AiCard): boolean;
  chooseTargets(model: ForwardModel, self: AiCard): AiTargetChoice | null;
  play(model: ForwardModel, self: AiCard, targets: AiTargetChoice | null): void; // mutates the model
  supportSpark?(model: ForwardModel, self: AiCard): number | null; // feeds effectiveSpark's supportSources
  valueHint?(model: ForwardModel, self: AiCard): number;
}

import { nocturneStrummer } from "./nocturne-strummer";
import { ringwatcher } from "./ringwatcher";
import { markedDirewolf } from "./marked-direwolf";
import { runeboundChampion } from "./runebound-champion";
import { finalWitness } from "./final-witness";
import { wildflowerColossus } from "./wildflower-colossus";
import { flashpointDetonation } from "./flashpoint-detonation";
import { glimpseOfWhatWas } from "./glimpse-of-what-was";
import { signOfArrival } from "./sign-of-arrival";
import { worldsAwait } from "./worlds-await";
import type { BattleCardId } from "../../../types/identifiers";

const models: StarterCardModel[] = [
  nocturneStrummer,
  ringwatcher,
  markedDirewolf,
  runeboundChampion,
  finalWitness,
  wildflowerColossus,
  flashpointDetonation,
  glimpseOfWhatWas,
  signOfArrival,
  worldsAwait,
];

export const starterCardModels: ReadonlyMap<number, StarterCardModel> = new Map<
  number,
  StarterCardModel
>(models.map((model) => [model.cardNumber, model]));
