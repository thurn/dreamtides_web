import { useEffect, useMemo, useRef, useState } from "react";
import type { GlossaryCatalogEntry } from "../data/glossary";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { TextArea } from "../cumulus/components/controls/TextArea";
import { TextField } from "../cumulus/components/controls/TextField";
import { richText } from "../cumulus/components/card/rich-text";
import { GlassPanel } from "../cumulus/components/overlay/GlassPanel";
import { InfoCard } from "../cumulus/components/overlay/InfoCard";
import { Pressable } from "../cumulus/primitives/Pressable";
import { logEvent } from "../logging";
import {
  loadGlossaryEntries,
  saveGlossaryEntry,
} from "./glossary-editor-api";
import "./glossary-editor.css";

type LoadState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "loaded"; readonly entries: readonly GlossaryCatalogEntry[] };

type SaveState =
  | { readonly kind: "idle" }
  | { readonly kind: "saving" }
  | { readonly kind: "saved" }
  | { readonly kind: "error"; readonly message: string };

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The glossary request failed.";
}

function variantsFromDraft(value: string): string[] {
  return value
    .split(",")
    .map((variant) => variant.trim())
    .filter((variant) => variant !== "");
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export interface GlossaryEditorAppProps {
  readonly loadEntries?: typeof loadGlossaryEntries;
  readonly saveEntry?: typeof saveGlossaryEntry;
}

/** Standalone authoring surface for every reusable explanatory Info Card. */
export default function GlossaryEditorApp({
  loadEntries = loadGlossaryEntries,
  saveEntry = saveGlossaryEntry,
}: GlossaryEditorAppProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [termDraft, setTermDraft] = useState("");
  const [definitionDraft, setDefinitionDraft] = useState("");
  const [variantsDraft, setVariantsDraft] = useState("");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const hydratedEntryId = useRef<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ kind: "loading" });
    void loadEntries(controller.signal)
      .then((entries) => {
        setLoadState({ kind: "loaded", entries });
        setSelectedId((current) => current ?? entries[0]?.id ?? null);
        logEvent("glossary_editor_loaded", { entryCount: entries.length });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message = messageFor(error);
        setLoadState({ kind: "error", message });
        logEvent("glossary_editor_load_failed", { message });
      });
    return () => controller.abort();
  }, [loadAttempt, loadEntries]);

  const selectedEntry =
    loadState.kind === "loaded"
      ? loadState.entries.find((entry) => entry.id === selectedId) ?? null
      : null;

  useEffect(() => {
    if (selectedEntry === null) return;
    if (hydratedEntryId.current === selectedEntry.id) return;
    hydratedEntryId.current = selectedEntry.id;
    setTermDraft(selectedEntry.term);
    setDefinitionDraft(selectedEntry.definition);
    setVariantsDraft(selectedEntry.variants.join(", "));
    setSaveState({ kind: "idle" });
  }, [selectedEntry]);

  const filteredEntries = useMemo(() => {
    if (loadState.kind !== "loaded") return [];
    const query = search.trim().toLocaleLowerCase();
    return query === ""
      ? [...loadState.entries]
      : loadState.entries.filter((entry) =>
          [entry.term, entry.definition, entry.category, entry.id]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query),
        );
  }, [loadState, search]);

  const groupedEntries = useMemo(() => {
    const groups = new Map<string, GlossaryCatalogEntry[]>();
    for (const entry of filteredEntries) {
      const group = groups.get(entry.category) ?? [];
      group.push(entry);
      groups.set(entry.category, group);
    }
    return [...groups.entries()];
  }, [filteredEntries]);

  const variants = variantsFromDraft(variantsDraft);
  const termError = termDraft.trim() === "" ? "Info Card title cannot be blank." : undefined;
  const definitionError = definitionDraft.trim() === "" ? "Description cannot be blank." : undefined;
  const dirty =
    selectedEntry !== null &&
    (termDraft.trim() !== selectedEntry.term ||
      definitionDraft.trim() !== selectedEntry.definition ||
      !sameStrings(variants, selectedEntry.variants));
  const canSave =
    selectedEntry !== null &&
    dirty &&
    termError === undefined &&
    definitionError === undefined &&
    saveState.kind !== "saving";

  const commit = (): void => {
    if (!canSave || selectedEntry === null || loadState.kind !== "loaded") return;
    const submitted = {
      id: selectedEntry.id,
      term: termDraft.trim(),
      definition: definitionDraft.trim(),
      variants,
    };
    setSaveState({ kind: "saving" });
    void saveEntry(submitted)
      .then((entry) => {
        setTermDraft(entry.term);
        setDefinitionDraft(entry.definition);
        setVariantsDraft(entry.variants.join(", "));
        setLoadState((current) =>
          current.kind === "loaded"
            ? {
                kind: "loaded",
                entries: current.entries.map((candidate) =>
                  candidate.id === entry.id ? entry : candidate,
                ),
              }
            : current,
        );
        setSaveState({ kind: "saved" });
        logEvent("glossary_editor_entry_saved", {
          glossaryId: entry.id,
          matchesRulesText: entry.matchesRulesText,
        });
      })
      .catch((error: unknown) => {
        const message = messageFor(error);
        setSaveState({ kind: "error", message });
        logEvent("glossary_editor_entry_save_failed", {
          glossaryId: selectedEntry.id,
          message,
        });
      });
  };

  return (
    <main className="cumulus glossary-editor-shell" data-testid="glossary-editor">
      <header className="glossary-editor-header">
        <div>
          <p className="glossary-editor-eyebrow">Helper Tool</p>
          <h1>Info Card Glossary</h1>
          <p>Author the reusable explanations players discover on hover or press.</p>
        </div>
        <span data-glossary-file="">data/tabula/glossary.toml</span>
      </header>

      {loadState.kind === "loading" ? (
        <p className="glossary-editor-status" role="status">Loading glossary…</p>
      ) : null}

      {loadState.kind === "error" ? (
        <section className="glossary-editor-load-error" role="alert">
          <h2>Unable to load the glossary</h2>
          <p>{loadState.message}</p>
          <GlassButton label="Retry" variant="accent" onPress={() => setLoadAttempt((value) => value + 1)} />
        </section>
      ) : null}

      {loadState.kind === "loaded" ? (
        <div className="glossary-editor-layout">
          <aside className="glossary-editor-catalog">
            <GlassPanel
              eyebrow={`${String(filteredEntries.length)} of ${String(loadState.entries.length)}`}
              title="Definitions"
              subtitle="Select a term to edit"
              frame="floating"
              testId="glossary-editor-catalog"
            >
              <div className="glossary-editor-catalog-body">
                <TextField
                  label="Search"
                  kind="search"
                  value={search}
                  onChange={setSearch}
                  placeholder="Term, category, or copy"
                  testId="glossary-search"
                />
                <div className="glossary-editor-term-list">
                  {groupedEntries.map(([category, entries]) => (
                    <section key={category}>
                      <h2>{category}</h2>
                      <div>
                        {entries.map((entry) => (
                          <Pressable
                            as="button"
                            key={entry.id}
                            className="glossary-editor-term"
                            data-glossary-entry-id={entry.id}
                            aria-pressed={entry.id === selectedId}
                            onClick={() => setSelectedId(entry.id)}
                          >
                            <span>{entry.term}</span>
                            <small>{entry.matchesRulesText ? "Rules term" : "Info Card"}</small>
                          </Pressable>
                        ))}
                      </div>
                    </section>
                  ))}
                  {filteredEntries.length === 0 ? (
                    <p className="glossary-editor-empty" role="status">No definitions match.</p>
                  ) : null}
                </div>
              </div>
            </GlassPanel>
          </aside>

          {selectedEntry === null ? null : (
            <section className="glossary-editor-form">
              <GlassPanel
                eyebrow={selectedEntry.category}
                title={selectedEntry.term}
                subtitle={`Stable id: ${selectedEntry.id}`}
                frame="floating"
                testId="glossary-editor-form"
              >
                <div className="glossary-editor-fields">
                  <TextField
                    label="Info Card Title"
                    value={termDraft}
                    onChange={(value) => {
                      setTermDraft(value);
                      setSaveState({ kind: "idle" });
                    }}
                    error={termError}
                    testId="glossary-term-input"
                  />
                  <TextArea
                    label="Description"
                    value={definitionDraft}
                    onChange={(value) => {
                      setDefinitionDraft(value);
                      setSaveState({ kind: "idle" });
                    }}
                    onCommit={commit}
                    error={definitionError}
                    supportingText="Command/Ctrl+Enter saves the current definition."
                    testId="glossary-definition-input"
                  />
                  {selectedEntry.matchesRulesText ? (
                    <TextField
                      label="Additional Rules-Text Forms"
                      value={variantsDraft}
                      onChange={(value) => {
                        setVariantsDraft(value);
                        setSaveState({ kind: "idle" });
                      }}
                      supportingText="Comma-separated plurals, tenses, or trigger forms."
                      testId="glossary-variants-input"
                    />
                  ) : null}
                  <div className="glossary-editor-save-row">
                    <GlassButton
                      label={saveState.kind === "saving" ? "Saving…" : "Save Definition"}
                      widthReservations={[
                        { label: "Save Definition", essenceCost: null },
                        { label: "Saving…", essenceCost: null },
                      ]}
                      variant="accent"
                      placement="onGlass"
                      disabled={!canSave}
                      onPress={commit}
                      testId="glossary-save"
                    />
                    <p role="status" data-save-state={saveState.kind}>
                      {saveState.kind === "saved"
                        ? "Saved to glossary.toml"
                        : saveState.kind === "error"
                          ? saveState.message
                          : dirty
                            ? "Unsaved changes"
                            : "Up to date"}
                    </p>
                  </div>
                </div>
              </GlassPanel>
            </section>
          )}

          {selectedEntry === null ? null : (
            <aside className="glossary-editor-preview" aria-label="Rendered Info Card preview">
              <div className="glossary-editor-preview-heading">
                <p>Rendered Preview</p>
                <span>{selectedEntry.matchesRulesText ? "Rules text" : "Plain text"}</span>
              </div>
              <div className="glossary-editor-preview-stage" data-testid="glossary-preview">
                <InfoCard
                  variant="text"
                  title={termDraft.trim() === "" ? "Untitled Term" : termDraft}
                  body={
                    selectedEntry.matchesRulesText
                      ? richText.rules(definitionDraft)
                      : richText.plain(definitionDraft)
                  }
                />
              </div>
            </aside>
          )}
        </div>
      ) : null}
    </main>
  );
}
