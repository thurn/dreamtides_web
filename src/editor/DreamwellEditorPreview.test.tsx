// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { DreamwellEditorPreview } from "./DreamwellEditorPreview";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("DreamwellEditorPreview", () => {
  it("keeps inline mutation targets explicitly owned by the editor preview", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <DreamwellEditorPreview
          card={{
            id: "ee8e040e-f3de-4622-9cff-a9f1866e2fc3",
            name: "Editable Beacon",
            renderedText: "",
            energyAdded: 2,
            imageNumber: 42,
          }}
          slots={{
            name: (defaultNode) => <button type="button">{defaultNode}</button>,
            rulesText: (defaultNode) => (
              <button type="button">{defaultNode ?? "Add rules text"}</button>
            ),
          }}
        />,
      );
    });

    expect(container.querySelectorAll("button")).toHaveLength(2);
    expect(container.textContent).toContain("Editable Beacon");
    expect(container.textContent).toContain("Add rules text");

    act(() => root.unmount());
    container.remove();
  });
});
