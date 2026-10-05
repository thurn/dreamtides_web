import { describe, it, expect } from "vitest";
import { cardImageUrl } from "./card-database";

describe("cardImageUrl", () => {
  it("returns the webp path for a given image number", () => {
    expect(cardImageUrl(42)).toBe("/cards/42.webp");
  });

  it("works for image number 1", () => {
    expect(cardImageUrl(1)).toBe("/cards/1.webp");
  });

  it("works for large image numbers", () => {
    expect(cardImageUrl(503)).toBe("/cards/503.webp");
  });
});
