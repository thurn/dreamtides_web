/**
 * The registry of Phase 5 scenario modules, one per content batch (D19, D20).
 * A batch adds its `<slug>.scenarios.ts` module here: one default import and
 * one entry in `SCENARIO_MODULES`, in slug order.
 */
import type { ScenarioModule } from "../../engine/testing/scenario";

export const SCENARIO_MODULES: readonly ScenarioModule[] = [];
