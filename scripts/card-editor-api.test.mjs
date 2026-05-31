// @vitest-environment node

import { createServer, request as httpRequest } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCardEditorApiMiddleware } from "./card-editor-api.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const SPECIAL_ID = "33333333-3333-4333-8333-333333333333";
const BANE_ID = "44444444-4444-4444-8444-444444444444";

const servers = [];

function fixtureToml() {
  return `[[cards]]
name = "First Card"
id = "${FIRST_ID}"
tides = ["event_chain"]
rendered-text = "Draw a card."
energy-cost = 1
card-type = "Event"
subtype = ""
is-fast = false
spark = ""
image-number = 1001
art-owned = true
card-number = 7

[[cards]]
name = "Second Card"
id = "${SECOND_ID}"
tides = ["void_recursion"]
rendered-text = "Line two."
energy-cost = 2
card-type = "Character"
subtype = "Guide"
is-fast = false
spark = 1
image-number = 1002
art-owned = false
card-number = 7

[[cards]]
name = "Void Indicator"
id = "${SPECIAL_ID}"
tides = ["special"]
rendered-text = "Filtered from runtime JSON."
energy-cost = "*"
card-type = "Event"
subtype = ""
rarity = "Special"
is-fast = false
spark = "*"
image-number = 1003
art-owned = false
card-number = 999

[[cards]]
name = "Nightmare"
id = "${BANE_ID}"
tides = ["bane"]
rendered-text = "Bane text."
energy-cost = 0
card-type = "Event"
subtype = ""
rarity = "Special"
is-fast = false
spark = ""
image-number = 1004
art-owned = false
card-number = 1000
`;
}

function writeFixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "quest-card-editor-api-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  mkdirSync(join(rootDir, "public"), { recursive: true });
  writeFileSync(join(rootDir, "data", "tabula", "rendered-cards.toml"), fixtureToml());
  writeFileSync(join(rootDir, "public", "card-data.json"), "[]\n");
  return rootDir;
}

function readToml(rootDir) {
  return readFileSync(join(rootDir, "data", "tabula", "rendered-cards.toml"), "utf8");
}

function readCardJson(rootDir) {
  return readFileSync(join(rootDir, "public", "card-data.json"), "utf8");
}

async function startApi(rootDir, options = {}) {
  const middleware = createCardEditorApiMiddleware({ rootDir, ...options });
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(418, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ next: true }));
    });
  });

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  servers.push(server);
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

async function requestJson(origin, path, init) {
  const response = await fetch(`${origin}${path}`, init);
  return {
    response,
    body: await response.json(),
  };
}

async function requestRawJson(origin, path, { method = "GET", headers = {}, body } = {}) {
  const url = new URL(origin);

  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method,
        headers,
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          resolve({
            response,
            body: JSON.parse(rawBody),
          });
        });
      },
    );

    req.on("error", reject);
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function expectNoWrites(rootDir, originalToml, originalCardJson) {
  expect(readToml(rootDir)).toBe(originalToml);
  expect(readCardJson(rootDir)).toBe(originalCardJson);
}

function fileSystemFailingGeneratedJsonWrite() {
  return {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync(path, data) {
      if (String(path).includes("card-data.json.") && String(path).endsWith(".tmp")) {
        throw new Error("Injected card-data.json write failure");
      }

      writeFileSync(path, data);
    },
  };
}

function fileSystemFailingBackupCleanup() {
  return {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync(path, options) {
      if (String(path).endsWith(".bak")) {
        throw new Error("Injected backup cleanup failure");
      }

      rmSync(path, options);
    },
    writeFileSync,
  };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    })),
  );
});

