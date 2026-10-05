// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  AvatarPortrait,
  type AvatarVisual,
} from "./AvatarPortrait";
import { testAvatarId } from "../../../types/test-identities";
import { renderInCumulus } from "../../testing/render";

const DC: AvatarVisual = {
  imageNumber: "0042",
  name: "Astra",
  title: "The Dawnbound",
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("AvatarPortrait variants", () => {
  it.each(["panel", "thumb"] as const)(
    "%s composites the transparent cutout over the light-gray portrait field",
    (variant) => {
      const { container } = renderInCumulus(
        <AvatarPortrait avatar={DC} variant={variant} />,
      );

      const frame = container.firstElementChild as HTMLElement | null;
      expect(frame?.style.backgroundColor).toBe("var(--surface-portrait)");
      expect(frame?.style.backgroundImage).toBe("");
    },
  );

  it("registers a strict profile reveal only when semantic profile data is supplied", () => {
    const { container } = renderInCumulus(
      <AvatarPortrait
        avatar={DC}
        variant="panel"
        profile={{
          id: testAvatarId("00000000-0000-4000-8000-000000000061"),
          ability: "Gain 1 essence.",
        }}
      />,
    );
    const source = container.querySelector<HTMLElement>(
      "[data-avatar-source]",
    )!;
    expect(source.dataset.revealFeedback).toBe("measured");
    expect(source.dataset.revealEntityType).toBe("avatar");
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
    const { container } = renderInCumulus(
      <AvatarPortrait
        avatar={{ ...DC, portraitFocus: { x: 0.58, y: 0.23 } }}
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
