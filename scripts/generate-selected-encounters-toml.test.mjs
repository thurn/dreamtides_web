// @vitest-environment node

import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  generateSelectedEncountersToml,
  parseGenerateSelectedEncountersArgs,
} from "./generate-selected-encounters-toml.mjs";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const REFERENCED_CARD_ID = "22222222-2222-4222-8222-222222222222";

function sources() {
  return {
    candidates: JSON.stringify({
      [CARD_ID]: [
        {
          template_pair_id: "pair-1",
          prose: "Actions prose.",
          actions: [
            {
              label: "Invite someone through",
              template_id: 10,
              variables: { count: 2 },
              selection: {
                $OFFERED_CARD: { predicate: "≤2● cost Character" },
              },
            },
            {
              label: "Name the traveler",
              template_id: 11,
              variables: {
                card_id: {
                  id: REFERENCED_CARD_ID,
                  display_name: "Fixture Traveler",
                },
              },
            },
          ],
          rank: 1,
          selected: { actions: true },
        },
        {
          template_pair_id: "pair-2",
          prose: "Selected prose.",
          actions: [
            {
              label: "Unused first",
              template_id: 20,
              variables: {},
            },
            {
              label: "Unused second",
              template_id: 21,
              variables: {},
            },
          ],
          rank: 2,
          selected: { prose: true },
        },
      ],
    }),
    templates: JSON.stringify([
      { template_id: 10, template: "Gain {count} copies of $OFFERED_CARD" },
      { template_id: 11, template: "Gain {card_id}" },
      { template_id: 20, template: "Unused first" },
      { template_id: 21, template: "Unused second" },
    ]),
  };
}

describe("selected encounter TOML generation", () => {
  it("combines the selected prose and actions while preserving special placeholders", () => {
    const { candidates, templates } = sources();
    const generated = generateSelectedEncountersToml(candidates, templates);
    const parsed = parse(generated);

    expect(parsed.encounter).toHaveLength(1);
    expect(parsed.encounter[0]).toMatchObject({
      "card-id": CARD_ID,
      prose: "Selected prose.",
    });
    expect(parsed.encounter[0].action).toEqual([
      {
        id: `${CARD_ID}:pair-1:template-10`,
        label: "Invite someone through",
        "effect-text": "Gain 2 copies of $OFFERED_CARD",
        "template-id": 10,
        "template-variables": { count: 2 },
        selection: {
          $OFFERED_CARD: { predicate: "≤2● cost Character" },
        },
      },
      {
        id: `${CARD_ID}:pair-1:template-11`,
        label: "Name the traveler",
        "effect-text": "Gain Fixture Traveler",
        "template-id": 11,
        "template-variables": {
          card_id: {
            id: REFERENCED_CARD_ID,
            display_name: "Fixture Traveler",
          },
        },
      },
    ]);
    expect(generated).not.toMatch(/^effect-kind\s*=/mu);
    expect(generated).toContain("selected prose: pair-2 (rank 2)");
    expect(generated).toContain("selected actions: pair-1 (rank 1)");
  });

  it("parses explicit input and output paths", () => {
    const options = parseGenerateSelectedEncountersArgs([
      "--candidates",
      "fixtures/candidates.json",
      "--templates=fixtures/templates.json",
      "--out",
      "generated/selected.toml",
    ]);

    expect(options.candidatesPath).toBe(resolveForTest("fixtures/candidates.json"));
    expect(options.templatesPath).toBe(resolveForTest("fixtures/templates.json"));
    expect(options.outputPath).toBe(resolveForTest("generated/selected.toml"));
  });
});

function resolveForTest(path) {
  return new URL(`../${path}`, import.meta.url).pathname;
}
