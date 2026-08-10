import { describe, expect, it } from "vitest";
import {
  normalizeExplorationAction,
  readExplorationEditorData,
} from "./exploration-editor-data.mjs";
import { EXPLORATION_EFFECT_SCHEMAS } from "./exploration-editor-schema.mjs";

describe("exploration editor data", () => {
  it("loads action-local presentation with UUID-backed previews", () => {
    const data = readExplorationEditorData({ random: () => 0 });
    const actions = data.encounters.flatMap((encounter) => encounter.actions);

    expect(data.encounters.length).toBeGreaterThan(0);
    expect(actions).toHaveLength(data.encounters.length * 2);
    expect(actions.every((action) => action.effectText.length > 0)).toBe(true);
    expect(actions.flatMap((action) => action.runtimeCardSelections)
      .every((selection) => /^[0-9a-f-]{36}$/u.test(selection.cardId))).toBe(true);
    expect(actions
      .filter((action) => action.cardId !== undefined)
      .every((action) => action.runtimeCardSelections.some((selection) =>
        selection.placeholder === "{fixed_card}" &&
        selection.cardId.toLowerCase() === action.cardId.toLowerCase() &&
        selection.source === "fixed_reference"))).toBe(true);
    expect(actions
      .filter((action) => action.effectText.includes("{nightmare_card}"))
      .every((action) => action.runtimeCardSelections.some((selection) =>
        selection.placeholder === "{nightmare_card}" &&
        selection.source === "fixed_reference"))).toBe(true);
    expect(data).not.toHaveProperty("templates");
  });

  it("publishes a closed code-owned schema without player copy", () => {
    expect(EXPLORATION_EFFECT_SCHEMAS).toHaveLength(36);
    expect(new Set(EXPLORATION_EFFECT_SCHEMAS.map((entry) => entry.kind)).size)
      .toBe(EXPLORATION_EFFECT_SCHEMAS.length);
    for (const definition of EXPLORATION_EFFECT_SCHEMAS) {
      expect(definition).not.toHaveProperty("templateIds");
      expect(definition).not.toHaveProperty("copy");
    }
    expect(
      EXPLORATION_EFFECT_SCHEMAS.find(
        (definition) => definition.kind === "transfigure-all-for-essence",
      ),
    ).toEqual({
      kind: "transfigure-all-for-essence",
      label: "Transfigure all eligible cards for essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      fields: [
        expect.objectContaining({ key: "essence", min: 1 }),
        expect.objectContaining({ key: "predicate", defaultValue: "event" }),
        expect.objectContaining({
          key: "transfiguration",
          defaultValue: "Inspired",
        }),
      ],
    });
  });

  it("normalizes mechanics without constructing presentation text", () => {
    const effectText = `Authored ${String(Math.random())}`;
    const normalized = normalizeExplorationAction({
      id: "synthetic-action",
      label: "Synthetic action",
      effectText,
      effectKind: "copy-selected-card",
      deckTarget: "offered",
      count: 2,
    });

    expect(normalized.effectText).toBe(effectText);
    expect(normalized.deckTarget).toBe("offered");
    expect(normalized.canonicalMechanicId).toBe("duplicate-deck-entry");
  });

  it("rejects unknown action card and Dreamsign references before staging", () => {
    const references = {
      cardIds: new Set(["00000000-0000-4000-8000-000000000001"]),
      dreamsignIds: new Set(["00000000-0000-4000-8000-000000000002"]),
    };
    expect(() => normalizeExplorationAction({
      id: "unknown-card",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-card",
      cardId: "00000000-0000-4000-8000-000000000099",
    }, references)).toThrow(/Unknown card reference/u);
    expect(() => normalizeExplorationAction({
      id: "unknown-dreamsign",
      label: "Synthetic action",
      effectText: "Synthetic effect",
      effectKind: "gain-dreamsign",
      dreamsignId: "00000000-0000-4000-8000-000000000099",
    }, references)).toThrow(/Unknown Dreamsign reference/u);
  });

  it("keeps followup copy on the individual actions", () => {
    const data = readExplorationEditorData({ random: () => 0 });
    const actions = data.encounters.flatMap((encounter) => encounter.actions);
    const withFollowup = actions.filter((action) => action.followupTitle !== undefined);

    expect(withFollowup.length).toBeGreaterThan(0);
    expect(withFollowup.every((action) => action.followupSubtitle !== undefined)).toBe(true);
  });
});
