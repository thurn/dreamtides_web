import { useMemo } from "react";
import { BattleDreamwellHistoryOverlay } from "../../cumulus/screens/battle-overlays/BattleDreamwellHistoryOverlay";
import { dreamwellCardModel } from "../ui/dreamwell-card-model";
import type { DreamwellCardDefinition } from "../types";

/**
 * A scrollable history of every Dreamwell card drawn so far this battle (rules
 * §The Dreamwell and Energy). Both players draw from the one shared, pre-shuffled
 * deck, advancing `dreamwellDeckIndex` by one per draw, so the cards revealed to
 * date are exactly `dreamwellDeck[0 .. dreamwellDeckIndex)` in draw order. The
 * list is shown most-recent-first. Because the index tracks the live battle
 * state, undo/redo shrinks or grows the history in lockstep with the board.
 */
export function BattleDreamwellHistoryDrawer({
  dreamwellDeck,
  dreamwellDeckIndex,
  isOpen,
  onClose,
}: {
  dreamwellDeck: readonly DreamwellCardDefinition[];
  dreamwellDeckIndex: number;
  isOpen: boolean;
  onClose: () => void;
}) {
  const drawnCards = useMemo(() => {
    const drawnCount = Math.min(dreamwellDeckIndex, dreamwellDeck.length);
    const cards: { readonly drawIndex: number; readonly definition: DreamwellCardDefinition }[] = [];
    // Walk from the most-recent draw back to the first so newest sits on top.
    for (let index = drawnCount - 1; index >= 0; index -= 1) {
      const definition = dreamwellDeck[index];
      if (definition === undefined) {
        continue;
      }
      cards.push({ drawIndex: index, definition });
    }
    return cards;
  }, [dreamwellDeck, dreamwellDeckIndex]);

  if (!isOpen) {
    return null;
  }

  return (
    <BattleDreamwellHistoryOverlay
      entries={drawnCards.map(({ drawIndex, definition }) => ({
        // Draw order is the stable identity here: the same UUID can recur
        // when the shared deck cycles.
        entryId: `${String(drawIndex)}:${definition.id}`,
        cardId: definition.id,
        model: dreamwellCardModel(definition),
      }))}
      onClose={onClose}
    />
  );
}
