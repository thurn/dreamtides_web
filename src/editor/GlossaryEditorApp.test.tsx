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
    priority: 10,
    matchesRulesText: true,
    variants: [],
  },
  {
    id: "site-draft",
    category: "Sites",
    term: "Draft",
    definition: "Choose cards for your deck.",
    priority: 0,
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
  it("persists an edited Info Card field by stable id when the field blurs", async () => {
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

    expect(
      container.querySelector("[data-testid='glossary-preview']")?.textContent,
    ).toContain("Power used during a challenge.");

    await act(async () => {
      textarea?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });

    expect(saveEntry).toHaveBeenCalledWith({
      id: "spark",
      term: "Spark",
      definition: "Power used during a challenge.",
      variants: [],
    });
    expect(container.textContent).toContain("Saved to glossary.toml");
    expect(container.textContent).not.toContain("Save Definition");

    act(() => root.unmount());
  });

  it("saves additional rules-text forms when their field blurs", async () => {
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

    const variantsInput = container.querySelector<HTMLInputElement>(
      "[data-testid='glossary-variants-input']",
    );
    expect(variantsInput).not.toBeNull();
    act(() => setInputValue(variantsInput!, "Sparks, Sparked"));

    await act(async () => {
      variantsInput?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      await Promise.resolve();
    });

    expect(saveEntry).toHaveBeenCalledWith({
      id: "spark",
      term: "Spark",
      definition: "A character's combat power.",
      variants: ["Sparks", "Sparked"],
    });

    act(() => root.unmount());
  });

  it("previews and edits a definition-only entry without a visible title", async () => {
    const definitionOnlyEntry: GlossaryCatalogEntry = {
      ...ENTRIES[0],
      id: "score",
      term: "Score",
      definition:
        "Characters score points (⍟) when they challenge and are not blocked.",
      termPresentation: "definitionOnly",
    };
    const { container, root } = mount();

    await act(async () => {
      root.render(
        <GlossaryEditorApp
          loadEntries={vi.fn().mockResolvedValue([definitionOnlyEntry])}
          saveEntry={vi.fn()}
        />,
      );
      await Promise.resolve();
    });

    const preview = container.querySelector(
      "[data-testid='glossary-preview']",
    );
    expect(preview?.textContent).toBe(
      "Characters score points () when they challenge and are not blocked.",
    );
    expect(preview?.querySelector('[aria-label="points"]')).not.toBeNull();
    expect(
      preview?.querySelector("[data-editor-field='title']"),
    ).toBeNull();
    expect(
      container.querySelector<HTMLInputElement>(
        "[data-testid='glossary-term-input']",
      )?.value,
    ).toBe("Score");

    act(() => root.unmount());
  });

  it("marks a term as definition-only and saves the presentation", async () => {
    const saveEntry = vi.fn().mockResolvedValue({
      ...ENTRIES[0],
      termPresentation: "definitionOnly",
    });
    const { container, root } = mount();

    await act(async () => {
      root.render(
        <GlossaryEditorApp
          loadEntries={vi.fn().mockResolvedValue(ENTRIES)}
          saveEntry={saveEntry}
        />,
      );
      await Promise.resolve();
    });

    const presentationSelect = container.querySelector<HTMLButtonElement>(
      '[aria-label="Term Presentation"]',
    );
    expect(presentationSelect).not.toBeNull();
    act(() => presentationSelect?.click());
    const definitionOnly = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="option"]'),
    ).find((button) => button.textContent?.includes("Definition Only") === true);
    expect(definitionOnly).not.toBeUndefined();
    await act(async () => {
      definitionOnly?.click();
      await Promise.resolve();
    });

    expect(saveEntry).toHaveBeenCalledWith({
      id: "spark",
      termPresentation: "definitionOnly",
    });
    expect(
      container.querySelector(
        "[data-testid='glossary-preview'] [data-editor-field='title']",
      ),
    ).toBeNull();
    expect(
      container.querySelector<HTMLInputElement>(
        "[data-testid='glossary-term-input']",
      )?.value,
    ).toBe("Spark");
    expect(container.textContent).toContain("Saved to glossary.toml");

    act(() => root.unmount());
  });
});
