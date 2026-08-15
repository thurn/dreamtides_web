// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { PackageDebugDialog, type PackageDebugView } from "./PackageDebugDialog";

const EMPTY_VIEW: PackageDebugView = {
  values: [],
  avatar: null,
  validation: [],
  remainingDreamsigns: [],
  spentDreamsigns: [],
  currentOffer: [],
  topRemainingCards: [],
};

let root: Root | null = null;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
});

describe("PackageDebugDialog", () => {
  it("offers portable save and load actions without a server-side save list", () => {
    const onSave = vi.fn();
    const onLoad = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <CumulusRoot>
          <PackageDebugDialog
            isOpen
            view={EMPTY_VIEW}
            saveName="before atlas"
            saveStatus={null}
            saveError={null}
            busy={false}
            canSave
            canLoad
            canForceLegendaryOffer={false}
            onClose={vi.fn()}
            onSaveNameChange={vi.fn()}
            onSave={onSave}
            onLoad={onLoad}
            onForceLegendaryOffer={vi.fn()}
          />
        </CumulusRoot>,
      ),
    );

    expect(container.querySelector("[data-package-debug-save-file]")).not.toBeNull();
    const saveButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="debug-save-journey"]',
    );
    const loadButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="debug-load-journey"]',
    );
    expect(saveButton?.textContent).toContain("Save Journey");
    expect(loadButton?.textContent).toContain("Load Journey");
    expect(container.textContent).not.toContain("No saved journeys yet.");

    act(() => saveButton?.click());
    act(() => loadButton?.click());
    expect(onSave).toHaveBeenCalledOnce();
    expect(onLoad).toHaveBeenCalledOnce();
  });
});
