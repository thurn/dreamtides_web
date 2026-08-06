import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { DisclosureSection } from "../components/controls/DisclosureSection";
import { GlassButton } from "../components/controls/GlassButton";
import { NumberStepper } from "../components/controls/NumberStepper";
import { SegmentedControl } from "../components/controls/SegmentedControl";
import { Select } from "../components/controls/Select";
import { TextField } from "../components/controls/TextField";
import { GlassDialog } from "../components/overlay/GlassDialog";
import type { CardKeywordModification, CardTypeChange, TransfigurationType } from "../../types/journey";
import { token } from "../primitives/tokens";

export type JourneyDebugResourceId = "essence" | "maxDreamsigns" | "completionLevel";
export interface JourneyDebugDreamsignView { actionId: string; templateId: string; name: string; isNegative: boolean; }
export interface JourneyDebugCardSearchView { cardId: string; title: string; model: GameCardModel; }
export interface JourneyDebugDeckEntryView {
  entryId: string;
  cardId: string;
  name: string;
  detail: string;
  isBane: boolean;
  transfiguration: TransfigurationType | null;
  typeChange: CardTypeChange | null;
  keywordModification: CardKeywordModification | null;
  statOverride: { energyCost?: number; spark?: number } | null;
  model: GameCardModel | null;
}
export interface JourneyDebugEditorView {
  essence: number;
  maxDreamsigns: number;
  completionLevel: number;
  dreamsigns: readonly JourneyDebugDreamsignView[];
  dreamsignOptions: readonly { id: string; name: string }[];
  cards: readonly JourneyDebugCardSearchView[];
  deck: readonly JourneyDebugDeckEntryView[];
}
export interface JourneyDebugEditorScreenProps {
  isOpen: boolean;
  view: JourneyDebugEditorView;
  onClose: () => void;
  onResourceChange: (id: JourneyDebugResourceId, delta: number) => void;
  onAddDreamsign: (id: string) => void;
  onRemoveDreamsign: (actionId: string) => void;
  onToggleDreamsignNegative: (actionId: string) => void;
  onAddCard: (id: string) => void;
  onRemoveCard: (entryId: string) => void;
  onSetStatOverride: (entryId: string, statOverride: { energyCost?: number; spark?: number } | null) => void;
  onSetTransfiguration: (entryId: string, type: TransfigurationType | null) => void;
  onSetTypeChange: (entryId: string, typeChange: CardTypeChange | null) => void;
  onSetKeywords: (entryId: string, keywords: CardKeywordModification | null) => void;
}

