import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateInitialAtlas,
  generateSiteComposition,
  resetAtlasGenerator,
} from "./atlas-generator";
import {
  EARLY_ATLAS_FILL_PROFILE_ID,
  LATE_ATLAS_FILL_PROFILE_ID,
  makeSyntheticAtlasData,
  MINIMAL_SITES_DATA,
} from "../testing/atlas-fixtures";
import { makeRng } from "../draft/pool/rng";
import { setLogSink, type LogEntry } from "../logging";
import type { SiteState, SiteType } from "../types/journey";
import { LayerName, layerAtOrdinal, layerOrdinal } from "../types/layer-name";
import { parseAtlasNodeId, type AtlasFillProfileId } from "../types/identifiers";
import { testJourneyMutationSource } from "../types/test-identities";
import {
  DREAMSCAPES,
  ATLAS_DATA,
  STARTER,
  NON_STARTERS,
  SEEDS,
  buildContext,
  countOf,
} from "./atlas-generator-test-fixtures";

beforeEach(() => {
  resetAtlasGenerator();
});

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

const NON_STARTER_LAYERS = Array.from(
  { length: ATLAS_DATA.layers.length - 1 },
  (_, i) => i + 1,
);

/** Collects the named log events emitted while `run` executes. */
function captureEvents<T>(
  event: string,
  run: () => T,
): { result: T; entries: LogEntry[] } {
  vi.spyOn(console, "log").mockImplementation(() => {});
  const entries: LogEntry[] = [];
  setLogSink((entry) => {
    if (entry.event === event) entries.push(entry);
  });
  const result = run();
  setLogSink(null);
  return { result, entries };
}

describe("atlas reveal log identity", () => {
  it.each([
    ["normal", DREAMSCAPES],
    ["starter-only", DREAMSCAPES.filter((dreamscape) => dreamscape.isStarter)],
  ] as const)("logs UUIDs or null without display metadata for %s catalogs", (_, dreamscapes) => {
    const atlasData = makeSyntheticAtlasData();
    atlasData.graph.bonusReveal = {
      ...atlasData.graph.bonusReveal,
      min: 1,
      max: 1,
      mode: 1,
    };
    const { result: atlas, entries } = captureEvents("atlas_node_revealed", () =>
      generateInitialAtlas(0, {}, buildContext({ atlasData, dreamscapes }), {
        logEvents: true,
        rng: makeRng(1),
      }),
    );
    expect(new Set(entries.map((entry) => entry.nodeRole))).toEqual(
      new Set(["starter", "standard", "boss"]),
    );
    for (const entry of entries) {
      const node = atlas.nodes[parseAtlasNodeId(String(entry.nodeId))];
      expect(entry.dreamscapeId).toBe(node.dreamscapeId);
      if (entry.nodeRole === "starter") {
        expect(entry.dreamscapeId).toBe(STARTER?.id);
      } else if (entry.nodeRole === "boss") {
        expect(entry.dreamscapeId).toBe(atlasData.boss.dreamscapeId);
      } else {
        const normalIds = dreamscapes.filter((dreamscape) => !dreamscape.isStarter)
          .map((dreamscape) => dreamscape.id);
        expect(normalIds.length === 0 ? [null] : normalIds).toContain(entry.dreamscapeId);
      }
      expect(entry).not.toHaveProperty("dreamscapeName");
    }
  });
});

