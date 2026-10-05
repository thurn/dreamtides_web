import type { ReactElement } from "react";
import type { TransfigurationType } from "../../../types/journey";
import type { GameCardModel } from "./CardView";
import { CardPickerPanel } from "./CardPickerPanel";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { DeckEntryId } from "../../../types/identifiers";

/** One prepared deck entry offered by a Transfiguration picker. */
export interface TransfigurationPickerCard {
  /** Stable deck-entry identity emitted by selection. */
  readonly entryId: DeckEntryId;
  /** Complete resolved card presentation. */
  readonly card: GameCardModel;
  /** Prepared eligibility and prior-reforge state. */
  readonly availability: "available" | "reforged";
  /** Existing form shown when availability is `reforged`. */
  readonly reforgedType?: TransfigurationType | null;
}

/** Closed preparation state for the Transfiguration picker. */
export type TransfigurationPickerState =
  | {
      /** Choices are still being prepared. */
      readonly kind: "loading";
    }
  | {
      /** Prepared choices are ready to display. */
      readonly kind: "ready";
      /** Whether the choices are an offer or the complete eligible deck. */
      readonly presentation: "offer" | "open-deck";
      /** Prepared entries in display order. */
      readonly cards: readonly TransfigurationPickerCard[];
    };

export interface TransfigurationPickerPanelProps {
  /** Complete preparation state rendered by the picker. */
  readonly state: TransfigurationPickerState;
  /** Reports the exact selected deck-entry identity. */
  readonly onCardPress: (entryId: DeckEntryId) => void;
  /** Declines or closes the picker without selecting a card. */
  readonly onDismiss: () => void;
}

/** A responsive Transfiguration-specific card picker with a closed display state. */
export function TransfigurationPickerPanel({
  state,
  onCardPress,
  onDismiss,
}: TransfigurationPickerPanelProps): ReactElement {
  const narrow = !useIsDesktop();
  const ready = state.kind === "ready";
  const openDeck = ready && state.presentation === "open-deck";
  const cards = ready ? state.cards : [];
  const dismiss = {
    label: openDeck || narrow ? "Decline" : "Decline Offer",
    onPress: onDismiss,
    testId: "cumulus-transfiguration-decline",
  } as const;

  return (
    <div
      data-transfiguration-picker-state={state.kind}
      data-transfiguration-picker-presentation={
        state.kind === "ready" ? state.presentation : undefined
      }
      style={{ display: "contents" }}
    >
      <CardPickerPanel
        title={"Transfiguration"}
        subtitle={
          !ready
            ? "Heating the forge…"
            : openDeck
              ? "Pick any card to reforge"
              : "Choose a card to reforge"
        }
        rightAccessory={
          openDeck || narrow
            ? { kind: "glassButton", button: dismiss }
            : undefined
        }
        footerActions={!openDeck && !narrow ? [dismiss] : undefined}
        cards={cards.map((candidate) => ({
          entryId: candidate.entryId,
          model: candidate.card,
          testId: `cumulus-transfiguration-card-${candidate.entryId}`,
          disabled: candidate.availability !== "available",
          caption:
            candidate.availability === "reforged" &&
            candidate.reforgedType != null
              ? {
                  kind: "text" as const,
                  message: `${candidate.reforgedType} · Reforged`,
                }
              : undefined,
        }))}
        emptyLabel={
          ready ? "No eligible cards to reforge." : "Heating the forge…"
        }
        testId="cumulus-transfiguration-picker"
        onCardPress={onCardPress}
      />
    </div>
  );
}