describe("createCardEditorApiMiddleware", () => {
  it("passes unrelated paths to next", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/other/path");

    expect(response.status).toBe(418);
    expect(body).toEqual({ next: true });
  });

  it("passes unrelated /api/editor paths to next", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/other");

    expect(response.status).toBe(418);
    expect(body).toEqual({ next: true });
  });

  it("passes similar-prefix editor card routes to next", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards-export");

    expect(response.status).toBe(418);
    expect(body).toEqual({ next: true });
  });

  it("returns source cards with UUID ids, excluding Special-rarity records", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(body.cards.map((card) => card.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(body.cards.map((card) => card.cardNumber)).toEqual([7, 7]);
    for (const card of body.cards) {
      expect(card.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
    }
  });

  it("applies one valid field edit and refreshes card-data.json", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Moonlit Envoy",
        clientRevision: 12,
      }),
    });

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      card: {
        id: FIRST_ID,
        name: "Moonlit Envoy",
      },
      clientRevision: 12,
    });
    expect(body.timing.totalMs).toEqual(expect.any(Number));
    expect(body.timing.patchMs).toEqual(expect.any(Number));
    expect(readToml(rootDir)).toContain('name = "Moonlit Envoy"');
    const cards = JSON.parse(readCardJson(rootDir));
    expect(cards.map((card) => card.name)).toEqual(["Moonlit Envoy", "Second Card", "Nightmare"]);
  });

  it("keeps TOML and card-data.json unchanged when the generated JSON write fails", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir, {
      fileSystem: fileSystemFailingGeneratedJsonWrite(),
    });

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Generated JSON Write Failure",
      }),
    });

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "SAVE_FAILED",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("keeps a save committed when backup cleanup fails after replacement", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir, {
      fileSystem: fileSystemFailingBackupCleanup(),
    });

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Cleanup Failure Name",
      }),
    });

    expect(response.status).toBe(200);
    expect(body.card).toMatchObject({
      id: FIRST_ID,
      name: "Cleanup Failure Name",
    });
    expect(readToml(rootDir)).not.toBe(originalToml);
    expect(readToml(rootDir)).toContain('name = "Cleanup Failure Name"');
    expect(readCardJson(rootDir)).not.toBe(originalCardJson);
    const cards = JSON.parse(readCardJson(rootDir));
    expect(cards.map((card) => card.name)).toEqual([
      "Cleanup Failure Name",
      "Second Card",
      "Nightmare",
    ]);
  });

  it("returns 400 for route/body id mismatch and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: SECOND_ID,
        field: "name",
        value: "Wrong Card",
      }),
    });

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "CARD_ID_MISMATCH",
    });
    expect(readToml(rootDir)).toBe(originalToml);
    expect(readCardJson(rootDir)).toBe(originalCardJson);
  });

  it("returns 400 for card-type edits and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "card-type",
        value: "Character",
      }),
    });

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_EDIT",
      details: {
        field: "card-type",
      },
    });
    expect(readToml(rootDir)).toBe(originalToml);
    expect(readCardJson(rootDir)).toBe(originalCardJson);
  });

  it("returns 400 with a structured error body for invalid JSON", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const response = await fetch(`${origin}/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: "INVALID_JSON",
        message: expect.any(String),
      },
    });
  });

  it("returns 404 for unknown UUID and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);
    const unknownId = "99999999-9999-4999-8999-999999999999";

    const { response, body } = await requestJson(origin, `/api/editor/cards/${unknownId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: unknownId,
        field: "name",
        value: "Unknown Card",
      }),
    });

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({
      code: "CARD_NOT_FOUND",
    });
    expect(readToml(rootDir)).toBe(originalToml);
    expect(readCardJson(rootDir)).toBe(originalCardJson);
  });

  it("does not accept card number as route identity", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards/7", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "7",
        field: "name",
        value: "Card Number Edit",
      }),
    });

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects encoded dot-segment subroutes before path normalization and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestRawJson(
      origin,
      `/api/editor/cards/extra/%2e%2e/${FIRST_ID}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: FIRST_ID,
          field: "name",
          value: "Normalized Attack",
        }),
      },
    );

    expect(response.statusCode).toBe(404);
    expect(body.error).toMatchObject({
      code: "NOT_FOUND",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects encoded slashes in the route id and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);
    const encodedRouteId = FIRST_ID.replace("-", "%2F");
    const decodedRouteId = FIRST_ID.replace("-", "/");

    const { response, body } = await requestRawJson(origin, `/api/editor/cards/${encodedRouteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: decodedRouteId,
        field: "name",
        value: "Slash Attack",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects encoded safe UUID characters in the route id and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);
    const encodedRouteId = FIRST_ID.replace("-", "%2d");

    const { response, body } = await requestRawJson(origin, `/api/editor/cards/${encodedRouteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Encoded Hyphen",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects encoded separators after the cards prefix as API errors", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestRawJson(origin, `/api/editor/cards%2F${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Encoded Separator",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects encoded static API route segments with a JSON error", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestRawJson(origin, `/api/editor/card%73/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Encoded Static Segment",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/json");
    expect(body.error).toMatchObject({
      code: "INVALID_API_PATH",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects malformed percent escapes in the route id and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestRawJson(origin, "/api/editor/cards/%E0%A4%A", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        field: "name",
        value: "Bad Escape",
      }),
    });

    expect(response.statusCode).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects uppercase UUID route ids and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);
    const uppercaseId = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";

    const { response, body } = await requestJson(origin, `/api/editor/cards/${uppercaseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: uppercaseId,
        field: "name",
        value: "Uppercase Attack",
      }),
    });

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("rejects non-UUID body ids and does not write files", async () => {
    const rootDir = writeFixtureRoot();
    const originalToml = readToml(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "not-a-uuid",
        field: "name",
        value: "Body Attack",
      }),
    });

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({
      code: "INVALID_CARD_ID",
    });
    expectNoWrites(rootDir, originalToml, originalCardJson);
  });

  it("returns 405 for unsupported methods under /api/editor/cards", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(body.error).toMatchObject({
      code: "METHOD_NOT_ALLOWED",
    });
  });

  it("returns resource-specific 405 responses for card resources", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, `/api/editor/cards/${FIRST_ID}`);

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("PATCH");
    expect(body.error).toMatchObject({
      code: "METHOD_NOT_ALLOWED",
    });
  });
});

