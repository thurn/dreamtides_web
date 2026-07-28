import { describe, expect, it } from "vitest";
import type { SiteState, SiteType } from "../../types/journey";
import { screenFor, siteDispositionFor, type NonSiteScreen } from "./registry";

describe("screenFor", () => {
  it.each<NonSiteScreen>([
    { type: "journeyStart" },
    { type: "dreamscape" },
    { type: "atlas" },
    { type: "journeyComplete" },
    { type: "journeyFailed" },
  ])("resolves $type to a Cumulus adapter", (screen) => {
    expect(screenFor(screen)).toBeTruthy();
  });
});

describe("siteDispositionFor", () => {
  const screenTypes = [
    "Draft",
    "Shop",
    "Purge",
    "Transfiguration",
    "Duplication",
    "DreamAugury",
    "DreamsignMarket",
    "DreamsignRevelation",
    "TemptingOffer",
    "Gamble",
    "TemporalFork",
  ] as const satisfies readonly SiteType[];

  it.each(screenTypes)("routes %s to a Cumulus screen adapter", (type) => {
    expect(siteDispositionFor(site(type)).kind).toBe("screen");
  });

  it("routes Battle through the battle route", () => {
    expect(siteDispositionFor(site("Battle"))).toEqual({ kind: "battle" });
  });

  it.each(["Essence", "Reward"] as const)(
    "marks %s as Dreamscape-inline",
    (type) => {
      expect(siteDispositionFor(site(type))).toEqual({ kind: "inline" });
    },
  );
});

function site(type: SiteType): SiteState {
  return { id: `site-${type}`, type } as SiteState;
}
