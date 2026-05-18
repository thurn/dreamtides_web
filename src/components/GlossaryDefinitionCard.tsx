import type { GlossaryEntry } from "../data/glossary";

/**
 * Shared visual card used to render a single glossary entry as a
 * term-and-definition tile.
 *
 * Two surfaces consume this component so both stay visually consistent:
 *   * `RulesText.tsx` shows it inside a hover popover when the player
 *     hovers an underlined gameplay term inside card / Dreamcaller /
 *     Dreamsign rules text.
 *   * `GlossaryPopup.tsx` shows it once per entry in the glossary popup
 *     opened from the HUD.
 *
 * Keeping the card here means tweaks to typography or chrome propagate
 * to both surfaces automatically.
 */
export function GlossaryDefinitionCard({
  entry,
}: {
  entry: GlossaryEntry;
}) {
  return (
    <div
      className="rounded-md px-3 py-2 text-xs leading-snug shadow-lg"
      style={{
        background: "rgba(15, 10, 24, 0.96)",
        border: "1px solid rgba(168, 85, 247, 0.55)",
        color: "#e2e8f0",
        boxShadow: "0 8px 22px rgba(0, 0, 0, 0.55)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: "#c4b5fd" }}
      >
        {entry.term}
      </p>
      <p className="mt-1" style={{ color: "#f8fafc" }}>
        {entry.definition}
      </p>
    </div>
  );
}
