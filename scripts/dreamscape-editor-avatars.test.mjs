// @vitest-environment node

import { describe, expect, it } from "vitest";
import { planAvatarAssignment } from "./dreamscape-editor-data.mjs";

// Self-contained ids so these assertions never depend on the production
// avatars.toml / dreamscapes.toml.
const A1 = "AAAAAAA1-0000-0000-0000-000000000001";
const A2 = "AAAAAAA2-0000-0000-0000-000000000002";
const A3 = "AAAAAAA3-0000-0000-0000-000000000003";
const A4 = "AAAAAAA4-0000-0000-0000-000000000004";
const B1 = "BBBBBBB1-0000-0000-0000-000000000001";
const B2 = "BBBBBBB2-0000-0000-0000-000000000002";
const B3 = "BBBBBBB3-0000-0000-0000-000000000003";
const POOL1 = "CCCCCCC1-0000-0000-0000-000000000001";

const CATALOG_IDS = [A1, A2, A3, A4, B1, B2, B3, POOL1];

// Region "alpha" starts full (4); "beta" starts at the minimum (3); POOL1 is
// unassigned. The starter hosts none.
function dreamscapes() {
  return [
    { id: "starter", name: "Starter", isStarter: true, avatarIds: [] },
    {
      id: "alpha",
      name: "Alpha",
      isStarter: false,
      avatarIds: [A1, A2, A3, A4],
    },
    {
      id: "beta",
      name: "Beta",
      isStarter: false,
      avatarIds: [B1, B2, B3],
    },
  ];
}

describe("planAvatarAssignment — replace", () => {
  it("replaces a resident with an unassigned caller (no swap)", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "beta",
      outId: B1,
      inId: POOL1,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "beta", ids: [POOL1, B2, B3] }]);
  });

  it("swaps two residents between regions, preserving both counts", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "beta",
      outId: B1,
      inId: A4,
    });
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(
      plan.changes.map((change) => [change.id, change.ids]),
    );
    expect(byId.beta).toEqual([A4, B2, B3]);
    expect(byId.alpha).toEqual([A1, A2, A3, B1]);
  });

  it("rejects a replacement that already lives in the region", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "replace",
      dreamscapeId: "alpha",
      outId: A1,
      inId: A2,
    });
    expect(plan.ok).toBe(false);
  });
});

describe("planAvatarAssignment — add", () => {
  it("adds an unassigned caller to a region with room", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "beta",
      inId: POOL1,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "beta", ids: [B1, B2, B3, POOL1] }]);
  });

  it("moves a surplus caller out of a 4-region into a region with room", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "beta",
      inId: A4,
    });
    expect(plan.ok).toBe(true);
    const byId = Object.fromEntries(
      plan.changes.map((change) => [change.id, change.ids]),
    );
    expect(byId.beta).toEqual([B1, B2, B3, A4]);
    expect(byId.alpha).toEqual([A1, A2, A3]);
  });

  it("rejects adding to a region already at the maximum", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "alpha",
      inId: POOL1,
    });
    expect(plan.ok).toBe(false);
  });

  it("rejects pulling a caller out of a region already at the minimum", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "add",
      dreamscapeId: "alpha",
      inId: B1,
    });
    // alpha is full anyway, so use a non-full target to isolate the min rule:
    const plan2 = planAvatarAssignment(
      [
        {
          id: "alpha",
          name: "Alpha",
          isStarter: false,
          avatarIds: [A1, A2, A3],
        },
        {
          id: "beta",
          name: "Beta",
          isStarter: false,
          avatarIds: [B1, B2, B3],
        },
      ],
      CATALOG_IDS,
      { action: "add", dreamscapeId: "alpha", inId: B1 },
    );
    expect(plan.ok).toBe(false);
    expect(plan2.ok).toBe(false);
  });
});

describe("planAvatarAssignment — remove and guards", () => {
  it("removes a resident while the region stays above the minimum", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "remove",
      dreamscapeId: "alpha",
      outId: A4,
    });
    expect(plan.ok).toBe(true);
    expect(plan.changes).toEqual([{ id: "alpha", ids: [A1, A2, A3] }]);
  });

  it("rejects removing below the minimum", () => {
    const plan = planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
      action: "remove",
      dreamscapeId: "beta",
      outId: B1,
    });
    expect(plan.ok).toBe(false);
  });

  it("rejects assigning to the starter and rejects unknown callers", () => {
    expect(
      planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
        action: "add",
        dreamscapeId: "starter",
        inId: POOL1,
      }).ok,
    ).toBe(false);
    expect(
      planAvatarAssignment(dreamscapes(), CATALOG_IDS, {
        action: "add",
        dreamscapeId: "beta",
        inId: "DEADBEEF-0000-0000-0000-000000000000",
      }).ok,
    ).toBe(false);
  });
});
