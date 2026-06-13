import { selectBattleCardInstance } from "../state/selectors";
import { selectDefaultCharacterPlaySlot } from "../state/selectors";
import type { BattleDebugEdit } from "../debug/commands";
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
import type { DreamwellEffectScript } from "./dreamwell-effects";

// ---------------------------------------------------------------------------
// Deterministic dreamwell effect table
// ---------------------------------------------------------------------------

/**
 * UUIDs of dreamwell cards whose effects require player input (prompt steps).
 * These are excluded from `DREAMWELL_EFFECTS`; `dreamwellAutomationStatus`
 * returns `"manual"` for these ids.
 */
export const DREAMWELL_MANUAL_IDS = new Set<string>([
  "f61431f3-33bd-42ff-a229-b4013582e86e", // Forest Trailhead
  "8f5f2e26-44b5-447b-90d0-eaf22ab29fed", // Sunlit Archive
  "2ad68489-044a-40d1-9be6-e62497a4e1fd", // Echo Cascade
  "14dec460-3ec6-40c1-978f-67e70cb0b227", // Firmament Mirror
]);

/**
 * Dreamwell effect scripts keyed by the dreamwell card UUID. Each entry's
 * `.id` equals its key. The table contains both deterministic `edits` steps
 * and interactive `prompt` steps resolved by the runner; the runner walks each
 * step in order, applying edits immediately and pausing on prompts until the
 * player resolves them.
 */
