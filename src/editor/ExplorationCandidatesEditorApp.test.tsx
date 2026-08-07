// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";
import ExplorationCandidatesEditorApp from "./ExplorationCandidatesEditorApp";
import type {
  ExplorationCandidatesEditorCandidate,
  ExplorationCandidatesEditorClient,
  ExplorationCandidatesEditorGroup,
  EncounterSelectionSaveRequest,
  EncounterTemplateSaveRequest,
  EncounterTemplateHealth,
  EncounterTextSaveRequest,
  EncounterVariableSaveRequest,
} from "./exploration-candidates-editor-types";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CARD_ID = "22222222-2222-4222-8222-222222222222";
const DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333";
let scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();

const REFERENCE_CARD: CardData = {
  id: asCardId(OTHER_CARD_ID),
  name: asCardName("Fixture Ally"),
  cardNumber: 84,
  cardType: "Character",
  subtype: "Guide",
  isStarter: false,
  energyCost: 2,
  spark: 3,
  isFast: false,
  renderedText: "Support — Supported allies have +1✦.",
  imageNumber: 84,
  artOwned: true,
};
const REFERENCE_DREAMSIGN: Dreamsign = {
  id: DREAMSIGN_ID,
  name: "Bell",
  effectDescription: "At the start of battle, gain 1●.",
  imageName: "bell.png",
  imageAlt: "A small silver bell",
};

function candidate(rank: number, selected = false): ExplorationCandidatesEditorCandidate {
  return {
    template_pair_id: `pair-${String(rank)}`,
    prose: `Prose for rank ${String(rank)}`,
    actions: [1, 2].map((templateId) => ({
      template_id: templateId,
      template: templateId === 1 ? "Draw {count} cards" : "Gain $OFFERED_CARD",
      rendered_template: templateId === 1
        ? `Draw ${String(rank)} cards`
        : "Gain Fixture Ally and Bell",
      rendered_template_parts: templateId === 1
        ? [
          { kind: "text" as const, text: "Draw " },
          {
            kind: "variable" as const,
            placeholder: "{count}",
            variableName: "count",
            value: rank,
            text: String(rank),
          },
          { kind: "text" as const, text: " cards" },
        ]
        : [
          { kind: "text" as const, text: "Gain " },
          {
            kind: "card" as const,
            placeholder: "$OFFERED_CARD",
            cardId: OTHER_CARD_ID,
            cardName: "Fixture Ally",
          },
          { kind: "text" as const, text: " and " },
          {
            kind: "dreamsign" as const,
            placeholder: "{dreamsign_name}",
            dreamsignId: DREAMSIGN_ID,
            dreamsignName: "Bell",
          },
        ],
      runtime_card_selections: templateId === 1 ? [] : [{
        placeholder: "$OFFERED_CARD",
        predicate: null,
        cardId: OTHER_CARD_ID,
        cardName: "Fixture Ally",
        source: "offer_pool" as const,
      }],
      variables: templateId === 1 ? { count: rank } : {},
      label: `Rank ${String(rank)} label ${String(templateId)}`,
    })) as ExplorationCandidatesEditorCandidate["actions"],
    rank,
    ...(selected ? { selected: { prose: true, actions: true } } : {}),
  };
}

const GROUPS: ExplorationCandidatesEditorGroup[] = [{
  cardId: CARD_ID,
  cardName: "The Test Crossing",
  cardAbilityText: "▸Materialized: Gain 1●, then foresee 1.",
  imageNumber: 42,
  encounters: [candidate(1, true), candidate(2), candidate(3)],
}];

const TEMPLATE_HEALTH: EncounterTemplateHealth = {
  productionEncounters: 9,
  recordedTemplateUses: 4,
  catalogTemplateCount: 70,
  meanUsesPerTemplate: 0.057,
  softWarningThreshold: 1,
  omissionThreshold: 2,
  uniqueEffectOmissionThreshold: 1,
  requiredTemplateCount: 10,
  guidance: "Prefer fewer prior production uses.",
  templates: [
    { templateId: 14, template: "Draw a card", usageCount: 1, balanceClass: "unique_effect", status: "hidden", reasons: ["production"] },
    { templateId: 37, template: "Gain a dreamsign", usageCount: 1, balanceClass: null, status: "warning", reasons: ["production"] },
    { templateId: 1, template: "Gain essence", usageCount: 0, balanceClass: null, status: "unused", reasons: [] },
    { templateId: 2, template: "Purge a card", usageCount: 2, balanceClass: null, status: "reintroduced", reasons: ["production"] },
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

function client(overrides: Partial<ExplorationCandidatesEditorClient> = {}): ExplorationCandidatesEditorClient {
  return {
    load: vi.fn().mockResolvedValue({
      groups: structuredClone(GROUPS),
      cards: [structuredClone(REFERENCE_CARD)],
      dreamsigns: [structuredClone(REFERENCE_DREAMSIGN)],
    }),
    loadTemplateHealth: vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH)),
    saveSelection: vi.fn(),
    saveTemplate: vi.fn(),
    saveText: vi.fn(),
    saveVariable: vi.fn(),
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
  window.history.replaceState(null, "", "/exploration_candidates");
  scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
  Element.prototype.scrollIntoView = scrollIntoView;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  document.body.innerHTML = "";
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  vi.restoreAllMocks();
});

