// @vitest-environment node

import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createExplorationEditorApiMiddleware,
  refreshExplorationLocalizationArtifacts,
} from "./exploration-editor-api.mjs";
import { EXPLORATION_EFFECT_SCHEMAS } from "./exploration-editor-schema.mjs";

const FIXTURE_CARD_ID = "161482b6-af07-4d9e-822d-8c738672beb9";
const FIXTURE_ACTION_ID = "6662e7ce-9ea7-49bf-85fe-4bbe6728f282";

function editorDataFixture() {
  return {
    encounters: [
      {
        cardId: FIXTURE_CARD_ID,
        prose: "Fixture prose",
        actions: [
          {
            id: FIXTURE_ACTION_ID,
            label: "Fixture action",
            effectKind: "gain-offered-card",
            canonicalMechanicId: "gain-card",
            selectionPolicyId: "card-fit-quality",
            predicate: "cheap-character",
            renderedEffectText: "Derived from typed effect",
            renderedEffectParts: [],
            runtimeCardSelections: [],
          },
        ],
      },
    ],
    cards: [{ id: FIXTURE_CARD_ID }],
    dreamsigns: [],
    effectSchemas: EXPLORATION_EFFECT_SCHEMAS,
    predicates: [],
    transfigurations: [],
    subtypes: [],
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
    body: "",
    writeHead(status) {
      this.status = status;
    },
    end(body = "") {
      this.body = body;
    },
  };
}

