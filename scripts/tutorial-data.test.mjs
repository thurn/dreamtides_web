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
  validateTutorialAtlasConfiguration,
  validateTutorialBattleConfiguration,
  validateTutorialBattleStartConfiguration,
  validateTutorialDreamscapeConfiguration,
  validateTutorialSiteConfiguration,
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

const FIXTURE_JOURNEY_START = {
  speechBubble: {
    speaker: "mira",
    horizontalOffset: 40,
    verticalOffset: 0,
    bubbleWidth: 550,
    text: "Choose a [purple]Dream Avatar[/purple].",
  },
};

const FIXTURE_DREAMSCAPE = {
  speechBubble: {
    speaker: "mira",
    delay: 2,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 700,
    text: "Visit [purple]Dream Sites[/purple].",
  },
};

const FIXTURE_ATLAS = {
  speechBubble: {
    speaker: "mira",
    delay: 1,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 700,
    text: "Choose the next [purple]dream[/purple].",
  },
};

const FIXTURE_SITE_TUTORIAL = {
  speechBubble: {
    speaker: "mira",
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 600,
    text: "Visit a [purple]site[/purple].",
  },
};

const FIXTURE_BATTLE_START = {
  firstBattle: {
    speechBubble: {
      speaker: "mira",
      delay: 1,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      text: "Review the first opponent.",
    },
  },
  secondBattle: {
    speechBubble: {
      speaker: "mira",
      delay: 1,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 700,
      text: "Prepare for the second battle.",
    },
  },
};

