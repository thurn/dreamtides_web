// Tunable constants shared by every pool-generation variant, kept in sync with
// the Node script `scripts/generate-color-pool.mjs`. Per-variant knobs live with
// their variant module; only the algorithm-wide constants are collected here.

export const LO = 180;
export const HI = 220;
export const COLORS = "wubrg";
export const K_WEIGHTS: Record<number, number> = {
  1: 0.1,
  2: 0.5,
  3: 0.32,
  4: 0.08,
};
export const T_ON = 0.55; // archetype is "on-color" if >= this fraction is legal
export const TOPK = 3; // sample among the best neighbors in the theme walk
export const ALPHA = 1.0; // weight exponent on overlap score
export const JIT = 15; // how far below the ceiling the random target may fall

// Mechanic-archetype tide base name -> theme key. The key matches the historical
// archetype-list basename so theme labels (e.g. "A:discard-madness") are stable.
export const TIDE_TO_ARCHETYPE = new Map<string, string>([
  ["Abandon", "abandon"],
  ["Blink", "blink"],
  ["Celestial Reverie Combo", "celestial-reverie-combo"],
  ["Cheap Characters", "cheap-characters"],
  ["Cindermarch / Shadow Soloist Combo", "cindermarch-shadow-soloist-combo"],
  ["Discard / Madness", "discard-madness"],
  ["Events", "events"],
  ["Fading Farewell", "fading-farewell"],
  ["Outsiders", "outsiders"],
  ["Reclaim Combo", "reclaim-combo"],
  ["Spirit Animals", "spirit-animals"],
  ["Storm", "storm"],
  ["Survivors", "survivors"],
  ["Wake the Fallen / Shadow March Combo", "wake-the-fallen-combo"],
  ["Warrior Aggro", "warrior-aggro"],
  ["Warrior Combo", "warrior-combo"],
]);