async function renderLoaded(apiClient: ExplorationCandidatesEditorClient) {
  const mounted = mount();
  await act(async () => {
    mounted.root.render(<CumulusRoot><ExplorationCandidatesEditorApp client={apiClient} /></CumulusRoot>);
    await Promise.resolve();
  });
  return mounted;
}

describe("ExplorationCandidatesEditorApp", () => {
  it("renders only the selected candidate with prominent art and all editable copy", async () => {
    const { container, root } = await renderLoaded(client());
    expect(container.textContent).not.toContain("Selected rank");
    expect(container.textContent).not.toContain("Choice 1");
    expect(container.textContent).toContain("Prose for rank 1");
    expect(container.textContent).toContain("Rank 1 label 1");
    expect(container.textContent).toContain("Draw 1 cards");
    expect(container.textContent).toContain("Gain Fixture Ally");
    expect(container.textContent).not.toContain("$OFFERED_CARD");
    const selectedCardName = container.querySelector<HTMLElement>(
      `[data-runtime-card-id='${OTHER_CARD_ID}']`,
    );
    expect(selectedCardName?.textContent).toBe("Fixture Ally");
    expect(selectedCardName?.dataset.runtimeCardPlaceholder).toBe("$OFFERED_CARD");
    expect(selectedCardName?.querySelector("u")?.textContent).toBe("Fixture Ally");
    expect(selectedCardName?.querySelector("[data-reveal-entity-type]"))
      .toBeNull();
    const selectedDreamsignName = container.querySelector<HTMLElement>(
      `[data-runtime-dreamsign-id='${DREAMSIGN_ID}']`,
    );
    expect(selectedDreamsignName?.textContent).toBe("Bell");
    expect(selectedDreamsignName?.dataset.runtimeDreamsignPlaceholder)
      .toBe("{dreamsign_name}");
    expect(selectedDreamsignName?.querySelector("u")?.textContent).toBe("Bell");
    expect(selectedDreamsignName?.querySelector("[data-reveal-entity-type]"))
      .toBeNull();
    expect(container.textContent).toContain("Rank 1 label 1");
    expect(container.textContent).not.toContain("Prose for rank 2");
    expect(container.querySelector(".exploration-candidates-editor-card-ability")?.textContent)
      .toContain("▸Materialized: Gain 1, then foresee 1.");
    expect(container.querySelector(".exploration-candidates-editor-card-ability [aria-label='energy']"))
      .not.toBeNull();
    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("/api/editor/exploration_candidates/art/42");
    expect(container.querySelector(`[data-encounter-card-id='${CARD_ID}']`)?.id)
      .toBe(`encounter-${CARD_ID}`);
    act(() => root.unmount());
  });

  it("renders the newest encounter group first", async () => {
    const newestGroup: ExplorationCandidatesEditorGroup = {
      ...structuredClone(GROUPS[0]),
      cardId: OTHER_CARD_ID,
      cardName: "The Newest Crossing",
    };
    const load = vi.fn().mockResolvedValue({
      groups: [structuredClone(GROUPS[0]), newestGroup],
      cards: [structuredClone(REFERENCE_CARD)],
      dreamsigns: [structuredClone(REFERENCE_DREAMSIGN)],
    });

    const { container, root } = await renderLoaded(client({ load }));

    expect(
      [...container.querySelectorAll<HTMLElement>("[data-encounter-card-id]")]
        .map((element) => element.dataset.encounterCardId),
    ).toEqual([OTHER_CARD_ID, CARD_ID]);
    act(() => root.unmount());
  });

  it("scrolls a linked encounter into view after its group loads", async () => {
    window.history.replaceState(null, "", `/exploration_candidates#encounter-${CARD_ID}`);
    const { root } = await renderLoaded(client());
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" });
    act(() => root.unmount());
  });

  it("explains selection states, thresholds, and why one-use templates differ", async () => {
    const loadTemplateHealth = vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH));
    const { container, root } = await renderLoaded(client({ loadTemplateHealth }));
    expect(loadTemplateHealth).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='template-health-trigger']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(loadTemplateHealth).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("What can be chosen now");
    expect(container.textContent).toContain("Every template is either selectable or hidden");
    expect(container.textContent).toContain("Unique effects");
    expect(container.textContent).toContain("Hide after 1 use");
    expect(container.textContent).toContain("Gain a dreamsign");
    expect(container.textContent).toContain("Gain essence");
    expect(container.textContent).toContain("Purge a card");
    expect(container.textContent).not.toContain("Draw a card");

    const unused = container.querySelector<HTMLButtonElement>("[data-testid='template-health-filter-unused']")!;
    act(() => unused.click());
    expect(unused.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector("[data-template-health-filter='unused']")).not.toBeNull();
    expect([...container.querySelectorAll<HTMLElement>(".encounter-template-health-entry")]
      .map((entry) => entry.dataset.templateId)).toEqual(["1"]);

    const hidden = container.querySelector<HTMLButtonElement>("[data-testid='template-health-filter-hidden']")!;
    act(() => hidden.click());
    expect(container.textContent).toContain("Draw a card");
    expect(container.textContent).toContain("Unique effect: hidden after 1 production use.");
    expect(container.textContent).not.toContain("Gain a dreamsign");

    const all = container.querySelector<HTMLButtonElement>("[data-testid='template-health-filter-all']")!;
    act(() => all.click());
    expect(container.textContent).toContain("Draw a card");
    expect(container.textContent).toContain("Gain a dreamsign");
    expect(container.textContent).toContain("Gain essence");

    act(() => container.querySelector<HTMLButtonElement>("[aria-label='Close template health']")!.click());
    expect(container.querySelector("[data-testid='encounter-template-health-rail']")).toBeNull();
    act(() => root.unmount());
  });

  it("optimistically selects prose independently and confirms by identity", async () => {
    const pending = deferred<Awaited<ReturnType<ExplorationCandidatesEditorClient["saveSelection"]>>>();
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

  it("increments a numeric template variable and persists the selected quantity", async () => {
    const saveVariable = vi.fn().mockImplementation((request: EncounterVariableSaveRequest) => Promise.resolve({
      clientRevision: request.clientRevision,
      confirmation: {
        cardId: request.cardId,
        templatePairId: request.templatePairId,
        actionTemplateId: request.actionTemplateId,
        variableName: request.variableName,
        value: request.value,
      },
    }));
    const { container, root } = await renderLoaded(client({ saveVariable }));
    const control = container.querySelector<HTMLElement>(
      `[data-testid='encounter-variable-${CARD_ID}-pair-1-1-count']`,
    )!;
    expect(control.getAttribute("aria-label")).toBe("Count");

    await act(async () => {
      control.querySelector<HTMLButtonElement>("[aria-label^='Increase Count']")!.click();
      await Promise.resolve();
    });

    expect(saveVariable).toHaveBeenCalledWith({
      cardId: CARD_ID,
      templatePairId: "pair-1",
      actionTemplateId: 1,
      variableName: "count",
      value: 2,
      clientRevision: 1,
    });
    expect(container.querySelector("[data-encounter-variable='count']")?.textContent)
      .toBe("2");
    expect(container.textContent).toContain("Draw 2 cards");
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

  it("displays substituted templates, edits canonical template text, and refreshes every use", async () => {
    const saveTemplate = vi.fn().mockImplementation((request: EncounterTemplateSaveRequest) => {
      const groups = structuredClone(GROUPS);
      for (const encounter of groups[0].encounters) {
        const action = encounter.actions[0];
        action.template = request.value;
        action.rendered_template = request.value.replace("{count}", String(encounter.rank));
        action.rendered_template_parts = [{ kind: "text", text: action.rendered_template }];
      }
      return Promise.resolve({
        clientRevision: request.clientRevision,
        confirmation: { templateId: request.templateId, template: request.value },
        groups,
      });
    });
    const { container, root } = await renderLoaded(client({ saveTemplate }));
    expect(container.textContent).toContain("Draw 1 cards");
    act(() => {
      container.querySelector<HTMLElement>("[data-editor-field='template']")!.click();
    });
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-editor-input-field='template']")!;
    expect(textarea.value).toBe("Draw {count} cards");
    act(() => setTextareaValue(textarea, "Draw {count} additional cards"));
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
    });
    expect(saveTemplate).toHaveBeenCalledWith({
      templateId: 1,
      value: "Draw {count} additional cards",
      clientRevision: 3,
    });
    expect(container.textContent).toContain("Draw 1 additional cards");
    act(() => root.unmount());
  });

  it("opens only the clicked occurrence when a canonical template is reused", async () => {
    const repeatedGroups: ExplorationCandidatesEditorGroup[] = [
      structuredClone(GROUPS[0]),
      {
        ...structuredClone(GROUPS[0]),
        cardId: OTHER_CARD_ID,
        cardName: "The Other Crossing",
      },
    ];
    const load = vi.fn().mockResolvedValue({
      groups: repeatedGroups,
      cards: [structuredClone(REFERENCE_CARD)],
      dreamsigns: [structuredClone(REFERENCE_DREAMSIGN)],
    });
    const { container, root } = await renderLoaded(client({ load }));
    const occurrences = container.querySelectorAll<HTMLElement>(
      "[data-editor-field='template']",
    );
    expect(occurrences).toHaveLength(4);

    act(() => occurrences[0].click());

    expect(container.querySelectorAll("[data-editor-input-field='template']"))
      .toHaveLength(1);
    expect(container.querySelectorAll(
      "[data-editor-field='template'][data-editor-save-status='editing']",
    )).toHaveLength(1);
    act(() => root.unmount());
  });
});