const stackStyle: CSSProperties = { display: "grid", gap: token("--space-m") };
const sectionStyle: CSSProperties = { display: "grid", gap: token("--space-s") };
const textStyle: CSSProperties = { margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted") };
const headingStyle: CSSProperties = { margin: 0, font: token("--t-title-sm"), color: token("--text-on-glass") };
const TRANSFIGURATIONS: { value: string; label: string }[] = [
  { value: "none", label: "None" },
  ...(["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"] as const).map((value) => ({ value, label: value })),
];
const CARD_TYPES: { value: string; label: string }[] = [
  { value: "Character", label: "Character" },
  { value: "Event", label: "Event" },
];

/** Pure Cumulus diagnostic editor. Effects and journey mutations live in its controller. */
export function JourneyDebugEditorScreen(props: JourneyDebugEditorScreenProps): ReactElement | null {
  const [query, setQuery] = useState("");
  const [dreamsignQuery, setDreamsignQuery] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (!props.isOpen) return undefined;
    const close = (event: KeyboardEvent): void => { if (event.key === "Escape") props.onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [props.isOpen, props.onClose]);
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle === "" ? [] : props.view.cards.filter((card) => card.title.toLowerCase().includes(needle) || card.cardId.toLowerCase().includes(needle)).slice(0, 50);
  }, [props.view.cards, query]);
  const dreamsignMatches = useMemo(() => {
    const needle = dreamsignQuery.trim().toLowerCase();
    return needle === "" ? [] : props.view.dreamsignOptions.filter((option) => option.name.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle)).slice(0, 50);
  }, [dreamsignQuery, props.view.dreamsignOptions]);
  if (!props.isOpen) return null;
  const canAddDreamsign = props.view.dreamsigns.length < props.view.maxDreamsigns;
  return (
    <div className="cumulus" data-journey-debug-editor="" style={{ minHeight: "100vh" }}>
      <GlassDialog title="Edit Journey State" subtitle="Make explicit diagnostic changes to the active run." onClose={props.onClose} fullScreen>
        <div style={stackStyle}>
          <section style={sectionStyle} data-journey-debug-resources="">
            <h3 style={headingStyle}>Resources</h3>
            <ResourceSteppers view={props.view} onChange={props.onResourceChange} />
          </section>
          <DisclosureSection title="Dreamsigns" summary={`${String(props.view.dreamsigns.length)} / ${String(props.view.maxDreamsigns)}`} expanded={expanded.dreamsigns ?? true} onExpandedChange={(value) => setExpanded((current) => ({ ...current, dreamsigns: value }))} placement="onGlass" testId="journey-debug-dreamsigns">
            <div style={sectionStyle}>
              {props.view.dreamsigns.length === 0 ? <p style={textStyle}>No dreamsigns yet.</p> : props.view.dreamsigns.map((dreamsign) => <div key={dreamsign.actionId} data-journey-debug-dreamsign={dreamsign.actionId} style={sectionStyle}><p style={textStyle}>{dreamsign.name}{dreamsign.isNegative ? " · negative" : ""}</p><div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}><GlassButton label={dreamsign.isNegative ? "Mark positive" : "Mark negative"} onPress={() => props.onToggleDreamsignNegative(dreamsign.actionId)} placement="onGlass" testId={`journey-debug-negative-${dreamsign.actionId}`} /><GlassButton label="Remove" onPress={() => props.onRemoveDreamsign(dreamsign.actionId)} placement="onGlass" variant="danger" testId={`journey-debug-remove-dreamsign-${dreamsign.actionId}`} /></div></div>)}
              <TextField label="Add dreamsign" value={dreamsignQuery} onChange={setDreamsignQuery} kind="search" disabled={!canAddDreamsign} placeholder={canAddDreamsign ? "Search by name or ID" : "Dreamsign cap reached"} supportingText={canAddDreamsign ? "Choose a matching Dreamsign below." : "Remove one before adding another."} testId="journey-debug-dreamsign-search" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}>{dreamsignMatches.map((option) => <GlassButton key={option.id} label={`Add ${option.name}`} onPress={() => props.onAddDreamsign(option.id)} disabled={!canAddDreamsign} placement="onGlass" testId={`journey-debug-add-dreamsign-${option.id}`} />)}</div>
            </div>
          </DisclosureSection>
          <DisclosureSection title="Deck" summary={`${String(props.view.deck.length)} entries`} expanded={expanded.deck ?? true} onExpandedChange={(value) => setExpanded((current) => ({ ...current, deck: value }))} placement="onGlass" testId="journey-debug-deck">
            <div style={stackStyle}>
              <TextField label="Add card" value={query} onChange={setQuery} kind="search" placeholder="Search by name or UUID" testId="journey-debug-card-search" />
              {matches.map((card) => <div key={card.cardId} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)", alignItems: "center", gap: token("--space-s") }} data-journey-debug-card={card.cardId}><div style={{ width: "100%" }}><GameCard model={card.model} hideRulesText testId={`journey-debug-card-${card.cardId}`} /></div><div style={sectionStyle}><p style={textStyle}>{card.title}<br />{card.cardId}</p><div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}><GlassButton label="Add" onPress={() => props.onAddCard(card.cardId)} placement="onGlass" testId={`journey-debug-add-card-${card.cardId}`} /></div></div></div>)}
              {props.view.deck.length === 0 ? <p style={textStyle}>The deck is empty.</p> : props.view.deck.map((entry) => <DeckEntryEditor key={entry.entryId} entry={entry} onRemove={props.onRemoveCard} onSetStatOverride={props.onSetStatOverride} onSetTransfiguration={props.onSetTransfiguration} onSetTypeChange={props.onSetTypeChange} onSetKeywords={props.onSetKeywords} />)}
            </div>
          </DisclosureSection>
        </div>
      </GlassDialog>
    </div>
  );
}

