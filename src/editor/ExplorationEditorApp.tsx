import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardGalleryPanel } from "../cumulus/components/card/CardGalleryPanel";
import { EntityReference } from "../cumulus/components/card/EntityReference";
import { RulesText } from "../cumulus/components/card/RulesText";
import { GlassButton } from "../cumulus/components/controls/GlassButton";
import { NumberStepper } from "../cumulus/components/controls/NumberStepper";
import { Select } from "../cumulus/components/controls/Select";
import { GlassPanel } from "../cumulus/components/overlay/GlassPanel";
import { artRef, resolveArtRef } from "../cumulus/primitives/art";
import { GLYPHS } from "../cumulus/primitives/glyph";
import { logEvent } from "../logging";
import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";
import EditableField from "./EditableField";
import { EditorApiRequestError } from "./editor-api";
import { explorationEditorClient } from "./exploration-editor-api";
import type {
  ExplorationEditorAction,
  ExplorationEditorClient,
  ExplorationEditorEffectDefinition,
  ExplorationEditorEncounter,
  ExplorationEditorFieldDefinition,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";
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
import "./exploration-editor.css";

type LoadState = "loading" | "ready" | "error";
type ActionSaveStatus = "idle" | "saving" | "saved" | "error";

interface ReferenceCatalog {
  cards: CardData[];
  cardsById: ReadonlyMap<string, CardData>;
  dreamsigns: Dreamsign[];
  dreamsignsById: ReadonlyMap<string, Dreamsign>;
}

interface CardPickerTarget {
  cardId: string;
  slot: 0 | 1;
}

const EMPTY_CATALOG: ReferenceCatalog = {
  cards: [],
  cardsById: new Map(),
  dreamsigns: [],
  dreamsignsById: new Map(),
};

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function serverData(loaded: ExplorationEditorLoadResult): ExplorationEditorServerData {
  const { cards: _cards, dreamsigns: _dreamsigns, ...data } = loaded;
  return data;
}

function replaceAction(
  data: ExplorationEditorServerData,
  cardId: string,
  slot: 0 | 1,
  action: ExplorationEditorAction,
): ExplorationEditorServerData {
  return {
    ...data,
    encounters: data.encounters.map((encounter) => encounter.cardId !== cardId
      ? encounter
      : {
          ...encounter,
          actions: encounter.actions.map((entry, index) => index === slot ? action : entry) as [
            ExplorationEditorAction,
            ExplorationEditorAction,
          ],
        }),
  };
}

function replaceProse(
  data: ExplorationEditorServerData,
  cardId: string,
  prose: string,
): ExplorationEditorServerData {
  return {
    ...data,
    encounters: data.encounters.map((encounter) => encounter.cardId === cardId
      ? { ...encounter, prose }
      : encounter),
  };
}

function actionTarget(cardId: string, slot: number): string {
  return `${cardId}:${String(slot)}`;
}

function ExplorationCardPicker({
  cards,
  query,
  selectedCardId,
  onQueryChange,
  onClose,
  onSelect,
}: {
  cards: CardData[];
  query: string;
  selectedCardId: string | undefined;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  onSelect: (cardId: string) => void;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visible = cards
    .filter((card) => normalizedQuery === "" ||
      card.name.toLocaleLowerCase().includes(normalizedQuery) ||
      card.id.toLowerCase().includes(normalizedQuery))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  const shown = visible.slice(0, 60);
  return (
    <div className="exploration-editor-card-picker" role="dialog" aria-modal="true" aria-label="Choose a card">
      <CardGalleryPanel
        title="Choose a card"
        subtitle={`${String(shown.length)} shown · ${String(visible.length)} matches · ${String(cards.length)} total · UUID-safe selection`}
        rightAccessory={{
          kind: "iconButton",
          glyph: GLYPHS.close,
          label: "Close card picker",
          onPress: onClose,
          testId: "exploration-card-picker-close",
        }}
        toolbar={{
          search: {
            label: "Search cards by name or UUID",
            value: query,
            onChange: onQueryChange,
            testId: "exploration-card-picker-search",
          },
        }}
        cards={shown.map((card) => ({
          entryId: card.id,
          model: { cardId: card.id, displaySnapshot: card },
          selected: card.id.toLowerCase() === selectedCardId?.toLowerCase(),
          caption: { kind: "text", text: card.id.slice(0, 8) },
          testId: `exploration-card-option-${card.id}`,
        }))}
        emptyLabel="No cards match this search."
        columns="five"
        cardSize="compact"
        frame="fullBleed"
        spacing="compact"
        widthMode="fill"
        heightMode="fill"
        testId="exploration-card-picker"
        onCardPress={onSelect}
      />
    </div>
  );
}

function ExplorationEditorRow({
  client,
  encounter,
  index,
  data,
  catalog,
  saveState,
  setSaveState,
  onServerData,
  onOptimisticData,
  onPickCard,
}: {
  client: ExplorationEditorClient;
  encounter: ExplorationEditorEncounter;
  index: number;
  data: ExplorationEditorServerData;
  catalog: ReferenceCatalog;
  saveState: EditableSaveState;
  setSaveState: (update: (state: EditableSaveState) => EditableSaveState) => void;
  onServerData: (data: ExplorationEditorServerData) => void;
  onOptimisticData: (update: (data: ExplorationEditorServerData) => ExplorationEditorServerData) => void;
  onPickCard: (target: CardPickerTarget) => void;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const actionRevisionRef = useRef<Record<string, number>>({});
  const [actionStatuses, setActionStatuses] = useState<Record<string, {
    status: ActionSaveStatus;
    message: string;
    revision: number;
  }>>({});
  const definitions = useMemo(
    () => new Map(data.effectDefinitions.map((definition) => [definition.kind, definition])),
    [data.effectDefinitions],
  );
  const templates = useMemo(
    () => new Map(data.templates.map((template) => [template.id, template])),
    [data.templates],
  );

  const saveAction = useCallback(async (
    slot: 0 | 1,
    nextAction: ExplorationEditorAction,
    eventName: string,
    eventData: Record<string, unknown>,
  ) => {
    const key = actionTarget(encounter.cardId, slot);
    const previous = encounter.actions[slot];
    const revision = (actionRevisionRef.current[key] ?? 0) + 1;
    actionRevisionRef.current[key] = revision;
    setActionStatuses((current) => ({
      ...current,
      [key]: { status: "saving", message: "", revision },
    }));
    onOptimisticData((current) => replaceAction(current, encounter.cardId, slot, nextAction));
    try {
      const response = await client.saveAction({
        cardId: encounter.cardId,
        slot,
        action: nextAction,
        clientRevision: revision,
      });
      if (response.clientRevision !== revision) {
        throw new Error("The server returned a mismatched action confirmation.");
      }
      if (actionRevisionRef.current[key] !== revision) return;
      onServerData(response.data);
      setActionStatuses((current) => current[key]?.revision !== revision ? current : {
        ...current,
        [key]: { status: "saved", message: "", revision },
      });
      logEvent(eventName, { cardId: encounter.cardId, slot, ...eventData });
    } catch (error) {
      if (actionRevisionRef.current[key] !== revision) return;
      onOptimisticData((current) => replaceAction(current, encounter.cardId, slot, previous));
      setActionStatuses((current) => current[key]?.revision !== revision ? current : {
        ...current,
        [key]: { status: "error", message: messageFor(error), revision },
      });
      logEvent("exploration_editor_action_save_failed", {
        cardId: encounter.cardId,
        slot,
        eventName,
        message: messageFor(error),
      });
    }
  }, [client, encounter, onOptimisticData, onServerData]);

  function editable(
    target: FieldTarget,
    value: string,
    children: React.ReactNode,
    save: (nextValue: string, revision: number) => Promise<void>,
    mode: "single-line" | "multiline" = "multiline",
  ) {
    const entry = fieldSaveEntry(saveState, target);
    const commit = async (rawValue: string | number, keepInvalidDraft: boolean) => {
      const nextValue = String(rawValue);
      if (nextValue.trim() === "") {
        setSaveState((state) => keepInvalidDraft
          ? rejectFieldEdit(state, target, nextValue, value, "Text cannot be blank.")
          : cancelFieldEdit(state, target, value));
        return;
      }
      if (nextValue === value) {
        setSaveState((state) => cancelFieldEdit(state, target, value));
        return;
      }
      let revision = 0;
      setSaveState((state) => {
        const started = startFieldSave(state, target, nextValue, value);
        revision = started.clientRevision;
        return started.state;
      });
      try {
        await save(nextValue, revision);
        setSaveState((state) => completeFieldSave(state, target, revision, nextValue));
      } catch (error) {
        const rejected = error instanceof EditorApiRequestError && error.status < 500;
        logEvent("exploration_editor_inline_save_failed", {
          cardId: target.cardId,
          field: target.field,
          validationFailure: rejected,
          message: messageFor(error),
        });
        setSaveState((state) => rejected
          ? rejectSubmittedFieldSave(state, target, revision, value, messageFor(error))
          : failFieldSave(state, target, revision, value, messageFor(error)));
      }
    };
    return (
      <EditableField
        activation="click"
        cardAnchorRef={rowRef}
        field={target.field}
        mode={mode}
        multilineSize={target.field === "prose" ? "expanded" : "compact"}
        saveEntry={entry}
        value={value}
        onBeginEdit={(draft) => setSaveState((state) => beginFieldEdit(state, target, draft))}
        onDraftChange={(draft) => setSaveState((state) => updateFieldDraft(state, target, draft, value))}
        onCancel={() => setSaveState((state) => cancelFieldEdit(state, target, value))}
        onSave={(draft) => void commit(draft, true)}
        onCommit={(draft) => void commit(draft, false)}
      >
        {children}
      </EditableField>
    );
  }

  async function saveProse(value: string, revision: number) {
    onOptimisticData((current) => replaceProse(current, encounter.cardId, value));
    try {
      const response = await client.saveProse({ cardId: encounter.cardId, value, clientRevision: revision });
      if (response.clientRevision !== revision) throw new Error("Mismatched prose confirmation.");
      onServerData(response.data);
      logEvent("exploration_editor_prose_saved", { cardId: encounter.cardId });
    } catch (error) {
      onOptimisticData((current) => replaceProse(current, encounter.cardId, encounter.prose));
      logEvent("exploration_editor_prose_save_failed", {
        cardId: encounter.cardId,
        message: messageFor(error),
      });
      throw error;
    }
  }

  async function saveActionText(
    slot: 0 | 1,
    field: "label" | "template",
    value: string,
    revision: number,
  ) {
    if (field === "template") {
      const action = encounter.actions[slot];
      const response = await client.saveTemplate({
        templateId: action.templateId,
        value,
        clientRevision: revision,
      });
      if (response.clientRevision !== revision) throw new Error("Mismatched template confirmation.");
      onServerData(response.data);
      logEvent("exploration_editor_template_saved", {
        cardId: encounter.cardId,
        slot,
        templateId: action.templateId,
      });
      return;
    }
    const action = { ...encounter.actions[slot], label: value };
    const response = await client.saveAction({
      cardId: encounter.cardId,
      slot,
      action,
      clientRevision: revision,
    });
    if (response.clientRevision !== revision) throw new Error("Mismatched label confirmation.");
    onServerData(response.data);
    logEvent("exploration_editor_label_saved", { cardId: encounter.cardId, slot });
  }

  function updateField(
    slot: 0 | 1,
    field: string,
    value: unknown,
    eventName = "exploration_editor_effect_field_saved",
  ) {
    const current = encounter.actions[slot];
    void saveAction(slot, { ...current, [field]: value }, eventName, {
      field,
      value,
      effectKind: current.effectKind,
    });
  }

  function controlFor(
    slot: 0 | 1,
    action: ExplorationEditorAction,
    field: ExplorationEditorFieldDefinition,
  ) {
    const key = `${action.id}:${field.key}`;
    if (field.control === "number") {
      const value = typeof action[field.key] === "number" ? action[field.key] as number : 0;
      const step = field.step ?? 1;
      return (
        <NumberStepper
          key={key}
          label={field.label}
          value={value}
          resource={field.resource}
          size="sm"
          decrementLabel={`Decrease ${field.label}`}
          incrementLabel={`Increase ${field.label}`}
          decrementDisabled={value - step < (field.min ?? 1)}
          testId={`exploration-${field.key}-${encounter.cardId}-${String(slot)}`}
          onDecrement={() => updateField(slot, field.key, value - step)}
          onIncrement={() => updateField(slot, field.key, value + step)}
        />
      );
    }
    if (field.control === "predicate") {
      return (
        <label className="exploration-editor-select-field" key={key}>
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={field.label}
            options={data.predicates}
            value={typeof action.predicate === "string" ? action.predicate : ""}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "transfiguration") {
      return (
        <label className="exploration-editor-select-field" key={key}>
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={field.label}
            options={data.transfigurations.map((value) => ({ value, label: value }))}
            value={String(action.transfiguration ?? "")}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "subtype") {
      return (
        <label className="exploration-editor-select-field" key={key}>
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={field.label}
            options={data.subtypes.map((value) => ({ value, label: value }))}
            value={String(action.subtype ?? "")}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "subtype-options") {
      const selected = new Set(action.subtypeOptions ?? []);
      return (
        <div className="exploration-editor-subtype-options" key={key}>
          <span>{field.label}</span>
          <div>
            {data.subtypes.map((subtype) => (
              <GlassButton
                key={subtype}
                label={subtype}
                placement="onGlass"
                size="compact"
                pressed={selected.has(subtype)}
                onPress={() => {
                  const next = selected.has(subtype)
                    ? [...selected].filter((value) => value !== subtype)
                    : [...selected, subtype];
                  if (next.length > 0) updateField(slot, field.key, next);
                }}
              />
            ))}
          </div>
        </div>
      );
    }
    if (field.control === "card") {
      const card = typeof action.cardId === "string"
        ? catalog.cardsById.get(action.cardId.toLowerCase())
        : undefined;
      return (
        <div className="exploration-editor-reference-field" key={key}>
          <span>{field.label}</span>
          <div>
            {card === undefined ? <span>Unknown card</span> : (
              <EntityReference entity={{ kind: "card", card }} />
            )}
            <GlassButton
              label="Choose card"
              placement="onGlass"
              size="compact"
              onPress={() => onPickCard({ cardId: encounter.cardId, slot })}
            />
          </div>
        </div>
      );
    }
    const dreamsign = typeof action.dreamsignId === "string"
      ? catalog.dreamsignsById.get(action.dreamsignId.toLowerCase())
      : undefined;
    const dreamsignOptions = catalog.dreamsigns
      .filter((entry) => entry.id !== undefined)
      .sort((left, right) => left.name.localeCompare(right.name) ||
        (left.id ?? "").localeCompare(right.id ?? ""))
      .map((entry) => ({
        value: entry.id ?? "",
        label: `${entry.name} · ${(entry.id ?? "").slice(0, 8)}`,
        triggerLabel: entry.name,
      }));
    return (
      <div className="exploration-editor-reference-field" key={key}>
        <span>{field.label}</span>
        {dreamsign !== undefined && <EntityReference entity={{ kind: "dreamsign", dreamsign }} />}
        <Select
          full
          size="sm"
          ariaLabel={field.label}
          options={dreamsignOptions}
          value={String(action.dreamsignId ?? "")}
          onChange={(value) => updateField(slot, field.key, value)}
        />
      </div>
    );
  }

  function actionPanel(action: ExplorationEditorAction, slot: 0 | 1) {
    const definition = definitions.get(action.effectKind) as ExplorationEditorEffectDefinition;
    const compatibleTemplates = definition.templateIds
      .map((id) => templates.get(id))
      .filter((entry) => entry !== undefined);
    const status = actionStatuses[actionTarget(encounter.cardId, slot)];
    return (
      <section className="exploration-editor-action" key={action.id}>
        {editable(
          { cardId: `${encounter.cardId}:${String(slot)}`, field: "label" },
          action.label,
          <h3>{action.label}</h3>,
          (value, revision) => saveActionText(slot, "label", value, revision),
          "single-line",
        )}
        {editable(
          { cardId: `${encounter.cardId}:${String(slot)}`, field: "template" },
          action.template,
          <p>{action.effectText}</p>,
          (value, revision) => saveActionText(slot, "template", value, revision),
        )}
        <div className="exploration-editor-action-selects">
          <label className="exploration-editor-select-field">
            <span>Effect kind</span>
            <Select
              full
              size="sm"
              ariaLabel={`Effect kind for ${action.label}`}
              options={data.effectDefinitions.map((entry) => ({
                value: entry.kind,
                label: entry.label,
              }))}
              value={action.effectKind}
              onChange={(value) => void saveAction(
                slot,
                { ...action, effectKind: value as ExplorationEditorAction["effectKind"], templateId: -1 },
                "exploration_editor_effect_kind_changed",
                { fromEffectKind: action.effectKind, toEffectKind: value },
              )}
            />
          </label>
          <label className="exploration-editor-select-field">
            <span>Template</span>
            <Select
              full
              size="sm"
              ariaLabel={`Template for ${action.label}`}
              options={compatibleTemplates.map((entry) => ({
                value: String(entry.id),
                label: `${String(entry.id)} · ${entry.text}`,
                triggerLabel: `Template ${String(entry.id)}`,
              }))}
              value={String(action.templateId)}
              onChange={(value) => void saveAction(
                slot,
                { ...action, templateId: Number(value) },
                "exploration_editor_template_selected",
                { fromTemplateId: action.templateId, toTemplateId: Number(value) },
              )}
            />
          </label>
        </div>
        {definition.fields.length > 0 && (
          <div className="exploration-editor-fields">
            {definition.fields
              .filter((field) => field.templateIds === undefined ||
                field.templateIds.includes(action.templateId))
              .map((field) => controlFor(slot, action, field))}
          </div>
        )}
        <span
          aria-live="polite"
          className="exploration-editor-action-status"
          data-status={status?.status ?? "idle"}
        >
          {status?.status === "saving" ? "Saving…" :
            status?.status === "saved" ? "Saved" :
              status?.status === "error" ? status.message : ""}
        </span>
      </section>
    );
  }

  return (
    <article
      ref={rowRef}
      className="exploration-editor-row"
      data-exploration-card-id={encounter.cardId}
      id={`exploration-${encounter.cardId}`}
    >
      <GlassPanel overflow="hidden" testId={`exploration-row-${encounter.cardId}`}>
        <div className="exploration-editor-row-grid">
          <div className="exploration-editor-art-frame">
            <img
              alt={`Art for ${encounter.cardName}`}
              className="exploration-editor-art"
              loading={index < 2 ? "eager" : "lazy"}
              src={resolveArtRef(artRef.encounterEditorCard(encounter.imageNumber))}
            />
          </div>
          <div className="exploration-editor-copy">
            <header className="exploration-editor-copy-header">
              <div>
                <h2>{encounter.cardName}</h2>
                <code>{encounter.cardId}</code>
              </div>
              <div className="exploration-editor-card-ability">
                <RulesText text={encounter.cardAbilityText} />
              </div>
            </header>
            <div className="exploration-editor-prose-copy">
              {editable(
                { cardId: encounter.cardId, field: "prose" },
                encounter.prose,
                <p>{encounter.prose}</p>,
                saveProse,
              )}
            </div>
            <div className="exploration-editor-actions">
              {actionPanel(encounter.actions[0], 0)}
              {actionPanel(encounter.actions[1], 1)}
            </div>
          </div>
        </div>
      </GlassPanel>
    </article>
  );
}

export default function ExplorationEditorApp({
  client = explorationEditorClient,
}: {
  client?: ExplorationEditorClient;
}) {
  const [data, setDataValue] = useState<ExplorationEditorServerData | null>(null);
  const dataRef = useRef(data);
  const [catalog, setCatalog] = useState<ReferenceCatalog>(EMPTY_CATALOG);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [saveStateValue, setSaveStateValue] = useState<EditableSaveState>(EMPTY_EDITOR_SAVE_STATE);
  const saveStateRef = useRef(saveStateValue);
  const [cardPickerTarget, setCardPickerTarget] = useState<CardPickerTarget | null>(null);
  const [cardPickerQuery, setCardPickerQuery] = useState("");

  const setData = useCallback((next: ExplorationEditorServerData) => {
    dataRef.current = next;
    setDataValue(next);
  }, []);
  const updateData = useCallback((update: (data: ExplorationEditorServerData) => ExplorationEditorServerData) => {
    if (dataRef.current === null) return;
    setData(update(dataRef.current));
  }, [setData]);
  const setSaveState = useCallback((update: (state: EditableSaveState) => EditableSaveState) => {
    const next = update(saveStateRef.current);
    saveStateRef.current = next;
    setSaveStateValue(next);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    client.load(controller.signal).then((loaded) => {
      setData(serverData(loaded));
      setCatalog({
        cards: loaded.cards,
        cardsById: new Map(loaded.cards.map((card) => [card.id.toLowerCase(), card])),
        dreamsigns: loaded.dreamsigns,
        dreamsignsById: new Map(loaded.dreamsigns.flatMap((dreamsign) =>
          dreamsign.id === undefined ? [] : [[dreamsign.id.toLowerCase(), dreamsign]])),
      });
      setLoadState("ready");
      logEvent("exploration_editor_loaded", {
        encounterCount: loaded.encounters.length,
        effectKindCount: loaded.effectDefinitions.length,
      });
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoadMessage(messageFor(error));
      setLoadState("error");
      logEvent("exploration_editor_load_failed", { message: messageFor(error) });
    });
    return () => controller.abort();
  }, [client, loadRevision, setData]);

  useEffect(() => {
    if (loadState !== "ready" || !window.location.hash.startsWith("#exploration-")) return;
    document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }, [loadState]);

  async function chooseCard(cardId: string) {
    if (cardPickerTarget === null || dataRef.current === null) return;
    const encounter = dataRef.current.encounters.find((entry) => entry.cardId === cardPickerTarget.cardId);
    if (encounter === undefined) return;
    const action = { ...encounter.actions[cardPickerTarget.slot], cardId };
    const revision = Date.now();
    try {
      const response = await client.saveAction({ ...cardPickerTarget, action, clientRevision: revision });
      if (response.clientRevision !== revision) throw new Error("Mismatched card confirmation.");
      setData(response.data);
      setCardPickerTarget(null);
      setCardPickerQuery("");
      logEvent("exploration_editor_effect_field_saved", {
        cardId: cardPickerTarget.cardId,
        slot: cardPickerTarget.slot,
        field: "cardId",
        value: cardId,
      });
    } catch (error) {
      logEvent("exploration_editor_action_save_failed", {
        cardId: cardPickerTarget.cardId,
        slot: cardPickerTarget.slot,
        field: "cardId",
        message: messageFor(error),
      });
    }
  }

  const pickerAction = cardPickerTarget === null || data === null
    ? undefined
    : data.encounters.find((entry) => entry.cardId === cardPickerTarget.cardId)
      ?.actions[cardPickerTarget.slot];

  return (
    <div className="cumulus exploration-editor-layout">
      <main className="exploration-editor-shell">
        <header className="exploration-editor-page-header">
          <div>
            <p>Exploration workshop</p>
            <h1>Production encounters</h1>
          </div>
          {loadState === "ready" && data !== null && (
            <span>{data.encounters.length} encounters · edits write directly to exploration.toml</span>
          )}
        </header>
        {loadState === "loading" && (
          <div className="exploration-editor-notice">Loading production encounters…</div>
        )}
        {loadState === "error" && (
          <div className="exploration-editor-error">
            <GlassPanel title="Exploration encounters could not be loaded" subtitle={loadMessage}>
              <div className="exploration-editor-error-action">
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
        {loadState === "ready" && data !== null && (
          <div className="exploration-editor-list">
            {data.encounters.map((encounter, index) => (
              <ExplorationEditorRow
                key={encounter.cardId}
                client={client}
                encounter={encounter}
                index={index}
                data={data}
                catalog={catalog}
                saveState={saveStateValue}
                setSaveState={setSaveState}
                onServerData={setData}
                onOptimisticData={updateData}
                onPickCard={(target) => {
                  setCardPickerTarget(target);
                  setCardPickerQuery("");
                }}
              />
            ))}
          </div>
        )}
      </main>
      {cardPickerTarget !== null && (
        <ExplorationCardPicker
          cards={catalog.cards}
          query={cardPickerQuery}
          selectedCardId={pickerAction?.cardId}
          onQueryChange={setCardPickerQuery}
          onClose={() => setCardPickerTarget(null)}
          onSelect={(cardId) => void chooseCard(cardId)}
        />
      )}
    </div>
  );
}
