// @vitest-environment jsdom

import { act } from "react";
import { localizationTodo } from "@trox/runtime";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { CARD_ASPECT_RATIO } from "../card/card-aspect";
import { CardBack } from "./CardBack";
import { CumulusRoot } from "../../CumulusRoot";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("CardBack", () => {
  it("renders the canonical sprite as a non-interactive 5:7 card", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <CardBack
            label={localizationTodo("Face-down enemy card")}
            testId="enemy-card"
          />
        </CumulusRoot>,
      );
    });

    const image = container.querySelector<HTMLImageElement>("[data-card-back]");
    expect(image?.src).toContain("card_back.png");
    expect(image?.alt).toBe("Face-down enemy card");
    expect(image?.dataset.testid).toBe("enemy-card");
    expect(image?.draggable).toBe(false);
    expect(image?.style.aspectRatio).toBe(CARD_ASPECT_RATIO);
    expect(image?.style.objectFit).toBe("cover");
    expect(container.querySelector("button")).toBeNull();

    act(() => root.unmount());
    container.remove();
  });
});
