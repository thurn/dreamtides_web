import { localizationTodo } from "@trox/runtime";
import type { CSSProperties, ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { TextField } from "../components/controls/TextField";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { token } from "../primitives/tokens";

/** Stable, display-ready diagnostic value. */
export interface PackageDebugValueView {
  id: string;
  label: string;
  value: string;
}

/** One UUID- or source-id-backed diagnostic entry. */
export interface PackageDebugEntryView {
  id: string;
  label: string;
  detail?: string;
}

/** Plain presentation model for the package-state diagnostic. */
export interface PackageDebugView {
  values: readonly PackageDebugValueView[];
  dreamAvatar: string | null;
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
  saveStatus: string | null;
  saveError: string | null;
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
const mutedStyle: CSSProperties = { margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted") };

/** Pure Cumulus presentation for package diagnostics and save management. */
export function PackageDebugDialog(props: PackageDebugDialogProps): ReactElement | null {
  if (!props.isOpen) return null;
  return (
    <div className="cumulus" data-package-debug-dialog="" style={{ minHeight: "100vh" }}>
      <GlassDialog title={localizationTodo("Debug: Package State")} subtitle={localizationTodo("Inspect the active run and manage a portable journey save.")} onClose={props.onClose} fullScreen>
        <div style={stackStyle}>
          <section data-package-debug-values="" style={{ display: "flex", flexWrap: "wrap", gap: token("--space-s") }}>
            {props.view.values.map((value) => <p key={value.id} style={{ ...mutedStyle, display: "grid", gap: token("--space-xxs") }}><span style={{ font: token("--t-eyebrow") }}>{value.label}</span><strong style={{ font: token("--t-lead"), color: token("--text-on-glass") }}>{value.value}</strong></p>)}
          </section>
          <section style={stackStyle} data-package-debug-save-file="">
            <h3 style={{ margin: 0, font: token("--t-title-sm"), color: token("--text-on-glass") }}>Journey Save File</h3>
            <TextField label={localizationTodo("Save name")} value={props.saveName} onChange={props.onSaveNameChange} placeholder={localizationTodo("e.g. warriors draft")} disabled={props.busy || !props.canSave} testId="debug-save-journey-name" error={props.saveError === null ? undefined : localizationTodo(props.saveError)} supportingText={localizationTodo(props.saveStatus ?? "Download the active run as JSON, or load a journey file.")} />
            <div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}><GlassButton label="Save Journey" onPress={props.onSave} disabled={props.busy || !props.canSave} placement="onGlass" variant="accent" testId="debug-save-journey" /><GlassButton label="Load Journey" onPress={props.onLoad} disabled={props.busy || !props.canLoad} placement="onGlass" testId="debug-load-journey" /></div>
          </section>
          <DiagnosticSection title="Avatar" entries={props.view.dreamAvatar === null ? [] : [{ id: "dreamAvatar", label: props.view.dreamAvatar }]} emptyLabel="No package data available yet." />
          <DiagnosticSection title="Package Validation" entries={props.view.validation.map((value) => ({ id: value.id, label: `${value.label}: ${value.value}` }))} emptyLabel="No package data available yet." />
          <DiagnosticSection title="Dreamsign Pool" entries={props.view.remainingDreamsigns} emptyLabel="Dreamsign pool exhausted." />
          <DiagnosticSection title="Spent Dreamsigns" entries={props.view.spentDreamsigns} emptyLabel="No Dreamsigns have been spent yet." />
          <DiagnosticSection title="Current Offer" entries={props.view.currentOffer} emptyLabel="No offer is currently active." />
          {props.canForceLegendaryOffer ? <div><GlassButton label="Force Legendary Offer (QA)" onPress={props.onForceLegendaryOffer} placement="onGlass" variant="accent" testId="debug-force-legendary-offer" /></div> : null}
          <DiagnosticSection title="Top Remaining Draft Cards" entries={props.view.topRemainingCards} emptyLabel="No cards remain in the draft pool." />
        </div>
      </GlassDialog>
    </div>
  );
}

function DiagnosticSection({ title, entries, emptyLabel }: { title: string; entries: readonly PackageDebugEntryView[]; emptyLabel: string }): ReactElement {
  return <section style={stackStyle}><h3 style={{ margin: 0, font: token("--t-title-sm"), color: token("--text-on-glass") }}>{title}</h3>{entries.length === 0 ? <p style={mutedStyle}>{emptyLabel}</p> : <div style={entryStyle}>{entries.map((entry) => <p key={entry.id} data-package-debug-entry={entry.id} style={mutedStyle}>{entry.label}{entry.detail === undefined ? null : <><br />{entry.detail}</>}</p>)}</div>}</section>;
}
