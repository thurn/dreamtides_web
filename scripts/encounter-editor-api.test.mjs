import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEncounterEditorApiMiddleware } from "./encounter-editor-api.mjs";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CARD_ID = "22222222-2222-4222-8222-222222222222";

function candidate(rank, selected = false) {
  return {
    template_pair_id: `pair-${String(rank)}`,
    prose: `Prose ${String(rank)}`,
    actions: [1, 2].map((templateId) => ({
      template_id: templateId,
      label: `Label ${String(templateId)}`,
      effect_text: `Effect ${String(templateId)}`,
      resolution: `Resolution ${String(templateId)}`,
    })),
    rank,
    ...(selected ? { selected: true } : {}),
  };
}

function request(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  queueMicrotask(() => {
    if (body !== undefined) req.emit("data", JSON.stringify(body));
    req.emit("end");
  });
  return req;
}

function response() {
  return {
    status: 0,
    headers: {},
    body: "",
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(body = "") { this.body = body; },
  };
}

describe("encounter editor API", () => {
  let rootDir;
  let middleware;

  beforeEach(() => {
    rootDir = mkdtempSync(join(tmpdir(), "encounter-editor-api-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    mkdirSync(join(rootDir, "curated-art"), { recursive: true });
    mkdirSync(join(rootDir, "source-art"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "encounter_candidates.json"),
      `${JSON.stringify({ [CARD_ID]: [candidate(1, true), candidate(2)] }, null, 2)}\n`,
    );
    writeFileSync(
      join(rootDir, "data", "tabula", "cards.toml"),
      `[[cards]]\nid = "${CARD_ID}"\nname = "The Test Crossing"\nimage-number = 42\n`,
    );
    middleware = createEncounterEditorApiMiddleware({
      rootDir,
      curatedArtDir: join(rootDir, "curated-art"),
      sourceArtDir: join(rootDir, "source-art"),
    });
  });

  afterEach(() => rmSync(rootDir, { recursive: true, force: true }));

  async function call(method, url, body) {
    const res = response();
    const next = vi.fn();
    await middleware(request(method, url, body), res, next);
    return {
      body: res.body === "" ? null : JSON.parse(String(res.body)),
      headers: res.headers,
      next,
      status: res.status,
    };
  }

  async function callRaw(method, url) {
    const res = response();
    const next = vi.fn();
    await middleware(request(method, url), res, next);
    return { body: res.body, headers: res.headers, next, status: res.status };
  }

  it("loads validated groups enriched with canonical card display data", async () => {
    const result = await call("GET", "/api/editor/encounters");
    expect(result.status).toBe(200);
    expect(result.body.groups[0]).toMatchObject({
      cardId: CARD_ID,
      cardName: "The Test Crossing",
      imageNumber: 42,
    });
  });

  it("serves a Shutterstock source image when the curated set has no match", async () => {
    writeFileSync(
      join(rootDir, "source-art", "stock-photo-test-crossing-42.png"),
      "source-png",
    );
    const result = await callRaw("GET", "/api/editor/encounters/art/42");
    expect(result.status).toBe(200);
    expect(result.headers["Content-Type"]).toBe("image/png");
    expect(result.body.toString()).toBe("source-png");
  });

  it("prefers the curated full-resolution image when both sources match", async () => {
    writeFileSync(join(rootDir, "curated-art", "42.jpg"), "curated-jpg");
    writeFileSync(
      join(rootDir, "source-art", "stock-photo-test-crossing-42.jpg"),
      "source-jpg",
    );
    const result = await callRaw("GET", "/api/editor/encounters/art/42");
    expect(result.status).toBe(200);
    expect(result.headers["Content-Type"]).toBe("image/jpeg");
    expect(result.body.toString()).toBe("curated-jpg");
  });

  it("rejects invalid and ambiguous artwork identities", async () => {
    const invalid = await call("GET", "/api/editor/encounters/art/not-a-number");
    writeFileSync(join(rootDir, "source-art", "first-42.jpg"), "first");
    writeFileSync(join(rootDir, "source-art", "second-42.webp"), "second");
    const ambiguous = await call("GET", "/api/editor/encounters/art/42");
    expect(invalid).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_ART_ID" } },
    });
    expect(ambiguous).toMatchObject({
      status: 409,
      body: { error: { code: "AMBIGUOUS_ART" } },
    });
  });

  it("loads template health from its dedicated read-only endpoint", async () => {
    const templateHealthReader = vi.fn().mockReturnValue({
      completedCards: 1,
      templates: [{ templateId: 14, status: "hidden" }],
    });
    middleware = createEncounterEditorApiMiddleware({ rootDir, templateHealthReader });
    const result = await call("GET", "/api/editor/encounters/template-health");
    expect(result).toMatchObject({
      status: 200,
      body: {
        templateHealth: {
          completedCards: 1,
          templates: [{ templateId: 14, status: "hidden" }],
        },
      },
    });
    expect(templateHealthReader).toHaveBeenCalledWith({ rootDir });
  });

  it("rejects writes to the template-health endpoint", async () => {
    const result = await call("PATCH", "/api/editor/encounters/template-health", {});
    expect(result).toMatchObject({ status: 405, body: { error: { code: "METHOD_NOT_ALLOWED" } } });
  });

  it("persists selection by stable identities and echoes the revision", async () => {
    const result = await call("PATCH", `/api/editor/encounters/${CARD_ID}/selection`, {
      templatePairId: "pair-2",
      clientRevision: 7,
    });
    expect(result).toMatchObject({
      status: 200,
      body: { clientRevision: 7, confirmation: { selectedRank: 2 } },
    });
    const saved = JSON.parse(readFileSync(join(rootDir, "data", "encounter_candidates.json"), "utf8"));
    expect(saved[CARD_ID].map((entry) => entry.selected)).toEqual([undefined, true]);
  });

  it("persists only the targeted action text", async () => {
    const url = `/api/editor/encounters/${CARD_ID}/candidates/pair-1`;
    const result = await call("PATCH", url, {
      field: "resolution",
      actionTemplateId: 2,
      value: "A revised resolution",
    });
    expect(result.status).toBe(200);
    expect(result.body.confirmation).toMatchObject({ actionTemplateId: 2, value: "A revised resolution" });
  });

  it("rejects malformed identities and missing targets without touching the file", async () => {
    const path = join(rootDir, "data", "encounter_candidates.json");
    const before = readFileSync(path, "utf8");
    const malformed = await call("PATCH", "/api/editor/encounters/not-a-uuid/selection", { templatePairId: "pair-2" });
    const missing = await call("PATCH", `/api/editor/encounters/${OTHER_CARD_ID}/selection`, { templatePairId: "pair-2" });
    expect(malformed.status).toBe(400);
    expect(missing.status).toBe(404);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("passes unrelated requests to the next middleware", async () => {
    const result = await call("GET", "/api/editor/cards");
    expect(result.next).toHaveBeenCalledOnce();
  });
});