describe("generateSiteComposition", () => {
  function compose(
    dreamscape: (typeof NON_STARTERS)[number],
    layer: number,
    hasKnownDreamsign: boolean,
    seed: number,
  ): SiteState[] {
    resetAtlasGenerator();
    return generateSiteComposition({
      layer: layerAtOrdinal(layer) ?? LayerName.One,
      dreamscape,
      dreamscapes: DREAMSCAPES,
      atlasData: ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      context: {},
      hasKnownDreamsign,
      rng: makeRng(seed),
    }).sites;
  }

  it("meets every per-layer composition rule for every non-starter dreamscape", () => {
    const eligibleForDreamsign = new Set(
      ATLAS_DATA.knownDreamsign.eligibleLayers.map(layerOrdinal),
    );
    for (const dreamscape of NON_STARTERS) {
      for (const layer of NON_STARTER_LAYERS) {
        const { mandatorySites: mandatory, siteCount } = ATLAS_DATA.layers[layer];
        if (siteCount === null) throw new Error("expected a site range");
        // A required type matching the home signature site is not repeated.
        const required = Object.entries(mandatory).filter(
          ([type]) => type !== dreamscape.signatureSite,
        );
        const requiredTotal = required.reduce(
          (sum, [, count]) => sum + count,
          0,
        );
        for (const seed of SEEDS.slice(0, 8)) {
          for (const hasKnownDreamsign of eligibleForDreamsign.has(layer)
            ? [false, true]
            : [false]) {
            const sites = compose(dreamscape, layer, hasKnownDreamsign, seed);
            expect(sites.length).toBeGreaterThanOrEqual(siteCount.min);
            expect(sites.length).toBeLessThanOrEqual(siteCount.max);
            expect(countOf(sites, "Battle")).toBe(1);
            expect(sites[sites.length - 1].type).toBe("Battle");
            // A Reward with no fill slot displaces exactly one required site.
            const displaced =
              hasKnownDreamsign && requiredTotal + 2 >= siteCount.max ? 1 : 0;
            const requiredPresent = required.reduce(
              (sum, [type, count]) =>
                sum + Math.min(count, countOf(sites, type as SiteType)),
              0,
            );
            expect(requiredPresent).toBe(requiredTotal - displaced);
            expect(countOf(sites, "Reward")).toBe(hasKnownDreamsign ? 1 : 0);
            for (const type of new Set(sites.map((site) => site.type))) {
              expect(countOf(sites, type)).toBeLessThanOrEqual(
                type === "Draft" ? 2 : 1,
              );
            }
            const signature = sites.filter(
              (site) => site.type === dreamscape.signatureSite,
            );
            expect(signature).toHaveLength(1);
            expect(signature[0].isEnhanced).toBe(true);
            // A Random Site filling another guide's dreamscape is the only
            // other enhanced site.
            const hiddenRandom = sites.some(
              (site) => site.type === "RandomSite" && site !== signature[0],
            );
            expect(sites.filter((site) => site.isEnhanced)).toHaveLength(
              hiddenRandom ? 2 : 1,
            );
            const ids = sites.map((site) => site.id);
            expect(new Set(ids).size).toBe(ids.length);
          }
        }
      }
    }
  });

  it("builds the home Random Site from distinct hidden candidates, honoring hard removals", () => {
    const home = NON_STARTERS.find((d) => d.signatureSite === "RandomSite");
    if (home === undefined) throw new Error("expected a Random Site home");
    for (const removeShops of [false, true]) {
      const { sites } = generateSiteComposition({
        layer: LayerName.Five,
        dreamscape: home,
        dreamscapes: DREAMSCAPES,
        atlasData: ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        context: removeShops
          ? {
              dreamscapeModifiers: [
                {
                  kind: "remove_shop_sites",
                  dreamscapesRemaining: 1,
                  source: testJourneyMutationSource("fixture"),
                },
              ],
            }
          : {},
        rng: makeRng(7),
      });
      const randomSite = sites.find((site) => site.type === "RandomSite");
      expect(randomSite?.isEnhanced).toBe(true);
      expect(randomSite?.randomSite?.mode).toBe("homeChoice");
      const candidates = randomSite?.randomSite?.candidateSiteTypes ?? [];
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      expect(new Set(candidates).size).toBe(candidates.length);
      const visible = new Set(sites.map((site) => site.type));
      expect(candidates.filter((type) => visible.has(type))).toEqual([]);
      if (removeShops) {
        expect(candidates).not.toContain("Shop");
      }
    }
  });

  it("uses the selected fill profile's exact weights", () => {
    function bossFill(fillProfile: AtlasFillProfileId): SiteType {
      const atlasData = makeSyntheticAtlasData();
      atlasData.fillProfiles = {
        [EARLY_ATLAS_FILL_PROFILE_ID]: {
          id: EARLY_ATLAS_FILL_PROFILE_ID,
          signatureSiteWeight: 0,
          siteWeights: { Transfiguration: 1, Duplication: 10 },
        },
        [LATE_ATLAS_FILL_PROFILE_ID]: {
          id: LATE_ATLAS_FILL_PROFILE_ID,
          signatureSiteWeight: 0,
          siteWeights: { Transfiguration: 10, Duplication: 1 },
        },
      };
      atlasData.layers = atlasData.layers.map((layer) =>
        layer.role === "boss"
          ? { ...layer, fillProfile, siteCount: { min: 2, max: 2 } }
          : layer,
      );
      const atlas = generateInitialAtlas(0, {}, buildContext({ atlasData }), {
        logEvents: false,
        rng: () => 0.6,
      });
      return atlas.nodes[atlas.bossNodeId].sites[0].type;
    }

    expect(bossFill(EARLY_ATLAS_FILL_PROFILE_ID)).toBe("Duplication");
    expect(bossFill(LATE_ATLAS_FILL_PROFILE_ID)).toBe("Transfiguration");
  });

  it("returns the starter's fixed site list with no enhancement", () => {
    if (STARTER === undefined) throw new Error("expected a starter");
    for (const seed of SEEDS.slice(0, 4)) {
      const { sites, enhancedSiteType } = generateSiteComposition({
        layer: LayerName.One,
        dreamscape: STARTER,
        dreamscapes: DREAMSCAPES,
        atlasData: ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        context: {},
        hasKnownDreamsign: false,
        rng: makeRng(seed),
      });
      expect(sites.map((site) => site.type)).toEqual(STARTER.fixedSites);
      expect(sites.some((site) => site.isEnhanced)).toBe(false);
      expect(enhancedSiteType).toBeNull();
    }
  });
});

