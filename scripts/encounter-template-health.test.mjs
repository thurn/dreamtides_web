// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readEncounterTemplateHealth } from "./encounter-template-health.mjs";

const BALANCE_SCRIPT = fileURLToPath(new URL(
  "../.llms/skills/exploration-encounter-designer/scripts/list-template-candidates.py",
  import.meta.url,
));

const roots = [];

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "encounter-template-health-"));
  roots.push(rootDir);
  mkdirSync(join(rootDir, "data"), { recursive: true });
  writeFileSync(join(rootDir, "data", "templates.json"), JSON.stringify(
    Array.from({ length: 12 }, (_, index) => ({
      template_id: index + 1,
      template: `Synthetic template ${String(index + 1)}`,
      ...(index === 1 ? { balance_class: "unique_effect" } : {}),
    })),
  ));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tabula", "exploration.toml"), [
    "# selected actions: pair-1 (rank 1)",
    "[[encounter]]",
    'card-id = "11111111-1111-4111-8111-111111111111"',
    "[[encounter.action]]",
    "template-id = 1",
    "[[encounter.action]]",
    "template-id = 2",
    "",
    "# selected actions: pair-2 (rank 2)",
    "[[encounter]]",
    'card-id = "22222222-2222-4222-8222-222222222222"',
    "[[encounter.action]]",
    "template-id = 1",
    "[[encounter.action]]",
    "template-id = 3",
  ].join("\n"));
  return rootDir;
}

afterEach(() => {
  roots.splice(0).forEach((rootDir) => rmSync(rootDir, { recursive: true, force: true }));
});

describe("encounter template health", () => {
  it("normalizes the balance script diagnostics without reimplementing its thresholds", () => {
    const health = readEncounterTemplateHealth({
      rootDir: writeFixtureRoot(),
      balanceScriptPath: BALANCE_SCRIPT,
    });
    expect(health).toMatchObject({
      productionEncounters: 2,
      catalogTemplateCount: 12,
      recordedTemplateUses: 4,
      softWarningThreshold: 1,
      omissionThreshold: 2,
      uniqueEffectOmissionThreshold: 1,
      requiredTemplateCount: 10,
    });
    expect(health.templates.map(({ templateId, status }) => ({ templateId, status }))).toEqual([
      { templateId: 1, status: "hidden" },
      { templateId: 2, status: "hidden" },
      { templateId: 3, status: "warning" },
      { templateId: 4, status: "unused" },
      { templateId: 5, status: "unused" },
      { templateId: 6, status: "unused" },
      { templateId: 7, status: "unused" },
      { templateId: 8, status: "unused" },
      { templateId: 9, status: "unused" },
      { templateId: 10, status: "unused" },
      { templateId: 11, status: "unused" },
      { templateId: 12, status: "unused" },
    ]);
    expect(health.templates[0]).toMatchObject({
      templateId: 1,
      usageCount: 2,
      reasons: ["production"],
    });
    expect(health.templates[1]).toMatchObject({
      balanceClass: "unique_effect",
      status: "hidden",
      usageCount: 1,
    });
  });

  it("rejects malformed script output", () => {
    expect(() => readEncounterTemplateHealth({
      execute: () => JSON.stringify({ balance: {}, template_diagnostics: "invalid" }),
    })).toThrow("template_diagnostics must be an array");
  });
});
