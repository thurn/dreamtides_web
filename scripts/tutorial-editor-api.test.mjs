import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import { createTutorialEditorApiMiddleware } from "./tutorial-editor-api.mjs";
import {
  readTutorialConfiguration,
  serializeTutorialToml,
} from "./tutorial-data.mjs";

const servers = [];
const EXPECTED_PLAYER_DRAWS = [
  "4408b942-09a0-4f4e-a403-10c708c6e3c5",
  "647f5150-b2e0-424b-9480-27557642524e",
  "5ab11bef-5dcd-49f5-be49-ae2ccde76e70",
  "944e15d2-d680-4ebe-8d18-36826f4b1535",
  "910b4cf9-dec7-4e03-af4f-7d5ae342eeba",
];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function startApi(rootDir) {
  const middleware = createTutorialEditorApiMiddleware({ rootDir });
  const server = createServer((req, res) => {
    middleware(req, res, () => {
      res.writeHead(404).end();
    });
  });
  servers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function fixtureRoot() {
  const rootDir = mkdtempSync(join(tmpdir(), "tutorial-editor-api-"));
  mkdirSync(join(rootDir, "data"), { recursive: true });
  const configuration = readTutorialConfiguration();
  const actions = [
    {
      id: "old",
      action: "display-speech-bubble",
      speechBubble: {
        speaker: "mira",
        duration: 3,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 700,
        text: "Old.",
      },
      wait: 0,
    },
  ];
  const triggers = configuration.triggers.filter(
    (trigger) => trigger.id === "support",
  );
  writeFileSync(
    join(rootDir, "data", "tutorial.toml"),
    serializeTutorialToml(
      actions,
      triggers,
      configuration.battle,
      configuration.journeyStart,
      configuration.dreamscape,
      configuration.atlas,
      configuration.draft,
      configuration.purge,
      configuration.dreamsignRevelation,
      configuration.battleStart,
    ),
  );
  return rootDir;
}

describe("tutorial editor api", () => {
  it("loads and atomically replaces the complete ordered action list", async () => {
    const rootDir = fixtureRoot();
    const origin = await startApi(rootDir);
    const loaded = await fetch(`${origin}/api/editor/tutorial`).then(
      (response) => response.json(),
    );
    expect(loaded.actions[0].id).toBe("old");
    expect(loaded.triggers.map((trigger) => trigger.id)).toEqual(["support"]);
    expect(loaded.battle.playerDraws).toEqual(EXPECTED_PLAYER_DRAWS);
    expect(loaded.battleStart.firstBattle.speechBubble.delay).toBe(1);
    expect(loaded.battleStart.secondBattle.speechBubble.delay).toBe(1);
    expect(loaded.purge.speechBubble.text.length).toBeGreaterThan(0);

    const actions = [
      {
        id: "second",
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 0.5,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "Second.",
        },
        wait: 0.5,
      },
      {
        id: "first",
        action: "display-speech-bubble",
        speechBubble: {
          speaker: "mira",
          duration: 2,
          horizontalOffset: 0,
          verticalOffset: 0,
          bubbleWidth: 700,
          text: "First.",
        },
        wait: 2,
      },
    ];
    const savedResponse = await fetch(`${origin}/api/editor/tutorial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actions }),
    });
    expect(savedResponse.status).toBe(200);
    expect((await savedResponse.json()).actions).toEqual(actions);
    expect(
      parse(
        readFileSync(join(rootDir, "data", "tutorial.toml"), "utf8"),
      ),
    ).toMatchObject({
      actions,
      journeyStart: loaded.journeyStart,
      dreamscape: loaded.dreamscape,
      atlas: loaded.atlas,
      draft: loaded.draft,
      purge: loaded.purge,
      dreamsignRevelation: loaded.dreamsignRevelation,
      battleStart: loaded.battleStart,
      triggers: loaded.triggers,
      battle: loaded.battle,
    });
    expect(
      JSON.parse(
        readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8"),
      ),
    ).toMatchObject({
      actions,
      journeyStart: loaded.journeyStart,
      dreamscape: loaded.dreamscape,
      atlas: loaded.atlas,
      draft: loaded.draft,
      purge: loaded.purge,
      dreamsignRevelation: loaded.dreamsignRevelation,
      battleStart: loaded.battleStart,
      triggers: loaded.triggers,
      battle: loaded.battle,
    });
  });

  it("rejects invalid actions without changing tutorial.toml", async () => {
    const rootDir = fixtureRoot();
    const original = readFileSync(
      join(rootDir, "data", "tutorial.toml"),
      "utf8",
    );
    const origin = await startApi(rootDir);
    const response = await fetch(`${origin}/api/editor/tutorial`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        actions: [
          {
            id: "bad",
            action: "display-speech-bubble",
            speechBubble: { text: "" },
            wait: 3,
          },
        ],
      }),
    });
    expect(response.status).toBe(400);
    expect(
      readFileSync(join(rootDir, "data", "tutorial.toml"), "utf8"),
    ).toBe(original);
  });
});
