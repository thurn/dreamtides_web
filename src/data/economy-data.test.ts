import { describe, expect, it } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { parseEconomyData } from "./economy-data";

describe("economy data", () => {
  it("accepts a well-formed economy document", () => {
    const fixture = economyFixture();
    expect(parseEconomyData(fixture)).toEqual(fixture);
  });

  it("rejects malformed hashes before publishing content", () => {
    expect(() =>
      parseEconomyData({ ...economyFixture(), foldHash: "not-a-hash" }),
    ).toThrow();
  });
});
