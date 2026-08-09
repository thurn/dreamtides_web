import { useEffect, useMemo, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { GlassButton } from "../../src/cumulus/components/controls/GlassButton";
import { IconButton } from "../../src/cumulus/components/controls/IconButton";
import { Select } from "../../src/cumulus/components/controls/Select";
import { TextField } from "../../src/cumulus/components/controls/TextField";
import { GlassPanel } from "../../src/cumulus/components/overlay/GlassPanel";
import { Pressable } from "../../src/cumulus/primitives/Pressable";
import { GLYPHS } from "../../src/cumulus/primitives/glyph";
import type { CardData } from "../../src/types/cards";
import {
  buildOperations,
  createTransport,
  draftFromSnapshot,
  searchCards,
  validateDraft,
  type AffiliationDraft,
  type EditorSnapshot,
} from "./editor";

const transport = createTransport();
const SETTINGS_ID = "catalog-settings";

function cloneDraft(draft: AffiliationDraft): AffiliationDraft {
  return structuredClone(draft);
}

function errorMessage(error: unknown): string {
  const raw = String(error);
  const match = raw.match(/"message":"([^"]+)"/);
  return match?.[1] ?? raw.replace(/^Error:\s*/, "");
}

export function App() {
  const [snapshot, setSnapshot] = useState<EditorSnapshot>();
  const [draft, setDraft] = useState<AffiliationDraft>();
  const [selectedId, setSelectedId] = useState(SETTINGS_ID);
  const [recordSearch, setRecordSearch] = useState("");
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerFilter, setPickerFilter] = useState("all");
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<AffiliationDraft[]>([]);
  const [future, setFuture] = useState<AffiliationDraft[]>([]);
  const [status, setStatus] = useState("Opening repository…");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const pickerSearchRef = useRef<HTMLInputElement>(null);
  const addButtonRef = useRef<HTMLElement | null>(null);
  const activeHistoryKey = useRef<string | undefined>(undefined);

  const adopt = (next: EditorSnapshot) => {
    setSnapshot(next);
    setDraft(draftFromSnapshot(next));
    setPast([]);
    setFuture([]);
    setSaveError("");
    setStale(false);
    setSaving(false);
    setSelectedId((current) => current === SETTINGS_ID || next.affiliations.some((entry) => entry.id === current)
      ? current
      : next.affiliations[0]?.id ?? SETTINGS_ID);
    setStatus("All changes saved");
  };

  useEffect(() => { void transport.load().then(adopt).catch((error) => setStatus(errorMessage(error))); }, []);

  useEffect(() => {
    const collapseForNarrowWindow = () => {
      if (window.innerWidth <= 920) setNavigatorOpen(false);
    };
    collapseForNarrowWindow();
    window.addEventListener("resize", collapseForNarrowWindow);
    return () => window.removeEventListener("resize", collapseForNarrowWindow);
  }, []);

  const operations = useMemo(() => snapshot && draft ? buildOperations(snapshot, draft) : [], [snapshot, draft]);
  const dirty = operations.length > 0;
  const validation = useMemo(() => draft && snapshot ? validateDraft(draft, snapshot.cards) : undefined, [draft, snapshot]);
  const selected = draft?.affiliations.find((entry) => entry.id === selectedId);
  const cardsById = useMemo(() => new Map(snapshot?.cards.map((card) => [card.id, card]) ?? []), [snapshot]);

  useEffect(() => {
    setStatus(dirty ? `${operations.length} unsaved ${operations.length === 1 ? "change" : "changes"}` : "All changes saved");
  }, [dirty, operations.length]);

  useEffect(() => {
    if (!pickerOpen) return;
    pickerSearchRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePicker();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pickerOpen]);

  const changeDraft = (change: (next: AffiliationDraft) => void, historyKey?: string) => {
    if (!draft || saving || stale) return;
    const next = cloneDraft(draft);
    change(next);
    if (!historyKey || activeHistoryKey.current !== historyKey) {
      setPast((entries) => [...entries, cloneDraft(draft)]);
    }
    activeHistoryKey.current = historyKey;
    setFuture([]);
    setDraft(next);
    setSaveError("");
  };

  const undo = () => {
    if (!draft || past.length === 0 || saving) return;
    const previous = past[past.length - 1];
    setPast((entries) => entries.slice(0, -1));
    setFuture((entries) => [cloneDraft(draft), ...entries]);
    setDraft(cloneDraft(previous));
    activeHistoryKey.current = undefined;
  };

  const redo = () => {
    if (!draft || future.length === 0 || saving) return;
    const next = future[0];
    setFuture((entries) => entries.slice(1));
    setPast((entries) => [...entries, cloneDraft(draft)]);
    setDraft(cloneDraft(next));
    activeHistoryKey.current = undefined;
  };

  const confirmDiscard = () => !dirty || window.confirm("Discard all unsaved changes?");
  const reload = () => {
    if (!confirmDiscard() || saving) return;
    void transport.load().then(adopt).catch((error) => setSaveError(`Reload failed: ${errorMessage(error)}`));
  };
  const chooseRepository = () => {
    if (!confirmDiscard() || saving) return;
    void open({ directory: true }).then((path) => path ? transport.open(path).then(adopt) : undefined)
      .catch((error) => setSaveError(`Open failed: ${errorMessage(error)}`));
  };

  const save = async () => {
    if (!snapshot || operations.length === 0 || validation?.errorCount || saving || stale) return;
    setSaving(true);
    setSaveError("");
    setStatus("Saving changes…");
    try {
      adopt(await transport.save(operations, snapshot.sourceRevision));
    } catch (error) {
      const message = errorMessage(error);
      const sourceIsStale = message.includes("STALE_SOURCE");
      setStale(sourceIsStale);
      setSaveError(sourceIsStale ? "The RON file changed on disk. Reload before saving again." : message);
      setStatus("Changes not saved");
      setSaving(false);
    }
  };

  const closePicker = () => {
    setPickerOpen(false);
    setPickerSelection(new Set());
    window.setTimeout(() => addButtonRef.current?.focus(), 0);
  };
  const openPicker = () => {
    setPickerSelection(new Set());
    setPickerOpen(true);
  };

  if (!snapshot || !draft) {
    return <main className="cumulus loading"><GlassPanel title="Tabula" subtitle={status} footer={<GlassButton label="Open repository" variant="accent" onPress={chooseRepository} />}><div /></GlassPanel></main>;
  }

  const filteredAffiliations = draft.affiliations.filter((affiliation) => affiliation.name.toLocaleLowerCase().includes(recordSearch.trim().toLocaleLowerCase()));
  const pickerCards = searchCards(snapshot.cards, pickerSearch, pickerFilter);
  const updateAffiliation = (id: string, change: (entry: AffiliationDraft["affiliations"][number]) => void, historyKey?: string) => changeDraft((next) => {
    const entry = next.affiliations.find((candidate) => candidate.id === id);
    if (entry) change(entry);
  }, historyKey);
  const moveCard = (id: string, from: number, to: number) => updateAffiliation(id, (entry) => {
    if (to < 0 || to >= entry.signature_card_ids.length) return;
    const [moved] = entry.signature_card_ids.splice(from, 1);
    entry.signature_card_ids.splice(to, 0, moved);
  });
  const applyPicker = () => {
    if (!selected || pickerSelection.size === 0) return;
    updateAffiliation(selected.id, (entry) => {
      for (const id of pickerSelection) if (!entry.signature_card_ids.includes(id)) entry.signature_card_ids.push(id);
    });
    closePicker();
    setPickerSearch("");
  };

  return <main className="cumulus app-shell">
    <header className="topbar">
      <div className="file-identity">
        <IconButton glyph={GLYPHS.sidebarLeft} label={navigatorOpen ? "Collapse navigator" : "Expand navigator"} size="sm" placement="onGlass" ariaExpanded={navigatorOpen} ariaControls="dataset-navigator" onPress={() => setNavigatorOpen((value) => !value)} />
        <strong>Tabula</strong><span>{snapshot.repositoryRoot}</span><span className="file-name">data/affiliations.ron</span>
      </div>
      <div className="save-state" role="status" aria-live="polite" data-state={saveError ? "error" : dirty ? "dirty" : "saved"}>
        <span className="state-dot" />{saveError || status}
      </div>
      <div className="topbar-actions">
        <GlassButton label="Undo" size="compact" placement="onGlass" disabled={past.length === 0 || saving} onPress={undo} />
        <GlassButton label="Redo" size="compact" placement="onGlass" disabled={future.length === 0 || saving} onPress={redo} />
        <GlassButton label="Revert" size="compact" placement="onGlass" disabled={!dirty || saving || stale} onPress={() => adopt(snapshot)} />
        <GlassButton label={saving ? "Saving…" : "Save changes"} size="compact" variant="accent" placement="onGlass" disabled={!dirty || saving || stale || Boolean(validation?.errorCount)} onPress={() => void save()} />
        <IconButton glyph={GLYPHS.folderOpen} label="Open repository" size="sm" placement="onGlass" disabled={saving} onPress={chooseRepository} />
        <IconButton glyph={GLYPHS.refresh} label="Reload from disk" size="sm" placement="onGlass" disabled={saving} onPress={reload} />
      </div>
    </header>

    {saveError && <div className="error-banner" role="alert"><strong>Changes remain in Tabula.</strong><span>{saveError}</span>{stale && <GlassButton label="Reload from disk" size="compact" variant="accent" placement="onGlass" onPress={reload} />}</div>}

    <section className="workspace" data-navigator-open={navigatorOpen}>
      <aside className="navigator" id="dataset-navigator" aria-label="Dataset navigation" aria-hidden={!navigatorOpen}>
        <div className="navigator-header">
          <div><span className="eyebrow">Catalog</span><h1>Affiliations</h1></div>
        </div>
        {navigatorOpen && <>
          <div className="navigator-search"><TextField label="Find affiliation" kind="search" value={recordSearch} onChange={setRecordSearch} placeholder="Name…" /></div>
          <nav className="record-list" aria-label="Affiliations">
            <Pressable as="button" className="record-row settings-row" aria-current={selectedId === SETTINGS_ID ? "page" : undefined} data-selected={selectedId === SETTINGS_ID} onClick={() => setSelectedId(SETTINGS_ID)}>
              <strong>Catalog settings</strong><span>Shared balance defaults</span>
            </Pressable>
            <div className="record-divider" />
            {filteredAffiliations.map((affiliation) => {
              const original = snapshot.affiliations.find((entry) => entry.id === affiliation.id);
              const changed = original ? affiliation.name !== original.name || affiliation.atlas_card_theme !== original.atlas_card_theme || affiliation.signature_card_ids.join("\0") !== original.signature_card_ids.join("\0") : true;
              const errors = Object.keys(validation?.fields ?? {}).some((field) => field.startsWith(`${affiliation.id}.`)) || Boolean(validation?.unresolvedCardIds[affiliation.id]?.length);
              return <Pressable key={affiliation.id} as="button" className="record-row" aria-current={affiliation.id === selectedId ? "page" : undefined} data-record-id={affiliation.id} data-selected={affiliation.id === selectedId} onClick={() => setSelectedId(affiliation.id)}>
                <span className="record-title"><strong>{affiliation.name || "Untitled affiliation"}</strong>{changed && <i className="dirty-mark" aria-label="Unsaved changes" />}{errors && <i className="error-mark" aria-label="Validation error">!</i>}</span>
                <span>{affiliation.signature_card_ids.length} cards · {affiliation.atlas_card_theme || "No theme"}</span>
              </Pressable>;
            })}
            {filteredAffiliations.length === 0 && <p className="empty-navigation">No matching affiliations</p>}
          </nav>
        </>}
      </aside>

      <section className="inspector">
        {selectedId === SETTINGS_ID ? <CatalogSettings draft={draft} validation={validation?.fields ?? {}} onChange={(key, change) => changeDraft(change, key)} onCommit={() => { activeHistoryKey.current = undefined; }} /> : selected ? <AffiliationEditor
          affiliation={selected}
          cardsById={cardsById}
          validation={validation?.fields ?? {}}
          unresolved={validation?.unresolvedCardIds[selected.id] ?? []}
          onChange={(key, change) => updateAffiliation(selected.id, change, key)}
          onCommit={() => { activeHistoryKey.current = undefined; }}
          onMove={(from, to) => moveCard(selected.id, from, to)}
          onOpenPicker={(element) => { addButtonRef.current = element; openPicker(); }}
        /> : null}
      </section>
    </section>

    {pickerOpen && selected && <CardPicker
      affiliation={selected.name}
      cards={pickerCards}
      currentIds={new Set(selected.signature_card_ids)}
      selection={pickerSelection}
      query={pickerSearch}
      filter={pickerFilter}
      searchRef={pickerSearchRef}
      onQueryChange={setPickerSearch}
      onFilterChange={setPickerFilter}
      onToggle={(id) => setPickerSelection((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      })}
      onCancel={closePicker}
      onApply={applyPicker}
    />}
  </main>;
}