describe("known Dreamsign in a layer without a fill slot", () => {
  // Synthetic layer Two: home signature + 2 Draft + Purge + Augury + Battle
  // fills its maximum of six, so a known Dreamsign has no fill slot there.
  const FULL_LAYER = LayerName.Two;
  const FULL_LAYER_DATA = ATLAS_DATA.layers[layerOrdinal(FULL_LAYER)];
  const FULL_LAYER_HOMES = NON_STARTERS.filter(
    (d) => !(d.signatureSite in FULL_LAYER_DATA.mandatorySites),
  );

  it("displaces a repeated required site so the Reward keeps the layer in range", () => {
    const maxSites = FULL_LAYER_DATA.siteCount?.max;
    if (maxSites === undefined) throw new Error("expected a site range");
    for (const dreamscape of FULL_LAYER_HOMES) {
      for (const seed of SEEDS.slice(0, 4)) {
        resetAtlasGenerator();
        const { result, entries } = captureEvents(
          "dreamscape_known_dreamsign_without_fill_slot",
          () =>
            generateSiteComposition(
              {
                layer: FULL_LAYER,
                dreamscape,
                dreamscapes: DREAMSCAPES,
                atlasData: ATLAS_DATA,
                sitesData: MINIMAL_SITES_DATA,
                context: {},
                hasKnownDreamsign: true,
                rng: makeRng(seed),
              },
              true,
            ),
        );
        const { sites } = result;
        expect(sites).toHaveLength(maxSites);
        expect(countOf(sites, "Reward")).toBe(1);
        expect(sites[sites.length - 1].type).toBe("Battle");
        expect(sites.find((site) => site.isEnhanced)?.type).toBe(
          dreamscape.signatureSite,
        );
        // The second Draft gives way; every required site type stays.
        expect(countOf(sites, "Draft")).toBe(1);
        expect(countOf(sites, "Purge")).toBe(1);
        expect(countOf(sites, "Augury")).toBe(1);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          dreamscapeId: dreamscape.id,
          layer: FULL_LAYER,
          outcome: "displaced_required_site",
          displacedSiteType: "Draft",
        });
      }
    }
  });

  it("leaves the Reward out when the layer has no required site to displace", () => {
    const atlasData = makeSyntheticAtlasData();
    atlasData.layers = atlasData.layers.map((layer) =>
      layer.name === LayerName.Five
        ? { ...layer, siteCount: { min: 2, max: 2 } }
        : layer,
    );
    const { result, entries } = captureEvents(
      "dreamscape_known_dreamsign_without_fill_slot",
      () =>
        generateSiteComposition(
          {
            layer: LayerName.Five,
            dreamscape: NON_STARTERS[0],
            dreamscapes: DREAMSCAPES,
            atlasData,
            sitesData: MINIMAL_SITES_DATA,
            context: {},
            hasKnownDreamsign: true,
            rng: makeRng(3),
          },
          true,
        ),
    );
    expect(result.sites.map((site) => site.type)).toEqual([
      NON_STARTERS[0].signatureSite,
      "Battle",
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      outcome: "omitted",
      displacedSiteType: null,
    });
  });

  it("places known Dreamsigns only in eligible layers that keep a fill slot", () => {
    const atlasData = makeSyntheticAtlasData();
    atlasData.knownDreamsign = {
      ...atlasData.knownDreamsign,
      eligibleLayers: [FULL_LAYER, LayerName.Five],
      maxPerAtlas: 2,
      placementProbability: 1,
    };
    for (const seed of SEEDS) {
      resetAtlasGenerator();
      const { result: atlas, entries } = captureEvents(
        "atlas_known_dreamsign_layer_refused",
        () =>
          generateInitialAtlas(0, {}, buildContext({ atlasData }), {
            logEvents: true,
            rng: makeRng(seed),
          }),
      );
      expect(atlas.knownDreamsignCarrierIds).toHaveLength(2);
      for (const carrierId of atlas.knownDreamsignCarrierIds) {
        expect(atlas.nodes[carrierId].layer).toBe(LayerName.Five);
      }
      expect(entries.map((entry) => entry.layer)).toEqual([FULL_LAYER]);
    }
  });
});
