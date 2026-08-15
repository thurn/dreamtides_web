import { describe, expect, it } from "vitest";
import { buildOperations, draftFromSnapshot, validateDraft, type EditorSnapshot, type TideSummary } from "./editor";
import { affiliationFieldKey } from "./editor";
import { testAffiliationId, testTideId } from "../../src/types/test-identities";
import { parseSourceRevision } from "../../src/types/source-revision";

const AFFILIATION_ID = testAffiliationId("affiliation");

const tides: TideSummary[] = [
  { id: testTideId("00000000-0000-4000-8000-000000000101"), displayName: "First", role: "facet" },
  { id: testTideId("00000000-0000-4000-8000-000000000102"), displayName: "Second", role: "facet" },
  { id: testTideId("00000000-0000-4000-8000-000000000103"), displayName: "Third", role: "neutral" },
  { id: testTideId("00000000-0000-4000-8000-000000000104"), displayName: "Fourth", role: "neutral" },
];

const snapshot = {
  dataset: "affiliations",
  repositoryRoot: "fixture",
  sourceRevision: parseSourceRevision("one"),
  affiliations: [{ id: AFFILIATION_ID, name: "Fixture", atlas_card_theme: "Theme", tide_ids: tides.slice(0, 3).map((tide) => tide.id) }],
  tides,
} satisfies EditorSnapshot;

describe("draft operations", () => {
  it("creates a minimal semantic batch", () => {
    const draft = draftFromSnapshot(snapshot);
    draft.affiliations[0].name = "Changed";
    draft.affiliations[0].tide_ids = [tides[1].id, tides[2].id, tides[3].id];
    expect(buildOperations(snapshot, draft)).toEqual([
      { operation: "set_affiliation_field", affiliation_id: "affiliation", field: "name", value: "Changed" },
      { operation: "replace_affiliation_tides", affiliation_id: "affiliation", tide_ids: [tides[1].id, tides[2].id, tides[3].id] },
    ]);
  });

  it("emits no operations for an unchanged draft", () => {
    expect(buildOperations(snapshot, draftFromSnapshot(snapshot))).toEqual([]);
  });

  it("reports field, count, duplicate, and unresolved-reference errors", () => {
    const draft = draftFromSnapshot(snapshot);
    draft.affiliations[0].name = "";
    const missingTideId = testTideId("missing");
    draft.affiliations[0].tide_ids = [tides[0].id, tides[0].id, missingTideId];
    const result = validateDraft(draft, tides);
    expect(result.fields[affiliationFieldKey(AFFILIATION_ID, "name")]).toBeDefined();
    expect(result.fields[affiliationFieldKey(AFFILIATION_ID, "tide_ids")]).toBeDefined();
    expect(result.unresolvedTideIds[AFFILIATION_ID]).toEqual([missingTideId]);
  });
});
