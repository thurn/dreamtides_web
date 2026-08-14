import type { ReactElement } from "react";
import { tx, txa } from "@trox/runtime";
import type { TransfigurationType } from "../../../types/journey";
import type { GameCardModel } from "./CardView";
import { CardPickerPanel } from "./CardPickerPanel";
import { useIsDesktop } from "../../primitives/use-is-desktop";

/** One prepared deck entry offered by a Transfiguration picker. */
export interface TransfigurationPickerCard {
  /** Stable deck-entry identity emitted by selection. */
  readonly entryId: string;
  /** Complete resolved card presentation. */
  readonly card: GameCardModel;
  /** Prepared eligibility and prior-reforge state. */
  readonly availability: "available" | "unavailable" | "reforged";
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
  readonly onCardPress: (entryId: string) => void;
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
    label:
      openDeck || narrow
        ? tx(
            "Decline",
            "[ui] Compact action declining the current interaction without applying it.",
          )
        : tx(
            "Decline Offer",
            "[ui] Action declining the current site offer and leaving without its reward.",
          ),
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
        title={tx(
          "Transfiguration",
          "[transfiguration] Title of the card picker at a Transfiguration site.",
        )}
        subtitle={
          !ready
            ? tx(
                "Heating the forge…",
                "[transfiguration] [loading] Loading status while Transfiguration choices are prepared.",
              )
            : openDeck
              ? tx(
                  "Pick any card to reforge",
                  "[transfiguration] Instruction when any eligible card may be reforged.",
                )
              : tx(
                  "Choose a card to reforge",
                  "[transfiguration] Instruction for choosing the offered card to reforge.",
                )
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
                  message: txa(
                    "{form} · Reforged",
                    { form: candidate.reforgedType },
                    "[transfiguration] Caption beneath a card that has already been reforged. form is its canonical Transfiguration form name.",
                  ),
                }
              : undefined,
        }))}
        emptyLabel={
          ready
            ? tx(
                "No eligible cards to reforge.",
                "[transfiguration] Empty state when no card can be reforged.",
              )
            : tx(
                "Heating the forge…",
                "[transfiguration] [loading] Loading status while Transfiguration choices are prepared.",
              )
        }
        testId="cumulus-transfiguration-picker"
        onCardPress={onCardPress}
      />
    </div>
  );
}
