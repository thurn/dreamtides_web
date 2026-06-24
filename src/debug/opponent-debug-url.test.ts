import { describe, expect, it } from "vitest";
import { DEFAULT_RUN_LAYER_COUNT } from "../battle/integration/opponent-deck";
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
      algo: "coherent",
    };
    const parsed = parseOpponentDebugParams(opponentDebugSearch(params));
    expect(parsed).toEqual(params);
  });

  it("omits the dreamscape token for a neutral build and round-trips it", () => {
    const params: OpponentDebugParams = {
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
      algo: "coherent",
    };
    const search = opponentDebugSearch(params);
    expect(search).not.toContain("dreamscape");
    expect(parseOpponentDebugParams(search)).toEqual(params);
  });

  it("round-trips the corpus algo through the query string", () => {
    const params: OpponentDebugParams = {
      completionLevel: 2,
      dreamscapeId: "grid_city",
      nonce: 1,
      algo: "corpus",
    };
    const search = opponentDebugSearch(params);
    expect(search).toContain("algo=corpus");
    expect(parseOpponentDebugParams(search)).toEqual(params);
  });

  it("omits the algo token for the coherent default", () => {
    const search = opponentDebugSearch({
      completionLevel: 1,
      dreamscapeId: null,
      nonce: 0,
      algo: "coherent",
    });
    expect(search).not.toContain("algo");
  });

  it("round-trips params through the generation id (defaulting algo)", () => {
    const params: OpponentDebugParams = {
      completionLevel: MAX_LAYER,
      dreamscapeId: "the_rust_expanse",
      nonce: 5,
      algo: "coherent",
    };
    const id = opponentGenerationId(params);
    expect(parseOpponentGenerationId(id)).toEqual(params);
  });

  it("uses the generation id verbatim as a battleEntryKey-style token", () => {
    const id = opponentGenerationId({
      completionLevel: 4,
      dreamscapeId: "grid_city",
      nonce: 1,
      algo: "coherent",
    });
    expect(id).toBe("opponent-debug:grid_city:4:1");
  });

  it("renders the neutral id with an explicit `neutral` segment", () => {
    expect(
      opponentGenerationId({
        completionLevel: 2,
        dreamscapeId: null,
        nonce: 0,
        algo: "coherent",
      }),
    ).toBe("opponent-debug:neutral:2:0");
    expect(parseOpponentGenerationId("opponent-debug:neutral:2:0")).toEqual({
      completionLevel: 2,
      dreamscapeId: null,
      nonce: 0,
      algo: "coherent",
    });
  });

  it("prefers a valid gen token over discrete params, overlaying the algo", () => {
    const parsed = parseOpponentDebugParams(
      "?gen=opponent-debug:frostforge:5:3&layer=1&dreamscape=grid_city&n=9&algo=corpus",
    );
    expect(parsed).toEqual({
      completionLevel: 5,
      dreamscapeId: "frostforge",
      nonce: 3,
      algo: "corpus",
    });
  });

  it("falls back to discrete params when the gen token is malformed", () => {
    const parsed = parseOpponentDebugParams("?gen=not-an-id&layer=2&n=4");
    expect(parsed).toEqual({
      completionLevel: 2,
      dreamscapeId: null,
      nonce: 4,
      algo: "coherent",
    });
  });

  it("clamps an out-of-range layer into the valid run window", () => {
    expect(
      parseOpponentDebugParams(`?layer=${String(MAX_LAYER + 10)}`)
        .completionLevel,
    ).toBe(MAX_LAYER);
    expect(parseOpponentDebugParams("?layer=-3").completionLevel).toBe(0);
  });

  it("defaults a bare query to the layer-0 neutral coherent generation", () => {
    expect(parseOpponentDebugParams("")).toEqual({
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
      algo: "coherent",
    });
  });

  it("treats malformed numbers and an unknown algo as their defaults", () => {
    expect(parseOpponentDebugParams("?layer=abc&n=xyz&algo=bogus")).toEqual({
      completionLevel: 0,
      dreamscapeId: null,
      nonce: 0,
      algo: "coherent",
    });
  });
});
