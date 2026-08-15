// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleDebugEdit } from "../debug/commands";
import { createTestBattleInit } from "../../testing/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamAvatars,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleCardNoteEditor } from "./BattleCardNoteEditor";
import { CumulusRoot } from "../../cumulus/CumulusRoot";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseNoteId } from "../../types/identifiers";

function LocalizedBattleCardNoteEditor(
  props: ComponentProps<typeof BattleCardNoteEditor>,
) {
  return (
    <CumulusRoot>
      <BattleCardNoteEditor {...props} />
    </CumulusRoot>
  );
}

function createState() {
  return createInitialBattleState(
    createTestBattleInit({
      battleEntryKey: parseBattleEntryKey("test"),
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamAvatars: makeBattleTestDreamAvatars(),
    }),
  );
}
function choose(ariaLabel: string, label: string): void {
  const trigger = document.querySelector<HTMLButtonElement>(
    `button[aria-label="${ariaLabel}"]`,
  );
  act(() => trigger?.click());
  const option = [
    ...document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
  ].find((element) => element.textContent?.includes(label));
  act(() => option?.click());
}
beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleCardNoteEditor", () => {
  it("uses a Cumulus dialog/form and submits the default next-turn expiry", () => {
    const state = createState();
    const battleCardId = state.sides.player.hand[0];
    const onSubmit = vi.fn<(edit: BattleDebugEdit) => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <LocalizedBattleCardNoteEditor
          battleCardId={battleCardId}
          state={state}
          generateNoteId={() => parseNoteId("note-1")}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />,
      ),
    );
    expect(document.querySelector("[data-battle-note-editor]")).not.toBeNull();
    const input = document.querySelector<HTMLInputElement>(
      '[data-battle-note-field="text"] input',
    );
    act(() => {
      if (input !== null) {
        input.value = "remember this";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-testid="battle-note-add"]')
        ?.click(),
    );
    const submitted = onSubmit.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({
      kind: "ADD_CARD_NOTE",
      battleCardId,
      noteId: parseNoteId("note-1"),
      text: "remember this",
      expiry: { kind: "atStartOfTurn" },
    });
    act(() => root.unmount());
  });

  it("preserves manual and after-N expiry resolution through Cumulus controls", () => {
    const state = createState();
    const battleCardId = state.sides.player.hand[0];
    const onSubmit = vi.fn<(edit: BattleDebugEdit) => void>();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() =>
      root.render(
        <LocalizedBattleCardNoteEditor
          battleCardId={battleCardId}
          state={state}
          generateNoteId={() => parseNoteId("note-2")}
          onClose={() => undefined}
          onSubmit={onSubmit}
        />,
      ),
    );
    const input = document.querySelector<HTMLInputElement>(
      '[data-battle-note-field="text"] input',
    );
    act(() => {
      if (input !== null) {
        input.value = "persist";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    choose("Note expiry", "Manual Dismissal");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[data-testid="battle-note-add"]')
        ?.click(),
    );
    expect(onSubmit).toHaveBeenLastCalledWith(
      expect.objectContaining({ expiry: { kind: "manual" } }),
    );
    act(() => root.unmount());
  });
});
