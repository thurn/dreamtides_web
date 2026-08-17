import { selectBattleCardInstance } from "../../battle/state/selectors";
import { selectDefaultCharacterPlaySlot } from "../../battle/state/selectors";
import type { BattleDebugEdit } from "../../battle/debug/commands";
import type {
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
} from "../../battle/types";
import { BACK_RANK_SLOTS, rankSlotIds, slotIndex } from "../../battle/types";
import {
  alliesInPlay,
  charactersInVoid,
  drawEdits,
  drawUntilEdits,
  enemyCharactersInPlay,
  eventsInVoid,
  gainEnergyEdits,
  gainScoreEdits,
  opponentOf,
  topOfDeck,
} from "./effect-step";
import type { DreamwellEffectScript } from "../../battle/automation/dreamwell-effects";
import { dreamwellPromptRef } from "../../data/dreamwell-prompts";
import type { BattleCardId } from "../../types/identifiers";
import type {
  DreamwellCardId,
  DreamwellChoiceKey,
  DreamwellPromptKey,
  IdentityRecord,
} from "../../types/identifiers";
import { parseDreamwellCardId } from "../../types/identifiers";
import { parseDreamwellPromptKey } from "../../types/identifiers";
import { parseDreamwellChoiceKey } from "../../types/identifiers";
import {
  parseCardName,
  parseCardSubtype,
} from "../../types/card-identity";

// ---------------------------------------------------------------------------
// Deterministic dreamwell effect table
// ---------------------------------------------------------------------------

const ETHEREAL_FIGMENT_SUBTYPE = parseCardSubtype("Ethereal");

const DISCOVER_CARD_ID = parseDreamwellCardId(
  "f61431f3-33bd-42ff-a229-b4013582e86e",
);
const DISCOVER_CHARACTER_ID = parseDreamwellCardId(
  "8f5f2e26-44b5-447b-90d0-eaf22ab29fed",
);
const ECHO_CASCADE_ID = parseDreamwellCardId(
  "2ad68489-044a-40d1-9be6-e62497a4e1fd",
);
const FIRMAMENT_MIRROR_ID = parseDreamwellCardId(
  "14dec460-3ec6-40c1-978f-67e70cb0b227",
);
const SILENT_WINTER_ID = parseDreamwellCardId(
  "9954cede-8a16-4053-b6e9-da745f4540f5",
);

function prompt(
  cardId: DreamwellCardId,
  promptKey: DreamwellPromptKey,
  arguments_: Readonly<Record<string, string | number>> = {},
) {
  return dreamwellPromptRef(cardId, promptKey, "title", arguments_);
}

function promptSubtitle(
  cardId: DreamwellCardId,
  promptKey: DreamwellPromptKey,
  arguments_: Readonly<Record<string, string | number>> = {},
) {
  return dreamwellPromptRef(cardId, promptKey, "subtitle", arguments_);
}

function promptChoice(
  cardId: DreamwellCardId,
  promptKey: DreamwellPromptKey,
  choiceKey: DreamwellChoiceKey,
  arguments_: Readonly<Record<string, string | number>> = {},
) {
  return dreamwellPromptRef(cardId, promptKey, "choice", arguments_, choiceKey);
}

