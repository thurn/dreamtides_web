// @vitest-environment node

import * as fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";
import {
  explorationEditorInternals,
  readExplorationEditorData,
  updateExplorationAction,
  updateExplorationProse,
  updateExplorationTemplate,
} from "./exploration-editor-data.mjs";
import {
  EXPLORATION_EFFECT_DEFINITIONS,
  EXPLORATION_EFFECT_FIELD_KEYS,
} from "./exploration-editor-schema.mjs";
import { transformExplorationData } from "./setup-assets.mjs";

const roots = [];

function fixtureRoot() {
  const rootDir = fs.mkdtempSync(join(tmpdir(), "exploration-editor-data-"));
  roots.push(rootDir);
  fs.mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  fs.mkdirSync(join(rootDir, "public"), { recursive: true });
  for (const relative of [
    "data/tabula/exploration.toml",
    "data/tabula/cards.toml",
    "data/tabula/dreamsigns.toml",
    "data/templates.json",
    "public/exploration-data.json",
  ]) {
    fs.copyFileSync(relative, join(rootDir, relative));
  }
  return rootDir;
}

afterEach(() => {
  for (const rootDir of roots.splice(0)) {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});

describe("exploration editor data", () => {
  it("loads the UUID-keyed catalog with resolved card information", () => {
    const data = readExplorationEditorData({ rootDir: fixtureRoot() });
    expect(data.encounters.length).toBeGreaterThan(0);
    expect(data.effectDefinitions).toHaveLength(
      EXPLORATION_EFFECT_DEFINITIONS.length,
    );
    expect(data.encounters.every((encounter) =>
      encounter.cardId.match(/^[0-9a-f-]{36}$/iu) &&
      encounter.cardName.length > 0 &&
      encounter.actions.length === 2)).toBe(true);
  });

  it("compiles every effect to its canonical mechanic and only selectable effects to a policy", () => {
    expect(EXPLORATION_EFFECT_DEFINITIONS.every((definition) =>
      typeof definition.canonicalMechanicId === "string" &&
      definition.canonicalMechanicId.length > 0)).toBe(true);

    const byKind = new Map(
      EXPLORATION_EFFECT_DEFINITIONS.map((definition) => [definition.kind, definition]),
    );
    expect(byKind.get("purge-and-copy")).toMatchObject({
      canonicalMechanicId: "purge-and-duplicate",
    });
    expect(byKind.get("purge-and-copy")).not.toHaveProperty("selectionPolicyId");
    expect(byKind.get("purge-for-essence")).toMatchObject({
      canonicalMechanicId: "purge-for-essence",
      defaultSelectionPolicyId: "purge-misfit",
    });
    expect(byKind.get("replace-selected-with-card")).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      defaultSelectionPolicyId: "fixed",
    });
    expect(byKind.get("gain-nightmare-and-card")).toMatchObject({
      canonicalMechanicId: "gain-nightmare-and-card",
    });
  });

  it("round-trips every effect kind with defaults and removes stale fields", () => {
    const rootDir = fixtureRoot();
    let data = readExplorationEditorData({ rootDir });
    const encounter = data.encounters[0];
    let action = encounter.actions[0];

    for (const definition of EXPLORATION_EFFECT_DEFINITIONS) {
      data = updateExplorationAction({
        cardId: encounter.cardId,
        slot: 0,
        action: { ...action, effectKind: definition.kind, templateId: -1 },
      }, { rootDir });
      action = data.encounters[0].actions[0];
      expect(action.effectKind).toBe(definition.kind);
      expect(action.templateId).toBe(definition.templateIds[0]);
      expect(action.effectText.trim()).not.toBe("");
      const allowed = new Set(definition.fields.map((field) => field.key));
      for (const key of EXPLORATION_EFFECT_FIELD_KEYS) {
        if (!allowed.has(key)) expect(action).not.toHaveProperty(key);
      }
    }

    const document = parse(fs.readFileSync(join(rootDir, "data/tabula/exploration.toml"), "utf8"));
    expect(JSON.parse(fs.readFileSync(join(rootDir, "public/exploration-data.json"), "utf8")))
      .toEqual(transformExplorationData(document));
  });

  it("moves an optional Any card purge to its predicate-free template", () => {
    const rootDir = fixtureRoot();
    const data = readExplorationEditorData({ rootDir });
    const encounter = data.encounters[0];

    let result = updateExplorationAction({
      cardId: encounter.cardId,
      slot: 0,
      action: {
        ...encounter.actions[0],
        effectKind: "purge-selected",
        templateId: 4,
        predicate: "",
      },
    }, { rootDir });
    expect(result.encounters[0].actions[0]).toMatchObject({
      effectKind: "purge-selected",
      templateId: 3,
      effectText: "Purge a chosen card",
      count: 1,
    });
    expect(result.encounters[0].actions[0]).not.toHaveProperty("predicate");

    result = updateExplorationAction({
      cardId: encounter.cardId,
      slot: 0,
      action: {
        ...result.encounters[0].actions[0],
        templateId: 6,
        predicate: "",
        count: 2,
      },
    }, { rootDir });
    expect(result.encounters[0].actions[0]).toMatchObject({
      effectKind: "purge-selected",
      templateId: 5,
      effectText: "Purge up to 2 chosen cards",
      count: 2,
    });
    expect(result.encounters[0].actions[0]).not.toHaveProperty("predicate");
  });

  it("preserves system-managed comments and unrelated records on targeted writes", () => {
    const rootDir = fixtureRoot();
    const path = join(rootDir, "data/tabula/exploration.toml");
    const before = fs.readFileSync(path, "utf8");
    const data = readExplorationEditorData({ rootDir });
    const target = data.encounters[0];
    const unrelated = explorationEditorInternals.actionBlock(before, data.encounters[1].cardId, 0);
    const unrelatedSource = before.slice(unrelated.start, unrelated.end);
    const comments = before.match(/^# selected .*$/gmu);

    updateExplorationProse({
      cardId: target.cardId,
      value: "A deliberately revised scene.",
    }, { rootDir });
    const after = fs.readFileSync(path, "utf8");
    const afterUnrelated = explorationEditorInternals.actionBlock(after, data.encounters[1].cardId, 0);
    expect(after.slice(afterUnrelated.start, afterUnrelated.end)).toBe(unrelatedSource);
    expect(after.match(/^# selected .*$/gmu)).toEqual(comments);
    expect(after).toContain('prose = "A deliberately revised scene."');
  });

  it("propagates template copy only to matching actions and preserves placeholders", () => {
    const rootDir = fixtureRoot();
    const path = join(rootDir, "data/tabula/exploration.toml");
    const data = readExplorationEditorData({ rootDir });
    const unrelatedEncounter = data.encounters.find((encounter) =>
      encounter.actions.every((action) => action.templateId !== 14));
    const before = fs.readFileSync(path, "utf8");
    const unrelated = explorationEditorInternals.actionBlock(before, unrelatedEncounter.cardId, 0);
    const unrelatedSource = before.slice(unrelated.start, unrelated.end);

    const result = updateExplorationTemplate({
      templateId: 14,
      value: "Discover one {predicate} among {offer_count} choices",
    }, { rootDir });
    expect(result.encounters.flatMap((encounter) => encounter.actions)
      .filter((action) => action.templateId === 14)
      .every((action) => action.effectText.startsWith("Discover one "))).toBe(true);
    const after = fs.readFileSync(path, "utf8");
    const afterUnrelated = explorationEditorInternals.actionBlock(after, unrelatedEncounter.cardId, 0);
    expect(after.slice(afterUnrelated.start, afterUnrelated.end)).toBe(unrelatedSource);

    const templateBeforeFailure = fs.readFileSync(join(rootDir, "data/templates.json"), "utf8");
    expect(() => updateExplorationTemplate({
      templateId: 14,
      value: "Discover a {predicate}",
    }, { rootDir })).toThrow("preserve the existing placeholder set");
    expect(fs.readFileSync(join(rootDir, "data/templates.json"), "utf8"))
      .toBe(templateBeforeFailure);
  });

  it("rolls back every destination when an atomic replacement fails", () => {
    const rootDir = fixtureRoot();
    const explorationPath = join(rootDir, "data/tabula/exploration.toml");
    const jsonPath = join(rootDir, "public/exploration-data.json");
    const beforeExploration = fs.readFileSync(explorationPath, "utf8");
    const beforeJson = fs.readFileSync(jsonPath, "utf8");
    const cardId = readExplorationEditorData({ rootDir }).encounters[0].cardId;
    const fileSystem = {
      ...fs,
      renameSync(from, to) {
        if (from.includes(".tmp-") && to === jsonPath) throw new Error("fixture rename failure");
        fs.renameSync(from, to);
      },
    };

    expect(() => updateExplorationProse({ cardId, value: "This must roll back." }, {
      rootDir,
      fileSystem,
    })).toThrow("fixture rename failure");
    expect(fs.readFileSync(explorationPath, "utf8")).toBe(beforeExploration);
    expect(fs.readFileSync(jsonPath, "utf8")).toBe(beforeJson);
  });

  it("rejects unknown UUID references without touching authored data", () => {
    const rootDir = fixtureRoot();
    const path = join(rootDir, "data/tabula/exploration.toml");
    const before = fs.readFileSync(path, "utf8");
    const encounter = readExplorationEditorData({ rootDir }).encounters[0];
    expect(() => updateExplorationAction({
      cardId: encounter.cardId,
      slot: 0,
      action: {
        ...encounter.actions[0],
        effectKind: "gain-card",
        templateId: 10,
        cardId: "11111111-1111-4111-8111-111111111111",
      },
    }, { rootDir })).toThrow("unknown card UUID");
    expect(fs.readFileSync(path, "utf8")).toBe(before);
  });
});
