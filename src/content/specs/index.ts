/**
 * The registry of Phase 5 scenario modules, one per content batch (D19, D20).
 * A batch adds its `<slug>.scenarios.ts` module here: one default import and
 * one entry in `SCENARIO_MODULES`, in slug order.
 */
import type { ScenarioModule } from "../../engine/testing/scenario";
import cards04 from "./cards-04.scenarios";
import primChooseSubtype from "./prim-choose-subtype.scenarios";
import primDrawMatching from "./prim-draw-matching.scenarios";
import primLosePoints from "./prim-lose-points.scenarios";
import primPlayFromZone from "./prim-play-from-zone.scenarios";
import primReturnFromVoid from "./prim-return-from-void.scenarios";
import primSelectorChallenger from "./prim-selector-challenger.scenarios";
import primWhenPutIntoVoidTrigger from "./prim-when-put-into-void-trigger.scenarios";

export const SCENARIO_MODULES: readonly ScenarioModule[] = [cards04, primChooseSubtype, primDrawMatching, primLosePoints, primPlayFromZone, primReturnFromVoid, primSelectorChallenger, primWhenPutIntoVoidTrigger];