const FIXTURE_ACTIONS = [
  {
    id: "opening-line",
    action: "display-speech-bubble",
    speechBubble: {
      speaker: "mira",
      duration: 1.5,
      horizontalOffset: 0,
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
      horizontalOffset: 30,
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
    blockerCardId: "e83014d3-9d35-4e80-a1b3-9b25360ad2af",
    wait: 0,
  },
];

describe("tutorial data", () => {
  it("normalizes persistent dreamscape guidance and rejects invalid delays", () => {
    expect(
      validateTutorialDreamscapeConfiguration(FIXTURE_DREAMSCAPE),
    ).toEqual(FIXTURE_DREAMSCAPE);
    expect(() =>
      validateTutorialDreamscapeConfiguration({
        speechBubble: {
          ...FIXTURE_DREAMSCAPE.speechBubble,
          delay: -1,
        },
      }),
    ).toThrow(/non-negative delay/u);
  });

  it("normalizes persistent Atlas guidance", () => {
    expect(validateTutorialAtlasConfiguration(FIXTURE_ATLAS)).toEqual(
      FIXTURE_ATLAS,
    );
  });

  it("normalizes persistent first-visit site guidance", () => {
    expect(
      validateTutorialSiteConfiguration(FIXTURE_SITE_TUTORIAL, "draft"),
    ).toEqual(FIXTURE_SITE_TUTORIAL);
    expect(() =>
      validateTutorialSiteConfiguration(
        {
          speechBubble: {
            ...FIXTURE_SITE_TUTORIAL.speechBubble,
            speaker: "enemy",
          },
        },
        "draft",
      ),
    ).toThrow(/must target Mira/u);
  });

  it("normalizes persistent second-battle guidance", () => {
    expect(
      validateTutorialBattleStartConfiguration(FIXTURE_BATTLE_START),
    ).toEqual(FIXTURE_BATTLE_START);
  });

  it("round-trips typed actions through TOML and generated JSON", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "tutorial-data-"));
    mkdirSync(join(rootDir, "data", "tabula"), { recursive: true });
    writeFileSync(
      join(rootDir, "data", "tabula", "tutorial.toml"),
      serializeTutorialToml(
        FIXTURE_ACTIONS,
        [],
        FIXTURE_BATTLE,
        FIXTURE_JOURNEY_START,
        FIXTURE_DREAMSCAPE,
        FIXTURE_ATLAS,
        FIXTURE_SITE_TUTORIAL,
        FIXTURE_SITE_TUTORIAL,
        FIXTURE_BATTLE_START,
      ),
    );

    expect(readTutorialActions({ rootDir })).toEqual(FIXTURE_ACTIONS);
    const result = refreshTutorialDataJson({ rootDir });
    expect(result.actions).toEqual(FIXTURE_ACTIONS);
    expect(result.battle).toEqual(FIXTURE_BATTLE);
    expect(result.journeyStart).toEqual(FIXTURE_JOURNEY_START);
    expect(result.dreamscape).toEqual(FIXTURE_DREAMSCAPE);
    expect(result.atlas).toEqual(FIXTURE_ATLAS);
    expect(result.draft).toEqual(FIXTURE_SITE_TUTORIAL);
    expect(result.dreamsignRevelation).toEqual(FIXTURE_SITE_TUTORIAL);
    expect(result.battleStart).toEqual(FIXTURE_BATTLE_START);
    expect(
      JSON.parse(
        readFileSync(join(rootDir, "public", "tutorial-data.json"), "utf8"),
      ),
    ).toEqual({
      journeyStart: FIXTURE_JOURNEY_START,
      dreamscape: FIXTURE_DREAMSCAPE,
      atlas: FIXTURE_ATLAS,
      draft: FIXTURE_SITE_TUTORIAL,
      dreamsignRevelation: FIXTURE_SITE_TUTORIAL,
      battleStart: FIXTURE_BATTLE_START,
      actions: FIXTURE_ACTIONS,
      triggers: [],
      battle: FIXTURE_BATTLE,
    });
    expect(
      parse(
        serializeTutorialToml(
          FIXTURE_ACTIONS,
          [],
          FIXTURE_BATTLE,
          FIXTURE_JOURNEY_START,
          FIXTURE_DREAMSCAPE,
          FIXTURE_ATLAS,
          FIXTURE_SITE_TUTORIAL,
          FIXTURE_SITE_TUTORIAL,
          FIXTURE_BATTLE_START,
        ),
      ),
    ).toMatchObject({
      journeyStart: FIXTURE_JOURNEY_START,
      dreamscape: FIXTURE_DREAMSCAPE,
      atlas: FIXTURE_ATLAS,
      draft: FIXTURE_SITE_TUTORIAL,
      dreamsignRevelation: FIXTURE_SITE_TUTORIAL,
      battleStart: FIXTURE_BATTLE_START,
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
    expect(() =>
      validateTutorialBattleConfiguration({
        ...FIXTURE_BATTLE,
        aiActionOverrides: [{
          ...FIXTURE_BATTLE.aiActionOverrides[0],
          trigger: {
            ...FIXTURE_BATTLE.aiActionOverrides[0].trigger,
            cardId: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
          },
        }],
      }),
    ).toThrow(/must appear in dreamwellDraws/u);
    expect(() =>
      validateTutorialBattleConfiguration({
        ...FIXTURE_BATTLE,
        aiActionOverrides: [{
          ...FIXTURE_BATTLE.aiActionOverrides[0],
          action: {
            kind: "play-card",
            cardId: "00000000-0000-4000-8000-000000000101",
          },
        }],
      }),
    ).toThrow(/registered semantic play automation/u);
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
          blockerCardId: FIXTURE_ACTIONS[8].challengerCardId,
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
        on: ["card-seen", "card-play", "dreamwell-resolve"],
        priority: 100,
        delay: { "card-seen": 1 },
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
      delay: { "card-seen": 1 },
      duration: 5,
      verticalOffset: 30,
      bubbleWidth: 300,
    });
    expect(
      parse(
        serializeTutorialToml(
          FIXTURE_ACTIONS,
          triggers,
          FIXTURE_BATTLE,
          FIXTURE_JOURNEY_START,
          FIXTURE_DREAMSCAPE,
          FIXTURE_ATLAS,
          FIXTURE_SITE_TUTORIAL,
          FIXTURE_SITE_TUTORIAL,
          FIXTURE_BATTLE_START,
        ),
      )
        .triggers,
    )
      .toEqual(triggers);
    expect(() =>
      validateTutorialTriggers([
        {
          id: "bad-delay-event",
          on: ["card-play"],
          delay: { "card-seen": 1 },
          duration: 3,
          match: { kind: "glossary", id: "support" },
          text: "No.",
        },
      ]),
    ).toThrow(/delay must reference one of its trigger events/u);
  });

  it("normalizes a UUID-matched no-valid-targets trigger", () => {
    const cardId = "4408b942-09a0-4f4e-a403-10c708c6e3c5";
    expect(
      validateTutorialTriggers([{
        id: "flashpoint-no-valid-targets",
        on: ["card-no-valid-targets"],
        priority: 10,
        duration: 4,
        bubbleWidth: 500,
        match: { kind: "card-id", cardId },
        text: "There are no valid targets for this card",
      }]),
    ).toEqual([{
      id: "flashpoint-no-valid-targets",
      on: ["card-no-valid-targets"],
      priority: 10,
      speaker: "mira",
      duration: 4,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 500,
      match: { kind: "card-id", cardId },
      text: "There are no valid targets for this card",
    }]);
  });
});
