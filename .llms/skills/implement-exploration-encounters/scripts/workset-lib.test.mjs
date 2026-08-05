import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildEncounterWorkset,
  encounterRecordsFromToml,
  verifyEncounterWorkset,
} from "./workset-lib.mjs";
import { parsePrepareArgs } from "./prepare-workset.mjs";
import { parseVerifyArgs } from "./verify-workset.mjs";

const LIVE_CARD_ID = "11111111-1111-4111-8111-111111111111";
const NEW_CARD_ID = "22222222-2222-4222-8222-222222222222";
const PREPARE_SCRIPT_PATH = fileURLToPath(
  new URL("./prepare-workset.mjs", import.meta.url),
);

function candidate(label, firstTemplateId, secondTemplateId) {
  return [{
    template_pair_id: "pair-1",
    prose: `${label} prose.`,
    actions: [
      { label: `${label} first`, template_id: firstTemplateId, variables: {} },
      { label: `${label} second`, template_id: secondTemplateId, variables: {} },
    ],
    rank: 1,
    selected: { prose: true, actions: true },
  }];
}

function sources() {
  return {
    candidatesSource: `${JSON.stringify({
      [LIVE_CARD_ID]: candidate("Live", 10, 11),
      [NEW_CARD_ID]: candidate("New", 12, 13),
    })}\n`,
    explorationSource: `
[[encounter]]
card-id = "${LIVE_CARD_ID.toUpperCase()}"
prose = "Already implemented."
`,
    templatesSource: `${JSON.stringify([
      { template_id: 10, template: "Live first" },
      { template_id: 11, template: "Live second" },
      { template_id: 12, template: "New first" },
      { template_id: 13, template: "New second" },
    ])}\n`,
  };
}

