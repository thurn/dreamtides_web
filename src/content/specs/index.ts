/**
 * The registry of Phase 5 scenario modules, one per content batch (D19, D20).
 * A batch adds its `<slug>.scenarios.ts` module here: one default import and
 * one entry in `SCENARIO_MODULES`, in slug order.
 */
import type { ScenarioModule } from "../../engine/testing/scenario";
import cards04 from "./cards-04.scenarios";
import cards09 from "./cards-09.scenarios";
import cards18 from "./cards-18.scenarios";
import cards23 from "./cards-23.scenarios";
import primChooseSubtype from "./prim-choose-subtype.scenarios";
import primCreateCard from "./prim-create-card.scenarios";
import primDrawMatching from "./prim-draw-matching.scenarios";
import primLosePoints from "./prim-lose-points.scenarios";
import primPlayFromZone from "./prim-play-from-zone.scenarios";
import primReturnFromVoid from "./prim-return-from-void.scenarios";
import primSelectorChallenger from "./prim-selector-challenger.scenarios";
import primWhenErodeTrigger from "./prim-when-erode-trigger.scenarios";
import primWhenPlayFromVoidTrigger from "./prim-when-play-from-void-trigger.scenarios";
import primWhenPutIntoVoidTrigger from "./prim-when-put-into-void-trigger.scenarios";
import primWhenReclaimTrigger from "./prim-when-reclaim-trigger.scenarios";
import primWhenReturnTrigger from "./prim-when-return-trigger.scenarios";

export const SCENARIO_MODULES: readonly ScenarioModule[] = [cards04, cards09, cards18, cards23, primChooseSubtype, primCreateCard, primDrawMatching, primLosePoints, primPlayFromZone, primReturnFromVoid, primSelectorChallenger, primWhenErodeTrigger, primWhenPlayFromVoidTrigger, primWhenPutIntoVoidTrigger, primWhenReclaimTrigger, primWhenReturnTrigger];