function ResourceSteppers({ view, onChange }: { view: JourneyDebugEditorView; onChange: JourneyDebugEditorScreenProps["onResourceChange"] }): ReactElement {
  const resources: readonly [JourneyDebugResourceId, string, number][] = [["essence", "Essence", view.essence], ["maxDreamsigns", "Max dreamsigns", view.maxDreamsigns], ["completionLevel", "Completion level", view.completionLevel]];
  return <div style={sectionStyle}>{resources.map(([id, label, value]) => <NumberStepper key={id} label={label} value={value} decrementLabel={`Decrease ${label}`} incrementLabel={`Increase ${label}`} onDecrement={() => onChange(id, -1)} onIncrement={() => onChange(id, 1)} testId={`journey-debug-${id}`} />)}</div>;
}

function DeckEntryEditor({ entry, onRemove, onSetStatOverride, onSetTransfiguration, onSetTypeChange, onSetKeywords }: { entry: JourneyDebugDeckEntryView; onRemove: (entryId: string) => void; onSetStatOverride: JourneyDebugEditorScreenProps["onSetStatOverride"]; onSetTransfiguration: JourneyDebugEditorScreenProps["onSetTransfiguration"]; onSetTypeChange: JourneyDebugEditorScreenProps["onSetTypeChange"]; onSetKeywords: JourneyDebugEditorScreenProps["onSetKeywords"] }): ReactElement {
  const [expanded, setExpanded] = useState(false);
  return <DisclosureSection title={entry.name} summary={`${entry.detail}${entry.isBane ? " · Nightmare" : ""}`} expanded={expanded} onExpandedChange={setExpanded} placement="onGlass" testId={`journey-debug-entry-${entry.entryId}`}><div style={stackStyle} data-journey-debug-entry={entry.entryId}>{entry.model === null ? <p style={textStyle}>This deck entry cannot resolve its canonical card.</p> : <div style={{ width: 180 }}><GameCard model={entry.model} hideRulesText testId={`journey-debug-entry-card-${entry.entryId}`} /></div>}<DeckEditControls entry={entry} onSetStatOverride={onSetStatOverride} onSetTransfiguration={onSetTransfiguration} onSetTypeChange={onSetTypeChange} onSetKeywords={onSetKeywords} /><GlassButton label="Remove" onPress={() => onRemove(entry.entryId)} placement="onGlass" variant="danger" testId={`journey-debug-remove-card-${entry.entryId}`} /></div></DisclosureSection>;
}

