// @vitest-environment node

import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "smol-toml";
import { afterEach, describe, expect, it } from "vitest";
import { createCardEditorApiMiddleware } from "./card-editor-api.mjs";
import {
  defaultTagColor,
  patchRenderedCardsToml,
  readEditorCards,
  readTideRegistry,
  removeTidesFromCards,
  serializeTideRegistry,
  tideRegistryPathFor,
  validateCardEdit,
} from "./card-editor-data.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

const CARDS_REL_PATH = join("data", "tabula", "cards_v2.toml");
const REGISTRY_REL_PATH = join("data", "tabula", "cards_v2.tides.toml");

const servers = [];

function fixtureToml() {
  return `[[cards]]
name = "First Card"
id = "${FIRST_ID}"
large-tides = ["event_chain"]
medium-tides = ["discover_toolbox"]
small-tides = []
rendered-text = "Draw a card."
energy-cost = 1
card-type = "Event"
subtype = ""
is-fast = false
spark = ""
tags = []
image-number = 1001
art-owned = true
card-number = 1

[[cards]]
name = "Second Card"
id = "${SECOND_ID}"
large-tides = ["event_chain"]
medium-tides = []
small-tides = []
rendered-text = "Line two."
energy-cost = 2
card-type = "Character"
subtype = "Guide"
is-fast = false
spark = 1
tags = []
image-number = 1002
art-owned = false
card-number = 2

[[cards]]
name = "Third Card"
id = "${THIRD_ID}"
large-tides = []
medium-tides = []
small-tides = []
rendered-text = "Line three."
energy-cost = 3
card-type = "Character"
subtype = ""
is-fast = false
spark = 2
tags = []
image-number = 1003
art-owned = false
card-number = 3
`;
}

function writeFixtureRoot({ withRegistry = false } = {}) {
  const rootDir = mkdtempSync(join(tmpdir(), "quest-card-editor-tides-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(join(rootDir, CARDS_REL_PATH), fixtureToml());
  if (withRegistry) {
    writeFileSync(
      join(rootDir, REGISTRY_REL_PATH),
      [
        "[[tides]]",
        'name = "event_chain"',
        'color = "#ff0000"',
        'kind = "large"',
        "",
        "[[tides]]",
        'name = "discover_toolbox"',
        'color = "#00ff00"',
        'kind = "medium"',
        "",
      ].join("\n"),
    );
  }
  return rootDir;
}

async function startApi(rootDir) {
  const middleware = createCardEditorApiMiddleware({ rootDir });
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(418, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ next: true }));
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  return `http://${address.address}:${address.port}`;
}

async function requestJson(origin, path, init) {
  const response = await fetch(`${origin}${path}`, init);
  return { response, body: await response.json() };
}

afterEach(() => {
  while (servers.length > 0) {
    servers.pop().close();
  }
});

describe("tide data model", () => {
  it("exposes a normalized, per-kind tide list on each editor record", () => {
    const rootDir = writeFixtureRoot();
    const cards = readEditorCards({ rootDir, cardTomlPath: CARDS_REL_PATH });

    expect(
      cards.map((card) => ({
        large: card.largeTides,
        medium: card.mediumTides,
        small: card.smallTides,
      })),
    ).toEqual([
      { large: ["event_chain"], medium: ["discover_toolbox"], small: [] },
      { large: ["event_chain"], medium: [], small: [] },
      { large: [], medium: [], small: [] },
    ]);
  });

  it("derives the tide registry sidecar path from the card file path", () => {
    expect(tideRegistryPathFor(join("data", "tabula", "cards_v2.toml"))).toBe(
      REGISTRY_REL_PATH,
    );
  });
});

describe("validateCardEdit for tide fields", () => {
  it("accepts and dedupes a string array on each kind field", () => {
    for (const field of ["large-tides", "medium-tides", "small-tides"]) {
      expect(validateCardEdit(field, ["a", "b", "a"])).toMatchObject({
        ok: true,
        value: ["a", "b"],
      });
      expect(validateCardEdit(field, [])).toMatchObject({ ok: true, value: [] });
    }
  });

  it("rejects non-arrays, blanks, and non-strings", () => {
    expect(validateCardEdit("large-tides", "event_chain").ok).toBe(false);
    expect(validateCardEdit("medium-tides", ["  "]).ok).toBe(false);
    expect(validateCardEdit("small-tides", [3]).ok).toBe(false);
  });
});

describe("patchRenderedCardsToml for tide fields", () => {
  it("rewrites the inline kind array preserving valid TOML", () => {
    const patched = patchRenderedCardsToml(fixtureToml(), {
      cardId: THIRD_ID,
      field: "large-tides",
      value: ["void_recursion", "event_chain"],
    }).source;

    const parsed = parse(patched);
    const third = parsed.cards.find((card) => card.id === THIRD_ID);
    expect(third["large-tides"]).toEqual(["void_recursion", "event_chain"]);
    expect(patched).toContain('large-tides = ["void_recursion", "event_chain"]');
  });
});

