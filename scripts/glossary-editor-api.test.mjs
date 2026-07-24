import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseGlossarySource, serializeGlossarySource } from "./glossary-source.mjs";
import { createGlossaryEditorApiMiddleware } from "./glossary-editor-api.mjs";

const roots = [];
const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureEntries() {
  return [
    { id: "spark", category: "Resources", term: "Spark", definition: "Combat power.", priority: 10, matchesRulesText: true, variants: [], contexts: [] },
    { id: "site-draft", category: "Sites", term: "Draft", definition: "Choose cards.", priority: 0, matchesRulesText: false, variants: [], contexts: [] },
  ];
}

async function startApi(source = serializeGlossarySource(fixtureEntries())) {
  const root = mkdtempSync(join(tmpdir(), "glossary-api-"));
  roots.push(root);
  const dataDir = join(root, "data", "tabula");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, "glossary.toml"), source);
  const middleware = createGlossaryEditorApiMiddleware({ rootDir: root });
  const server = createServer((req, res) => {
    void middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { root, origin: `http://127.0.0.1:${String(address.port)}` };
}

describe("glossary editor API", () => {
  it("loads every TOML-backed entry", async () => {
    const { origin } = await startApi();
    const response = await fetch(`${origin}/api/editor/glossary`);
    expect(response.status).toBe(200);
    expect((await response.json()).entries).toEqual(fixtureEntries());
  });

  it("persists an edited title, definition, and rules-text forms", async () => {
    const { root, origin } = await startApi();
    const response = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "spark",
        term: "Spark Power",
        definition: "A character's power during a challenge.",
        variants: ["spark"],
      }),
    });
    expect(response.status).toBe(200);
    const source = readFileSync(join(root, "data", "tabula", "glossary.toml"), "utf8");
    const entries = parseGlossarySource(source);
    expect(entries[0]).toMatchObject({
      id: "spark",
      term: "Spark Power",
      definition: "A character's power during a challenge.",
      priority: 10,
      variants: ["spark"],
    });
  });

  it("adds and removes definition-only term presentation", async () => {
    const { root, origin } = await startApi();
    const path = join(root, "data", "tabula", "glossary.toml");

    const markResponse = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termPresentation: "definitionOnly" }),
    });
    expect(markResponse.status).toBe(200);
    expect(readFileSync(path, "utf8")).toContain(
      'term-presentation = "definition-only"',
    );

    const clearResponse = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ termPresentation: null }),
    });
    expect(clearResponse.status).toBe(200);
    expect(readFileSync(path, "utf8")).not.toContain("term-presentation");
    expect(parseGlossarySource(readFileSync(path, "utf8"))[0]).not.toHaveProperty(
      "termPresentation",
    );
  });

  it("preserves unrelated TOML formatting when editing one entry", async () => {
    const source = `[[entries]]
id = "spark"
category = "Resources"
term = "Spark"
definition = "Combat power."
priority = 10
matches-rules-text = true
variants = []

[[entries]]
id = "site-draft"
category = "Sites"
term = "Draft"
definition = "Choose cards."
matches-rules-text = false
variants = []

[[entries.contexts]]
pattern = '''\\bdraft\\b'''
definition = "Contextual copy."
`;
    const { root, origin } = await startApi(source);
    const response = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ definition: "Updated combat power." }),
    });

    expect(response.status).toBe(200);
    expect(
      readFileSync(join(root, "data", "tabula", "glossary.toml"), "utf8"),
    ).toBe(source.replace(
      'definition = "Combat power."',
      'definition = "Updated combat power."',
    ));
  });

  it("rejects a non-integer priority without changing the TOML", async () => {
    const { root, origin } = await startApi();
    const path = join(root, "data", "tabula", "glossary.toml");
    const before = readFileSync(path, "utf8");
    const response = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority: 1.5 }),
    });
    expect(response.status).toBe(400);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("rejects duplicate rules-text forms without changing the TOML", async () => {
    const { root, origin } = await startApi();
    const path = join(root, "data", "tabula", "glossary.toml");
    const before = readFileSync(path, "utf8");
    const response = await fetch(`${origin}/api/editor/glossary/spark`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ variants: ["Spark"] }),
    });
    expect(response.status).toBe(400);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("preserves TOML-authored tokenizer forms and contextual copy when editing", async () => {
    const entries = fixtureEntries();
    entries[0] = {
      ...entries[0],
      rulesTextForms: ["❖"],
      definitionUsesRulesText: true,
      definitionSymbol: "fast",
      termPresentation: "symbolOnly",
      contexts: [
        {
          owner: "dreamcaller",
          definition: "Dreamcaller-specific explanation.",
        },
      ],
    };
    entries[1] = {
      ...entries[1],
      termPresentation: "definitionOnly",
    };
    const serialized = serializeGlossarySource(entries);
    expect(parseGlossarySource(serialized)[0]).toMatchObject({
      rulesTextForms: ["❖"],
      definitionUsesRulesText: true,
      definitionSymbol: "fast",
      termPresentation: "symbolOnly",
      contexts: [
        {
          owner: "dreamcaller",
          definition: "Dreamcaller-specific explanation.",
        },
      ],
    });
    expect(serialized).toContain('term-presentation = "definition-only"');
    expect(parseGlossarySource(serialized)[1]).toMatchObject({
      termPresentation: "definitionOnly",
    });
  });
});
