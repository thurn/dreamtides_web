// The D97 encounter events (cases in ../d97-encounters.ts).

import { dreamAnchorIdFromUnknown, parseIntentKey } from "../../../types/identifiers";
import { beginEncounterBattle, declineEncounter, endEncounterBattle, previewEncounter } from "../d97-encounters";
import { d97Event, payloadOf } from "./spec";

const anchorPayload = payloadOf({ anchorId: dreamAnchorIdFromUnknown });

export const ENCOUNTER_EVENTS = {
  // An encounter is fixed once: repeated first previews share its key.
  D97_PREVIEW_ENCOUNTER: d97Event({
    phase: "noBattle",
    parse: anchorPayload,
    fold: previewEncounter,
    intentKey: ({ anchorId }) => parseIntentKey(`d97-preview:${anchorId}`),
  }),
  D97_DECLINE_ENCOUNTER: d97Event({ phase: "run", parse: anchorPayload, fold: declineEncounter }),
  D97_BEGIN_BATTLE: d97Event({ phase: "noBattle", parse: anchorPayload, fold: beginEncounterBattle }),
  D97_END_BATTLE: d97Event({
    phase: "battle",
    parse: (): Record<string, never> => ({}),
    fold: ({ state }, _payload, ctx) => endEncounterBattle(state, ctx),
  }),
};
