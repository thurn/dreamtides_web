import {
  one,
  other,
  plural,
  tx,
  txa,
  type LocalizedString,
} from "@trox/runtime";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { GlassButton } from "../controls/GlassButton";
import { Dreamsign, type LocalizedDreamsign } from "../hud/Dreamsign";
import { token } from "../../primitives/tokens";
import { GlassDialog } from "./GlassDialog";

/** Prepared display data for choosing which held Dreamsign to replace. */
export interface DreamsignReplacementModel {
  /** The newly acquired Dreamsign awaiting capacity resolution. */
  readonly incoming: LocalizedDreamsign;
  /** Held Dreamsigns, each resolved by UUID. */
  readonly held: readonly LocalizedDreamsign[];
  /** Prepared maximum held-Dreamsign count. */
  readonly capacity: number;
  /** Label for the non-destructive dismissal action. */
  readonly dismissLabel: LocalizedString;
  /** Accessible label for the dialog close control. */
  readonly closeLabel: LocalizedString;
}

export interface DreamsignReplacementDialogProps {
  /** Complete resolved replacement presentation. */
  readonly model: DreamsignReplacementModel;
  /** Reports the exact held Dreamsign UUID selected for replacement. */
  readonly onDreamsignPress: (dreamsignId: string) => void;
  /** Dismisses the replacement workflow without selecting a held Dreamsign. */
  readonly onDismiss: () => void;
}

/** The canonical UUID-backed Dreamsign capacity-resolution dialog. */
export function DreamsignReplacementDialog({
  model,
  onDreamsignPress,
  onDismiss,
}: DreamsignReplacementDialogProps) {
  const resolve = useLocalizer();
  const incomingId = requireDreamsignId(
    model.incoming,
    "Cumulus Dreamsign replacement incoming reward",
  );
  return (
    <GlassDialog
      title={tx(
        "Choose a Dreamsign to Replace",
        "[dreamsign] Heading for choosing which held Dreamsign to replace after gaining one while at capacity.",
      )}
      subtitle={txa(
        plural(model.capacity, [
          one("You can hold {count} Dreamsign."),
          other("You can hold {count} Dreamsigns."),
        ]),
        { count: model.capacity },
        "[dreamsign] Subtitle in the Dreamsign replacement dialog. count is the positive maximum number of Dreamsigns the current player may hold at once.",
      )}
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
            {resolve(
              tx(
                "New Dreamsign",
                "[dreamsign] Eyebrow above the newly gained Dreamsign in the replacement dialog.",
              ),
            )}
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
                  label={tx(
                    "Replace",
                    "[dreamsign] Replacement replace action.",
                  )}
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
