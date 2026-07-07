import { describe, expect, it } from "vitest";
import {
  ATLAS_HOVER_DEFAULTS,
  resolveFieldStack,
  type AtlasHoverContent,
} from "./AtlasHoverCard";
import { artRef } from "../../primitives/art";

/** A resident-dreamscape hover content fixture (place + guide + site + affiliation). */
function residentContent(): AtlasHoverContent {
  return {
    isBoss: false,
    sceneArt: artRef.dreamscapeScene("wilderveil"),
    figureArt: artRef.dreamGuide("aldric"),
    placeName: "Wilderveil",
    guideName: "Aldric, the Seer",
    siteName: "Dream Augury",
    body: "Aldric offers curated visions of the future.",
    affiliation: "Abandon",
  };
}

describe("resolveFieldStack", () => {
  it("defaults to place-forward with the site eyebrow and affiliation suppressed", () => {
    const defaults = ATLAS_HOVER_DEFAULTS;
    expect(defaults.hierarchy).toBe("place-forward");
    expect(defaults.showSite).toBe(false);
    expect(defaults.showAffiliation).toBe(false);
    expect(defaults.cardWidth).toBeLessThan(400);
    expect(defaults.figureHeight).toBeLessThan(280);
  });

  it("place-forward leads with the place and drops the guide beneath it", () => {
    const stack = resolveFieldStack(residentContent(), {
      ...ATLAS_HOVER_DEFAULTS,
      hierarchy: "place-forward",
      showSite: true,
    });
    expect(stack.display).toBe("Wilderveil");
    expect(stack.accent).toBe("Aldric, the Seer");
    expect(stack.eyebrow).toBe("Dream Augury");
  });

  it("guide-forward leads with the guide and lifts the place into the overline", () => {
    const stack = resolveFieldStack(residentContent(), {
      ...ATLAS_HOVER_DEFAULTS,
      hierarchy: "guide-forward",
      showSite: true,
    });
    expect(stack.display).toBe("Aldric, the Seer");
    expect(stack.eyebrow).toBe("Wilderveil");
    expect(stack.accent).toBe("Dream Augury");
  });

  it("suppresses the site eyebrow when showSite is off", () => {
    const stack = resolveFieldStack(residentContent(), {
      ...ATLAS_HOVER_DEFAULTS,
      hierarchy: "place-forward",
      showSite: false,
    });
    expect(stack.eyebrow).toBeNull();
  });

  it("never repeats the place on both the lead and the overline for a guideless node", () => {
    // A starter has no guide, so guide-forward falls back to the place as the
    // lead line; the overline must not echo it.
    const starter: AtlasHoverContent = {
      ...residentContent(),
      figureArt: null,
      guideName: null,
      siteName: null,
      affiliation: null,
    };
    const stack = resolveFieldStack(starter, {
      ...ATLAS_HOVER_DEFAULTS,
      hierarchy: "guide-forward",
    });
    expect(stack.display).toBe("Wilderveil");
    expect(stack.eyebrow).toBeNull();
    expect(stack.accent).toBeNull();
  });
});
