import type { ReactElement } from "react";
import { meaning, tx } from "@trox/runtime";
import type { TransfigurationType } from "../../../types/journey";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { token } from "../../primitives/tokens";
import { GlassButton } from "../controls/GlassButton";
import {
  TransfigurationButton,
  type TransfigurationButtonModel,
} from "../controls/TransfigurationButton";
import { GlassPanel } from "../overlay/GlassPanel";
import { CARD_ASPECT_RATIO_VALUE } from "./card-aspect";
import { GameCard, type GameCardModel } from "./CardView";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { DeckEntryId } from "../../../types/identifiers";

/** One prepared Transfiguration form and its resolved preview card. */
export interface TransfigurationDetailForm extends TransfigurationButtonModel {
  /** Complete card presentation after applying this form. */
  readonly previewModel: GameCardModel;
}

/** One selected deck entry and every prepared form it may take. */
export interface TransfigurationDetailCandidate {
  /** Stable deck-entry identity retained by the hosting workflow. */
  readonly entryId: DeckEntryId;
  /** Complete current card presentation. */
  readonly card: GameCardModel;
  /** Prepared form quotes in display order. */
  readonly forms: readonly TransfigurationDetailForm[];
}

/** Whether the selected card is fixed or may be reselected. */
export type TransfigurationDetailNavigation =
  | {
      /** The hosting workflow fixes the selected card. */
      readonly kind: "fixed";
    }
  | {
      /** The hosting workflow allows returning to card selection. */
      readonly kind: "reselectable";
      /** Returns to the hosting workflow's card-selection state. */
      readonly onBack: () => void;
    };

export interface TransfigurationDetailPanelProps {
  /** Complete selected-card presentation with prepared form quotes. */
  readonly candidate: TransfigurationDetailCandidate;
  /** Controlled selected form, or null before selection. */
  readonly value: TransfigurationType | null;
  /** Authoritative commit presentation state. */
  readonly status: "idle" | "submitting" | "accepted";
  /** Whether the commit action shows a quoted Essence cost. */
  readonly quote: "show-cost" | "included";
  /** Closed navigation behavior for the hosting workflow. */
  readonly navigation: TransfigurationDetailNavigation;
  /** Reports a controlled form selection by canonical form type. */
  readonly onChange: (type: TransfigurationType) => void;
  /** Commits the selected canonical form type. */
  readonly onConfirm: (type: TransfigurationType) => void;
}

/** A controlled form chooser for one prepared Transfiguration candidate. */
export function TransfigurationDetailPanel({
  candidate,
  value,
  status,
  quote,
  navigation,
  onChange,
  onConfirm,
}: TransfigurationDetailPanelProps): ReactElement {
  const resolve = useLocalizer();
  const narrow = !useIsDesktop();
  const activeForm =
    candidate.forms.find((form) => form.type === value) ?? null;
  const disabled =
    activeForm === null || !activeForm.affordable || status !== "idle";
  const showCost = quote === "show-cost";

  return (
    <section
      data-testid="cumulus-transfiguration-detail"
      data-transfiguration-detail-layout={narrow ? "mobile" : "desktop"}
      data-transfiguration-status={status}
      style={{
        width: narrow
          ? `min(calc(100vw - (${token("--space-s")} * 2)), 100%)`
          : "100%",
        maxWidth: "100%",
        minWidth: 0,
        minHeight: narrow ? "100%" : undefined,
        maxHeight: narrow ? undefined : "100%",
        boxSizing: "border-box",
        overflow: "hidden",
        display: narrow ? "flex" : undefined,
        flexDirection: narrow ? "column" : undefined,
      }}
    >
      <GlassPanel
        title={tx(
          "Choose Its New Form",
          "[transfiguration] Title above the form choices for the currently selected card.",
        )}
        headerSpacing={narrow ? "compact" : "medium"}
        footer={
          <div
            data-transfiguration-actions=""
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: narrow ? "center" : "flex-end",
              gap: token("--space-s"),
              padding: `0 ${narrow ? token("--space-s") : token("--space-2xl")} ${narrow ? token("--space-s") : token("--space-l")}`,
            }}
          >
            {navigation.kind === "reselectable" && (
              <GlassButton
                placement="onGlass"
                label={tx(
                  meaning("transfiguration-reselect-action", "Choose Again"),
                  "[transfiguration] Returns to the card picker.",
                )}
                disabled={status === "submitting"}
                onPress={navigation.onBack}
                testId="cumulus-transfiguration-choose-again"
              />
            )}
            <GlassButton
              placement="onGlass"
              variant="accent"
              label={
                status === "submitting"
                  ? tx(
                      "Reforging…",
                      "[transfiguration] Pending status while a Transfiguration is being saved.",
                    )
                  : tx(
                      meaning("transfiguration-commit-action", "Transfigure"),
                      "[transfiguration] Commits the selected form.",
                    )
              }
              essenceCost={showCost ? (activeForm?.essenceCost ?? null) : null}
              widthReservations={candidate.forms.flatMap((form) => [
                {
                  label: tx(
                    meaning("transfiguration-commit-action", "Transfigure"),
                    "[transfiguration] Commits the selected form.",
                  ),
                  essenceCost: showCost ? form.essenceCost : null,
                },
                {
                  label: tx(
                    "Reforging…",
                    "[transfiguration] Pending status while a Transfiguration is being saved.",
                  ),
                  essenceCost: showCost ? form.essenceCost : null,
                },
              ])}
              disabled={disabled}
              onPress={() => {
                if (activeForm !== null) onConfirm(activeForm.type);
              }}
              testId="cumulus-transfiguration-confirm"
            />
          </div>
        }
      >
        <div
          data-transfiguration-detail-body=""
          style={{
            display: "grid",
            gridTemplateColumns: narrow
              ? "minmax(0, 1fr) minmax(0, 1fr)"
              : "minmax(220px, 278px) minmax(240px, 288px)",
            gap: narrow ? token("--space-s") : token("--space-2xl"),
            alignItems: "start",
            padding: narrow
              ? `${token("--space-l")} ${token("--space-s")}`
              : token("--space-2xl"),
          }}
        >
          <div
            data-transfiguration-detail-card-target=""
            style={{
              width: narrow ? "min(100%, 227px)" : "min(100%, 278px)",
              aspectRatio: narrow ? String(CARD_ASPECT_RATIO_VALUE) : undefined,
              justifySelf: "center",
              minHeight: 0,
            }}
          >
            <GameCard
              model={activeForm?.previewModel ?? candidate.card}
              selection={activeForm === null ? undefined : "transfigured"}
            />
          </div>
          <div
            role="radiogroup"
            aria-label={resolve(
              tx(
                "Transfiguration options",
                "[accessibility] [transfiguration] Options name.",
              ),
            )}
            data-transfiguration-options=""
            data-transfiguration-option-layout={narrow ? "compact" : "priced"}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: token("--space-xs"),
              maxHeight: narrow ? undefined : "min(52vh, 520px)",
              overflowY: narrow ? "visible" : "auto",
              padding: token("--space-xs"),
            }}
          >
            {candidate.forms.map((form) => (
              <TransfigurationButton
                key={form.type}
                form={form}
                variant={narrow ? "compact" : "priced"}
                selected={form.type === activeForm?.type}
                disabled={status !== "idle"}
                onPress={onChange}
                testId={`cumulus-transfiguration-form-${form.type}`}
              />
            ))}
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}
