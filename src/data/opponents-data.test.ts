import { describe, expect, it } from "vitest";
import { opponentsFixture } from "../testing/opponents-fixture";
import { parseOpponentsData } from "./opponents-data";

describe("opponents data", () => {
  it("accepts a well-formed opponents document", () => {
    const fixture = opponentsFixture();
    expect(parseOpponentsData(fixture)).toEqual(fixture);
  });

  it("rejects malformed hashes before publishing content", () => {
    expect(() =>
      parseOpponentsData({ ...opponentsFixture(), foldHash: "bad" }),
    ).toThrow();
  });
});
