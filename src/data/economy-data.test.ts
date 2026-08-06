import { afterEach, describe, expect, it, vi } from "vitest";
import { economyFixture } from "../testing/economy-fixture";
import { loadEconomyData } from "./economy-data";

afterEach(() => vi.unstubAllGlobals());

describe("loadEconomyData", () => {
  it("loads a validated generated artifact", async () => {
    const fixture = economyFixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(fixture) }));
    await expect(loadEconomyData()).resolves.toEqual(fixture);
    expect(fetch).toHaveBeenCalledWith("/economy-data.json");
  });

  it("rejects malformed hashes before publishing content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ...economyFixture(), foldHash: "not-a-hash" }),
    }));
    await expect(loadEconomyData()).rejects.toThrow(/malformed economy-data/u);
  });
});