function DeckEditControls({ entry, onSetStatOverride, onSetTransfiguration, onSetTypeChange, onSetKeywords }: { entry: JourneyDebugDeckEntryView; onSetStatOverride: JourneyDebugEditorScreenProps["onSetStatOverride"]; onSetTransfiguration: JourneyDebugEditorScreenProps["onSetTransfiguration"]; onSetTypeChange: JourneyDebugEditorScreenProps["onSetTypeChange"]; onSetKeywords: JourneyDebugEditorScreenProps["onSetKeywords"] }): ReactElement {
  const [energy, setEnergy] = useState(entry.statOverride?.energyCost === undefined ? "" : String(entry.statOverride.energyCost));
  const [spark, setSpark] = useState(entry.statOverride?.spark === undefined ? "" : String(entry.statOverride.spark));
  const [transfiguration, setTransfiguration] = useState<string>(entry.transfiguration ?? "none");
  const [cardType, setCardType] = useState<string>(entry.typeChange?.cardType ?? "Character");
  const [subtype, setSubtype] = useState(entry.typeChange?.subtype ?? "");
  const [fast, setFast] = useState(entry.keywordModification?.fast === true ? "fast" : "normal");
  const [reclaim, setReclaim] = useState(entry.keywordModification?.setReclaim === undefined ? "" : String(entry.keywordModification.setReclaim));
  useEffect(() => { setEnergy(entry.statOverride?.energyCost === undefined ? "" : String(entry.statOverride.energyCost)); setSpark(entry.statOverride?.spark === undefined ? "" : String(entry.statOverride.spark)); setTransfiguration(entry.transfiguration ?? "none"); setCardType(entry.typeChange?.cardType ?? "Character"); setSubtype(entry.typeChange?.subtype ?? ""); setFast(entry.keywordModification?.fast === true ? "fast" : "normal"); setReclaim(entry.keywordModification?.setReclaim === undefined ? "" : String(entry.keywordModification.setReclaim)); }, [entry]);
  const commitStats = (): void => { const next: { energyCost?: number; spark?: number } = {}; const parsedEnergy = Number(energy); const parsedSpark = Number(spark); if (energy.trim() !== "" && Number.isFinite(parsedEnergy)) next.energyCost = parsedEnergy; if (spark.trim() !== "" && Number.isFinite(parsedSpark)) next.spark = parsedSpark; onSetStatOverride(entry.entryId, Object.keys(next).length === 0 ? null : next); };
  const commitKeywords = (): void => { const parsed = Number(reclaim); onSetKeywords(entry.entryId, { fast: fast === "fast", ...(reclaim.trim() !== "" && Number.isFinite(parsed) ? { setReclaim: parsed } : {}) }); };
  return <div style={stackStyle}><TextField label="Energy override" value={energy} onChange={setEnergy} placeholder="Use printed energy" testId={`journey-debug-energy-${entry.entryId}`} /><TextField label="Spark override" value={spark} onChange={setSpark} placeholder="Use printed spark" testId={`journey-debug-spark-${entry.entryId}`} /><div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}><GlassButton label="Commit stats" onPress={commitStats} placement="onGlass" testId={`journey-debug-commit-stats-${entry.entryId}`} /><GlassButton label="Reset stats" onPress={() => onSetStatOverride(entry.entryId, null)} placement="onGlass" testId={`journey-debug-reset-stats-${entry.entryId}`} /></div><Select options={TRANSFIGURATIONS} value={transfiguration} onChange={setTransfiguration} ariaLabel="Transfiguration" /><GlassButton label="Commit transfiguration" onPress={() => onSetTransfiguration(entry.entryId, transfiguration === "none" ? null : transfiguration as TransfigurationType)} placement="onGlass" testId={`journey-debug-commit-transfiguration-${entry.entryId}`} /><Select options={CARD_TYPES} value={cardType} onChange={setCardType} ariaLabel="Card type" /><TextField label="Subtype" value={subtype} onChange={setSubtype} testId={`journey-debug-subtype-${entry.entryId}`} /><GlassButton label="Commit type" onPress={() => onSetTypeChange(entry.entryId, { predicateId: "debug", cardType: cardType as CardTypeChange["cardType"], subtype, label: "Debug edit" })} placement="onGlass" testId={`journey-debug-commit-type-${entry.entryId}`} /><SegmentedControl options={[{ value: "normal", label: "Normal" }, { value: "fast", label: "Fast" }]} value={fast} onChange={setFast} full /><TextField label="Reclaim" value={reclaim} onChange={setReclaim} placeholder="None" testId={`journey-debug-reclaim-${entry.entryId}`} /><div style={{ display: "flex", flexWrap: "wrap", gap: token("--space-xs") }}><GlassButton label="Commit keywords" onPress={commitKeywords} placement="onGlass" testId={`journey-debug-commit-keywords-${entry.entryId}`} /><GlassButton label="Clear keywords" onPress={() => onSetKeywords(entry.entryId, null)} placement="onGlass" testId={`journey-debug-clear-keywords-${entry.entryId}`} /><GlassButton label="Reset type" onPress={() => onSetTypeChange(entry.entryId, null)} placement="onGlass" testId={`journey-debug-reset-type-${entry.entryId}`} /></div></div>;
}
