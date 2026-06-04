import type { BattleCardInstance } from "../types";

/**
 * Conservative detector: returns true when a card's rules text contains a
 * marker that the AI engine cannot model, so a downstream proposal can pause
 * and let the human play the card instead.
 *
 * The function is PURE — it only reads the card instance, never mutates state.
 * It defaults to pausing (false negatives are the dangerous failure mode).
 *
 * Glyphs confirmed against public/cards_v2-data.json:
 *   ▸  U+25B8 — triggered-ability marker ("▸Dawn:", "▸Challenge:", …)
 *   –  U+2013 — en dash keyword/ability separator ("Support – …", "Reclaim – …")
 *   ✦  U+2726 — spark glyph used in "+N✦" static buffs
 */
export function needsManualResolution(
  instance: BattleCardInstance,
  modeledCardNumbers: ReadonlySet<number>, // the AI's Starter card numbers — always safe
): boolean {
  // Fast path: the AI has a full model for every Starter card; no pause needed.
  if (modeledCardNumbers.has(instance.definition.cardNumber)) {
    return false;
  }

  const text = instance.definition.renderedText;

  // Vanilla body — nothing to check.
  if (!text || !text.trim()) {
    return false;
  }

  // ── Rule 1: triggered-ability marker ▸ (U+25B8) ──────────────────────────
  // Any "▸Trigger:" line introduces a triggered ability the AI cannot schedule.
  if (text.includes("▸")) {
    return true;
  }

  // ── Rule 2: en-dash keyword separator – (U+2013) ──────────────────────────
  // Keyword abilities formatted as "Keyword – <reminder text>" (e.g. Support,
  // Reclaim, Awakened) signal a static or activated ability the AI does not model.
  if (text.includes("–")) {
    return true;
  }

  // ── Rule 3: resolution keywords (case-insensitive whole-word match) ────────
  // Unstoppable, Vengeful, and Preeminence modify how combat resolution or
  // zone transitions work; the engine cannot apply them without special logic.
  if (/\b(?:unstoppable|vengeful|preeminence)\b/i.test(text)) {
    return true;
  }

  // ── Rule 4: static spark bonus +<digits>✦ ─────────────────────────────────
  // A literal "+N✦" phrase means the card grants a permanent or conditional
  // spark bonus the AI's heuristic scoring does not account for.
  // Note: "+X✦" (variable, non-numeric) is intentionally excluded — the AI
  // cannot compute X anyway and those cards will usually be caught by another
  // rule (triggered ability or keyword) in practice.
  if (/\+\d+✦/.test(text)) {
    return true;
  }

  return false;
}
