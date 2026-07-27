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
  validateTutorialBattleConfiguration,
  validateTutorialTriggers,
} from "./tutorial-data.mjs";

const FIXTURE_BATTLE = {
  playerDraws: ["5a980eff-6ec7-44d8-9977-b98e66bbc2c8"],
  enemyDraws: ["a526fa7b-5cef-4da9-a3f2-27ee0bd9b481"],
  dreamwellDraws: ["7171ff89-ebe4-42d0-8863-9b4b0531cad2"],
  aiActionOverrides: [
    {
      id: "play-card-after-dreamwell",
      trigger: {
        kind: "after-dreamwell",
        side: "enemy",
        cardId: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
      },
      action: {
        kind: "play-card",
        cardId: "a526fa7b-5cef-4da9-a3f2-27ee0bd9b481",
      },
    },
  ],
};

const FIXTURE_ACTIONS = [
  {
    id: "opening-line",
    action: "display-speech-bubble",
    speechBubble: {
      speaker: "mira",
      duration: 1.5,
      verticalOffset: 100,
      bubbleWidth: 650,
      text:
        "First [yellow]line[/yellow].\nAn [purple]event[purple] resolves once.",
    },
    wait: 1.5,
  },
  {
    id: "dream-avatar-arrival",
    action: "animate-dream-avatar-portrait",
    owner: "player",
    pause: 1,
    duration: 0.6,
    wait: 0,
  },
  {
    id: "opponent-draw",
    action: "draw-opponent-card",
    cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    wait: 0.5,
  },
  {
    id: "opponent-reveal-and-play",
    action: "reveal-and-play-opponent-card",
    cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    revealDuration: 2,
    speechBubble: {
      speaker: "mira",
      duration: 2,
      verticalOffset: 20,
      bubbleWidth: 450,
      text: "This card has a ▸Dawn ability.",
    },
    wait: 0,
  },
  {
    id: "opponent-reposition",
    action: "reposition-opponent-character",
    cardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    wait: 0,
  },
  {
    id: "how-to-play",
    action: "display-how-to-play",
    trigger: "player-turn-announcement-complete",
    cardWidth: 650,
    text: "Play characters to [yellow]challenge[/yellow] and score points (⍟).\n\nScore 10⍟ to win.",
    wait: 0,
  },
  {
    id: "end-turn",
    action: "end-turn",
    wait: 0,
  },
  {
    id: "player-block",
    action: "reposition-player-character",
    cardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    opposingCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    wait: 0,
  },
  {
    id: "resolve-challenge",
    action: "resolve-challenge",
    challengerCardId: "229ab3a1-3720-41a2-924c-8fe112188f8e",
    defenderCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    wait: 0,
  },
];

