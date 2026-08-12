import {
  tx,
  plural,
  one,
  other,
  txa,
  type LocalizedString,
} from "@trox/runtime";
import { requireDreamsignId } from "../../data/dreamsigns";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";

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
  cancelLabel: LocalizedString;
  closeLabel: LocalizedString;
}

/** Shared UUID-backed replacement choice for every Dreamsign acquisition flow. */
export function DreamsignReplacementDialog({
  view,
  onReplace,
  onCancel,
  cancelLabel,
  closeLabel,
}: DreamsignReplacementDialogProps) {
  const resolve = useLocalizer();
  return (
    <GlassDialog
      title={tx(
        "Choose a Dreamsign to Replace",
        "Heading for choosing which held Dreamsign to replace after gaining one while at capacity.",
      )}
      subtitle={txa(
        plural(view.maxDreamsigns, [
          one("You can hold {count} Dreamsign."),
          other("You can hold {count} Dreamsigns."),
        ]),
        { count: view.maxDreamsigns },
        "Subtitle in the Dreamsign replacement dialog. count is the positive maximum number of Dreamsigns the current player may hold at once.",
      )}
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
            {resolve(
              tx(
                "New Dreamsign",
                "Eyebrow above the newly gained Dreamsign in the replacement dialog.",
              ),
            )}
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
                  <Dreamsign
                    dreamsign={dreamsign}
                    testid={`dreamsign-replacement-held-${dreamsignId}`}
                    variant="hud"
                  />
                </div>
                <GlassButton
                  label={tx(
                    "Replace",
                    "Player-facing message for the dreamsign replacement replace action interface state.",
                  )}
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
