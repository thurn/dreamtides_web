import { describe, expect, it } from "vitest";

import { compileTidesData } from "./tides-data.mjs";

describe("compileTidesData", () => {
  it("composes the two generated catalogs without legacy display or card copy", () => {
    const result = compileTidesData(
      {
        "schema-version": 1,
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
        "schema-version": 1,
        "dream-avatar-pool": [
          {
            "dream-avatar-id": "00000000-0000-4000-8000-000000000021",
            facets: ["00000000-0000-4000-8000-000000000001"],
            neutral: [],
          },
        ],
      },
    );

    expect(result).toEqual({
      version: 1,
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
        { "schema-version": 1, tide: [{}] },
        { "schema-version": 1 },
      ),
    ).toThrow(/dream_avatar_tide_pools\.toml/u);
  });
});
