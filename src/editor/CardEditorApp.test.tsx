// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import CardEditorApp from "./CardEditorApp";
import type { EditorApiClient, EditorCardRecord } from "./types";

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

function makePreview(overrides: Partial<CardData> = {}): CardData {
  return {
    id: "card-id-1",
    name: "Moonlit Envoy",
    cardNumber: 12,
    cardType: "Character",
    subtype: "Scout",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    tides: [],
    renderedText: "Draw a card.",
    imageNumber: 12,
    artOwned: true,
    ...overrides,
  };
}

function makeEditorCard(overrides: Partial<EditorCardRecord> = {}): EditorCardRecord {
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
    source: {},
    preview,
    ...overrides,
  };
}

function makeApiClient(
  loadEditorCards: EditorApiClient["loadEditorCards"],
  saveEditorCardField: EditorApiClient["saveEditorCardField"] = vi.fn(),
): EditorApiClient {
  return {
    loadEditorCards,
    saveEditorCardField,
  };
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
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

function pressKey(element: HTMLElement, key: string): void {
  element.dispatchEvent(
    new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
    }),
  );
}

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function editorCardIds(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-editor-card-id]")).map(
    (element) => element.getAttribute("data-editor-card-id") ?? "",
  );
}

async function mountLoadedApp(
  cards: EditorCardRecord[],
): Promise<{
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

  it("renders the title and source-card count after a successful load", async () => {
    const cards = [
      makeEditorCard({ id: "card-id-1" }),
      makeEditorCard({ id: "card-id-2", cardNumber: 13 }),
    ];
    const { container, root } = mount(
      <CardEditorApp apiClient={makeApiClient(() => Promise.resolve(cards))} />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Card Editor");
    expect(container.textContent).toContain("2 source cards");
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
        id: "uuid-card-1",
        cardType: "Character",
        subtype: "Scout",
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "uuid-card-1",
          cardType: "Character",
          subtype: "Scout",
          renderedText: "Draw a card.",
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const editorCard = container.querySelector<HTMLElement>(
      "[data-editor-card-id=\"uuid-card-1\"]",
    );

    expect(editorCard).not.toBeNull();
    expect(editorCard?.querySelector("[data-card-text-scale]")).not.toBeNull();
    expect(editorCard?.querySelector("[data-editor-field=\"name\"]")?.textContent).toContain(
      "Moonlit Envoy",
    );
    expect(editorCard?.querySelector("[data-editor-field=\"rendered-text\"]")?.textContent).toContain(
      "Draw a card.",
    );

    act(() => {
      root.unmount();
    });
  });

  it("keeps the desktop shell fixed and exposes narrow scroll-layout hooks", async () => {
    const { container, root } = await mountLoadedApp([
      makeEditorCard({ id: "card-id-1" }),
      makeEditorCard({ id: "card-id-2" }),
    ]);
    const shell = container.querySelector("main");
    const header = container.querySelector("header");
    const content = container.querySelector<HTMLElement>(".card-editor-content");
    const loadedContent = container.querySelector<HTMLElement>(
      ".card-editor-loaded-content",
    );
    const scrollRegion = container.querySelector<HTMLElement>(
      "[data-editor-scroll-region=\"cards\"]",
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
        id: "event-card",
        cardType: "Event",
        source: { subtype: "Omen" },
        preview: makePreview({
          id: "event-card",
          cardType: "Event",
          subtype: "Omen",
          spark: null,
        }),
      }),
    ]);
    const editorCard = container.querySelector<HTMLElement>(
      "[data-editor-card-id=\"event-card\"]",
    );
    const typeLine = editorCard?.querySelector<HTMLElement>(
      "[data-testid=\"card-type-line\"]",
    );
    const subtypeField = editorCard?.querySelector<HTMLElement>(
      "[data-editor-field=\"subtype\"]",
    );
    const typeSpan = subtypeField?.parentElement?.firstElementChild;

    expect(typeLine?.textContent).toBe("Event — Omen");
    expect(subtypeField?.textContent).toBe("Omen");
    expect(subtypeField?.textContent).not.toContain("Event");
    expect(typeSpan?.textContent).toBe("Event");
    expect(typeSpan?.hasAttribute("data-editor-field")).toBe(false);
    expect(editorCard?.querySelector("[data-editor-field=\"card-type\"]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("updates editor grid sizing from the size control", async () => {
    const { container, root } = await mountLoadedApp([makeEditorCard()]);
    const largeButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Large",
    );

    if (largeButton === undefined) {
      throw new Error("Missing large size button");
    }

    expect(container.querySelector("[data-editor-grid-size=\"medium\"]")).not.toBeNull();

    act(() => {
      largeButton.click();
    });

    const grid = container.querySelector<HTMLElement>(
      "[data-editor-grid-size=\"large\"]",
    );
    expect(grid).not.toBeNull();
    expect(grid?.style.gridTemplateColumns).toContain("220px");

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
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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
      setInputValue(input, "Renamed Envoy");
    });
    expect(container.textContent).toContain("Renamed Envoy");

    await act(async () => {
      pressKey(input, "Enter");
      await flushAsyncWork();
    });

    const savedRequest = saveEditorCardField.mock.calls[0]?.[0];
    expect(savedRequest).toMatchObject({
      id: "card-id-1",
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

  it("cancels name edits with Escape and does not save on blur", async () => {
    const saveEditorCardField = vi.fn<EditorApiClient["saveEditorCardField"]>();
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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
      setInputValue(input, "Draft Name");
      input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    });

    expect(saveEditorCardField).not.toHaveBeenCalled();
    expect(container.textContent).toContain("Draft Name");

    act(() => {
      pressKey(input, "Escape");
    });

    expect(container.querySelector('[data-editor-input-field="name"]')).toBeNull();
    expect(container.textContent).toContain("Moonlit Envoy");
    expect(container.textContent).not.toContain("Draft Name");
    expect(saveEditorCardField).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("restores the confirmed name and shows an error when a name save fails", async () => {
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockRejectedValue(new Error("Disk write failed"));
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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
      root.unmount();
    });
  });

  it("keeps the latest name draft visible while an earlier save is in flight", async () => {
    const pendingSave = deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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
          id: "card-id-1",
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

    expect(container.textContent).toContain("Latest Draft");
    expect(container.textContent).not.toContain("First Save");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the latest name draft visible when an earlier in-flight save fails", async () => {
    const pendingSave = deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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

    expect(container.querySelector<HTMLInputElement>(
      '[data-editor-input-field="name"]',
    )?.value).toBe("Latest Draft");
    expect(container.textContent).toContain("Disk write failed");
    expect(container.textContent).not.toContain("Moonlit Envoy");

    act(() => {
      root.unmount();
    });
  });

  it("keeps a successful save after a no-op re-edit while the save is pending", async () => {
    const pendingSave = deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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
          id: "card-id-1",
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
    const pendingSave = deferred<Awaited<ReturnType<EditorApiClient["saveEditorCardField"]>>>();
    const saveEditorCardField = vi
      .fn<EditorApiClient["saveEditorCardField"]>()
      .mockReturnValue(pendingSave.promise);
    const { container, root } = mount(
      <CardEditorApp
        apiClient={makeApiClient(
          () => Promise.resolve([makeEditorCard({ id: "card-id-1" })]),
          saveEditorCardField,
        )}
      />,
    );

    await act(async () => {
      await Promise.resolve();
    });

    const nameField = container.querySelector<HTMLElement>(
      '[data-editor-card-id="card-id-1"] [data-editor-field="name"]',
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

    expect(container.querySelector('[data-editor-input-field="name"]')).toBeNull();

    await act(async () => {
      pendingSave.resolve({
        card: makeEditorCard({
          id: "card-id-1",
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
    expect(container.textContent).toContain("1 source cards");

    act(() => {
      root.unmount();
    });
  });

  it("mounts without quest runtime providers or Firebase setup", async () => {
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
    expect(container.textContent).not.toContain("Dreamcaller");
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

  it("filters by name and rules text while replacing the URL", async () => {
    const cards = [
      makeEditorCard({
        id: "moon-card",
        name: "Moonlit Envoy",
        "rendered-text": "Draw a card.",
        preview: makePreview({
          id: "moon-card",
          name: "Moonlit Envoy",
          renderedText: "Draw a card.",
        }),
      }),
      makeEditorCard({
        id: "rules-card",
        name: "Quiet Guide",
        "rendered-text": "Shield an ally.",
        preview: makePreview({
          id: "rules-card",
          name: "Quiet Guide",
          renderedText: "Shield an ally.",
        }),
      }),
      makeEditorCard({
        id: "other-card",
        name: "Sun Keeper",
        "rendered-text": "Gain energy.",
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

    if (searchInput === null) {
      throw new Error("Missing search input");
    }

    act(() => {
      setInputValue(searchInput, "shield");
    });

    expect(searchInput.value).toBe("shield");
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(["rules-card"]);
    expect(replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "/editor?q=shield",
    );
    expect(pushState).not.toHaveBeenCalled();

    act(() => {
      setInputValue(searchInput, "moon");
    });

    expect(searchInput.value).toBe("moon");
    expect(container.textContent).toContain("1 / 3 cards");
    expect(editorCardIds(container)).toEqual(["moon-card"]);
    expect(replaceState).toHaveBeenLastCalledWith(null, "", "/editor?q=moon");
    expect(pushState).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("filters by display type, x cost, and nonblank source subtypes", async () => {
    const cards = [
      makeEditorCard({
        id: "event-x",
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
        id: "character-guide",
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
        id: "character-scout",
        cardType: "Character",
        subtype: "Scout",
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "character-scout",
          name: "Scout",
          cardType: "Character",
          subtype: "Scout",
          energyCost: 3,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const eventButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Events",
    );
    const costSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Cost filter"]',
    );
    const subtypeSelect = container.querySelector<HTMLSelectElement>(
      '[aria-label="Subtype filter"]',
    );

    if (eventButton === undefined || costSelect === null || subtypeSelect === null) {
      throw new Error("Missing filter control");
    }

    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      "Guide",
      "Scout",
    ]);

    act(() => {
      eventButton.click();
    });
    act(() => {
      setSelectValue(costSelect, "x");
    });

    expect(editorCardIds(container)).toEqual(["event-x"]);
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
        id: "padded-scout",
        cardNumber: 2,
        name: "Padded Scout",
        subtype: "Scout",
        source: { subtype: " Scout " },
        preview: makePreview({
          id: "padded-scout",
          cardNumber: 2,
          name: "Padded Scout",
          subtype: "Scout",
        }),
      }),
      makeEditorCard({
        id: "guide",
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

    expect(Array.from(subtypeSelect.options).map((option) => option.value)).toEqual([
      "",
      "Guide",
      "Scout",
    ]);

    act(() => {
      setSelectValue(sortSelect, "subtype");
    });
    expect(editorCardIds(container)).toEqual(["guide", "padded-scout"]);

    act(() => {
      setSelectValue(subtypeSelect, "Scout");
    });

    expect(editorCardIds(container)).toEqual(["padded-scout"]);
    expect(container.textContent).toContain("1 / 2 cards");

    act(() => {
      root.unmount();
    });
  });

  it("replaces the URL for every toolbar display control", async () => {
    const cards = [
      makeEditorCard({
        id: "event-x",
        cardType: "Event",
        subtype: "Scout",
        source: { subtype: "Scout" },
        preview: makePreview({
          id: "event-x",
          cardType: "Event",
          subtype: "Scout",
          energyCost: null,
        }),
      }),
    ];
    const { container, root } = await mountLoadedApp(cards);
    const replaceState = vi.spyOn(window.history, "replaceState");
    const pushState = vi.spyOn(window.history, "pushState");
    const eventButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Events",
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
      eventButton === undefined ||
      costSelect === null ||
      subtypeSelect === null ||
      sortSelect === null ||
      directionButton === null ||
      smallButton === undefined
    ) {
      throw new Error("Missing toolbar control");
    }

    act(() => {
      eventButton.click();
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
        id: "beta",
        name: "Beta",
        preview: makePreview({ id: "beta", name: "Beta" }),
      }),
      makeEditorCard({
        id: "alpha",
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
    expect(editorCardIds(container)).toEqual(["alpha", "beta"]);

    act(() => {
      directionButton.click();
    });
    expect(editorCardIds(container)).toEqual(["beta", "alpha"]);

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
        id: "first",
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
        id: "second",
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

    expect(editorCardIds(container)).toEqual(["first", "second"]);

      act(() => {
        root.unmount();
      });
    },
  );
});
