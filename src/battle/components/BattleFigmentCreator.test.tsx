// @vitest-environment jsdom

import { act, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleDebugEdit } from "../debug/commands";
import { createTestBattleInit } from "../../testing/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  FIGMENT_CATALOG_ENTRIES,
  LEGIONNAIRE_FIGMENT_ID,
  hydrateFigmentCatalog,
  resetFigmentCatalogHydration,
} from "../state/figment-catalog";
import { makeBattleTestCardDatabase, makeBattleTestDreamAvatars, makeBattleTestSite, makeBattleTestState } from "../test-support";
import { BattleFigmentCreator } from "./BattleFigmentCreator";
import { CumulusRoot } from "../../cumulus/CumulusRoot";

function LocalizedBattleFigmentCreator(
  props: ComponentProps<typeof BattleFigmentCreator>,
) {
  return <CumulusRoot><BattleFigmentCreator {...props} /></CumulusRoot>;
}

function state() {
  return createInitialBattleState(createTestBattleInit({ battleEntryKey: "test", site: makeBattleTestSite(), state: makeBattleTestState(), cardDatabase: makeBattleTestCardDatabase(), dreamAvatars: makeBattleTestDreamAvatars() }));
}
function chooseType(label: string): void {
  const trigger = document.querySelector<HTMLButtonElement>('button[aria-label="Figment type"]');
  act(() => trigger?.click());
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((element) => element.textContent?.includes(label));
  act(() => option?.click());
}
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => {
  document.body.innerHTML = "";
  resetFigmentCatalogHydration();
  vi.restoreAllMocks();
});

describe("BattleFigmentCreator", () => {
  it("uses Cumulus dialog controls, exposes every catalog type, and dispatches a valid target", () => {
    const board = state(); const submits: BattleDebugEdit[] = []; const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    act(() => root.render(<LocalizedBattleFigmentCreator initialSide="player" state={board} onClose={() => undefined} onSubmit={(edit) => submits.push(edit)} />));
    expect(document.querySelector('[data-battle-figment-creator]')).not.toBeNull();
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Figment type"]')?.click());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(FIGMENT_CATALOG_ENTRIES.length);
    act(() => [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')]
      .find((element) => element.textContent?.includes("Shadow"))?.click());
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Figment battlefield slot"]')?.click());
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(10);
    act(() => document.querySelector<HTMLButtonElement>('[role="option"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Create more figments"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Create more figments"]')?.click());
    act(() => document.querySelector<HTMLButtonElement>('[data-testid="battle-figment-submit"]')?.click());
    expect(submits).toHaveLength(1);
    expect(submits[0]).toMatchObject({
      kind: "CREATE_FIGMENT",
      side: "player",
      count: 3,
      chosenFigmentId: FIGMENT_CATALOG_ENTRIES.find(
        (entry) => entry.subtype === "Shadow",
      )?.id,
      destination: {
        side: "player",
        zone: "backRank",
        slotId: "B0",
      },
    });
    act(() => root.unmount());
  });

  it("keeps type-derived spark and keyword display in the Cumulus form", () => {
    const board = state(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
    act(() => root.render(<LocalizedBattleFigmentCreator initialSide="player" state={board} onClose={() => undefined} onSubmit={() => undefined} />));
    chooseType("Ember");
    const spark = document.querySelector<HTMLInputElement>('[data-battle-figment-field="spark"] input');
    expect(spark?.value).toBe("1");
    expect(document.querySelector('[data-battle-figment-keyword]')?.textContent).toContain("Awakened");
    act(() => root.unmount());
  });

  it("labels figment choices by authored name when types share a subtype", () => {
    hydrateFigmentCatalog([
      {
        id: FIGMENT_CATALOG_ENTRIES[0].id,
        name: "Warrior",
        subtype: "Warrior",
        spark: 1,
      },
      {
        id: LEGIONNAIRE_FIGMENT_ID,
        name: "Legionnaire",
        subtype: "Warrior",
        spark: 1,
      },
    ]);
    const board = state();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => root.render(
      <LocalizedBattleFigmentCreator
        initialSide="player"
        state={board}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    ));
    act(() => document
      .querySelector<HTMLButtonElement>('button[aria-label="Figment type"]')
      ?.click());

    expect(
      [...document.querySelectorAll('[role="option"]')].map(
        (option) => option.textContent?.trim(),
      ),
    ).toEqual([
      "Warrior (✦1)",
      "Legionnaire (✦1)",
    ]);
    act(() => root.unmount());
  });

  it("restores the last selected type when the creator is reopened", () => {
    const board = state();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    let rememberedTypeId: string | undefined;

    act(() => root.render(
      <LocalizedBattleFigmentCreator
        initialSide="player"
        state={board}
        onClose={() => undefined}
        onSubmit={() => undefined}
        onTypeChange={(typeId) => {
          rememberedTypeId = typeId;
        }}
      />,
    ));
    chooseType("Ember");
    act(() => root.unmount());

    const reopenedHost = document.createElement("div");
    document.body.append(reopenedHost);
    const reopenedRoot = createRoot(reopenedHost);
    act(() => reopenedRoot.render(
      <LocalizedBattleFigmentCreator
        initialSide="player"
        initialTypeId={rememberedTypeId}
        state={board}
        onClose={() => undefined}
        onSubmit={() => undefined}
      />,
    ));

    expect(
      document.querySelector<HTMLInputElement>(
        '[data-battle-figment-field="spark"] input',
      )?.value,
    ).toBe("1");
    expect(
      document.querySelector('[data-battle-figment-keyword]')?.textContent,
    ).toContain("Awakened");
    act(() => reopenedRoot.unmount());
  });
});
