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
  editEncounterCandidateText,
  parseEncounterCandidates,
  readEncounterEditorGroups,
  selectEncounterCandidate,
} from "./encounter-editor-data.mjs";

const CARD_ID = "11111111-1111-4111-8111-111111111111";

function candidate(rank, selected = false) {
  return {
    template_pair_id: `pair-${String(rank)}`,
    prose: `Prose ${String(rank)}`,
    actions: [
      {
        label: `First ${String(rank)}`,
        resolution: `First resolution ${String(rank)}`,
        template_id: rank * 10,
        template: "Gain something",
        variables: {},
        effect_text: `First effect ${String(rank)}`,
      },
      {
        label: `Second ${String(rank)}`,
        resolution: `Second resolution ${String(rank)}`,
        template_id: rank * 10 + 1,
        template: "Gain something else",
        variables: {},
        effect_text: `Second effect ${String(rank)}`,
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
  const rootDir = mkdtempSync(join(tmpdir(), "journey-encounter-editor-data-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(
    join(rootDir, "data", "encounter_candidates.json"),
    `${JSON.stringify(documentFixture(), null, 2)}\n`,
  );
  writeFileSync(
    join(rootDir, "data", "tabula", "cards.toml"),
    `[[cards]]\nid = "${CARD_ID}"\nname = "Fixture Guide"\nimage-number = 42\n`,
  );
  return rootDir;
}

describe("encounter editor data", () => {
  it("loads validated groups enriched from UUID-keyed cards", () => {
    const groups = readEncounterEditorGroups({ rootDir: writeFixtureRoot() });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      cardId: CARD_ID,
      cardName: "Fixture Guide",
      imageNumber: 42,
    });
    expect(groups[0].encounters.find((entry) => entry.selected?.prose)?.rank).toBe(1);
    expect(groups[0].encounters.find((entry) => entry.selected?.actions)?.rank).toBe(1);
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
      field: "resolution",
      value: "A revised resolution.",
    });
    const edited = action.document[CARD_ID][0];
    expect(edited.prose).toBe("A revised scene.");
    expect(edited.actions[1].resolution).toBe("A revised resolution.");
    expect(edited.actions[1].template).toBe("Gain something else");
    expect(edited.rank).toBe(1);
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
    const path = join(rootDir, "data", "encounter_candidates.json");
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
});
