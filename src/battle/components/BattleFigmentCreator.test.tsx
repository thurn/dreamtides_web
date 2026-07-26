// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleDebugEdit } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import { FIGMENT_CATALOG_ENTRIES } from "../state/figment-catalog";
import { makeBattleTestCardDatabase, makeBattleTestDreamAvatars, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { BattleFigmentCreator } from "./BattleFigmentCreator";

function state() {
  return createInitialBattleState(createBattleInit({ battleEntryKey: "test", site: makeBattleTestSite(), state: makeBattleTestState(), cardDatabase: makeBattleTestCardDatabase(), dreamAvatars: makeBattleTestDreamAvatars() }));
}
function chooseType(label: string): void {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Figment type"]');
  act(() => trigger?.click());
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((element) => element.textContent?.includes(label));
  act(() => option?.click());
}
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("BattleFigmentCreator", () => {
  it("uses Cumulus dialog controls, exposes every catalog type, and dispatches a valid target", () => {
    const board = state(); const submits: BattleDebugEdit[] = []; const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    act(() => root.render(<BattleFigmentCreator initialSide="player" state={board} onClose={() => undefined} onSubmit={(edit) => submits.push(edit)} />));
    expect(document.querySelector('[data-battle-figment-creator]')).not.toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Figment type"]')?.click());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(FIGMENT_CATALOG_ENTRIES.length);
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="battle-figment-submit"]')?.click());
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({ kind: "CREATE_FIGMENT", side: "player", destination: { side: "player", zone: "backRank", slotId: "B0" } });
    act(() => root.unmount());
  });

  it("keeps type-derived spark and keyword display in the Cumulus form", () => {
    const board = state(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    act(() => root.render(<BattleFigmentCreator initialSide="player" state={board} onClose={() => undefined} onSubmit={() => undefined} />));
    chooseType("Ancient");
    const spark = document.querySelector<HTMLInputElement>('[data-battle-figment-field="spark"] input');
    expect(spark?.value).toBe("4");
    expect(document.querySelector('[data-battle-figment-keyword]')?.textContent).toContain("Unstoppable");
    act(() => root.unmount());
  });
});
