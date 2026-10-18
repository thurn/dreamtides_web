// The D97 quest and dialogue-effect events (cases in ../d97-quests.ts). Each
// names the anchor whose character the player is dealing with, except the
// reward pick and abandoning. Unkeyed: each case refuses a repeat that no
// longer applies (a held quest, a done step, a held item).

import type { D97ServiceKind } from "../../../content/d97/dialogue/schema";
import { cardIdFromUnknown } from "../../../types/card-identity";
import {
  d97FlagIdFromUnknown,
  d97ItemIdFromUnknown,
  d97QuestIdFromUnknown,
  d97QuestStepIdFromUnknown,
  dreamAnchorIdFromUnknown,
} from "../../../types/identifiers";
import {
  abandonQuest,
  acceptQuest,
  advanceQuest,
  chooseQuestReward,
  completeQuest,
  giveItem,
  handOff,
  pickUpObject,
  setFlag,
  takeItem,
} from "../d97-quests";
import { booleanFromUnknown, d97Event, payloadOf } from "./spec";

const SERVICES: readonly D97ServiceKind[] = ["dreamGuide", "sage", "amuletMerchant", "amuletChanger"];

function serviceFromUnknown(value: unknown): D97ServiceKind | null {
  return SERVICES.find((service) => service === value) ?? null;
}

const questPayload = payloadOf({ questId: d97QuestIdFromUnknown });
const anchorPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown });
const questAtAnchor = payloadOf({ questId: d97QuestIdFromUnknown, anchorId: dreamAnchorIdFromUnknown });
const stepAtAnchor = payloadOf({
  questId: d97QuestIdFromUnknown,
  stepId: d97QuestStepIdFromUnknown,
  anchorId: dreamAnchorIdFromUnknown,
});
const rewardPick = payloadOf({ questId: d97QuestIdFromUnknown, cardId: cardIdFromUnknown });
const itemAtAnchor = payloadOf({ itemId: d97ItemIdFromUnknown, anchorId: dreamAnchorIdFromUnknown });
const flagAtAnchor = payloadOf({ flagId: d97FlagIdFromUnknown, value: booleanFromUnknown, anchorId: dreamAnchorIdFromUnknown });
const serviceAtAnchor = payloadOf({ anchorId: dreamAnchorIdFromUnknown, service: serviceFromUnknown });

export const QUEST_EVENTS = {
  D97_ACCEPT_QUEST: d97Event({ phase: "run", parse: questAtAnchor, fold: acceptQuest }),
  D97_ADVANCE_QUEST: d97Event({ phase: "run", parse: stepAtAnchor, fold: advanceQuest }),
  D97_COMPLETE_QUEST: d97Event({ phase: "run", parse: questAtAnchor, fold: completeQuest }),
  D97_CHOOSE_QUEST_REWARD: d97Event({ phase: "run", parse: rewardPick, fold: chooseQuestReward }),
  D97_ABANDON_QUEST: d97Event({ phase: "run", parse: questPayload, fold: abandonQuest }),
  D97_PICK_UP_OBJECT: d97Event({ phase: "run", parse: anchorPayload, fold: pickUpObject }),
  D97_GIVE_ITEM: d97Event({ phase: "run", parse: itemAtAnchor, fold: giveItem }),
  D97_TAKE_ITEM: d97Event({ phase: "run", parse: itemAtAnchor, fold: takeItem }),
  D97_SET_FLAG: d97Event({ phase: "run", parse: flagAtAnchor, fold: setFlag }),
  D97_OPEN_SERVICE: d97Event({ phase: "run", parse: serviceAtAnchor, fold: handOff }),
};
