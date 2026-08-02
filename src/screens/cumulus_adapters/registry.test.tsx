import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import type { SiteState, SiteType } from "../../types/journey";
import { screenFor, siteDispositionFor, type NonSiteScreen } from "./registry";
import { ExplorationSiteScreenAdapter } from "./ExplorationSiteScreenAdapter";
import { GambleSiteScreenAdapter } from "./GambleSiteScreenAdapter";

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
    "Exploration",
  ] as const satisfies readonly SiteType[];

  it.each(screenTypes)("routes %s to a Cumulus screen adapter", (type) => {
    expect(siteDispositionFor(site(type)).kind).toBe("screen");
  });

  it("routes Exploration to its dedicated card-channeling adapter", () => {
    const disposition = siteDispositionFor(site("Exploration"));
    expect(disposition.kind).toBe("screen");
    expect(
      disposition.kind === "screen" && isValidElement(disposition.screen),
    ).toBe(true);
    if (
      disposition.kind === "screen" &&
      isValidElement(disposition.screen)
    ) {
      expect(disposition.screen.type).toBe(ExplorationSiteScreenAdapter);
    }
  });

  it("routes Gamble to its dedicated playing-card adapter", () => {
    const disposition = siteDispositionFor(site("Gamble"));
    expect(disposition.kind).toBe("screen");
    expect(
      disposition.kind === "screen" && isValidElement(disposition.screen),
    ).toBe(true);
    if (disposition.kind === "screen" && isValidElement(disposition.screen)) {
      expect(disposition.screen.type).toBe(GambleSiteScreenAdapter);
    }
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
