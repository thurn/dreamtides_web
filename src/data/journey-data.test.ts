import { afterEach, describe, expect, it, vi } from "vitest";
import { JOURNEY_DATA_FIXTURE } from "../testing/journey-data-fixture";
import { loadJourneyData, parseJourneyData } from "./journey-data";

afterEach(() => vi.unstubAllGlobals());

describe("Journey data", () => {
  it("validates and loads the compiled artifact", async () => {
    expect(parseJourneyData(JOURNEY_DATA_FIXTURE)).toEqual(
      JOURNEY_DATA_FIXTURE,
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(JOURNEY_DATA_FIXTURE),
      });
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadJourneyData()).resolves.toEqual(JOURNEY_DATA_FIXTURE);
    expect(fetchMock).toHaveBeenCalledWith("/journey-data.json");
  });

  it("rejects malformed presentation", () => {
    expect(() =>
      parseJourneyData({
        ...JOURNEY_DATA_FIXTURE,
        presentation: {
          ...JOURNEY_DATA_FIXTURE.presentation,
          start: { title: "" },
        },
      }),
    ).toThrow(/malformed journey-data/u);
  });
});
