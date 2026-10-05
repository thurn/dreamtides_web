import { describe, expect, it } from "vitest";
import {
  guideForSiteType,
  guideForSite,
  loadAffiliations,
  loadDreamGuides,
  loadDreamscapes,
} from "./dreamscapes";
import { loadAtlasData } from "./atlas-data";
import { loadSitesData } from "./sites-data";
import { generateSiteComposition } from "../atlas/atlas-generator";
import { LayerName } from "../types/layer-name";
import type { DreamscapeContent } from "../types/content";
import type { SiteType } from "../types/journey";
import { loadTides4Decks } from "./cards-v2-database";

// Referential-integrity test for the dreamscape / guide / affiliation / atlas
// content modules, loaded through their real loaders.
//
// The assertions are structural contracts only: ids resolve, exactly one
// starter exists, and every cross-reference points at a real entry. It
// deliberately asserts no specific names, counts, or content limits beyond
// "exactly one starter", so authoring edits never break it.

describe("dreamscape content referential integrity", () => {
  it("every dreamscape has a non-empty id and name", () => {
    const dreamscapes = loadDreamscapes();
    expect(dreamscapes.length).toBeGreaterThan(0);
    for (const d of dreamscapes) {
      expect(typeof d.id).toBe("string");
      expect(d.id.length).toBeGreaterThan(0);
      expect(typeof d.name).toBe("string");
      expect(d.name.length).toBeGreaterThan(0);
    }
  });

  it("exactly one dreamscape is the starter", () => {
    const dreamscapes = loadDreamscapes();
    const starters = dreamscapes.filter((d) => d.isStarter);
    expect(starters.length).toBe(1);
  });

  it("every non-starter dreamscape resolves its guide and affiliation", () => {
    const [dreamscapes, guides, affiliations] = [
      loadDreamscapes(),
      loadDreamGuides(),
      loadAffiliations(),
    ];
    const guideIds = new Set(guides.map((g) => g.id));
    const affiliationIds = new Set(affiliations.map((a) => a.id));
    for (const d of dreamscapes) {
      if (d.isStarter) continue;
      if (d.guideId === null || d.affiliationId === null) {
        throw new Error(`Dreamscape ${d.id} is missing catalog references.`);
      }
      expect(guideIds.has(d.guideId)).toBe(true);
      expect(affiliationIds.has(d.affiliationId)).toBe(true);
    }
  });

  it("every guide's home dreamscape resolves", () => {
    const [dreamscapes, guides] = [loadDreamscapes(), loadDreamGuides()];
    const dreamscapeIds = new Set(dreamscapes.map((d) => d.id));
    for (const g of guides) {
      expect(typeof g.homeDreamscapeId).toBe("string");
      expect(dreamscapeIds.has(g.homeDreamscapeId)).toBe(true);
    }
  });

  it("every affiliation defines exactly three known tides", () => {
    const affiliations = loadAffiliations();
    const artifact = loadTides4Decks();
    const tideIds = new Set(artifact.tides.map((tide) => tide.id));
    expect(affiliations.length).toBeGreaterThan(0);
    for (const a of affiliations) {
      expect(a.tideIds).toHaveLength(3);
      expect(new Set(a.tideIds).size).toBe(3);
      for (const tideId of a.tideIds) expect(tideIds.has(tideId)).toBe(true);
    }
  });

  it("every non-starter dreamscape's signature site resolves to the guide whose home it is", () => {
    const [dreamscapes, guides] = [loadDreamscapes(), loadDreamGuides()];
    for (const d of dreamscapes) {
      if (d.isStarter) continue;
      // The guide who tends this dreamscape's signature site type...
      const guide = guideForSiteType(guides, d.signatureSite);
      if (guide === null) {
        throw new Error(`No guide tends ${d.signatureSite}.`);
      }
      // ...must be the guide whose home dreamscape this is. This is the
      // dreamscape <-> guide <-> signature-site contract the frame and the
      // home-enhancement trigger both rely on.
      expect(guide.homeDreamscapeId).toBe(d.id);
      // And that guide must be the one the dreamscape names as its resident.
      expect(guide.id).toBe(d.guideId);
    }
  });

  it("a guide's signature site is enhanced in its home dreamscape and unenhanced elsewhere", () => {
    const [dreamscapes, guides, atlasData] = [
      loadDreamscapes(),
      loadDreamGuides(),
      loadAtlasData(),
    ];
    const context = { dreamscapeModifiers: [], draftPickCount: 5 };
    const sitesData = loadSitesData();
    const homeOf = (siteType: SiteType): DreamscapeContent | undefined =>
      dreamscapes.find((d) => !d.isStarter && d.signatureSite === siteType);

    for (const guide of guides) {
      const home = homeOf(guide.siteType);
      // Every guide must have a home dreamscape whose signature site it tends.
      expect(home).toBeDefined();
      if (home === undefined) continue;

      // Composing the home dreamscape always marks its signature site enhanced.
      const homeComposition = generateSiteComposition({
        layer: LayerName.Four,
        dreamscape: home,
        dreamscapes,
        atlasData,
        sitesData,
        context,
      });
      expect(homeComposition.enhancedSiteType).toBe(guide.siteType);
      const homeSite = homeComposition.sites.find(
        (s) => s.type === guide.siteType,
      );
      expect(homeSite).toBeDefined();
      expect(homeSite?.isEnhanced).toBe(true);

      // The same site type, composed for a *different* dreamscape, is never the
      // enhanced signature site of that dreamscape, so any instance of it that
      // appears (as fill) is unenhanced.
      const elsewhere = dreamscapes.find(
        (d) => !d.isStarter && d.signatureSite !== guide.siteType,
      );
      expect(elsewhere).toBeDefined();
      if (elsewhere === undefined) continue;
      const elsewhereComposition = generateSiteComposition({
        layer: LayerName.Four,
        dreamscape: elsewhere,
        dreamscapes,
        atlasData,
        sitesData,
        context,
      });
      expect(elsewhereComposition.enhancedSiteType).not.toBe(guide.siteType);
      for (const site of elsewhereComposition.sites) {
        if (site.type === guide.siteType) {
          expect(site.isEnhanced).toBe(guide.siteType === "RandomSite");
        }
      }
    }
  });

  it("resolves the Random Site owner as host for every configured destination", () => {
    const [guides, dreamscapes, sitesData] = [
      loadDreamGuides(),
      loadDreamscapes(),
      loadSitesData(),
    ];
    const owner = dreamscapes.find(
      (entry) => entry.signatureSite === "RandomSite",
    );
    expect(owner?.guideId).not.toBeNull();
    for (const type of sitesData.randomSite.destinations) {
      expect(
        guideForSite(guides, {
          type,
          randomSite: {
            mode: "single",
            candidateSiteTypes: [type],
            presentingGuideId: owner?.guideId ?? undefined,
          },
        })?.id,
      ).toBe(owner?.guideId);
    }
  });

  it("loads Atlas data with a node-count range per layer", () => {
    const atlasData = loadAtlasData();
    expect(atlasData.layers.length).toBeGreaterThan(0);
    for (const layer of atlasData.layers) {
      expect(layer.nodeCount.min).toBeLessThanOrEqual(layer.nodeCount.max);
    }
    expect(atlasData.knownDreamsign.maxPerAtlas).toBeGreaterThanOrEqual(0);
  });
});