function CatalogSettings({ draft, validation, onChange, onCommit }: { draft: AffiliationDraft; validation: Record<string, string>; onChange: (key: string, change: (draft: AffiliationDraft) => void) => void; onCommit: () => void }) {
  return <div className="editor-page">
    <header className="editor-heading"><span className="eyebrow">Catalog</span><h2>Settings</h2><p>Shared defaults applied across every affiliation.</p></header>
    <GlassPanel title="Balance defaults" headerSpacing="compact">
      <div className="compact-fields">
        <TextField label="Random draw max multiplier" supportingText="Maximum weighting applied to affiliated random draws." error={validation.default_random_draw_max_multiplier} value={draft.default_random_draw_max_multiplier} onChange={(value) => onChange("default_random_draw_max_multiplier", (next) => { next.default_random_draw_max_multiplier = value; })} onCommit={onCommit} />
        <TextField label="Opponent deck max multiplier" supportingText="Maximum weighting applied during opponent deck construction." error={validation.default_opponent_deck_max_multiplier} value={draft.default_opponent_deck_max_multiplier} onChange={(value) => onChange("default_opponent_deck_max_multiplier", (next) => { next.default_opponent_deck_max_multiplier = value; })} onCommit={onCommit} />
      </div>
    </GlassPanel>
  </div>;
}

