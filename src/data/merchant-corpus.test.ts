import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadMerchantCorpus } from "./merchant-corpus";

beforeEach(() => {
  vi.restoreAllMocks();
});

// Inline fixture JSON that exercises the schema contract.
const FIXTURE_ARTIFACT = {
  version: 1,
  source: "docs/draft_records_adapted",
  cards: {
    "uuid-a": { quality: 0.75, multiplicity: 0.5, df: 30, cluster: 0 },
    "uuid-b": { quality: 0.42, multiplicity: 0.0, df: 12 }, // no cluster field
    "uuid-c": { quality: 0.0, multiplicity: 0.0, df: 3, cluster: 1 },
  },
  clusters: [
    { id: 0, flagship: "uuid-a", members: ["uuid-a", "uuid-c"] },
    { id: 1, flagship: "uuid-c", members: ["uuid-c"] },
  ],
};

describe("loadMerchantCorpus", () => {
  it("maps the JSON schema to a MerchantCorpus with cards keyed by UUID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_ARTIFACT),
      }),
    );
    const corpus = await loadMerchantCorpus();

    // cards is a Map keyed by UUID
    expect(corpus.cards).toBeInstanceOf(Map);
    expect(corpus.cards.size).toBe(3);

    const a = corpus.cards.get("uuid-a");
    expect(a).toBeDefined();
    expect(a?.quality).toBe(0.75);
    expect(a?.multiplicity).toBe(0.5);
    expect(a?.df).toBe(30);
    expect(a?.cluster).toBe(0);

    const b = corpus.cards.get("uuid-b");
    expect(b).toBeDefined();
    expect(b?.quality).toBe(0.42);
    expect(b?.cluster).toBeUndefined();
  });

  it("tolerates a card record where cluster is omitted (optional field)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_ARTIFACT),
      }),
    );
    const corpus = await loadMerchantCorpus();
    // uuid-b has no cluster in the fixture — loader must not crash
    const b = corpus.cards.get("uuid-b");
    expect(b).toBeDefined();
    expect(b?.cluster).toBeUndefined();
  });

  it("maps clusters to a readonly array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(FIXTURE_ARTIFACT),
      }),
    );
    const corpus = await loadMerchantCorpus();
    expect(Array.isArray(corpus.clusters)).toBe(true);
    expect(corpus.clusters.length).toBe(2);
    expect(corpus.clusters[0].id).toBe(0);
    expect(corpus.clusters[0].flagship).toBe("uuid-a");
    expect(corpus.clusters[0].members).toEqual(["uuid-a", "uuid-c"]);
  });

  it("throws on non-ok HTTP response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }),
    );
    await expect(loadMerchantCorpus()).rejects.toThrow(
      "Failed to load merchant corpus",
    );
  });
});
