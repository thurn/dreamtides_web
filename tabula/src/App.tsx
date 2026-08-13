import { useEffect, useMemo, useRef, useState } from "react";
import { assertLocalized } from "@trox/runtime";
import { open } from "@tauri-apps/plugin-dialog";
import { GlassButton } from "../../src/cumulus/components/controls/GlassButton";
import { IconButton } from "../../src/cumulus/components/controls/IconButton";
import { Select } from "../../src/cumulus/components/controls/Select";
import { TextField } from "../../src/cumulus/components/controls/TextField";
import { GlassPanel } from "../../src/cumulus/components/overlay/GlassPanel";
import { Pressable } from "../../src/cumulus/primitives/Pressable";
import { GLYPHS } from "../../src/cumulus/primitives/glyph";
import {
  buildOperations,
  createTransport,
  draftFromSnapshot,
  validateDraft,
  type AffiliationDraft,
  type EditorSnapshot,
  type TideSummary,
} from "./editor";

const transport = createTransport();

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
  const [selectedId, setSelectedId] = useState("");
  const [recordSearch, setRecordSearch] = useState("");
  const [navigatorOpen, setNavigatorOpen] = useState(true);
  const [past, setPast] = useState<AffiliationDraft[]>([]);
  const [future, setFuture] = useState<AffiliationDraft[]>([]);
  const [status, setStatus] = useState("Opening repository…");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [stale, setStale] = useState(false);
  const activeHistoryKey = useRef<string | undefined>(undefined);

  const adopt = (next: EditorSnapshot) => {
    setSnapshot(next);
    setDraft(draftFromSnapshot(next));
    setPast([]);
    setFuture([]);
    setSaveError("");
    setStale(false);
    setSaving(false);
    setSelectedId((current) =>
      next.affiliations.some((entry) => entry.id === current)
        ? current
        : (next.affiliations[0]?.id ?? ""),
    );
    setStatus("All changes saved");
  };

  useEffect(() => {
    void transport
      .load()
      .then(adopt)
      .catch((error) => setStatus(errorMessage(error)));
  }, []);

  useEffect(() => {
    const collapseForNarrowWindow = () => {
      if (window.innerWidth <= 920) setNavigatorOpen(false);
    };
    collapseForNarrowWindow();
    window.addEventListener("resize", collapseForNarrowWindow);
    return () => window.removeEventListener("resize", collapseForNarrowWindow);
  }, []);

  const operations = useMemo(
    () => (snapshot && draft ? buildOperations(snapshot, draft) : []),
    [snapshot, draft],
  );
  const dirty = operations.length > 0;
  const validation = useMemo(
    () =>
      draft && snapshot ? validateDraft(draft, snapshot.tides) : undefined,
    [draft, snapshot],
  );
  const selected = draft?.affiliations.find((entry) => entry.id === selectedId);
  const previewOnly = transport.persistence === "memory";
  const firstInvalidId = draft?.affiliations.find(
    (affiliation) =>
      Object.keys(validation?.fields ?? {}).some((field) =>
        field.startsWith(`${affiliation.id}.`),
      ) || Boolean(validation?.unresolvedTideIds[affiliation.id]?.length),
  )?.id;

  useEffect(() => {
    const errorCount = validation?.errorCount ?? 0;
    if (dirty && errorCount > 0) {
      setStatus(
        `${errorCount} validation ${errorCount === 1 ? "error" : "errors"}`,
      );
    } else if (dirty) {
      const changeLabel = `${operations.length} ${operations.length === 1 ? "change" : "changes"}`;
      setStatus(
        previewOnly
          ? `${changeLabel} in preview · not written to disk`
          : `${changeLabel} not saved`,
      );
    } else {
      setStatus(
        previewOnly
          ? "Preview session · edits are not written to disk"
          : "All changes saved",
      );
    }
  }, [dirty, operations.length, previewOnly, validation?.errorCount]);

  const changeDraft = (
    change: (next: AffiliationDraft) => void,
    historyKey?: string,
  ) => {
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

  const confirmDiscard = () =>
    !dirty || window.confirm("Discard all unsaved changes?");
  const revert = () => {
    if (snapshot && confirmDiscard() && !saving) adopt(snapshot);
  };
  const showFirstError = () => {
    if (!firstInvalidId) return;
    setRecordSearch("");
    setNavigatorOpen(true);
    setSelectedId(firstInvalidId);
  };
  const reload = () => {
    if (!confirmDiscard() || saving) return;
    void transport
      .load()
      .then(adopt)
      .catch((error) => setSaveError(`Reload failed: ${errorMessage(error)}`));
  };
  const chooseRepository = () => {
    if (!confirmDiscard() || saving) return;
    void open({ directory: true })
      .then((path) => (path ? transport.open(path).then(adopt) : undefined))
      .catch((error) => setSaveError(`Open failed: ${errorMessage(error)}`));
  };

  const save = async () => {
    if (
      !snapshot ||
      operations.length === 0 ||
      validation?.errorCount ||
      saving ||
      stale
    )
      return;
    setSaving(true);
    setSaveError("");
    setStatus("Saving changes…");
    try {
      adopt(await transport.save(operations, snapshot.sourceRevision));
    } catch (error) {
      const message = errorMessage(error);
      const sourceIsStale = message.includes("STALE_SOURCE");
      setStale(sourceIsStale);
      setSaveError(
        sourceIsStale
          ? "The RON file changed on disk. Reload before saving again."
          : message,
      );
      setStatus("Changes not saved");
      setSaving(false);
    }
  };

  if (!snapshot || !draft) {
    return (
      <main className="cumulus loading">
        <GlassPanel
          title={assertLocalized("Tabula")}
          subtitle={assertLocalized(status)}
          footer={
            <GlassButton
              label={assertLocalized("Open repository")}
              variant="accent"
              onPress={chooseRepository}
            />
          }
        >
          <div />
        </GlassPanel>
      </main>
    );
  }

  const normalizedSearch = recordSearch.trim().toLocaleLowerCase();
  const filteredAffiliations = draft.affiliations.filter(
    (affiliation) =>
      affiliation.name.toLocaleLowerCase().includes(normalizedSearch) ||
      affiliation.id.toLocaleLowerCase().includes(normalizedSearch),
  );
  const updateAffiliation = (
    id: string,
    change: (entry: AffiliationDraft["affiliations"][number]) => void,
    historyKey?: string,
  ) =>
    changeDraft((next) => {
      const entry = next.affiliations.find((candidate) => candidate.id === id);
      if (entry) change(entry);
    }, historyKey);

  return (
    <main className="cumulus app-shell">
      <header className="topbar">
        <div className="file-identity">
          <IconButton
            glyph={GLYPHS.sidebarLeft}
            label={assertLocalized(
              navigatorOpen ? "Collapse navigator" : "Expand navigator",
            )}
            size="sm"
            placement="onGlass"
            ariaExpanded={navigatorOpen}
            ariaControls="dataset-navigator"
            onPress={() => setNavigatorOpen((value) => !value)}
          />
          <strong>Tabula</strong>
          <span>{snapshot.repositoryRoot}</span>
          <span className="file-name">data/affiliations.ron</span>
        </div>
        <div
          className="save-state"
          role="status"
          aria-live="polite"
          data-state={saveError ? "error" : dirty ? "dirty" : "saved"}
        >
          <span className="state-dot" />
          {saveError || status}
        </div>
        <div className="topbar-actions">
          <span className="desktop-action">
            <GlassButton
              label={assertLocalized("Undo")}
              size="compact"
              placement="onGlass"
              disabled={past.length === 0 || saving}
              onPress={undo}
            />
          </span>
          <span className="desktop-action">
            <GlassButton
              label={assertLocalized("Redo")}
              size="compact"
              placement="onGlass"
              disabled={future.length === 0 || saving}
              onPress={redo}
            />
          </span>
          <span className="desktop-action">
            <GlassButton
              label={assertLocalized("Revert")}
              size="compact"
              placement="onGlass"
              disabled={!dirty || saving || stale}
              onPress={revert}
            />
          </span>
          <GlassButton
            label={assertLocalized(
              saving
                ? "Saving…"
                : previewOnly
                  ? "Apply preview changes"
                  : "Save changes",
            )}
            size="compact"
            variant="accent"
            placement="onGlass"
            disabled={
              !dirty || saving || stale || Boolean(validation?.errorCount)
            }
            onPress={() => void save()}
          />
          <IconButton
            glyph={GLYPHS.folderOpen}
            label={assertLocalized("Open repository")}
            size="sm"
            placement="onGlass"
            disabled={saving}
            onPress={chooseRepository}
          />
          <IconButton
            glyph={GLYPHS.refresh}
            label={assertLocalized("Reload from disk")}
            size="sm"
            placement="onGlass"
            disabled={saving}
            onPress={reload}
          />
        </div>
      </header>

      {saveError ? (
        <div className="error-banner" role="alert">
          <strong>Changes remain in Tabula.</strong>
          <span>{saveError}</span>
          {stale && (
            <GlassButton
              label={assertLocalized("Reload from disk")}
              size="compact"
              variant="accent"
              placement="onGlass"
              onPress={reload}
            />
          )}
        </div>
      ) : dirty && Boolean(validation?.errorCount) ? (
        <div className="error-banner validation-banner" role="alert">
          <strong>
            {validation?.errorCount} validation{" "}
            {validation?.errorCount === 1 ? "error blocks" : "errors block"}{" "}
            saving.
          </strong>
          <span>Open the marked affiliation and correct its fields.</span>
          <GlassButton
            label={assertLocalized("Show first error")}
            size="compact"
            variant="accent"
            placement="onGlass"
            onPress={showFirstError}
          />
        </div>
      ) : null}

      <section className="workspace" data-navigator-open={navigatorOpen}>
        <aside
          className="navigator"
          id="dataset-navigator"
          aria-label="Dataset navigation"
          aria-hidden={!navigatorOpen}
        >
          <div className="navigator-header">
            <div>
              <span className="eyebrow">Catalog</span>
              <h1>Affiliations</h1>
            </div>
          </div>
          {navigatorOpen && (
            <>
              <div className="navigator-search">
                <TextField
                  label={assertLocalized("Find affiliation")}
                  kind="search"
                  value={recordSearch}
                  onChange={setRecordSearch}
                  placeholder={assertLocalized("Name or UUID…")}
                />
              </div>
              <nav className="record-list" aria-label="Affiliations">
                {filteredAffiliations.map((affiliation) => {
                  const original = snapshot.affiliations.find(
                    (entry) => entry.id === affiliation.id,
                  );
                  const changed = original
                    ? affiliation.name !== original.name ||
                      affiliation.atlas_card_theme !==
                        original.atlas_card_theme ||
                      affiliation.tide_ids.join("\0") !==
                        original.tide_ids.join("\0")
                    : true;
                  const errors =
                    Object.keys(validation?.fields ?? {}).some((field) =>
                      field.startsWith(`${affiliation.id}.`),
                    ) ||
                    Boolean(
                      validation?.unresolvedTideIds[affiliation.id]?.length,
                    );
                  return (
                    <Pressable
                      key={affiliation.id}
                      as="button"
                      className="record-row"
                      aria-current={
                        affiliation.id === selectedId ? "page" : undefined
                      }
                      data-record-id={affiliation.id}
                      data-selected={affiliation.id === selectedId}
                      onClick={() => {
                        setSelectedId(affiliation.id);
                        if (window.innerWidth <= 920) setNavigatorOpen(false);
                      }}
                    >
                      <span className="record-title">
                        <strong>
                          {affiliation.name || "Untitled affiliation"}
                        </strong>
                        {changed && (
                          <i
                            className="dirty-mark"
                            aria-label="Unsaved changes"
                          />
                        )}
                        {errors && (
                          <i
                            className="error-mark"
                            aria-label="Validation error"
                          >
                            !
                          </i>
                        )}
                      </span>
                      <span className="record-meta" title={affiliation.id}>
                        {affiliation.id} · {affiliation.tide_ids.length} tides ·{" "}
                        {affiliation.atlas_card_theme || "No theme"}
                      </span>
                    </Pressable>
                  );
                })}
                {filteredAffiliations.length === 0 && (
                  <p className="empty-navigation">No matching affiliations</p>
                )}
              </nav>
            </>
          )}
        </aside>

        <section className="inspector">
          {selected ? (
            <AffiliationEditor
              affiliation={selected}
              tides={snapshot.tides}
              validation={validation?.fields ?? {}}
              unresolved={validation?.unresolvedTideIds[selected.id] ?? []}
              onChange={(key, change) =>
                updateAffiliation(selected.id, change, key)
              }
              onCommit={() => {
                activeHistoryKey.current = undefined;
              }}
            />
          ) : null}
        </section>
      </section>
    </main>
  );
}

