import { useEffect, useMemo, useRef, useState } from "react";
import {
  glossaryDefinitionUsesRulesText,
  glossaryEntryDisplayTitle,
  type GlossaryCatalogEntry,
} from "../data/glossary";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { Select } from "../cumulus/components/controls/Select";
import { TextField } from "../cumulus/components/controls/TextField";
import { GlassPanel } from "../cumulus/components/overlay/GlassPanel";
import { EditableInfoCard } from "../cumulus/components/overlay/InfoCard";
import { Pressable } from "../cumulus/primitives/Pressable";
import { logEvent } from "../logging";
import type { EditableFieldValue } from "./save-state";
import {
  loadGlossaryEntries,
  saveGlossaryEntry,
  type GlossaryEntryEdit,
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

type InlineGlossaryField = "title" | "description";
type GlossaryDraftField = InlineGlossaryField | "variants";
type TermPresentationDraft =
  | "titleAndDefinition"
  | "symbolOnly"
  | "definitionOnly";

const TERM_PRESENTATION_OPTIONS = [
  { value: "titleAndDefinition", label: "Title + Definition" },
  { value: "definitionOnly", label: "Definition Only" },
  { value: "symbolOnly", label: "Symbol Only" },
];

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

function termPresentationDraft(
  entry: GlossaryCatalogEntry,
): TermPresentationDraft {
  return entry.termPresentation ?? "titleAndDefinition";
}

function isTermPresentationDraft(value: string): value is TermPresentationDraft {
  return (
    value === "titleAndDefinition" ||
    value === "definitionOnly" ||
    value === "symbolOnly"
  );
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
  const [presentationDraft, setPresentationDraft] =
    useState<TermPresentationDraft>("titleAndDefinition");
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [editingField, setEditingField] = useState<InlineGlossaryField | null>(null);
  const [editingError, setEditingError] = useState<string | null>(null);
  const hydratedEntryId = useRef<string | null>(null);
  const editingStartValue = useRef("");
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestSaveRevision = useRef(0);

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
    setPresentationDraft(termPresentationDraft(selectedEntry));
    setSaveState({ kind: "idle" });
    latestSaveRevision.current += 1;
    setEditingField(null);
    setEditingError(null);
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
  const dirty =
    selectedEntry !== null &&
    (termDraft.trim() !== selectedEntry.term ||
      definitionDraft.trim() !== selectedEntry.definition ||
      !sameStrings(variants, selectedEntry.variants) ||
      presentationDraft !== termPresentationDraft(selectedEntry));

  const queueSave = (submitted: GlossaryEntryEdit): void => {
    const revision = latestSaveRevision.current + 1;
    latestSaveRevision.current = revision;
    setSaveState({ kind: "saving" });

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      try {
        const entry = await saveEntry(submitted);
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
        if (latestSaveRevision.current === revision) {
          setSaveState({ kind: "saved" });
        }
        logEvent("glossary_editor_entry_saved", {
          glossaryId: entry.id,
          matchesRulesText: entry.matchesRulesText,
          termPresentation: entry.termPresentation ?? "titleAndDefinition",
        });
      } catch (error: unknown) {
        const message = messageFor(error);
        if (latestSaveRevision.current === revision) {
          setSaveState({ kind: "error", message });
        }
        logEvent("glossary_editor_entry_save_failed", {
          glossaryId: submitted.id,
          message,
        });
      }
    });
  };

  const persistDraft = (
    changedField: GlossaryDraftField,
    changedValue: string,
  ): void => {
    if (selectedEntry === null || loadState.kind !== "loaded") return;

    const nextTerm =
      changedField === "title" ? changedValue.trim() : termDraft.trim();
    const nextDefinition =
      changedField === "description"
        ? changedValue.trim()
        : definitionDraft.trim();
    const nextVariants =
      changedField === "variants"
        ? variantsFromDraft(changedValue)
        : variants;

    if (nextTerm === "" || nextDefinition === "") return;
    if (
      nextTerm === selectedEntry.term &&
      nextDefinition === selectedEntry.definition &&
      sameStrings(nextVariants, selectedEntry.variants)
    ) {
      return;
    }

    const submitted = {
      id: selectedEntry.id,
      term: nextTerm,
      definition: nextDefinition,
      variants: nextVariants,
    };
    queueSave(submitted);
  };

  const selectTermPresentation = (value: string): void => {
    if (
      selectedEntry === null ||
      !isTermPresentationDraft(value) ||
      value === presentationDraft
    ) {
      return;
    }
    setPresentationDraft(value);
    queueSave({
      id: selectedEntry.id,
      termPresentation: value === "titleAndDefinition" ? null : value,
    });
  };

  const setInlineDraft = (
    field: InlineGlossaryField,
    value: EditableFieldValue,
  ): void => {
    const text = String(value);
    if (field === "title") {
      setTermDraft(text);
    } else {
      setDefinitionDraft(text);
    }
    setEditingError(null);
    setSaveState({ kind: "idle" });
  };

  const inlineValidationMessage = (
    field: InlineGlossaryField,
    value: EditableFieldValue,
  ): string | null => {
    if (String(value).trim() !== "") return null;
    return field === "title"
      ? "Info Card title cannot be blank."
      : "Description cannot be blank.";
  };

  const beginInlineEdit = (
    field: InlineGlossaryField,
    value: EditableFieldValue,
  ): void => {
    editingStartValue.current = String(value);
    setEditingField(field);
    setEditingError(null);
  };

  const finishInlineEdit = (
    field: InlineGlossaryField,
    value: EditableFieldValue,
  ): void => {
    const message = inlineValidationMessage(field, value);
    if (message !== null) {
      setEditingError(message);
      return;
    }
    setEditingField(null);
    setEditingError(null);
    persistDraft(field, String(value));
  };

  const blurInlineEdit = (
    field: InlineGlossaryField,
    value: EditableFieldValue,
  ): void => {
    if (inlineValidationMessage(field, value) !== null) {
      setInlineDraft(field, editingStartValue.current);
    }
    setEditingField(null);
    setEditingError(null);
    persistDraft(field, String(value));
  };

  const cancelInlineEdit = (field: InlineGlossaryField): void => {
    setInlineDraft(field, editingStartValue.current);
    setEditingField(null);
    setEditingError(null);
  };

  return (
    <main className="cumulus glossary-editor-shell" data-testid="glossary-editor">
      <header className="glossary-editor-header">
        <div>
          <p className="glossary-editor-eyebrow">Helper Tool</p>
          <h1>Info Card Glossary</h1>
          <p>Author the reusable explanations players discover on hover or press.</p>
        </div>
        <span data-glossary-file="">data/tabula/glossary.ron</span>
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
            <section className="glossary-editor-workspace" aria-label="Interactive Info Card editor">
              <div className="glossary-editor-preview-heading">
                <div>
                  <p>Interactive Info Card</p>
                  <span>Click the title or description to edit it in place.</span>
                </div>
                <span>
                  {glossaryDefinitionUsesRulesText(selectedEntry)
                    ? "Rules text"
                    : "Plain text"}
                </span>
              </div>
              <div className="glossary-editor-preview-stage" data-testid="glossary-preview">
                <div className="glossary-editor-interactive-card">
                  <EditableInfoCard
                    title={
                      presentationDraft === "definitionOnly"
                        ? undefined
                        : {
                            value:
                              glossaryEntryDisplayTitle({
                                ...selectedEntry,
                                termPresentation:
                                  presentationDraft === "titleAndDefinition"
                                    ? undefined
                                    : presentationDraft,
                                term:
                                  termDraft.trim() === ""
                                    ? "Untitled Term"
                                    : termDraft,
                              }) ?? "Untitled Term",
                            draftValue: termDraft,
                            isEditing: editingField === "title",
                            ...(editingField === "title" && editingError !== null
                              ? { error: editingError }
                              : {}),
                            onBeginEdit: () => beginInlineEdit("title", termDraft),
                            onDraftChange: (value) => setInlineDraft("title", value),
                            onCancel: () => cancelInlineEdit("title"),
                            onSubmit: (value) => finishInlineEdit("title", value),
                            onBlur: (value) => blurInlineEdit("title", value),
                          }
                    }
                    body={{
                      value: definitionDraft,
                      draftValue: definitionDraft,
                      isEditing: editingField === "description",
                      ...(editingField === "description" && editingError !== null
                        ? { error: editingError }
                        : {}),
                      onBeginEdit: () =>
                        beginInlineEdit("description", definitionDraft),
                      onDraftChange: (value) =>
                        setInlineDraft("description", value),
                      onCancel: () => cancelInlineEdit("description"),
                      onSubmit: (value) =>
                        finishInlineEdit("description", value),
                      onBlur: (value) => blurInlineEdit("description", value),
                    }}
                    bodyFormat={
                      glossaryDefinitionUsesRulesText(selectedEntry)
                        ? "rules"
                        : "plain"
                    }
                  />
                </div>
              </div>

              <div className="glossary-editor-details">
                <GlassPanel
                  eyebrow={selectedEntry.category}
                  title="Definition Details"
                  subtitle={`Stable id: ${selectedEntry.id}`}
                  frame="floating"
                  testId="glossary-editor-details"
                >
                  <div className="glossary-editor-details-body">
                    <div className="glossary-editor-presentation">
                      <p>Term Presentation</p>
                      <Select
                        full
                        options={TERM_PRESENTATION_OPTIONS}
                        value={presentationDraft}
                        onChange={selectTermPresentation}
                        ariaLabel="Term Presentation"
                      />
                      <span>
                        Definition Only hides the term heading while keeping its
                        explanatory copy visible.
                      </span>
                    </div>
                    {presentationDraft === "definitionOnly" ? (
                      <TextField
                        label="Catalog Term"
                        value={termDraft}
                        onChange={(value) => {
                          setTermDraft(value);
                          setSaveState({ kind: "idle" });
                        }}
                        supportingText="Used for matching and catalog search; hidden from the Info Card."
                        testId="glossary-term-input"
                      />
                    ) : null}
                    {glossaryDefinitionUsesRulesText(selectedEntry) ? (
                      <div
                        onBlur={() => persistDraft("variants", variantsDraft)}
                      >
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
                      </div>
                    ) : (
                      <p className="glossary-editor-entry-kind">
                        This explanation appears as an Info Card and is not matched in rules text.
                      </p>
                    )}
                    <div className="glossary-editor-save-status">
                      <p role="status" data-save-state={saveState.kind}>
                        {saveState.kind === "saving"
                          ? "Saving to glossary.ron…"
                          : saveState.kind === "saved"
                          ? "Saved to glossary.ron"
                          : saveState.kind === "error"
                            ? saveState.message
                            : dirty
                              ? "Changes save when the field loses focus"
                              : "Up to date"}
                      </p>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </section>
          )}
        </div>
      ) : null}
    </main>
  );
}
