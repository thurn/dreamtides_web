import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  additionalSiteTypesForLevel,
  edgesCross,
  resetAtlasGenerator,
  revealedAtlasSite,
} from "./atlas-generator";
import { makeTestAtlasNode } from "../testing/atlas-fixtures";
import { setLogSink } from "../logging";
import type { DreamscapeNode, SiteState, SiteType } from "../types/journey";
import { LayerName } from "../types/layer-name";
import { parseSiteId } from "../types/identifiers";
import { DREAMSCAPES, ATLAS_DATA, NON_STARTERS } from "./atlas-generator-test-fixtures";

beforeEach(() => {
  resetAtlasGenerator();
});

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe("edgesCross", () => {
  it.each([
    [0, 1, 1, 0, true],
    [0, 0, 1, 1, false],
    [0, 0, 0, 2, false],
  ])("(%i->%i) x (%i->%i) crosses: %s", (a, b, c, d, expected) => {
    expect(edgesCross(a, b, c, d)).toBe(expected);
  });
});

describe("revealedAtlasSite", () => {
  const site = (
    label: string,
    type: SiteType,
    isEnhanced = false,
  ): SiteState => ({
    id: parseSiteId(label),
    type,
    isEnhanced,
    isVisited: false,
  });
  const node = (
    label: string,
    sites: SiteState[],
    enhancedSiteType: SiteType | null = null,
  ): DreamscapeNode => makeTestAtlasNode(label, sites, { enhancedSiteType });

  it("reveals the enhanced site when the dreamscape has one", () => {
    const revealed = revealedAtlasSite(
      node(
        "dreamscape-1",
        [site("a", "Shop"), site("b", "Essence", true), site("c", "Battle")],
        "Essence",
      ),
    );

    expect(revealed?.id).toBe("b");
  });

  it.each([
    { name: "an enhanced Battle", enhanced: "Battle" as const, battleEnhanced: true },
    { name: "an enhanced type with no marked site", enhanced: "Reward" as const, battleEnhanced: false },
    { name: "no enhanced site", enhanced: null, battleEnhanced: false },
  ])(
    "never reveals Battle or Draft for $name, and is stable per node id",
    ({ enhanced, battleEnhanced }) => {
      for (let i = 0; i < 20; i++) {
        const sites = [
          site("a", "Draft"),
          site("b", "Draft"),
          site("c", "Shop"),
          site("d", "Essence"),
          site("e", "Battle", battleEnhanced),
        ];
        const revealed = revealedAtlasSite(
          node(`dreamscape-${String(i)}`, sites, enhanced),
        );
        expect(["Shop", "Essence"]).toContain(revealed?.type);
        const clone = node(`dreamscape-${String(i)}`, [...sites], enhanced);
        expect(revealedAtlasSite(clone)?.id).toBe(revealed?.id);
      }
    },
  );

  it("returns null for nodes with no sites", () => {
    expect(revealedAtlasSite(node("empty-node", []))).toBeNull();
  });
});

describe("additionalSiteTypesForLevel", () => {
  it("offers Essence and other guides' signature sites, never the dreamscape's own", () => {
    const [dreamscape] = NON_STARTERS;
    const types = additionalSiteTypesForLevel(
      LayerName.Four,
      dreamscape.signatureSite,
      DREAMSCAPES,
      {},
      ATLAS_DATA,
    );
    const other = NON_STARTERS.find(
      (d) => d.signatureSite !== dreamscape.signatureSite,
    );

    expect(types).toContain("Essence");
    expect(types).not.toContain(dreamscape.signatureSite);
    expect(types).toContain(other?.signatureSite);
  });
});
