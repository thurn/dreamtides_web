// Structural-contract tests for the curated tide-relationship artifact's
// validator. These pin the schema invariants (every tide has allies, no
// dangling or self references, every DreamAvatar pool is non-empty) against
// synthetic fixtures — never against the committed
// `data/tide_relationships.jsonc`, whose content is curated design data and
// subject to change at any time.

import { describe, expect, it } from "vitest";

import type { TideRelationshipsJson } from "./tide-relationships-io.ts";
import { validateTideRelationships } from "./tide-relationships-io.ts";

const TIDE_IDS = new Set(["tide-1", "tide-2", "tide-3"]);

function makeRelationships(): TideRelationshipsJson {
  return {
    version: 1,
    alliesByTide: {
      "tide-1": ["tide-2", "tide-3"],
      "tide-2": ["tide-1"],
      "tide-3": [],
    },
    tidePoolByDreamAvatar: {
      "dc-a": ["tide-1", "tide-2"],
      "dc-b": ["tide-3"],
    },
  };
}

describe("validateTideRelationships", () => {
  it("accepts a well-formed artifact", () => {
    const data = makeRelationships();
    expect(
      validateTideRelationships(JSON.parse(JSON.stringify(data)), TIDE_IDS),
    ).toEqual(data);
  });

  it("accepts a tide with an empty ally list", () => {
    const data = makeRelationships();
    data.alliesByTide["tide-3"] = [];
    expect(() => validateTideRelationships(data, TIDE_IDS)).not.toThrow();
  });

  it("rejects a missing version", () => {
    const data = makeRelationships() as Partial<TideRelationshipsJson>;
    delete data.version;
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(/version/);
  });

  it("rejects a tide missing from alliesByTide", () => {
    const data = makeRelationships();
    delete data.alliesByTide["tide-3"];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(
      /missing from alliesByTide/,
    );
  });

  it("rejects an ally that names no tide", () => {
    const data = makeRelationships();
    data.alliesByTide["tide-1"] = ["tide-nope"];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(
      /names no tide/,
    );
  });

  it("rejects an alliesByTide key that names no tide", () => {
    const data = makeRelationships();
    data.alliesByTide["tide-nope"] = [];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(
      /names no tide/,
    );
  });

  it("rejects a self-ally", () => {
    const data = makeRelationships();
    data.alliesByTide["tide-1"] = ["tide-1"];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(
      /lists itself/,
    );
  });

  it("rejects a tide-pool id that names no tide", () => {
    const data = makeRelationships();
    data.tidePoolByDreamAvatar["dc-a"] = ["tide-nope"];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(
      /names no tide/,
    );
  });

  it("rejects an empty DreamAvatar tide pool", () => {
    const data = makeRelationships();
    data.tidePoolByDreamAvatar["dc-a"] = [];
    expect(() => validateTideRelationships(data, TIDE_IDS)).toThrow(/is empty/);
  });

  it("rejects a non-object payload", () => {
    expect(() => validateTideRelationships(null, TIDE_IDS)).toThrow(
      /not an object/,
    );
  });
});
