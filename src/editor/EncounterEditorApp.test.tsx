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
  EncounterSelectionSaveRequest,
  EncounterTemplateHealth,
  EncounterTextSaveRequest,
} from "./encounter-editor-types";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
let scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();

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
    ...(selected ? { selected: { prose: true, actions: true } } : {}),
  };
}

const GROUPS: EncounterEditorGroup[] = [{
  cardId: CARD_ID,
  cardName: "The Test Crossing",
  imageNumber: 42,
  encounters: [candidate(1, true), candidate(2), candidate(3)],
}];

const TEMPLATE_HEALTH: EncounterTemplateHealth = {
  completedCards: 9,
  recordedTemplateUses: 90,
  catalogTemplateCount: 70,
  meanUsesPerTemplate: 1.286,
  softWarningThreshold: 2,
  omissionThreshold: 3,
  recordedRankOneTemplateUses: 18,
  meanRankOneUsesPerTemplate: 0.257,
  rankOneSoftWarningThreshold: 1,
  rankOneOmissionThreshold: 2,
  guidance: "Prefer fewer prior rank-1 uses first.",
  templates: [
    { templateId: 14, template: "Draw a card", usageCount: 9, rankOneUsageCount: 6, status: "hidden", reasons: ["rank_1", "overall"] },
    { templateId: 37, template: "Gain a dreamsign", usageCount: 2, rankOneUsageCount: 1, status: "warning", reasons: ["rank_1", "overall"] },
    { templateId: 1, template: "Gain essence", usageCount: 0, rankOneUsageCount: 0, status: "unused", reasons: [] },
    { templateId: 2, template: "Purge a card", usageCount: 1, rankOneUsageCount: 0, status: "available", reasons: [] },
  ],
};

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
    loadTemplateHealth: vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH)),
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
  window.history.replaceState(null, "", "/encounters");
  scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
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
    expect(container.textContent).not.toContain("Selected rank");
    expect(container.textContent).not.toContain("Choice 1");
    expect(container.textContent).toContain("Prose for rank 1");
    expect(container.textContent).toContain("Rank 1 label 1");
    expect(container.textContent).toContain("Rank 1 effect 1");
    expect(container.textContent).toContain("Rank 1 resolution 1");
    expect(container.textContent).not.toContain("Prose for rank 2");
    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("/api/editor/encounters/art/42");
    expect(container.querySelector(`[data-encounter-card-id='${CARD_ID}']`)?.id)
      .toBe(`encounter-${CARD_ID}`);
    act(() => root.unmount());
  });

  it("scrolls a linked encounter into view after its group loads", async () => {
    window.history.replaceState(null, "", `/encounters#encounter-${CARD_ID}`);
    const { root } = await renderLoaded(client());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    act(() => root.unmount());
  });

  it("loads template health lazily and filters outliers, unused templates, and candidates", async () => {
    const loadTemplateHealth = vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH));
    const { container, root } = await renderLoaded(client({ loadTemplateHealth }));
    expect(loadTemplateHealth).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='template-health-trigger']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadTemplateHealth).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Rank-1 diversity");
    expect(container.textContent).toContain("Draw a card");
    expect(container.textContent).toContain("Gain a dreamsign");
    expect(container.textContent).not.toContain("Gain essence");

    const unused = [...container.querySelectorAll<HTMLButtonElement>("[role='tab']")]
      .find((button) => button.textContent === "Unused")!;
    act(() => unused.click());
    expect(container.textContent).toContain("Gain essence");
    expect(container.textContent).toContain("Never used");
    expect(container.textContent).not.toContain("Balanced usage");
    expect(container.textContent).not.toContain("Draw a card");

    const candidates = [...container.querySelectorAll<HTMLButtonElement>("[role='tab']")]
      .find((button) => button.textContent === "Candidates")!;
    act(() => candidates.click());
    expect(container.textContent).toContain("Gain essence");
    expect(container.textContent).toContain("Purge a card");
    expect(container.textContent).not.toContain("Draw a card");

    act(() => container.querySelector<HTMLButtonElement>("[aria-label='Close template health']")!.click());
    expect(container.querySelector("[data-testid='encounter-template-health-rail']")).toBeNull();
    act(() => root.unmount());
  });

  it("optimistically selects prose independently and confirms by identity", async () => {
    const pending = deferred<Awaited<ReturnType<EncounterEditorClient["saveSelection"]>>>();
    const saveSelection = vi.fn().mockReturnValue(pending.promise);
    const { container, root } = await renderLoaded(client({ saveSelection }));
    const next = container.querySelector<HTMLButtonElement>(`[data-testid='next-prose-${CARD_ID}']`)!;
    act(() => next.click());
    expect(container.textContent).toContain("Prose for rank 2");
    expect(container.textContent).toContain("Rank 1 label 1");
    expect(
      container.querySelector<HTMLButtonElement>(`[data-testid='next-prose-${CARD_ID}']`)
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    await act(async () => {
      pending.resolve({
        clientRevision: 1,
        confirmation: {
          cardId: CARD_ID,
          selectionKind: "prose",
          selectedTemplatePairId: "pair-2",
          selectedRank: 2,
        },
      });
      await pending.promise;
    });
    expect(container.textContent).toContain("Prose selection saved");
    expect(saveSelection).toHaveBeenCalledWith({
      cardId: CARD_ID,
      templatePairId: "pair-2",
      selectionKind: "prose",
      clientRevision: 1,
    });
    act(() => root.unmount());
  });

  it("selects choices without changing prose", async () => {
    const saveSelection = vi.fn().mockImplementation((request: EncounterSelectionSaveRequest) => Promise.resolve({
      clientRevision: request.clientRevision,
      confirmation: {
        cardId: request.cardId,
        selectionKind: request.selectionKind,
        selectedTemplatePairId: request.templatePairId,
        selectedRank: 2,
      },
    }));
    const { container, root } = await renderLoaded(client({ saveSelection }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid='next-actions-${CARD_ID}']`)!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Prose for rank 1");
    expect(container.textContent).toContain("Rank 2 label 1");
    expect(container.textContent).not.toContain("Rank 1 label 1");
    act(() => root.unmount());
  });

  it("rolls only the failed optimistic selection back", async () => {
    const saveSelection = vi.fn().mockRejectedValue(new Error("Disk unavailable"));
    const { container, root } = await renderLoaded(client({ saveSelection }));
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid='next-prose-${CARD_ID}']`)!.click();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Prose for rank 1");
    expect(container.textContent).toContain("Rank 1 label 1");
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
