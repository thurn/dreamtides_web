// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleCommand } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import { makeBattleTestCardDatabase, makeBattleTestDreamcallers, makeBattleTestSite, makeBattleTestState } from "../test-support";
import type { BattleMutableState } from "../types";
import { BattleContextMenu } from "./BattleContextMenu";

function state(): BattleMutableState {
  return createInitialBattleState(createBattleInit({ battleEntryKey: "test", site: makeBattleTestSite(), state: makeBattleTestState(), cardDatabase: makeBattleTestCardDatabase(), dreamcallers: makeBattleTestDreamcallers() }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = ((media: string) => ({ matches: media.includes("min-width"), media, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(() => { document.body.innerHTML = ""; });

describe("BattleContextMenu", () => {
  it("delegates clamped card actions and nested commands to ContextActionMenu", () => {
    const board = state();
    const battleCardId = board.sides.player.hand.find((id) => board.cardInstances[id]?.definition.battleCardKind === "character");
    if (battleCardId === undefined) throw new Error("expected character");
    const onCommand = vi.fn<(command: BattleCommand) => void>();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    act(() => root.render(<BattleContextMenu battleCardId={battleCardId} sourceSurface="inspector" state={board} x={9999} y={9999} onClose={() => undefined} onCommand={onCommand} onOpenNoteEditor={() => undefined} />));
    const menu = document.querySelector('[data-context-action-menu]');
    expect(menu).not.toBeNull();
    expect(menu?.textContent).toContain("Player · Hand");
    const status = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes("Status"));
    expect(status).not.toBeUndefined();
    act(() => status?.click());
    const exhaust = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((element) => element.textContent?.includes("Exhaust"));
    expect(exhaust).not.toBeUndefined();
    act(() => exhaust?.click());
    const command = onCommand.mock.calls[0]?.[0];
    expect(command).toMatchObject({ id: "DEBUG_EDIT", edit: { kind: "SET_CARD_STATUS", battleCardId } });
    act(() => root.unmount());
  });
});
