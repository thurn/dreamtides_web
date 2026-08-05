import { describe, expect, it } from "vitest";
import { isRandomSiteMetadata } from "./random-site";

describe("Random Site metadata", () => {
  it("requires three distinct candidates for a home choice", () => {
    expect(isRandomSiteMetadata({
      mode: "homeChoice",
      candidateSiteTypes: ["Shop", "Purge"],
    })).toBe(false);
    expect(isRandomSiteMetadata({
      mode: "homeChoice",
      candidateSiteTypes: ["Shop", "Purge", "Augury"],
    })).toBe(true);
  });
});