/** A local seeded stream consumes exactly one event-rng draw at prompt open. */
function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function deterministicShuffle(
  ids: readonly BattleCardId[],
  seedText: string,
): BattleCardId[] {
  let seed = 2166136261;
  for (const char of seedText)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const result = [...ids];
  const random = seededRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function sampledDiscoverCandidates(
  ctx: import("./effect-step").StepContext,
  matches: (battleCardId: BattleCardId) => boolean,
): BattleCardId[] {
  const matching = ctx.state.sides[ctx.side].deck.filter(
    (battleCardId) =>
      ctx.state.cardInstances[battleCardId] !== undefined &&
      matches(battleCardId),
  );
  const random = seededRandom(Math.floor(ctx.random() * 0x1_0000_0000));
  for (let index = matching.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [matching[index], matching[other]] = [matching[other], matching[index]];
  }
  return matching.slice(0, 3);
}

function discoverResolution(
  chosenIds: BattleCardId[],
  ctx: import("./effect-step").StepContext,
): BattleDebugEdit[] {
  const chosen = chosenIds[0];
  if (chosen === undefined) return [];
  const sampled = ctx.promptCandidateIds ?? [];
  const deckAfterChoice = ctx.state.sides[ctx.side].deck.filter(
    (id) => id !== chosen,
  );
  return [
    {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId: chosen,
      destination: { side: ctx.side, zone: "hand" },
    },
    {
      kind: "REORDER_DECK",
      side: ctx.side,
      order: deterministicShuffle(
        deckAfterChoice,
        `${sampled.join("|")}:${chosen}`,
      ),
    },
  ];
}

/**
 * The open back-rank slot nearest the middle of the rendered play area. The
 * tutorial's first figment otherwise lands via
 * {@link selectDefaultCharacterPlaySlot}'s documented leftmost-open rule,
 * which reads as the far edge of an empty board during this guided moment;
 * real (non-tutorial) games keep the documented leftmost placement. Centers
 * on the fixed `BACK_RANK_SLOTS` width (what the battlefield actually
 * renders) rather than the backing record's current key count, which can
 * grow past that width (e.g. `ensureContiguousRankSlots` widening it for an
 * off-battlefield-width debug placement).
 */
function selectTutorialCenterBackRankSlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress | null {
  const { backRank } = state.sides[side];
  const openSlotIds = rankSlotIds(backRank).filter(
    (slotId) =>
      backRank[slotId] === null && slotIndex(slotId) < BACK_RANK_SLOTS,
  );
  if (openSlotIds.length === 0) return null;
  const center = (BACK_RANK_SLOTS - 1) / 2;
  const closest = openSlotIds.reduce((best, slotId) =>
    Math.abs(slotIndex(slotId) - center) < Math.abs(slotIndex(best) - center)
      ? slotId
      : best,
  );
  return { side, zone: "backRank", slotId: closest };
}

/**
 * Dreamwell effect scripts keyed by the dreamwell card UUID. Each entry's
 * `.id` equals its key. The table contains both deterministic `edits` steps
 * and interactive `prompt` steps resolved by the runner; the runner walks each
 * step in order, applying edits immediately and pausing on prompts until the
 * player resolves them.
 */
const DREAMWELL_EFFECT_SCRIPTS = [
  // Catalog entries with no effect are still registered so catalog coverage is
  // observable and status remains authoritative by UUID.
  {
    id: parseDreamwellCardId("662b7393-751c-4aa9-8150-5f20b4d176a4"),
    steps: [],
  },

  // Lily Lake — immediately draw an additional Dreamwell card.
  {
    id: parseDreamwellCardId("558a1f1b-7dc1-4d83-9f00-c6af2187a954"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => [
          {
            kind: "DRAW_DREAMWELL_CARD",
            side: ctx.side,
            turnNumber: ctx.state.turnNumber,
            additional: true,
          },
        ],
      },
    ],
  },

  // Ringvale — Discover a ≤2● cost card. Candidate sampling consumes exactly
  // one event RNG draw when the prompt opens; the persisted candidates drive
  // resolution after reload without sampling again.
  {
    id: DISCOVER_CARD_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            DISCOVER_CARD_ID,
            parseDreamwellPromptKey("discover-card"),
            { maximum_cost: 2 },
          ),
          count: 1,
          optional: false,
          candidates: (ctx) =>
            sampledDiscoverCandidates(
              ctx,
              (id) =>
                (ctx.state.cardInstances[id]?.definition.energyCost ??
                  Infinity) <= 2,
            ),
          resolve: discoverResolution,
        },
      },
    ],
  },

  // Azure Cascade — Discover a character.
  {
    id: DISCOVER_CHARACTER_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            DISCOVER_CHARACTER_ID,
            parseDreamwellPromptKey("discover-character"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) =>
            sampledDiscoverCandidates(
              ctx,
              (id) =>
                ctx.state.cardInstances[id]?.definition.battleCardKind ===
                "character",
            ),
          resolve: discoverResolution,
        },
      },
    ],
  },

  // Echoing Boughs — rematerialize one ally.
  {
    id: ECHO_CASCADE_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            ECHO_CASCADE_ID,
            parseDreamwellPromptKey("rematerialize-ally"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => alliesInPlay(ctx.state, ctx.side),
          resolve: ([id]) =>
            id === undefined
              ? []
              : [{ kind: "REMATERIALIZE", battleCardId: id }],
        },
      },
    ],
  },

  // Firmament Mirror — grant a turn-bounded Reclaim eligibility, distinct from
  // the reclaimed leave-play replacement status.
  {
    id: FIRMAMENT_MIRROR_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            FIRMAMENT_MIRROR_ID,
            parseDreamwellPromptKey("grant-reclaim"),
          ),
          subtitle: promptSubtitle(
            FIRMAMENT_MIRROR_ID,
            parseDreamwellPromptKey("grant-reclaim"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].void,
          resolve: ([id], ctx) =>
            id === undefined
              ? []
              : [
                  {
                    kind: "SET_CARD_STATUS",
                    battleCardId: id,
                    status: {
                      temporaryReclaimUntilEnding: {
                        activeSide: ctx.state.activeSide,
                        turnNumber: ctx.state.turnNumber,
                        sourceId: FIRMAMENT_MIRROR_ID,
                      },
                    },
                  },
                ],
        },
      },
    ],
  },

  // Meteor Meadow — Draw a card.
  {
    id: parseDreamwellCardId("5ec17498-9028-4a01-80a0-67c91b03d505"),
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Autumn Glade — +2⍟ score (active side).
  {
    id: parseDreamwellCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
    steps: [{ kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 2) }],
  },

  // Twilight Radiance — +1● current energy.
  {
    id: parseDreamwellCardId("de98477c-e216-4618-bff1-0e24bd982fdb"),
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Prismatic Pastures — +3● current energy.
  {
    id: parseDreamwellCardId("d585b78a-dfe3-4e12-95ac-432c3c880540"),
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 3) }],
  },

  // The Voltsurge — Each side draws 2.
  {
    id: parseDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
    steps: [
      {
        kind: "edits",
        build: (_ctx) => [...drawEdits("player", 2), ...drawEdits("enemy", 2)],
      },
    ],
  },

  // Shadow Passage — Erode 3 (active side).
  {
    id: parseDreamwellCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
    steps: [
      {
        kind: "edits",
        build: ({ side }) => [{ kind: "ERODE", side, count: 3 }],
      },
    ],
  },

  // The Brimming Well — Opponent +1 max ● (ADJUST_MAX_ENERGY +1 on opponent).
  {
    id: parseDreamwellCardId("a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => [
          { kind: "ADJUST_MAX_ENERGY", side: opponentOf(ctx.side), amount: 1 },
        ],
      },
    ],
  },

  // Glimmering Horizon — If <2 in hand, draw until 2.
  {
    id: parseDreamwellCardId("cf0f0a05-2a94-407c-8c22-e41b925f9c03"),
    steps: [
      { kind: "edits", build: (ctx) => drawUntilEdits(ctx.state, ctx.side, 2) },
    ],
  },

  // Wellspring Commons — Each side draws until ≥3 in hand.
  {
    id: parseDreamwellCardId("06e62e45-53f9-4264-9aa6-2575b445332a"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => [
          ...drawUntilEdits(ctx.state, "player", 3),
          ...drawUntilEdits(ctx.state, "enemy", 3),
        ],
      },
    ],
  },

  // Stillwater Mirror — Reveal enemy hand.
  {
    id: parseDreamwellCardId("eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => [
          {
            kind: "SET_SIDE_HAND_VISIBILITY",
            side: opponentOf(ctx.side),
            viewer: ctx.side,
            isRevealed: true,
          },
        ],
      },
    ],
  },

  // Foxfire Thicket — Create a 1✦ ethereal figment; skip if no open slot.
  {
    id: parseDreamwellCardId("51caf26d-83bf-45a9-bc80-010d353277db"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          const destination =
            ctx.isTutorial === true
              ? selectTutorialCenterBackRankSlot(ctx.state, ctx.side)
              : selectDefaultCharacterPlaySlot(ctx.state, ctx.side);
          if (destination === null) return [];
          return [
            {
              kind: "CREATE_FIGMENT" as const,
              side: ctx.side,
              chosenSubtype: ETHEREAL_FIGMENT_SUBTYPE,
              chosenSpark: 1,
              name: parseCardName("Ethereal Figment"),
              destination,
              createdAtMs: ctx.nowMs,
            },
          ];
        },
      },
    ],
  },

  // Eternal Horizon — Each ally +1✦ (delta-relative).
  {
    id: parseDreamwellCardId("a57f1276-3fb6-4527-b538-953fbace35cf"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          return alliesInPlay(ctx.state, ctx.side).map((id) => {
            const instance = selectBattleCardInstance(
              ctx.state,
              id,
            );
            const existing = instance?.sparkDelta ?? 0;
            return {
              kind: "SET_CARD_SPARK_DELTA" as const,
              battleCardId: id,
              value: existing + 1,
            };
          });
        },
      },
    ],
  },

  // Twin Moons — Draw a card; if it is a character, +1●. Two steps so the
  // second sees the post-draw hand (drawn card is last hand entry).
  {
    id: parseDreamwellCardId("120ec4c2-aa7b-48f4-be9f-f39820e565ca"),
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
      {
        kind: "edits",
        build: (ctx) => {
          const hand = ctx.state.sides[ctx.side].hand;
          const drawnId = hand[hand.length - 1];
          const drawn = selectBattleCardInstance(ctx.state, drawnId ?? null);
          return drawn?.definition.battleCardKind === "character"
            ? gainEnergyEdits(ctx.side, 1)
            : [];
        },
      },
    ],
  },

  // Celestial Gateway — Return a random character from EACH player's void to play.
  // For each side independently: pick one random void character and move to that
  // side's default play slot; skip a side with no void character or no open slot.
  {
    id: parseDreamwellCardId("a3033051-8eb7-4fbf-93d6-f947ed68974d"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          const edits: BattleDebugEdit[] = [];
          for (const side of ["player", "enemy"] as const) {
            const voidChars = charactersInVoid(ctx.state, side);
            const slot = selectDefaultCharacterPlaySlot(ctx.state, side);
            if (voidChars.length === 0 || slot === null) continue;
            const pick = voidChars[Math.floor(ctx.random() * voidChars.length)];
            edits.push({
              kind: "MOVE_CARD_TO_ZONE",
              battleCardId: pick,
              destination: slot,
            });
          }
          return edits;
        },
      },
    ],
  },

  // ---------------------------------------------------------------------------
  // Interactive-prompt entries
  // ---------------------------------------------------------------------------

  // Astral Interface — Draw, then discard 1.
  {
    id: parseDreamwellCardId("ee1ef770-29ea-4a63-a1f9-7e97b5b8870d"),
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            parseDreamwellCardId("ee1ef770-29ea-4a63-a1f9-7e97b5b8870d"),
            parseDreamwellPromptKey("discard-drawn-card"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].hand,
          // The draw above pushes the new card to the end of the hand, so the
          // last id is the card just drawn — flag it so the player can tell it
          // apart from the rest of their hand.
          highlight: (ctx) => {
            const hand = ctx.state.sides[ctx.side].hand;
            const drawn = hand[hand.length - 1];
            return drawn !== undefined ? [drawn] : [];
          },
          resolve: ([id]) =>
            id !== undefined
              ? [{ kind: "DISCARD_CARD", battleCardId: id }]
              : [],
        },
      },
    ],
  },

  // Emberwake Flats — +2●, then discard 1.
  {
    id: parseDreamwellCardId("91deefd2-0400-4c78-ab9f-f6db864ff7e2"),
    steps: [
      { kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 2) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            parseDreamwellCardId("91deefd2-0400-4c78-ab9f-f6db864ff7e2"),
            parseDreamwellPromptKey("discard-card"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].hand,
          resolve: ([id]) =>
            id !== undefined
              ? [{ kind: "DISCARD_CARD", battleCardId: id }]
              : [],
        },
      },
    ],
  },

  // Sunset's Last Gaze — You may discard 2, then draw 2.
  {
    id: parseDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            parseDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
            parseDreamwellPromptKey("discard-and-draw"),
            { count: 2 },
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  parseDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
                  parseDreamwellPromptKey("choose-discards"),
                  { count: 2 },
                ),
                count: 2,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].hand,
                resolve: (ids) =>
                  ids.map((id) => ({
                    kind: "DISCARD_CARD" as const,
                    battleCardId: id,
                  })),
              },
            },
            { kind: "edits", build: (ctx) => drawEdits(ctx.side, 2) },
          ],
        },
      },
    ],
  },

  // Leaf Light Canopy — Return a card from your void to hand.
  {
    id: parseDreamwellCardId("2b23a60c-209c-4c75-b63c-b7f73b2e1a56"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            parseDreamwellCardId("2b23a60c-209c-4c75-b63c-b7f73b2e1a56"),
            parseDreamwellPromptKey("return-void-card"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].void,
          resolve: ([id], ctx) =>
            id !== undefined
              ? [
                  {
                    kind: "MOVE_CARD_TO_ZONE",
                    battleCardId: id,
                    destination: { side: ctx.side, zone: "hand" },
                  },
                ]
              : [],
        },
      },
    ],
  },

  // Verdant Hollow — Return an EVENT from your void to hand.
  {
    id: parseDreamwellCardId("a0fbcbd9-96ee-4392-add7-e1d436f99553"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            parseDreamwellCardId("a0fbcbd9-96ee-4392-add7-e1d436f99553"),
            parseDreamwellPromptKey("return-event"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => eventsInVoid(ctx.state, ctx.side),
          resolve: ([id], ctx) =>
            id !== undefined
              ? [
                  {
                    kind: "MOVE_CARD_TO_ZONE",
                    battleCardId: id,
                    destination: { side: ctx.side, zone: "hand" },
                  },
                ]
              : [],
        },
      },
    ],
  },

  // Silent Winter — Banish an enemy until Ending, preserving the exact return
  // controller and source identity in serialized card status.
  {
    id: SILENT_WINTER_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            SILENT_WINTER_ID,
            parseDreamwellPromptKey("banish-enemy-character"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => enemyCharactersInPlay(ctx.state, ctx.side),
          resolve: ([id], ctx) => {
            if (id === undefined) return [];
            const target = ctx.state.cardInstances[id];
            if (target === undefined) return [];
            return [
              {
                kind: "SET_CARD_STATUS",
                battleCardId: id,
                status: {
                  temporaryBanishUntilEnding: {
                    activeSide: ctx.state.activeSide,
                    turnNumber: ctx.state.turnNumber,
                    priorOwner: target.owner,
                    priorController: target.controller,
                    sourceId: SILENT_WINTER_ID,
                  },
                },
              },
              {
                kind: "MOVE_CARD_TO_ZONE",
                battleCardId: id,
                destination: { side: target.owner, zone: "banished" },
              },
            ];
          },
        },
      },
    ],
  },

  // Shining Beacon — Reveal top 2; pick 1 to hand, the other to bottom of deck.
  {
    id: parseDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            parseDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
            parseDreamwellPromptKey("pick-card-for-hand"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => topOfDeck(ctx.state, ctx.side, 2),
          resolve: ([chosenId], ctx) => {
            if (chosenId === undefined) return [];
            const top2 = topOfDeck(ctx.state, ctx.side, 2);
            const otherIndex = top2[0] === chosenId ? 1 : 0;
            const otherId = top2[otherIndex];
            const edits: BattleDebugEdit[] = [
              {
                kind: "MOVE_CARD_TO_ZONE",
                battleCardId: chosenId,
                destination: { side: ctx.side, zone: "hand" },
              },
            ];
            if (otherId !== undefined) {
              edits.push({
                kind: "MOVE_CARD_TO_ZONE",
                battleCardId: otherId,
                destination: {
                  side: ctx.side,
                  zone: "deck",
                  position: "bottom",
                },
              });
            }
            return edits;
          },
        },
      },
    ],
  },

  // Luminous Enigma — You may put a card from your void on top of your deck.
  {
    id: parseDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            parseDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
            parseDreamwellPromptKey("confirm-void-to-deck"),
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  parseDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
                  parseDreamwellPromptKey("choose-void-for-deck"),
                ),
                count: 1,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].void,
                resolve: ([id], ctx) =>
                  id !== undefined
                    ? [
                        {
                          kind: "MOVE_CARD_TO_ZONE",
                          battleCardId: id,
                          destination: {
                            side: ctx.side,
                            zone: "deck",
                            position: "top",
                          },
                        },
                      ]
                    : [],
              },
            },
          ],
        },
      },
    ],
  },

  // The Bastion — You may abandon one of your characters, then draw 2.
  {
    id: parseDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            parseDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
            parseDreamwellPromptKey("confirm-abandon-and-draw"),
            { count: 2 },
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  parseDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
                  parseDreamwellPromptKey("choose-character-to-abandon"),
                ),
                count: 1,
                optional: false,
                candidates: (ctx) => alliesInPlay(ctx.state, ctx.side),
                resolve: ([id]) =>
                  id !== undefined
                    ? [{ kind: "ABANDON", battleCardId: id }]
                    : [],
              },
            },
            { kind: "edits", build: (ctx) => drawEdits(ctx.side, 2) },
          ],
        },
      },
    ],
  },

  // The Crossroads — Choose: draw a card / gain 2●.
  {
    id: parseDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "choice",
          label: prompt(
            parseDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
            parseDreamwellPromptKey("choose-benefit"),
            { amount: 2 },
          ),
          options: [
            {
              label: promptChoice(
                parseDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
                parseDreamwellPromptKey("choose-benefit"),
                parseDreamwellChoiceKey("draw-card"),
                { amount: 2 },
              ),
              build: (ctx) => drawEdits(ctx.side, 1),
            },
            {
              label: promptChoice(
                parseDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
                parseDreamwellPromptKey("choose-benefit"),
                parseDreamwellChoiceKey("gain-energy"),
                { amount: 2 },
              ),
              build: (ctx) => gainEnergyEdits(ctx.side, 2),
            },
          ],
        },
      },
    ],
  },

  // Fortune's Wheel — You may discard your hand, then draw that many.
  {
    id: parseDreamwellCardId("446095b1-ec4d-40d7-8eed-a8221d339ea2"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            parseDreamwellCardId("446095b1-ec4d-40d7-8eed-a8221d339ea2"),
            parseDreamwellPromptKey("redraw-hand"),
          ),
          onYes: [
            {
              kind: "edits",
              build: (ctx) => {
                const handIds = ctx.state.sides[ctx.side].hand;
                const n = handIds.length;
                const discards: BattleDebugEdit[] = handIds.map((id) => ({
                  kind: "DISCARD_CARD",
                  battleCardId: id,
                }));
                const draws: BattleDebugEdit[] = Array.from(
                  { length: n },
                  () => ({ kind: "DRAW_CARD" as const, side: ctx.side }),
                );
                return [...discards, ...draws];
              },
            },
          ],
        },
      },
    ],
  },

  // Skypath — Foresee 1.
  {
    id: parseDreamwellCardId("f9b479cf-02cb-40e1-bb64-70b29977bf15"),
    steps: [{ kind: "prompt", prompt: { kind: "foresee", count: 1 } }],
  },

  // Ruin Tree — You may play a ≤2● character from your void.
  // No energy is charged (the Dreamwell grants the play). The played card's own
  // ability is left for the operator to resolve, consistent with planCardPlay.
  {
    id: parseDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            parseDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
            parseDreamwellPromptKey("confirm-play-void-character"),
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  parseDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
                  parseDreamwellPromptKey("choose-void-character"),
                ),
                count: 1,
                optional: false,
                candidates: (ctx) => charactersInVoid(ctx.state, ctx.side, 2),
                resolve: ([id], ctx) => {
                  const slot = selectDefaultCharacterPlaySlot(
                    ctx.state,
                    ctx.side,
                  );
                  return id !== undefined && slot !== null
                    ? [
                        {
                          kind: "MOVE_CARD_TO_ZONE",
                          battleCardId: id,
                          destination: slot,
                        },
                      ]
                    : [];
                },
              },
            },
          ],
        },
      },
    ],
  },
] satisfies DreamwellEffectScript[];

export const DREAMWELL_EFFECTS: IdentityRecord<
  DreamwellCardId,
  DreamwellEffectScript
> = Object.fromEntries(
  DREAMWELL_EFFECT_SCRIPTS.map((script) => [script.id, script]),
);

// ---------------------------------------------------------------------------
// Status API
// ---------------------------------------------------------------------------

/**
 * Returns the `DreamwellEffectScript` for `cardId` if one exists, else `null`.
 */
export function selectDreamwellEffectScript(
  cardId: DreamwellCardId,
): DreamwellEffectScript | null {
  return DREAMWELL_EFFECTS[cardId] ?? null;
}

/**
 * Returns the automation status of a dreamwell card:
 * - `"auto"` — a fully automated script exists in `DREAMWELL_EFFECTS`.
 * - `"none"` — the card id is unknown / unregistered.
 */
export function dreamwellAutomationStatus(
  cardId: DreamwellCardId,
): "auto" | "none" {
  if (cardId in DREAMWELL_EFFECTS) return "auto";
  return "none";
}