describe("Exploration encounter worksets", () => {
  it("selects only candidate UUIDs absent from the live catalog", () => {
    const result = buildEncounterWorkset(sources());

    assert.deepEqual(result.report, {
      candidateCount: 2,
      liveEncounterCount: 1,
      representedCandidateCount: 1,
      unimplementedCount: 1,
      unimplementedCardIds: [NEW_CARD_ID],
      selectedCount: 1,
      selectedCardIds: [NEW_CARD_ID],
    });
    const workset = encounterRecordsFromToml(result.selectedToml, "workset");
    assert.deepEqual([...workset.keys()], [NEW_CARD_ID]);
    assert.equal(result.selectedToml.includes(LIVE_CARD_ID), false);
    assert.doesNotMatch(result.selectedToml, /^effect-kind\s*=/mu);
  });

  it("supports an explicit unimplemented UUID subset", () => {
    const result = buildEncounterWorkset({
      ...sources(),
      requestedCardIds: [NEW_CARD_ID],
    });

    assert.deepEqual(result.report.selectedCardIds, [NEW_CARD_ID]);
  });

  it("returns no TOML when every candidate UUID is represented", () => {
    const allLive = sources();
    allLive.explorationSource += `
[[encounter]]
card-id = "${NEW_CARD_ID}"
prose = "Also implemented."
`;

    const result = buildEncounterWorkset(allLive);

    assert.equal(result.report.unimplementedCount, 0);
    assert.equal(result.report.selectedCount, 0);
    assert.equal(result.selectedToml, null);
  });

  it("rejects a requested UUID that is already represented", () => {
    assert.throws(() => buildEncounterWorkset({
      ...sources(),
      requestedCardIds: [LIVE_CARD_ID],
    }), /already has a live encounter/u);
  });

  it("rejects duplicate live encounter UUIDs case-insensitively", () => {
    assert.throws(() => encounterRecordsFromToml(`
[[encounter]]
card-id = "${LIVE_CARD_ID}"
[[encounter]]
card-id = "${LIVE_CARD_ID.toUpperCase()}"
`, "fixture exploration.toml"), /duplicate encounter card-id/u);
  });

  it("verifies runtime-complete live actions for every workset UUID", () => {
    const worksetSource = `
[[encounter]]
card-id = "${NEW_CARD_ID}"
prose = "Staged."
`;
    const explorationSource = `
[[encounter]]
card-id = "${NEW_CARD_ID}"
prose = "Implemented."
[[encounter.action]]
id = "${NEW_CARD_ID}:first"
label = "First"
effect-text = "Gain a boon"
effect-kind = "gain-card"
[[encounter.action]]
id = "${NEW_CARD_ID}:second"
label = "Second"
effect-text = "Gain another boon"
effect-kind = "gain-dreamsign"
`;

    assert.deepEqual(verifyEncounterWorkset({ worksetSource, explorationSource }), {
      worksetEncounterCount: 1,
      verifiedEncounterCount: 1,
      verifiedCardIds: [NEW_CARD_ID],
    });
  });

  it("rejects a live action without an effect kind", () => {
    const worksetSource = `[[encounter]]\ncard-id = "${NEW_CARD_ID}"\n`;
    const explorationSource = `
[[encounter]]
card-id = "${NEW_CARD_ID}"
prose = "Incomplete."
[[encounter.action]]
id = "${NEW_CARD_ID}:first"
label = "First"
effect-text = "First effect"
[[encounter.action]]
id = "${NEW_CARD_ID}:second"
label = "Second"
effect-text = "Second effect"
effect-kind = "gain-card"
`;

    assert.throws(
      () => verifyEncounterWorkset({ worksetSource, explorationSource }),
      /effect-kind must be a non-empty string/u,
    );
  });

  it("parses preparation and verification CLI paths", () => {
    const prepare = parsePrepareArgs([
      "--card-id",
      NEW_CARD_ID,
      "--out",
      "fixtures/workset.toml",
      "--format",
      "json",
    ]);
    const verify = parseVerifyArgs([
      "--workset",
      "fixtures/workset.toml",
      "--exploration",
      "fixtures/exploration.toml",
    ]);

    assert.deepEqual(prepare.requestedCardIds, [NEW_CARD_ID]);
    assert.equal(prepare.outputPath.endsWith("/fixtures/workset.toml"), true);
    assert.equal(prepare.format, "json");
    assert.equal(verify.worksetPath.endsWith("/fixtures/workset.toml"), true);
    assert.equal(verify.explorationPath.endsWith("/fixtures/exploration.toml"), true);
  });

  it("reports an empty selection successfully without writing an output file", () => {
    const runDirectory = mkdtempSync(join(tmpdir(), "exploration-workset-test-"));
    try {
      const fixture = sources();
      fixture.explorationSource += `
[[encounter]]
card-id = "${NEW_CARD_ID}"
prose = "Also implemented."
`;
      const candidatesPath = join(runDirectory, "candidates.json");
      const explorationPath = join(runDirectory, "exploration.toml");
      const templatesPath = join(runDirectory, "templates.json");
      const outputPath = join(runDirectory, "workset.toml");
      writeFileSync(candidatesPath, fixture.candidatesSource, "utf8");
      writeFileSync(explorationPath, fixture.explorationSource, "utf8");
      writeFileSync(templatesPath, fixture.templatesSource, "utf8");

      const result = spawnSync(process.execPath, [
        PREPARE_SCRIPT_PATH,
        "--candidates",
        candidatesPath,
        "--exploration",
        explorationPath,
        "--templates",
        templatesPath,
        "--out",
        outputPath,
        "--format",
        "json",
      ], { encoding: "utf8" });

      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), {
        candidateCount: 2,
        liveEncounterCount: 2,
        representedCandidateCount: 2,
        unimplementedCount: 0,
        unimplementedCardIds: [],
        selectedCount: 0,
        selectedCardIds: [],
      });
      assert.match(result.stderr, /no workset was written/u);
      assert.equal(existsSync(outputPath), false);
    } finally {
      rmSync(runDirectory, { recursive: true, force: true });
    }
  });
});
