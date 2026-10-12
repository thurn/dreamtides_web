import { testJourneySeed } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { testAvatarId, testDreamsignId } from "../../types/test-identities";
import { testCardId } from "../../types/test-identities";
import { parseCardName, parseCardSubtype } from "../../types/card-identity";
import type { BattleDeckCardDefinition } from "../../battle/types";
import { journeyBattleOf, type JourneyBattleFoldState } from "../battle/fold";
import { AVATAR_ID, BATTLE_SITE_ID, clearReplayFixtureProviders, registerReplayFixtureProviders } from "../replay/fixture-providers";
import { GENESIS, ctx, event, apply } from "./lifecycle-fixtures";



afterEach(() => {
  registerJourneyLifecycleContentProvider(null);
});


describe("LOAD_STATE journey battles", () => {
  afterEach(() => {
    clearReplayFixtureProviders();
  });

  const CARD_DEFINITION: BattleDeckCardDefinition = {
    sourceDeckEntryId: null,
    cardId: testCardId("saved-battle-card"),
    cardNumber: 1,
    name: parseCardName("fixture card"),
    battleCardKind: "event",
    subtype: parseCardSubtype(""),
    energyCost: 0,
    printedEnergyCost: 0,
    printedSpark: 0,
    isFast: false,
    reclaimCost: null,
    renderedText: "",
    imageNumber: 1,
    transfiguration: null,
    isBane: false,
  };

  /**
   * A saved journey battle, JSON round-tripped as a save is: the fixture
   * battle suspended at the play prompt of the player's first card, with
   * every optional journey-side and engine-init field filled in and a slice
   * history. `state` is the battle's start, with no prompt pending.
   */
  function savedBattle(): { state: FoldState; battle: JourneyBattleFoldState } {
    registerReplayFixtureProviders();
    // The fixture journey offers only its Battle site under this seed.
    const fixtureGenesis = genesisFoldState({
      ...GENESIS,
      seed: testJourneySeed("fixture-battle"),
    });
    let state = apply(fixtureGenesis, "START_JOURNEY", { avatarId: AVATAR_ID });
    state = apply(state, "ENTER_SITE", { siteId: BATTLE_SITE_ID });
    state = apply(state, "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID });
    const card = journeyBattleOf(state.battle)?.engine.slice.committed.sides
      .player.hand[0];
    const played = journeyBattleOf(
      apply(state, "BATTLE_ACTION", {
        side: "player",
        action: { kind: "play", card, from: "hand" },
      }).battle,
    );
    if (played?.engine.slice.inFlight == null) {
      throw new Error("the fixture play opened no prompt");
    }
    const { init, engine } = played;
    const [entry, ...entries] = engine.init.decks.player;
    const { history: _history, ...slice } = engine.slice;
    const battle: JourneyBattleFoldState = {
      ...played,
      init: {
        ...init,
        enemyDescriptor: {
          ...init.enemyDescriptor,
          avatarId: testAvatarId("saved-battle-enemy"),
          dreamsigns: [
            {
              id: testDreamsignId("saved-battle-dreamsign"),
              name: "",
              effectDescription: "",
            },
          ],
          signatureCards: [
            {
              cardId: CARD_DEFINITION.cardId,
              cardNumber: 1,
              name: CARD_DEFINITION.name,
            },
          ],
        },
        avatarSummary: {
          id: AVATAR_ID,
          name: "",
          title: "",
          renderedText: "",
          imageNumber: "1",
          portraitFocus: { x: 0.5, y: 0.25 },
        },
        cardDefinitions: [CARD_DEFINITION],
      },
      engine: {
        init: {
          ...engine.init,
          decks: {
            ...engine.init.decks,
            player: [
              {
                ...entry,
                transfigurations: ["Kindled"],
                deckMods: {
                  sparkBonus: 1,
                  costReduction: 0,
                  fast: true,
                  reclaim: null,
                  typeChange: null,
                },
              },
              ...entries,
            ],
          },
          avatars: { enemy: testAvatarId("saved-battle-enemy") },
          dreamsigns: { enemy: [testDreamsignId("saved-battle-dreamsign")] },
          nextBattle: {
            player: {
              openingHand: [{ count: 1, filter: { cardType: "event" } }],
              startingEnergy: 1,
              smallerHandAndCostDiscount: [
                { openingHandDelta: -1, costReduction: 1 },
              ],
            },
          },
        },
        slice: {
          ...slice,
          history: {
            base: slice,
            entries: [
              {
                intent: {
                  kind: "battleAction",
                  side: "player",
                  action: { kind: "pass" },
                },
              },
              { attempt: 1 },
            ],
          },
        },
      },
    };
    return {
      state,
      battle: JSON.parse(JSON.stringify(battle)) as JourneyBattleFoldState,
    };
  }

  function load(state: FoldState, battle: unknown) {
    return reduceGameEvent(
      state,
      event("LOAD_STATE", { snapshot: state.journey, battle }),
      ctx(),
    );
  }

  const REMOVED = Symbol("removed");
  type Path = readonly (string | number)[];

  /** `value` with the field at `path` replaced, or deleted for {@link REMOVED}. */
  function withField(value: unknown, path: Path, replacement: unknown): unknown {
    const [key, ...rest] = path;
    if (key === undefined) return replacement;
    if (Array.isArray(value)) {
      const items: unknown[] = [...(value as unknown[])];
      items[Number(key)] = withField(items[Number(key)], rest, replacement);
      return items;
    }
    const record: Record<string, unknown> = {
      ...(value as Record<string, unknown>),
    };
    if (rest.length === 0 && replacement === REMOVED) {
      delete record[key];
    } else {
      record[key] = withField(record[key], rest, replacement);
    }
    return record;
  }

  it("loads a saved battle with every field filled in and keeps it as saved", () => {
    const { state, battle } = savedBattle();

    const out = load(state, battle);

    expect(out.outcome).toBe("applied");
    expect(out.state.battle).toEqual(battle);
  });

  it("loads a saved turn log whose play records carry a copiable cost and spark or omit them, and cost-bounded filters", () => {
    const { state, battle } = savedBattle();
    const committed = battle.engine.slice.committed;
    const [handCard] = committed.sides.player.hand;
    const state_ = ["engine", "slice", "committed"];
    const record = { instance: handCard, cardType: "character", subtype: "", allTypes: false };
    const costChange = {
      id: "e1", controller: "player", source: handCard, timestamp: 0, expiry: { at: "endOfTurn" },
      change: { kind: "cost", player: "player", filter: { costAtLeast: 1, costAtMost: 2 }, amount: 1, next: false },
    };
    for (const [path, value] of [
      [[...state_, "turnLog", "played", "player"], [{ ...record, cost: 2 }]],
      [[...state_, "turnLog", "played", "player"], [{ ...record, cost: 2, spark: 3 }, { ...record, cardType: "event", spark: null }]],
      [[...state_, "turnLog", "played", "player"], [record]],
      [[...state_, "turnLog", "played", "player"], [{ ...record, instance: "i999" }]],
      [[...state_, "floating"], [costChange]],
    ] as const) {
      expect(load(state, withField(battle, path, value)).outcome, path.join(".")).toBe("applied");
    }
  });

  it("bounces a saved battle with any one field missing or malformed", () => {
    const { state, battle } = savedBattle();
    const committed = battle.engine.slice.committed;
    const [handCard] = committed.sides.player.hand;
    const [deckCard] = committed.sides.player.deck;
    const init = ["init"];
    const descriptor = [...init, "enemyDescriptor"];
    const engineInit = ["engine", "init"];
    const slice = ["engine", "slice"];
    const state_ = [...slice, "committed"];
    const cases: readonly (readonly [Path, unknown])[] = [
      // The journey side.
      [[...init, "cardDefinitions"], REMOVED],
      [[...init, "cardDefinitions"], {}],
      [[...init, "cardDefinitions", 0, "cardId"], "fixture card"],
      [[...init, "cardDefinitions", 0, "energyCost"], "0"],
      [[...init, "cardDefinitions", 0, "transfiguration"], "Shiny"],
      [[...init, "battleId"], REMOVED],
      [[...init, "siteId"], ""],
      [[...init, "nodeId"], 7],
      [[...init, "completionLevelAtStart"], 0.5],
      [[...init, "essenceReward"], "75"],
      [[...init, "opponentAbilityActive"], null],
      [descriptor, REMOVED],
      [[...descriptor, "id"], ""],
      [[...descriptor, "avatarId"], "fixture avatar"],
      [[...descriptor, "portraitSeed"], REMOVED],
      [[...descriptor, "abilityText"], 0],
      [[...descriptor, "dreamsigns", 0, "id"], "fixture dreamsign"],
      [[...descriptor, "dreamsigns", 0, "imageName"], 3],
      [[...descriptor, "signatureCards"], REMOVED],
      [[...descriptor, "signatureCards", 0, "cardId"], "fixture card"],
      [[...descriptor, "signatureCards", 0, "name"], ""],
      [[...init, "avatarSummary"], {}],
      [[...init, "avatarSummary", "imageNumber"], 1],
      [[...init, "avatarSummary", "portraitFocus"], { x: "left", y: 0 }],
      // The engine init.
      [engineInit, REMOVED],
      [[...engineInit, "seed"], 5],
      [[...engineInit, "scoreToWin"], -1],
      [[...engineInit, "startingSide"], "nobody"],
      [[...engineInit, "decks", "enemy"], REMOVED],
      [[...engineInit, "decks", "player", 0, "cardId"], "fixture card"],
      [[...engineInit, "decks", "player", 0, "transfigurations"], ["Shiny"]],
      [[...engineInit, "decks", "player", 0, "deckMods", "fast"], "yes"],
      [[...engineInit, "dreamwell", 0], "fixture dreamwell"],
      [[...engineInit, "avatars", "enemy"], "fixture avatar"],
      [[...engineInit, "dreamsigns", "nobody"], []],
      [[...engineInit, "nextBattle", "player", "openingHand"], REMOVED],
      // The engine slice.
      [slice, REMOVED],
      [state_, REMOVED],
      [[...state_, "version"], -1],
      [[...state_, "config", "startingSide"], REMOVED],
      [[...state_, "turn", "phase"], "lunch"],
      [[...state_, "sides", "player", "hand", 0], "i999999"],
      [[...state_, "sides", "player", "frontRank"], []],
      [[...state_, "instances", deckCard ?? "", "zone"], "void"],
      [[...state_, "instances", handCard ?? "", "zone"], "nowhere"],
      [[...state_, "instances", handCard ?? "", "printing"], { kind: "token" }],
      [[...state_, "instances", handCard ?? "", "status"], REMOVED],
      [
        [...state_, "stack"],
        [{ kind: "spell", controller: "player", x: null, optionalPaid: [] }],
      ],
      [
        [...state_, "floating"],
        [
          {
            id: "e1",
            controller: "player",
            source: handCard,
            timestamp: 0,
            expiry: { at: "someday" },
            change: { kind: "temporary", instance: handCard },
          },
        ],
      ],
      [[...state_, "triggerQueue"], [{}]],
      [
        [...state_, "turnLog", "played", "player"],
        [{ instance: handCard, cardType: "character", subtype: "", allTypes: false, cost: -1 }],
      ],
      [
        [...state_, "turnLog", "played", "player"],
        [{ instance: handCard, cardType: "character", subtype: "", allTypes: false, cost: 1, spark: "2" }],
      ],
      [
        [...state_, "floating"],
        [
          {
            id: "e1",
            controller: "player",
            source: handCard,
            timestamp: 0,
            expiry: { at: "endOfTurn" },
            change: { kind: "cost", player: "player", filter: { costAtMost: "2" }, amount: 1, next: false },
          },
        ],
      ],
      [
        [...state_, "floating"],
        [
          {
            id: "e1",
            controller: "player",
            source: handCard,
            timestamp: 0,
            expiry: { at: "endOfTurn" },
            change: { kind: "cost", player: "player", filter: { costAtLeast: 1.5 }, amount: 1, next: false },
          },
        ],
      ],
      [[...state_, "dreamwell", "deck"], ["fixture dreamwell"]],
      [[...state_, "result"], { kind: "victory", winner: "player" }],
      [[...state_, "loops"], REMOVED],
      [[...slice, "inFlight", "step", "kind"], "dance"],
      [[...slice, "inFlight", "answers"], [{ fingerprint: "f", value: "left" }]],
      [[...slice, "attempt"], -1],
      [[...slice, "publishedEvents"], REMOVED],
      [[...slice, "history", "base"], REMOVED],
      [[...slice, "history", "base", "history"], battle.engine.slice.history],
      [
        [...slice, "history", "entries", 0],
        { intent: { kind: "battleAction", side: "player", action: { kind: "dance" } } },
      ],
    ];
    expect(handCard).toBeDefined();
    expect(deckCard).toBeDefined();

    for (const [path, value] of cases) {
      const out = load(state, withField(battle, path, value));
      expect(
        { outcome: out.outcome, bounceReason: out.bounceReason },
        path.join("."),
      ).toEqual({ outcome: "bounced", bounceReason: "invalid_action" });
    }
  });
});
