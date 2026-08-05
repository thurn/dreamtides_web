// @vitest-environment node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  commitEncounterCandidates,
  commitEncounterTemplates,
  editEncounterCandidateVariable,
  editEncounterTemplate,
  editEncounterCandidateText,
  parseEncounterCandidates,
  readExplorationCandidatesEditorGroups,
  renderEncounterTemplate,
  selectEncounterCandidate,
} from "./exploration-candidates-editor-data.mjs";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const UNRELATED_CARD_ID = "22222222-2222-4222-8222-222222222222";
const SPIRIT_CARD_ID = "33333333-3333-4333-8333-333333333333";
const STARTER_CARD_ID = "44444444-4444-4444-8444-444444444444";
const DREAMSIGN_ID = "D1FDBE21-56F6-43C0-AAAC-1E4683964DA5";

function candidate(rank, selected = false) {
  return {
    template_pair_id: `pair-${String(rank)}`,
    prose: `Prose ${String(rank)}`,
    actions: [
      {
        label: `First ${String(rank)}`,
        template_id: rank * 10,
        variables: { count: rank },
      },
      {
        label: `Second ${String(rank)}`,
        template_id: rank * 10 + 1,
        variables: {},
      },
    ],
    scores: { overall: 10 - rank },
    rank,
    ...(selected ? { selected: { prose: true, actions: true } } : {}),
    ranking_rationale: `Rationale ${String(rank)}`,
  };
}

function documentFixture() {
  return { [CARD_ID]: [candidate(1, true), candidate(2)] };
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-exploration-candidates-editor-data-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(
    join(rootDir, "data", "exploration_candidates.json"),
    `${JSON.stringify(documentFixture(), null, 2)}\n`,
  );
  writeFileSync(
    join(rootDir, "data", "templates.json"),
    `${JSON.stringify([
      { template_id: 10, template: "Gain {count} cards and $KEEP_THIS" },
      { template_id: 11, template: "Gain something else" },
      { template_id: 20, template: "Gain {count} cards" },
      { template_id: 21, template: "Gain another thing" },
    ], null, 2)}\n`,
  );
  writeFileSync(
    join(rootDir, "data", "tabula", "cards.toml"),
    `[[cards]]\nid = "${CARD_ID}"\nname = "Fixture Guide"\nrendered-text = "Gain 1●."\nimage-number = 42\n\n[[cards]]\nid = "${UNRELATED_CARD_ID}"\nname = "Blank Rules Card"\nrendered-text = ""\nimage-number = 43\n`,
  );
  return rootDir;
}

function writeRuntimeSelectionFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "journey-encounter-runtime-cards-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(
    join(rootDir, "data", "exploration_candidates.json"),
    `${JSON.stringify({
      [CARD_ID]: [{
        template_pair_id: "pair-1",
        prose: "A test encounter.",
        actions: [
          {
            label: "Find a spirit",
            template_id: 1,
            variables: {},
            selection: { "$DECK_CARD": { predicate: "Spirit Animal" } },
          },
          {
            label: "Make an offer",
            template_id: 2,
            variables: {},
            selection: { "$OFFERED_CARD": { predicate: "≤2● cost Character" } },
          },
        ],
        rank: 1,
        selected: { prose: true, actions: true },
      }],
    }, null, 2)}\n`,
  );
  writeFileSync(
    join(rootDir, "data", "templates.json"),
    `${JSON.stringify([
      { template_id: 1, template: "Apply Kindled to $DECK_CARD" },
      { template_id: 2, template: "Gain $OFFERED_CARD and purge $STARTER_CARD" },
    ], null, 2)}\n`,
  );
  const decoys = Array.from({ length: 28 }, (_, index) => {
    const suffix = (index + 1).toString(16).padStart(12, "0");
    const isCheapCharacter = index === 0;
    return [
      "[[cards]]",
      `id = "00000000-0000-4000-8000-${suffix}"`,
      `name = "Decoy ${String(index + 1)}"`,
      `card-type = "${isCheapCharacter ? "Character" : "Event"}"`,
      `subtype = "${isCheapCharacter ? "Warrior" : ""}"`,
      `energy-cost = ${isCheapCharacter ? "2" : "3"}`,
    ].join("\n");
  });
  writeFileSync(
    join(rootDir, "data", "tabula", "cards.toml"),
    [
      `[[cards]]\nid = "${SPIRIT_CARD_ID}"\nname = "Fallback Spirit"\ncard-type = "Character"\nsubtype = "Spirit Animal"\nenergy-cost = 4`,
      `[[cards]]\nid = "${CARD_ID}"\nname = "Fixture Guide"\nrendered-text = "Gain 1●."\nimage-number = 42\ncard-type = "Event"\nsubtype = ""\nenergy-cost = 3`,
      ...decoys,
      `[[cards]]\nid = "${STARTER_CARD_ID}"\nname = "Starter Witness"\ncard-type = "Character"\nsubtype = "Visitor"\nenergy-cost = 3\nrarity = "Starter"`,
    ].join("\n\n"),
  );
  return rootDir;
}

