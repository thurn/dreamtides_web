import { assertLocalized } from "@trox/runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CardBrowserPanel } from "../cumulus/components/card/CardBrowserPanel";
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
import { parseExplorationCardFilter } from "./exploration-editor-url-state";
import type {
  EncounterRenderedTemplatePart,
  ExplorationEditorAction,
  ExplorationEditorClient,
  ExplorationEditorEffectSchema,
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
  slot: number;
}

const EMPTY_CATALOG: ReferenceCatalog = {
  cards: [],
  cardsById: new Map(),
  dreamsigns: [],
  dreamsignsById: new Map(),
};

function renderedEffect(
  parts: EncounterRenderedTemplatePart[],
  references: ReferenceCatalog,
) {
  return parts.map((part, index) => {
    if (part.kind === "text") {
      return <span key={`text-${String(index)}`}>{part.text}</span>;
    }
    if (part.kind === "variable") {
      return (
        <span
          data-encounter-variable={part.variableName}
          data-encounter-variable-placeholder={part.placeholder}
          key={`${part.placeholder}-${String(index)}`}
        >
          {part.text}
        </span>
      );
    }
    if (part.kind === "card") {
      const card = references.cardsById.get(part.cardId.toLowerCase());
      return (
        <span
          data-runtime-card-id={part.cardId}
          data-runtime-card-placeholder={part.placeholder}
          key={`${part.placeholder}-${part.cardId}-${String(index)}`}
        >
          <u data-entity-unresolved={card === undefined ? "card" : undefined}>
            {card?.name ?? part.cardName}
          </u>
        </span>
      );
    }
    const dreamsign = references.dreamsignsById.get(
      part.dreamsignId.toLowerCase(),
    );
    return (
      <span
        data-runtime-dreamsign-id={part.dreamsignId}
        data-runtime-dreamsign-placeholder={part.placeholder}
        key={`${part.placeholder}-${part.dreamsignId}-${String(index)}`}
      >
        <u
          data-entity-unresolved={
            dreamsign === undefined ? "dreamsign" : undefined
          }
        >
          {dreamsign?.name ?? part.dreamsignName}
        </u>
      </span>
    );
  });
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function serverData(
  loaded: ExplorationEditorLoadResult,
): ExplorationEditorServerData {
  const { cards: _cards, dreamsigns: _dreamsigns, ...data } = loaded;
  return data;
}

function replaceAction(
  data: ExplorationEditorServerData,
  cardId: string,
  slot: number,
  action: ExplorationEditorAction,
): ExplorationEditorServerData {
  return {
    ...data,
    encounters: data.encounters.map((encounter) =>
      encounter.cardId !== cardId
        ? encounter
        : {
            ...encounter,
            actions: encounter.actions.map((entry, index) =>
              index === slot ? action : entry,
            ),
          },
    ),
  };
}

function replaceProse(
  data: ExplorationEditorServerData,
  cardId: string,
  prose: string,
): ExplorationEditorServerData {
  return {
    ...data,
    encounters: data.encounters.map((encounter) =>
      encounter.cardId === cardId ? { ...encounter, prose } : encounter,
    ),
  };
}

function actionTarget(cardId: string, slot: number): string {
  return `${cardId}:${String(slot)}`;
}

const EFFECT_FIELD_KEYS = [
  "predicate",
  "count",
  "cardId",
  "dreamsignId",
  "packCount",
  "packSize",
  "offerCount",
  "essencePerSpark",
  "essencePerCard",
  "sparkBonus",
  "essence",
  "energyCostReduction",
  "subtype",
  "subtypeOptions",
  "nightmareCount",
  "transfiguration",
  "deckTarget",
  "cardType",
  "siteType",
] as const;

const FOLLOWUP_EFFECT_KINDS: ReadonlySet<
  ExplorationEditorAction["effectKind"]
> = new Set([
  "purge-and-copy",
  "transfigure-selected",
  "purge-selected",
  "purge-for-essence",
  "change-subtype-selected",
  "change-card-type-selected",
  "copy-selected-card",
  "copy-selected-cards",
  "copy-offered-deck-card",
  "replace-selected",
  "replace-selected-with-card",
  "transfigure-fixed-selected",
  "draft-card",
  "transfigured-card-draft",
  "take-cards",
  "choose-pack",
  "change-subtype-all",
  "gain-dreamsign",
  "gain-random-dreamsign",
  "gain-offered-dreamsign",
  "gain-nightmare-and-offered-dreamsign",
  "replace-selected-dreamsign-with-offered",
  "purge-selected-dreamsign-and-gain-random",
  "gain-nightmare-and-dreamsign",
  "purge-dreamsign-for-essence",
  "choose-dream-avatar",
  "choose-site-type",
  "take-transfigured-cards-and-gain-nightmares",
  "purge-one-transfigure-and-copy-others",
]);

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
    .filter(
      (card) =>
        normalizedQuery === "" ||
        card.name.toLocaleLowerCase().includes(normalizedQuery) ||
        card.id.toLowerCase().includes(normalizedQuery),
    )
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
    );
  const shown = visible.slice(0, 60);
  return (
    <div
      className="exploration-editor-card-picker"
      role="dialog"
      aria-modal="true"
      aria-label="Choose a card"
    >
      <CardBrowserPanel
        title={assertLocalized("Choose a card")}
        subtitle={assertLocalized(
          `${String(shown.length)} shown · ${String(visible.length)} matches · ${String(cards.length)} total · UUID-safe selection`,
        )}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: assertLocalized("Close card picker"),
            onPress: onClose,
            testId: "exploration-card-picker-close",
          },
        }}
        toolbar={{
          search: {
            label: assertLocalized("Search cards by name or UUID"),
            value: query,
            onChange: onQueryChange,
            testId: "exploration-card-picker-search",
          },
        }}
        cards={shown.map((card) => ({
          entryId: card.id,
          model: { cardId: card.id, displaySnapshot: card },
          selected: card.id.toLowerCase() === selectedCardId?.toLowerCase(),
          caption: {
            kind: "text",
            message: assertLocalized(card.id.slice(0, 8)),
          },
          testId: `exploration-card-option-${card.id}`,
        }))}
        emptyLabel={assertLocalized("No cards match this search.")}
        presentation="fullScreen"
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
  setSaveState: (
    update: (state: EditableSaveState) => EditableSaveState,
  ) => void;
  onServerData: (data: ExplorationEditorServerData) => void;
  onOptimisticData: (
    update: (data: ExplorationEditorServerData) => ExplorationEditorServerData,
  ) => void;
  onPickCard: (target: CardPickerTarget) => void;
}) {
  const rowRef = useRef<HTMLElement | null>(null);
  const actionRevisionRef = useRef<Record<string, number>>({});
  const [actionStatuses, setActionStatuses] = useState<
    Record<
      string,
      {
        status: ActionSaveStatus;
        message: string;
        revision: number;
      }
    >
  >({});
  const definitions = useMemo(
    () => new Map(data.effectSchemas.map((schema) => [schema.kind, schema])),
    [data.effectSchemas],
  );
  const effectOptions = useMemo(
    () =>
      data.effectSchemas.map((schema) => ({
        value: schema.kind,
        label: schema.label,
      })),
    [data.effectSchemas],
  );

  const saveAction = useCallback(
    async (
      slot: number,
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
      onOptimisticData((current) =>
        replaceAction(current, encounter.cardId, slot, nextAction),
      );
      try {
        const response = await client.saveAction({
          cardId: encounter.cardId,
          slot,
          action: nextAction,
          clientRevision: revision,
        });
        if (response.clientRevision !== revision) {
          throw new Error(
            "The server returned a mismatched action confirmation.",
          );
        }
        if (actionRevisionRef.current[key] !== revision) return;
        onServerData(response.data);
        setActionStatuses((current) =>
          current[key]?.revision !== revision
            ? current
            : {
                ...current,
                [key]: { status: "saved", message: "", revision },
              },
        );
        logEvent(eventName, { cardId: encounter.cardId, slot, ...eventData });
      } catch (error) {
        if (actionRevisionRef.current[key] !== revision) return;
        onOptimisticData((current) =>
          replaceAction(current, encounter.cardId, slot, previous),
        );
        setActionStatuses((current) =>
          current[key]?.revision !== revision
            ? current
            : {
                ...current,
                [key]: {
                  status: "error",
                  message: messageFor(error),
                  revision,
                },
              },
        );
        logEvent("exploration_editor_action_save_failed", {
          cardId: encounter.cardId,
          slot,
          eventName,
          message: messageFor(error),
        });
      }
    },
    [client, encounter, onOptimisticData, onServerData],
  );

  function editable(
    target: FieldTarget,
    value: string,
    children: React.ReactNode,
    save: (nextValue: string, revision: number) => Promise<void>,
    mode: "single-line" | "multiline" = "multiline",
  ) {
    const entry = fieldSaveEntry(saveState, target);
    const commit = async (
      rawValue: string | number,
      keepInvalidDraft: boolean,
    ) => {
      const nextValue = String(rawValue);
      if (nextValue.trim() === "") {
        setSaveState((state) =>
          keepInvalidDraft
            ? rejectFieldEdit(
                state,
                target,
                nextValue,
                value,
                "Text cannot be blank.",
              )
            : cancelFieldEdit(state, target, value),
        );
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
        setSaveState((state) =>
          completeFieldSave(state, target, revision, nextValue),
        );
      } catch (error) {
        const rejected =
          error instanceof EditorApiRequestError && error.status < 500;
        logEvent("exploration_editor_inline_save_failed", {
          cardId: target.cardId,
          field: target.field,
          validationFailure: rejected,
          message: messageFor(error),
        });
        setSaveState((state) =>
          rejected
            ? rejectSubmittedFieldSave(
                state,
                target,
                revision,
                value,
                messageFor(error),
              )
            : failFieldSave(state, target, revision, value, messageFor(error)),
        );
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
        onBeginEdit={(draft) =>
          setSaveState((state) => beginFieldEdit(state, target, draft))
        }
        onDraftChange={(draft) =>
          setSaveState((state) => updateFieldDraft(state, target, draft, value))
        }
        onCancel={() =>
          setSaveState((state) => cancelFieldEdit(state, target, value))
        }
        onSave={(draft) => void commit(draft, true)}
        onCommit={(draft) => void commit(draft, false)}
      >
        {children}
      </EditableField>
    );
  }

  async function saveProse(value: string, revision: number) {
    onOptimisticData((current) =>
      replaceProse(current, encounter.cardId, value),
    );
    try {
      const response = await client.saveProse({
        cardId: encounter.cardId,
        value,
        clientRevision: revision,
      });
      if (response.clientRevision !== revision)
        throw new Error("Mismatched prose confirmation.");
      onServerData(response.data);
      logEvent("exploration_editor_prose_saved", { cardId: encounter.cardId });
    } catch (error) {
      onOptimisticData((current) =>
        replaceProse(current, encounter.cardId, encounter.prose),
      );
      logEvent("exploration_editor_prose_save_failed", {
        cardId: encounter.cardId,
        message: messageFor(error),
      });
      throw error;
    }
  }

  async function saveActionText(
    slot: number,
    field: "label" | "effectText" | "followupTitle" | "followupSubtitle",
    value: string,
    revision: number,
  ) {
    const action = { ...encounter.actions[slot], [field]: value };
    const response = await client.saveAction({
      cardId: encounter.cardId,
      slot,
      action,
      clientRevision: revision,
    });
    if (response.clientRevision !== revision)
      throw new Error("Mismatched label confirmation.");
    onServerData(response.data);
    logEvent(
      field === "label"
        ? "exploration_editor_label_saved"
        : field === "effectText"
          ? "exploration_editor_effect_text_saved"
          : "exploration_editor_followup_text_saved",
      {
        cardId: encounter.cardId,
        slot,
        field,
      },
    );
  }

  function updateField(
    slot: number,
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
    slot: number,
    action: ExplorationEditorAction,
    field: ExplorationEditorFieldDefinition,
  ) {
    const key = `${action.id}:${field.key}`;
    if (field.control === "number") {
      const value =
        typeof action[field.key] === "number"
          ? (action[field.key] as number)
          : typeof field.defaultValue === "number"
            ? field.defaultValue
            : 0;
      const step = field.step ?? 1;
      return (
        <NumberStepper
          key={key}
          label={assertLocalized(field.label)}
          value={value}
          resource={field.resource}
          size="sm"
          decrementLabel={assertLocalized(`Decrease ${field.label}`)}
          incrementLabel={assertLocalized(`Increase ${field.label}`)}
          decrementDisabled={value - step < (field.min ?? 1)}
          incrementDisabled={
            field.max !== undefined && value + step > field.max
          }
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
            ariaLabel={assertLocalized(field.label)}
            options={(field.optional
              ? data.predicates
              : data.predicates.filter((entry) => entry.value !== "")
            ).map((option) => ({
              ...option,
              label: assertLocalized(option.label),
            }))}
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
            ariaLabel={assertLocalized(field.label)}
            options={data.transfigurations
              .map((value) => ({ value, label: value }))
              .map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
            value={String(action.transfiguration ?? "")}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "card-type") {
      return (
        <label
          className="exploration-editor-select-field"
          data-exploration-field-control="cardType"
          key={key}
        >
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={assertLocalized(field.label)}
            options={[
              { value: "Character", label: assertLocalized("Character") },
              { value: "Event", label: assertLocalized("Event") },
            ]}
            value={String(action.cardType ?? "Character")}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "site-type") {
      return (
        <label
          className="exploration-editor-select-field"
          data-exploration-field-control="siteType"
          key={key}
        >
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={assertLocalized(field.label)}
            options={(field.options ?? []).map((option) => ({
              ...option,
              label: assertLocalized(option.label),
            }))}
            value={String(action.siteType ?? field.defaultValue ?? "Shop")}
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
            ariaLabel={assertLocalized(field.label)}
            options={data.subtypes
              .map((value) => ({ value, label: value }))
              .map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
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
                label={assertLocalized(subtype)}
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
    if (field.control === "deck-target") {
      return (
        <label className="exploration-editor-select-field" key={key}>
          <span>{field.label}</span>
          <Select
            full
            size="sm"
            ariaLabel={assertLocalized(field.label)}
            options={[
              { value: "chosen", label: assertLocalized("Player chooses") },
              {
                value: "offered",
                label: assertLocalized("Offered automatically"),
              },
            ]}
            value={action.deckTarget ?? "chosen"}
            onChange={(value) => updateField(slot, field.key, value)}
          />
        </label>
      );
    }
    if (field.control === "card") {
      const card =
        typeof action.cardId === "string"
          ? catalog.cardsById.get(action.cardId.toLowerCase())
          : undefined;
      return (
        <div className="exploration-editor-reference-field" key={key}>
          <span>{field.label}</span>
          <div>
            {card === undefined ? (
              <span>Unknown card</span>
            ) : (
              <u>{card.name}</u>
            )}
            <GlassButton
              label={assertLocalized("Choose card")}
              placement="onGlass"
              size="compact"
              onPress={() => onPickCard({ cardId: encounter.cardId, slot })}
            />
          </div>
        </div>
      );
    }
    const dreamsign =
      typeof action.dreamsignId === "string"
        ? catalog.dreamsignsById.get(action.dreamsignId.toLowerCase())
        : undefined;
    const dreamsignOptions = catalog.dreamsigns
      .filter((entry) => entry.id !== undefined)
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name) ||
          (left.id ?? "").localeCompare(right.id ?? ""),
      )
      .map((entry) => ({
        value: entry.id ?? "",
        label: `${entry.name} · ${(entry.id ?? "").slice(0, 8)}`,
        triggerLabel: entry.name,
      }));
    return (
      <div className="exploration-editor-reference-field" key={key}>
        <span>{field.label}</span>
        {dreamsign !== undefined && <u>{dreamsign.name}</u>}
        <Select
          full
          size="sm"
          ariaLabel={assertLocalized(field.label)}
          options={dreamsignOptions.map((option) => ({
            value: option.value,
            label: assertLocalized(option.label),
            triggerLabel: assertLocalized(option.triggerLabel),
          }))}
          value={String(action.dreamsignId ?? "")}
          onChange={(value) => updateField(slot, field.key, value)}
        />
      </div>
    );
  }

  function actionPanel(action: ExplorationEditorAction, slot: number) {
    const definition = definitions.get(
      action.effectKind,
    ) as ExplorationEditorEffectSchema;
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
          {
            cardId: `${encounter.cardId}:${String(slot)}`,
            field: "effectText",
          },
          action.effectText,
          <p>{renderedEffect(action.renderedEffectParts, catalog)}</p>,
          (value, revision) =>
            saveActionText(slot, "effectText", value, revision),
        )}
        <div className="exploration-editor-action-selects">
          <label
            className="exploration-editor-select-field"
            data-exploration-field-control="effectKind"
          >
            <span>Effect</span>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(`Effect for ${action.label}`)}
              options={effectOptions.map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
              value={action.effectKind}
              onChange={(value) => {
                const nextDefinition = definitions.get(
                  value as ExplorationEditorAction["effectKind"],
                );
                if (nextDefinition === undefined) return;
                const nextAction = { ...action };
                const currentFieldKeys = new Set(
                  definitions
                    .get(action.effectKind)
                    ?.fields.map((field) => field.key) ?? [],
                );
                for (const key of EFFECT_FIELD_KEYS) delete nextAction[key];
                for (const field of nextDefinition.fields) {
                  const candidate = currentFieldKeys.has(field.key)
                    ? action[field.key]
                    : undefined;
                  const retained =
                    field.control === "number" &&
                    typeof candidate === "number" &&
                    ((field.min !== undefined && candidate < field.min) ||
                      (field.max !== undefined && candidate > field.max))
                      ? undefined
                      : field.control === "predicate" &&
                          candidate === "" &&
                          field.optional !== true
                        ? undefined
                        : candidate;
                  const fallback =
                    field.key === "cardId"
                      ? encounter.cardId
                      : field.key === "dreamsignId"
                        ? catalog.dreamsigns.find(
                            (entry) => entry.id !== undefined,
                          )?.id
                        : field.key === "subtype"
                          ? data.subtypes[0]
                          : field.key === "subtypeOptions"
                            ? data.subtypes
                            : field.key === "siteType"
                              ? (field.defaultValue ?? "Shop")
                              : (field.defaultValue ??
                                (field.control === "predicate"
                                  ? data.predicates.find(
                                      ({ value }) => value !== "",
                                    )?.value
                                  : field.control === "transfiguration"
                                    ? data.transfigurations[0]
                                    : field.control === "number"
                                      ? field.min
                                      : undefined));
                  const fieldValue = retained ?? fallback;
                  if (fieldValue !== undefined)
                    nextAction[field.key] = fieldValue;
                }
                const hasPairedFollowup =
                  typeof action.followupTitle === "string" &&
                  action.followupTitle.trim() !== "" &&
                  typeof action.followupSubtitle === "string" &&
                  action.followupSubtitle.trim() !== "";
                if (nextDefinition.requiresFollowup && !hasPairedFollowup) {
                  nextAction.followupTitle = action.label;
                  nextAction.followupSubtitle = action.effectText;
                } else if (!FOLLOWUP_EFFECT_KINDS.has(nextDefinition.kind)) {
                  delete nextAction.followupTitle;
                  delete nextAction.followupSubtitle;
                }
                void saveAction(
                  slot,
                  {
                    ...nextAction,
                    effectKind: nextDefinition.kind,
                    canonicalMechanicId: nextDefinition.canonicalMechanicId,
                    selectionPolicyId: nextDefinition.defaultSelectionPolicyId,
                  },
                  "exploration_editor_effect_kind_changed",
                  {
                    fromEffectKind: action.effectKind,
                    toEffectKind: nextDefinition.kind,
                  },
                );
              }}
            />
          </label>
        </div>
        {definition.fields.length > 0 && (
          <div className="exploration-editor-fields">
            {definition.fields.map((field) => controlFor(slot, action, field))}
          </div>
        )}
        {definition.requiresFollowup && (
          <div
            className="exploration-editor-fields"
            data-exploration-field-control="siteTypeFollowup"
          >
            {editable(
              {
                cardId: `${encounter.cardId}:${String(slot)}`,
                field: "followupTitle",
              },
              action.followupTitle ?? action.label,
              <span>{action.followupTitle ?? action.label}</span>,
              (value, revision) =>
                saveActionText(slot, "followupTitle", value, revision),
              "single-line",
            )}
            {editable(
              {
                cardId: `${encounter.cardId}:${String(slot)}`,
                field: "followupSubtitle",
              },
              action.followupSubtitle ?? action.effectText,
              <span>{action.followupSubtitle ?? action.effectText}</span>,
              (value, revision) =>
                saveActionText(slot, "followupSubtitle", value, revision),
            )}
          </div>
        )}
        <span
          aria-live="polite"
          className="exploration-editor-action-status"
          data-status={status?.status ?? "idle"}
        >
          {status?.status === "saving"
            ? "Saving…"
            : status?.status === "saved"
              ? "Saved"
              : status?.status === "error"
                ? status.message
                : ""}
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
      <GlassPanel
        overflow="hidden"
        testId={`exploration-row-${encounter.cardId}`}
      >
        <div className="exploration-editor-row-grid">
          <div className="exploration-editor-art-frame">
            <img
              alt={`Art for ${encounter.cardName}`}
              className="exploration-editor-art"
              loading={index < 2 ? "eager" : "lazy"}
              src={resolveArtRef(artRef.explorationCard(encounter.imageNumber))}
            />
          </div>
          <div className="exploration-editor-copy">
            <header className="exploration-editor-copy-header">
              <div>
                <h2>{encounter.cardName}</h2>
                <a
                  aria-label={`Open ${encounter.cardName} exploration in a new tab`}
                  className="exploration-editor-card-link"
                  href={`/?goto=exploration&card=${encodeURIComponent(encounter.cardId)}`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <code>{encounter.cardId}</code>
                </a>
              </div>
              <div className="exploration-editor-card-ability">
                <RulesText
                  text={assertLocalized(encounter.cardAbilityText)}
                  owner={{ kind: "card", id: encounter.cardId }}
                />
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
              {encounter.actions.map(actionPanel)}
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
  const [data, setDataValue] = useState<ExplorationEditorServerData | null>(
    null,
  );
  const dataRef = useRef(data);
  const [catalog, setCatalog] = useState<ReferenceCatalog>(EMPTY_CATALOG);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadMessage, setLoadMessage] = useState("");
  const [loadRevision, setLoadRevision] = useState(0);
  const [saveStateValue, setSaveStateValue] = useState<EditableSaveState>(
    EMPTY_EDITOR_SAVE_STATE,
  );
  const saveStateRef = useRef(saveStateValue);
  const [cardPickerTarget, setCardPickerTarget] =
    useState<CardPickerTarget | null>(null);
  const [cardPickerQuery, setCardPickerQuery] = useState("");
  const cardFilter = useMemo(
    () => parseExplorationCardFilter(window.location.search),
    [],
  );

  const setData = useCallback((next: ExplorationEditorServerData) => {
    dataRef.current = next;
    setDataValue(next);
  }, []);
  const updateData = useCallback(
    (
      update: (
        data: ExplorationEditorServerData,
      ) => ExplorationEditorServerData,
    ) => {
      if (dataRef.current === null) return;
      setData(update(dataRef.current));
    },
    [setData],
  );
  const setSaveState = useCallback(
    (update: (state: EditableSaveState) => EditableSaveState) => {
      const next = update(saveStateRef.current);
      saveStateRef.current = next;
      setSaveStateValue(next);
    },
    [],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadState("loading");
    client
      .load(controller.signal)
      .then((loaded) => {
        const visibleEncounterCount =
          cardFilter === null
            ? loaded.encounters.length
            : loaded.encounters.filter((encounter) =>
                cardFilter.has(encounter.cardId.toLowerCase()),
              ).length;
        setData(serverData(loaded));
        setCatalog({
          cards: loaded.cards,
          cardsById: new Map(
            loaded.cards.map((card) => [card.id.toLowerCase(), card]),
          ),
          dreamsigns: loaded.dreamsigns,
          dreamsignsById: new Map(
            loaded.dreamsigns.flatMap((dreamsign) =>
              dreamsign.id === undefined
                ? []
                : [[dreamsign.id.toLowerCase(), dreamsign]],
            ),
          ),
        });
        setLoadState("ready");
        logEvent("exploration_editor_loaded", {
          encounterCount: loaded.encounters.length,
          cardFilterActive: cardFilter !== null,
          requestedCardCount: cardFilter?.size ?? 0,
          visibleEncounterCount,
          effectKindCount: loaded.effectSchemas.length,
          runtimeCardSelections: loaded.encounters.flatMap((encounter) =>
            encounter.actions.flatMap((action, slot) =>
              action.runtimeCardSelections.map((selection) => ({
                encounterCardId: encounter.cardId,
                actionId: action.id,
                actionSlot: slot,
                deckTarget: action.deckTarget,
                ...selection,
              })),
            ),
          ),
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadMessage(messageFor(error));
        setLoadState("error");
        logEvent("exploration_editor_load_failed", {
          message: messageFor(error),
        });
      });
    return () => controller.abort();
  }, [cardFilter, client, loadRevision, setData]);

  useEffect(() => {
    const reloadConfirmedData = () =>
      setLoadRevision((revision) => revision + 1);
    window.addEventListener(
      "exploration-editor:save-failed",
      reloadConfirmedData,
    );
    return () =>
      window.removeEventListener(
        "exploration-editor:save-failed",
        reloadConfirmedData,
      );
  }, []);

  useEffect(() => {
    if (
      loadState !== "ready" ||
      !window.location.hash.startsWith("#exploration-")
    )
      return;
    document
      .getElementById(decodeURIComponent(window.location.hash.slice(1)))
      ?.scrollIntoView({ block: "start" });
  }, [loadState]);

  async function chooseCard(cardId: string) {
    if (cardPickerTarget === null || dataRef.current === null) return;
    const encounter = dataRef.current.encounters.find(
      (entry) => entry.cardId === cardPickerTarget.cardId,
    );
    if (encounter === undefined) return;
    const action = { ...encounter.actions[cardPickerTarget.slot], cardId };
    const revision = Date.now();
    try {
      const response = await client.saveAction({
        ...cardPickerTarget,
        action,
        clientRevision: revision,
      });
      if (response.clientRevision !== revision)
        throw new Error("Mismatched card confirmation.");
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

  const pickerAction =
    cardPickerTarget === null || data === null
      ? undefined
      : data.encounters.find(
          (entry) => entry.cardId === cardPickerTarget.cardId,
        )?.actions[cardPickerTarget.slot];
  const visibleEncounters = useMemo(
    () =>
      data === null || cardFilter === null
        ? (data?.encounters ?? [])
        : data.encounters.filter((encounter) =>
            cardFilter.has(encounter.cardId.toLowerCase()),
          ),
    [cardFilter, data],
  );

  return (
    <div className="cumulus exploration-editor-layout">
      <main className="exploration-editor-shell">
        <header className="exploration-editor-page-header">
          <div>
            <p>Exploration workshop</p>
            <h1>Production encounters</h1>
          </div>
          {loadState === "ready" && data !== null && (
            <span>
              {visibleEncounters.length} encounters · edits write directly to
              exploration.ron
            </span>
          )}
        </header>
        {loadState === "loading" && (
          <div className="exploration-editor-notice">
            Loading production encounters…
          </div>
        )}
        {loadState === "error" && (
          <div className="exploration-editor-error">
            <GlassPanel
              title={assertLocalized(
                "Exploration encounters could not be loaded",
              )}
              subtitle={assertLocalized(loadMessage)}
            >
              <div className="exploration-editor-error-action">
                <GlassButton
                  label={assertLocalized("Retry")}
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
            {[...visibleEncounters].reverse().map((encounter, index) => (
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
