import { describe, expect, it } from "vitest";
import { parseExplorationCardFilter } from "./exploration-editor-url-state";

describe("parseExplorationCardFilter", () => {
  it("returns no filter when the cards parameter is omitted", () => {
    expect(parseExplorationCardFilter("?identicons=1")).toBeNull();
  });

  it("normalizes and deduplicates comma-separated card IDs", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";

    expect([
      ...(parseExplorationCardFilter(
        `?cards=${first.toUpperCase()},%20${second}%20,${first}`,
      ) ?? []),
    ]).toEqual([first, second]);
  });

  it("combines repeated cards parameters", () => {
    expect([
      ...(parseExplorationCardFilter("?cards=first&cards=second,third") ?? []),
    ]).toEqual(["first", "second", "third"]);
  });
});