describe("tutorial data", () => {
  it("round-trips typed actions through TOML and generated JSON", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tutorial-data-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "tabula", "tutorial.toml"),
      serializeTutorialToml(FIXTURE_ACTIONS, [], FIXTURE_BATTLE),
    );

    expect(readTutorialActions({ rootDir })).toEqual(FIXTURE_ACTIONS);
    const result = refreshTutorialDataJson({ rootDir });
    expect(result.actions).toEqual(FIXTURE_ACTIONS);
    expect(result.battle).toEqual(FIXTURE_BATTLE);
    expect(
      JSON.parse(
        readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8"),
      ),
    ).toEqual({
      actions: FIXTURE_ACTIONS,
      triggers: [],
      battle: FIXTURE_BATTLE,
    });
    expect(
      parse(serializeTutorialToml(FIXTURE_ACTIONS, [], FIXTURE_BATTLE)),
    ).toMatchObject({
      actions: FIXTURE_ACTIONS,
      battle: FIXTURE_BATTLE,
    });
  });

  it("validates UUID-authored battle draw lists", () => {
    expect(validateTutorialBattleConfiguration(FIXTURE_BATTLE)).toEqual(
      FIXTURE_BATTLE,
    );
    expect(() =>
      validateTutorialBattleConfiguration({
        ...FIXTURE_BATTLE,
        playerDraws: ["Card Name"],
      }),
    ).toThrow(/array of card UUIDs/u);
    expect(() =>
      validateTutorialBattleConfiguration({
        ...FIXTURE_BATTLE,
        dreamwellDraws: [
          FIXTURE_BATTLE.dreamwellDraws[0],
          FIXTURE_BATTLE.dreamwellDraws[0],
        ],
      }),
    ).toThrow(/must not repeat/u);
    expect(() =>
      validateTutorialBattleConfiguration({
        ...FIXTURE_BATTLE,
        aiActionOverrides: [
          FIXTURE_BATTLE.aiActionOverrides[0],
          FIXTURE_BATTLE.aiActionOverrides[0],
        ],
      }),
    ).toThrow(/duplicated/u);
  });

  it("rejects duplicate ids, blank speech, and negative timings", () => {
    expect(() =>
      validateTutorialActions([...FIXTURE_ACTIONS, ...FIXTURE_ACTIONS]),
    ).toThrow(/duplicated/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: { ...FIXTURE_ACTIONS[0].speechBubble, text: "  " },
        },
      ]),
    ).toThrow(/speech bubble text/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[0], wait: -1 }]),
    ).toThrow(/non-negative wait/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: {
            ...FIXTURE_ACTIONS[0].speechBubble,
            speaker: "spectator",
          },
        },
      ]),
    ).toThrow(/Mira, the player, or the enemy/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: {
            ...FIXTURE_ACTIONS[0].speechBubble,
            verticalOffset: Number.NaN,
          },
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: {
            ...FIXTURE_ACTIONS[0].speechBubble,
            bubbleWidth: 150,
          },
        },
      ]),
    ).toThrow(/speech bubble width from 300 to 700 pixels/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: {
            ...FIXTURE_ACTIONS[0].speechBubble,
            duration: -1,
          },
        },
      ]),
    ).toThrow(/non-negative speech bubble duration/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[0],
          speechBubble: {
            ...FIXTURE_ACTIONS[0].speechBubble,
            text: "A [yellow]blocked character.",
          },
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
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
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[3],
          speechBubble: {
            ...FIXTURE_ACTIONS[3].speechBubble,
            verticalOffset: Number.NaN,
          },
        },
      ]),
    ).toThrow(/finite speech bubble vertical offset/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[3],
          speechBubble: {
            ...FIXTURE_ACTIONS[3].speechBubble,
            bubbleWidth: 750,
          },
        },
      ]),
    ).toThrow(/speech bubble width from 300 to 700 pixels/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[4], cardId: "Twilight Troubadour" },
      ]),
    ).toThrow(/by UUID/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[7], opposingCardId: "Twilight Troubadour" },
      ]),
    ).toThrow(/by UUID/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[8], challengerCardId: "Twilight Troubadour" },
      ]),
    ).toThrow(/by UUID/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[8],
          defenderCardId: FIXTURE_ACTIONS[8].challengerCardId,
        },
      ]),
    ).toThrow(/two different/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[5], text: " " }]),
    ).toThrow(/How to Play text/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[5], trigger: "after-card-name" },
      ]),
    ).toThrow(/supported How to Play trigger/u);
    expect(() =>
      validateTutorialActions([
        { ...FIXTURE_ACTIONS[5], companion: "named-card" },
      ]),
    ).toThrow(/supported How to Play companion/u);
    expect(() =>
      validateTutorialActions([{ ...FIXTURE_ACTIONS[5], cardWidth: 0 }]),
    ).toThrow(/How to Play card width of at least 300 pixels/u);
    expect(() =>
      validateTutorialActions([
        {
          id: "blank-end-turn-speech",
          action: "end-turn",
          speechBubble: { text: " " },
          wait: 0,
        },
      ]),
    ).toThrow(/speech bubble text/u);
    expect(() =>
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[5],
          text: "Position a character to [yellow]challenge.",
        },
      ]),
    ).toThrow(/unclosed yellow highlight/u);
  });

  it("preserves a Dreamwell companion on How to Play actions", () => {
    expect(
      validateTutorialActions([
        {
          ...FIXTURE_ACTIONS[5],
          companion: "dreamwell-card",
        },
      ]),
    ).toEqual([
      {
        ...FIXTURE_ACTIONS[5],
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
          action: "animate-dream-avatar-portrait",
          wait: 0,
        },
      ]),
    ).toEqual([
      {
        id: "legacy-arrival",
        action: "animate-dream-avatar-portrait",
        owner: "player",
        pause: 0,
        duration: 1.2,
        wait: 0,
      },
    ]);
  });

  it("normalizes and serializes every trigger speech bubble option", () => {
    const triggers = validateTutorialTriggers([
      {
        id: "support",
        on: ["card-play", "dreamwell-resolve"],
        priority: 100,
        speaker: "enemy",
        duration: 5,
        verticalOffset: 30,
        bubbleWidth: 300,
        match: { kind: "glossary", id: "support" },
        text: "A character with [yellow]support[/yellow] helps the characters in front of it.",
      },
    ]);
    expect(triggers[0]).toMatchObject({
      speaker: "enemy",
      duration: 5,
      verticalOffset: 30,
      bubbleWidth: 300,
    });
    expect(
      parse(serializeTutorialToml(FIXTURE_ACTIONS, triggers, FIXTURE_BATTLE))
        .triggers,
    )
      .toEqual(triggers);
  });
});