function AffiliationEditor({ affiliation, cardsById, validation, unresolved, onChange, onCommit, onMove, onOpenPicker }: {
  affiliation: AffiliationDraft["affiliations"][number];
  cardsById: Map<string, CardData>;
  validation: Record<string, string>;
  unresolved: string[];
  onChange: (key: string | undefined, change: (entry: AffiliationDraft["affiliations"][number]) => void) => void;
  onCommit: () => void;
  onMove: (from: number, to: number) => void;
  onOpenPicker: (element: HTMLElement) => void;
}) {
  return <div className="editor-page">
    <header className="editor-heading">
      <span className="eyebrow">Affiliation</span><h2>{affiliation.name || "Untitled affiliation"}</h2>
      <button className="uuid-button" onClick={() => void navigator.clipboard.writeText(affiliation.id)} title="Copy UUID">{affiliation.id}</button>
    </header>
    <GlassPanel title="Identity" headerSpacing="compact">
      <div className="compact-fields">
        <TextField label="Name" error={validation[`${affiliation.id}.name`]} value={affiliation.name} onChange={(value) => onChange(`${affiliation.id}.name`, (entry) => { entry.name = value; })} onCommit={onCommit} />
        <TextField label="Atlas card theme" error={validation[`${affiliation.id}.atlas_card_theme`]} value={affiliation.atlas_card_theme} onChange={(value) => onChange(`${affiliation.id}.atlas_card_theme`, (entry) => { entry.atlas_card_theme = value; })} onCommit={onCommit} />
      </div>
    </GlassPanel>
    <GlassPanel title="Signature cards" subtitle={`${affiliation.signature_card_ids.length} ordered cards`} headerSpacing="compact" rightAccessory={{ kind: "glassButton", button: { label: "Add cards", size: "compact", variant: "accent", onPress: () => onOpenPicker(document.activeElement as HTMLElement) } }}>
      <div className="signature-list" role="list" aria-label="Ordered signature cards">
        {affiliation.signature_card_ids.map((id, index) => <SignatureRow key={id} id={id} index={index} count={affiliation.signature_card_ids.length} card={cardsById.get(id)} onMove={onMove} onRemove={() => onChange(undefined, (entry) => { entry.signature_card_ids = entry.signature_card_ids.filter((cardId) => cardId !== id); })} />)}
      </div>
      {(validation[`${affiliation.id}.signature_card_ids`] || unresolved.length > 0) && <p className="inline-error" role="alert">{validation[`${affiliation.id}.signature_card_ids`] ?? `${unresolved.length} card reference ${unresolved.length === 1 ? "is" : "are"} missing from the catalog.`}</p>}
    </GlassPanel>
  </div>;
}

