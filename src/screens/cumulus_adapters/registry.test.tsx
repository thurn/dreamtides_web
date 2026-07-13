import { describe, expect, it } from "vitest";
import type { SiteState } from "../../types/quest";
import {
  isCumulusScreenRegistered,
  isCumulusSiteRegistered,
  cumulusScreenFor,
  cumulusSiteScreenFor,
} from "./registry";

describe("cumulusScreenFor", () => {
  it("resolves the migrated questStart screen to a Cumulus node", () => {
    expect(cumulusScreenFor({ type: "questStart" })).not.toBeNull();
  });

  it("resolves the migrated dreamscape screen to a Cumulus node", () => {
    expect(cumulusScreenFor({ type: "dreamscape" })).not.toBeNull();
  });

  it("resolves the migrated atlas screen to a Cumulus node", () => {
    expect(cumulusScreenFor({ type: "atlas" })).not.toBeNull();
  });

  it("returns null for screens not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(cumulusScreenFor({ type: "site", siteId: "site-1" })).toBeNull();
    expect(cumulusScreenFor({ type: "questComplete" })).toBeNull();
    expect(cumulusScreenFor({ type: "questFailed" })).toBeNull();
  });

  it("reports registration from the same resolver used by the router", () => {
    expect(isCumulusScreenRegistered({ type: "atlas" })).toBe(true);
    expect(isCumulusScreenRegistered({ type: "questComplete" })).toBe(false);
  });
});

describe("cumulusSiteScreenFor", () => {
  it("resolves the migrated Draft site to a Cumulus node", () => {
    expect(
      cumulusSiteScreenFor({ type: "Draft", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("resolves the migrated Purge site to a Cumulus node", () => {
    expect(
      cumulusSiteScreenFor({ type: "Purge", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("resolves the migrated Card Shop site to a Cumulus node", () => {
    expect(
      cumulusSiteScreenFor({ type: "Shop", id: "site-1" } as SiteState),
    ).not.toBeNull();
  });

  it("resolves the migrated Dreamsign Bazaar site to a Cumulus node", () => {
    expect(
      cumulusSiteScreenFor({
        type: "DreamsignMarket",
        id: "site-1",
      } as SiteState),
    ).not.toBeNull();
  });

  it("resolves both standard and enhanced Transfiguration to Cumulus", () => {
    expect(
      cumulusSiteScreenFor({
        type: "Transfiguration",
        id: "site-1",
        isEnhanced: false,
      } as SiteState),
    ).not.toBeNull();
    expect(
      cumulusSiteScreenFor({
        type: "Transfiguration",
        id: "site-1",
        isEnhanced: true,
      } as SiteState),
    ).not.toBeNull();
  });

  it("returns null for site types not yet migrated, so ScreenRouter falls back to legacy", () => {
    expect(cumulusSiteScreenFor({ type: "Reward" } as SiteState)).toBeNull();
  });

  it("reports site registration from the same resolver used by the router", () => {
    expect(
      isCumulusSiteRegistered({ type: "Draft", id: "site-1" } as SiteState),
    ).toBe(true);
    expect(isCumulusSiteRegistered({ type: "Reward" } as SiteState)).toBe(
      false,
    );
  });
});
