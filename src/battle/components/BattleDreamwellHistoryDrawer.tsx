import { useMemo } from "react";
import { DreamwellCard } from "../../cumulus/components/battle/DreamwellCard";
import { GlassDialog } from "../../cumulus/components/overlay/GlassDialog";
import { token } from "../../cumulus/primitives/tokens";
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
    <GlassDialog
      title="Dreamwell History"
      subtitle="Shared draws, most recent first."
      closeLabel="Close Dreamwell history"
      onClose={onClose}
      desktopCenterTarget="battlefield"
    >
      <div className="cumulus" data-battle-dreamwell-history-drawer="" data-battle-region="dreamwell-history" style={{ display: "grid", gap: token("--space-4"), maxHeight: "58vh", overflowY: "auto" }}>
        {drawnCards.length === 0 ? (
          <p style={{ color: token("--text-on-glass-muted"), font: token("--t-body") }}>No Dreamwell cards drawn yet.</p>
        ) : (
          drawnCards.map(({ drawIndex, definition }) => (
            <div
              // Draw order is the stable identity here: the same Dreamwell card
              // id can legitimately recur once the shared deck cycles, so the
              // sequential position is what keeps each entry distinct.
              key={`${String(drawIndex)}:${definition.id}`}
              data-battle-dreamwell-history-card={definition.id}
              style={{ display: "grid" }}
            >
              <DreamwellCard model={dreamwellCardModel(definition)} />
            </div>
          ))
        )}
      </div>
    </GlassDialog>
  );
}
