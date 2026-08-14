import type { CardId } from "../types/card-identity";
import type {
  DreamAvatarId,
  DreamscapeId,
  DreamsignId,
  DreamwellCardId,
  EditorFieldTargetId,
} from "../types/identifiers";

export type EditableFieldValue = string | number;
export type EditableFieldName = string;
export type EditableFieldStatus =
  "idle" | "editing" | "saving" | "saved" | "error";

export type EditorEntityId =
  | CardId
  | DreamAvatarId
  | DreamscapeId
  | DreamsignId
  | DreamwellCardId
  | EditorFieldTargetId;

export interface EditableFieldSaveEntry {
  cardId: EditorEntityId;
  field: EditableFieldName;
  status: EditableFieldStatus;
  clientRevision: number;
  submittedRevision: number;
  draftValue: EditableFieldValue;
  confirmedValue: EditableFieldValue;
  message: string | null;
}

export interface EditableSaveState {
  fields: Record<string, EditableFieldSaveEntry>;
}

export interface FieldTarget {
  cardId: EditorEntityId;
  field: EditableFieldName;
}

export const EMPTY_EDITOR_SAVE_STATE: EditableSaveState = {
  fields: {},
};

export function fieldSaveKey({ cardId, field }: FieldTarget): string {
  return `${cardId}\u0000${field}`;
}

export function fieldSaveEntry(
  state: EditableSaveState,
  target: FieldTarget,
): EditableFieldSaveEntry | null {
  return state.fields[fieldSaveKey(target)] ?? null;
}

function entryFor(
  state: EditableSaveState,
  target: FieldTarget,
  confirmedValue: EditableFieldValue,
): EditableFieldSaveEntry {
  return (
    fieldSaveEntry(state, target) ?? {
      ...target,
      status: "idle",
      clientRevision: 0,
      submittedRevision: 0,
      draftValue: confirmedValue,
      confirmedValue,
      message: null,
    }
  );
}

function withEntry(
  state: EditableSaveState,
  entry: EditableFieldSaveEntry,
): EditableSaveState {
  return {
    fields: {
      ...state.fields,
      [fieldSaveKey(entry)]: entry,
    },
  };
}

function hasActiveDirtyLocalDraft(
  entry: EditableFieldSaveEntry,
  clientRevision: number,
  confirmedValue: EditableFieldValue,
): boolean {
  return (
    (entry.status === "editing" || entry.status === "saving") &&
    entry.clientRevision > clientRevision &&
    !Object.is(entry.draftValue, confirmedValue)
  );
}

export function beginFieldEdit(
  state: EditableSaveState,
  target: FieldTarget,
  confirmedValue: EditableFieldValue,
): EditableSaveState {
  const entry = entryFor(state, target, confirmedValue);
  const hasActiveDraft =
    entry.status === "editing" || entry.status === "saving";
  return withEntry(state, {
    ...entry,
    status: "editing",
    draftValue: hasActiveDraft ? entry.draftValue : confirmedValue,
    confirmedValue,
    clientRevision: entry.clientRevision + 1,
    message: null,
  });
}

export function updateFieldDraft(
  state: EditableSaveState,
  target: FieldTarget,
  draftValue: EditableFieldValue,
  confirmedValue: EditableFieldValue,
): EditableSaveState {
  const entry = entryFor(state, target, confirmedValue);
  return withEntry(state, {
    ...entry,
    status: entry.status === "saving" ? "saving" : "editing",
    draftValue,
    confirmedValue,
    clientRevision: entry.clientRevision + 1,
    message: null,
  });
}

export function cancelFieldEdit(
  state: EditableSaveState,
  target: FieldTarget,
  confirmedValue: EditableFieldValue,
): EditableSaveState {
  const entry = entryFor(state, target, confirmedValue);
  return withEntry(state, {
    ...entry,
    status: "idle",
    draftValue: confirmedValue,
    confirmedValue,
    message: null,
  });
}

export function startFieldSave(
  state: EditableSaveState,
  target: FieldTarget,
  draftValue: EditableFieldValue,
  confirmedValue: EditableFieldValue,
): { state: EditableSaveState; clientRevision: number } {
  const entry = entryFor(state, target, confirmedValue);
  const nextRevision = entry.clientRevision + 1;
  return {
    clientRevision: nextRevision,
    state: withEntry(state, {
      ...entry,
      status: "saving",
      draftValue,
      confirmedValue,
      clientRevision: nextRevision,
      submittedRevision: nextRevision,
      message: null,
    }),
  };
}

export function rejectFieldEdit(
  state: EditableSaveState,
  target: FieldTarget,
  draftValue: EditableFieldValue,
  confirmedValue: EditableFieldValue,
  message: string,
): EditableSaveState {
  const entry = entryFor(state, target, confirmedValue);
  return withEntry(state, {
    ...entry,
    status: "editing",
    draftValue,
    confirmedValue,
    message,
  });
}

export function completeFieldSave(
  state: EditableSaveState,
  target: FieldTarget,
  clientRevision: number,
  confirmedValue: EditableFieldValue,
): EditableSaveState {
  const entry = fieldSaveEntry(state, target);
  if (entry === null || clientRevision < entry.submittedRevision) {
    return state;
  }

  const shouldKeepLocalDraft = hasActiveDirtyLocalDraft(
    entry,
    clientRevision,
    confirmedValue,
  );

  return withEntry(state, {
    ...entry,
    status: shouldKeepLocalDraft ? "editing" : "saved",
    draftValue: shouldKeepLocalDraft ? entry.draftValue : confirmedValue,
    confirmedValue,
    clientRevision: entry.clientRevision,
    message: null,
  });
}

export function failFieldSave(
  state: EditableSaveState,
  target: FieldTarget,
  clientRevision: number,
  serverConfirmedValue: EditableFieldValue,
  message: string,
): EditableSaveState {
  const entry = fieldSaveEntry(state, target);
  if (entry === null || clientRevision < entry.submittedRevision) {
    return state;
  }

  const shouldKeepLocalDraft = hasActiveDirtyLocalDraft(
    entry,
    clientRevision,
    serverConfirmedValue,
  );

  return withEntry(state, {
    ...entry,
    status: shouldKeepLocalDraft ? "editing" : "error",
    draftValue: shouldKeepLocalDraft ? entry.draftValue : serverConfirmedValue,
    confirmedValue: serverConfirmedValue,
    clientRevision: shouldKeepLocalDraft
      ? entry.clientRevision
      : clientRevision,
    message,
  });
}

export function rejectSubmittedFieldSave(
  state: EditableSaveState,
  target: FieldTarget,
  clientRevision: number,
  serverConfirmedValue: EditableFieldValue,
  message: string,
): EditableSaveState {
  const entry = fieldSaveEntry(state, target);
  if (entry === null || clientRevision < entry.submittedRevision) {
    return state;
  }

  return withEntry(state, {
    ...entry,
    status: "editing",
    draftValue: entry.draftValue,
    confirmedValue: serverConfirmedValue,
    clientRevision: entry.clientRevision,
    message,
  });
}
