import { requireDreamsignId } from "../../../data/dreamsigns";
import { GlassButton } from "../controls/GlassButton";
import { Dreamsign, type DreamsignView } from "../hud/Dreamsign";
import { token } from "../../primitives/tokens";
import { GlassDialog } from "./GlassDialog";
import type { DreamsignId } from "../../../types/identifiers";
import { formatNumber } from "../../../runtime/format-number";

/** Prepared display data for choosing which held Dreamsign to replace. */
export interface DreamsignReplacementModel {
  /** The newly acquired Dreamsign awaiting capacity resolution. */
  readonly incoming: DreamsignView;
  /** Held Dreamsigns, each resolved by UUID. */
  readonly held: readonly DreamsignView[];
  /** Prepared maximum held-Dreamsign count. */
  readonly capacity: number;
  /** Label for the non-destructive dismissal action. */
  readonly dismissLabel: string;
  /** Accessible label for the dialog close control. */
  readonly closeLabel: string;
}

export interface DreamsignReplacementDialogProps {
  /** Complete resolved replacement presentation. */
  readonly model: DreamsignReplacementModel;
  /** Reports the exact held Dreamsign UUID selected for replacement. */
  readonly onDreamsignPress: (dreamsignId: DreamsignId) => void;
  /** Dismisses the replacement workflow without selecting a held Dreamsign. */
  readonly onDismiss: () => void;
}

/** The canonical UUID-backed Dreamsign capacity-resolution dialog. */
export function DreamsignReplacementDialog({
  model,
  onDreamsignPress,
  onDismiss,
}: DreamsignReplacementDialogProps) {
  const incomingId = requireDreamsignId(
    model.incoming,
    "Cumulus Dreamsign replacement incoming reward",
  );
  return (
    <GlassDialog
      title={"Choose a Dreamsign to Replace"}
      subtitle={
        model.capacity === 1
          ? `You can hold ${formatNumber(model.capacity)} Dreamsign.`
          : `You can hold ${formatNumber(model.capacity)} Dreamsigns.`
      }
      onClose={onDismiss}
      closeLabel={model.closeLabel}
    >
      <div
        data-dreamsign-replacement-dialog=""
        data-incoming-dreamsign-id={incomingId}
        data-dreamsign-replacement-capacity={model.capacity}
        style={{ width: "min(100%, 420px)", margin: "0 auto" }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-s"),
            marginBottom: token("--space-l"),
          }}
        >
          <p
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              color: token("--text-on-glass-muted"),
            }}
          >
            {"New Dreamsign"}
          </p>
          <div style={{ width: 88, height: 88 }}>
            <Dreamsign dreamsign={model.incoming} variant="hud" />
          </div>
        </div>
        <div
          data-dreamsign-replacement-held-count={model.held.length}
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(calc(2 * ${token("--touch-min")} + ${token("--space-xxs")}), 1fr))`,
            gap: token("--space-m"),
            justifyItems: "center",
          }}
        >
          {model.held.map((dreamsign) => {
            const dreamsignId = requireDreamsignId(
              dreamsign,
              "Cumulus Dreamsign replacement collection",
            );
            return (
              <div
                key={dreamsignId}
                data-replace-dreamsign-id={dreamsignId}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: token("--space-s"),
                }}
              >
                <div style={{ width: 72, height: 72 }}>
                  <Dreamsign dreamsign={dreamsign} variant="hud" />
                </div>
                <GlassButton
                  label={"Replace"}
                  variant="accent"
                  placement="onGlass"
                  onPress={() => onDreamsignPress(dreamsignId)}
                />
              </div>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: token("--space-l"),
          }}
        >
          <GlassButton
            label={model.dismissLabel}
            placement="onGlass"
            onPress={onDismiss}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
