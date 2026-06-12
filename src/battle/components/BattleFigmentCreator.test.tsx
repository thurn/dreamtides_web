// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BattleDebugEdit } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { allocateBattleCardInstance, createInitialBattleState } from "../state/create-initial-state";
import { FIGMENT_CATALOG_ENTRIES } from "../state/figment-catalog";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import type { BattleMutableState } from "../types";
import { BattleFigmentCreator } from "./BattleFigmentCreator";

function buildBattleState(): BattleMutableState {
  const site = makeBattleTestSite();
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site,
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return createInitialBattleState(battleInit);
}

function mount(options: { state?: BattleMutableState } = {}): {
  container: HTMLDivElement;
  root: Root;
  submits: BattleDebugEdit[];
  closes: { count: number };
} {
  const submits: BattleDebugEdit[] = [];
  const closes = { count: 0 };
  const state = options.state ?? buildBattleState();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <BattleFigmentCreator
        initialSide="player"
        onClose={() => {
          closes.count += 1;
        }}
        onSubmit={(edit) => submits.push(edit)}
        state={state}
      />,
    );
  });

  return { container, root, submits, closes };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("BattleFigmentCreator", () => {
  it("lists all 14 catalog types in the picker", () => {
    const { root } = mount();

    const select = document.querySelector<HTMLSelectElement>(
      '[data-battle-figment-field="subtype"]',
    );
    expect(select).not.toBeNull();
    const values = Array.from(select?.querySelectorAll("option") ?? []).map(
      (option) => option.value,
    );
    expect(values).toEqual(FIGMENT_CATALOG_ENTRIES.map((entry) => entry.subtype));
    expect(values).toHaveLength(14);

    act(() => {
      root.unmount();
    });
  });

  it("pre-fills base spark and surfaces the keyword when selecting Ancient", () => {
    const { root } = mount();

    setSelectValue('[data-battle-figment-field="subtype"]', "Ancient");

    expect(
      document.querySelector<HTMLInputElement>('[data-battle-figment-field="spark"]')?.value,
    ).toBe("4");
    expect(
      document.querySelector<HTMLElement>("[data-battle-figment-keyword]")?.textContent,
    ).toContain("Unstoppable");

    act(() => {
      root.unmount();
    });
  });

  it("dispatches CREATE_FIGMENT with the catalog subtype and base spark", () => {
    vi.spyOn(Date, "now").mockReturnValue(999);
    const { root, submits } = mount();

    setSelectValue('[data-battle-figment-field="subtype"]', "Celestial");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton?.disabled).toBe(false);
    act(() => {
      submitButton?.click();
    });

    expect(submits).toHaveLength(1);
    const edit = submits[0];
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.chosenSubtype).toBe("Celestial");
    // Celestial's catalog base spark is 2 (rules §Figments); the keyword
    // (Preeminence) is stamped by the CREATE_FIGMENT reducer from the subtype.
    expect(edit.chosenSpark).toBe(2);
    expect(edit.name).toBe("Celestial Figment");

    act(() => {
      root.unmount();
    });
  });

  it("keeps spark editable for an off-base figment", () => {
    const { root, submits } = mount();

    setSelectValue('[data-battle-figment-field="subtype"]', "Warrior");
    setInputValue('[data-battle-figment-field="spark"]', "7");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    act(() => {
      submitButton?.click();
    });

    expect(submits).toHaveLength(1);
    const edit = submits[0];
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.chosenSubtype).toBe("Warrior");
    expect(edit.chosenSpark).toBe(7);

    act(() => {
      root.unmount();
    });
  });

  it("blocks submit when spark is negative", () => {
    const { root, submits } = mount();

    setSelectValue('[data-battle-figment-field="subtype"]', "Warrior");
    setInputValue('[data-battle-figment-field="spark"]', "-1");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton?.disabled).toBe(true);
    act(() => {
      submitButton?.click();
    });
    expect(submits).toHaveLength(0);

    act(() => {
      root.unmount();
    });
  });

  it("defaults to a Shadow Figment in the first open reserve slot for the selected side", () => {
    vi.spyOn(Date, "now").mockReturnValue(777);
    const state = buildBattleState();
    const occupantId = Object.values(state.cardInstances)
      .find((instance) => instance.owner === "enemy")?.battleCardId;
    if (occupantId === undefined) {
      throw new Error("expected at least one enemy-owned card in test state");
    }
    state.sides.enemy.backRank.B0 = occupantId;

    const submits: BattleDebugEdit[] = [];
    const closes = { count: 0 };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <BattleFigmentCreator
          initialSide="enemy"
          onClose={() => {
            closes.count += 1;
          }}
          onSubmit={(edit) => submits.push(edit)}
          state={state}
        />,
      );
    });

    expect(
      document.querySelector<HTMLInputElement>('[data-battle-figment-field="name"]')?.value,
    ).toBe("Shadow Figment");
    expect(
      document.querySelector<HTMLInputElement>('[data-battle-figment-field="subtype"]')?.value,
    ).toBe("Shadow");
    expect(
      document.querySelector<HTMLInputElement>('[data-battle-figment-field="spark"]')?.value,
    ).toBe("2");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="battle-figment-slot"][value="B1"]',
      )?.checked,
    ).toBe(true);

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton?.disabled).toBe(false);
    act(() => {
      submitButton?.click();
    });

    expect(submits).toHaveLength(1);
    const edit = submits[0];
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.side).toBe("enemy");
    expect(edit.chosenSubtype).toBe("Shadow");
    expect(edit.chosenSpark).toBe(2);
    expect(edit.name).toBe("Shadow Figment");
    expect(edit.destination).toEqual({
      side: "enemy",
      zone: "backRank",
      slotId: "B1",
    });
    expect(edit.createdAtMs).toBe(777);
    expect(closes.count).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("emits CREATE_FIGMENT with the expected payload on submit", () => {
    vi.spyOn(Date, "now").mockReturnValue(555);
    const { root, submits, closes } = mount();

    setSelectValue('[data-battle-figment-field="subtype"]', "Outsider");
    setInputValue('[data-battle-figment-field="name"]', "Custom Figment");
    setInputValue('[data-battle-figment-field="spark"]', "4");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton?.disabled).toBe(false);
    act(() => {
      submitButton?.click();
    });

    expect(submits).toHaveLength(1);
    const edit = submits[0];
    expect(edit.kind).toBe("CREATE_FIGMENT");
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.side).toBe("player");
    expect(edit.chosenSubtype).toBe("Outsider");
    expect(edit.chosenSpark).toBe(4);
    expect(edit.name).toBe("Custom Figment");
    expect(edit.destination).toEqual({
      side: "player",
      zone: "backRank",
      slotId: "B0",
    });
    expect(edit.createdAtMs).toBe(555);
    expect(closes.count).toBe(1);

    act(() => {
      root.unmount();
    });
  });

  it("disables submit and surfaces inline reason when target slot is occupied (bug-114)", () => {
    const state = buildBattleState();
    // Occupy player reserve B0 with any existing card.
    const occupantId = Object.values(state.cardInstances)
      .find((instance) => instance.owner === "player")?.battleCardId;
    if (occupantId === undefined) {
      throw new Error("expected at least one player-owned card in test state");
    }
    state.sides.player.backRank.B0 = occupantId;

    const { root, submits } = mount({ state });

    setSelectValue('[data-battle-figment-field="subtype"]', "Warrior");
    setInputValue('[data-battle-figment-field="spark"]', "2");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton).not.toBeNull();
    expect(submitButton?.disabled).toBe(false);

    const r0Radio = document.querySelector<HTMLInputElement>(
      'input[name="battle-figment-slot"][value="B0"]',
    );
    expect(r0Radio).not.toBeNull();
    act(() => {
      r0Radio!.click();
    });

    const submitButtonAfterOccupiedSlot = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButtonAfterOccupiedSlot?.disabled).toBe(true);

    const hint = document.querySelector<HTMLElement>(
      "[data-battle-figment-submit-hint]",
    );
    expect(hint?.textContent).toContain("B0 is occupied");

    act(() => {
      submitButtonAfterOccupiedSlot?.click();
    });
    expect(submits).toHaveLength(0);

    // Switching to an unoccupied slot (B1) re-enables submit.
    const r1Radio = document.querySelector<HTMLInputElement>(
      'input[name="battle-figment-slot"][value="B1"]',
    );
    expect(r1Radio).not.toBeNull();
    act(() => {
      r1Radio!.click();
    });

    const submitButtonAfter = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButtonAfter?.disabled).toBe(false);

    act(() => {
      submitButtonAfter?.click();
    });
    expect(submits).toHaveLength(1);
    const edit = submits[0];
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.destination).toEqual({
      side: "player",
      zone: "backRank",
      slotId: "B1",
    });

    act(() => {
      root.unmount();
    });
  });

  it("allows submitting into an occupied slot when it contains the matching figment stack", () => {
    const state = buildBattleState();
    const stackId = allocateBattleCardInstance(state, {
      definition: {
        sourceDeckEntryId: null,
        cardId: "",
        cardNumber: 0,
        name: "Shadow Figment",
        battleCardKind: "character",
        subtype: "Shadow",
        energyCost: 0,
        printedEnergyCost: 0,
        printedSpark: 1,
        isFast: false,
        reclaimCost: null,
        renderedText: "",
        imageNumber: 0,
        transfiguration: null,
        isBane: false,
      },
      owner: "player",
      controller: "player",
      isRevealedToPlayer: true,
      provenance: {
        kind: "generated-figment",
        sourceBattleCardId: null,
        chosenSpark: 1,
        chosenSubtype: "Shadow",
        createdAtTurnNumber: state.turnNumber,
        createdAtSide: "player",
        createdAtMs: 1,
      },
    });
    state.sides.player.backRank.B0 = stackId;

    const { root, submits } = mount({ state });
    const r0Radio = document.querySelector<HTMLInputElement>(
      'input[name="battle-figment-slot"][value="B0"]',
    );
    expect(r0Radio).not.toBeNull();
    act(() => {
      r0Radio!.click();
    });
    setSelectValue('[data-battle-figment-field="subtype"]', "Shadow");

    const submitButton = document.querySelector<HTMLButtonElement>(
      '[data-battle-figment-action="submit"]',
    );
    expect(submitButton?.disabled).toBe(false);

    act(() => {
      submitButton?.click();
    });
    expect(submits).toHaveLength(1);
    const edit = submits[0];
    if (edit.kind !== "CREATE_FIGMENT") {
      throw new Error("expected CREATE_FIGMENT edit");
    }
    expect(edit.destination).toEqual({
      side: "player",
      zone: "backRank",
      slotId: "B0",
    });

    act(() => {
      root.unmount();
    });
  });
});

function setSelectValue(selector: string, value: string): void {
  const select = document.querySelector<HTMLSelectElement>(selector);
  if (select === null) {
    throw new Error(`Missing select for ${selector}`);
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  );
  act(() => {
    descriptor?.set?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setInputValue(selector: string, value: string): void {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (input === null) {
    throw new Error(`Missing input for ${selector}`);
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  );
  act(() => {
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
