import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadDreamsignProfiles } from "./dreamsign-profiles";

beforeEach(() => {
  vi.restoreAllMocks();
});

// Inline fixture JSON representing the serialized form after setup-assets
// transforms the TOML (kebab->camel).
const FIXTURE_PROFILES = [
  {
    id: "dreamsign-uuid-1",
    subtypes: ["Warrior"],
    cardTypes: ["Character"],
    costBands: ["cheap"],
    keywords: ["reclaim"],
    quality: 1,
  },
  {
    id: "dreamsign-uuid-2",
    subtypes: [],
    cardTypes: [],
    costBands: [],
    keywords: [],
    quality: 2,
  },
  // Profile with missing list fields — tests default-to-empty behavior
  {
    id: "dreamsign-uuid-3",
    quality: 3,
  },
];

describe("loadDreamsignProfiles", () => {
  it("returns a Map keyed by dreamsign UUID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_PROFILES),
      }),
    );
    const profiles = await loadDreamsignProfiles();
    expect(profiles).toBeInstanceOf(Map);
    expect(profiles.size).toBe(3);
  });

  it("deserializes all fields correctly for a full entry", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_PROFILES),
      }),
    );
    const profiles = await loadDreamsignProfiles();
    const p = profiles.get("dreamsign-uuid-1");
    expect(p).toBeDefined();
    expect(p?.id).toBe("dreamsign-uuid-1");
    expect(p?.subtypes).toEqual(["Warrior"]);
    expect(p?.cardTypes).toEqual(["Character"]);
    expect(p?.costBands).toEqual(["cheap"]);
    expect(p?.keywords).toEqual(["reclaim"]);
    expect(p?.quality).toBe(1);
  });

  it("defaults missing list fields to empty arrays", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_PROFILES),
      }),
    );
    const profiles = await loadDreamsignProfiles();
    // dreamsign-uuid-3 has only quality in the fixture, all lists missing
    const p = profiles.get("dreamsign-uuid-3");
    expect(p).toBeDefined();
    expect(p?.subtypes).toEqual([]);
    expect(p?.cardTypes).toEqual([]);
    expect(p?.costBands).toEqual([]);
    expect(p?.keywords).toEqual([]);
    expect(p?.quality).toBe(3);
  });

  it("rejects quality values outside 1–3", async () => {
    const badFixture = [
      { id: "dreamsign-uuid-bad", subtypes: [], cardTypes: [], costBands: [], keywords: [], quality: 4 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(badFixture),
      }),
    );
    await expect(loadDreamsignProfiles()).rejects.toThrow(
      /quality.*dreamsign-uuid-bad/i,
    );
  });

  it("rejects quality of 0", async () => {
    const badFixture = [
      { id: "dreamsign-uuid-zero", subtypes: [], cardTypes: [], costBands: [], keywords: [], quality: 0 },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(badFixture),
      }),
    );
    await expect(loadDreamsignProfiles()).rejects.toThrow(
      /quality.*dreamsign-uuid-zero/i,
    );
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      }),
    );
    await expect(loadDreamsignProfiles()).rejects.toThrow(
      "Failed to load dreamsign profiles",
    );
  });
});
