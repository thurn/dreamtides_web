// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import EncounterEditorApp from "./EncounterEditorApp";
import type {
  EncounterEditorCandidate,
  EncounterEditorClient,
  EncounterEditorGroup,
  EncounterTextSaveRequest,
} from "./encounter-editor-types";

const CARD_ID = "11111111-1111-4111-8111-111111111111";

function candidate(rank: number, selected = false): EncounterEditorCandidate {
  return {
    template_pair_id: `pair-${String(rank)}`,
    prose: `Prose for rank ${String(rank)}`,
    actions: [1, 2].map((templateId) => ({
      template_id: templateId,
      label: `Rank ${String(rank)} label ${String(templateId)}`,
      effect_text: `Rank ${String(rank)} effect ${String(templateId)}`,
      resolution: `Rank ${String(rank)} resolution ${String(templateId)}`,
    })) as EncounterEditorCandidate["actions"],
    rank,
    ...(selected ? { selected: true } : {}),
  };
}

const GROUPS: EncounterEditorGroup[] = [{
  cardId: CARD_ID,
  cardName: "The Test Crossing",
  imageNumber: 42,
  encounters: [candidate(1, true), candidate(2), candidate(3)],
}];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function client(overrides: Partial<EncounterEditorClient> = {}): EncounterEditorClient {
  return {
    load: vi.fn().mockResolvedValue(structuredClone(GROUPS)),
    saveSelection: vi.fn(),
    saveText: vi.fn(),
    ...overrides,
  };
}

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  return { container, root };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Missing textarea value setter");
  const setValue = descriptor.set.bind(textarea);
  setValue(value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function renderLoaded(apiClient: EncounterEditorClient) {
  const mounted = mount();
  await act(async () => {
    mounted.root.render(<CumulusRoot><EncounterEditorApp client={apiClient} /></CumulusRoot>);
    await Promise.resolve();
  });
  return mounted;
}

describe("EncounterEditorApp", () => {
  it("renders only the selected candidate with prominent art and all editable copy", async () => {
    const { container, root } = await renderLoaded(client());
    expect(container.textContent).toContain("Selected rank 1 of 3");
    expect(container.textContent).toContain("Prose for rank 1");
    expect(container.textContent).toContain("Rank 1 label 1");
    expect(container.textContent).toContain("Rank 1 effect 1");
    expect(container.textContent).toContain("Rank 1 resolution 1");
    expect(container.textContent).not.toContain("Prose for rank 2");
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/exploration/42.jpg");
    act(() => root.unmount());
  });

  it("optimistically selects the next ranked design and confirms by identity", async () => {
    const pending = deferred<Awaited<ReturnType<EncounterEditorClient["saveSelection"]>>>();
    const saveSelection = vi.fn().mockReturnValue(pending.promise);
    const { container, root } = await renderLoaded(client({ saveSelection }));
    const next = container.querySelector<HTMLButtonElement>(`[data-testid='next-${CARD_ID}']`)!;
    act(() => next.click());
    expect(container.textContent).toContain("Selected rank 2 of 3");
    expect(container.textContent).toContain("Prose for rank 2");
    expect(
      container.querySelector<HTMLButtonElement>(`[data-testid='next-${CARD_ID}']`)
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () => {
      pending.resolve({
        clientRevision: 1,
        confirmation: { cardId: CARD_ID, selectedTemplatePairId: "pair-2", selectedRank: 2 },
      });
      await pending.promise;
    });
    expect(container.textContent).toContain("Selection saved");
    expect(saveSelection).toHaveBeenCalledWith({
      cardId: CARD_ID,
      templatePairId: "pair-2",
      clientRevision: 1,
    });
    act(() => root.unmount());
  });

  it("rolls an optimistic selection back when persistence fails", async () => {
    const saveSelection = vi.fn().mockRejectedValue(new Error("Disk unavailable"));
    const { container, root } = await renderLoaded(client({ saveSelection }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid='next-${CARD_ID}']`)!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Selected rank 1 of 3");
    expect(container.textContent).toContain("Disk unavailable");
    act(() => root.unmount());
  });

  it("single-clicks into prose and saves the exact candidate field on Enter", async () => {
    const saveText = vi.fn().mockImplementation((request: EncounterTextSaveRequest) => Promise.resolve({
      clientRevision: request.clientRevision,
      confirmation: {
        cardId: request.cardId,
        templatePairId: request.templatePairId,
        field: request.field,
        value: request.value,
      },
    }));
    const { container, root } = await renderLoaded(client({ saveText }));
    act(() => {
      container.querySelector<HTMLElement>("[data-editor-field='prose']")!.click();
    });
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-editor-input-field='prose']")!;
    act(() => setTextareaValue(textarea, "A newly written encounter."));
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
    });
    expect(saveText).toHaveBeenCalledWith({
      cardId: CARD_ID,
      templatePairId: "pair-1",
      field: "prose",
      value: "A newly written encounter.",
      clientRevision: 3,
    });
    expect(container.textContent).toContain("A newly written encounter.");
    act(() => root.unmount());
  });
});
