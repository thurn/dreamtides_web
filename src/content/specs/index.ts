/**
 * The Phase 5 scenario modules, one per content batch (D19, D20), in slug
 * order. Each batch's `<slug>.scenarios.ts` module is discovered here, so a
 * batch adds its module file and edits no shared list.
 */
import type { ScenarioModule } from "../../engine/testing/scenario";

const discovered = import.meta.glob<ScenarioModule>("./*.scenarios.ts", { eager: true, import: "default" });

export const SCENARIO_MODULES: readonly ScenarioModule[] = Object.keys(discovered)
  .sort()
  .map((file) => discovered[file]);