const ALT_ID = "55555555-5555-4555-8555-555555555555";

function altFixtureToml() {
  return `[[cards]]
name = "Alternate Card"
id = "${ALT_ID}"
tides = []
rendered-text = "Alternate text."
energy-cost = 3
card-type = "Character"
subtype = "Wanderer"
is-fast = false
spark = 2
image-number = 2001
art-owned = false
card-number = 1
`;
}

function writeAltFixture(rootDir, fileName = "cards_v2.toml") {
  writeFileSync(join(rootDir, "data", "tabula", fileName), altFixtureToml());
}

function readAltToml(rootDir, fileName = "cards_v2.toml") {
  return readFileSync(join(rootDir, "data", "tabula", fileName), "utf8");
}

describe("createCardEditorApiMiddleware toml selection", () => {
  it("loads cards from an alternate toml selected by the full relative path", async () => {
    const rootDir = writeFixtureRoot();
    writeAltFixture(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/cards?toml=data/tabula/cards_v2.toml",
    );

    expect(response.status).toBe(200);
    expect(body.cards.map((card) => card.id)).toEqual([ALT_ID]);
  });

  it("accepts a bare filename for the toml parameter", async () => {
    const rootDir = writeFixtureRoot();
    writeAltFixture(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards?toml=cards_v2.toml");

    expect(response.status).toBe(200);
    expect(body.cards.map((card) => card.id)).toEqual([ALT_ID]);
  });

  it("edits the alternate toml without touching the runtime card-data.json", async () => {
    const rootDir = writeFixtureRoot();
    writeAltFixture(rootDir);
    const originalCardJson = readCardJson(rootDir);
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${ALT_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ALT_ID, field: "name", value: "Renamed Alt" }),
      },
    );

    expect(response.status).toBe(200);
    expect(body.card).toMatchObject({ id: ALT_ID, name: "Renamed Alt" });
    expect(readAltToml(rootDir)).toContain('name = "Renamed Alt"');
    // The canonical file and the generated runtime catalog are untouched.
    expect(readToml(rootDir)).toBe(fixtureToml());
    expect(readCardJson(rootDir)).toBe(originalCardJson);
  });

  it("returns 404 when the requested toml file does not exist", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards?toml=missing.toml");

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "TOML_NOT_FOUND" });
  });

  it("rejects toml paths that escape data/tabula", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards?toml=${encodeURIComponent("../../etc/passwd.toml")}`,
    );

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_TOML" });
  });

  it("rejects toml parameters without a .toml extension", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(origin, "/api/editor/cards?toml=cards_v2.json");

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_TOML" });
  });
});
