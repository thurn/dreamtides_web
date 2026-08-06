// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";
import ExplorationEditorApp from "./ExplorationEditorApp";
import type { EncounterTemplateHealth } from "./exploration-candidates-editor-types";
import type {
  ExplorationEditorClient,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const REWARD_CARD_ID = "22222222-2222-4222-8222-222222222222";
const DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333";
const LAST_CARD_ID = "44444444-4444-4444-8444-444444444444";

const SOURCE_CARD: CardData = {
  id: asCardId(CARD_ID),
  name: asCardName("Fixture Guide"),
  cardNumber: 42,
  cardType: "Character",
  subtype: "Guide",
  isStarter: false,
  energyCost: 2,
  spark: 3,
  isFast: false,
  renderedText: "▸Materialized: Gain 1●.",
  imageNumber: 42,
  artOwned: true,
};
const REWARD_CARD: CardData = {
  ...SOURCE_CARD,
  id: asCardId(REWARD_CARD_ID),
  name: asCardName("Fixture Ally"),
  cardNumber: 84,
  imageNumber: 84,
};
const DREAMSIGN: Dreamsign = {
  id: DREAMSIGN_ID,
  name: "Bell",
  effectDescription: "At the start of battle, gain 1●.",
  imageName: "bell.png",
  imageAlt: "A small bell",
  isNegative: false,
};

const SERVER_DATA: ExplorationEditorServerData = {
  encounters: [{
    cardId: CARD_ID,
    cardName: "Fixture Guide",
    cardAbilityText: "▸Materialized: Gain 1●.",
    imageNumber: 42,
    prose: "A guide waits beside a starlit crossing.",
    actions: [{
      id: `${CARD_ID}:first`,
      label: "Gather a company",
      effectText: "Choose one of 2 packs of 3 Character cards to add to your deck",
      renderedEffectText: "Choose one of 2 packs of 3 Character cards to add to your deck",
      renderedEffectParts: [
        { kind: "text", text: "Choose one of " },
        { kind: "variable", placeholder: "{pack_count}", variableName: "pack_count", value: 2, text: "2" },
        { kind: "text", text: " packs of " },
        { kind: "variable", placeholder: "{pack_size}", variableName: "pack_size", value: 3, text: "3" },
        { kind: "text", text: " " },
        { kind: "variable", placeholder: "{predicate}", variableName: "predicate", value: "Character", text: "Character" },
        { kind: "text", text: " cards to add to your deck" },
      ],
      runtimeCardSelections: [],
      templateId: 36,
      template: "Choose one of {pack_count} packs of {pack_size} {predicate} cards to add to your deck",
      templateVariables: { pack_count: 2, pack_size: 3, predicate: "Character" },
      effectKind: "choose-pack",
      predicate: "character",
      packCount: 2,
      packSize: 3,
    }, {
      id: `${CARD_ID}:second`,
      label: "Invite an ally",
      effectText: "Gain $OFFERED_CARD",
      renderedEffectText: "Gain Fixture Ally",
      renderedEffectParts: [
        { kind: "text", text: "Gain " },
        {
          kind: "card",
          placeholder: "$OFFERED_CARD",
          cardId: REWARD_CARD_ID,
          cardName: "Fixture Ally",
        },
      ],
      runtimeCardSelections: [{
        placeholder: "$OFFERED_CARD",
        predicate: "Character",
        cardId: REWARD_CARD_ID,
        cardName: "Fixture Ally",
        source: "offer_pool",
      }],
      templateId: 11,
      template: "Gain $OFFERED_CARD",
      templateVariables: {},
      selection: { $OFFERED_CARD: { predicate: "Character" } },
      effectKind: "gain-offered-card",
      predicate: "character",
    }],
  }],
  templates: [
    { id: 3, text: "Purge a chosen card" },
    { id: 4, text: "Purge a chosen {predicate} card" },
    { id: 9, text: "Gain a random {predicate} card" },
    { id: 10, text: "Gain {card_id}" },
    { id: 11, text: "Gain $OFFERED_CARD" },
    { id: 13, text: "Gain {count} random {predicate} cards" },
    { id: 36, text: "Choose one of {pack_count} packs of {pack_size} {predicate} cards to add to your deck" },
  ],
  effectDefinitions: [{
    kind: "choose-pack",
    label: "Choose a pack",
    templateIds: [36],
    fields: [
      { key: "predicate", label: "Card predicate", control: "predicate" },
      { key: "packCount", label: "Pack count", control: "number", min: 1 },
      { key: "packSize", label: "Pack size", control: "number", min: 1 },
    ],
  }, {
    kind: "purge-selected",
    label: "Purge selected cards",
    templateIds: [3, 4],
    fields: [{
      key: "predicate",
      label: "Card predicate",
      control: "predicate",
      optional: true,
    }],
  }, {
    kind: "gain-card",
    label: "Gain card",
    templateIds: [10],
    fields: [{ key: "cardId", label: "Card", control: "card" }],
  }, {
    kind: "gain-offered-card",
    label: "Gain offered card",
    templateIds: [11],
    fields: [{ key: "predicate", label: "Card predicate", control: "predicate" }],
  }, {
    kind: "gain-random-cards",
    label: "Gain random cards",
    templateIds: [9, 13],
    fields: [
      { key: "predicate", label: "Card predicate", control: "predicate" },
      { key: "count", label: "Count", control: "number", min: 1, templateIds: [13] },
    ],
  }],
  predicates: [
    { value: "", label: "Any card" },
    { value: "character", label: "Character" },
  ],
  transfigurations: ["Empowered"],
  subtypes: ["Guide"],
};

const TEMPLATE_HEALTH: EncounterTemplateHealth = {
  productionEncounters: 9,
  recordedTemplateUses: 4,
  catalogTemplateCount: 4,
  meanUsesPerTemplate: 1,
  softWarningThreshold: 1,
  omissionThreshold: 2,
  uniqueEffectOmissionThreshold: 1,
  requiredTemplateCount: 3,
  guidance: "Prefer fewer prior production uses.",
  templates: [
    { templateId: 14, template: "Draw a card", usageCount: 1, balanceClass: "unique_effect", status: "hidden", reasons: ["production"] },
    { templateId: 37, template: "Gain a dreamsign", usageCount: 1, balanceClass: null, status: "warning", reasons: ["production"] },
    { templateId: 1, template: "Gain essence", usageCount: 0, balanceClass: null, status: "unused", reasons: [] },
    { templateId: 2, template: "Purge a card", usageCount: 2, balanceClass: null, status: "reintroduced", reasons: ["production"] },
  ],
};

function loadResult(): ExplorationEditorLoadResult {
  return {
    ...structuredClone(SERVER_DATA),
    cards: [structuredClone(SOURCE_CARD), structuredClone(REWARD_CARD)],
    dreamsigns: [structuredClone(DREAMSIGN)],
  };
}

function client(overrides: Partial<ExplorationEditorClient> = {}): ExplorationEditorClient {
  return {
    load: vi.fn().mockResolvedValue(loadResult()),
    loadTemplateHealth: vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH)),
    saveProse: vi.fn(),
    saveAction: vi.fn(),
    saveTemplate: vi.fn(),
    ...overrides,
  };
}

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  return { container, root: createRoot(container) };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Missing textarea value setter");
  descriptor.set.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderLoaded(apiClient: ExplorationEditorClient) {
  const mounted = mount();
  await act(async () => {
    mounted.root.render(<CumulusRoot><ExplorationEditorApp client={apiClient} /></CumulusRoot>);
    await Promise.resolve();
  });
  return mounted;
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

describe("ExplorationEditorApp", () => {
  it("opens the production health rail with explicit selection states and hiding rules", async () => {
    const loadTemplateHealth = vi.fn().mockResolvedValue(structuredClone(TEMPLATE_HEALTH));
    const { container, root } = await renderLoaded(client({ loadTemplateHealth }));
    expect(loadTemplateHealth).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLButtonElement>("[data-testid='template-health-trigger']")!.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadTemplateHealth).toHaveBeenCalledOnce();
    expect(container.querySelector(".exploration-editor-layout")?.getAttribute("data-template-health-open"))
      .toBe("true");
    expect(container.textContent).toContain("What can be chosen now");
    expect(container.textContent).toContain("3SelectableCan appear in a new design");
    expect(container.textContent).toContain("1HiddenTemporarily excluded");
    expect(container.textContent).toContain("Reintroduced");
    expect(container.textContent).toContain("A hidden template restored only when fewer than 3 choices would remain.");
    expect(container.textContent).toContain("Gain a dreamsign");
    expect(container.textContent).toContain("Gain essence");
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

    act(() => container.querySelector<HTMLButtonElement>("[aria-label='Close template health']")!.click());
    expect(container.querySelector("[data-testid='encounter-template-health-rail']")).toBeNull();
    act(() => root.unmount());
  });

  it("renders the last TOML encounter first", async () => {
    const loaded = loadResult();
    loaded.encounters.push({
      ...structuredClone(loaded.encounters[0]),
      cardId: LAST_CARD_ID,
      cardName: "Last Authored Encounter",
    });

    const { container, root } = await renderLoaded(client({
      load: vi.fn().mockResolvedValue(loaded),
    }));
    expect([...container.querySelectorAll<HTMLElement>("[data-exploration-card-id]")]
      .map((row) => row.dataset.explorationCardId))
      .toEqual([LAST_CARD_ID, CARD_ID]);
    act(() => root.unmount());
  });

  it("renders source art, card information, editable copy, and typed controls", async () => {
    const { container, root } = await renderLoaded(client());
    expect(container.textContent).toContain("Fixture Guide");
    expect(container.textContent).toContain(CARD_ID);
    expect(container.textContent).toContain("A guide waits beside a starlit crossing.");
    expect(container.textContent).toContain("Gather a company");
    expect(container.textContent).toContain("Choose one of 2 packs of 3 Character cards");
    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("/api/editor/exploration_candidates/art/42");
    const cardLink = container.querySelector<HTMLAnchorElement>(
      "a[aria-label='Open Fixture Guide exploration in a new tab']",
    );
    expect(cardLink?.getAttribute("href")).toBe(`/?goto=exploration&card=${CARD_ID}`);
    expect(cardLink?.target).toBe("_blank");
    expect(cardLink?.rel).toBe("noopener noreferrer");
    expect(container.querySelector(`[data-testid='exploration-packCount-${CARD_ID}-0']`))
      .not.toBeNull();
    expect(container.querySelector(`[data-testid='exploration-packSize-${CARD_ID}-0']`))
      .not.toBeNull();
    const runtimeCardName = container.querySelector(
      `[data-runtime-card-id='${REWARD_CARD_ID}']`,
    );
    expect(runtimeCardName?.textContent).toBe("Fixture Ally");
    expect(runtimeCardName?.querySelector("[data-reveal-entity-type]"))
      .toBeNull();
    expect(container.querySelector("[data-runtime-card-placeholder='$OFFERED_CARD']"))
      .not.toBeNull();
    expect(container.textContent).not.toContain("$OFFERED_CARD");
    expect(container.querySelectorAll("[aria-label^='Effect for']")).toHaveLength(2);
    expect(container.querySelectorAll("[aria-label^='Template for']")).toHaveLength(0);
    act(() => root.unmount());
  });

  it("single-clicks into prose and commits the TOML-backed field", async () => {
    const saveProse = vi.fn((
      request: Parameters<ExplorationEditorClient["saveProse"]>[0],
    ) => Promise.resolve({
      clientRevision: request.clientRevision,
      data: {
        ...structuredClone(SERVER_DATA),
        encounters: [{ ...structuredClone(SERVER_DATA.encounters[0]), prose: request.value }],
      },
    }));
    const { container, root } = await renderLoaded(client({ saveProse }));
    act(() => container.querySelector<HTMLElement>("[data-editor-field='prose']")!.click());
    const textarea = container.querySelector<HTMLTextAreaElement>("[data-editor-input-field='prose']")!;
    act(() => setTextareaValue(textarea, "A newly written exploration scene."));
    await act(async () => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
      await Promise.resolve();
    });
    expect(saveProse).toHaveBeenCalledWith(expect.objectContaining({
      cardId: CARD_ID,
      value: "A newly written exploration scene.",
    }));
    expect(container.textContent).toContain("A newly written exploration scene.");
    act(() => root.unmount());
  });

  it("saves the selected effect and template pair immediately", async () => {
    const saveAction = vi.fn((
      request: Parameters<ExplorationEditorClient["saveAction"]>[0],
    ) => Promise.resolve({
      clientRevision: request.clientRevision,
      data: structuredClone(SERVER_DATA),
    }));
    const { container, root } = await renderLoaded(client({ saveAction }));
    const trigger = container.querySelector<HTMLButtonElement>(
      "[aria-label='Effect for Gather a company']",
    )!;
    act(() => trigger.click());
    const options = [...document.body.querySelectorAll<HTMLButtonElement>("[role='option']")];
    expect(options.map((entry) => entry.textContent)).toEqual(expect.arrayContaining([
      "Gain random cards — Gain a random {predicate} card",
      "Gain random cards — Gain {count} random {predicate} cards",
    ]));
    const option = options.find((entry) => entry.textContent ===
        "Gain random cards — Gain {count} random {predicate} cards");
    await act(async () => {
      option!.click();
      await Promise.resolve();
    });
    const request = saveAction.mock.calls[0]?.[0];
    expect(request?.cardId).toBe(CARD_ID);
    expect(request?.slot).toBe(0);
    expect(request?.action.effectKind).toBe("gain-random-cards");
    expect(request?.action.templateId).toBe(13);
    act(() => root.unmount());
  });

  it("submits Any card for optional predicates and hides it for required predicates", async () => {
    const loaded = loadResult();
    loaded.encounters[0].actions[0] = {
      id: `${CARD_ID}:first`,
      label: "Purge anything",
      effectText: "Purge a chosen Character card",
      renderedEffectText: "Purge a chosen Character card",
      renderedEffectParts: [
        { kind: "text", text: "Purge a chosen " },
        { kind: "variable", placeholder: "{predicate}", variableName: "predicate", value: "Character", text: "Character" },
        { kind: "text", text: " card" },
      ],
      runtimeCardSelections: [],
      templateId: 4,
      template: "Purge a chosen {predicate} card",
      templateVariables: { predicate: "Character" },
      effectKind: "purge-selected",
      predicate: "character",
      count: 1,
    };
    const normalized = structuredClone(loaded);
    normalized.encounters[0].actions[0] = {
      ...normalized.encounters[0].actions[0],
      effectText: "Purge a chosen card",
      templateId: 3,
      template: "Purge a chosen card",
      templateVariables: {},
      renderedEffectText: "Purge a chosen card",
      renderedEffectParts: [{ kind: "text", text: "Purge a chosen card" }],
    };
    delete normalized.encounters[0].actions[0].predicate;
    const { cards: _cards, dreamsigns: _dreamsigns, ...normalizedData } = normalized;
    const { cards: _filteredCards, dreamsigns: _filteredDreamsigns, ...filteredData } = loaded;
    const saveAction = vi.fn((
      request: Parameters<ExplorationEditorClient["saveAction"]>[0],
    ) => Promise.resolve({
      clientRevision: request.clientRevision,
      data: structuredClone(request.action.templateId === 3 ? normalizedData : filteredData),
    }));
    const { container, root } = await renderLoaded(client({
      load: vi.fn().mockResolvedValue(loaded),
      saveAction,
    }));

    const optionalPredicate = container.querySelector<HTMLButtonElement>(
      "[aria-label='Card predicate']",
    );
    if (optionalPredicate === null) throw new Error("Optional predicate did not render");
    act(() => optionalPredicate.click());
    const anyCard = [...document.body.querySelectorAll<HTMLButtonElement>("[role='option']")]
      .find((entry) => entry.textContent === "Any card");
    expect(anyCard).toBeDefined();
    await act(async () => {
      anyCard?.click();
      await Promise.resolve();
    });
    expect(saveAction.mock.calls[0]?.[0].action).toMatchObject({
      predicate: "",
      templateId: 3,
    });
    expect(container.querySelector("[aria-label='Card predicate']")).not.toBeNull();

    const anyPredicate = container.querySelector<HTMLButtonElement>(
      "[aria-label='Card predicate']",
    );
    if (anyPredicate === null) throw new Error("Any card predicate did not remain visible");
    act(() => anyPredicate.click());
    const character = [...document.body.querySelectorAll<HTMLButtonElement>("[role='option']")]
      .find((entry) => entry.textContent === "Character");
    await act(async () => {
      character?.click();
      await Promise.resolve();
    });
    expect(saveAction.mock.calls[1]?.[0].action).toMatchObject({
      predicate: "character",
      templateId: 4,
    });

    act(() => root.unmount());

    const required = await renderLoaded(client());
    const requiredPredicate = required.container.querySelector<HTMLButtonElement>(
      "[aria-label='Card predicate']",
    );
    if (requiredPredicate === null) throw new Error("Required predicate did not render");
    act(() => requiredPredicate.click());
    expect([...document.body.querySelectorAll<HTMLElement>("[role='option']")]
      .some((entry) => entry.textContent === "Any card")).toBe(false);
    act(() => required.root.unmount());
  });
});
