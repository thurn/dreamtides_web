import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import {
  GLOSSARY_EDITOR_SOURCE_PATHS,
  createGlossaryEditorApiMiddleware,
} from "./glossary-editor-api.mjs";

const FIRST_ID = "00000000-0000-4000-8000-000000000021";
const SECOND_ID = "00000000-0000-4000-8000-000000000022";
const servers = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise((resolve) => server.close(resolve)),
      ),
  );
});

function fixtureEntries() {
  return [
    {
      id: FIRST_ID,
      category: "Resources",
      term: "Spark",
      definition: "Combat power.",
      priority: 10,
      matchesRulesText: true,
      variants: [],
      contexts: [],
    },
    {
      id: SECOND_ID,
      category: "Sites",
      term: "Draft",
      definition: "Choose cards.",
      priority: 0,
      matchesRulesText: false,
      variants: [],
      contexts: [],
    },
  ];
}

async function startApi({
  entries = fixtureEntries(),
  revision = () => "revision-1",
  publishEdit = async () => ({ changed: [], sourceRevision: "revision-1" }),
  onChanged = () => {},
} = {}) {
  const middleware = createGlossaryEditorApiMiddleware({
    rootDir: "/fixture",
    loadEntries: () => entries,
    revision,
    publishEdit,
    onChanged,
  });
  const server = createServer((req, res) => {
    void middleware(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return { origin: `http://127.0.0.1:${String(address.port)}` };
}

describe("Glossary canonical RON editor API", () => {
  it("loads UUID-addressed entries with their canonical source revision", async () => {
    const { origin } = await startApi();
    const response = await fetch(`${origin}/api/editor/glossary`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      entries: fixtureEntries(),
      sourceRevision: "revision-1",
    });
  });

  it("publishes closed semantic operations for every editable field shape", async () => {
    const publishEdit = vi.fn(async () => ({
      changed: ["data/glossary.ron", "data/glossary.toml"],
      sourceRevision: "revision-2",
    }));
    const { origin } = await startApi({ publishEdit });
    const response = await fetch(`${origin}/api/editor/glossary/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: FIRST_ID,
        term: " Spark Power ",
        definition: " A character's power during a challenge. ",
        priority: -7,
        variants: ["spark", "sparks"],
        termPresentation: "definitionOnly",
        expectedSourceRevision: "revision-1",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      entry: {
        id: FIRST_ID,
        term: "Spark Power",
        definition: "A character's power during a challenge.",
        priority: -7,
        variants: ["spark", "sparks"],
        termPresentation: "definitionOnly",
      },
      sourceRevision: "revision-2",
    });
    expect(publishEdit).toHaveBeenCalledWith({
      rootDir: "/fixture",
      dataset: "glossary",
      operations: [
        {
          operation: "set_glossary_field",
          glossary_id: FIRST_ID,
          field: "term",
          value: "Spark Power",
        },
        {
          operation: "set_glossary_field",
          glossary_id: FIRST_ID,
          field: "definition",
          value: "A character's power during a challenge.",
        },
        {
          operation: "set_glossary_field",
          glossary_id: FIRST_ID,
          field: "priority",
          value: -7,
        },
        {
          operation: "set_glossary_field",
          glossary_id: FIRST_ID,
          field: "variants",
          value: ["spark", "sparks"],
        },
        {
          operation: "set_glossary_field",
          glossary_id: FIRST_ID,
          field: "term-presentation",
          value: "definitionOnly",
        },
      ],
      sourcePaths: GLOSSARY_EDITOR_SOURCE_PATHS,
      expectedSourceRevision: "revision-1",
    });
  });

  it("uses null to remove the optional term presentation", async () => {
    const entries = fixtureEntries();
    entries[0].termPresentation = "definitionOnly";
    const publishEdit = vi.fn(async () => ({
      changed: ["data/glossary.ron"],
      sourceRevision: "revision-2",
    }));
    const { origin } = await startApi({ entries, publishEdit });
    const response = await fetch(`${origin}/api/editor/glossary/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        termPresentation: null,
        expectedSourceRevision: "revision-1",
      }),
    });
    expect(response.status).toBe(200);
    expect(publishEdit.mock.calls[0][0].operations).toEqual([
      {
        operation: "set_glossary_field",
        glossary_id: FIRST_ID,
        field: "term-presentation",
        value: null,
      },
    ]);
  });

  it("suppresses change notifications for semantic no-ops", async () => {
    const onChanged = vi.fn();
    const publishEdit = vi.fn(async () => ({
      changed: [],
      sourceRevision: "revision-1",
    }));
    const { origin } = await startApi({ publishEdit, onChanged });
    const response = await fetch(`${origin}/api/editor/glossary/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: "Spark",
        expectedSourceRevision: "revision-1",
      }),
    });
    expect(response.status).toBe(200);
    expect(publishEdit).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("rejects invalid identities and edits before publication", async () => {
    const publishEdit = vi.fn();
    const { origin } = await startApi({ publishEdit });
    const invalidId = await fetch(`${origin}/api/editor/glossary/legacy-id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedSourceRevision: "revision-1" }),
    });
    const invalidPriority = await fetch(
      `${origin}/api/editor/glossary/${FIRST_ID}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priority: 1.5,
          expectedSourceRevision: "revision-1",
        }),
      },
    );
    expect(invalidId.status).toBe(400);
    expect(invalidPriority.status).toBe(400);
    expect(publishEdit).not.toHaveBeenCalled();
  });

  it("returns stale-source recovery data without retrying publication", async () => {
    const stale = Object.assign(new Error("source changed"), {
      code: "STALE_SOURCE",
      currentSourceRevision: "revision-2",
    });
    const publishEdit = vi.fn(async () => {
      throw stale;
    });
    const { origin } = await startApi({
      revision: () => "revision-2",
      publishEdit,
    });
    const response = await fetch(`${origin}/api/editor/glossary/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: "Edited",
        expectedSourceRevision: "revision-1",
      }),
    });
    expect(response.status).toBe(409);
    expect((await response.json()).error.details).toMatchObject({
      currentSourceRevision: "revision-2",
      confirmed: { sourceRevision: "revision-2" },
    });
    expect(publishEdit).toHaveBeenCalledTimes(1);
  });

  it("reports failed publication and leaves the loaded catalog unchanged", async () => {
    const entries = fixtureEntries();
    const publishEdit = vi.fn(async () => {
      throw Object.assign(new Error("disk failed"), {
        code: "PUBLICATION_FAILED",
      });
    });
    const { origin } = await startApi({ entries, publishEdit });
    const response = await fetch(`${origin}/api/editor/glossary/${FIRST_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        definition: "Edited",
        expectedSourceRevision: "revision-1",
      }),
    });
    expect(response.status).toBe(500);
    expect(entries).toEqual(fixtureEntries());
  });
});
