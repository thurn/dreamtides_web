import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  auditCanonicalLocalizationContract,
  canonicalRonFiles,
} from "./canonical-localization-audit.mjs";

function entry(pattern, arguments_ = {}) {
  return {
    arguments: arguments_,
    identity: {
      identity_version: 1,
      meaning: null,
      pattern: { kind: "text", text: pattern },
    },
  };
}

function bundle(entries) {
  return {
    entries: Object.fromEntries(
      entries.map((value, index) => [`entry-${String(index)}`, value]),
    ),
  };
}

describe("canonical localization audit", () => {
  it("discovers canonical RON catalogs recursively", () => {
    const root = mkdtempSync(join(tmpdir(), "canonical-ron-audit-"));
    try {
      mkdirSync(join(root, "internal"));
      writeFileSync(join(root, "root.ron"), "[]\n");
      writeFileSync(join(root, "internal", "nested.ron"), "[]\n");
      writeFileSync(join(root, "ignored.toml"), "value = 1\n");
      expect(canonicalRonFiles(root)).toEqual([
        join(root, "internal", "nested.ron"),
        join(root, "root.ron"),
      ]);
    } finally {
      rmSync(root, { recursive: true });
    }
  });
  it("accepts catalog-authorized paragraphs and parameterized projections", () => {
    const issues = auditCanonicalLocalizationContract({
      bundle: bundle([
        entry("First ability."),
        entry("Second ability."),
        entry("{first_paragraph}\n\n{second_paragraph}", {
          first_paragraph: { kind: "opaque" },
          second_paragraph: { kind: "opaque" },
        }),
        entry("{term} {value_1}", {
          term: { kind: "opaque" },
          value_1: { kind: "scalar" },
        }),
      ]),
      compositeValues: [
        {
          path: "fixture.rules",
          sourceText: "First ability.\n\nSecond ability.",
        },
      ],
      projectionTemplates: [
        { path: "fixture.projection", template: "{term} {1}" },
      ],
      runtimeTemplates: [
        { path: "fixture.runtime-template", template: "{term} {1}" },
      ],
    });

    expect(issues).toEqual([]);
  });

  it("reports every unsupported or unauthorized derived source shape", () => {
    const issues = auditCanonicalLocalizationContract({
      bundle: bundle([entry("First ability.")]),
      compositeValues: [
        {
          path: "fixture.missing-paragraph",
          sourceText: "First ability.\n\nMissing ability.",
        },
        {
          path: "fixture.three-paragraphs",
          sourceText: "First ability.\n\nSecond ability.\n\nThird ability.",
        },
      ],
      projectionTemplates: [
        { path: "fixture.numeric", template: "{term} {1}" },
        { path: "fixture.text-capture", template: "Choose {card_name}" },
      ],
      runtimeTemplates: [{ path: "fixture.numeric", template: "{term} {1}" }],
    });

    expect(issues.map((issue) => issue.code)).toEqual([
      "unmatched-composite-paragraph",
      "unsupported-composite",
      "unmatched-runtime-template",
      "unsupported-projection-placeholder",
    ]);
  });
});