function SignatureRow({ id, index, count, card, onMove, onRemove }: { id: string; index: number; count: number; card?: CardData; onMove: (from: number, to: number) => void; onRemove: () => void }) {
  return <div className="signature-row" role="listitem" aria-posinset={index + 1} aria-setsize={count} data-unresolved={!card}>
    <span className="order-number">{index + 1}</span>
    {card ? <img src={`/cards/${card.imageNumber}.webp`} alt="" /> : <div className="missing-thumbnail"><span>!</span></div>}
    <div className="card-summary"><strong>{card?.name ?? "Missing card reference"}</strong><span>{card ? `${card.cardType}${card.subtype ? ` · ${card.subtype}` : ""}` : id}</span><p>{card?.renderedText || "This UUID is not present in the loaded card catalog."}</p><code>{id}</code></div>
    <div className="row-actions">
      <IconButton glyph={GLYPHS.chevronUp} label={`Move ${card?.name ?? id} up`} size="sm" placement="onGlass" disabled={index === 0} onPress={() => onMove(index, index - 1)} />
      <IconButton glyph={GLYPHS.chevronDown} label={`Move ${card?.name ?? id} down`} size="sm" placement="onGlass" disabled={index === count - 1} onPress={() => onMove(index, index + 1)} />
      <IconButton glyph={GLYPHS.trash} label={`Remove ${card?.name ?? id}`} size="sm" placement="onGlass" disabled={count === 1} onPress={onRemove} />
    </div>
  </div>;
}

