/**
 * Phase 5 scenario specs (D20): every scenario of every registered batch
 * module, each its own named case, run on the content engine. The synthetic
 * cards are in the catalog beside the content, so a spec's filler cards stay
 * fixed while the content changes.
 */
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createCatalog } from "../../engine/catalog";
import {
  contentAvatarDefinitions,
  contentCardDefinitions,
  contentDreamsignDefinitions,
  contentDreamwellDefinitions,
  contentFigmentDefinitions,
} from "../../engine/content-catalog";
import { createEngine } from "../../engine/engine";
import { SYNTHETIC_CARDS } from "../../engine/testing/synthetic-cards";
import { SCENARIO_MODULES } from "./index";
import { runNamedScenario, scenarioRegistryProblems } from "./runner";

const MODULE_SUFFIX = ".scenarios.ts";

const engine = createEngine(
  createCatalog(
    [...SYNTHETIC_CARDS, ...contentCardDefinitions()],
    contentDreamwellDefinitions(),
    { avatars: contentAvatarDefinitions(), dreamsigns: contentDreamsignDefinitions() },
    contentFigmentDefinitions(),
  ),
);

describe("scenario registry", () => {
  it("registers every scenario module exactly once under its file's slug", () => {
    const files = readdirSync(new URL(".", import.meta.url))
      .filter((file) => file.endsWith(MODULE_SUFFIX))
      .map((file) => file.slice(0, -MODULE_SUFFIX.length));
    expect([...SCENARIO_MODULES.map((module) => module.slug)].sort()).toEqual(files.sort());
    expect(scenarioRegistryProblems(SCENARIO_MODULES)).toEqual([]);
  });
});

for (const module of SCENARIO_MODULES) {
  describe(module.slug, () => {
    for (const scenario of module.scenarios) {
      it(scenario.name, () => {
        runNamedScenario(engine, scenario);
      });
    }
  });
}
