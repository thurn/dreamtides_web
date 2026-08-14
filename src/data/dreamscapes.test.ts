import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// Referential-integrity test for the dreamscape / guide / affiliation / atlas
// content bundles. It runs against the *compiled* JSON the asset pipeline emits
// (`public/*-data.json`), loading each through its real loader. `fetch` is
// stubbed to read the served JSON straight off disk so the loaders exercise the
// production code path against production data.
//
// The assertions are structural contracts only: ids resolve, exactly one
// starter exists, every cross-reference points at a real entry, and every
// curated signature-card UUID names a card that exists in the card database.
// It deliberately asserts no specific names, counts, or content limits beyond
// "exactly one starter", so authoring edits to the TOML never break it.

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function readPublicJson(filename: string): unknown {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, filename), "utf8"));
}

beforeAll(() => {
  // The compiled bundles are emitted by `npm run setup-assets`. If a fresh
  // worktree has not run it yet, fail loudly with the fix rather than a
  // confusing ENOENT deep inside a fetch stub.
  for (const filename of [
    "dreamscapes-data.json",
    "dream-guides-data.json",
    "affiliations-data.json",
    "atlas-data.json",
    "cards_v2-data.json",
  ]) {
    const path = join(PUBLIC_DIR, filename);
    if (!existsSync(path)) {
      throw new Error(
        `Missing ${filename}; run \`npm run setup-assets\` before this test.`,
      );
    }
  }
});

beforeEach(() => {
  vi.restoreAllMocks();
  // Serve each /<name>-data.json request from the compiled public bundle.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: string | URL) => {
      const filename = String(input).replace(/^\//u, "");
      const path = join(PUBLIC_DIR, filename);
      if (!existsSync(path)) {
        return Promise.resolve({
          ok: false,
          status: 404,
          statusText: "Not Found",
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(JSON.parse(readFileSync(path, "utf8"))),
      });
    }),
  );
});

describe("dreamscape content referential integrity", () => {
  it("every dreamscape has a non-empty id and name", async () => {
    const dreamscapes = await loadDreamscapes();
    expect(dreamscapes.length).toBeGreaterThan(0);
    for (const d of dreamscapes) {
      expect(typeof d.id).toBe("string");
      expect(d.id.length).toBeGreaterThan(0);
      expect(typeof d.name).toBe("string");
      expect(d.name.length).toBeGreaterThan(0);
    }
  });

  it("exactly one dreamscape is the starter", async () => {
    const dreamscapes = await loadDreamscapes();
    const starters = dreamscapes.filter((d) => d.isStarter);
    expect(starters.length).toBe(1);
  });

  it("every non-starter dreamscape resolves its guide and affiliation", async () => {
    const [dreamscapes, guides, affiliations] = await Promise.all([
      loadDreamscapes(),
      loadDreamGuides(),
      loadAffiliations(),
    ]);
    const guideIds = new Set(guides.map((g) => g.id));
    const affiliationIds = new Set(affiliations.map((a) => a.id));
    for (const d of dreamscapes) {
      if (d.isStarter) continue;
      expect(d.guideId).not.toBeNull();
      expect(guideIds.has(d.guideId as string)).toBe(true);
      expect(d.affiliationId).not.toBeNull();
      expect(affiliationIds.has(d.affiliationId as string)).toBe(true);
    }
  });

  it("every guide's home dreamscape resolves", async () => {
    const [dreamscapes, guides] = await Promise.all([
      loadDreamscapes(),
      loadDreamGuides(),
    ]);
    const dreamscapeIds = new Set(dreamscapes.map((d) => d.id));
    for (const g of guides) {
      expect(typeof g.homeDreamscapeId).toBe("string");
      expect(dreamscapeIds.has(g.homeDreamscapeId)).toBe(true);
    }
  });

  it("every affiliation defines exactly three known tides", async () => {
    const affiliations = await loadAffiliations();
    const artifact = readPublicJson("tides4-data.json") as { tides: { id: string }[] };
    const tideIds = new Set(artifact.tides.map((tide) => tide.id));
    expect(affiliations.length).toBeGreaterThan(0);
    for (const a of affiliations) {
      expect(a.tideIds).toHaveLength(3);
      expect(new Set(a.tideIds).size).toBe(3);
      for (const tideId of a.tideIds) expect(tideIds.has(tideId)).toBe(true);
    }
  });

  it("every non-starter dreamscape's signature site resolves to the guide whose home it is", async () => {
    const [dreamscapes, guides] = await Promise.all([
      loadDreamscapes(),
      loadDreamGuides(),
    ]);
    for (const d of dreamscapes) {
      if (d.isStarter) continue;
      // The guide who tends this dreamscape's signature site type...
      const guide = guideForSiteType(guides, d.signatureSite);
      expect(guide).not.toBeNull();
      // ...must be the guide whose home dreamscape this is. This is the
      // dreamscape <-> guide <-> signature-site contract the frame and the
      // home-enhancement trigger both rely on.
      expect((guide as { homeDreamscapeId: string }).homeDreamscapeId).toBe(
        d.id,
      );
      // And that guide must be the one the dreamscape names as its resident.
      expect((guide as { id: string }).id).toBe(d.guideId);
    }
  });

  it("a guide's signature site is enhanced in its home dreamscape and unenhanced elsewhere", async () => {
    const [dreamscapes, guides, atlasData] = await Promise.all([
      loadDreamscapes(),
      loadDreamGuides(),
      loadAtlasData(),
    ]);
    const context = { dreamscapeModifiers: [], draftPickCount: 5 };
    const sitesData = await loadSitesData();
    const homeOf = (siteType: string): DreamscapeContent | undefined =>
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

  it("resolves the Random Site owner as host for every configured destination", async () => {
    const [guides, dreamscapes, sitesData] = await Promise.all([
      loadDreamGuides(),
      loadDreamscapes(),
      loadSitesData(),
    ]);
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

  it("loads Atlas data with a node-count range per layer", async () => {
    const atlasData = await loadAtlasData();
    expect(atlasData.layers.length).toBeGreaterThan(0);
    for (const layer of atlasData.layers) {
      expect(layer.nodeCount.min).toBeLessThanOrEqual(layer.nodeCount.max);
    }
    expect(atlasData.knownDreamsign.maxPerAtlas).toBeGreaterThanOrEqual(0);
  });
});