function CardPicker({ affiliation, cards, currentIds, selection, query, filter, searchRef, onQueryChange, onFilterChange, onToggle, onCancel, onApply }: {
  affiliation: string; cards: CardData[]; currentIds: Set<string>; selection: Set<string>; query: string; filter: string;
  searchRef: React.RefObject<HTMLInputElement | null>;
  onQueryChange: (value: string) => void; onFilterChange: (value: string) => void; onToggle: (id: string) => void; onCancel: () => void; onApply: () => void;
}) {
  return <div className="picker-layer"><aside className="card-picker" role="dialog" aria-modal="false" aria-label="Add signature cards">
    <GlassPanel eyebrow="Signature cards" title="Add cards" subtitle={`Choosing for ${affiliation}`} frame="edgeRail" headerSpacing="compact" rightAccessory={{ kind: "iconButton", button: { glyph: GLYPHS.close, label: "Close card picker", onPress: onCancel } }} footer={<div className="picker-footer"><span>{selection.size} selected</span><GlassButton label="Cancel" size="compact" placement="onGlass" onPress={onCancel} /><GlassButton label={`Add ${selection.size} ${selection.size === 1 ? "card" : "cards"}`} size="compact" variant="accent" placement="onGlass" disabled={selection.size === 0} onPress={onApply} /></div>}>
      <div className="picker-tools"><TextField inputRef={searchRef} label="Search cards" kind="search" value={query} onChange={onQueryChange} placeholder="Name, rules, subtype, or UUID…" /><Select leadingGlyph={GLYPHS.filter} ariaLabel="Card type" size="sm" value={filter} onChange={onFilterChange} options={[{ value: "all", label: "All cards" }, { value: "Character", label: "Characters" }, { value: "Event", label: "Events" }]} /></div>
      <div className="result-summary"><strong>{cards.length} results</strong><span>Click rows to build a selection.</span></div>
      <div className="picker-results" role="listbox" aria-label="Card search results" aria-multiselectable="true">
        {cards.map((card) => {
          const current = currentIds.has(card.id);
          const chosen = selection.has(card.id);
          return <Pressable key={card.id} as="button" className="picker-row" role="option" aria-selected={current || chosen} disabled={current} data-selected={chosen} data-current={current} onClick={() => onToggle(card.id)}>
            <img src={`/cards/${card.imageNumber}.webp`} alt="" /><span className="picker-card-copy"><strong>{card.name}</strong><span>{card.cardType}{card.subtype ? ` · ${card.subtype}` : ""}</span><p>{card.renderedText}</p><code>{card.id}</code></span><span className="picker-choice">{current ? "Added" : chosen ? "Selected" : "Add"}</span>
          </Pressable>;
        })}
        {cards.length === 0 && <p className="empty-results">No matching cards</p>}
      </div>
    </GlassPanel>
  </aside></div>;
}
