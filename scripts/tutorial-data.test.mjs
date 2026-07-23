import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "smol-toml";
import {
  readTutorialActions,
  refreshTutorialDataJson,
  serializeTutorialToml,
  validateTutorialActions,
} from "./tutorial-data.mjs";

const FIXTURE_ACTIONS = [
  {
    id: "opening-line",
    action: "display-speech-bubble",
    speaker: "mira",
    text: "First line.\nSecond line.",
    wait: 1.5,
  },
  {
    id: "dreamcaller-arrival",
    action: "animate-dreamcaller-portrait",
    owner: "player",
    pause: 1,
    duration: 0.6,
    wait: 0,
  },
  {
    id: "opponent-draw",
    action: "draw-opponent-card",
    wait: 0.5,
  },
  {
    id: "opponent-reveal-and-play",
    action: "reveal-and-play-opponent-card",
    revealDuration: 2,
    wait: 0,
  },
  {
    id: "how-to-play",
    action: "display-how-to-play",
    trigger: "player-turn-announcement-complete",
    text: "Play characters to score points (⍟).\n\nScore 10 ⍟ to win.",
    wait: 0,
  },
  {
    id: "end-turn",
    action: "end-turn",
    wait: 0,
  },
];

describe("tutorial data", () => {
  it("round-trips typed actions through TOML and generated JSON", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tutorial-data-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "tabula", "tutorial.toml"),
      serializeTutorialToml(FIXTURE_ACTIONS),
    );

    expect(readTutorialActions({ rootDir })).toEqual(FIXTURE_ACTIONS);
    const result = refreshTutorialDataJson({ rootDir });
    expect(result.actions).toEqual(FIXTURE_ACTIONS);
    expect(
      JSON.parse(
        readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8"),
      ),
    ).toEqual({ actions: FIXTURE_ACTIONS });
    expect(parse(serializeTutorialToml(FIXTURE_ACTIONS)).actions).toEqual(
      FIXTURE_ACTIONS,
    );
  });

  it("rejects duplicate ids, blank speech, and negative timings", () => {
    expect(() =>
      validateTutorialActions([...FIXTURE_ACTIONS, ...FIXTURE_ACTIONS]),
    ).toThrow(/duplicated/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[0], text: "  " }]),
    ).toThrow(/speech text/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[0], wait: -1 }]),
    ).toThrow(/non-negative wait/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[0], speaker: "spectator" },
      ]),
    ).toThrow(/Mira, the player, or the enemy/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[1], pause: -1 }]),
    ).toThrow(/non-negative portrait pause/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[1], duration: -1 }]),
    ).toThrow(/non-negative portrait duration/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[3], revealDuration: -1 },
      ]),
    ).toThrow(/non-negative card reveal duration/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[4], text: " " }]),
    ).toThrow(/How to Play text/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[4], trigger: "after-card-name" },
      ]),
    ).toThrow(/supported How to Play trigger/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[4], companion: "named-card" },
      ]),
    ).toThrow(/supported How to Play companion/u);
  });

  it("preserves a Dreamwell companion on How to Play actions", () => {
    expect(
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[4],
          companion: "dreamwell-card",
        },
      ]),
    ).toEqual([
      {
        ...FIXTURE_ACTIONS[4],
        companion: "dreamwell-card",
      },
    ]);
  });

  it("validates UUID-authored Dreamwell draws", () => {
    expect(
      validateTutorialActions([
        {
          id: "autumn-glade",
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "autumn-glade",
        action: "draw-dreamwell-card",
        owner: "enemy",
        cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
        wait: 0,
      },
    ]);
    expect(() =>
      validateTutorialActions([
        {
          id: "named-card",
          action: "draw-dreamwell-card",
          owner: "enemy",
          cardId: "Autumn Glade",
          wait: 0,
        },
      ]),
    ).toThrow(/by UUID/u);
  });

  it("normalizes legacy portrait actions to the player with no pause", () => {
    expect(
      validateTutorialActions([
        {
          id: "legacy-arrival",
          action: "animate-dreamcaller-portrait",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "legacy-arrival",
        action: "animate-dreamcaller-portrait",
        owner: "player",
        pause: 0,
        duration: 1.2,
        wait: 0,
      },
    ]);
  });
});
