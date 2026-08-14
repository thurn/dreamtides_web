// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CumulusComponent } from "./registry";

vi.mock("./mockups/registry", () => ({
  getMockup: () => () => <div data-testid="mockup" />,
  hasMockup: () => true,
}));

import { ComponentShowcase } from "./ComponentShowcase";
import { DemoStage } from "./DemoStage";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const entry: CumulusComponent = {
  id: "fixed-preview",
  title: "Fixed Preview",
  blurb: "A fixed-position preview fixture.",
  group: "Primitives",
  docName: "FixedPreview",
  Component: () => <div style={{ position: "fixed" }} />,
  usage: [],
  demo: { defaultArgs: {} },
};

function mount(node: React.ReactNode): { root: Root; container: HTMLDivElement } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(node));
  return { root, container };
}

afterEach(() => {
  document.body.innerHTML = "";
});

function expectLocalFixedBoundary(boundary: HTMLElement | null): void {
  expect(boundary).not.toBeNull();
  expect(boundary?.style.position).toBe("relative");
  expect(boundary?.style.overflow).toBe("hidden");
  expect(boundary?.style.transform).toBe("translateZ(0)");
}

describe("Cumulus documentation preview boundaries", () => {
  it("contains fixed-position fallback demos", () => {
    const { root, container } = mount(
      <DemoStage Component={entry.Component} args={{}} />,
    );

    expectLocalFixedBoundary(
      container.querySelector("[data-cumulus-doc-preview-boundary]"),
    );
    act(() => root.unmount());
  });

  it("contains fixed-position full-screen mockups", () => {
    const { root, container } = mount(<ComponentShowcase entry={entry} />);

    expect(container.querySelector("[data-testid='mockup']")).not.toBeNull();
    expectLocalFixedBoundary(
      container.querySelector("[data-cumulus-doc-preview-boundary]"),
    );
    act(() => root.unmount());
  });
});
