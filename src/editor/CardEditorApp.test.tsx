// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CumulusRoot } from "../cumulus/CumulusRoot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import {
  parseCardId,
  parseCardName,
  parseCardSubtype,
  type CardId,
} from "../types/card-identity";
import { SIZE_PRESETS } from "./card-size";
import CardEditorApp from "./CardEditorApp";
import { DEFAULT_EDITOR_DISPLAY_STATE } from "./editor-url-state";
import type { EditorApiClient, EditorCardRecord } from "./types";
import {
  testCardId,
  testCardSubtype,
} from "../types/test-identities";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function makePreview(
  overrides: Omit<Partial<CardData>, "id" | "name"> & {
    id?: unknown;
    name?: unknown;
  } = {},
): CardData {
  const { id: overrideId, name: overrideName, ...rest } = overrides;
  if (overrideId !== undefined && typeof overrideId !== "string") {
    throw new Error("Synthetic card identity must be a string.");
  }
  return {
    id: testCardId("card-id-1"),
    name: parseCardName("Moonlit Envoy"),
    cardNumber: 12,
    cardType: "Character",
    subtype: testCardSubtype("Scout"),
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 12,
    artOwned: true,
    ...rest,
    ...(overrideId !== undefined ? { id: testCardId(overrideId) } : {}),
    ...(overrideName !== undefined ? { name: parseCardName(overrideName) } : {}),
  };
}

function makeEditorCard(
  overrides: Partial<EditorCardRecord> = {},
): EditorCardRecord {
  const preview = makePreview();

  return {
    id: preview.id,
    cardNumber: preview.cardNumber,
    cardType: preview.cardType,
    "energy-cost": 2,
    subtype: preview.subtype,
    name: preview.name,
    spark: 1,
    "rendered-text": preview.renderedText,
    "amplified-text": preview.amplifiedText ?? "",
    tags: [],
    tides: [],
    mtgName: "",
    source: {},
    preview,
    ...overrides,
  };
}

function makeApiClient(
  loadEditorCards: EditorApiClient["loadEditorCards"],
  saveEditorCardField: EditorApiClient["saveEditorCardField"] = vi.fn(),
  overrides: Partial<EditorApiClient> = {},
): EditorApiClient {
  return {
    loadEditorCards,
    saveEditorCardField,
    loadEditorTags: vi.fn().mockResolvedValue([]),
    saveEditorCardTags: vi.fn(),
    loadEditorTides: vi.fn().mockResolvedValue([]),
    saveEditorCardTides: vi.fn(),
    saveEditorCardArt: vi.fn(),
    saveEditorCardImageNumber: vi.fn(),
    saveEditorTagRegistry: vi.fn(),
    saveEditorTideRegistry: vi.fn(),
    ...overrides,
  };
}

function makeSaveTiming() {
  return {
    readMs: 1,
    patchMs: 1,
    refreshMs: 1,
    confirmMs: 1,
    totalMs: 4,
  };
}