function AffiliationEditor({
  affiliation,
  tides,
  validation,
  unresolved,
  onChange,
  onCommit,
}: {
  affiliation: AffiliationDraft["affiliations"][number];
  tides: readonly TideSummary[];
  validation: Record<string, string>;
  unresolved: string[];
  onChange: (
    key: string | undefined,
    change: (entry: AffiliationDraft["affiliations"][number]) => void,
  ) => void;
  onCommit: () => void;
}) {
  const [copiedId, setCopiedId] = useState("");
  const sortedTides = useMemo(
    () =>
      [...tides].sort(
        (left, right) =>
          left.displayName.localeCompare(right.displayName) ||
          left.id.localeCompare(right.id),
      ),
    [tides],
  );
  useEffect(() => setCopiedId(""), [affiliation.id]);
  return (
    <div className="editor-page">
      <header className="editor-heading">
        <span className="eyebrow">Affiliation</span>
        <h2>{affiliation.name || "Untitled affiliation"}</h2>
        <button
          className="uuid-button"
          onClick={() =>
            void navigator.clipboard
              .writeText(affiliation.id)
              .then(() => setCopiedId(affiliation.id))
          }
          title={copiedId === affiliation.id ? "UUID copied" : "Copy UUID"}
          aria-label={
            copiedId === affiliation.id
              ? "UUID copied"
              : `Copy UUID ${affiliation.id}`
          }
        >
          {affiliation.id}
        </button>
        {copiedId === affiliation.id && (
          <span className="copy-status" role="status">
            Copied
          </span>
        )}
      </header>
      <GlassPanel title={assertLocalized("Identity")} headerSpacing="compact">
        <div className="compact-fields">
          <TextField
            label={assertLocalized("Name")}
            error={
              validation[`${affiliation.id}.name`] === undefined
                ? undefined
                : assertLocalized(validation[`${affiliation.id}.name`])
            }
            value={affiliation.name}
            onChange={(value) =>
              onChange(`${affiliation.id}.name`, (entry) => {
                entry.name = value;
              })
            }
            onCommit={onCommit}
          />
          <TextField
            label={assertLocalized("Atlas card theme")}
            error={
              validation[`${affiliation.id}.atlas_card_theme`] === undefined
                ? undefined
                : assertLocalized(
                    validation[`${affiliation.id}.atlas_card_theme`],
                  )
            }
            value={affiliation.atlas_card_theme}
            onChange={(value) =>
              onChange(`${affiliation.id}.atlas_card_theme`, (entry) => {
                entry.atlas_card_theme = value;
              })
            }
            onCommit={onCommit}
          />
        </div>
      </GlassPanel>
      <GlassPanel
        title={assertLocalized("Affinity tides")}
        subtitle={assertLocalized("Exactly three distinct tides")}
        headerSpacing="compact"
      >
        <div className="tide-fields">
          {affiliation.tide_ids.map((tideId, index) => (
            <label className="tide-field" key={index}>
              <span>{["First tide", "Second tide", "Third tide"][index]}</span>
              <Select
                ariaLabel={assertLocalized(
                  `Affiliation tide ${String(index + 1)}`,
                )}
                full
                options={sortedTides.map((tide) => {
                  const usedByAnotherField = affiliation.tide_ids.some(
                    (selectedTideId, selectedIndex) =>
                      selectedIndex !== index && selectedTideId === tide.id,
                  );
                  return {
                    value: tide.id,
                    label: assertLocalized(
                      `${tide.displayName} · ${tide.role} · ${tide.id}`,
                    ),
                    triggerLabel: assertLocalized(
                      `${tide.displayName} · ${tide.role}`,
                    ),
                    disabled: usedByAnotherField && tide.id !== tideId,
                  };
                })}
                value={tideId}
                onChange={(value) =>
                  onChange(undefined, (entry) => {
                    entry.tide_ids[index] = value;
                  })
                }
              />
              <code>{tideId}</code>
            </label>
          ))}
        </div>
        {(validation[`${affiliation.id}.tide_ids`] ||
          unresolved.length > 0) && (
          <p className="inline-error" role="alert">
            {validation[`${affiliation.id}.tide_ids`] ??
              `${unresolved.length} tide reference ${unresolved.length === 1 ? "is" : "are"} missing from the catalog.`}
          </p>
        )}
      </GlassPanel>
    </div>
  );
}
