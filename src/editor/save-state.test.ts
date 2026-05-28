import { describe, expect, it } from "vitest";
import {
  beginFieldEdit,
  cancelFieldEdit,
  completeFieldSave,
  EMPTY_EDITOR_SAVE_STATE,
  failFieldSave,
  fieldSaveEntry,
  rejectFieldEdit,
  startFieldSave,
  updateFieldDraft,
} from "./save-state";

const firstName = { cardId: "card-1", field: "name" } as const;
const secondName = { cardId: "card-2", field: "name" } as const;
const firstSpark = { cardId: "card-1", field: "spark" } as const;

describe("editor save state", () => {
  it("marks exactly one card UUID and field as saving", () => {
    const edited = updateFieldDraft(
      updateFieldDraft(EMPTY_EDITOR_SAVE_STATE, secondName, "Other", "Other"),
      firstSpark,
      3,
      2,
    );

    const result = startFieldSave(edited, firstName, "Renamed", "Original");

    expect(fieldSaveEntry(result.state, firstName)).toMatchObject({
      status: "saving",
      draftValue: "Renamed",
    });
    expect(fieldSaveEntry(result.state, secondName)).toMatchObject({
      status: "editing",
    });
    expect(fieldSaveEntry(result.state, firstSpark)).toMatchObject({
      status: "editing",
    });
  });

  it("applies success only to the matching card UUID and field", () => {
    const firstSave = startFieldSave(
      EMPTY_EDITOR_SAVE_STATE,
      firstName,
      "Renamed",
      "Original",
    );
    const secondSave = startFieldSave(
      firstSave.state,
      secondName,
      "Other Renamed",
      "Other",
    );

    const completed = completeFieldSave(
      secondSave.state,
      firstName,
      firstSave.clientRevision,
      "Renamed",
    );

    expect(fieldSaveEntry(completed, firstName)).toMatchObject({
      status: "saved",
      confirmedValue: "Renamed",
    });
    expect(fieldSaveEntry(completed, secondName)).toMatchObject({
      status: "saving",
      confirmedValue: "Other",
    });
  });

  it("ignores stale success responses when a newer save has been submitted", () => {
    const firstSave = startFieldSave(
      EMPTY_EDITOR_SAVE_STATE,
      firstName,
      "First",
      "Original",
    );
    const secondDraft = updateFieldDraft(
      firstSave.state,
      firstName,
      "Latest Draft",
      "Original",
    );
    const secondSave = startFieldSave(
      secondDraft,
      firstName,
      "Second",
      "Original",
    );

    const completed = completeFieldSave(
      secondSave.state,
      firstName,
      firstSave.clientRevision,
      "First",
    );

    expect(completed).toBe(secondSave.state);
    expect(fieldSaveEntry(completed, firstName)).toMatchObject({
      status: "saving",
      draftValue: "Second",
      submittedRevision: secondSave.clientRevision,
    });
  });

  it("applies a save response after a no-op re-edit during the pending save", () => {
    const firstSave = startFieldSave(
      EMPTY_EDITOR_SAVE_STATE,
      firstName,
      "First Save",
      "Original",
    );
    const reenteredEdit = beginFieldEdit(
      firstSave.state,
      firstName,
      "Original",
    );

    const completed = completeFieldSave(
      reenteredEdit,
      firstName,
      firstSave.clientRevision,
      "First Save",
    );

    expect(fieldSaveEntry(completed, firstName)).toMatchObject({
      status: "saved",
      draftValue: "First Save",
      confirmedValue: "First Save",
      submittedRevision: firstSave.clientRevision,
    });
  });

  it("applies a save response after canceling a no-op re-edit during the pending save", () => {
    const firstSave = startFieldSave(
      EMPTY_EDITOR_SAVE_STATE,
      firstName,
      "First Save",
      "Original",
    );
    const reenteredEdit = beginFieldEdit(
      firstSave.state,
      firstName,
      "Original",
    );
    const canceledEdit = cancelFieldEdit(
      reenteredEdit,
      firstName,
      "Original",
    );

    const completed = completeFieldSave(
      canceledEdit,
      firstName,
      firstSave.clientRevision,
      "First Save",
    );

    expect(fieldSaveEntry(completed, firstName)).toMatchObject({
      status: "saved",
      draftValue: "First Save",
      confirmedValue: "First Save",
      submittedRevision: firstSave.clientRevision,
    });
  });

  it("starts a fresh edit from the passed display value after a completed save", () => {
    const firstSave = startFieldSave(
      beginFieldEdit(EMPTY_EDITOR_SAVE_STATE, firstSpark, "X"),
      firstSpark,
      "*",
      "*",
    );
    const completed = completeFieldSave(
      firstSave.state,
      firstSpark,
      firstSave.clientRevision,
      "*",
    );

    const reenteredEdit = beginFieldEdit(completed, firstSpark, "X");

    expect(fieldSaveEntry(reenteredEdit, firstSpark)).toMatchObject({
      status: "editing",
      draftValue: "X",
      confirmedValue: "X",
    });
  });

  it("restores the server-confirmed value for matching failed saves", () => {
    const firstSave = startFieldSave(
      EMPTY_EDITOR_SAVE_STATE,
      firstName,
      "Renamed",
      "Original",
    );

    const failed = failFieldSave(
      firstSave.state,
      firstName,
      firstSave.clientRevision,
      "Original",
      "Save failed",
    );

    expect(fieldSaveEntry(failed, firstName)).toMatchObject({
      status: "error",
      draftValue: "Original",
      confirmedValue: "Original",
      message: "Save failed",
    });
  });

  it("keeps local validation failures editable with the rejected draft", () => {
    const edited = updateFieldDraft(
      beginFieldEdit(EMPTY_EDITOR_SAVE_STATE, firstName, "Original"),
      firstName,
      "",
      "Original",
    );

    const rejected = rejectFieldEdit(
      edited,
      firstName,
      "",
      "Original",
      "Name cannot be blank.",
    );

    expect(fieldSaveEntry(rejected, firstName)).toMatchObject({
      status: "editing",
      draftValue: "",
      confirmedValue: "Original",
      message: "Name cannot be blank.",
    });
  });

  it("keeps the latest draft visible when editing during an in-flight save", () => {
    const firstSave = startFieldSave(
      beginFieldEdit(EMPTY_EDITOR_SAVE_STATE, firstName, "Original"),
      firstName,
      "First Save",
      "Original",
    );

    const editedAgain = updateFieldDraft(
      firstSave.state,
      firstName,
      "Latest Draft",
      "Original",
    );

    expect(fieldSaveEntry(editedAgain, firstName)).toMatchObject({
      status: "saving",
      draftValue: "Latest Draft",
    });
  });

  it("keeps an active newer draft visible when an older pending save fails", () => {
    const firstSave = startFieldSave(
      beginFieldEdit(EMPTY_EDITOR_SAVE_STATE, firstName, "Original"),
      firstName,
      "First Save",
      "Original",
    );
    const editedAgain = updateFieldDraft(
      firstSave.state,
      firstName,
      "Latest Draft",
      "Original",
    );

    const failed = failFieldSave(
      editedAgain,
      firstName,
      firstSave.clientRevision,
      "Original",
      "Save failed",
    );

    expect(fieldSaveEntry(failed, firstName)).toMatchObject({
      status: "editing",
      draftValue: "Latest Draft",
      confirmedValue: "Original",
      message: "Save failed",
    });
  });
});
