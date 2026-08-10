import { describe, expect, it } from "vitest";
const DEFAULT_RUN_LAYER_COUNT = 7;
import {
  opponentDebugSearch,
  opponentGenerationId,
  parseOpponentDebugParams,
  parseOpponentGenerationId,
  type OpponentDebugParams,
} from "./opponent-debug-url";

const MAX_LAYER = DEFAULT_RUN_LAYER_COUNT - 1;

describe("opponent-debug-url", () => {
  it("round-trips params through the canonical query string", () => {
    const params: OpponentDebugParams = {
      completionLevel: 3,
      dreamscapeId: "pharaohs_gate",
      nonce: 2,
    };
    const parsed = parseOpponentDebugParams(opponentDebugSearch(params));
    expect(parsed).toEqual(params);
  });

  it("omits the dreamscape token for a neutral build and round-trips it", () => {
    const params: OpponentDebugParams = {
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
    };
    const search = opponentDebugSearch(params);
    expect(search).not.toContain("dreamscape");
    expect(parseOpponentDebugParams(search)).toEqual(params);
  });

  it("round-trips params through the generation id", () => {
    const params: OpponentDebugParams = {
      completionLevel: MAX_LAYER,
      dreamscapeId: "the_rust_expanse",
      nonce: 5,
    };
    const id = opponentGenerationId(params);
    expect(parseOpponentGenerationId(id)).toEqual(params);
  });

  it("uses the generation id verbatim as a battleEntryKey-style token", () => {
    const id = opponentGenerationId({
      completionLevel: 4,
      dreamscapeId: "grid_city",
      nonce: 1,
    });
    expect(id).toBe("opponent-debug:grid_city:4:1");
  });

  it("renders the neutral id with an explicit `neutral` segment", () => {
    expect(
      opponentGenerationId({
        completionLevel: 2,
        dreamscapeId: null,
        nonce: 0,
      }),
    ).toBe("opponent-debug:neutral:2:0");
    expect(parseOpponentGenerationId("opponent-debug:neutral:2:0")).toEqual({
      completionLevel: 2,
      dreamscapeId: null,
      nonce: 0,
    });
  });

  it("prefers a valid gen token over discrete params", () => {
    const parsed = parseOpponentDebugParams(
      "?gen=opponent-debug:frostforge:5:3&layer=1&dreamscape=grid_city&n=9",
    );
    expect(parsed).toEqual({
      completionLevel: 5,
      dreamscapeId: "frostforge",
      nonce: 3,
    });
  });

  it("falls back to discrete params when the gen token is malformed", () => {
    const parsed = parseOpponentDebugParams("?gen=not-an-id&layer=2&n=4");
    expect(parsed).toEqual({
      completionLevel: 2,
      dreamscapeId: null,
      nonce: 4,
    });
  });

  it("clamps an out-of-range layer into the valid run window", () => {
    expect(
      parseOpponentDebugParams(`?layer=${String(MAX_LAYER + 10)}`, MAX_LAYER)
        .completionLevel,
    ).toBe(MAX_LAYER);
    expect(
      parseOpponentDebugParams("?layer=-3", MAX_LAYER).completionLevel,
    ).toBe(0);
  });

  it("defaults a bare query to the layer-0 neutral generation", () => {
    expect(parseOpponentDebugParams("")).toEqual({
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
    });
  });

  it("treats malformed numbers as their defaults", () => {
    expect(parseOpponentDebugParams("?layer=abc&n=xyz")).toEqual({
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
    });
  });

  it("does not preserve opponent deck algorithm parameters", () => {
    const parsed = parseOpponentDebugParams(
      "?layer=2&algo=coherent&opponentAlgorithm=coherent",
    );
    expect(opponentDebugSearch(parsed)).toBe("?layer=2&n=0");
  });
});
