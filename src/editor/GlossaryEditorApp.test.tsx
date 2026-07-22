// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GlossaryCatalogEntry } from "../data/glossary";
import GlossaryEditorApp from "./GlossaryEditorApp";

const ENTRIES: readonly GlossaryCatalogEntry[] = [
  {
    id: "spark",
    category: "Resources",
    term: "Spark",
    definition: "A character's combat power.",
    matchesRulesText: true,
    variants: [],
  },
  {
    id: "site-draft",
    category: "Sites",
    term: "Draft",
    definition: "Choose cards for your deck.",
    matchesRulesText: false,
    variants: [],
  },
];

function mount(): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  return { container, root: createRoot(container) };
}

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  );
  if (descriptor?.set === undefined) throw new Error("Missing value setter");
  descriptor.set.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (descriptor?.set === undefined) throw new Error("Missing value setter");
  descriptor.set.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
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

describe("GlossaryEditorApp", () => {
  it("edits the rendered Info Card title and body in place, then persists by stable id", async () => {
    const loadEntries = vi.fn().mockResolvedValue(ENTRIES);
    const saveEntry = vi.fn().mockImplementation(
      (
        edit: Pick<
          GlossaryCatalogEntry,
          "id" | "term" | "definition" | "variants"
        >,
      ) => Promise.resolve({ ...ENTRIES[0], ...edit }),
    );
    const { container, root } = mount();

    await act(async () => {
      root.render(
        <GlossaryEditorApp
          loadEntries={loadEntries}
          saveEntry={saveEntry}
        />,
      );
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Info Card Glossary");
    expect(container.textContent).toContain("Interactive Info Card");
    expect(container.textContent).not.toContain("Rendered Preview");
    expect(
      container.querySelector("[data-testid='glossary-preview']")?.textContent,
    ).toContain("A character's combat power.");

    const description = container.querySelector<HTMLElement>(
      "[data-editor-field='description']",
    );
    expect(description).not.toBeNull();
    act(() => {
      description?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const textarea = container.querySelector<HTMLTextAreaElement>(
      "[data-editor-input-field='description']",
    );
    expect(textarea).not.toBeNull();
    act(() => setTextareaValue(textarea!, "Power used during a challenge."));

    const title = container.querySelector<HTMLElement>(
      "[data-editor-field='title']",
    );
    expect(title).not.toBeNull();
    act(() => {
      title?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const titleInput = container.querySelector<HTMLInputElement>(
      "[data-editor-input-field='title']",
    );
    expect(titleInput).not.toBeNull();
    act(() => setInputValue(titleInput!, "Challenge Spark"));

    expect(
      container.querySelector("[data-testid='glossary-preview']")?.textContent,
    ).toContain("Power used during a challenge.");

    const saveButton = container.querySelector<HTMLButtonElement>(
      "[data-testid='glossary-save']",
    );
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
    });

    expect(saveEntry).toHaveBeenCalledWith({
      id: "spark",
      term: "Challenge Spark",
      definition: "Power used during a challenge.",
      variants: [],
    });
    expect(container.textContent).toContain("Saved to glossary.toml");

    act(() => root.unmount());
  });
});
