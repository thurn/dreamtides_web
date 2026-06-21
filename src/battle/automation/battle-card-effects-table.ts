import type { BattleDebugEdit } from "../debug/commands";
import type {
  BattleCardInstance,
  BattleMutableState,
  BattleSide,
} from "../types";
import { BACK_RANK_SLOT_IDS, FRONT_RANK_SLOT_IDS } from "../types";
import { supportedDeploySlots } from "../engine/support";
import type { EffectStep, StepContext } from "./effect-step";
import {
  addGainedSparkEdits,
  alliesInPlay,
  discardHandEdits,
  drawEdits,
  erodeEdits,
  gainEnergyEdits,
  gainScoreEdits,
} from "./effect-step";
import { fnv1aHex } from "./rules-text-hash";

// ---------------------------------------------------------------------------
// Battle-card effect registry types
// ---------------------------------------------------------------------------

/**
 * Describes the static spark a supporter grants to each front-rank ally it
 * supports.
 */
export interface SupportScript {
  /** Static spark each supported front-rank ally gains from this supporter. */
  bonus: (ctx: StepContext) => number;
  /** Optional filter; defaults to all supported front-rank occupants. */
  applies?: (ally: BattleCardInstance, ctx: StepContext) => boolean;
}

/**
 * A scripted automation for a battle card, keyed in `BATTLE_CARD_EFFECTS` by
 * the card's UUID. `"dawn"`/`"materialized"` entries carry a non-empty `steps`
 * array; `"support"` entries carry a `support` object instead.
 */
