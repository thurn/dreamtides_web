import { describe, expect, it } from "vitest";
import { draftSiteData, draftSitePickCount } from "./draft-site-config";

describe("draft site configuration", () => {
  it("persists the pick target on newly generated site data", () => {
    expect(draftSiteData(7)).toEqual({ draftPickCount: 7 });
  });

  it("uses loaded draft rules for legacy site data without a persisted target", () => {
    expect(draftSitePickCount({ data: undefined }, 7)).toBe(7);
    expect(draftSitePickCount({ data: {} }, 7)).toBe(7);
  });

  it("prefers a valid persisted target", () => {
    expect(draftSitePickCount({ data: { draftPickCount: 3 } }, 7)).toBe(3);
  });
});
