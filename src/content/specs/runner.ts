/**
 * Runs Phase 5 scenario modules (engine-design § Scenario specs). The test
 * file `specs.test.ts` runs every scenario registered in `index.ts` as its own
 * named case.
 */
import type { Engine } from "../../engine/engine";
import { runScenario, type NamedScenario, type ScenarioModule, type ScenarioResult } from "../../engine/testing/scenario";

/**
 * Runs one scenario and its check. Throws when a prompt has no scripted
 * answer, answers are left over, or the check fails; the check never runs on
 * a scenario that failed to play out.
 */
export function runNamedScenario(engine: Engine, scenario: NamedScenario): ScenarioResult {
  const result = runScenario(engine, scenario.spec);
  scenario.check(result);
  return result;
}

/**
 * The registry's structural problems: a slug registered twice, a module with
 * no scenarios, and a scenario name used twice in one module.
 */
export function scenarioRegistryProblems(modules: readonly ScenarioModule[]): string[] {
  const problems: string[] = [];
  const slugs = new Set<string>();
  for (const module of modules) {
    if (slugs.has(module.slug)) problems.push(`${module.slug}: registered twice`);
    slugs.add(module.slug);
    if (module.scenarios.length === 0) problems.push(`${module.slug}: no scenarios`);
    const names = new Set<string>();
    for (const scenario of module.scenarios) {
      if (names.has(scenario.name)) problems.push(`${module.slug}: scenario "${scenario.name}" named twice`);
      names.add(scenario.name);
    }
  }
  return problems;
}