describe("readTideRegistry", () => {
  it("seeds from tides used on cards, keyed to the kind of their field", () => {
    const rootDir = writeFixtureRoot();
    const registry = readTideRegistry({ rootDir, cardTomlPath: CARDS_REL_PATH });

    expect(
      [...registry]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((tide) => ({ name: tide.name, kind: tide.kind })),
    ).toEqual([
      { name: "discover_toolbox", kind: "medium" },
      { name: "event_chain", kind: "large" },
    ]);
    for (const tide of registry) {
      expect(tide.color).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it("prefers sidecar colors and kinds and appends unregistered used tides", () => {
    const rootDir = writeFixtureRoot({ withRegistry: true });
    const patched = patchRenderedCardsToml(
      readFileSync(join(rootDir, CARDS_REL_PATH), "utf8"),
      { cardId: THIRD_ID, field: "large-tides", value: ["void_recursion"] },
    ).source;
    writeFileSync(join(rootDir, CARDS_REL_PATH), patched);

    const registry = readTideRegistry({ rootDir, cardTomlPath: CARDS_REL_PATH });
    expect(registry).toEqual([
      { name: "event_chain", color: "#ff0000", kind: "large" },
      { name: "discover_toolbox", color: "#00ff00", kind: "medium" },
      {
        name: "void_recursion",
        color: defaultTagColor("void_recursion"),
        kind: "large",
      },
    ]);
  });
});

describe("serializeTideRegistry", () => {
  it("round-trips kinds through the TOML parser under the [[tides]] key", () => {
    const tides = [
      { name: "event_chain", color: "#ff0000", kind: "large" },
      { name: "discover_toolbox", color: "#00ff00", kind: "medium" },
    ];
    const serialized = serializeTideRegistry(tides, {
      cardTomlBasename: "cards_v2.toml",
    });
    expect(serialized).toContain("[[tides]]");
    expect(serialized).toContain('kind = "medium"');
    expect(parse(serialized).tides).toEqual(tides);
  });
});

describe("removeTidesFromCards", () => {
  it("strips removed tides from every kind field that uses them", () => {
    const next = removeTidesFromCards(fixtureToml(), ["event_chain"]);
    const cards = parse(next).cards;
    const first = cards.find((card) => card.id === FIRST_ID);
    const second = cards.find((card) => card.id === SECOND_ID);
    expect(first["large-tides"]).toEqual([]);
    expect(first["medium-tides"]).toEqual(["discover_toolbox"]);
    expect(second["large-tides"]).toEqual([]);
  });
});

describe("tide registry API", () => {
  it("GET seeds the registry from used tides with their kinds", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tides?toml=cards_v2.toml",
    );
    expect(response.status).toBe(200);
    expect(
      [...body.tags]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((tide) => ({ name: tide.name, kind: tide.kind })),
    ).toEqual([
      { name: "discover_toolbox", kind: "medium" },
      { name: "event_chain", kind: "large" },
    ]);
  });

  it("PUT creates the tides sidecar and cascades a deleted tide", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    // Keep only discover_toolbox; event_chain is deleted and must be stripped
    // from the large-tides field it lives on.
    const { response, body } = await requestJson(
      origin,
      "/api/editor/tides?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: [{ name: "discover_toolbox", color: "#00ff00", kind: "medium" }],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(existsSync(join(rootDir, REGISTRY_REL_PATH))).toBe(true);
    const first = body.cards.find((card) => card.id === FIRST_ID);
    const second = body.cards.find((card) => card.id === SECOND_ID);
    expect(first.largeTides).toEqual([]);
    expect(first.mediumTides).toEqual(["discover_toolbox"]);
    expect(second.largeTides).toEqual([]);
  });

  it("PUT rejects an invalid registry", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tides?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [{ name: "a", color: "not-a-color" }] }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_TIDE_REGISTRY");
  });

  it("PUT rejects an unknown tide kind", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tides?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: [{ name: "event_chain", color: "#ff0000", kind: "huge" }],
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_TIDE_REGISTRY");
  });
});

describe("card tide PATCH", () => {
  it("assigns a registry tide to its kind field on a card", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${THIRD_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: THIRD_ID,
          field: "large-tides",
          value: ["event_chain"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(body.card.largeTides).toEqual(["event_chain"]);
  });

  it("rejects a tide that is not in the registry", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${THIRD_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: THIRD_ID,
          field: "large-tides",
          value: ["nonexistent"],
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_EDIT");
  });

  it("rejects assigning a tide to a field of the wrong kind", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    // discover_toolbox is a medium tide, so it cannot be saved to large-tides.
    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${THIRD_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: THIRD_ID,
          field: "large-tides",
          value: ["discover_toolbox"],
        }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_EDIT");
  });
});
