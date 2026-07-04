import type { GlossaryEntry } from "../../../data/glossary";
import { RulesText } from "./RulesText";

/**
 * Shared visual card used to render a single glossary entry as a
 * term-and-definition tile.
 *
 * Several surfaces consume this component so they stay visually consistent:
 *   * `CardTermDefinitions` stacks one per gameplay term in the hover-help
 *     panel that appears beside a card (full cards, compact-row previews, and
 *     the battle card preview).
 *   * `GlossaryPopup.tsx` shows it once per entry in the glossary popup
 *     opened from the HUD.
 *   * `JourneyHoverCard` lists the terms referenced by a journey tooltip.
 *
 * Keeping the card here means tweaks to typography or chrome propagate
 * to every surface automatically.
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
        className="text-xs font-bold"
        style={{ color: "#c4b5fd" }}
      >
        {entry.term}
      </p>
      {/* Render through the shared rules-text renderer so glyphs in a
          definition (the lunar ☪ in "Awakened", the spark ✦, energy ●, etc.)
          are swapped for the same Boxicons marks shown in card rules text,
          instead of printing the raw Unicode character. */}
      <div className="mt-1" style={{ color: "#f8fafc" }}>
        <RulesText text={entry.definition} />
      </div>
    </div>
  );
}
