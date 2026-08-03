import { useCallback, useEffect, useRef, useState } from "react";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { IconButton } from "../cumulus/components/controls/IconButton";
import { GlassPanel } from "../cumulus/components/overlay/GlassPanel";
import { artRef, resolveArtRef } from "../cumulus/primitives/art";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import EditableField from "./EditableField";
import { EditorApiRequestError } from "./editor-api";
import { encounterEditorClient } from "./encounter-editor-api";
import {
  EncounterTemplateHealthRail,
} from "./EncounterTemplateHealthRail";
import type {
  EncounterEditorAction,
  EncounterEditorCandidate,
  EncounterEditorClient,
  EncounterEditorGroup,
  EncounterTemplateHealth,
  EncounterTextField,
} from "./encounter-editor-types";
import {
  beginFieldEdit,
  cancelFieldEdit,
  completeFieldSave,
  EMPTY_EDITOR_SAVE_STATE,
  failFieldSave,
  fieldSaveEntry,
  rejectFieldEdit,
  rejectSubmittedFieldSave,
  startFieldSave,
  updateFieldDraft,
  type EditableSaveState,
  type FieldTarget,
} from "./save-state";
import "./encounter-editor.css";

type LoadState = "loading" | "ready" | "error";
interface SelectionState {
  status: "idle" | "saving" | "saved" | "error";
  revision: number;
  message: string | null;
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function selectedCandidate(group: EncounterEditorGroup): EncounterEditorCandidate {
  const selected = group.encounters.filter((candidate) => candidate.selected === true);
  if (selected.length !== 1) {
    throw new Error(`${group.cardName} must have exactly one selected encounter.`);
  }
  return selected[0];
}

function replaceSelection(
  groups: EncounterEditorGroup[],
  cardId: string,
  templatePairId: string,
): EncounterEditorGroup[] {
  return groups.map((group) => group.cardId !== cardId ? group : {
    ...group,
    encounters: group.encounters.map((candidate) => ({
      ...candidate,
      ...(candidate.template_pair_id === templatePairId ? { selected: true as const } : {}),
      ...(candidate.template_pair_id !== templatePairId && candidate.selected === true
        ? { selected: undefined }
        : {}),
    })),
  });
}

function updateConfirmedText(
  groups: EncounterEditorGroup[],
  request: {
    cardId: string;
    templatePairId: string;
    field: EncounterTextField;
    actionTemplateId?: number;
    value: string;
  },
): EncounterEditorGroup[] {
  return groups.map((group) => group.cardId !== request.cardId ? group : {
    ...group,
    encounters: group.encounters.map((candidate) => {
      if (candidate.template_pair_id !== request.templatePairId) return candidate;
      if (request.field === "prose") return { ...candidate, prose: request.value };
      return {
        ...candidate,
        actions: candidate.actions.map((action) =>
          action.template_id === request.actionTemplateId
            ? { ...action, [request.field]: request.value }
            : action,
        ) as [EncounterEditorAction, EncounterEditorAction],
      };
    }),
  });
}

function fieldTarget(
  group: EncounterEditorGroup,
  candidate: EncounterEditorCandidate,
  field: EncounterTextField,
  actionTemplateId?: number,
): FieldTarget {
  return {
    cardId: `${group.cardId}:${candidate.template_pair_id}:${actionTemplateId ?? "candidate"}`,
    field,
  };
}

function EncounterEditorRow({
  client,
  group,
  index,
  selectionState,
  saveState,
  setGroups,
  setSaveState,
  setSelectionStates,
}: {
  client: EncounterEditorClient;
  group: EncounterEditorGroup;
  index: number;
  selectionState: SelectionState;
  saveState: EditableSaveState;
  setGroups: React.Dispatch<React.SetStateAction<EncounterEditorGroup[]>>;
  setSaveState: (update: (state: EditableSaveState) => EditableSaveState) => void;
  setSelectionStates: React.Dispatch<React.SetStateAction<Record<string, SelectionState>>>;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const selected = selectedCandidate(group);
  const ranked = [...group.encounters].sort((left, right) => left.rank - right.rank);
  const selectedIndex = ranked.findIndex(
    (candidate) => candidate.template_pair_id === selected.template_pair_id,
  );
  const isSelectionSaving = selectionState.status === "saving";

  async function choose(direction: -1 | 1) {
    const next = ranked[selectedIndex + direction];
    if (next === undefined || isSelectionSaving) return;
    const revision = selectionState.revision + 1;
    setGroups((current) => replaceSelection(current, group.cardId, next.template_pair_id));
    setSelectionStates((current) => ({
      ...current,
      [group.cardId]: { status: "saving", revision, message: null },
    }));
    try {
      const response = await client.saveSelection({
        cardId: group.cardId,
        templatePairId: next.template_pair_id,
        clientRevision: revision,
      });
      if (
        response.clientRevision !== revision ||
        response.confirmation.cardId !== group.cardId ||
        response.confirmation.selectedTemplatePairId !== next.template_pair_id
      ) {
        throw new Error("The server returned a mismatched selection confirmation.");
      }
      setSelectionStates((current) => current[group.cardId]?.revision !== revision
        ? current
        : { ...current, [group.cardId]: { status: "saved", revision, message: null } });
      logEvent("encounter_editor_selection_saved", {
        cardId: group.cardId,
        fromTemplatePairId: selected.template_pair_id,
        fromRank: selected.rank,
        toTemplatePairId: next.template_pair_id,
        toRank: next.rank,
      });
    } catch (error) {
      setGroups((current) => replaceSelection(current, group.cardId, selected.template_pair_id));
      setSelectionStates((current) => current[group.cardId]?.revision !== revision
        ? current
        : { ...current, [group.cardId]: { status: "error", revision, message: messageFor(error) } });
      logEvent("encounter_editor_selection_failed", {
        cardId: group.cardId,
        templatePairId: next.template_pair_id,
        message: messageFor(error),
      });
    }
  }

  function editable(
    field: EncounterTextField,
    value: string,
    children: React.ReactNode,
    actionTemplateId?: number,
    mode: "single-line" | "multiline" = "multiline",
  ) {
    const target = fieldTarget(group, selected, field, actionTemplateId);
    const entry = fieldSaveEntry(saveState, target);
    const update = (operation: (state: EditableSaveState) => EditableSaveState) => {
      setSaveState(operation);
    };
    const save = async (rawValue: string | number, keepInvalidDraft: boolean) => {
      const nextValue = String(rawValue);
      if (nextValue.trim() === "") {
        update((state) => keepInvalidDraft
          ? rejectFieldEdit(state, target, nextValue, value, "Text cannot be blank.")
          : cancelFieldEdit(state, target, value));
        return;
      }
      if (nextValue === value) {
        update((state) => cancelFieldEdit(state, target, value));
        return;
      }
      let revision = 0;
      update((state) => {
        const started = startFieldSave(state, target, nextValue, value);
        revision = started.clientRevision;
        return started.state;
      });
      const request = {
        cardId: group.cardId,
        templatePairId: selected.template_pair_id,
        field,
        ...(actionTemplateId === undefined ? {} : { actionTemplateId }),
        value: nextValue,
        clientRevision: revision,
      };
      try {
        const response = await client.saveText(request);
        const confirmed = response.confirmation;
        if (
          response.clientRevision !== revision ||
          confirmed.cardId !== request.cardId ||
          confirmed.templatePairId !== request.templatePairId ||
          confirmed.field !== field ||
          confirmed.actionTemplateId !== actionTemplateId ||
          confirmed.value !== nextValue
        ) {
          throw new Error("The server returned a mismatched text confirmation.");
        }
        setGroups((current) => updateConfirmedText(current, request));
        update((state) => completeFieldSave(state, target, revision, nextValue));
        logEvent("encounter_editor_text_saved", {
          cardId: group.cardId,
          templatePairId: selected.template_pair_id,
          field,
          actionTemplateId,
        });
      } catch (error) {
        const isRejected = error instanceof EditorApiRequestError && error.status < 500;
        update((state) => isRejected
          ? rejectSubmittedFieldSave(state, target, revision, value, messageFor(error))
          : failFieldSave(state, target, revision, value, messageFor(error)));
        logEvent("encounter_editor_text_failed", {
          cardId: group.cardId,
          templatePairId: selected.template_pair_id,
          field,
          actionTemplateId,
          message: messageFor(error),
        });
      }
    };
    return (
      <EditableField
        activation="click"
        cardAnchorRef={rowRef}
        field={field}
        mode={mode}
        multilineSize={field === "prose" ? "expanded" : "compact"}
        saveEntry={entry}
        value={value}
        onBeginEdit={(draft) => update((state) => beginFieldEdit(state, target, draft))}
        onDraftChange={(draft) => update((state) => updateFieldDraft(state, target, draft, value))}
        onCancel={() => update((state) => cancelFieldEdit(state, target, value))}
        onSave={(draft) => void save(draft, true)}
        onCommit={(draft) => void save(draft, false)}
      >
        {children}
      </EditableField>
    );
  }

  return (
    <article ref={rowRef} className="encounter-editor-row" data-encounter-card-id={group.cardId}>
      <GlassPanel overflow="hidden" testId={`encounter-row-${group.cardId}`}>
        <div className="encounter-editor-row-grid">
          <div className="encounter-editor-art-frame">
            <img
              alt={`Art for ${group.cardName}`}
              className="encounter-editor-art"
              loading={index < 2 ? "eager" : "lazy"}
              src={resolveArtRef(artRef.encounterEditorCard(group.imageNumber))}
            />
          </div>
          <div className="encounter-editor-copy">
            <header className="encounter-editor-copy-header">
              <h2>{group.cardName}</h2>
              <div className="encounter-editor-rank-navigation">
                <IconButton
                  glyph={GLYPHS.chevronLeft}
                  label={`Select previous design for ${group.cardName}`}
                  placement="onGlass"
                  size="sm"
                  disabled={selectedIndex === 0 || isSelectionSaving}
                  onPress={() => void choose(-1)}
                  testId={`previous-${group.cardId}`}
                />
                <div className="encounter-editor-rank-copy">
                  <strong>Selected rank {selected.rank} of {ranked.length}</strong>
                  <span aria-live="polite">
                    {selectionState.status === "saving" ? "Saving selection…" :
                      selectionState.status === "saved" ? "Selection saved" :
                        selectionState.status === "error" ? selectionState.message : "Encounter design"}
                  </span>
                </div>
                <IconButton
                  glyph={GLYPHS.chevronRight}
                  label={`Select next design for ${group.cardName}`}
                  placement="onGlass"
                  size="sm"
                  disabled={selectedIndex === ranked.length - 1 || isSelectionSaving}
                  onPress={() => void choose(1)}
                  testId={`next-${group.cardId}`}
                />
              </div>
            </header>
            <div className="encounter-editor-prose">
              {editable("prose", selected.prose, <p>{selected.prose}</p>)}
            </div>
            <div className="encounter-editor-actions">
              {selected.actions.map((action, actionIndex) => (
                <section className="encounter-editor-action" key={action.template_id}>
                  <span className="encounter-editor-action-number">Choice {actionIndex + 1}</span>
                  {editable("label", action.label, <h3>{action.label}</h3>, action.template_id, "single-line")}
                  {editable("effect_text", action.effect_text, <p>{action.effect_text}</p>, action.template_id)}
                  {editable("resolution", action.resolution, <p className="encounter-editor-resolution">{action.resolution}</p>, action.template_id)}
                </section>
              ))}
            </div>
          </div>
        </div>
      </GlassPanel>
    </article>
  );
}

export default function EncounterEditorApp({
  client = encounterEditorClient,
}: {
  client?: EncounterEditorClient;
}) {
  const [groups, setGroups] = useState<EncounterEditorGroup[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [saveState, setSaveStateValue] = useState<EditableSaveState>(EMPTY_EDITOR_SAVE_STATE);
  const saveStateRef = useRef(saveState);
  const [selectionStates, setSelectionStates] = useState<Record<string, SelectionState>>({});
  const [templateHealthOpen, setTemplateHealthOpen] = useState(false);
  const [templateHealth, setTemplateHealth] = useState<EncounterTemplateHealth | null>(null);
  const [templateHealthLoadState, setTemplateHealthLoadState] = useState<LoadState>("loading");
  const [templateHealthLoadMessage, setTemplateHealthLoadMessage] = useState("");
  const templateHealthRequestRef = useRef(0);
  const templateHealthControllerRef = useRef<AbortController | null>(null);

  const setSaveState = useCallback((update: (state: EditableSaveState) => EditableSaveState) => {
    const next = update(saveStateRef.current);
    saveStateRef.current = next;
    setSaveStateValue(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    client.load(controller.signal).then((loaded) => {
      loaded.forEach(selectedCandidate);
      setGroups(loaded);
      setSelectionStates(Object.fromEntries(loaded.map((group) => [
        group.cardId,
        { status: "idle", revision: 0, message: null },
      ])));
      setLoadState("ready");
      logEvent("encounter_editor_loaded", { encounterGroupCount: loaded.length });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoadMessage(messageFor(error));
      setLoadState("error");
      logEvent("encounter_editor_load_failed", { message: messageFor(error) });
    });
    return () => controller.abort();
  }, [client, loadRevision]);

  const loadTemplateHealth = useCallback(async (reason: "open" | "refresh") => {
    const revision = templateHealthRequestRef.current + 1;
    templateHealthRequestRef.current = revision;
    templateHealthControllerRef.current?.abort();
    const controller = new AbortController();
    templateHealthControllerRef.current = controller;
    setTemplateHealthLoadState("loading");
    setTemplateHealthLoadMessage("");
    try {
      const loaded = await client.loadTemplateHealth(controller.signal);
      if (controller.signal.aborted || templateHealthRequestRef.current !== revision) return;
      setTemplateHealth(loaded);
      setTemplateHealthLoadState("ready");
      logEvent("encounter_editor_template_health_loaded", {
        reason,
        completedCards: loaded.completedCards,
        catalogTemplateCount: loaded.catalogTemplateCount,
        hiddenTemplateCount: loaded.templates.filter((entry) => entry.status === "hidden").length,
        warningTemplateCount: loaded.templates.filter((entry) => entry.status === "warning").length,
        unusedTemplateCount: loaded.templates.filter((entry) => entry.status === "unused").length,
      });
    } catch (error) {
      if (controller.signal.aborted || templateHealthRequestRef.current !== revision) return;
      setTemplateHealthLoadMessage(messageFor(error));
      setTemplateHealthLoadState("error");
      logEvent("encounter_editor_template_health_load_failed", {
        reason,
        message: messageFor(error),
      });
    }
  }, [client]);

  useEffect(() => {
    if (templateHealthOpen && templateHealth === null && templateHealthLoadState === "loading") {
      void loadTemplateHealth("open");
    }
  }, [loadTemplateHealth, templateHealth, templateHealthLoadState, templateHealthOpen]);

  useEffect(() => {
    if (!templateHealthOpen) return undefined;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setTemplateHealthOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [templateHealthOpen]);

  useEffect(() => () => templateHealthControllerRef.current?.abort(), []);

  function toggleTemplateHealth() {
    setTemplateHealthOpen((open) => {
      const next = !open;
      logEvent(next
        ? "encounter_editor_template_health_opened"
        : "encounter_editor_template_health_closed", {});
      return next;
    });
  }

  return (
    <div
      className="cumulus encounter-editor-layout"
      data-template-health-open={templateHealthOpen ? "true" : "false"}
    >
      <main className="encounter-editor-shell">
        <header className="encounter-editor-page-header">
          <div>
            <p>Exploration workshop</p>
            <h1>Encounter designs</h1>
          </div>
          {loadState === "ready" && (
            <div className="encounter-editor-page-actions">
              <span>{groups.length} encounters · click any text to edit</span>
              <GlassButton
                label="Template health"
                glyph={GLYPHS.sidebarRight}
                pressed={templateHealthOpen}
                testId="template-health-trigger"
                onPress={toggleTemplateHealth}
              />
            </div>
          )}
        </header>
        {loadState === "loading" && <div className="encounter-editor-notice">Loading encounter designs…</div>}
        {loadState === "error" && (
          <div className="encounter-editor-error">
            <GlassPanel title="Encounter designs could not be loaded" subtitle={loadMessage}>
              <div className="encounter-editor-error-action">
                <GlassButton
                  label="Retry"
                  placement="onGlass"
                  variant="accent"
                  onPress={() => setLoadRevision((revision) => revision + 1)}
                />
              </div>
            </GlassPanel>
          </div>
        )}
        {loadState === "ready" && (
          <div className="encounter-editor-list">
            {groups.map((group, index) => (
              <EncounterEditorRow
                client={client}
                group={group}
                index={index}
                key={group.cardId}
                saveState={saveState}
                selectionState={selectionStates[group.cardId] ?? { status: "idle", revision: 0, message: null }}
                setGroups={setGroups}
                setSaveState={setSaveState}
                setSelectionStates={setSelectionStates}
              />
            ))}
          </div>
        )}
      </main>
      {templateHealthOpen && (
        <div className="encounter-template-health-track">
          <EncounterTemplateHealthRail
            health={templateHealth}
            loadState={templateHealthLoadState}
            loadMessage={templateHealthLoadMessage}
            onClose={() => setTemplateHealthOpen(false)}
            onRefresh={() => void loadTemplateHealth("refresh")}
            onFilterChange={(filter) => logEvent("encounter_editor_template_health_filter_changed", { filter })}
          />
        </div>
      )}
    </div>
  );
}
