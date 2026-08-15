import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DreamAvatarPortrait,
  type DreamAvatarVisual,
} from "./DreamAvatarPortrait";
import { CumulusRoot } from "../../CumulusRoot";
import { testDreamAvatarId } from "../../../types/test-identities";

const DC: DreamAvatarVisual = {
  imageNumber: "0042",
  name: assertLocalized("Astra"),
  title: assertLocalized("The Dawnbound"),
};

function mountInto(node: React.ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(<CumulusRoot>{node}</CumulusRoot>);
  });
  return { container, root };
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
});

describe("DreamAvatarPortrait variants", () => {
  it.each(["panel", "thumb"] as const)(
    "%s composites the transparent cutout over the light-gray portrait field",
    (variant) => {
      const { container } = mountInto(
        <DreamAvatarPortrait dreamAvatar={DC} variant={variant} />,
      );

      const frame = container.firstElementChild as HTMLElement | null;
      expect(frame?.style.backgroundColor).toBe("var(--surface-portrait)");
      expect(frame?.style.backgroundImage).toBe("");
    },
  );

  it("registers a strict profile reveal only when semantic profile data is supplied", () => {
    const { container } = mountInto(
      <DreamAvatarPortrait
        dreamAvatar={DC}
        variant="panel"
        profile={{
          id: testDreamAvatarId("00000000-0000-4000-8000-000000000061"),
          ability: assertLocalized("Gain 1 essence."),
        }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-dream-avatar-source]",
    )!;
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("dreamAvatar");
    expect(source.dataset.revealEntityId).toBe(
      "00000000-0000-4000-8000-000000000061",
    );
    expect(source.dataset.revealPrimaryVariant).toBe("fullBleed");
    expect(source.tabIndex).toBe(0);
    const description = document.getElementById(
      source.getAttribute("aria-describedby") ?? "",
    );
    expect(description?.textContent).toContain("Astra");
    expect(description?.textContent).toContain("Gain 1 essence.");
    expect(source.style.width).toBe("100%");
  });

  it("thumb centers the authored head coordinate in a close bust crop", () => {
    const { container } = mountInto(
      <DreamAvatarPortrait
        dreamAvatar={{ ...DC, portraitFocus: { x: 0.58, y: 0.23 } }}
        variant="thumb"
      />,
    );

    const img = container.querySelector("img");
    expect(Number.parseFloat(img?.style.left ?? "")).toBeCloseTo(-23.2, 8);
    expect(img?.style.objectPosition).not.toBe("50% 22%");
    expect(img?.style.transform).toBe("scale(2.9)");
    expect(img?.style.transformOrigin).toBe("50% 0%");
  });
});