function serverValidationError(
  message: string,
): Error & { code: string; status: number } {
  return Object.assign(new Error(message), {
    code: "INVALID_EDIT",
    status: 400,
  });
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
  return { container, root };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (valueDescriptor?.set === undefined) {
    throw new Error("Missing input value setter");
  }
  const setValue = valueDescriptor.set.bind(input);
  setValue(value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  if (valueDescriptor?.set === undefined) {
    throw new Error("Missing textarea value setter");
  }
  const setValue = valueDescriptor.set.bind(textarea);
  setValue(value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string): void {
  const valueDescriptor = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value",
  );
  if (valueDescriptor?.set === undefined) {
    throw new Error("Missing select value setter");
  }
  const setValue = valueDescriptor.set.bind(select);
  setValue(value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function pressKey(
  element: HTMLElement,
  key: string,
  options: KeyboardEventInit = {},
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    key,
    ...options,
  });
  element.dispatchEvent(event);
  return event;
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function editorCardIds(container: HTMLElement): CardId[] {
  return Array.from(container.querySelectorAll("[data-editor-card-id]")).map(
    (element) => {
      const value = element.getAttribute("data-editor-card-id");
      if (value === null) throw new Error("Editor card is missing its identity.");
      return parseCardId(value);
    },
  );
}

function expectedCardIds(...seeds: string[]): CardId[] {
  return seeds.map(testCardId);
}

async function mountLoadedApp(cards: EditorCardRecord[]): Promise<{
  container: HTMLDivElement;
  root: Root;
}> {
  const mounted = mount(
    <CardEditorApp apiClient={makeApiClient(() => Promise.resolve(cards))} />,
  );

  await act(async () => {
    await Promise.resolve();
  });

  return mounted;
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.history.pushState(null, "", "/editor");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("CardEditorApp", () => {
  it("renders a loading state while cards load", () => {
    const pendingLoad = deferred<EditorCardRecord[]>();
    const { container, root } = mount(
      <CardEditorApp apiClient={makeApiClient(() => pendingLoad.promise)} />,
    );

    expect(container.textContent).toContain("Loading source cards");
    expect(container.querySelector("main")?.getAttribute("aria-busy")).toBe(
      "true",
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders the title and visible-card count after a successful load", async () => {
    const cards = [
      makeEditorCard({ id: testCardId("card-id-1") }),
      makeEditorCard({ id: testCardId("card-id-2"), cardNumber: 13 }),
    ];
    const { container, root } = mount(
      <CardEditorApp apiClient={makeApiClient(() => Promise.resolve(cards))} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Card Editor");
    expect(container.textContent).toContain("2 / 2 cards");
    expect(container.querySelector("main")?.getAttribute("aria-busy")).toBe(
      "false",
    );

    act(() => {
      root.unmount();
    });
  });

  it("renders loaded editor cards through the shared read-only card grid", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("uuid-card-1"),
        cardType: "Character",
        subtype: testCardSubtype("Scout"),
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "uuid-card-1",
          cardType: "Character",
          subtype: testCardSubtype("Scout"),
          renderedText: "Draw a card.",
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("uuid-card-1")}"]`,
    );

    expect(editorCard).not.toBeNull();
    expect(editorCard?.querySelector("[data-card-text-scale]")).not.toBeNull();
    expect(
      editorCard?.querySelector('[data-editor-field="name"]')?.textContent,
    ).toContain("Moonlit Envoy");
    expect(
      editorCard?.querySelector('[data-editor-field="rendered-text"]')
        ?.textContent,
    ).toContain("Draw a card.");

    act(() => {
      root.unmount();
    });
  });

  it("warns on every card whose name or art is reused in the source catalog", async () => {
    window.history.pushState(null, "", "/cards?artedit=1");
    const sharedName = "Shared Name";
    const sharedImageNumber = 404;
    const cards = [
      makeEditorCard({
        id: testCardId("duplicate-both-1"),
        name: sharedName,
        preview: makePreview({
          id: "duplicate-both-1",
          name: sharedName,
          imageNumber: sharedImageNumber,
        }),
      }),
      makeEditorCard({
        id: testCardId("duplicate-name-2"),
        name: sharedName,
        preview: makePreview({
          id: "duplicate-name-2",
          name: sharedName,
          imageNumber: 405,
        }),
      }),
      makeEditorCard({
        id: testCardId("duplicate-art-2"),
        name: "Different Name",
        preview: makePreview({
          id: "duplicate-art-2",
          name: "Different Name",
          imageNumber: sharedImageNumber,
        }),
      }),
      makeEditorCard({
        id: testCardId("unique-card"),
        name: "Unique Name",
        preview: makePreview({
          id: "unique-card",
          name: "Unique Name",
          imageNumber: 406,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);

    const bothWarning = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("duplicate-both-1")}"] [data-editor-duplicate-warning="true"]`,
    );
    const nameWarning = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("duplicate-name-2")}"] [data-editor-duplicate-warning="true"]`,
    );
    const artWarning = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("duplicate-art-2")}"] [data-editor-duplicate-warning="true"]`,
    );

    expect(bothWarning?.getAttribute("data-editor-duplicate-name")).toBe(
      "true",
    );
    expect(bothWarning?.getAttribute("data-editor-duplicate-art")).toBe("true");
    expect(bothWarning?.getAttribute("aria-label")).toContain("Duplicate name");
    expect(bothWarning?.getAttribute("aria-label")).toContain("Duplicate art");
    expect(nameWarning?.getAttribute("data-editor-duplicate-name")).toBe(
      "true",
    );
    expect(nameWarning?.getAttribute("data-editor-duplicate-art")).toBe(
      "false",
    );
    expect(artWarning?.getAttribute("data-editor-duplicate-name")).toBe(
      "false",
    );
    expect(artWarning?.getAttribute("data-editor-duplicate-art")).toBe("true");
    expect(
      container.querySelector(
        `[data-editor-card-id="${testCardId("unique-card")}"] [data-editor-duplicate-warning="true"]`,
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps duplicate warnings when the matching card is filtered out", async () => {
    window.history.pushState(null, "", "/cards?q=Visible&artedit=1");
    const cards = [
      makeEditorCard({
        id: testCardId("visible-card"),
        name: "Visible Card",
        preview: makePreview({
          id: "visible-card",
          name: "Visible Card",
          imageNumber: 707,
        }),
      }),
      makeEditorCard({
        id: testCardId("hidden-card"),
        name: "Hidden Card",
        preview: makePreview({
          id: "hidden-card",
          name: "Hidden Card",
          imageNumber: 707,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);

    expect(editorCardIds(container)).toEqual(expectedCardIds("visible-card"));
    expect(
      container.querySelector(
        `[data-editor-card-id="${testCardId("visible-card")}"] [data-editor-duplicate-art="true"]`,
      ),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("keeps the desktop shell fixed and exposes narrow scroll-layout hooks", async () => {
    const { container, root } = await mountLoadedApp([
      makeEditorCard({ id: testCardId("card-id-1") }),
      makeEditorCard({ id: testCardId("card-id-2") }),
    ]);
    const shell = container.querySelector("main");
    const header = container.querySelector("header");
    const content = container.querySelector<HTMLElement>(
      ".card-editor-content",
    );
    const loadedContent = container.querySelector<HTMLElement>(
      ".card-editor-loaded-content",
    );
    const scrollRegion = container.querySelector<HTMLElement>(
      '[data-editor-scroll-region="cards"]',
    );

    expect(shell?.classList.contains("card-editor-shell")).toBe(true);
    expect(shell?.getAttribute("data-editor-layout")).toBe(
      "responsive-scroll-shell",
    );
    expect(shell?.style.height).toBe("100dvh");
    expect(shell?.style.overflow).toBe("hidden");
    expect(header?.classList.contains("card-editor-header")).toBe(true);
    expect(content).not.toBeNull();
    expect(loadedContent).not.toBeNull();
    expect(scrollRegion).not.toBeNull();
    expect(scrollRegion?.style.overflowY).toBe("auto");
    expect(scrollRegion?.style.overscrollBehavior).toBe("contain");
    expect(scrollRegion?.style.minHeight).toBe("0px");

    act(() => {
      root.unmount();
    });
  });

  it("keeps card type display-only in the editor card type line", async () => {
    const { container, root } = await mountLoadedApp([
      makeEditorCard({
        id: testCardId("event-card"),
        cardType: "Event",
        subtype: testCardSubtype("Omen"),
        source: { subtype: "Omen" },
        preview: makePreview({
          id: "event-card",
          cardType: "Event",
          subtype: testCardSubtype("Omen"),
          spark: null,
        }),
      }),
    ]);
    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("event-card")}"]`,
    );
    const typeLine = editorCard?.querySelector<HTMLElement>(
      '[data-testid="card-type-line"]',
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="subtype"]',
    );
    const typeSpan = subtypeField?.parentElement?.firstElementChild;

    expect(typeLine?.textContent).toBe("Event — Omen");
    expect(subtypeField?.textContent).toBe("Omen");
    expect(subtypeField?.textContent).not.toContain("Event");
    expect(typeSpan?.textContent).toBe("Event");
    expect(typeSpan?.hasAttribute("data-editor-field")).toBe(false);
    expect(
      editorCard?.querySelector('[data-editor-field="card-type"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("edits only the subtype segment of the type line and refreshes subtype options", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            cardType: "Event",
            subtype: parseCardSubtype(request.value),
            source: { subtype: parseCardSubtype(request.value) },
            preview: makePreview({
              id: request.id,
              cardType: "Event",
              subtype: parseCardSubtype(request.value),
              spark: null,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("event-card"),
                cardType: "Event",
                subtype: testCardSubtype("Omen"),
                source: { subtype: "Omen" },
                preview: makePreview({
                  id: "event-card",
                  cardType: "Event",
                  subtype: testCardSubtype("Omen"),
                  spark: null,
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("event-card")}"]`,
    );
    const cardTypeText = editorCard?.querySelector<HTMLElement>(
      '[data-editor-type-line-card-type="true"]',
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="subtype"]',
    );
    if (
      editorCard === null ||
      cardTypeText === null ||
      cardTypeText === undefined ||
      subtypeField === null ||
      subtypeField === undefined
    ) {
      throw new Error("Missing editable type line");
    }

    act(() => {
      cardTypeText.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(
      container.querySelector('[data-editor-input-field="subtype"]'),
    ).toBeNull();

    act(() => {
      subtypeField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="subtype"]',
    );
    if (input === null) {
      throw new Error("Missing subtype input");
    }

    await act(async () => {
      setInputValue(input, "Vision");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("event-card"),
      field: "subtype",
      value: "Vision",
    });
    expect(cardTypeText.textContent).toBe("Event");
    expect(subtypeField.textContent).toContain("Vision");

    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    expect(
      Array.from(subtypeSelect?.options ?? []).map((option) => option.value),
    ).toEqual(["", "Vision"]);

    act(() => {
      root.unmount();
    });
  });

  it("saves blank event subtypes without an add-subtype placeholder", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            cardType: "Event",
            subtype: parseCardSubtype(request.value),
            source: { subtype: parseCardSubtype(request.value) },
            preview: makePreview({
              id: request.id,
              cardType: "Event",
              subtype: parseCardSubtype(request.value),
              spark: null,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("event-card"),
                cardType: "Event",
                subtype: testCardSubtype("Omen"),
                source: { subtype: "Omen" },
                preview: makePreview({
                  id: "event-card",
                  cardType: "Event",
                  subtype: testCardSubtype("Omen"),
                  spark: null,
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("event-card")}"]`,
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="subtype"]',
    );
    if (
      editorCard === null ||
      subtypeField === null ||
      subtypeField === undefined
    ) {
      throw new Error("Missing subtype field");
    }

    act(() => {
      subtypeField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="subtype"]',
    );
    if (input === null) {
      throw new Error("Missing subtype input");
    }

    await act(async () => {
      setInputValue(input, "");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("event-card"),
      field: "subtype",
      value: "",
    });
    expect(
      editorCard.querySelector('[data-editor-type-line-card-type="true"]')
        ?.textContent,
    ).toBe("Event");
    expect(
      editorCard.querySelector('[data-editor-subtype-placeholder="true"]'),
    ).toBeNull();
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    expect(
      Array.from(subtypeSelect?.options ?? []).map((option) => option.value),
    ).toEqual([""]);

    act(() => {
      root.unmount();
    });
  });

  it("saves whitespace-only subtypes verbatim without a placeholder", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            cardType: "Event",
            subtype: parseCardSubtype(request.value),
            source: { subtype: parseCardSubtype(request.value) },
            preview: makePreview({
              id: request.id,
              cardType: "Event",
              subtype: parseCardSubtype(request.value),
              spark: null,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("event-card"),
                cardType: "Event",
                subtype: testCardSubtype("Omen"),
                source: { subtype: "Omen" },
                preview: makePreview({
                  id: "event-card",
                  cardType: "Event",
                  subtype: testCardSubtype("Omen"),
                  spark: null,
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("event-card")}"]`,
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="subtype"]',
    );
    if (
      editorCard === null ||
      subtypeField === null ||
      subtypeField === undefined
    ) {
      throw new Error("Missing subtype field");
    }

    act(() => {
      subtypeField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="subtype"]',
    );
    if (input === null) {
      throw new Error("Missing subtype input");
    }

    await act(async () => {
      setInputValue(input, "   ");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("event-card"),
      field: "subtype",
      value: "   ",
    });
    expect(
      editorCard.querySelector('[data-editor-type-line-card-type="true"]')
        ?.textContent,
    ).toBe("Event");
    expect(
      editorCard.querySelector('[data-editor-subtype-placeholder="true"]'),
    ).toBeNull();
    expect(subtypeField.textContent).not.toContain("   ");
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    expect(
      Array.from(subtypeSelect?.options ?? []).map((option) => option.value),
    ).toEqual([""]);

    act(() => {
      root.unmount();
    });
  });

  it("saves subtype edits without trimming surrounding whitespace", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            cardType: "Event",
            subtype: parseCardSubtype(request.value),
            source: { subtype: parseCardSubtype(request.value) },
            preview: makePreview({
              id: request.id,
              cardType: "Event",
              subtype: parseCardSubtype(request.value),
              spark: null,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("event-card"),
                cardType: "Event",
                subtype: testCardSubtype("Omen"),
                source: { subtype: "Omen" },
                preview: makePreview({
                  id: "event-card",
                  cardType: "Event",
                  subtype: testCardSubtype("Omen"),
                  spark: null,
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("event-card")}"]`,
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="subtype"]',
    );
    if (
      editorCard === null ||
      subtypeField === null ||
      subtypeField === undefined
    ) {
      throw new Error("Missing subtype field");
    }

    act(() => {
      subtypeField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="subtype"]',
    );
    if (input === null) {
      throw new Error("Missing subtype input");
    }

    await act(async () => {
      setInputValue(input, "  Scout  ");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("event-card"),
      field: "subtype",
      value: "  Scout  ",
    });

    act(() => {
      root.unmount();
    });
  });

  it.each([
    { cardId: testCardId("character-blank-subtype"), initialSubtype: "" },
  ])(
    "renders no subtype affordance for blank Character subtype '$initialSubtype'",
    async ({ cardId, initialSubtype }) => {
      const { container, root } = mount(
        <CardEditorApp
          apiClient={makeApiClient(() =>
            Promise.resolve([
              makeEditorCard({
                id: cardId,
                cardType: "Character",
                subtype: parseCardSubtype(initialSubtype),
                source: { subtype: parseCardSubtype(initialSubtype) },
                preview: makePreview({
                  id: cardId,
                  cardType: "Character",
                  subtype: parseCardSubtype(initialSubtype),
                }),
              }),
            ]),
          )}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });

      const editorCard = container.querySelector<HTMLElement>(
        `[data-editor-card-id="${cardId}"]`,
      );
      if (editorCard === null) {
        throw new Error("Missing editor card");
      }

      // A blank-subtype character shows no subtype text, no editable subtype
      // field, and no add-subtype placeholder chip.
      expect(
        editorCard.querySelector('[data-editor-field="subtype"]'),
      ).toBeNull();
      expect(
        editorCard.querySelector('[data-editor-subtype-placeholder="true"]'),
      ).toBeNull();

      act(() => {
        root.unmount();
      });
    },
  );

  it("updates editor grid sizing from the size control", async () => {
    const { container, root } = await mountLoadedApp([makeEditorCard()]);
    const mediumButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Medium",
    );

    if (mediumButton === undefined) {
      throw new Error("Missing medium size button");
    }

    // The grid starts at the default size preset.
    const startGrid = container.querySelector<HTMLElement>(
      `[data-editor-grid-size="${DEFAULT_EDITOR_DISPLAY_STATE.size}"]`,
    );
    expect(startGrid).not.toBeNull();

    act(() => {
      mediumButton.click();
    });

    // The size control switches the grid to the chosen preset and re-tiles the
    // cards at that preset's width.
    const grid = container.querySelector<HTMLElement>(
      '[data-editor-grid-size="medium"]',
    );
    expect(grid).not.toBeNull();
    expect(
      grid?.querySelector<HTMLElement>("[data-editor-card-item]")?.style.width,
    ).toBe(SIZE_PRESETS.medium.cardWidth);

    act(() => {
      root.unmount();
    });
  });

  it("saves edited card names with Enter through the editor API", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            name: String(request.value),
            preview: makePreview({
              id: request.id,
              name: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: {
            readMs: 1,
            patchMs: 1,
            refreshMs: 1,
            confirmMs: 1,
            totalMs: 4,
          },
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }
    expect(document.activeElement).toBe(input);

    act(() => {
      setInputValue(input, "Renamed Envoy");
    });
    expect(input.value).toBe("Renamed Envoy");

    await act(async () => {
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    const savedRequest = saveEditorCardField.mock.calls[0]?.[0];
    expect(savedRequest).toMatchObject({
      id: testCardId("card-id-1"),
      field: "name",
      value: "Renamed Envoy",
    });
    expect(savedRequest?.clientRevision).toEqual(expect.any(Number));
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).toContain("Renamed Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("saves card names from the art editor above the image number control", async () => {
    window.history.pushState(null, "", "/editor?artedit=1");
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            name: String(request.value),
            preview: makePreview({
              id: request.id,
              name: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const cardButton =
      editorCard?.querySelector<HTMLElement>('[role="button"]');
    if (cardButton === null || cardButton === undefined) {
      throw new Error("Missing art-edit card button");
    }

    act(() => {
      cardButton.click();
    });

    const nameInput = container.querySelector<HTMLInputElement>(
      '[data-editor-focused-field="name"]',
    );
    const imageNumberInput = container.querySelector<HTMLInputElement>(
      '[data-editor-focused-image-number="true"]',
    );
    if (nameInput === null || imageNumberInput === null) {
      throw new Error("Missing focused editor inputs");
    }

    expect(
      nameInput.compareDocumentPosition(imageNumberInput) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
    expect(nameInput.value).toBe("Moonlit Envoy");

    await act(async () => {
      setInputValue(nameInput, "Renamed Envoy");
      nameInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "name",
      value: "Renamed Envoy",
    });
    expect(
      container.querySelector('[data-editor-focused-status="name"]')
        ?.textContent,
    ).toContain("Saved");
    expect(container.querySelector("h2")?.textContent).toBe("Renamed Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("hides per-card tide editing from the focused editor for a RON source", async () => {
    window.history.pushState(null, "", "/editor?artedit=1&source=cards.ron");
    const { container, root } = await mountLoadedApp([
      makeEditorCard({ id: testCardId("card-id-1") }),
    ]);
    const cardButton = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [role="button"]`,
    );
    if (cardButton === null) {
      throw new Error("Missing art-edit card button");
    }

    act(() => {
      cardButton.click();
    });

    expect(
      Array.from(container.querySelectorAll("button")).some(
        (button) => button.textContent?.trim() === "Tide",
      ),
    ).toBe(false);

    act(() => {
      root.unmount();
    });
  });

  it("keeps a newly saved art image when a later crop save returns an older card snapshot", async () => {
    window.history.pushState(null, "", "/editor?artedit=1");
    const imageSave =
      deferred<
        Awaited<ReturnType<EditorApiClient["saveEditorCardImageNumber"]>>
      >();
    const artSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardArt"]>>>();
    const originalCard = makeEditorCard({
      id: testCardId("card-id-1"),
      source: { "image-number": 12 },
      preview: makePreview({ id: "card-id-1", imageNumber: 12 }),
    });
    const saveEditorCardImageNumber = vi
      .fn<EditorApiClient["saveEditorCardImageNumber"]>()
      .mockReturnValue(imageSave.promise);
    const saveEditorCardArt = vi
      .fn<EditorApiClient["saveEditorCardArt"]>()
      .mockReturnValue(artSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([originalCard]),
          vi.fn(),
          {
            saveEditorCardImageNumber,
            saveEditorCardArt,
          },
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const cardButton =
      editorCard?.querySelector<HTMLElement>('[role="button"]');
    if (
      editorCard === null ||
      cardButton === null ||
      cardButton === undefined
    ) {
      throw new Error("Missing art-edit card");
    }

    act(() => {
      cardButton.click();
    });

    const imageNumberInput = container.querySelector<HTMLInputElement>(
      '[data-editor-focused-image-number="true"]',
    );
    const panRightButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Pan right"]',
    );
    if (imageNumberInput === null || panRightButton === null) {
      throw new Error("Missing focused editor controls");
    }

    act(() => {
      setInputValue(imageNumberInput, "99");
      imageNumberInput.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      panRightButton.click();
    });

    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 450);
      });
    });

    expect(saveEditorCardImageNumber).toHaveBeenCalledWith({
      id: testCardId("card-id-1"),
      imageNumber: 99,
    });
    const artSaveRequest = saveEditorCardArt.mock.calls[0]?.[0];
    expect(artSaveRequest?.id).toBe(testCardId("card-id-1"));
    expect(typeof artSaveRequest?.art.x).toBe("number");

    await act(async () => {
      imageSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          source: { "image-number": 99 },
          preview: makePreview({ id: "card-id-1", imageNumber: 99 }),
        }),
        timing: makeSaveTiming(),
      });
      await flushAsyncWork();
    });
    expect(
      editorCard
        .querySelector<HTMLImageElement>('img[src*="/cards/"]')
        ?.getAttribute("src"),
    ).toBe("/cards/99.webp");

    await act(async () => {
      artSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          source: {
            "image-number": 12,
            art: { x: 0.1, y: 0, scale: 1.17 },
          },
          preview: makePreview({
            id: "card-id-1",
            imageNumber: 12,
            art: { x: 0.1, y: 0, scale: 1.17 },
          }),
        }),
        timing: makeSaveTiming(),
      });
      await flushAsyncWork();
    });

    expect(
      editorCard
        .querySelector<HTMLImageElement>('img[src*="/cards/"]')
        ?.getAttribute("src"),
    ).toBe("/cards/99.webp");

    act(() => {
      root.unmount();
    });
  });

  it("shows the source MTG name on hover while art-edit mode is active", async () => {
    window.history.pushState(null, "", "/editor?artedit=1");
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(() =>
          Promise.resolve([
            makeEditorCard({
              id: testCardId("card-id-1"),
              mtgName: "Dauthi Horror",
            }),
          ]),
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(document.body.textContent).not.toContain("MTG: Dauthi Horror");
    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    if (editorCard === null) {
      throw new Error("Missing art-mode editor card");
    }

    act(() => {
      editorCard.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(document.body.textContent).toContain("MTG: Dauthi Horror");

    act(() => {
      editorCard.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });

    expect(document.body.textContent).not.toContain("MTG: Dauthi Horror");

    act(() => {
      root.unmount();
    });
  });

  it("discards name edits with Escape and saves them on blur", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            name: String(request.value),
            preview: makePreview({
              id: request.id,
              name: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    // Escape discards the draft without writing.
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const escapeInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (escapeInput === null) {
      throw new Error("Missing name input");
    }
    act(() => {
      setInputValue(escapeInput, "Draft Name");
      pressKey(escapeInput, "Escape");
    });

    expect(
      container.querySelector('[data-editor-input-field="name"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Moonlit Envoy");
    expect(container.textContent).not.toContain("Draft Name");
    expect(saveEditorCardField).not.toHaveBeenCalled();

    // Blur (click away) commits the current value.
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const blurInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (blurInput === null) {
      throw new Error("Missing reopened name input");
    }
    act(() => {
      setInputValue(blurInput, "Blurred Name");
    });
    await act(async () => {
      // React delegates onBlur to the bubbling focusout event.
      blurInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "name",
      value: "Blurred Name",
    });
    expect(container.textContent).toContain("Blurred Name");

    act(() => {
      root.unmount();
    });
  });

  it("keeps blank name validation editable until Escape cancels it", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>();
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(input, "");
      pressKey(input, "Enter");
    });

    const invalidInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    expect(invalidInput).not.toBeNull();
    expect(invalidInput?.value).toBe("");
    expect(document.activeElement).toBe(invalidInput);
    expect(nameField.textContent).toContain("Name cannot be blank.");
    expect(saveEditorCardField).not.toHaveBeenCalled();

    act(() => {
      if (invalidInput === null) {
        throw new Error("Missing invalid name input");
      }
      pressKey(invalidInput, "Escape");
    });

    expect(
      container.querySelector('[data-editor-input-field="name"]'),
    ).toBeNull();
    expect(nameField.textContent).toContain("Moonlit Envoy");
    expect(nameField.textContent).not.toContain("Name cannot be blank.");
    expect(saveEditorCardField).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("saves a corrected name after inline validation fails", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            name: String(request.value),
            preview: makePreview({
              id: request.id,
              name: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(input, "");
      pressKey(input, "Enter");
    });

    const invalidInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (invalidInput === null) {
      throw new Error("Missing invalid name input");
    }

    await act(async () => {
      setInputValue(invalidInput, "Corrected Envoy");
      pressKey(invalidInput, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "name",
      value: "Corrected Envoy",
    });
    expect(nameField.textContent).toContain("Saved");
    expect(nameField.textContent).toContain("Corrected Envoy");
    expect(nameField.textContent).not.toContain("Name cannot be blank.");

    act(() => {
      root.unmount();
    });
  });

  it("auto-clears the transient Saved indicator after a successful save", async () => {
    vi.useFakeTimers();
    try {
      const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
        (request) =>
          Promise.resolve({
            card: makeEditorCard({
              id: request.id,
              name: String(request.value),
              preview: makePreview({
                id: request.id,
                name: String(request.value),
              }),
            }),
            clientRevision: request.clientRevision,
            timing: makeSaveTiming(),
          }),
      );
      const { container, root } = mount(
        <CardEditorApp
          apiClient={makeApiClient(
            () =>
              Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
            saveEditorCardField,
          )}
        />,
      );

      await act(async () => {
        await Promise.resolve();
      });

      const nameField = container.querySelector<HTMLElement>(
        `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
      );
      if (nameField === null) {
        throw new Error("Missing name field");
      }

      act(() => {
        nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      });

      const input = container.querySelector<HTMLInputElement>(
        '[data-editor-input-field="name"]',
      );
      if (input === null) {
        throw new Error("Missing name input");
      }

      await act(async () => {
        setInputValue(input, "Renamed Envoy");
        pressKey(input, "Enter");
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(nameField.textContent).toContain("Saved");

      act(() => {
        vi.advanceTimersByTime(1800);
      });

      expect(nameField.textContent).not.toContain("Saved");
      expect(nameField.textContent).toContain("Renamed Envoy");

      act(() => {
        root.unmount();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("saves variable and integer energy costs through the UUID editor API", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            "energy-cost": request.value as string | number,
            preview: makePreview({
              id: request.id,
              energyCost: request.value === "*" ? null : Number(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const energyField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="energy-cost"]`,
    );
    if (energyField === null) {
      throw new Error("Missing energy field");
    }

    act(() => {
      energyField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const variableInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="energy-cost"]',
    );
    if (variableInput === null) {
      throw new Error("Missing energy input");
    }

    await act(async () => {
      setInputValue(variableInput, "X");
      pressKey(variableInput, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "energy-cost",
      value: "*",
    });
    expect(energyField.textContent).toContain("X");
    expect(energyField.textContent).toContain("Saved");

    act(() => {
      energyField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const integerInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="energy-cost"]',
    );
    if (integerInput === null) {
      throw new Error("Missing second energy input");
    }

    await act(async () => {
      setInputValue(integerInput, "4");
      pressKey(integerInput, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[1]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "energy-cost",
      value: 4,
    });
    expect(energyField.textContent).toContain("4");

    act(() => {
      root.unmount();
    });
  });

  it("shows the pending energy-cost value optimistically before save confirmation", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const energyField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="energy-cost"]`,
    );
    if (energyField === null) {
      throw new Error("Missing energy field");
    }

    act(() => {
      energyField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="energy-cost"]',
    );
    if (input === null) {
      throw new Error("Missing energy input");
    }

    act(() => {
      setInputValue(input, "5");
      pressKey(input, "Enter");
    });

    expect(energyField.textContent).toContain("5");
    expect(energyField.textContent).toContain("Saving...");

    act(() => {
      root.unmount();
    });
  });

  it("shows validation feedback for invalid energy costs without saving", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>();
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const energyField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="energy-cost"]`,
    );
    if (energyField === null) {
      throw new Error("Missing energy field");
    }

    act(() => {
      energyField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="energy-cost"]',
    );
    if (input === null) {
      throw new Error("Missing energy input");
    }

    act(() => {
      setInputValue(input, "1.5");
      pressKey(input, "Enter");
    });

    expect(saveEditorCardField).not.toHaveBeenCalled();
    expect(energyField.textContent).toContain(
      "Enter a non-negative whole number or X.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-editor-input-field="energy-cost"]',
      )?.value,
    ).toBe("1.5");

    act(() => {
      root.unmount();
    });
  });

  it("saves blank spark values and renders the confirmed no-spark preview", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            spark: "",
            preview: makePreview({
              id: request.id,
              spark: null,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const sparkField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="spark"]',
    );
    if (
      editorCard === null ||
      sparkField === null ||
      sparkField === undefined
    ) {
      throw new Error("Missing spark field");
    }

    act(() => {
      sparkField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="spark"]',
    );
    if (input === null) {
      throw new Error("Missing spark input");
    }

    await act(async () => {
      setInputValue(input, "");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "spark",
      value: "",
    });
    expect(editorCard.querySelector('[data-card-stat="spark"]')).toBeNull();
    expect(
      editorCard.querySelector('[data-editor-spark-placeholder="true"]'),
    ).toBeNull();
    expect(sparkField.textContent).toContain("Saved");

    act(() => {
      root.unmount();
    });
  });

  it("shows pending blank spark saves without a pip or placeholder", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const sparkField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="spark"]',
    );
    if (
      editorCard === null ||
      sparkField === null ||
      sparkField === undefined
    ) {
      throw new Error("Missing spark field");
    }

    act(() => {
      sparkField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="spark"]',
    );
    if (input === null) {
      throw new Error("Missing spark input");
    }

    act(() => {
      setInputValue(input, "");
      pressKey(input, "Enter");
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "spark",
      value: "",
    });
    expect(sparkField.textContent).toContain("Saving...");
    expect(editorCard.querySelector('[data-card-stat="spark"]')).toBeNull();
    expect(
      editorCard.querySelector('[data-editor-spark-placeholder="true"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("renders an X spark pip for variable spark, matching the card renderer", async () => {
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(() =>
          Promise.resolve([
            makeEditorCard({
              id: testCardId("card-id-1"),
              spark: "*",
              preview: makePreview({
                id: "card-id-1",
                spark: null,
                sparkVariable: true,
              }),
            }),
          ]),
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    if (editorCard === null) {
      throw new Error("Missing editor card");
    }

    // Variable spark renders a single `X` orb, matching how CardView falls back
    // to an `X` orb for a variable cost.
    const sparkOrb = editorCard.querySelector('[data-card-stat="spark"]');
    expect(sparkOrb).not.toBeNull();
    expect(sparkOrb?.textContent).toContain("X");

    act(() => {
      root.unmount();
    });
  });

  it("saves integer spark values and renders the confirmed spark pip", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            spark: request.value as number,
            preview: makePreview({
              id: request.id,
              spark: Number(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("card-id-1"),
                spark: 2,
                preview: makePreview({ id: "card-id-1", spark: 2 }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const sparkField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="spark"]',
    );
    if (
      editorCard === null ||
      sparkField === null ||
      sparkField === undefined
    ) {
      throw new Error("Missing spark field");
    }

    act(() => {
      sparkField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="spark"]',
    );
    if (input === null) {
      throw new Error("Missing spark input");
    }

    await act(async () => {
      setInputValue(input, "3");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "spark",
      value: 3,
    });
    expect(
      editorCard.querySelector('[data-card-stat="spark"]')?.textContent,
    ).toContain("3");
    expect(sparkField.textContent).toContain("Saved");

    act(() => {
      root.unmount();
    });
  });

  it("saves variable spark from a numeric pip and shows the X pip to match the renderer", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            spark: "*",
            preview: makePreview({
              id: request.id,
              spark: null,
              sparkVariable: true,
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("card-id-1"),
                spark: 2,
                preview: makePreview({ id: "card-id-1", spark: 2 }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const sparkField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="spark"]',
    );
    if (
      editorCard === null ||
      sparkField === null ||
      sparkField === undefined
    ) {
      throw new Error("Missing spark field");
    }
    // Editing opens from the existing numeric pip and shows X for variable.
    expect(
      editorCard.querySelector('[data-card-stat="spark"]')?.textContent,
    ).toContain("2");

    act(() => {
      sparkField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="spark"]',
    );
    if (input === null) {
      throw new Error("Missing spark input");
    }

    await act(async () => {
      setInputValue(input, "X");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("card-id-1"),
      field: "spark",
      value: "*",
    });
    // Variable spark renders a single `X` orb, just like the shared renderer.
    expect(
      editorCard.querySelector('[data-card-stat="spark"]')?.textContent,
    ).toContain("X");
    expect(sparkField.textContent).toContain("Saved");

    act(() => {
      root.unmount();
    });
  });

  it("shows validation feedback for invalid spark values without saving", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>();
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const sparkField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="spark"]`,
    );
    if (sparkField === null) {
      throw new Error("Missing spark field");
    }

    act(() => {
      sparkField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="spark"]',
    );
    if (input === null) {
      throw new Error("Missing spark input");
    }

    act(() => {
      setInputValue(input, "abc");
      pressKey(input, "Enter");
    });

    expect(saveEditorCardField).not.toHaveBeenCalled();
    expect(sparkField.textContent).toContain(
      "Enter a non-negative whole number or X.",
    );
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-editor-input-field="spark"]',
      )?.value,
    ).toBe("abc");

    act(() => {
      root.unmount();
    });
  });

  it("saves multiline rules text with Enter and renders the confirmed preview", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            "rendered-text": String(request.value),
            preview: makePreview({
              id: request.id,
              renderedText: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("card-id-1"),
                "rendered-text": "Draw a card.",
                preview: makePreview({
                  id: "card-id-1",
                  renderedText: "Draw a card.",
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"]`,
    );
    const rulesField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="rendered-text"]',
    );
    if (
      editorCard === null ||
      rulesField === null ||
      rulesField === undefined
    ) {
      throw new Error("Missing rules text field");
    }

    act(() => {
      rulesField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-editor-input-field="rendered-text"]',
    );
    if (textarea === null) {
      throw new Error("Missing rules text textarea");
    }
    expect(textarea.value).toBe("Draw a card.");

    const shiftEnterEvent = pressKey(textarea, "Enter", { shiftKey: true });
    expect(shiftEnterEvent.defaultPrevented).toBe(false);
    expect(saveEditorCardField).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-editor-input-field="rendered-text"]'),
    ).not.toBeNull();

    const renderedText = "Gain ●1.\n\nDraw a card.";
    await act(async () => {
      setTextareaValue(textarea, renderedText);
      pressKey(textarea, "Enter");
      await flushAsyncWork();
    });

    const savedRequest = saveEditorCardField.mock.calls[0]?.[0];
    expect(savedRequest).toMatchObject({
      id: testCardId("card-id-1"),
      field: "rendered-text",
      value: renderedText,
    });
    expect(savedRequest?.clientRevision).toEqual(expect.any(Number));
    expect(
      container.querySelector('[data-editor-input-field="rendered-text"]'),
    ).toBeNull();
    expect(rulesField.textContent).toContain("Saved");
    expect(
      editorCard.querySelectorAll("[data-rules-text-paragraph]").length,
    ).toBe(2);
    expect(editorCard.textContent).toContain("Gain ");
    expect(editorCard.textContent).toContain("1.");
    expect(editorCard.textContent).toContain("Draw a card.");

    act(() => {
      root.unmount();
    });
  });

  it("filters, previews, and edits canonical amplified text on card faces", async () => {
    window.history.pushState(null, "", "/editor?amplified=1&amplifiedonly=1");
    const amplifiedText = "Draw two cards.";
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>(
      (request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            "amplified-text": String(request.value),
            preview: makePreview({
              id: request.id,
              renderedText: "Draw a card.",
              amplifiedText: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
    );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({ id: testCardId("base-only-card") }),
              makeEditorCard({
                id: testCardId("amplified-card"),
                "amplified-text": amplifiedText,
                preview: makePreview({
                  id: "amplified-card",
                  renderedText: "Draw a card.",
                  amplifiedText,
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(editorCardIds(container)).toEqual(
      expectedCardIds("amplified-card"),
    );
    const editorCard = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("amplified-card")}"]`,
    );
    const amplifiedField = editorCard?.querySelector<HTMLElement>(
      '[data-editor-field="amplified-text"]',
    );
    expect(editorCard?.getAttribute("data-editor-rules-variant")).toBe(
      "amplified",
    );
    expect(amplifiedField?.textContent).toContain(amplifiedText);
    const originalCaption = editorCard?.querySelector<HTMLElement>(
      '[data-editor-original-rules-text="true"]',
    );
    expect(originalCaption?.textContent).toContain("Original:");
    expect(originalCaption?.textContent).toContain("Draw a card.");
    if (amplifiedField === null || amplifiedField === undefined) {
      throw new Error("Missing amplified text field");
    }

    act(() => {
      amplifiedField.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
    });
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-editor-input-field="amplified-text"]',
    );
    if (textarea === null) {
      throw new Error("Missing amplified text textarea");
    }

    await act(async () => {
      setTextareaValue(textarea, "Draw three cards.");
      pressKey(textarea, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[0]?.[0]).toMatchObject({
      id: testCardId("amplified-card"),
      field: "amplified-text",
      value: "Draw three cards.",
    });
    expect(amplifiedField.textContent).toContain("Draw three cards.");

    const clearAmplifiedText = editorCard?.querySelector<HTMLButtonElement>(
      '[aria-label="Clear amplified text"]',
    );
    if (clearAmplifiedText === null || clearAmplifiedText === undefined) {
      throw new Error("Missing clear amplified text button");
    }

    await act(async () => {
      clearAmplifiedText.click();
      await flushAsyncWork();
    });

    expect(saveEditorCardField.mock.calls[1]?.[0]).toMatchObject({
      id: testCardId("amplified-card"),
      field: "amplified-text",
      value: "",
    });
    expect(editorCardIds(container)).toEqual([]);

    act(() => root.unmount());
  });

  it("cancels rules text edits with Escape and does not save on blur", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>();
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({
                id: testCardId("card-id-1"),
                "rendered-text": "Original rules text.",
                preview: makePreview({
                  id: "card-id-1",
                  renderedText: "Original rules text.",
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const rulesField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="rendered-text"]`,
    );
    if (rulesField === null) {
      throw new Error("Missing rules text field");
    }

    act(() => {
      rulesField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const textarea = container.querySelector<HTMLTextAreaElement>(
      '[data-editor-input-field="rendered-text"]',
    );
    if (textarea === null) {
      throw new Error("Missing rules text textarea");
    }

    act(() => {
      setTextareaValue(textarea, "Draft rules text.");
      textarea.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    });

    expect(saveEditorCardField).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLTextAreaElement>(
        '[data-editor-input-field="rendered-text"]',
      )?.value,
    ).toBe("Draft rules text.");

    act(() => {
      pressKey(textarea, "Escape");
    });

    expect(
      container.querySelector('[data-editor-input-field="rendered-text"]'),
    ).toBeNull();
    expect(rulesField.textContent).toContain("Original rules text.");
    expect(rulesField.textContent).not.toContain("Draft rules text.");
    expect(saveEditorCardField).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("restores the confirmed name and shows an error when a name save fails", async () => {
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockRejectedValueOnce(new Error("Disk write failed"))
      .mockImplementationOnce((request) =>
        Promise.resolve({
          card: makeEditorCard({
            id: request.id,
            name: String(request.value),
            preview: makePreview({
              id: request.id,
              name: String(request.value),
            }),
          }),
          clientRevision: request.clientRevision,
          timing: makeSaveTiming(),
        }),
      );
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }

    await act(async () => {
      setInputValue(input, "Broken Name");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    expect(container.textContent).toContain("Moonlit Envoy");
    expect(container.textContent).not.toContain("Broken Name");
    expect(container.textContent).toContain("Disk write failed");

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const retryInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (retryInput === null) {
      throw new Error("Missing retry name input");
    }

    await act(async () => {
      setInputValue(retryInput, "Recovered Name");
      pressKey(retryInput, "Enter");
      await flushAsyncWork();
    });

    expect(saveEditorCardField).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Recovered Name");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).not.toContain("Disk write failed");

    act(() => {
      root.unmount();
    });
  });

  it("keeps a server-rejected name draft visible with the validation message", async () => {
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockRejectedValue(serverValidationError("Name already exists."));
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }

    await act(async () => {
      setInputValue(input, "Duplicate Name");
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    const rejectedInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    expect(rejectedInput?.value).toBe("Duplicate Name");
    expect(nameField.getAttribute("data-editor-save-status")).toBe("editing");
    expect(nameField.textContent).toContain("Name already exists.");
    expect(nameField.textContent).not.toContain("Moonlit Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("marks only the submitted field on the submitted card as saving", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([
              makeEditorCard({ id: testCardId("card-id-1") }),
              makeEditorCard({
                id: testCardId("card-id-2"),
                cardNumber: 13,
                name: "Other Envoy",
                preview: makePreview({
                  id: "card-id-2",
                  cardNumber: 13,
                  name: "Other Envoy",
                }),
              }),
            ]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const firstNameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    const firstSubtypeField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="subtype"]`,
    );
    const secondNameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-2")}"] [data-editor-field="name"]`,
    );
    if (
      firstNameField === null ||
      firstSubtypeField === null ||
      secondNameField === null
    ) {
      throw new Error("Missing editable fields");
    }

    act(() => {
      firstNameField.dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
    });
    const input = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (input === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(input, "Saving Name");
      pressKey(input, "Enter");
    });

    expect(firstNameField.getAttribute("data-editor-save-status")).toBe(
      "saving",
    );
    expect(firstSubtypeField.getAttribute("data-editor-save-status")).toBe(
      "idle",
    );
    expect(secondNameField.getAttribute("data-editor-save-status")).toBe(
      "idle",
    );
    expect(firstNameField.textContent).toContain("Saving...");
    expect(firstSubtypeField.textContent).not.toContain("Saving...");
    expect(secondNameField.textContent).not.toContain("Saving...");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the latest name draft visible while an earlier save is in flight", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const firstInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (firstInput === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(firstInput, "First Save");
      pressKey(firstInput, "Enter");
    });
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const secondInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (secondInput === null) {
      throw new Error("Missing second name input");
    }
    act(() => {
      setInputValue(secondInput, "Latest Draft");
    });

    await act(async () => {
      pendingSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          name: "First Save",
          preview: makePreview({ id: "card-id-1", name: "First Save" }),
        }),
        clientRevision: saveEditorCardField.mock.calls[0]?.[0].clientRevision,
        timing: {
          readMs: 1,
          patchMs: 1,
          refreshMs: 1,
          confirmMs: 1,
          totalMs: 4,
        },
      });
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLInputElement>(
        '[data-editor-input-field="name"]',
      )?.value,
    ).toBe("Latest Draft");
    expect(container.textContent).not.toContain("First Save");

    act(() => {
      root.unmount();
    });
  });

  it("ignores a slow older save response after a newer edit is confirmed", async () => {
    const firstSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const secondSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(secondSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const firstInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (firstInput === null) {
      throw new Error("Missing first name input");
    }

    act(() => {
      setInputValue(firstInput, "First Save");
      pressKey(firstInput, "Enter");
    });
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    const secondInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (secondInput === null) {
      throw new Error("Missing second name input");
    }

    act(() => {
      setInputValue(secondInput, "Second Save");
      pressKey(secondInput, "Enter");
    });

    await act(async () => {
      secondSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          name: "Second Save",
          preview: makePreview({ id: "card-id-1", name: "Second Save" }),
        }),
        clientRevision: saveEditorCardField.mock.calls[1]?.[0].clientRevision,
        timing: makeSaveTiming(),
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Second Save");
    expect(container.textContent).not.toContain("First Save");

    await act(async () => {
      firstSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          name: "First Save",
          preview: makePreview({ id: "card-id-1", name: "First Save" }),
        }),
        clientRevision: saveEditorCardField.mock.calls[0]?.[0].clientRevision,
        timing: makeSaveTiming(),
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Second Save");
    expect(container.textContent).not.toContain("First Save");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the latest name draft visible when an earlier in-flight save fails", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const firstInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (firstInput === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(firstInput, "First Save");
      pressKey(firstInput, "Enter");
    });
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const secondInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (secondInput === null) {
      throw new Error("Missing second name input");
    }
    act(() => {
      setInputValue(secondInput, "Latest Draft");
    });

    await act(async () => {
      pendingSave.reject(new Error("Disk write failed"));
      await Promise.resolve();
    });

    expect(
      container.querySelector<HTMLInputElement>(
        '[data-editor-input-field="name"]',
      )?.value,
    ).toBe("Latest Draft");
    expect(container.textContent).toContain("Disk write failed");
    expect(container.textContent).not.toContain("Moonlit Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("keeps a successful save after a no-op re-edit while the save is pending", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const firstInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (firstInput === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(firstInput, "First Save");
      pressKey(firstInput, "Enter");
    });
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    await act(async () => {
      pendingSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          name: "First Save",
          preview: makePreview({ id: "card-id-1", name: "First Save" }),
        }),
        clientRevision: saveEditorCardField.mock.calls[0]?.[0].clientRevision,
        timing: {
          readMs: 1,
          patchMs: 1,
          refreshMs: 1,
          confirmMs: 1,
          totalMs: 4,
        },
      });
      await Promise.resolve();
    });

    const secondInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (secondInput !== null) {
      act(() => {
        pressKey(secondInput, "Escape");
      });
    }

    expect(container.textContent).toContain("First Save");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).not.toContain("Moonlit Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("keeps a successful save after Escape cancels a no-op re-edit before the response", async () => {
    const pendingSave =
      deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () =>
            Promise.resolve([makeEditorCard({ id: testCardId("card-id-1") })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [data-editor-field="name"]`,
    );
    if (nameField === null) {
      throw new Error("Missing name field");
    }

    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const firstInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (firstInput === null) {
      throw new Error("Missing name input");
    }

    act(() => {
      setInputValue(firstInput, "First Save");
      pressKey(firstInput, "Enter");
    });
    act(() => {
      nameField.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    const secondInput = container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    );
    if (secondInput === null) {
      throw new Error("Missing second name input");
    }
    act(() => {
      pressKey(secondInput, "Escape");
    });

    expect(
      container.querySelector('[data-editor-input-field="name"]'),
    ).toBeNull();

    await act(async () => {
      pendingSave.resolve({
        card: makeEditorCard({
          id: testCardId("card-id-1"),
          name: "First Save",
          preview: makePreview({ id: "card-id-1", name: "First Save" }),
        }),
        clientRevision: saveEditorCardField.mock.calls[0]?.[0].clientRevision,
        timing: {
          readMs: 1,
          patchMs: 1,
          refreshMs: 1,
          confirmMs: 1,
          totalMs: 4,
        },
      });
      await Promise.resolve();
    });

    expect(container.textContent).toContain("First Save");
    expect(container.textContent).toContain("Saved");
    expect(container.textContent).not.toContain("Moonlit Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("renders a retryable error state after a failed load", async () => {
    const loadEditorCards = vi
      .fn<EditorApiClient["loadEditorCards"]>()
      .mockRejectedValueOnce(new Error("API unavailable"))
      .mockResolvedValueOnce([makeEditorCard()]);
    const { container, root } = mount(
      <CardEditorApp apiClient={makeApiClient(loadEditorCards)} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Unable to load cards");
    expect(container.textContent).toContain("API unavailable");

    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry",
    );
    if (retryButton === undefined) {
      throw new Error("Missing retry button");
    }

    await act(async () => {
      retryButton.click();
      await Promise.resolve();
    });

    expect(loadEditorCards).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("1 / 1 cards");

    act(() => {
      root.unmount();
    });
  });

  it("mounts without journey runtime providers or Firebase setup", async () => {
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(() => Promise.resolve([makeEditorCard()]))}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Card Editor");
    expect(container.textContent).not.toContain("Create Game");
    expect(container.textContent).not.toContain("Avatar");
    expect(container.querySelector("[data-room-gate]")).toBeNull();
    expect(container.querySelector("[data-multiplayer-provider]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("aborts an in-flight load when the editor unmounts", async () => {
    const pendingLoad = deferred<EditorCardRecord[]>();
    let loadSignal: AbortSignal | undefined;
    const loadEditorCards = vi.fn((signal?: AbortSignal) => {
      loadSignal = signal;
      return pendingLoad.promise;
    });
    const { root } = mount(
      <CardEditorApp apiClient={makeApiClient(loadEditorCards)} />,
    );

    expect(loadSignal?.aborted).toBe(false);

    act(() => {
      root.unmount();
    });

    expect(loadSignal?.aborted).toBe(true);

    await act(async () => {
      pendingLoad.reject(new DOMException("Load aborted.", "AbortError"));
      await Promise.resolve();
    });
  });

  it("parses the initial editor display state from the URL", async () => {
    window.history.pushState(
      null,
      "",
      "/editor?q=moon&type=event&cost=5plus&subtype=Omen&sort=spark&dir=desc&size=small",
    );
    const { container, root } = mount(
      <CardEditorApp apiClient={makeApiClient(() => Promise.resolve([]))} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const shell = container.querySelector("main");
    expect(shell?.getAttribute("data-editor-search")).toBe("moon");
    expect(shell?.getAttribute("data-editor-type")).toBe("event");
    expect(shell?.getAttribute("data-editor-cost")).toBe("5plus");
    expect(shell?.getAttribute("data-editor-subtype")).toBe("Omen");
    expect(shell?.getAttribute("data-editor-sort")).toBe("spark");
    expect(shell?.getAttribute("data-editor-dir")).toBe("desc");
    expect(shell?.getAttribute("data-editor-size")).toBe("small");

    act(() => {
      root.unmount();
    });
  });

  it("scopes search to names, rules text, MTG names, or image numbers", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("moon-card"),
        name: "Moonlit Envoy",
        "rendered-text": "Draw a card.",
        mtgName: "Serra Angel",
        preview: makePreview({
          id: "moon-card",
          name: "Moonlit Envoy",
          renderedText: "Draw a card.",
          imageNumber: 1042,
        }),
      }),
      makeEditorCard({
        id: testCardId("rules-card"),
        name: "Quiet Guide",
        "rendered-text": "Shield an ally.",
        mtgName: "Giant Growth",
        preview: makePreview({
          id: "rules-card",
          name: "Quiet Guide",
          renderedText: "Shield an ally.",
        }),
      }),
      makeEditorCard({
        id: testCardId("other-card"),
        name: "Sun Keeper",
        "rendered-text": "Gain energy.",
        mtgName: "Lightning Bolt",
        preview: makePreview({
          id: "other-card",
          name: "Sun Keeper",
          renderedText: "Gain energy.",
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const searchInput = container.querySelector<HTMLInputElement>(
      '[aria-label="Search cards"]',
    );
    const scopeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Search scope"]',
    );

    if (searchInput === null || scopeSelect === null) {
      throw new Error("Missing search controls");
    }

    // Name search matches a card name only.
    act(() => {
      setInputValue(searchInput, "moon");
    });
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(expectedCardIds("moon-card"));
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/editor?q=moon");

    // A rules-text-only term matches nothing while scoped to names.
    act(() => {
      setInputValue(searchInput, "shield");
    });
    expect(container.textContent).toContain("0 / 3 cards");
    expect(editorCardIds(container)).toEqual([]);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/editor?q=shield");

    // Opting into rules-text search surfaces the rules-text match.
    act(() => {
      setSelectValue(scopeSelect, "all");
    });
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(expectedCardIds("rules-card"));
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?q=shield&scope=all",
    );

    // Switching to MTG-name search matches the source card name.
    act(() => {
      setInputValue(searchInput, "bolt");
    });
    act(() => {
      setSelectValue(scopeSelect, "mtg");
    });
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(expectedCardIds("other-card"));
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?q=bolt&scope=mtg",
    );

    // Image number search uses the number backing the rendered card art.
    act(() => {
      setInputValue(searchInput, "1042");
    });
    act(() => {
      setSelectValue(scopeSelect, "imageNumber");
    });
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(expectedCardIds("moon-card"));
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?q=1042&scope=imageNumber",
    );
    expect(pushState).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("filters by display type, x cost, and nonblank source subtypes", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("event-x"),
        cardType: "Event",
        subtype: "",
        source: { subtype: "" },
        preview: makePreview({
          id: "event-x",
          name: "Variable Event",
          cardType: "Event",
          subtype: "",
          energyCost: null,
          spark: null,
        }),
      }),
      makeEditorCard({
        id: testCardId("character-guide"),
        cardType: "Character",
        subtype: "Guide",
        source: { subtype: "Guide" },
        preview: makePreview({
          id: "character-guide",
          name: "Guide",
          cardType: "Character",
          subtype: "Guide",
          energyCost: 2,
        }),
      }),
      makeEditorCard({
        id: testCardId("character-scout"),
        cardType: "Character",
        subtype: testCardSubtype("Scout"),
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "character-scout",
          name: "Scout",
          cardType: "Character",
          subtype: testCardSubtype("Scout"),
          energyCost: 3,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Type filter"]',
    );
    const costSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Cost filter"]',
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );

    if (typeSelect === null || costSelect === null || subtypeSelect === null) {
      throw new Error("Missing filter control");
    }

    expect(
      Array.from(subtypeSelect.options).map((option) => option.value),
    ).toEqual(["", "Guide", "Scout"]);

    act(() => {
      setSelectValue(typeSelect, "event");
    });
    act(() => {
      setSelectValue(costSelect, "x");
    });

    expect(editorCardIds(container)).toEqual(expectedCardIds("event-x"));
    expect(container.textContent).toContain("1 / 3 cards");
    expect(
      Array.from(container.querySelectorAll("[data-editor-card-id]")).every(
        (cardElement) =>
          cardElement.querySelector(
            'input, select, textarea, [contenteditable="true"], [aria-label="Card type"]',
          ) === null,
      ),
    ).toBe(true);

    act(() => {
      setSelectValue(subtypeSelect, "Scout");
    });

    expect(editorCardIds(container)).toEqual([]);
    expect(container.textContent).toContain("0 / 3 cards");

    act(() => {
      root.unmount();
    });
  });

  it("filters and sorts by trimmed source subtypes", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("padded-scout"),
        cardNumber: 2,
        name: "Padded Scout",
        subtype: testCardSubtype("Scout"),
        source: { subtype: " Scout " },
        preview: makePreview({
          id: "padded-scout",
          cardNumber: 2,
          name: "Padded Scout",
          subtype: testCardSubtype("Scout"),
        }),
      }),
      makeEditorCard({
        id: testCardId("guide"),
        cardNumber: 1,
        name: "Guide",
        subtype: "Guide",
        source: { subtype: "Guide" },
        preview: makePreview({
          id: "guide",
          cardNumber: 1,
          name: "Guide",
          subtype: "Guide",
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    const sortSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Sort field"]',
    );

    if (subtypeSelect === null || sortSelect === null) {
      throw new Error("Missing subtype controls");
    }

    expect(
      Array.from(subtypeSelect.options).map((option) => option.value),
    ).toEqual(["", "Guide", "Scout"]);

    act(() => {
      setSelectValue(sortSelect, "subtype");
    });
    expect(editorCardIds(container)).toEqual(
      expectedCardIds("guide", "padded-scout"),
    );

    act(() => {
      setSelectValue(subtypeSelect, "Scout");
    });

    expect(editorCardIds(container)).toEqual(expectedCardIds("padded-scout"));
    expect(container.textContent).toContain("1 / 2 cards");

    act(() => {
      root.unmount();
    });
  });

  it("replaces the URL for every toolbar display control", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("event-x"),
        cardType: "Event",
        subtype: testCardSubtype("Scout"),
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "event-x",
          cardType: "Event",
          subtype: testCardSubtype("Scout"),
          energyCost: null,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const typeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Type filter"]',
    );
    const costSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Cost filter"]',
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );
    const sortSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Sort field"]',
    );
    const directionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Sort direction"]',
    );
    const smallButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Small",
    );

    if (
      typeSelect === null ||
      costSelect === null ||
      subtypeSelect === null ||
      sortSelect === null ||
      directionButton === null ||
      smallButton === undefined
    ) {
      throw new Error("Missing toolbar control");
    }

    act(() => {
      setSelectValue(typeSelect, "event");
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event",
    );

    act(() => {
      setSelectValue(costSelect, "x");
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event&cost=x",
    );

    act(() => {
      setSelectValue(subtypeSelect, "Scout");
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event&cost=x&subtype=Scout",
    );

    act(() => {
      setSelectValue(sortSelect, "spark");
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event&cost=x&subtype=Scout&sort=spark",
    );

    act(() => {
      directionButton.click();
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event&cost=x&subtype=Scout&sort=spark&dir=desc",
    );

    act(() => {
      smallButton.click();
    });
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?type=event&cost=x&subtype=Scout&sort=spark&dir=desc&size=small",
    );
    expect(pushState).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("sorts by selected field and direction", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("beta"),
        name: "Beta",
        preview: makePreview({ id: "beta", name: "Beta" }),
      }),
      makeEditorCard({
        id: testCardId("alpha"),
        name: "Alpha",
        preview: makePreview({ id: "alpha", name: "Alpha" }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const sortSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Sort field"]',
    );
    const directionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Sort direction"]',
    );

    if (sortSelect === null || directionButton === null) {
      throw new Error("Missing sort control");
    }

    act(() => {
      setSelectValue(sortSelect, "name");
    });
    expect(editorCardIds(container)).toEqual(expectedCardIds("alpha", "beta"));

    act(() => {
      directionButton.click();
    });
    expect(editorCardIds(container)).toEqual(expectedCardIds("beta", "alpha"));

    act(() => {
      root.unmount();
    });
  });

  it("groups shared name substrings and repeats cards in each matching group", async () => {
    const cards = [
      makeEditorCard({
        id: testCardId("dreamlight"),
        name: "Dreamlight Guide",
        preview: makePreview({ id: "dreamlight", name: "Dreamlight Guide" }),
      }),
      makeEditorCard({
        id: testCardId("avatar"),
        name: "Dream Walker",
        preview: makePreview({ id: "avatar", name: "Dream Walker" }),
      }),
      makeEditorCard({
        id: testCardId("starlight"),
        name: "Starlight Keeper",
        preview: makePreview({ id: "starlight", name: "Starlight Keeper" }),
      }),
      makeEditorCard({
        id: testCardId("unmatched"),
        name: "Ash",
        preview: makePreview({ id: "unmatched", name: "Ash" }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const sortSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Sort field"]',
    );
    const directionButton = container.querySelector<HTMLButtonElement>(
      '[aria-label="Sort direction"]',
    );

    if (sortSelect === null || directionButton === null) {
      throw new Error("Missing substring sort controls");
    }

    act(() => {
      setSelectValue(sortSelect, "nameSubstring");
    });

    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?sort=namesubstring",
    );
    expect(
      Array.from(
        container.querySelectorAll("[data-editor-substring-group]"),
      ).map((heading) => heading.getAttribute("data-editor-substring-group")),
    ).toEqual(["dream", "light"]);
    expect(container.textContent).toContain("“Dream”");
    expect(container.textContent).toContain("“light”");
    expect(editorCardIds(container)).toEqual(
      expectedCardIds(
        "avatar",
        "dreamlight",
        "dreamlight",
        "starlight",
      ),
    );
    expect(container.textContent).toContain("3 / 4 cards");

    act(() => {
      directionButton.click();
    });
    expect(editorCardIds(container)).toEqual(
      expectedCardIds(
        "starlight",
        "dreamlight",
        "dreamlight",
        "avatar",
      ),
    );

    act(() => {
      root.unmount();
    });
  });

  it.each(["number", "name", "cost", "type", "subtype", "spark"])(
    "keeps equal-key sorting stable for %s",
    async (queryValue) => {
      window.history.pushState(null, "", `/editor?sort=${queryValue}`);
      const cards = [
        makeEditorCard({
          id: testCardId("first"),
          cardNumber: 1,
          name: "Same",
          subtype: "Guide",
          spark: 2,
          preview: makePreview({
            id: "first",
            cardNumber: 1,
            name: "Same",
            cardType: "Character",
            subtype: "Guide",
            energyCost: 2,
            spark: 2,
          }),
        }),
        makeEditorCard({
          id: testCardId("second"),
          cardNumber: 1,
          name: "Same",
          subtype: "Guide",
          spark: 2,
          preview: makePreview({
            id: "second",
            cardNumber: 1,
            name: "Same",
            cardType: "Character",
            subtype: "Guide",
            energyCost: 2,
            spark: 2,
          }),
        }),
      ];
      const { container, root } = await mountLoadedApp(cards);

      expect(editorCardIds(container)).toEqual(
        expectedCardIds("first", "second"),
      );

      act(() => {
        root.unmount();
      });
    },
  );

  function openFocusedEditor(container: HTMLElement): HTMLElement {
    const cardButton = container.querySelector<HTMLElement>(
      `[data-editor-card-id="${testCardId("card-id-1")}"] [role="button"]`,
    );
    if (cardButton === null) {
      throw new Error("Missing art-edit card button");
    }
    act(() => {
      cardButton.click();
    });
    const editor = document.querySelector<HTMLElement>(
      '[data-editor-focused-editor="true"]',
    );
    if (editor === null) {
      throw new Error("Focused editor did not open");
    }
    return editor;
  }

  it("closes the focused editor on Escape even when focus is outside the dialog", async () => {
    window.history.pushState(null, "", "/editor?artedit=1");
    const { container, root } = await mountLoadedApp([
      makeEditorCard({ id: testCardId("card-id-1") }),
    ]);

    openFocusedEditor(container);

    // Focus sits on the document body, not inside the dialog. A document-level
    // listener is what makes Escape close the editor regardless of focus.
    act(() => {
      pressKey(document.body, "Escape");
    });

    expect(
      document.querySelector('[data-editor-focused-editor="true"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("dismisses the tag dropdown with Escape without closing the focused editor", async () => {
    window.history.pushState(null, "", "/editor?artedit=1&tagedit=1");
    const { container, root } = await mountLoadedApp([
      makeEditorCard({ id: testCardId("card-id-1") }),
    ]);

    const editor = openFocusedEditor(container);

    const addTag = Array.from(
      editor.querySelectorAll<HTMLButtonElement>(
        'button[aria-haspopup="listbox"]',
      ),
    ).find((button) => button.textContent?.trim() === "+Tag");
    if (addTag === undefined) {
      throw new Error("Missing +Tag button");
    }
    act(() => {
      addTag.click();
    });

    const search = editor.querySelector<HTMLInputElement>(
      'input[type="search"]',
    );
    expect(search).not.toBeNull();

    act(() => {
      pressKey(search as HTMLInputElement, "Escape");
    });

    // The dropdown closes, but the editor stays open: the dropdown intercepts
    // Escape in the capture phase and stops it from reaching the editor.
    expect(editor.querySelector('input[type="search"]')).toBeNull();
    expect(
      document.querySelector('[data-editor-focused-editor="true"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });
});
