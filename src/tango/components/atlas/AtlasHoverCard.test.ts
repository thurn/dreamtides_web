import { describe, expect, it } from "vitest";
import {
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
  it("place-forward leads with the place and drops the guide beneath it", () => {
    const stack = resolveFieldStack(residentContent());
    expect(stack.display).toBe("Wilderveil");
    expect(stack.accent).toBe("Aldric, the Seer");
  });

  it("omits the accent line for a guideless node", () => {
    const starter: AtlasHoverContent = {
      ...residentContent(),
      figureArt: null,
      guideName: null,
      siteName: null,
      affiliation: null,
    };
    const stack = resolveFieldStack(starter);
    expect(stack.display).toBe("Wilderveil");
    expect(stack.accent).toBeNull();
  });
});