describe("Exploration candidates editor data", () => {
  it("loads validated groups enriched from UUID-keyed cards", () => {
    const groups = readExplorationCandidatesEditorGroups({ rootDir: writeFixtureRoot() });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      cardId: CARD_ID,
      cardName: "Fixture Guide",
      cardAbilityText: "Gain 1●.",
      imageNumber: 42,
    });
    expect(groups[0].encounters.find((entry) => entry.selected?.prose)?.rank).toBe(1);
    expect(groups[0].encounters.find((entry) => entry.selected?.actions)?.rank).toBe(1);
    expect(groups[0].encounters[0].actions[0]).toMatchObject({
      template_id: 10,
      template: "Gain {count} cards and $KEEP_THIS",
      rendered_template: "Gain 1 cards and $KEEP_THIS",
      runtime_card_selections: [],
    });
  });

  it("resolves runtime card placeholders by UUID and falls back outside the simulated deck", () => {
    const groups = readExplorationCandidatesEditorGroups({
      rootDir: writeRuntimeSelectionFixtureRoot(),
      random: () => 0,
    });
    const [deckAction, offeredAction] = groups[0].encounters[0].actions;
    expect(deckAction.rendered_template).toBe("Apply Kindled to Fallback Spirit");
    expect(deckAction.runtime_card_selections).toEqual([{
      placeholder: "$DECK_CARD",
      predicate: "Spirit Animal",
      cardId: SPIRIT_CARD_ID,
      cardName: "Fallback Spirit",
      source: "catalog_fallback",
    }]);
    expect(offeredAction.rendered_template).toBe(
      "Gain Decoy 1 and purge Starter Witness",
    );
    expect(offeredAction.runtime_card_selections).toEqual([
      {
        placeholder: "$OFFERED_CARD",
        predicate: "≤2● cost Character",
        cardId: "00000000-0000-4000-8000-000000000001",
        cardName: "Decoy 1",
        source: "offer_pool",
      },
      {
        placeholder: "$STARTER_CARD",
        predicate: null,
        cardId: STARTER_CARD_ID,
        cardName: "Starter Witness",
        source: "starter_deck",
      },
    ]);
    expect(offeredAction.rendered_template_parts.filter((part) => part.kind === "card"))
      .toHaveLength(2);
  });

  it("moves one selection marker without changing the other marker, rank, or source order", () => {
    const before = documentFixture();
    const result = selectEncounterCandidate(before, {
      cardId: CARD_ID,
      templatePairId: "pair-2",
      selectionKind: "prose",
    });
    expect(result.confirmation).toEqual({
      cardId: CARD_ID,
      selectionKind: "prose",
      selectedTemplatePairId: "pair-2",
      selectedRank: 2,
    });
    expect(result.document[CARD_ID].map((entry) => entry.rank)).toEqual([1, 2]);
    expect(result.document[CARD_ID].map((entry) => entry.selected)).toEqual([
      { actions: true },
      { prose: true },
    ]);
    expect(before[CARD_ID][0].selected).toEqual({ prose: true, actions: true });
  });

  it("edits prose and action copy by stable identities while preserving metadata", () => {
    const prose = editEncounterCandidateText(documentFixture(), {
      cardId: CARD_ID,
      templatePairId: "pair-1",
      field: "prose",
      value: "A revised scene.",
    });
    const action = editEncounterCandidateText(prose.document, {
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 11,
      field: "label",
      value: "A revised action.",
    });
    const edited = action.document[CARD_ID][0];
    expect(edited.prose).toBe("A revised scene.");
    expect(edited.actions[1].label).toBe("A revised action.");
    expect(edited.actions[1]).not.toHaveProperty("template");
    expect(edited.rank).toBe(1);
  });

  it("edits an existing numeric template variable by stable action identity", () => {
    const result = editEncounterCandidateVariable(documentFixture(), {
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 10,
      variableName: "count",
      value: 3,
    });
    expect(result.confirmation).toEqual({
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 10,
      variableName: "count",
      value: 3,
    });
    expect(result.document[CARD_ID][0].actions[0].variables.count).toBe(3);
    expect(documentFixture()[CARD_ID][0].actions[0].variables.count).toBe(1);
    expect(() => editEncounterCandidateVariable(documentFixture(), {
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 10,
      variableName: "missing",
      value: 3,
    })).toThrow("Variable missing was not found");
    expect(() => editEncounterCandidateVariable(documentFixture(), {
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 10,
      variableName: "count",
      value: -1,
    })).toThrow("non-negative integers");
  });

  it("renders ordinary variables while preserving runtime variables", () => {
    expect(renderEncounterTemplate(
      "Gain {count} copies of $OFFERED_CARD named {card_id}",
      {
        count: 2,
        card_id: {
          id: "22222222-2222-4222-8222-222222222222",
          display_name: "Fixture Ally",
        },
      },
    )).toBe("Gain 2 copies of $OFFERED_CARD named Fixture Ally");
  });

  it("preserves UUID-backed card and dreamsign variables as rendered entity parts", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "journey-encounter-entity-references-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "exploration_candidates.json"),
      `${JSON.stringify({
        [CARD_ID]: [{
          template_pair_id: "pair-1",
          prose: "A test encounter.",
          actions: [
            {
              label: "Take the ally",
              template_id: 1,
              variables: {
                card_id: { id: UNRELATED_CARD_ID, display_name: "Fixture Ally" },
              },
            },
            {
              label: "Take the sign",
              template_id: 2,
              variables: {
                dreamsign_name: { id: DREAMSIGN_ID, display_name: "Bell" },
              },
            },
          ],
          rank: 1,
          selected: { prose: true, actions: true },
        }],
      }, null, 2)}\n`,
    );
    writeFileSync(
      join(rootDir, "data", "templates.json"),
      `${JSON.stringify([
        { template_id: 1, template: "Gain {card_id}" },
        { template_id: 2, template: "Gain {dreamsign_name}" },
      ], null, 2)}\n`,
    );
    writeFileSync(
      join(rootDir, "data", "tabula", "cards.toml"),
      `[[cards]]\nid = "${CARD_ID}"\nname = "Fixture Guide"\nrendered-text = "Gain 1●."\nimage-number = 42\n\n[[cards]]\nid = "${UNRELATED_CARD_ID}"\nname = "Fixture Ally"\nrendered-text = "Gain 2●."\nimage-number = 43\n`,
    );

    const [group] = readExplorationCandidatesEditorGroups({ rootDir, random: () => 0 });
    expect(group.encounters[0].actions[0].rendered_template_parts).toEqual([
      { kind: "text", text: "Gain " },
      {
        kind: "card",
        placeholder: "{card_id}",
        cardId: UNRELATED_CARD_ID,
        cardName: "Fixture Ally",
      },
    ]);
    expect(group.encounters[0].actions[1].rendered_template_parts).toEqual([
      { kind: "text", text: "Gain " },
      {
        kind: "dreamsign",
        placeholder: "{dreamsign_name}",
        dreamsignId: DREAMSIGN_ID,
        dreamsignName: "Bell",
      },
    ]);
  });

  it("edits canonical templates and rejects placeholder changes that invalidate candidates", () => {
    const templates = [
      { template_id: 10, template: "Gain {count} cards" },
      { template_id: 11, template: "Gain something else" },
      { template_id: 20, template: "Gain {count} cards" },
      { template_id: 21, template: "Gain another thing" },
    ];
    const edited = editEncounterTemplate(templates, documentFixture(), {
      templateId: 10,
      value: "Draw {count} cards",
    });
    expect(edited.document[0].template).toBe("Draw {count} cards");
    expect(templates[0].template).toBe("Gain {count} cards");
    expect(() => editEncounterTemplate(templates, documentFixture(), {
      templateId: 10,
      value: "Draw {amount} cards",
    })).toThrow("variables is missing {amount}");
  });

  it("rejects blank text and ambiguous selected markers", () => {
    expect(() =>
      editEncounterCandidateText(documentFixture(), {
        cardId: CARD_ID,
        templatePairId: "pair-1",
        field: "prose",
        value: "   ",
      }),
    ).toThrow("value must be nonblank text");

    const ambiguous = documentFixture();
    ambiguous[CARD_ID][1].selected = { prose: true };
    expect(() => parseEncounterCandidates(JSON.stringify(ambiguous))).toThrow(
      `${CARD_ID} must have exactly one selected prose candidate; found 2.`,
    );
  });

  it("rejects the legacy array document shape", () => {
    expect(() => parseEncounterCandidates(JSON.stringify([]))).toThrow(
      "Encounter candidates must be an object.",
    );
  });

  it("restores the original file when atomic replacement fails", () => {
    const rootDir = writeFixtureRoot();
    const path = join(rootDir, "data", "exploration_candidates.json");
    const before = readFileSync(path, "utf8");
    const next = selectEncounterCandidate(documentFixture(), {
      cardId: CARD_ID,
      templatePairId: "pair-2",
      selectionKind: "actions",
    }).document;
    const fileSystem = {
      existsSync,
      readFileSync,
      renameSync(from, to) {
        if (String(from).endsWith(".tmp")) {
          throw new Error("Injected replacement failure");
        }
        renameSync(from, to);
      },
      rmSync,
      writeFileSync,
    };
    expect(() =>
      commitEncounterCandidates(next, { rootDir, fileSystem }),
    ).toThrow("Injected replacement failure");
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("restores the original template catalog when atomic replacement fails", () => {
    const rootDir = writeFixtureRoot();
    const path = join(rootDir, "data", "templates.json");
    const before = readFileSync(path, "utf8");
    const next = JSON.parse(before);
    next[0].template = "Draw {count} cards and $KEEP_THIS";
    const fileSystem = {
      existsSync,
      readFileSync,
      renameSync(from, to) {
        if (String(from).endsWith(".tmp")) throw new Error("Injected template failure");
        renameSync(from, to);
      },
      rmSync,
      writeFileSync,
    };
    expect(() => commitEncounterTemplates(next, { rootDir, fileSystem }))
      .toThrow("Injected template failure");
    expect(readFileSync(path, "utf8")).toBe(before);
  });
});
