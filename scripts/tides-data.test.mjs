import { describe, expect, it } from "vitest";

import { compileTidesData } from "./tides-data.mjs";

describe("compileTidesData", () => {
  it("composes tides and embedded Dream Avatar pools", () => {
    const result = compileTidesData(
      {
        "schema-version": 1,
        selection: { "band-fraction": 0.25, "band-minimum": 5 },
        tide: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            "display-name": "Fixture Tide",
            "display-description": "A stable synthetic description.",
            resonance: "shadow",
            role: "signature",
            card: [
              {
                id: "00000000-0000-4000-8000-000000000011",
                copies: 2,
              },
            ],
          },
        ],
      },
      {
        dreamAvatar: [
          {
            id: "00000000-0000-4000-8000-000000000021",
            "tide-pool": {
              facets: ["00000000-0000-4000-8000-000000000001"],
              neutral: [],
            },
          },
        ],
      },
    );

    expect(result).toEqual({
      version: 2,
      selection: { bandFraction: 0.25, bandMinimum: 5 },
      tides: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          displayName: "Fixture Tide",
          displayDescription: "A stable synthetic description.",
          resonance: "shadow",
          role: "signature",
          cards: [
            {
              id: "00000000-0000-4000-8000-000000000011",
              copies: 2,
            },
          ],
        },
      ],
      tidePoolByDreamAvatar: {
        "00000000-0000-4000-8000-000000000021": {
          starter: null,
          facets: ["00000000-0000-4000-8000-000000000001"],
          neutral: [],
        },
      },
    });
    expect(result.tides[0]).not.toHaveProperty("name");
    expect(result.tides[0].cards[0]).not.toHaveProperty("name");
  });

  it("rejects missing collections from either generated catalog", () => {
    expect(() => compileTidesData({ "schema-version": 1 }, {})).toThrow(
      /non-empty \[\[tide\]\]/u,
    );
    expect(() =>
      compileTidesData(
        {
          "schema-version": 1,
          selection: { "band-fraction": 0.25, "band-minimum": 5 },
          tide: [{}],
        },
        {},
      ),
    ).toThrow(/dream_avatars\.toml/u);
  });
});
