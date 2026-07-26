// @vitest-environment node

import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import {
  applyDreamAvatarChanges,
  planDreamAvatarAssignment,
  rewriteDreamAvatarIds,
} from "./dreamscape-editor-data.mjs";

// Self-contained ids so these assertions never depend on the production
// dream_avatars_v2.toml / dreamscapes.toml.
const A1 = "AAAAAAA1-0000-0000-0000-000000000001";
const A2 = "AAAAAAA2-0000-0000-0000-000000000002";
const A3 = "AAAAAAA3-0000-0000-0000-000000000003";
const A4 = "AAAAAAA4-0000-0000-0000-000000000004";
const B1 = "BBBBBBB1-0000-0000-0000-000000000001";
const B2 = "BBBBBBB2-0000-0000-0000-000000000002";
const B3 = "BBBBBBB3-0000-0000-0000-000000000003";
const POOL1 = "CCCCCCC1-0000-0000-0000-000000000001";

const CATALOG_IDS = [A1, A2, A3, A4, B1, B2, B3, POOL1];
const NAME_BY_ID = new Map(
  CATALOG_IDS.map((id, index) => [id.toLowerCase(), `Caller ${String(index + 1)}`]),
);

// Region "alpha" starts full (4); "beta" starts at the minimum (3); POOL1 is
// unassigned. The starter hosts none.
function dreamscapes() {
  return [
    { id: "starter", name: "Starter", isStarter: true, dreamAvatarIds: [] },
    { id: "alpha", name: "Alpha", isStarter: false, dreamAvatarIds: [A1, A2, A3, A4] },
    { id: "beta", name: "Beta", isStarter: false, dreamAvatarIds: [B1, B2, B3] },
  ];
}

function fixtureToml() {
  return `[[dreamscapes]]
id = "starter"
name = "Starter"
is-starter = true

[[dreamscapes]]
id = "alpha"
name = "Alpha"
# Alpha's resident callers.
dream-avatar-ids = [
  "${A1}", # Caller 1
  "${A2}", # Caller 2
  "${A3}", # Caller 3
  "${A4}", # Caller 4
]

[[dreamscapes]]
id = "beta"
name = "Beta"
dream-avatar-ids = [
  "${B1}", # Caller 5
  "${B2}", # Caller 6
  "${B3}", # Caller 7
]
`;
}

describe("planDreamAvatarAssignment — replace", () => {
  it("replaces a resident with an unassigned caller (no swap)", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "beta",
      outId: B1,
      inId: POOL1,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "beta", ids: [POOL1, B2, B3] }]);
  });

  it("swaps two residents between regions, preserving both counts", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "beta",
      outId: B1,
      inId: A4,
    });
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.changes.map((change) => [change.id, change.ids]));
    expect(byId.beta).toEqual([A4, B2, B3]);
    expect(byId.alpha).toEqual([A1, A2, A3, B1]);
  });

  it("rejects a replacement that already lives in the region", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "alpha",
      outId: A1,
      inId: A2,
    });
    expect(plan.ok).toBe(false);
  });
});

describe("planDreamAvatarAssignment — add", () => {
  it("adds an unassigned caller to a region with room", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "beta",
      inId: POOL1,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "beta", ids: [B1, B2, B3, POOL1] }]);
  });

  it("moves a surplus caller out of a 4-region into a region with room", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "beta",
      inId: A4,
    });
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(plan.changes.map((change) => [change.id, change.ids]));
    expect(byId.beta).toEqual([B1, B2, B3, A4]);
    expect(byId.alpha).toEqual([A1, A2, A3]);
  });

  it("rejects adding to a region already at the maximum", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "alpha",
      inId: POOL1,
    });
    expect(plan.ok).toBe(false);
  });

  it("rejects pulling a caller out of a region already at the minimum", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "alpha",
      inId: B1,
    });
    // alpha is full anyway, so use a non-full target to isolate the min rule:
    const plan2 = planDreamAvatarAssignment(
      [
        { id: "alpha", name: "Alpha", isStarter: false, dreamAvatarIds: [A1, A2, A3] },
        { id: "beta", name: "Beta", isStarter: false, dreamAvatarIds: [B1, B2, B3] },
      ],
      CATALOG_IDS,
      { action: "add", dreamscapeId: "alpha", inId: B1 },
    );
    expect(plan.ok).toBe(false);
    expect(plan2.ok).toBe(false);
  });
});

describe("planDreamAvatarAssignment — remove and guards", () => {
  it("removes a resident while the region stays above the minimum", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "remove",
      dreamscapeId: "alpha",
      outId: A4,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "alpha", ids: [A1, A2, A3] }]);
  });

  it("rejects removing below the minimum", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "remove",
      dreamscapeId: "beta",
      outId: B1,
    });
    expect(plan.ok).toBe(false);
  });

  it("rejects assigning to the starter and rejects unknown callers", () => {
    expect(
      planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
        action: "add",
        dreamscapeId: "starter",
        inId: POOL1,
      }).ok,
    ).toBe(false);
    expect(
      planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
        action: "add",
        dreamscapeId: "beta",
        inId: "DEADBEEF-0000-0000-0000-000000000000",
      }).ok,
    ).toBe(false);
  });
});

describe("rewriteDreamAvatarIds / applyDreamAvatarChanges", () => {
  it("rewrites one region's array in the multiline name-comment style", () => {
    const next = rewriteDreamAvatarIds(fixtureToml(), {
      dreamscapeId: "beta",
      ids: [POOL1, B2, B3],
      nameById: NAME_BY_ID,
    });
    // The TOML still parses and beta now lists the new roster.
    const beta = parse(next).dreamscapes.find((entry) => entry.id === "beta");
    expect(beta["dream-avatar-ids"]).toEqual([POOL1, B2, B3]);
    // Alpha is untouched, and the human name comment is preserved.
    expect(next).toContain("# Alpha's resident callers.");
    expect(next).toContain(`"${POOL1}", # Caller 8`);
  });

  it("applies a two-region swap atomically and keeps the file valid", () => {
    const plan = planDreamAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "beta",
      outId: B1,
      inId: A4,
    });
    const next = applyDreamAvatarChanges(fixtureToml(), plan.changes, NAME_BY_ID);
    const parsed = parse(next);
    const alpha = parsed.dreamscapes.find((entry) => entry.id === "alpha");
    const beta = parsed.dreamscapes.find((entry) => entry.id === "beta");
    expect(alpha["dream-avatar-ids"]).toEqual([A1, A2, A3, B1]);
    expect(beta["dream-avatar-ids"]).toEqual([A4, B2, B3]);
  });

  it("collapses an emptied array to the inline form", () => {
    const next = rewriteDreamAvatarIds(fixtureToml(), {
      dreamscapeId: "beta",
      ids: [],
      nameById: NAME_BY_ID,
    });
    expect(next).toContain("dream-avatar-ids = []");
    expect(parse(next).dreamscapes.find((entry) => entry.id === "beta")["dream-avatar-ids"]).toEqual(
      [],
    );
  });
});
