import { afterEach, describe, expect, it, vi } from "vitest";
import { opponentsFixture } from "../testing/opponents-fixture";
import { loadOpponentsData } from "./opponents-data";

afterEach(() => vi.unstubAllGlobals());

describe("loadOpponentsData", () => {
  it("loads the required generated artifact", async () => {
    const fixture = opponentsFixture();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(fixture),
      }),
    );
    await expect(loadOpponentsData()).resolves.toEqual(fixture);
    expect(fetch).toHaveBeenCalledWith("/opponents-data.json");
  });

  it("fails loudly for missing and malformed data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );
    await expect(loadOpponentsData()).rejects.toThrow(/404 Not Found/u);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...opponentsFixture(), foldHash: "bad" }),
      }),
    );
    await expect(loadOpponentsData()).rejects.toThrow(
      /malformed opponents-data/u,
    );
  });
});