export interface BattleCardEffectScript {
  /** Card UUID; equals the map key. */
  id: string;
  trigger: "dawn" | "materialized" | "support";
  /** `fnv1aHex` of the `renderedText` this script targets, for drift detection. */
  textHash: string;
  /** Ordered steps for `"dawn"`/`"materialized"` triggers. */
  steps?: EffectStep[];
  /** Spark grant for `"support"` triggers. */
  support?: SupportScript;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Battle-card effect scripts keyed by the card UUID. Each entry's `.id` equals
 * its key. `"dawn"`/`"materialized"` entries automate the named trigger via
 * their `steps`; `"support"` entries describe the static spark a supporter
 * grants to the front-rank allies it supports.
 */
export const BATTLE_CARD_EFFECTS: Record<string, BattleCardEffectScript> = {
  // Driftcaller Sovereign — "▸Dawn: Gain 1●.\n\n4●, ☪: This character gains +1✦."
  // The script automates only the ▸Dawn energy gain; the activated ability is
  // resolved manually.
  "9b9c2743-75b3-499d-b5fb-c3429c92d420": {
    id: "9b9c2743-75b3-499d-b5fb-c3429c92d420",
    trigger: "dawn",
    textHash: "71765292",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Nightmare Manifest — "▸Dawn: Gain 1●.\n\n☪, Abandon a character: Gain 1●."
  // The script automates only the ▸Dawn energy gain; the activated ability is
  // resolved manually.
  "0458658d-7e02-4286-9249-93674d16620b": {
    id: "0458658d-7e02-4286-9249-93674d16620b",
    trigger: "dawn",
    textHash: "450f3832",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Sky Voyager — "This character has all character types.\n\n▸Dawn: Gain 1●."
  // The script automates only the ▸Dawn energy gain; the all-types clause is a
  // passive resolved manually.
  "3d1fadf6-42e5-4d03-9a72-9bc25968c2b9": {
    id: "3d1fadf6-42e5-4d03-9a72-9bc25968c2b9",
    trigger: "dawn",
    textHash: "89d15de8",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Ethereal Trailblazer — "▸Dawn: Gain 1●." The script automates the ▸Dawn
  // energy gain.
  "48257e3e-9600-4edf-a905-e73a41ab5ec1": {
    id: "48257e3e-9600-4edf-a905-e73a41ab5ec1",
    trigger: "dawn",
    textHash: "1e9baa12",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Hallowed Stag — "Vengeful\n\n▸Dawn: Gain 1●." The script automates only the
  // ▸Dawn energy gain; the Vengeful keyword is resolved manually.
  "7dd2214f-8d16-453a-9f28-62712e64eae1": {
    id: "7dd2214f-8d16-453a-9f28-62712e64eae1",
    trigger: "dawn",
    textHash: "3958be2a",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Cloudmantle Ray — "▸Dawn: Gain 1●.\n\nReclaim 3●" The script automates only
  // the ▸Dawn energy gain; Reclaim is resolved manually.
  "86fd585b-e9d0-4dc1-bce9-488014b9316d": {
    id: "86fd585b-e9d0-4dc1-bce9-488014b9316d",
    trigger: "dawn",
    textHash: "5fc5d2a1",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Worldsong Behemoth — "▸Dawn: Gain 1●." The script automates the ▸Dawn
  // energy gain.
  "b5fbff03-f850-4627-94eb-12ed4dc15334": {
    id: "b5fbff03-f850-4627-94eb-12ed4dc15334",
    trigger: "dawn",
    textHash: "1e9baa12",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Starchaser — "Veil 2●\n\n▸Dawn: Gain 1●." The script automates only the
  // ▸Dawn energy gain; the Veil keyword is resolved manually.
  "cea847ef-2d1f-45d2-a0e0-fe9ce3fec55c": {
    id: "cea847ef-2d1f-45d2-a0e0-fe9ce3fec55c",
    trigger: "dawn",
    textHash: "25db0d09",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Starrunner — "▸Dawn: Gain 1●.\n\nAbandon this character: Gain 1●.\n\nReclaim
  // 0●" The script automates only the ▸Dawn energy gain; the activated abandon
  // ability and Reclaim are resolved manually.
  "d30bd488-f921-49cb-a44f-353c54cb6548": {
    id: "d30bd488-f921-49cb-a44f-353c54cb6548",
    trigger: "dawn",
    textHash: "c63ad125",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Blazebound Sentinel — "▸Dawn: Gain 1●.\n\n▸Dissolved: Gain 1●." The script
  // automates only the ▸Dawn energy gain; the ▸Dissolved trigger is resolved
  // manually.
  "f0165a60-df1c-41db-87bb-a784c26835a5": {
    id: "f0165a60-df1c-41db-87bb-a784c26835a5",
    trigger: "dawn",
    textHash: "a2d358e4",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Fern Treader — "Awakened\n\n▸Dawn: Gain 1●." The script automates only the
  // ▸Dawn energy gain; the Awakened keyword is resolved manually.
  "f256a0e7-e396-492b-8881-284ecd36025b": {
    id: "f256a0e7-e396-492b-8881-284ecd36025b",
    trigger: "dawn",
    textHash: "099dc114",
    steps: [{ kind: "edits", build: (ctx) => gainEnergyEdits(ctx.side, 1) }],
  },

  // Runebound Champion — "▸Dawn: Gain 1⍟." The script automates the ▸Dawn score
  // gain.
  "a28ad36d-fa74-4190-a463-7efd3a6233d0": {
    id: "a28ad36d-fa74-4190-a463-7efd3a6233d0",
    trigger: "dawn",
    textHash: "ce8fae02",
    steps: [{ kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 1) }],
  },

  // Inferno's Herald — "▸Dawn: This character gains +1✦.\n\n▸Dissolved:
  // Materialize a 1✦ warrior figment for each ✦ this character has." The script
  // automates only the ▸Dawn self-spark gain; the ▸Dissolved trigger is resolved
  // manually.
  "01a8482b-5b4f-4c49-8791-2702cb5dfd3d": {
    id: "01a8482b-5b4f-4c49-8791-2702cb5dfd3d",
    trigger: "dawn",
    textHash: "eb275e6f",
    steps: [
      {
        kind: "edits",
        build: (ctx) =>
          ctx.sourceId !== undefined ? addGainedSparkEdits(ctx.sourceId, 1, ctx.state) : [],
      },
    ],
  },

  // Wired Duelist — "▸Dawn: This character gains +1✦.\n\n▸Dissolved: Give an
  // ally +X✦ where X is this character's ✦." The script automates only the
  // ▸Dawn self-spark gain; the ▸Dissolved trigger is resolved manually.
  "cb2d9f1e-8888-44c7-9918-57b2ec8c78e1": {
    id: "cb2d9f1e-8888-44c7-9918-57b2ec8c78e1",
    trigger: "dawn",
    textHash: "ddbe3704",
    steps: [
      {
        kind: "edits",
        build: (ctx) =>
          ctx.sourceId !== undefined ? addGainedSparkEdits(ctx.sourceId, 1, ctx.state) : [],
      },
    ],
  },

  // Ashwalker — "▸Materialized: Erode 3.\n\n▸Dissolved: Return a character from
  // your void to your hand." The script automates only the ▸Materialized Erode.
  "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40": {
    id: "1cfc72e9-b75c-4d55-8bcf-54bb301d7e40",
    trigger: "materialized",
    textHash: "8d143597",
    steps: [{ kind: "edits", build: ({ side }) => [{ kind: "ERODE", side, count: 3 }] }],
  },

  // Nocturne — "▸Materialized: Erode 1.\n\nReclaim 0●" The script automates only
  // the ▸Materialized Erode; Reclaim is resolved manually.
  "19aeffa6-fd1b-4b8f-bb0c-c35659521976": {
    id: "19aeffa6-fd1b-4b8f-bb0c-c35659521976",
    trigger: "materialized",
    textHash: "cbaf761c",
    steps: [{ kind: "edits", build: (ctx) => erodeEdits(ctx.side, 1) }],
  },

  // Pit Descender — "▸Materialized: Erode 3.\n\n☪, Abandon a warrior: Materialize
  // a ≤2● cost warrior from your void." The script automates only the
  // ▸Materialized Erode; the activated ability is resolved manually.
  "81074582-dfb3-497c-8c04-f97a24d6b1d4": {
    id: "81074582-dfb3-497c-8c04-f97a24d6b1d4",
    trigger: "materialized",
    textHash: "df9a14d1",
    steps: [{ kind: "edits", build: (ctx) => erodeEdits(ctx.side, 3) }],
  },

  // Echo Technician — "▸Materialized: Erode 4.\n\n☪: You may play an event from
  // your void." The script automates only the ▸Materialized Erode; the activated
  // ability is resolved manually.
  "cd3d8e4a-618e-4c2f-be60-0363b81887f1": {
    id: "cd3d8e4a-618e-4c2f-be60-0363b81887f1",
    trigger: "materialized",
    textHash: "bfd5c961",
    steps: [{ kind: "edits", build: (ctx) => erodeEdits(ctx.side, 4) }],
  },

  // Veilseeker — "▸Materialized: Erode 3.\n\n5●, ☪, Abandon this character:
  // Return all ≤2● cost characters from your void to play." The script automates
  // only the ▸Materialized Erode; the activated ability is resolved manually.
  "d8c90a33-a581-469a-9fd3-9a80d1cc5315": {
    id: "d8c90a33-a581-469a-9fd3-9a80d1cc5315",
    trigger: "materialized",
    textHash: "1318518f",
    steps: [{ kind: "edits", build: (ctx) => erodeEdits(ctx.side, 3) }],
  },

  // Sigil Analyst — "▸Materialized: Draw 2 cards." The script automates the
  // ▸Materialized draw.
  "1b4d2adc-64ab-4020-bae6-b35321898bf0": {
    id: "1b4d2adc-64ab-4020-bae6-b35321898bf0",
    trigger: "materialized",
    textHash: "be73bf85",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 2) }],
  },

  // Sage of the Prelude — "Vengeful\n\n▸Materialized: Draw a card." The script
  // automates only the ▸Materialized draw; the Vengeful keyword is resolved
  // manually.
  "41d0aa36-f15a-487d-b97c-7fd765973921": {
    id: "41d0aa36-f15a-487d-b97c-7fd765973921",
    trigger: "materialized",
    textHash: "788b248f",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Looming Oracle — "Veil 2●\n\n▸Materialized: Draw a card." The script
  // automates only the ▸Materialized draw; the Veil keyword is resolved
  // manually.
  "4b20e66e-2466-4518-8ef9-67f580bd6f14": {
    id: "4b20e66e-2466-4518-8ef9-67f580bd6f14",
    trigger: "materialized",
    textHash: "ef3b6d38",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Verdant Wayfarer — "▸Materialized: Draw 2 cards.\n\nReclaim – 3●, Banish 7
  // cards from your void." The script automates only the ▸Materialized draw;
  // Reclaim is resolved manually.
  "713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc": {
    id: "713b9f42-b0a0-4c0a-bc2e-89e0ac8a2dbc",
    trigger: "materialized",
    textHash: "f7d16dbb",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 2) }],
  },

  // Dreamvale Monarch — "▸Materialized: Draw a card." The script automates the
  // ▸Materialized draw.
  "965ce3b2-a722-475c-99c5-5b35685d2404": {
    id: "965ce3b2-a722-475c-99c5-5b35685d2404",
    trigger: "materialized",
    textHash: "28a4b0a7",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Seeker of the Radiant Wilds — "Vengeful\n\n▸Materialized: Draw a card." The
  // script automates only the ▸Materialized draw; the Vengeful keyword is
  // resolved manually.
  "b049ba66-9334-4dd1-a7d8-6d8b32d9a0a9": {
    id: "b049ba66-9334-4dd1-a7d8-6d8b32d9a0a9",
    trigger: "materialized",
    textHash: "788b248f",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Frost Visionary — "▸Materialized: Draw a card." The script automates the
  // ▸Materialized draw.
  "bbf83d18-81b6-48c8-886f-4b9f0feb599f": {
    id: "bbf83d18-81b6-48c8-886f-4b9f0feb599f",
    trigger: "materialized",
    textHash: "28a4b0a7",
    steps: [{ kind: "edits", build: (ctx) => drawEdits(ctx.side, 1) }],
  },

  // Rusted Monolith — "▸Materialized: Gain 1⍟.\n\nReclaim 0●" The script
  // automates only the ▸Materialized score gain; Reclaim is resolved manually.
  "2a828466-450a-4637-9c68-6b54522450c0": {
    id: "2a828466-450a-4637-9c68-6b54522450c0",
    trigger: "materialized",
    textHash: "1d11f9ff",
    steps: [{ kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 1) }],
  },

  // Scrapyard Custodian — "▸Materialized: Gain 1⍟.\n\nAbandon a spirit animal:
  // Materialize this character from your void." The script automates only the
  // ▸Materialized score gain; the activated ability is resolved manually.
  "ecf77f27-df0f-47c4-99c2-48d7fa46a137": {
    id: "ecf77f27-df0f-47c4-99c2-48d7fa46a137",
    trigger: "materialized",
    textHash: "756fa549",
    steps: [{ kind: "edits", build: (ctx) => gainScoreEdits(ctx.side, 1) }],
  },

  // Urban Cipher — "▸Materialized: Discard your hand, then draw 3 cards." The
  // script discards the whole hand first, then draws 3 (order matters).
  "8adfa141-6864-4f5f-a9ca-59306eaf5432": {
    id: "8adfa141-6864-4f5f-a9ca-59306eaf5432",
    trigger: "materialized",
    textHash: "2c952295",
    steps: [
      {
        kind: "edits",
        build: (ctx) => [...discardHandEdits(ctx.side, ctx.state), ...drawEdits(ctx.side, 3)],
      },
    ],
  },

  // Ringwatcher — "▸Materialized: Foresee 1." The script automates the
  // ▸Materialized Foresee; the runner pauses on the prompt step and surfaces the
  // foresee overlay.
  "647f5150-b2e0-424b-9480-27557642524e": {
    id: "647f5150-b2e0-424b-9480-27557642524e",
    trigger: "materialized",
    textHash: "153cdaf2",
    steps: [{ kind: "prompt", prompt: { kind: "foresee", count: 1 } }],
  },

  // Planetgazer — "▸Materialized: Foresee 2.\n\n❖ – 1●: Move this character to
  // an unoccupied character position." The script automates only the
  // ▸Materialized Foresee (the runner pauses on the prompt step and surfaces the
  // foresee overlay); the ❖ move ability is resolved manually.
  "8cb543d7-e70b-4526-b473-bb17dcaee2a7": {
    id: "8cb543d7-e70b-4526-b473-bb17dcaee2a7",
    trigger: "materialized",
    textHash: "86e1b469",
    steps: [{ kind: "prompt", prompt: { kind: "foresee", count: 2 } }],
  },

  // Eternal Stag — "Support – Supported spirit animals have +1✦.\n\n2●, ☪: Draw
  // a spirit animal." Supported front-rank allies whose subtype is "Spirit
  // Animal" gain +1 spark.
  "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6": {
    id: "4e3c04a9-1cdd-468a-b42a-40157ed9c9d6",
    trigger: "support",
    textHash: "77e9432c",
    support: {
      bonus: () => 1,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },

  // Woodland Apparition — "Support – Supported allies have +2✦ and
  // unstoppable.\n\nReclaim – 3●, Banish 3 cards from your void." The script
  // grants the +2 spark to every supported ally; the unstoppable grant is
  // resolved manually.
  "1268a899-b209-46bb-bce4-6def1dcd0404": {
    id: "1268a899-b209-46bb-bce4-6def1dcd0404",
    trigger: "support",
    textHash: "c1e261ae",
    support: {
      bonus: () => 2,
    },
  },

  // Nocturne Strummer — "Support – Supported allies have +2✦." Grants +2
  // spark to every supported front-rank ally (no subtype restriction).
  "5a980eff-6ec7-44d8-9977-b98e66bbc2c8": {
    id: "5a980eff-6ec7-44d8-9977-b98e66bbc2c8",
    trigger: "support",
    textHash: "193da238",
    support: {
      bonus: () => 2,
    },
  },

  // Dreadmount Sovereign — "This character costs 1● less for each allied
  // warrior.\n\nSupport – Supported warriors have +3✦." The script grants +3
  // spark to supported front-rank "Warrior" allies; the cost-reduction clause
  // is resolved manually.
  "6497d8b1-85b8-486d-99e2-5c141486d508": {
    id: "6497d8b1-85b8-486d-99e2-5c141486d508",
    trigger: "support",
    textHash: "6a53a8c1",
    support: {
      bonus: () => 3,
      applies: (ally) => ally.definition.subtype === "Warrior",
    },
  },

  // Ash Sower — "Support – Supported allies have +3✦.\n\n❖ – Abandon an ally:
  // Move this character to the abandoned ally's position." The script grants +3
  // spark to every supported front-rank ally; the ❖ activated ability is
  // resolved manually.
  "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd": {
    id: "8c9ef6a8-d93e-4149-a965-0bdbe2acf6bd",
    trigger: "support",
    textHash: "3b26d8b7",
    support: {
      bonus: () => 3,
    },
  },

  // Battlefield Medic — "Support – Supported allies have +2✦.\n\n❖ – 1●: Move
  // this character to an unoccupied character position." The script grants +2
  // spark to every supported front-rank ally; the ❖ activated ability is
  // resolved manually.
  "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f": {
    id: "c61c8b29-6911-4bbf-b1c4-0c18b22ed33f",
    trigger: "support",
    textHash: "3fb58b48",
    support: {
      bonus: () => 2,
    },
  },

  // Ghostlight Wolves — "Support – Supported spirit animals have +2✦.\n\n☪:
  // Gain 1● for each allied spirit animal." The script grants +2 spark to
  // supported front-rank "Spirit Animal" allies; the ☪ activated ability is
  // resolved manually.
  "c8579b20-95ff-4b1d-b4c6-6bd049fc4760": {
    id: "c8579b20-95ff-4b1d-b4c6-6bd049fc4760",
    trigger: "support",
    textHash: "cfb223c7",
    support: {
      bonus: () => 2,
      applies: (ally) => ally.definition.subtype === "Spirit Animal",
    },
  },
};

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * Returns the registered cards whose live `renderedText` differs from the hash
 * stored in `BATTLE_CARD_EFFECTS`. `cardsById` maps card UUID → its current
 * `renderedText`. A card that is registered here but absent from `cardsById` is
 * reported with `actual: null` (missing from the catalog). An empty result
 * means every registered script still matches its target card's rules text.
 */
export function collectAutomationHashDrift(
  cardsById: ReadonlyMap<string, string>,
): { id: string; expected: string; actual: string | null }[] {
  const drift: { id: string; expected: string; actual: string | null }[] = [];
  for (const [id, script] of Object.entries(BATTLE_CARD_EFFECTS)) {
    const text = cardsById.get(id);
    const actual = text === undefined ? null : fnv1aHex(text);
    if (actual !== script.textHash) {
      drift.push({ id, expected: script.textHash, actual });
    }
  }
  return drift;
}

/**
 * Returns the `BattleCardEffectScript` for `cardId` if one exists, else `null`.
 */
export function selectBattleCardEffectScript(cardId: string): BattleCardEffectScript | null {
  return BATTLE_CARD_EFFECTS[cardId] ?? null;
}

/**
 * A Dawn script is interactive if any of its steps needs a player choice.
 * Interactive Dawn scripts run through the runner post-dawn, NOT the bookend
 * (the synchronous bookend produces a flat `BattleDebugEdit[]` and cannot pause
 * for a prompt). A script with only `edits` steps is deterministic.
 */
export function dawnScriptIsInteractive(script: BattleCardEffectScript): boolean {
  return (script.steps ?? []).some((s) => s.kind === "prompt");
}

/**
 * Edits from the active side's in-play ▸Dawn characters when automation resolves
 * the Dawn bookend. For each in-play character (front + back rank) of `side`
 * whose `definition.cardId` has a registered `"dawn"` script, runs each
 * edits-step `build(ctx)` and concatenates them, in stable slot order
 * (`alliesInPlay`: back rank then front rank). The `random`/`nowMs` injected
 * into the step context keep the builders pure.
 *
 * Interactive Dawn scripts (those with a `prompt` step, per
 * `dawnScriptIsInteractive`) are skipped ENTIRELY here — not even their
 * deterministic edits steps run — because they are routed through the React
 * runner post-dawn (`useBattleEffectRunner`). Contributing any of a mixed
 * deterministic+interactive script's edits here would double-apply them (once
 * in the bookend, again in the runner). Any other non-edits step in a
 * deterministic script is skipped defensively with a `console.warn`.
 */
export function collectDawnTriggerEdits(
  state: BattleMutableState,
  side: BattleSide,
  nowMs: number,
): BattleDebugEdit[] {
  const edits: BattleDebugEdit[] = [];
  for (const occupantId of alliesInPlay(state, side)) {
    const instance = state.cardInstances[occupantId];
    if (instance === undefined) continue;
    const script = selectBattleCardEffectScript(instance.definition.cardId);
    if (script === null || script.trigger !== "dawn" || script.steps === undefined) {
      continue;
    }
    // Interactive Dawn scripts run through the runner post-dawn; skip them
    // wholesale here so a mixed script is never half-applied in the bookend.
    if (dawnScriptIsInteractive(script)) continue;
    // The ctx is built per occupant so `sourceId` is the character whose dawn
    // script is running, enabling self-effects (e.g. self-spark) to target it.
    const ctx: StepContext = { side, state, random: Math.random, nowMs, sourceId: occupantId };
    for (const step of script.steps) {
      if (step.kind === "edits") {
        edits.push(...step.build(ctx));
      } else {
        console.warn(
          `collectDawnTriggerEdits: skipping non-edits step kind "${step.kind}" for card ${instance.definition.cardId}`,
        );
      }
    }
  }
  return edits;
}

/**
 * Returns the automation status of a battle card:
 * - `"auto"` — a script exists in `BATTLE_CARD_EFFECTS`.
 * - `"none"` — the card id is unregistered.
 */
export function battleCardAutomationStatus(cardId: string): "auto" | "none" {
  return cardId in BATTLE_CARD_EFFECTS ? "auto" : "none";
}

// ---------------------------------------------------------------------------
// Support recompute
// ---------------------------------------------------------------------------

/**
 * Computes the `SET_CARD_STATIC_SPARK_BONUS` edits needed to bring every
 * in-play instance's `staticSparkBonus` to its correct Support total. "In-play"
 * means front- and back-rank occupants of both sides; hand/void/deck instances
 * are never touched. Returns only the edits where the target differs from the
 * current value, so it is idempotent: calling it on a state whose bonuses
 * already match the computed targets emits an empty list (the runner that calls
 * it does not loop). When `enabled` is `false` every target is `0`, clearing any
 * prior bonus. Only back-rank Supporters with a registered `"support"` script
 * grant spark, and only to the front-rank occupants of the slots they support
 * that pass the script's optional `applies` predicate. Iteration follows
 * `BACK_RANK_SLOT_IDS`/`FRONT_RANK_SLOT_IDS` order for deterministic output.
 */
export function planSupportRecompute(
  state: BattleMutableState,
  enabled: boolean,
  nowMs: number,
): BattleDebugEdit[] {
  const sides: BattleSide[] = ["player", "enemy"];

  // 1. Default every in-play instance to a target of 0.
  const targets = new Map<string, number>();
  for (const side of sides) {
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) targets.set(id, 0);
    }
  }

  // 2. Accumulate Support bonuses from back-rank Supporters onto front allies.
  if (enabled) {
    for (const side of sides) {
      const ctx: StepContext = { side, state, random: Math.random, nowMs };
      for (const backSlot of BACK_RANK_SLOT_IDS) {
        const supporterId = state.sides[side].backRank[backSlot];
        if (supporterId === null) continue;
        const supporter = state.cardInstances[supporterId];
        if (supporter === undefined) continue;
        const script = selectBattleCardEffectScript(supporter.definition.cardId);
        if (script === null || script.trigger !== "support" || script.support === undefined) {
          continue;
        }
        const support = script.support;
        for (const frontSlot of supportedDeploySlots(backSlot)) {
          const allyId = state.sides[side].frontRank[frontSlot];
          if (allyId === null) continue;
          const ally = state.cardInstances[allyId];
          if (ally === undefined) continue;
          if (support.applies !== undefined && !support.applies(ally, ctx)) continue;
          targets.set(allyId, (targets.get(allyId) ?? 0) + support.bonus(ctx));
        }
      }
    }
  }

  // 3. Emit an edit for every instance whose current bonus differs from target.
  const edits: BattleDebugEdit[] = [];
  for (const side of sides) {
    for (const slotId of BACK_RANK_SLOT_IDS) {
      const id = state.sides[side].backRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
    for (const slotId of FRONT_RANK_SLOT_IDS) {
      const id = state.sides[side].frontRank[slotId];
      if (id !== null) pushIfChanged(edits, state, id, targets.get(id) ?? 0);
    }
  }
  return edits;
}

/** Appends a `SET_CARD_STATIC_SPARK_BONUS` edit when `target` differs from the
 *  instance's current `staticSparkBonus`. */
function pushIfChanged(
  edits: BattleDebugEdit[],
  state: BattleMutableState,
  battleCardId: string,
  target: number,
): void {
  const instance = state.cardInstances[battleCardId];
  if (instance === undefined) return;
  // Support does not apply to figments (rules §Support); a figment's
  // `staticSparkBonus` is its per-figment anthem, which the Support recompute
  // must not overwrite.
  if (instance.provenance?.kind === "generated-figment") return;
  if (instance.staticSparkBonus === target) return;
  edits.push({ kind: "SET_CARD_STATIC_SPARK_BONUS", battleCardId, value: target });
}
