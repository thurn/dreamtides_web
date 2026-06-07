// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import type { BattleDebugEdit } from "../debug/commands";
import { createBattleInit } from "../integration/create-battle-init";
import { allocateBattleCardInstance, createInitialBattleState } from "../state/create-initial-state";
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
  const cardDatabase = new Map<number, CardData>([
    [1, makeCardStub({ subtype: "Seeker" })],
    [2, makeCardStub({ subtype: "Seeker" })],
    [3, makeCardStub({ subtype: "Wisp" })],
    [4, makeCardStub({ subtype: "*" })],
    [5, makeCardStub({ subtype: "" })],
  ]);
  const state = options.state ?? buildBattleState();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <BattleFigmentCreator
        cardDatabase={cardDatabase}
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
  it("blocks submit when subtype is empty", () => {
    const { root, submits } = mount();
    setInputValue('[data-battle-figment-field="subtype"]', "");

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

  it("blocks submit when spark is negative", () => {
    const { root, submits } = mount();

    setInputValue('[data-battle-figment-field="subtype"]', "Wisp");
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
    state.sides.enemy.reserve.B0 = occupantId;

    const submits: BattleDebugEdit[] = [];
    const closes = { count: 0 };
    const cardDatabase = new Map<number, CardData>([
      [1, makeCardStub({ subtype: "Seeker" })],
    ]);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <BattleFigmentCreator
          cardDatabase={cardDatabase}
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
    ).toBe("1");
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
    expect(edit.chosenSpark).toBe(1);
    expect(edit.name).toBe("Shadow Figment");
    expect(edit.destination).toEqual({
      side: "enemy",
      zone: "reserve",
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

    setInputValue('[data-battle-figment-field="name"]', "Custom Figment");
    setInputValue('[data-battle-figment-field="subtype"]', "Wisp");
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
    expect(edit.chosenSubtype).toBe("Wisp");
    expect(edit.chosenSpark).toBe(4);
    expect(edit.name).toBe("Custom Figment");
    expect(edit.destination).toEqual({
      side: "player",
      zone: "reserve",
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
    state.sides.player.reserve.B0 = occupantId;

    const { root, submits } = mount({ state });

    setInputValue('[data-battle-figment-field="subtype"]', "Wisp");
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
      zone: "reserve",
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
    state.sides.player.reserve.B0 = stackId;

    const { root, submits } = mount({ state });
    const r0Radio = document.querySelector<HTMLInputElement>(
      'input[name="battle-figment-slot"][value="B0"]',
    );
    expect(r0Radio).not.toBeNull();
    act(() => {
      r0Radio!.click();
    });
    setInputValue('[data-battle-figment-field="subtype"]', "Shadow");

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
      zone: "reserve",
      slotId: "B0",
    });

    act(() => {
      root.unmount();
    });
  });

  it("renders a dedup'd datalist filtered to meaningful subtypes", () => {
    const { root } = mount();

    const datalist = document.querySelector<HTMLDataListElement>(
      "#figment-subtypes",
    );
    expect(datalist).not.toBeNull();
    const values = Array.from(datalist?.querySelectorAll("option") ?? [])
      .map((option) => option.getAttribute("value"));
    expect(values).toContain("Seeker");
    expect(values).toContain("Shadow");
    expect(values).toContain("Wisp");
    expect(values).not.toContain("*");
    expect(values).not.toContain("");
    expect(values).toEqual([...new Set(values)]);

    act(() => {
      root.unmount();
    });
  });
});

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

function makeCardStub(overrides: Partial<CardData>): CardData {
  return {
    name: "Stub",
    id: "stub-card",
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: 1,
    artOwned: false,
    ...overrides,
  };
}
