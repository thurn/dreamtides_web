// Dream selection and compiled-map loading: a run plays the catalog's first
// dream, a development scene or an empty catalog plays the development dream;
// a compiled map passes the shape check, and a malformed, mismatched or
// unavailable one is a failure the overworld falls back from.

import { afterEach, describe, expect, it, vi } from "vitest";
import { DEVELOPMENT_DREAM } from "../../content/d97/dreams/development";
import { defineDream } from "../../content/d97/dreams/schema";
import { parseD97DreamId, parseDreamAnchorId, parseDreamMapId } from "../../types/identifiers";
import { compileDevMap } from "./dev-map";
import { loadCompiledDreamMap, parseCompiledDreamMap, selectRunDream } from "./dream-loading";

const uuid = (n: number) => `00000097-0001-4000-8000-${n.toString(16).padStart(12, "0")}`;
const anchor = (n: number) => parseDreamAnchorId(uuid(n));
const dream = (n: number) =>
  defineDream({
    id: parseD97DreamId(uuid(n)),
    mapId: parseDreamMapId(uuid(n + 100)),
    topology: { waypointAnchorId: anchor(n + 200), arrivalDoorAnchorId: anchor(n + 201), exitDoorAnchorId: anchor(n + 202), exitGuardianAnchorId: anchor(n + 203), shopAnchorId: anchor(n + 204) },
    residents: [],
  });

describe("selectRunDream", () => {
  const catalog = [dream(1), dream(2)];

  it("plays the catalog's first dream", () => {
    expect(selectRunDream(catalog, { development: false })).toEqual({ dream: catalog[0], source: "catalog" });
  });

  it("plays the development dream for a development scene or an empty catalog", () => {
    expect(selectRunDream(catalog, { development: true })).toEqual({ dream: DEVELOPMENT_DREAM, source: "development" });
    expect(selectRunDream([], { development: false })).toEqual({ dream: DEVELOPMENT_DREAM, source: "development" });
  });
});

describe("parseCompiledDreamMap", () => {
  const map = compileDevMap();
  const json = (): Record<string, unknown> => JSON.parse(JSON.stringify(map)) as Record<string, unknown>;

  it("accepts a compiled map for its id", () => {
    expect(parseCompiledDreamMap(json(), map.id)).toEqual({ ok: true, map });
  });

  it("rejects another map, a malformed map and a stale format", () => {
    expect(parseCompiledDreamMap(json(), parseDreamMapId(uuid(500)))).toEqual({ ok: false, reason: "mismatched" });
    expect(parseCompiledDreamMap({ ...json(), walkable: "1" }, map.id)).toEqual({ ok: false, reason: "malformed" });
    expect(parseCompiledDreamMap({ ...json(), anchors: null }, map.id)).toEqual({ ok: false, reason: "malformed" });
    expect(parseCompiledDreamMap({ ...json(), format: 0 }, map.id)).toEqual({ ok: false, reason: "malformed" });
    expect(parseCompiledDreamMap(null, map.id)).toEqual({ ok: false, reason: "malformed" });
  });
});

describe("loadCompiledDreamMap", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads a served map once, and reports a missing or unreachable one", async () => {
    const map = compileDevMap();
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(url.endsWith(`/d97/maps/${map.id}.json`) ? new Response(JSON.stringify(map)) : new Response(null, { status: 404 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadCompiledDreamMap(map.id)).resolves.toEqual({ ok: true, map });
    await loadCompiledDreamMap(map.id);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await expect(loadCompiledDreamMap(parseDreamMapId(uuid(600)))).resolves.toEqual({ ok: false, reason: "unavailable" });
    vi.stubGlobal("fetch", () => Promise.reject(new Error("offline")));
    await expect(loadCompiledDreamMap(parseDreamMapId(uuid(601)))).resolves.toEqual({ ok: false, reason: "unavailable" });
  });
});
