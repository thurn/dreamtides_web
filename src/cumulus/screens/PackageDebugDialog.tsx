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
  dreamcaller: string | null;
  validation: readonly PackageDebugValueView[];
  remainingDreamsigns: readonly PackageDebugEntryView[];
  spentDreamsigns: readonly PackageDebugEntryView[];
  currentOffer: readonly PackageDebugEntryView[];
  topRemainingCards: readonly PackageDebugEntryView[];
}

export interface SavedQuestView {
  id: string;
  name: string;
  detail: string;
}

export interface PackageDebugDialogProps {
  isOpen: boolean;
  view: PackageDebugView;
  saves: readonly SavedQuestView[];
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
  onLoad: (saveId: string) => void;
  onDelete: (saveId: string) => void;
  onForceLegendaryOffer: () => void;
}

const stackStyle: CSSProperties = { display: "grid", gap: token("--space-6") };
const entryStyle: CSSProperties = { display: "grid", gap: token("--space-3") };
const mutedStyle: CSSProperties = { margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted") };

/** Pure Cumulus presentation for package diagnostics and save management. */
export function PackageDebugDialog(props: PackageDebugDialogProps): ReactElement | null {
  if (!props.isOpen) return null;
  return (
    <div className="cumulus" data-package-debug-dialog="" style={{ minHeight: "100vh" }}>
      <GlassDialog title="Debug: Package State" subtitle="Inspect the active run and its saved snapshots." onClose={props.onClose} fullScreen>
        <div style={stackStyle}>
          <section data-package-debug-values="" style={{ display: "flex", flexWrap: "wrap", gap: token("--space-4") }}>
            {props.view.values.map((value) => <p key={value.id} style={{ ...mutedStyle, display: "grid", gap: token("--space-1") }}><span style={{ font: token("--t-eyebrow") }}>{value.label}</span><strong style={{ font: token("--t-lead"), color: token("--text-on-glass") }}>{value.value}</strong></p>)}
          </section>
          <section style={stackStyle} data-package-debug-saves="">
            <h3 style={{ margin: 0, font: token("--t-title-sm"), color: token("--text-on-glass") }}>Saved Quests</h3>
            <TextField label="Save name" value={props.saveName} onChange={props.onSaveNameChange} placeholder="e.g. warriors draft" disabled={props.busy || !props.canSave} testId="debug-save-quest-name" error={props.saveError ?? undefined} supportingText={props.saveStatus ?? "Save the active run locally and resume it later."} />
            <div><GlassButton label="Save Quest" onPress={props.onSave} disabled={props.busy || !props.canSave} placement="onGlass" variant="accent" testId="debug-save-quest" /></div>
            {props.saves.length === 0 ? <p style={mutedStyle}>No saved quests yet.</p> : props.saves.map((save) => <div key={save.id} style={entryStyle} data-saved-quest={save.id}><p style={{ ...mutedStyle, color: token("--text-on-glass") }}>{save.name}<br /><span style={mutedStyle}>{save.detail}</span></p><div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-3") }}><GlassButton label="Load" onPress={() => props.onLoad(save.id)} disabled={props.busy || !props.canLoad} placement="onGlass" testId="debug-load-quest" /><GlassButton label="Delete" onPress={() => props.onDelete(save.id)} disabled={props.busy} placement="onGlass" variant="danger" testId="debug-delete-quest" /></div></div>)}
          </section>
          <DiagnosticSection title="Dreamcaller" entries={props.view.dreamcaller === null ? [] : [{ id: "dreamcaller", label: props.view.dreamcaller }]} emptyLabel="No package data available yet." />
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
