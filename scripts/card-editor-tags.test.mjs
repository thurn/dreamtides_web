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
  readTagRegistry,
  removeTagsFromCards,
  serializeTagRegistry,
  tagRegistryPathFor,
  validateCardEdit,
  validateTagRegistry,
} from "./card-editor-data.mjs";

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";
const THIRD_ID = "33333333-3333-4333-8333-333333333333";

const CARDS_REL_PATH = join("data", "tabula", "cards_v2.toml");
const REGISTRY_REL_PATH = join("data", "tabula", "cards_v2.tags.toml");

const servers = [];

function fixtureToml() {
  return `[[cards]]
name = "First Card"
id = "${FIRST_ID}"
tides = []
rendered-text = "Draw a card."
energy-cost = 1
card-type = "Event"
subtype = ""
is-fast = false
spark = ""
tags = ["Removal", "Discover"]
image-number = 1001
art-owned = true
card-number = 1

[[cards]]
name = "Second Card"
id = "${SECOND_ID}"
tides = []
rendered-text = "Line two."
energy-cost = 2
card-type = "Character"
subtype = "Guide"
is-fast = false
spark = 1
tags = ["Removal"]
image-number = 1002
art-owned = false
card-number = 2

[[cards]]
name = "Third Card"
id = "${THIRD_ID}"
tides = []
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
  const rootDir = mkdtempSync(join(tmpdir(), "quest-card-editor-tags-"));
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(join(rootDir, CARDS_REL_PATH), fixtureToml());
  if (withRegistry) {
    writeFileSync(
      join(rootDir, REGISTRY_REL_PATH),
      [
        "[[tags]]",
        'name = "Removal"',
        'color = "#ff0000"',
        "",
        "[[tags]]",
        'name = "Discover"',
        'color = "#00ff00"',
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

describe("tag data model", () => {
  it("exposes a normalized, deduped tag list on each editor record", () => {
    const rootDir = writeFixtureRoot();
    const cards = readEditorCards({ rootDir, cardTomlPath: CARDS_REL_PATH });

    expect(cards.map((card) => card.tags)).toEqual([
      ["Removal", "Discover"],
      ["Removal"],
      [],
    ]);
  });

  it("derives the registry sidecar path from the card file path", () => {
    expect(tagRegistryPathFor(join("data", "tabula", "cards_v2.toml"))).toBe(
      REGISTRY_REL_PATH,
    );
  });

  it("assigns a stable default color per tag name", () => {
    expect(defaultTagColor("Removal")).toBe(defaultTagColor("Removal"));
    expect(defaultTagColor("Removal")).toMatch(/^#[0-9a-f]{6}$/u);
  });
});

describe("validateCardEdit for tags", () => {
  it("accepts and dedupes a string array", () => {
    expect(validateCardEdit("tags", ["A", "B", "A"])).toMatchObject({
      ok: true,
      value: ["A", "B"],
    });
    expect(validateCardEdit("tags", [])).toMatchObject({ ok: true, value: [] });
  });

  it("rejects non-arrays, blanks, and non-strings", () => {
    expect(validateCardEdit("tags", "Removal").ok).toBe(false);
    expect(validateCardEdit("tags", ["  "]).ok).toBe(false);
    expect(validateCardEdit("tags", [3]).ok).toBe(false);
  });
});

describe("patchRenderedCardsToml for tags", () => {
  it("rewrites the inline tags array preserving valid TOML", () => {
    const source = fixtureToml();
    const patched = patchRenderedCardsToml(source, {
      cardId: THIRD_ID,
      field: "tags",
      value: ["Elves", "Cantrips"],
    }).source;

    const parsed = parse(patched);
    const third = parsed.cards.find((card) => card.id === THIRD_ID);
    expect(third.tags).toEqual(["Elves", "Cantrips"]);
    expect(patched).toContain('tags = ["Elves", "Cantrips"]');
  });

  it("can clear tags to an empty array", () => {
    const patched = patchRenderedCardsToml(fixtureToml(), {
      cardId: SECOND_ID,
      field: "tags",
      value: [],
    }).source;
    const second = parse(patched).cards.find((card) => card.id === SECOND_ID);
    expect(second.tags).toEqual([]);
  });
});

describe("readTagRegistry", () => {
  it("seeds from tags used on cards when no sidecar exists", () => {
    const rootDir = writeFixtureRoot();
    const registry = readTagRegistry({ rootDir, cardTomlPath: CARDS_REL_PATH });

    expect(registry.map((tag) => tag.name).sort()).toEqual(["Discover", "Removal"]);
    for (const tag of registry) {
      expect(tag.color).toMatch(/^#[0-9a-f]{6}$/u);
    }
  });

  it("prefers sidecar colors and appends unregistered used tags", () => {
    const rootDir = writeFixtureRoot({ withRegistry: true });
    // Add a tag to a card that is not in the sidecar.
    const patched = patchRenderedCardsToml(
      readFileSync(join(rootDir, CARDS_REL_PATH), "utf8"),
      { cardId: THIRD_ID, field: "tags", value: ["Elves"] },
    ).source;
    writeFileSync(join(rootDir, CARDS_REL_PATH), patched);

    const registry = readTagRegistry({ rootDir, cardTomlPath: CARDS_REL_PATH });
    expect(registry).toEqual([
      { name: "Removal", color: "#ff0000" },
      { name: "Discover", color: "#00ff00" },
      { name: "Elves", color: defaultTagColor("Elves") },
    ]);
  });
});

describe("validateTagRegistry", () => {
  it("accepts a well-formed registry and lowercases colors", () => {
    expect(
      validateTagRegistry([{ name: "Removal", color: "#FF0000" }]),
    ).toEqual({ ok: true, tags: [{ name: "Removal", color: "#ff0000" }] });
  });

  it("rejects blank names, duplicates, and bad colors", () => {
    expect(validateTagRegistry([{ name: " ", color: "#ffffff" }]).ok).toBe(false);
    expect(
      validateTagRegistry([
        { name: "A", color: "#ffffff" },
        { name: "A", color: "#000000" },
      ]).ok,
    ).toBe(false);
    expect(validateTagRegistry([{ name: "A", color: "red" }]).ok).toBe(false);
  });
});

describe("serializeTagRegistry", () => {
  it("round-trips through the TOML parser", () => {
    const tags = [
      { name: "Removal", color: "#ff0000" },
      { name: "Discover", color: "#00ff00" },
    ];
    const parsed = parse(serializeTagRegistry(tags, { cardTomlBasename: "cards_v2.toml" }));
    expect(parsed.tags).toEqual(tags);
  });
});

describe("removeTagsFromCards", () => {
  it("strips removed tags from every card that uses them", () => {
    const next = removeTagsFromCards(fixtureToml(), ["Removal"]);
    const cards = parse(next).cards;
    expect(cards.find((card) => card.id === FIRST_ID).tags).toEqual(["Discover"]);
    expect(cards.find((card) => card.id === SECOND_ID).tags).toEqual([]);
  });

  it("is a no-op when nothing is removed", () => {
    expect(removeTagsFromCards(fixtureToml(), [])).toBe(fixtureToml());
  });
});

describe("tag registry API", () => {
  it("GET seeds the registry from used tags", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tags?toml=cards_v2.toml",
    );
    expect(response.status).toBe(200);
    expect(body.tags.map((tag) => tag.name).sort()).toEqual(["Discover", "Removal"]);
  });

  it("PUT creates the sidecar file and returns the registry and cards", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tags?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags: [
            { name: "Removal", color: "#abcdef" },
            { name: "Discover", color: "#123456" },
            { name: "Elves", color: "#0f766e" },
          ],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(existsSync(join(rootDir, REGISTRY_REL_PATH))).toBe(true);
    expect(body.tags).toContainEqual({ name: "Elves", color: "#0f766e" });
    const saved = parse(readFileSync(join(rootDir, REGISTRY_REL_PATH), "utf8"));
    expect(saved.tags).toContainEqual({ name: "Removal", color: "#abcdef" });
  });

  it("PUT cascades a deleted tag out of every card", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    // Keep only Discover; Removal is deleted and must be stripped from cards.
    const { response, body } = await requestJson(
      origin,
      "/api/editor/tags?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [{ name: "Discover", color: "#00ff00" }] }),
      },
    );

    expect(response.status).toBe(200);
    const first = body.cards.find((card) => card.id === FIRST_ID);
    const second = body.cards.find((card) => card.id === SECOND_ID);
    expect(first.tags).toEqual(["Discover"]);
    expect(second.tags).toEqual([]);

    const onDisk = parse(readFileSync(join(rootDir, CARDS_REL_PATH), "utf8"));
    expect(onDisk.cards.every((card) => !(card.tags ?? []).includes("Removal"))).toBe(
      true,
    );
  });

  it("PUT rejects an invalid registry", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      "/api/editor/tags?toml=cards_v2.toml",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: [{ name: "A", color: "not-a-color" }] }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_TAG_REGISTRY");
  });
});

describe("card tag PATCH", () => {
  it("assigns a registry tag to a card", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${THIRD_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: THIRD_ID, field: "tags", value: ["Removal"] }),
      },
    );

    expect(response.status).toBe(200);
    expect(body.card.tags).toEqual(["Removal"]);
  });

  it("rejects a tag that is not in the registry", async () => {
    const rootDir = writeFixtureRoot();
    const origin = await startApi(rootDir);

    const { response, body } = await requestJson(
      origin,
      `/api/editor/cards/${THIRD_ID}?toml=cards_v2.toml`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: THIRD_ID, field: "tags", value: ["Nonexistent"] }),
      },
    );

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_EDIT");
  });
});
