// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { Dreamsign } from "../types/journey";
import ExplorationEditorApp from "./ExplorationEditorApp";
import type {
  ExplorationEditorClient,
  ExplorationEditorLoadResult,
  ExplorationEditorServerData,
} from "./exploration-editor-types";

const CARD_ID = "11111111-1111-4111-8111-111111111111";
const REWARD_CARD_ID = "22222222-2222-4222-8222-222222222222";
const DREAMSIGN_ID = "33333333-3333-4333-8333-333333333333";

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
      effectText: "Gain Fixture Ally",
      templateId: 10,
      template: "Gain {card_id}",
      templateVariables: {
        card_id: { id: REWARD_CARD_ID, display_name: "Fixture Ally" },
      },
      effectKind: "gain-card",
      cardId: REWARD_CARD_ID,
    }],
  }],
  templates: [
    { id: 9, text: "Gain a random {predicate} card" },
    { id: 10, text: "Gain {card_id}" },
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
    kind: "gain-card",
    label: "Gain card",
    templateIds: [10],
    fields: [{ key: "cardId", label: "Card", control: "card" }],
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
  it("renders source art, card information, editable copy, and typed controls", async () => {
    const { container, root } = await renderLoaded(client());
    expect(container.textContent).toContain("Fixture Guide");
    expect(container.textContent).toContain(CARD_ID);
    expect(container.textContent).toContain("A guide waits beside a starlit crossing.");
    expect(container.textContent).toContain("Gather a company");
    expect(container.textContent).toContain("Choose one of 2 packs of 3 Character cards");
    expect(container.querySelector("img")?.getAttribute("src"))
      .toBe("/api/editor/encounters/art/42");
    expect(container.querySelector(`[data-testid='exploration-packCount-${CARD_ID}-0']`))
      .not.toBeNull();
    expect(container.querySelector(`[data-testid='exploration-packSize-${CARD_ID}-0']`))
      .not.toBeNull();
    expect(container.querySelector(`[data-entity-reference-id='${REWARD_CARD_ID}']`))
      .not.toBeNull();
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
});
