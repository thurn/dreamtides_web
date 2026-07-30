import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import { createTutorialEditorApiMiddleware } from "./tutorial-editor-api.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) => new Promise((resolve) => server.close(resolve)),
    ),
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
  mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
  writeFileSync(
    join(rootDir, "data", "tabula", "tutorial.toml"),
    '[journeyStart.speechBubble]\nspeaker = "mira"\nhorizontalOffset = 40\nverticalOffset = 0\nbubbleWidth = 550\ntext = "Choose a [purple]Dream Avatar[/purple]."\n\n[dreamscape.speechBubble]\nspeaker = "mira"\ndelay = 2\nhorizontalOffset = 0\nverticalOffset = 0\nbubbleWidth = 700\ntext = "Visit [purple]Dream Sites[/purple]."\n\n[atlas.speechBubble]\nspeaker = "mira"\ndelay = 1\nhorizontalOffset = 0\nverticalOffset = 0\nbubbleWidth = 700\ntext = "Choose the next [purple]dream[/purple]."\n\n[draft.speechBubble]\nspeaker = "mira"\nhorizontalOffset = 0\nverticalOffset = 0\nbubbleWidth = 600\ntext = "Draft a card."\n\n[dreamsignRevelation.speechBubble]\nspeaker = "mira"\nhorizontalOffset = 0\nverticalOffset = 0\nbubbleWidth = 600\ntext = "Choose a Dreamsign."\n\n[battle]\nplayerDraws = ["5a980eff-6ec7-44d8-9977-b98e66bbc2c8"]\nenemyDraws = ["a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"]\ndreamwellDraws = ["7171ff89-ebe4-42d0-8863-9b4b0531cad2"]\n\n[[actions]]\nid = "old"\naction = "display-speech-bubble"\nspeechBubble = { speaker = "mira", duration = 3, horizontalOffset = 0, verticalOffset = 0, bubbleWidth = 700, text = "Old." }\nwait = 0\n\n[[triggers]]\nid = "support"\non = ["card-play"]\npriority = 100\nduration = 3\nmatch = { kind = "glossary", id = "support" }\ntext = "Support."\n',
  );
  return rootDir;
}

describe("tutorial editor api", () => {
  it("loads and atomically replaces the complete ordered action list", async () => {
    const rootDir = fixtureRoot();
    const origin = await startApi(rootDir);
    const loaded = await fetch(`${origin}/api/editor/tutorial`).then((response) =>
      response.json(),
    );
    expect(loaded.actions[0].id).toBe("old");
    expect(loaded.triggers.map((trigger) => trigger.id)).toEqual(["support"]);
    expect(loaded.battle.playerDraws).toEqual([
      "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
    ]);

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
      parse(readFileSync(join(rootDir, "data", "tabula", "tutorial.toml"), "utf8")),
    ).toMatchObject({
      actions,
      journeyStart: {
        speechBubble: {
          horizontalOffset: 40,
          bubbleWidth: 550,
        },
      },
      dreamscape: {
        speechBubble: {
          delay: 2,
          text: "Visit [purple]Dream Sites[/purple].",
        },
      },
      atlas: {
        speechBubble: {
          delay: 1,
          text: "Choose the next [purple]dream[/purple].",
        },
      },
      draft: {
        speechBubble: {
          bubbleWidth: 600,
          text: "Draft a card.",
        },
      },
      dreamsignRevelation: {
        speechBubble: {
          bubbleWidth: 600,
          text: "Choose a Dreamsign.",
        },
      },
      triggers: [{ id: "support" }],
      battle: {
        playerDraws: ["5a980eff-6ec7-44d8-9977-b98e66bbc2c8"],
      },
    });
    expect(
      JSON.parse(readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8")),
    ).toMatchObject({
      actions,
      journeyStart: {
        speechBubble: {
          horizontalOffset: 40,
          bubbleWidth: 550,
        },
      },
      dreamscape: {
        speechBubble: {
          delay: 2,
          text: "Visit [purple]Dream Sites[/purple].",
        },
      },
      atlas: {
        speechBubble: {
          delay: 1,
          text: "Choose the next [purple]dream[/purple].",
        },
      },
      draft: {
        speechBubble: {
          bubbleWidth: 600,
          text: "Draft a card.",
        },
      },
      dreamsignRevelation: {
        speechBubble: {
          bubbleWidth: 600,
          text: "Choose a Dreamsign.",
        },
      },
      triggers: [{ id: "support" }],
      battle: {
        playerDraws: ["5a980eff-6ec7-44d8-9977-b98e66bbc2c8"],
      },
    });
  });

  it("rejects invalid actions without changing tutorial.toml", async () => {
    const rootDir = fixtureRoot();
    const original = readFileSync(join(rootDir, "data", "tabula", "tutorial.toml"), "utf8");
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
    expect(readFileSync(join(rootDir, "data", "tabula", "tutorial.toml"), "utf8")).toBe(
      original,
    );
  });
});
