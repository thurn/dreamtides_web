import { requireDreamsignId } from "../../data/dreamsigns";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { token } from "../primitives/tokens";

/** The pending and currently held Dreamsigns shown by a replacement choice. */
export interface DreamsignReplacementView {
  pendingDreamsign: DreamsignData;
  currentDreamsigns: readonly DreamsignData[];
  maxDreamsigns: number;
}

export interface DreamsignReplacementDialogProps {
  view: DreamsignReplacementView;
  onReplace: (dreamsignId: string) => void;
  onCancel: () => void;
  cancelLabel: string;
  closeLabel: string;
}

/** Shared UUID-backed replacement choice for every Dreamsign acquisition flow. */
export function DreamsignReplacementDialog({
  view,
  onReplace,
  onCancel,
  cancelLabel,
  closeLabel,
}: DreamsignReplacementDialogProps) {
  return (
    <GlassDialog
      title="Choose a Dreamsign to Replace"
      subtitle={`You can hold ${String(view.maxDreamsigns)} dreamsigns.`}
      onClose={onCancel}
      closeLabel={closeLabel}
    >
      <div
        data-dreamsign-replacement-dialog=""
        data-pending-dreamsign-id={requireDreamsignId(
          view.pendingDreamsign,
          "Cumulus Dreamsign replacement pending reward",
        )}
        style={{
          width: "min(100%, 420px)",
          margin: "0 auto",
        }}
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
            New Dreamsign
          </p>
          <Dreamsign
            dreamsign={view.pendingDreamsign}
            sizePx={88}
            testid="dreamsign-replacement-pending"
            variant="hud"
          />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(auto-fit, minmax(calc(2 * ${token("--touch-min")} + ${token("--space-xxs")}), 1fr))`,
            gap: token("--space-m"),
            justifyItems: "center",
          }}
        >
          {view.currentDreamsigns.map((dreamsign) => {
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
                <Dreamsign
                  dreamsign={dreamsign}
                  sizePx={72}
                  testid={`dreamsign-replacement-held-${dreamsignId}`}
                  variant="hud"
                />
                <GlassButton
                  label="Replace"
                  variant="accent"
                  placement="onGlass"
                  testId={`replace-dreamsign-${dreamsignId}`}
                  onPress={() => onReplace(dreamsignId)}
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
            label={cancelLabel}
            placement="onGlass"
            testId="dreamsign-replacement-cancel"
            onPress={onCancel}
          />
        </div>
      </div>
    </GlassDialog>
  );
}
