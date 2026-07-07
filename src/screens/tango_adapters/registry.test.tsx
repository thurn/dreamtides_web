import { describe, expect, it } from "vitest";
import type { SiteState } from "../../types/quest";
import { tangoScreenFor, tangoSiteScreenFor } from "./registry";

describe("tangoScreenFor", () => {
  it("resolves the migrated questStart screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "questStart" })).not.toBeNull();
  });

  it("resolves the migrated dreamscape screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "dreamscape" })).not.toBeNull();
  });

  it("resolves the migrated atlas screen to a Tango node", () => {
    expect(tangoScreenFor({ type: "atlas" })).not.toBeNull();
  });

  it("returns null for screens not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(tangoScreenFor({ type: "site", siteId: "site-1" })).toBeNull();
    expect(tangoScreenFor({ type: "questComplete" })).toBeNull();
    expect(tangoScreenFor({ type: "questFailed" })).toBeNull();
  });
});

describe("tangoSiteScreenFor", () => {
  it("resolves the migrated Draft site to a Tango node", () => {
    expect(
      tangoSiteScreenFor({ type: "Draft", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("returns null for site types not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(tangoSiteScreenFor({ type: "Reward" } as SiteState)).toBeNull();
  });
});
