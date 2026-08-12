import { localizationTodo } from "@trox/runtime";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { token } from "../primitives/tokens";
import { useMessages } from "../hooks/use-messages";

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
  const t = useMessages();
  return (
    <GlassDialog
      title={localizationTodo(t("dreamsign-replacement-title"))}
      subtitle={localizationTodo(t("dreamsign-replacement-capacity", {
        count: view.maxDreamsigns,
      }))}
      onClose={onCancel}
      closeLabel={localizationTodo(closeLabel)}
    >
      <div
        data-dreamsign-replacement-dialog=""
        data-pending-dreamsign-id={requireDreamsignId(
          view.pendingDreamsign,
          t("dreamsign-replacement-pending-label"),
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
            {t("dreamsign-replacement-new-label")}
          </p>
          <div style={{ width: 88, height: 88 }}>
            <Dreamsign
              dreamsign={view.pendingDreamsign}
              testid="dreamsign-replacement-pending"
              variant="hud"
            />
          </div>
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
              t("dreamsign-replacement-collection-label"),
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
                  <Dreamsign
                    dreamsign={dreamsign}
                    testid={`dreamsign-replacement-held-${dreamsignId}`}
                    variant="hud"
                  />
                </div>
                <GlassButton
                  label={t("dreamsign-replacement-replace-action")}
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