export const DREAMWELL_EFFECTS: Record<string, DreamwellEffectScript> = {
  // Meteor Meadow — Draw a card.
  "5ec17498-9028-4a01-80a0-67c91b03d505": {
    id: "5ec17498-9028-4a01-80a0-67c91b03d505",
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
    ],
  },

  // Autumn Glade — +2⍟ score (active side).
  "02e8ea92-1218-413c-9f0b-4c865a3921d3": {
    id: "02e8ea92-1218-413c-9f0b-4c865a3921d3",
    steps: [
      { kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 2) },
    ],
  },

  // Twilight Radiance — +1● current energy.
  "de98477c-e216-4618-bff1-0e24bd982fdb": {
    id: "de98477c-e216-4618-bff1-0e24bd982fdb",
    steps: [
      { kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) },
    ],
  },

  // Prismatic Pastures — +3● current energy.
  "d585b78a-dfe3-4e12-95ac-432c3c880540": {
    id: "d585b78a-dfe3-4e12-95ac-432c3c880540",
    steps: [
      { kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 3) },
    ],
  },

  // The Voltsurge — Each side draws 2.
  "7171ff89-ebe4-42d0-8863-9b4b0531cad2": {
    id: "7171ff89-ebe4-42d0-8863-9b4b0531cad2",
    steps: [
      {
        kind: "edits",
        build: (_ctx) => [
          ...drawEdits("player", 2),
          ...drawEdits("enemy", 2),
        ],
      },
    ],
  },

  // Shadow Passage — Erode 3 (active side).
  "03e4e701-4720-4278-8198-9b7e0514d4cf": {
    id: "03e4e701-4720-4278-8198-9b7e0514d4cf",
    steps: [
      { kind: "edits", build: ({ side }) => [{ kind: "ERODE", side, count: 3 }] },
    ],
  },

  // The Brimming Well — Opponent +1 max ● (ADJUST_MAX_ENERGY +1 on opponent).
  "a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf": {
    id: "a9c254c4-8448-40ea-bb1a-08c0ef8c7bdf",
    steps: [
      { kind: "edits", build: (ctx) => [{ kind: "ADJUST_MAX_ENERGY", side: opponentOf(ctx.side), amount: 1 }] },
    ],
  },

  // Glimmering Horizon — If <2 in hand, draw until 2.
  "cf0f0a05-2a94-407c-8c22-e41b925f9c03": {
    id: "cf0f0a05-2a94-407c-8c22-e41b925f9c03",
    steps: [
      { kind: "edits", build: (ctx) => drawUntilEdits(ctx.state, ctx.side, 2) },
    ],
  },

  // Wellspring Commons — Each side draws until ≥3 in hand.
  "06e62e45-53f9-4264-9aa6-2575b445332a": {
    id: "06e62e45-53f9-4264-9aa6-2575b445332a",
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
    id: "eae99eb2-0fa8-4d12-b7b2-3f5387cb6d3a",
    steps: [
      {
        kind: "edits",
        build: (ctx) => [{ kind: "SET_SIDE_HAND_VISIBILITY", side: opponentOf(ctx.side), isRevealedToPlayer: true }],
      },
    ],
  },

  // Foxfire Thicket — Create a 1✦ ethereal figment; skip if no open slot.
  "51caf26d-83bf-45a9-bc80-010d353277db": {
    id: "51caf26d-83bf-45a9-bc80-010d353277db",
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          const destination = selectDefaultCharacterPlaySlot(ctx.state, ctx.side);
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
    id: "a57f1276-3fb6-4527-b538-953fbace35cf",
    steps: [
      {
        kind: "edits",
        build: (ctx) => {
          return alliesInPlay(ctx.state, ctx.side).map((id) => {
            const instance = selectBattleCardInstance(ctx.state, id);
            const existing = instance?.sparkDelta ?? 0;
            return { kind: "SET_CARD_SPARK_DELTA" as const, battleCardId: id, value: existing + 1 };
          });
        },
      },
    ],
  },

  // Twin Moons — Draw a card; if it is a character, +1●. Two steps so the
  // second sees the post-draw hand (drawn card is last hand entry).
  "120ec4c2-aa7b-48f4-be9f-f39820e565ca": {
    id: "120ec4c2-aa7b-48f4-be9f-f39820e565ca",
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
      {
        kind: "edits",
        build: (ctx) => {
          const hand = ctx.state.sides[ctx.side].hand;
          const drawnId = hand[hand.length - 1];
          const drawn = selectBattleCardInstance(ctx.state, drawnId ?? null);
          return drawn?.definition.battleCardKind === "character" ? gainEnergyEdits(ctx.side, 1) : [];
        },
      },
    ],
  },

  // Celestial Gateway — Return a random character from EACH player's void to play.
  // For each side independently: pick one random void character and move to that
  // side's default play slot; skip a side with no void character or no open slot.
  "a3033051-8eb7-4fbf-93d6-f947ed68974d": {
    id: "a3033051-8eb7-4fbf-93d6-f947ed68974d",
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
            edits.push({ kind: "MOVE_CARD_TO_ZONE", battleCardId: pick, destination: slot });
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
    id: "ee1ef770-29ea-4a63-a1f9-7e97b5b8870d",
    steps: [
      { kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Choose a card to discard",
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
          resolve: ([id]) => (id !== undefined ? [{ kind: "DISCARD_CARD", battleCardId: id }] : []),
        },
      },
    ],
  },

  // Emberwake Flats — +2●, then discard 1.
  "91deefd2-0400-4c78-ab9f-f6db864ff7e2": {
    id: "91deefd2-0400-4c78-ab9f-f6db864ff7e2",
    steps: [
      { kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 2) },
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Discard a card",
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].hand,
          resolve: ([id]) => (id !== undefined ? [{ kind: "DISCARD_CARD", battleCardId: id }] : []),
        },
      },
    ],
  },

  // Sunset's Last Gaze — You may discard 2, then draw 2.
  "fa8704fe-759f-408d-992d-d8f9d5ffd760": {
    id: "fa8704fe-759f-408d-992d-d8f9d5ffd760",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Discard 2 cards, then draw 2?",
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: "Discard 2 cards",
                count: 2,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].hand,
                resolve: (ids) => ids.map((id) => ({ kind: "DISCARD_CARD" as const, battleCardId: id })),
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
    id: "2b23a60c-209c-4c75-b63c-b7f73b2e1a56",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Return a void card to hand",
          count: 1,
          optional: false,
          candidates: (ctx) => ctx.state.sides[ctx.side].void,
          resolve: ([id], ctx) =>
            id !== undefined
              ? [{ kind: "MOVE_CARD_TO_ZONE", battleCardId: id, destination: { side: ctx.side, zone: "hand" } }]
              : [],
        },
      },
    ],
  },

  // Verdant Hollow — Return an EVENT from your void to hand.
  "a0fbcbd9-96ee-4392-add7-e1d436f99553": {
    id: "a0fbcbd9-96ee-4392-add7-e1d436f99553",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Return an event from your void to hand",
          count: 1,
          optional: false,
          candidates: (ctx) => eventsInVoid(ctx.state, ctx.side),
          resolve: ([id], ctx) =>
            id !== undefined
              ? [{ kind: "MOVE_CARD_TO_ZONE", battleCardId: id, destination: { side: ctx.side, zone: "hand" } }]
              : [],
        },
      },
    ],
  },

  // Silent Winter — Banish an enemy until end of turn.
  // v1 limitation: no temporary-banish primitive; the card is moved to `banished`
  // permanently and the operator returns it manually at end of turn.
  "9954cede-8a16-4053-b6e9-da745f4540f5": {
    id: "9954cede-8a16-4053-b6e9-da745f4540f5",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Banish an enemy character",
          count: 1,
          optional: false,
          candidates: (ctx) => enemyCharactersInPlay(ctx.state, ctx.side),
          resolve: ([id], ctx) =>
            id !== undefined
              ? [
                  {
                    kind: "MOVE_CARD_TO_ZONE",
                    battleCardId: id,
                    destination: { side: opponentOf(ctx.side), zone: "banished" },
                  },
                ]
              : [],
        },
      },
    ],
  },

  // Shining Beacon — Reveal top 2; pick 1 to hand, the other to bottom of deck.
  "3a4293da-55a1-4094-898a-df402ffa1c92": {
    id: "3a4293da-55a1-4094-898a-df402ffa1c92",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "pick-cards",
          label: "Pick a card for your hand",
          count: 1,
          optional: false,
          candidates: (ctx) => topOfDeck(ctx.state, ctx.side, 2),
          resolve: ([chosenId], ctx) => {
            if (chosenId === undefined) return [];
            const top2 = topOfDeck(ctx.state, ctx.side, 2);
            const otherIndex = top2[0] === chosenId ? 1 : 0;
            const otherId = top2[otherIndex];
            const edits: BattleDebugEdit[] = [
              { kind: "MOVE_CARD_TO_ZONE", battleCardId: chosenId, destination: { side: ctx.side, zone: "hand" } },
            ];
            if (otherId !== undefined) {
              edits.push({
                kind: "MOVE_CARD_TO_ZONE",
                battleCardId: otherId,
                destination: { side: ctx.side, zone: "deck", position: "bottom" },
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
    id: "556057bb-b134-497e-86c2-c6f30049e9e3",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Put a void card on top of your deck?",
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: "Choose a void card to put on top",
                count: 1,
                optional: false,
                candidates: (ctx) => ctx.state.sides[ctx.side].void,
                resolve: ([id], ctx) =>
                  id !== undefined
                    ? [
                        {
                          kind: "MOVE_CARD_TO_ZONE",
                          battleCardId: id,
                          destination: { side: ctx.side, zone: "deck", position: "top" },
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
    id: "20be0fdd-d691-40a9-b4f8-15689ea7ebaa",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Abandon a character to draw 2?",
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: "Choose a character to abandon",
                count: 1,
                optional: false,
                candidates: (ctx) => alliesInPlay(ctx.state, ctx.side),
                resolve: ([id]) => (id !== undefined ? [{ kind: "ABANDON", battleCardId: id }] : []),
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
    id: "af2ef62f-d31b-4544-a2b0-f5aab03c2d7c",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "choice",
          label: "Choose one",
          options: [
            { label: "Draw a card", build: (ctx) => drawEdits(ctx.side, 1) },
            { label: "Gain 2●", build: (ctx) => gainEnergyEdits(ctx.side, 2) },
          ],
        },
      },
    ],
  },

  // Fortune's Wheel — You may discard your hand, then draw that many.
  "446095b1-ec4d-40d7-8eed-a8221d339ea2": {
    id: "446095b1-ec4d-40d7-8eed-a8221d339ea2",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Discard your hand and redraw?",
          onYes: [
            {
              kind: "edits",
              build: (ctx) => {
                const handIds = ctx.state.sides[ctx.side].hand;
                const n = handIds.length;
                const discards: BattleDebugEdit[] = handIds.map((id) => ({ kind: "DISCARD_CARD", battleCardId: id }));
                const draws: BattleDebugEdit[] = Array.from({ length: n }, () => ({ kind: "DRAW_CARD" as const, side: ctx.side }));
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
    id: "f9b479cf-02cb-40e1-bb64-70b29977bf15",
    steps: [
      { kind: "prompt", prompt: { kind: "foresee", count: 1 } },
    ],
  },

  // Ruin Tree — You may play a ≤2● character from your void.
  // No energy is charged (the Dreamwell grants the play). The played card's own
  // ability is left for the operator to resolve, consistent with planCardPlay.
  "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5": {
    id: "fcce7aa2-1cb4-4a80-bda9-959f2eeb8bf5",
    steps: [
      {
        kind: "prompt",
        prompt: {
          kind: "confirm",
          label: "Play a character from your void?",
          onYes: [
            {
              kind: "prompt",
              prompt: {
                kind: "pick-cards",
                label: "Choose a character to play",
                count: 1,
                optional: false,
                candidates: (ctx) => charactersInVoid(ctx.state, ctx.side, 2),
                resolve: ([id], ctx) => {
                  const slot = selectDefaultCharacterPlaySlot(ctx.state, ctx.side);
                  return id !== undefined && slot !== null
                    ? [{ kind: "MOVE_CARD_TO_ZONE", battleCardId: id, destination: slot }]
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
export function selectDreamwellEffectScript(cardId: string): DreamwellEffectScript | null {
  return DREAMWELL_EFFECTS[cardId] ?? null;
}

/**
 * Returns the automation status of a dreamwell card:
 * - `"auto"` — a fully automated script exists in `DREAMWELL_EFFECTS`.
 * - `"manual"` — the card requires player input; id is in `DREAMWELL_MANUAL_IDS`.
 * - `"none"` — the card id is unknown / unregistered.
 */
export function dreamwellAutomationStatus(cardId: string): "auto" | "manual" | "none" {
  if (cardId in DREAMWELL_EFFECTS) return "auto";
  if (DREAMWELL_MANUAL_IDS.has(cardId)) return "manual";
  return "none";
}