describe("exploration editor API", () => {
  const middleware = createExplorationEditorApiMiddleware({
    rootDir: process.cwd(),
    readData: editorDataFixture,
  });

  async function call(method, url, body) {
    const res = response();
    const next = vi.fn();
    await middleware(request(method, url, body), res, next);
    return {
      status: res.status,
      body: res.body === "" ? null : JSON.parse(res.body),
      next,
    };
  }

  it("loads action-local presentation and the typed editor schema", async () => {
    const result = await call("GET", "/api/editor/exploration");
    expect(result.status).toBe(200);
    expect(result.body.encounters.length).toBeGreaterThan(0);
    expect(result.body.effectSchemas).toHaveLength(65);
    expect(result.body).not.toHaveProperty("templates");
    expect(result.body.sourceRevision).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("validates Trox source inside the staged publication root", () => {
    const copy = vi.fn();
    const runTroxCommand = vi.fn();

    refreshExplorationLocalizationArtifacts({
      rootDir: "/quest",
      stageRoot: "/stage",
      copy,
      runTroxCommand,
    });

    expect(copy.mock.calls).toEqual([
      ["/quest/localization", "/stage/localization", { recursive: true }],
      ["/quest/trox.ron", "/stage/trox.ron"],
    ]);
    expect(runTroxCommand.mock.calls).toEqual([
      [
        ["extract"],
        {
          configPath: "/stage/trox.ron",
          cwd: "/stage",
        },
      ],
      [
        ["check", "--deny", "warnings"],
        {
          configPath: "/stage/trox.ron",
          cwd: "/stage",
        },
      ],
    ]);
  });

  it("publishes prose after isolated Trox validation", async () => {
    const cardId = "161482b6-af07-4d9e-822d-8c738672beb9";
    const readData = vi.fn(() => ({
      encounters: [{ cardId, prose: "Fixture prose", actions: [] }],
      cards: [],
      dreamsigns: [],
      effectSchemas: [],
      predicates: [],
      transfigurations: [],
      subtypes: [],
    }));
    const refreshLocalizationArtifacts = vi.fn();
    const publishEdit = vi.fn(async (options) => {
      options.prepareDerivedArtifacts({ stageRoot: "/stage" });
      return { sourceRevision: "next-revision" };
    });
    const isolated = createExplorationEditorApiMiddleware({
      rootDir: process.cwd(),
      readData,
      publishEdit,
      refreshLocalizationArtifacts,
    });
    const res = response();
    await isolated(
      request("PATCH", `/api/editor/exploration/encounters/${cardId}`, {
        value: "Revised fixture prose",
        expectedSourceRevision: "revision",
      }),
      res,
      vi.fn(),
    );

    expect(res.status).toBe(200);
    expect(publishEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: "exploration",
        operations: [
          {
            operation: "set_encounter_prose",
            card_id: cardId,
            prose: "Revised fixture prose",
          },
        ],
      }),
    );
    expect(refreshLocalizationArtifacts).toHaveBeenCalledWith({
      rootDir: process.cwd(),
      stageRoot: "/stage",
    });
  });

  it("rejects removed template routes and malformed mutations", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const cardId = loaded.body.encounters[0].cardId;
    expect(await call("POST", "/api/editor/exploration")).toMatchObject({
      status: 405,
      body: { error: { code: "METHOD_NOT_ALLOWED" } },
    });
    expect(
      await call("PATCH", "/api/editor/exploration/templates/1", {}),
    ).toMatchObject({
      status: 404,
      body: { error: { code: "INVALID_API_PATH" } },
    });
    expect(
      await call("PATCH", "/api/editor/exploration/encounters/not-a-uuid", {}),
    ).toMatchObject({ status: 400, body: { error: { code: "INVALID_EDIT" } } });
    expect(
      await call(
        "PATCH",
        `/api/editor/exploration/encounters/${cardId}/actions/9`,
        {},
      ),
    ).toMatchObject({ status: 400, body: { error: { code: "INVALID_EDIT" } } });
  });

  it("rejects unknown action references before staging an edit", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "gain-card",
      cardId: "00000000-0000-4000-8000-000000000099",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_REFERENCE" } },
    });
  });

  it("rejects malformed automatic multi-card transfigurations before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "transfigure-random-cards",
      predicate: "event",
      count: 2,
      followupTitle: "Choose cards",
      followupSubtitle: "Choose cards",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_EFFECT_FIELD" } },
    });
  });

  it("rejects malformed Wave7 deck-mutation edits before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    for (const action of [
      {
        ...encounter.actions[0],
        effectKind: "replace-random-with-card",
        predicate: "legendary",
        cardId: undefined,
      },
      {
        ...encounter.actions[0],
        effectKind: "change-card-type-selected",
        cardType: "Event",
        deckTarget: "random",
      },
    ]) {
      const result = await call(
        "PATCH",
        `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
        { action, expectedSourceRevision: loaded.body.sourceRevision },
      );

      expect(result).toMatchObject({
        status: 400,
        body: { error: { code: "INVALID_EFFECT_FIELD" } },
      });
    }
  });

  it("rejects malformed Wave8 compound edits before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "take-transfigured-cards-and-gain-nightmares",
      predicate: "event",
      offerCount: 3,
      transfiguration: "Inspired",
      nightmareCount: 1,
      followupTitle: "Choose rewards",
      followupSubtitle: "Take any number of cards",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );
    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_EFFECT_FIELD" } },
    });
  });

  it("rejects malformed fixed-site edits before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "add-fixed-site",
      siteType: "UnknownSite",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_EFFECT_FIELD" } },
    });
  });

  it("rejects malformed site-type chooser edits before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "choose-site-type",
      offerCount: 2,
      followupTitle: "Choose a destination",
      followupSubtitle: "Choose one of the offered destinations",
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_EFFECT_FIELD" } },
    });
  });

  it("rejects malformed shop purchase modifier edits before staging", async () => {
    const loaded = await call("GET", "/api/editor/exploration");
    const encounter = loaded.body.encounters[0];
    const action = {
      ...encounter.actions[0],
      effectKind: "lose-half-essence-and-free-purchases",
      count: 0,
    };
    const result = await call(
      "PATCH",
      `/api/editor/exploration/encounters/${encounter.cardId}/actions/0`,
      { action, expectedSourceRevision: loaded.body.sourceRevision },
    );

    expect(result).toMatchObject({
      status: 400,
      body: { error: { code: "INVALID_EFFECT_FIELD" } },
    });
  });
});
