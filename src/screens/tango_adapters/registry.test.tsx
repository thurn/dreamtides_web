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
  it("returns null for every site (no site screens migrated yet)", () => {
    expect(tangoSiteScreenFor({ type: "Draft" } as SiteState)).toBeNull();
    expect(tangoSiteScreenFor({ type: "Reward" } as SiteState)).toBeNull();
  });
});
