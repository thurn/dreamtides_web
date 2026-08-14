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
import { asBattleCardId, asDreamwellCardId } from "../../types/identifiers";
import { asDreamwellPromptKey } from "../../types/identifiers";
import { asDreamwellChoiceKey } from "../../types/identifiers";

// ---------------------------------------------------------------------------
// Deterministic dreamwell effect table
// ---------------------------------------------------------------------------

const DISCOVER_CARD_ID = asDreamwellCardId(
  "f61431f3-33bd-42ff-a229-b4013582e86e",
);
const DISCOVER_CHARACTER_ID = asDreamwellCardId(
  "8f5f2e26-44b5-447b-90d0-eaf22ab29fed",
);
const ECHO_CASCADE_ID = asDreamwellCardId(
  "2ad68489-044a-40d1-9be6-e62497a4e1fd",
);
const FIRMAMENT_MIRROR_ID = asDreamwellCardId(
  "14dec460-3ec6-40c1-978f-67e70cb0b227",
);
const SILENT_WINTER_ID = asDreamwellCardId(
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
      battleCardId: asBattleCardId(chosen),
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
export const DREAMWELL_EFFECTS: IdentityRecord<
  DreamwellCardId,
  DreamwellEffectScript
> = {
  // Catalog entries with no effect are still registered so catalog coverage is
  // observable and status remains authoritative by UUID.
  "32d64cb6-9856-43a2-9451-fcb14007a9a6": {
    id: asDreamwellCardId("32d64cb6-9856-43a2-9451-fcb14007a9a6"),
    steps: [],
  },
  "5e17dc4b-b654-4962-ba5a-7b042852a980": {
    id: asDreamwellCardId("5e17dc4b-b654-4962-ba5a-7b042852a980"),
    steps: [],
  },
  "662b7393-751c-4aa9-8150-5f20b4d176a4": {
    id: asDreamwellCardId("662b7393-751c-4aa9-8150-5f20b4d176a4"),
    steps: [],
  },

  // Lily Lake — immediately draw an additional Dreamwell card.
  "558a1f1b-7dc1-4d83-9f00-c6af2187a954": {
    id: asDreamwellCardId("558a1f1b-7dc1-4d83-9f00-c6af2187a954"),
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
  [DISCOVER_CARD_ID]: {
    id: DISCOVER_CARD_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId(DISCOVER_CARD_ID),
            asDreamwellPromptKey("discover-card"),
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
  [DISCOVER_CHARACTER_ID]: {
    id: DISCOVER_CHARACTER_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId(DISCOVER_CHARACTER_ID),
            asDreamwellPromptKey("discover-character"),
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
  [ECHO_CASCADE_ID]: {
    id: ECHO_CASCADE_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId(ECHO_CASCADE_ID),
            asDreamwellPromptKey("rematerialize-ally"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => alliesInPlay(ctx.state, ctx.side),
          resolve: ([id]) =>
            id === undefined
              ? []
              : [{ kind: "REMATERIALIZE", battleCardId: asBattleCardId(id) }],
        },
      },
    ],
  },

  // Firmament Mirror — grant a turn-bounded Reclaim eligibility, distinct from
  // the reclaimed leave-play replacement status.
  [FIRMAMENT_MIRROR_ID]: {
    id: FIRMAMENT_MIRROR_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId(FIRMAMENT_MIRROR_ID),
            asDreamwellPromptKey("grant-reclaim"),
          ),
          subtitle: promptSubtitle(
            asDreamwellCardId(FIRMAMENT_MIRROR_ID),
            asDreamwellPromptKey("grant-reclaim"),
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
                    battleCardId: asBattleCardId(id),
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
  "5ec17498-9028-4a01-80a0-67c91b03d505": {
    id: asDreamwellCardId("5ec17498-9028-4a01-80a0-67c91b03d505"),
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Autumn Glade — +2⍟ score (active side).
  "02e8ea92-1218-413c-9f0b-4c865a3921d3": {
    id: asDreamwellCardId("02e8ea92-1218-413c-9f0b-4c865a3921d3"),
    steps: [{ kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 2) }],
  },

  // Twilight Radiance — +1● current energy.
  "de98477c-e216-4618-bff1-0e24bd982fdb": {
    id: asDreamwellCardId("de98477c-e216-4618-bff1-0e24bd982fdb"),
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Prismatic Pastures — +3● current energy.
  "d585b78a-dfe3-4e12-95ac-432c3c880540": {
    id: asDreamwellCardId("d585b78a-dfe3-4e12-95ac-432c3c880540"),
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 3) }],
  },

  // The Voltsurge — Each side draws 2.
  "7171ff89-ebe4-42d0-8863-9b4b0531cad2": {
    id: asDreamwellCardId("7171ff89-ebe4-42d0-8863-9b4b0531cad2"),
    steps: [
      {
        kind: "edits",
        build: (_ctx) => [...drawEdits("player", 2), ...drawEdits("enemy", 2)],
      },
    ],
  },

  // Shadow Passage — Erode 3 (active side).
  "03e4e701-4720-4278-8198-9b7e0514d4cf": {
    id: asDreamwellCardId("03e4e701-4720-4278-8198-9b7e0514d4cf"),
    steps: [
      {
        kind: "edits",
        build: ({ side }) => [{ kind: "ERODE", side, count: 3 }],
      },
    ],
  },

  // The Brimming Well — Opponent +1 max ● (ADJUST_MAX_ENERGY +1 on opponent).
  "a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf": {
    id: asDreamwellCardId("a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf"),
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
  "cf0f0a05-2a94-407c-8c22-e41b925f9c03": {
    id: asDreamwellCardId("cf0f0a05-2a94-407c-8c22-e41b925f9c03"),
    steps: [
      { kind: "edits", build: (ctx) => drawUntilEdits(ctx.state, ctx.side, 2) },
    ],
  },

  // Wellspring Commons — Each side draws until ≥3 in hand.
  "06e62e45-53f9-4264-9aa6-2575b445332a": {
    id: asDreamwellCardId("06e62e45-53f9-4264-9aa6-2575b445332a"),
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
  "eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a": {
    id: asDreamwellCardId("eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a"),
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
  "51caf26d-83bf-45a9-bc80-010d353277db": {
    id: asDreamwellCardId("51caf26d-83bf-45a9-bc80-010d353277db"),
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
              chosenSubtype: "Ethereal",
              chosenSpark: 1,
              name: "Ethereal Figment",
              destination,
              createdAtMs: ctx.nowMs,
            },
          ];
        },
      },
    ],
  },

  // Eternal Horizon — Each ally +1✦ (delta-relative).
  "a57f1276-3fb6-4527-b538-953fbace35cf": {
    id: asDreamwellCardId("a57f1276-3fb6-4527-b538-953fbace35cf"),
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          return alliesInPlay(ctx.state, ctx.side).map((id) => {
            const instance = selectBattleCardInstance(
              ctx.state,
              asBattleCardId(id),
            );
            const existing = instance?.sparkDelta ?? 0;
            return {
              kind: "SET_CARD_SPARK_DELTA" as const,
              battleCardId: asBattleCardId(id),
              value: existing + 1,
            };
          });
        },
      },
    ],
  },

  // Twin Moons — Draw a card; if it is a character, +1●. Two steps so the
  // second sees the post-draw hand (drawn card is last hand entry).
  "120ec4c2-aa7b-48f4-be9f-f39820e565ca": {
    id: asDreamwellCardId("120ec4c2-aa7b-48f4-be9f-f39820e565ca"),
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
  "a3033051-8eb7-4fbf-93d6-f947ed68974d": {
    id: asDreamwellCardId("a3033051-8eb7-4fbf-93d6-f947ed68974d"),
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
              battleCardId: asBattleCardId(pick),
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
  "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d": {
    id: asDreamwellCardId("ee1ef770-29ea-4a63-a1f9-7e97b5b8870d"),
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId("ee1ef770-29ea-4a63-a1f9-7e97b5b8870d"),
            asDreamwellPromptKey("discard-drawn-card"),
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
              ? [{ kind: "DISCARD_CARD", battleCardId: asBattleCardId(id) }]
              : [],
        },
      },
    ],
  },

  // Emberwake Flats — +2●, then discard 1.
  "91deefd2-0400-4c78-ab9f-f6db864ff7e2": {
    id: asDreamwellCardId("91deefd2-0400-4c78-ab9f-f6db864ff7e2"),
    steps: [
      { kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 2) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId("91deefd2-0400-4c78-ab9f-f6db864ff7e2"),
            asDreamwellPromptKey("discard-card"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].hand,
          resolve: ([id]) =>
            id !== undefined
              ? [{ kind: "DISCARD_CARD", battleCardId: asBattleCardId(id) }]
              : [],
        },
      },
    ],
  },

  // Sunset's Last Gaze — You may discard 2, then draw 2.
  "fa8704fe-759f-408d-992d-d8f9d5ffd760": {
    id: asDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            asDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
            asDreamwellPromptKey("discard-and-draw"),
            { count: 2 },
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  asDreamwellCardId("fa8704fe-759f-408d-992d-d8f9d5ffd760"),
                  asDreamwellPromptKey("choose-discards"),
                  { count: 2 },
                ),
                count: 2,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].hand,
                resolve: (ids) =>
                  ids.map((id) => ({
                    kind: "DISCARD_CARD" as const,
                    battleCardId: asBattleCardId(id),
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
  "2b23a60c-209c-4c75-b63c-b7f73b2e1a56": {
    id: asDreamwellCardId("2b23a60c-209c-4c75-b63c-b7f73b2e1a56"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId("2b23a60c-209c-4c75-b63c-b7f73b2e1a56"),
            asDreamwellPromptKey("return-void-card"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].void,
          resolve: ([id], ctx) =>
            id !== undefined
              ? [
                  {
                    kind: "MOVE_CARD_TO_ZONE",
                    battleCardId: asBattleCardId(id),
                    destination: { side: ctx.side, zone: "hand" },
                  },
                ]
              : [],
        },
      },
    ],
  },

  // Verdant Hollow — Return an EVENT from your void to hand.
  "a0fbcbd9-96ee-4392-add7-e1d436f99553": {
    id: asDreamwellCardId("a0fbcbd9-96ee-4392-add7-e1d436f99553"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId("a0fbcbd9-96ee-4392-add7-e1d436f99553"),
            asDreamwellPromptKey("return-event"),
          ),
          count: 1,
          optional: false,
          candidates: (ctx) => eventsInVoid(ctx.state, ctx.side),
          resolve: ([id], ctx) =>
            id !== undefined
              ? [
                  {
                    kind: "MOVE_CARD_TO_ZONE",
                    battleCardId: asBattleCardId(id),
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
  [SILENT_WINTER_ID]: {
    id: SILENT_WINTER_ID,
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId(SILENT_WINTER_ID),
            asDreamwellPromptKey("banish-enemy-character"),
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
                battleCardId: asBattleCardId(id),
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
                battleCardId: asBattleCardId(id),
                destination: { side: target.owner, zone: "banished" },
              },
            ];
          },
        },
      },
    ],
  },

  // Shining Beacon — Reveal top 2; pick 1 to hand, the other to bottom of deck.
  "3a4293da-55a1-4094-898a-df402ffa1c92": {
    id: asDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: prompt(
            asDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92"),
            asDreamwellPromptKey("pick-card-for-hand"),
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
                battleCardId: asBattleCardId(chosenId),
                destination: { side: ctx.side, zone: "hand" },
              },
            ];
            if (otherId !== undefined) {
              edits.push({
                kind: "MOVE_CARD_TO_ZONE",
                battleCardId: asBattleCardId(otherId),
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
  "556057bb-b134-497e-86c2-c6f30049e9e3": {
    id: asDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            asDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
            asDreamwellPromptKey("confirm-void-to-deck"),
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  asDreamwellCardId("556057bb-b134-497e-86c2-c6f30049e9e3"),
                  asDreamwellPromptKey("choose-void-for-deck"),
                ),
                count: 1,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].void,
                resolve: ([id], ctx) =>
                  id !== undefined
                    ? [
                        {
                          kind: "MOVE_CARD_TO_ZONE",
                          battleCardId: asBattleCardId(id),
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
  "20be0fdd-d691-40a9-b4f8-15689ea7ebaa": {
    id: asDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            asDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
            asDreamwellPromptKey("confirm-abandon-and-draw"),
            { count: 2 },
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  asDreamwellCardId("20be0fdd-d691-40a9-b4f8-15689ea7ebaa"),
                  asDreamwellPromptKey("choose-character-to-abandon"),
                ),
                count: 1,
                optional: false,
                candidates: (ctx) => alliesInPlay(ctx.state, ctx.side),
                resolve: ([id]) =>
                  id !== undefined
                    ? [{ kind: "ABANDON", battleCardId: asBattleCardId(id) }]
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
  "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c": {
    id: asDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "choice",
          label: prompt(
            asDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
            asDreamwellPromptKey("choose-benefit"),
            { amount: 2 },
          ),
          options: [
            {
              label: promptChoice(
                asDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
                asDreamwellPromptKey("choose-benefit"),
                asDreamwellChoiceKey("draw-card"),
                { amount: 2 },
              ),
              build: (ctx) => drawEdits(ctx.side, 1),
            },
            {
              label: promptChoice(
                asDreamwellCardId("af2ef62f-d31b-4544-a2b0-f5aab03c2d7c"),
                asDreamwellPromptKey("choose-benefit"),
                asDreamwellChoiceKey("gain-energy"),
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
  "446095b1-ec4d-40d7-8eed-a8221d339ea2": {
    id: asDreamwellCardId("446095b1-ec4d-40d7-8eed-a8221d339ea2"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            asDreamwellCardId("446095b1-ec4d-40d7-8eed-a8221d339ea2"),
            asDreamwellPromptKey("redraw-hand"),
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
  "f9b479cf-02cb-40e1-bb64-70b29977bf15": {
    id: asDreamwellCardId("f9b479cf-02cb-40e1-bb64-70b29977bf15"),
    steps: [{ kind: "prompt", prompt: { kind: "foresee", count: 1 } }],
  },

  // Ruin Tree — You may play a ≤2● character from your void.
  // No energy is charged (the Dreamwell grants the play). The played card's own
  // ability is left for the operator to resolve, consistent with planCardPlay.
  "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5": {
    id: asDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: prompt(
            asDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
            asDreamwellPromptKey("confirm-play-void-character"),
          ),
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: prompt(
                  asDreamwellCardId("fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5"),
                  asDreamwellPromptKey("choose-void-character"),
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
                          battleCardId: asBattleCardId(id),
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
};

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
