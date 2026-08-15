// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { parseCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";
import ExplorationEditorApp from "./ExplorationEditorApp";
import type {
  ExplorationEditorAction,
  ExplorationEditorClient,
  ExplorationEditorEffectSchema,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";
import { testCardId, testDreamsignId, testExplorationActionId } from "../types/test-identities";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const REWARD_CARD_ID = "22222222-2222-4222-8222-222222222222";
const DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333";
const LAST_CARD_ID = "44444444-4444-4444-8444-444444444444";

const FIXED_SITE_SCHEMA = {
  kind: "add-fixed-site",
  label: "Synthetic fixed-site effect",
  canonicalMechanicId: "add-site",
  defaultSelectionPolicyId: "fixed",
  allowedSelectionPolicyIds: ["fixed"],
  fields: [
    {
      key: "siteType",
      label: "Synthetic site-type field",
      control: "site-type",
      defaultValue: "Shop",
      options: [
        { value: "Duplication", label: "Synthetic option one" },
        { value: "Purge", label: "Synthetic option two" },
        { value: "Shop", label: "Synthetic option three" },
        { value: "DreamsignBazaar", label: "Synthetic option four" },
        { value: "Transfiguration", label: "Synthetic option five" },
      ],
    },
  ],
} satisfies ExplorationEditorEffectSchema;

const SITE_TYPE_CHOOSER_SCHEMA = {
  kind: "choose-site-type",
  label: "Synthetic site chooser",
  canonicalMechanicId: "add-site",
  defaultSelectionPolicyId: "site-uniform",
  allowedSelectionPolicyIds: ["site-uniform"],
  requiresFollowup: true,
  fields: [
    {
      key: "offerCount",
      label: "Synthetic offer count",
      control: "number",
      defaultValue: 3,
      min: 3,
      max: 3,
    },
  ],
} satisfies ExplorationEditorEffectSchema;

const WAVE8_TAKE_SCHEMA = {
  kind: "take-transfigured-cards-and-gain-nightmares",
  label: "Synthetic transfigured chooser",
  canonicalMechanicId: "transfigured-card-chooser",
  defaultSelectionPolicyId: "card-fit",
  allowedSelectionPolicyIds: ["card-fit"],
  requiresFollowup: true,
  fields: [
    { key: "predicate", label: "Synthetic predicate", control: "predicate" },
    {
      key: "offerCount",
      label: "Synthetic offer count",
      control: "number",
      min: 4,
      max: 4,
    },
    {
      key: "transfiguration",
      label: "Synthetic transfiguration",
      control: "transfiguration",
    },
    {
      key: "nightmareCount",
      label: "Synthetic Nightmare count",
      control: "number",
      min: 1,
    },
  ],
} satisfies ExplorationEditorEffectSchema;

const COUNTED_FREE_PURCHASE_SCHEMA = {
  kind: "lose-half-essence-and-free-purchases",
  label: "Synthetic counted free purchases",
  canonicalMechanicId: "shop-purchase-modifier",
  fields: [
    {
      key: "count",
      label: "Synthetic free purchase count",
      control: "number",
      defaultValue: 3,
      min: 1,
    },
  ],
} satisfies ExplorationEditorEffectSchema;

const SOURCE_CARD: CardData = {
  id: testCardId(CARD_ID),
  name: parseCardName("Fixture Guide"),
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
  id: testCardId(REWARD_CARD_ID),
  name: parseCardName("Fixture Ally"),
  cardNumber: 84,
  imageNumber: 84,
};
const DREAMSIGN: Dreamsign = {
  id: testDreamsignId(DREAMSIGN_ID),
  name: "Bell",
  effectDescription: "At the start of battle, gain 1●.",
  imageName: "bell.png",
  imageAlt: "A small bell",
};

const SERVER_DATA: ExplorationEditorServerData = {
  encounters: [
    {
      cardId: testCardId(CARD_ID),
      cardName: "Fixture Guide",
      cardAbilityText: "▸Materialized: Gain 1●.",
      imageNumber: 42,
      prose: "A guide waits beside a starlit crossing.",
      actions: [
        {
          id: testExplorationActionId(`${CARD_ID}:first`),
          label: "Gather a company",
          effectText:
            "Choose one of 2 packs of 3 Character cards to add to your deck",
          renderedEffectText:
            "Choose one of 2 packs of 3 Character cards to add to your deck",
          renderedEffectParts: [
            { kind: "text", text: "Choose one of " },
            {
              kind: "variable",
              placeholder: "{pack_count}",
              variableName: "pack_count",
              value: 2,
              text: "2",
            },
            { kind: "text", text: " packs of " },
            {
              kind: "variable",
              placeholder: "{pack_size}",
              variableName: "pack_size",
              value: 3,
              text: "3",
            },
            { kind: "text", text: " " },
            {
              kind: "variable",
              placeholder: "{predicate}",
              variableName: "predicate",
              value: "Character",
              text: "Character",
            },
            { kind: "text", text: " cards to add to your deck" },
          ],
          runtimeCardSelections: [],
          effectKind: "choose-pack",
          predicate: "character",
          packCount: 2,
          packSize: 3,
        },
        {
          id: testExplorationActionId(`${CARD_ID}:second`),
          label: "Invite an ally",
          effectText: "Gain {offered_card}",
          renderedEffectText: "Gain Fixture Ally",
          renderedEffectParts: [
            { kind: "text", text: "Gain " },
            {
              kind: "card",
              placeholder: "{offered_card}",
              cardId: testCardId(REWARD_CARD_ID),
              cardName: "Fixture Ally",
            },
          ],
          runtimeCardSelections: [
            {
              placeholder: "{offered_card}",
              predicate: "Character",
              cardId: testCardId(REWARD_CARD_ID),
              cardName: "Fixture Ally",
              source: "offer_pool",
            },
          ],
          effectKind: "gain-offered-card",
          predicate: "character",
        },
      ],
    },
  ],
  effectSchemas: [
    {
      kind: "choose-pack",
      label: "Choose a pack",
      fields: [
        { key: "predicate", label: "Card predicate", control: "predicate" },
        { key: "packCount", label: "Pack count", control: "number", min: 1 },
        { key: "packSize", label: "Pack size", control: "number", min: 1 },
      ],
    },
    {
      kind: "purge-selected",
      label: "Purge selected cards",
      fields: [
        {
          key: "predicate",
          label: "Card predicate",
          control: "predicate",
          optional: true,
        },
      ],
    },
    {
      kind: "gain-card",
      label: "Gain card",
      fields: [{ key: "cardId", label: "Card", control: "card" }],
    },
    {
      kind: "gain-offered-card",
      label: "Gain offered card",
      fields: [
        { key: "predicate", label: "Card predicate", control: "predicate" },
      ],
    },
    {
      kind: "gain-random-cards",
      label: "Gain random cards",
      fields: [
        { key: "predicate", label: "Card predicate", control: "predicate" },
        { key: "count", label: "Count", control: "number", min: 1 },
      ],
    },
  ],
  predicates: [
    { value: "", label: "Any card" },
    { value: "character", label: "Character" },
  ],
  transfigurations: ["Empowered"],
  subtypes: ["Guide"],
};

function loadResult(): ExplorationEditorLoadResult {
  return {
    ...structuredClone(SERVER_DATA),
    cards: [structuredClone(SOURCE_CARD), structuredClone(REWARD_CARD)],
    dreamsigns: [structuredClone(DREAMSIGN)],
  };
}

function client(
  overrides: Partial<ExplorationEditorClient> = {},
): ExplorationEditorClient {
  return {
    load: vi.fn().mockResolvedValue(loadResult()),
    saveProse: vi.fn(),
    saveAction: vi.fn(),
    ...overrides,
  };
}

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  return { container, root: createRoot(container) };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  if (descriptor?.set === undefined)
    throw new Error("Missing textarea value setter");
  descriptor.set.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

async function renderLoaded(apiClient: ExplorationEditorClient) {
  const mounted = mount();
  await act(async () => {
    mounted.root.render(
      <CumulusRoot>
        <ExplorationEditorApp client={apiClient} />
      </CumulusRoot>,
    );
    await Promise.resolve();
  });
  return mounted;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  window.history.replaceState(null, "", "/exploration");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("ExplorationEditorApp", () => {
  it("renders the last TOML encounter first", async () => {
    const loaded = loadResult();
    loaded.encounters.push({
      ...structuredClone(loaded.encounters[0]),
      cardId: testCardId(LAST_CARD_ID),
      cardName: "Last Authored Encounter",
    });

    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
      }),
    );
    expect(
      [
        ...container.querySelectorAll<HTMLElement>(
          "[data-exploration-card-id]",
        ),
      ].map((row) => row.dataset.explorationCardId),
    ).toEqual([LAST_CARD_ID, CARD_ID]);
    act(() => root.unmount());
  });

  it("renders only encounters selected by the cards URL parameter", async () => {
    const loaded = loadResult();
    loaded.encounters.push({
      ...structuredClone(loaded.encounters[0]),
      cardId: testCardId(LAST_CARD_ID),
      cardName: "Last Authored Encounter",
    });
    window.history.replaceState(
      null,
      "",
      `/exploration?cards=${LAST_CARD_ID.toUpperCase()},missing-card`,
    );

    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
      }),
    );

    expect(
      [
        ...container.querySelectorAll<HTMLElement>(
          "[data-exploration-card-id]",
        ),
      ].map((row) => row.dataset.explorationCardId),
    ).toEqual([LAST_CARD_ID]);
    act(() => root.unmount());
  });

  it("renders source art, card information, editable copy, and typed controls", async () => {
    const { container, root } = await renderLoaded(client());
    expect(container.textContent).toContain("Fixture Guide");
    expect(container.textContent).toContain(CARD_ID);
    expect(container.textContent).toContain(
      "A guide waits beside a starlit crossing.",
    );
    expect(container.textContent).toContain("Gather a company");
    expect(container.textContent).toContain(
      "Choose one of 2 packs of 3 Character cards",
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/exploration/42.jpg",
    );
    const cardLink = container.querySelector<HTMLAnchorElement>(
      "a[aria-label='Open Fixture Guide exploration in a new tab']",
    );
    expect(cardLink?.getAttribute("href")).toBe(
      `/?goto=exploration&card=${CARD_ID}`,
    );
    expect(cardLink?.target).toBe("_blank");
    expect(cardLink?.rel).toBe("noopener noreferrer");
    expect(
      container.querySelector(
        `[data-testid='exploration-packCount-${CARD_ID}-0']`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-testid='exploration-packSize-${CARD_ID}-0']`,
      ),
    ).not.toBeNull();
    const runtimeCardName = container.querySelector(
      `[data-runtime-card-id='${REWARD_CARD_ID}']`,
    );
    expect(runtimeCardName?.textContent).toBe("Fixture Ally");
    expect(runtimeCardName?.querySelector("u")?.textContent).toBe(
      "Fixture Ally",
    );
    expect(
      runtimeCardName?.querySelector("[data-reveal-entity-type]"),
    ).toBeNull();
    expect(
      container.querySelector(
        "[data-runtime-card-placeholder='{offered_card}']",
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("{offered_card}");
    expect(
      container.querySelectorAll("[aria-label^='Effect for']"),
    ).toHaveLength(2);
    expect(
      container.querySelectorAll("[aria-label^='Template for']"),
    ).toHaveLength(0);
    act(() => root.unmount());
  });

  it("single-clicks into prose and commits the TOML-backed field", async () => {
    const saveProse = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveProse"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: {
            ...structuredClone(SERVER_DATA),
            encounters: [
              {
                ...structuredClone(SERVER_DATA.encounters[0]),
                prose: request.value,
              },
            ],
          },
        }),
    );
    const { container, root } = await renderLoaded(client({ saveProse }));
    act(() =>
      container
        .querySelector<HTMLElement>("[data-editor-field='prose']")!
        .click(),
    );
    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-editor-input-field='prose']",
    )!;
    act(() => setTextareaValue(textarea, "A newly written exploration scene."));
    await act(async () => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
      await Promise.resolve();
    });
    expect(saveProse).toHaveBeenCalledWith(
      expect.objectContaining({
        cardId: CARD_ID,
        value: "A newly written exploration scene.",
      }),
    );
    expect(container.textContent).toContain(
      "A newly written exploration scene.",
    );
    act(() => root.unmount());
  });

  it("saves the selected typed effect immediately", async () => {
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(client({ saveAction }));
    const trigger = container.querySelector<HTMLButtonElement>(
      "[aria-label='Effect for Gather a company']",
    )!;
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>("[role='option']"),
    ];
    expect(options.map((entry) => entry.textContent)).toEqual(
      expect.arrayContaining(["Gain random cards"]),
    );
    const option = options.find(
      (entry) => entry.textContent === "Gain random cards",
    );
    await act(async () => {
      option!.click();
      await Promise.resolve();
    });
    const request = saveAction.mock.calls[0]?.[0];
    expect(request?.cardId).toBe(CARD_ID);
    expect(request?.slot).toBe(0);
    expect(request?.action.effectKind).toBe("gain-random-cards");
    act(() => root.unmount());
  });

  it("submits Any card for optional predicates and hides it for required predicates", async () => {
    const loaded = loadResult();
    loaded.encounters[0].actions[0] = {
      id: testExplorationActionId(`${CARD_ID}:first`),
      label: "Purge anything",
      effectText: "Purge a chosen Character card",
      renderedEffectText: "Purge a chosen Character card",
      renderedEffectParts: [
        { kind: "text", text: "Purge a chosen " },
        {
          kind: "variable",
          placeholder: "{predicate}",
          variableName: "predicate",
          value: "Character",
          text: "Character",
        },
        { kind: "text", text: " card" },
      ],
      runtimeCardSelections: [],
      effectKind: "purge-selected",
      predicate: "character",
      count: 1,
    };
    const normalized = structuredClone(loaded);
    normalized.encounters[0].actions[0] = {
      ...normalized.encounters[0].actions[0],
      effectText: "Purge a chosen card",
      renderedEffectText: "Purge a chosen card",
      renderedEffectParts: [{ kind: "text", text: "Purge a chosen card" }],
    };
    delete normalized.encounters[0].actions[0].predicate;
    const {
      cards: _cards,
      dreamsigns: _dreamsigns,
      ...normalizedData
    } = normalized;
    const {
      cards: _filteredCards,
      dreamsigns: _filteredDreamsigns,
      ...filteredData
    } = loaded;
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(
            String(request.action.predicate ?? "") === ""
              ? normalizedData
              : filteredData,
          ),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );

    const optionalPredicate = container.querySelector<HTMLButtonElement>(
      "[aria-label='Card predicate']",
    );
    if (optionalPredicate === null)
      throw new Error("Optional predicate did not render");
    act(() => optionalPredicate.click());
    const anyCard = [
      ...document.body.querySelectorAll<HTMLButtonElement>("[role='option']"),
    ].find((entry) => entry.textContent === "Any card");
    expect(anyCard).toBeDefined();
    await act(async () => {
      anyCard?.click();
      await Promise.resolve();
    });
    expect(saveAction.mock.calls[0]?.[0].action).toMatchObject({
      predicate: "",
    });
    expect(
      container.querySelector("[aria-label='Card predicate']"),
    ).not.toBeNull();

    const anyPredicate = container.querySelector<HTMLButtonElement>(
      "[aria-label='Card predicate']",
    );
    if (anyPredicate === null)
      throw new Error("Any card predicate did not remain visible");
    act(() => anyPredicate.click());
    const character = [
      ...document.body.querySelectorAll<HTMLButtonElement>("[role='option']"),
    ].find((entry) => entry.textContent === "Character");
    await act(async () => {
      character?.click();
      await Promise.resolve();
    });
    expect(saveAction.mock.calls[1]?.[0].action).toMatchObject({
      predicate: "character",
    });

    act(() => root.unmount());

    const required = await renderLoaded(client());
    const requiredPredicate =
      required.container.querySelector<HTMLButtonElement>(
        "[aria-label='Card predicate']",
      );
    if (requiredPredicate === null)
      throw new Error("Required predicate did not render");
    act(() => requiredPredicate.click());
    expect(
      [...document.body.querySelectorAll<HTMLElement>("[role='option']")].some(
        (entry) => entry.textContent === "Any card",
      ),
    ).toBe(false);
    act(() => required.root.unmount());
  });

  it("edits the closed card-type field for random type changes", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push({
      kind: "change-random-card-type",
      label: "Change random card types",
      canonicalMechanicId: "change-entry-card-type",
      defaultSelectionPolicyId: "uniform",
      allowedSelectionPolicyIds: ["uniform"],
      fields: [
        {
          key: "count",
          label: "Count",
          control: "number",
          defaultValue: 2,
          min: 1,
        },
        {
          key: "cardType",
          label: "Card type",
          control: "card-type",
          defaultValue: "Character",
        },
      ],
    });
    loaded.encounters[0].actions[0] = {
      ...loaded.encounters[0].actions[0],
      effectKind: "change-random-card-type",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "uniform",
      count: 2,
      cardType: "Event",
      renderedEffectParts: [{ kind: "text", text: "Synthetic effect" }],
    };
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const field = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="cardType"]',
    );
    const trigger = field?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Card-type control did not render");
    }
    act(() => trigger.click());
    const inactiveOption = document.body.querySelector<HTMLButtonElement>(
      '[role="option"][aria-selected="false"]',
    );
    await act(async () => {
      inactiveOption?.click();
      await Promise.resolve();
    });

    expect(saveAction.mock.calls[0]?.[0].action).toMatchObject({
      effectKind: "change-random-card-type",
      cardType: "Character",
      count: 2,
    });
    act(() => root.unmount());
  });

  it("edits chosen and offered targets for selected card-type changes", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push({
      kind: "change-card-type-selected",
      label: "Change selected card type",
      canonicalMechanicId: "change-entry-card-type",
      defaultSelectionPolicyId: "deck-entry-centrality",
      allowedSelectionPolicyIds: ["deck-entry-centrality"],
      fields: [
        {
          key: "cardType",
          label: "Card type",
          control: "card-type",
          defaultValue: "Character",
        },
        {
          key: "deckTarget",
          label: "Deck target",
          control: "deck-target",
          defaultValue: "chosen",
        },
      ],
    });
    loaded.encounters[0].actions[0] = {
      ...loaded.encounters[0].actions[0],
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Event",
      deckTarget: "offered",
      renderedEffectParts: [{ kind: "text", text: "Synthetic effect" }],
    };
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(loaded),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );

    expect(
      container.querySelector('[data-exploration-field-control="cardType"]'),
    ).not.toBeNull();
    const target = container.querySelector<HTMLButtonElement>(
      '[aria-label="Deck target"]',
    );
    if (target === null) throw new Error("Deck-target control did not render");
    act(() => target.click());
    const chosen = [
      ...document.body.querySelectorAll<HTMLButtonElement>("[role='option']"),
    ].find((entry) => entry.textContent === "Player chooses");
    await act(async () => {
      chosen?.click();
      await Promise.resolve();
    });

    expect(saveAction.mock.calls[0]?.[0].action).toMatchObject({
      effectKind: "change-card-type-selected",
      cardType: "Event",
      deckTarget: "chosen",
    });
    act(() => root.unmount());
  });

  it("edits fixed site types through the schema-defined closed options", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(FIXED_SITE_SCHEMA));
    loaded.encounters[0].actions[0] = {
      id: testExplorationActionId(`${CARD_ID}:first`),
      label: "Synthetic fixed-site action",
      effectText: "Synthetic fixed-site effect",
      renderedEffectText: "Synthetic fixed-site effect",
      renderedEffectParts: [
        { kind: "text", text: "Synthetic fixed-site effect" },
      ],
      runtimeCardSelections: [],
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "DreamsignBazaar",
    };
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) => {
        const responseData = structuredClone(SERVER_DATA);
        responseData.effectSchemas.push(structuredClone(FIXED_SITE_SCHEMA));
        responseData.encounters[0].actions[0] = structuredClone(request.action);
        return Promise.resolve({
          clientRevision: request.clientRevision,
          data: responseData,
        });
      },
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const field = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="siteType"]',
    );
    const trigger = field?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Site-type control did not render");
    }
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    expect(options).toHaveLength(FIXED_SITE_SCHEMA.fields[0].options.length);
    expect(
      options.map((option) => option.getAttribute("aria-selected")),
    ).toEqual(["false", "false", "false", "true", "false"]);
    await act(async () => {
      options[0]?.click();
      await Promise.resolve();
    });

    expect(saveAction.mock.calls[0]?.[0].action).toMatchObject({
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Duplication",
    });

    const effectField = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="effectKind"]',
    );
    const effectTrigger =
      effectField?.querySelector<HTMLButtonElement>("button");
    if (effectTrigger === null || effectTrigger === undefined) {
      throw new Error("Effect-kind control did not render");
    }
    act(() => effectTrigger.click());
    const effectOptions = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    await act(async () => {
      effectOptions[1]?.click();
      await Promise.resolve();
    });
    const changedEffect = saveAction.mock.calls[1]?.[0].action;
    expect(changedEffect?.effectKind).toBe("purge-selected");
    expect(
      changedEffect === undefined ? [] : Object.keys(changedEffect),
    ).not.toContain("siteType");
    act(() => root.unmount());
  });

  it("defaults fixed-site effects and removes fields from the previous schema", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(FIXED_SITE_SCHEMA));
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const field = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="effectKind"]',
    );
    const trigger = field?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Effect-kind control did not render");
    }
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    const fixedSiteOption = options[options.length - 1];
    if (fixedSiteOption === undefined) {
      throw new Error("Fixed-site effect option did not render");
    }
    await act(async () => {
      fixedSiteOption.click();
      await Promise.resolve();
    });

    const action = saveAction.mock.calls[0]?.[0].action;
    expect(action).toMatchObject({
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Shop",
    });
    expect(action === undefined ? [] : Object.keys(action)).not.toEqual(
      expect.arrayContaining(["predicate", "packCount", "packSize"]),
    );
    act(() => root.unmount());
  });

  it("seeds the required paired followup when switching to the site chooser", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(SITE_TYPE_CHOOSER_SCHEMA));
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const field = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="effectKind"]',
    );
    const trigger = field?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Effect-kind control did not render");
    }
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    await act(async () => {
      options[options.length - 1]?.click();
      await Promise.resolve();
    });

    const action = saveAction.mock.calls[0]?.[0].action;
    expect(action).toMatchObject({
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    });
    expect(action?.followupTitle).toEqual(expect.any(String));
    expect(action?.followupSubtitle).toEqual(expect.any(String));
    expect(action?.followupTitle).not.toHaveLength(0);
    expect(action?.followupSubtitle).not.toHaveLength(0);
    expect(action === undefined ? [] : Object.keys(action)).not.toEqual(
      expect.arrayContaining(["predicate", "packCount", "packSize"]),
    );
    act(() => root.unmount());
  });

  it("authors every required Wave 8 field when switching effect kind", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(SITE_TYPE_CHOOSER_SCHEMA));
    loaded.effectSchemas.push(structuredClone(WAVE8_TAKE_SCHEMA));
    loaded.encounters[0].actions[0] = {
      ...loaded.encounters[0].actions[0],
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
      followupTitle: "Existing followup",
      followupSubtitle: "Existing instructions",
      predicate: undefined,
      packCount: undefined,
      packSize: undefined,
    };
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const trigger = container
      .querySelector<HTMLElement>(
        '[data-exploration-field-control="effectKind"]',
      )
      ?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Effect-kind control did not render");
    }
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    await act(async () => {
      options[options.length - 1]?.click();
      await Promise.resolve();
    });

    const wave8Action = saveAction.mock.calls[0]?.[0].action as
      ExplorationEditorAction | undefined;
    expect(wave8Action).toMatchObject({
      effectKind: "take-transfigured-cards-and-gain-nightmares",
      canonicalMechanicId: "transfigured-card-chooser",
      selectionPolicyId: "card-fit",
      predicate: "character",
      offerCount: 4,
      transfiguration: "Empowered",
      nightmareCount: 1,
    });
    expect(typeof wave8Action?.followupTitle).toBe("string");
    expect(typeof wave8Action?.followupSubtitle).toBe("string");
    act(() => root.unmount());
  });

  it("renders a locked offer count and paired followup controls for the site chooser", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(SITE_TYPE_CHOOSER_SCHEMA));
    loaded.encounters[0].actions[0] = {
      id: testExplorationActionId(`${CARD_ID}:first`),
      label: "Synthetic chooser",
      effectText: "Synthetic chooser effect",
      renderedEffectText: "Synthetic chooser effect",
      renderedEffectParts: [{ kind: "text", text: "Synthetic chooser effect" }],
      runtimeCardSelections: [],
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
      followupTitle: "Synthetic chooser followup",
      followupSubtitle: "Synthetic chooser instructions",
    };
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
      }),
    );
    const stepper = container.querySelector<HTMLElement>(
      `[data-testid="exploration-offerCount-${CARD_ID}-0"]`,
    );
    expect(stepper).not.toBeNull();
    expect(
      [...(stepper?.querySelectorAll("button") ?? [])].every(
        (button) => button.getAttribute("aria-disabled") === "true",
      ),
    ).toBe(true);
    expect(
      container.querySelector(
        '[data-exploration-field-control="siteTypeFollowup"]',
      ),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("defaults the counted free-purchase control when switching effects", async () => {
    const loaded = loadResult();
    loaded.effectSchemas.push(structuredClone(COUNTED_FREE_PURCHASE_SCHEMA));
    const saveAction = vi.fn(
      (request: Parameters<ExplorationEditorClient["saveAction"]>[0]) =>
        Promise.resolve({
          clientRevision: request.clientRevision,
          data: structuredClone(SERVER_DATA),
        }),
    );
    const { container, root } = await renderLoaded(
      client({
        load: vi.fn().mockResolvedValue(loaded),
        saveAction,
      }),
    );
    const field = container.querySelector<HTMLElement>(
      '[data-exploration-field-control="effectKind"]',
    );
    const trigger = field?.querySelector<HTMLButtonElement>("button");
    if (trigger === null || trigger === undefined) {
      throw new Error("Effect-kind control did not render");
    }
    act(() => trigger.click());
    const options = [
      ...document.body.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ];
    await act(async () => {
      options[options.length - 1]?.click();
      await Promise.resolve();
    });

    const action = saveAction.mock.calls[0]?.[0].action;
    expect(action).toMatchObject({
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
    });
    expect(action?.selectionPolicyId).toBeUndefined();
    expect(action === undefined ? [] : Object.keys(action)).not.toEqual(
      expect.arrayContaining(["predicate", "packCount", "packSize"]),
    );
    act(() => root.unmount());
  });
});
