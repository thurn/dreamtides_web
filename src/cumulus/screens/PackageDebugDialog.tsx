import { assertLocalized, type LocalizedString } from "@trox/runtime";
import type { CSSProperties, ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { TextField } from "../components/controls/TextField";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";

/** Stable, display-ready diagnostic value. */
export interface PackageDebugValueView {
  id: string;
  label: LocalizedString;
  value: LocalizedString;
}

/** One UUID- or source-id-backed diagnostic entry. */
export interface PackageDebugEntryView {
  id: string;
  label: LocalizedString;
  detail?: LocalizedString;
}

/** Plain presentation model for the package-state diagnostic. */
export interface PackageDebugView {
  values: readonly PackageDebugValueView[];
  dreamAvatar: LocalizedString | null;
  validation: readonly PackageDebugValueView[];
  remainingDreamsigns: readonly PackageDebugEntryView[];
  spentDreamsigns: readonly PackageDebugEntryView[];
  currentOffer: readonly PackageDebugEntryView[];
  topRemainingCards: readonly PackageDebugEntryView[];
}

export interface PackageDebugDialogProps {
  isOpen: boolean;
  view: PackageDebugView;
  saveName: string;
  saveStatus: LocalizedString | null;
  saveError: LocalizedString | null;
  busy: boolean;
  canSave: boolean;
  canLoad: boolean;
  canForceLegendaryOffer: boolean;
  onClose: () => void;
  onSaveNameChange: (name: string) => void;
  onSave: () => void;
  onLoad: () => void;
  onForceLegendaryOffer: () => void;
}

const stackStyle: CSSProperties = { display: "grid", gap: token("--space-l") };
const entryStyle: CSSProperties = { display: "grid", gap: token("--space-xs") };
const mutedStyle: CSSProperties = {
  margin: 0,
  font: token("--t-body-sm"),
  color: token("--text-on-glass-muted"),
};

/** Pure Cumulus presentation for package diagnostics and save management. */
export function PackageDebugDialog(
  props: PackageDebugDialogProps,
): ReactElement | null {
  const resolve = useLocalizer();
  if (!props.isOpen) return null;
  return (
    <div
      className="cumulus"
      data-package-debug-dialog=""
      style={{ minHeight: "100vh" }}
    >
      <GlassDialog
        title={assertLocalized("Debug: Package State")}
        subtitle={assertLocalized(
          "Inspect the active run and manage a portable journey save.",
        )}
        onClose={props.onClose}
        fullScreen
      >
        <div style={stackStyle}>
          <section
            data-package-debug-values=""
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: token("--space-s"),
            }}
          >
            {props.view.values.map((value) => (
              <p
                key={value.id}
                style={{
                  ...mutedStyle,
                  display: "grid",
                  gap: token("--space-xxs"),
                }}
              >
                <span style={{ font: token("--t-eyebrow") }}>
                  {resolve(value.label)}
                </span>
                <strong
                  style={{
                    font: token("--t-lead"),
                    color: token("--text-on-glass"),
                  }}
                >
                  {resolve(value.value)}
                </strong>
              </p>
            ))}
          </section>
          <section style={stackStyle} data-package-debug-save-file="">
            <h3
              style={{
                margin: 0,
                font: token("--t-title-sm"),
                color: token("--text-on-glass"),
              }}
            >
              Journey Save File
            </h3>
            <TextField
              label={assertLocalized("Save name")}
              value={props.saveName}
              onChange={props.onSaveNameChange}
              placeholder={assertLocalized("e.g. warriors draft")}
              disabled={props.busy || !props.canSave}
              testId="debug-save-journey-name"
              error={
                props.saveError == null
                  ? undefined
                  : props.saveError
              }
              supportingText={assertLocalized(
                props.saveStatus === null
                  ? "Download the active run as JSON, or load a journey file."
                  : resolve(props.saveStatus),
              )}
            />
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: token("--space-xs"),
              }}
            >
              <GlassButton
                label={assertLocalized("Save Journey")}
                onPress={props.onSave}
                disabled={props.busy || !props.canSave}
                placement="onGlass"
                variant="accent"
                testId="debug-save-journey"
              />
              <GlassButton
                label={assertLocalized("Load Journey")}
                onPress={props.onLoad}
                disabled={props.busy || !props.canLoad}
                placement="onGlass"
                testId="debug-load-journey"
              />
            </div>
          </section>
          <DiagnosticSection
            title={assertLocalized("Avatar")}
            entries={
              props.view.dreamAvatar === null
                ? []
                : [{ id: "dreamAvatar", label: props.view.dreamAvatar }]
            }
            emptyLabel={assertLocalized("No package data available yet.")}
          />
          <DiagnosticSection
            title={assertLocalized("Package Validation")}
            entries={props.view.validation.map((value) => ({
              id: value.id,
              label: assertLocalized(
                `${resolve(value.label)}: ${resolve(value.value)}`,
              ),
            }))}
            emptyLabel={assertLocalized("No package data available yet.")}
          />
          <DiagnosticSection
            title={assertLocalized("Dreamsign Pool")}
            entries={props.view.remainingDreamsigns}
            emptyLabel={assertLocalized("Dreamsign pool exhausted.")}
          />
          <DiagnosticSection
            title={assertLocalized("Spent Dreamsigns")}
            entries={props.view.spentDreamsigns}
            emptyLabel={assertLocalized("No Dreamsigns have been spent yet.")}
          />
          <DiagnosticSection
            title={assertLocalized("Current Offer")}
            entries={props.view.currentOffer}
            emptyLabel={assertLocalized("No offer is currently active.")}
          />
          {props.canForceLegendaryOffer ? (
            <div>
              <GlassButton
                label={assertLocalized("Force Legendary Offer (QA)")}
                onPress={props.onForceLegendaryOffer}
                placement="onGlass"
                variant="accent"
                testId="debug-force-legendary-offer"
              />
            </div>
          ) : null}
          <DiagnosticSection
            title={assertLocalized("Top Remaining Draft Cards")}
            entries={props.view.topRemainingCards}
            emptyLabel={assertLocalized("No cards remain in the draft pool.")}
          />
        </div>
      </GlassDialog>
    </div>
  );
}

function DiagnosticSection({
  title,
  entries,
  emptyLabel,
}: {
  title: LocalizedString;
  entries: readonly PackageDebugEntryView[];
  emptyLabel: LocalizedString;
}): ReactElement {
  const resolve = useLocalizer();
  return (
    <section style={stackStyle}>
      <h3
        style={{
          margin: 0,
          font: token("--t-title-sm"),
          color: token("--text-on-glass"),
        }}
      >
        {resolve(title)}
      </h3>
      {entries.length === 0 ? (
        <p style={mutedStyle}>{resolve(emptyLabel)}</p>
      ) : (
        <div style={entryStyle}>
          {entries.map((entry) => (
            <p
              key={entry.id}
              data-package-debug-entry={entry.id}
              style={mutedStyle}
            >
              {resolve(entry.label)}
              {entry.detail === undefined ? null : (
                <>
                  <br />
                  {resolve(entry.detail)}
                </>
              )}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
