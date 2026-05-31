import { describe, expect, it } from "vitest";
import {
  FALLBACK_TAG_COLOR,
  isValidTagColor,
  readableTextColor,
  tagColor,
} from "./tag-color";

describe("readableTextColor", () => {
  it("uses dark text on light backgrounds and light text on dark", () => {
    expect(readableTextColor("#ffffff")).toBe("#0b0f12");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#15803d")).toBe("#ffffff");
  });

  it("falls back to white text for malformed colors", () => {
    expect(readableTextColor("not-a-color")).toBe("#ffffff");
  });
});

describe("isValidTagColor", () => {
  it("accepts #rrggbb and rejects other formats", () => {
    expect(isValidTagColor("#aabbcc")).toBe(true);
    expect(isValidTagColor("#abc")).toBe(false);
    expect(isValidTagColor("red")).toBe(false);
  });
});

describe("tagColor", () => {
  it("returns the registry color or a neutral fallback", () => {
    const registry = [{ name: "Removal", color: "#ff0000" }];
    expect(tagColor("Removal", registry)).toBe("#ff0000");
    expect(tagColor("Unknown", registry)).toBe(FALLBACK_TAG_COLOR);
  });
});
