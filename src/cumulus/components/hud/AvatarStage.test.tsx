import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AvatarVisual } from "./AvatarPortrait";
import { AvatarStage } from "./AvatarStage";
import { CumulusRoot } from "../../CumulusRoot";

const AVATAR: AvatarVisual = {
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

describe("AvatarStage", () => {
  it.each(["standing", "cutout", "fullBleed"] as const)(
    "%s renders full-body cutout art in the caller's stage",
    (variant) => {
      const { container } = mountInto(
        <AvatarStage avatar={AVATAR} variant={variant} />,
      );

      const img = container.querySelector(
        `[data-avatar-stage-art="${variant}"]`,
      );
      expect(img?.getAttribute("alt")).not.toBe("");
      expect(img?.getAttribute("alt")).not.toMatch(/^avatar-/);
      expect(img?.getAttribute("src") ?? "").toContain("0042");
    },
  );

  it("fullBleed centers the authored head coordinate instead of the canvas", () => {
    const { container } = mountInto(
      <AvatarStage
        avatar={{
          ...AVATAR,
          portraitFocus: { x: 0.58, y: 0.23 },
        }}
        variant="fullBleed"
      />,
    );

    const img = container.querySelector<HTMLImageElement>("img");
    expect(img?.style.left).toBe("50%");
    expect(img?.style.transform).toBe("translate(-58%, -23%)");
    expect(img?.style.height).toBe("100%");
  });

  it.each(["standing", "cutout", "fullBleed"] as const)(
    "%s falls back to the name's first letter when the art 404s",
    (variant) => {
      const { container } = mountInto(
        <AvatarStage avatar={AVATAR} variant={variant} />,
      );

      const img = container.querySelector("img");
      act(() => {
        img?.dispatchEvent(new Event("error"));
      });

      expect(container.querySelector("img")).toBeNull();
      expect(
        container.querySelector(
          `[data-avatar-stage-fallback="${variant}"]`,
        )?.textContent,
      ).toContain("A");
    },
  );
});
