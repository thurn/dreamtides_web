// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it } from "vitest";
import { GLOSSARY_IDS } from "../../../data/glossary";
import { CumulusRoot } from "../../CumulusRoot";
import { EssenceValue } from "./EssenceValue";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

describe("EssenceValue", () => {
  it("owns the solid reward badge presentation", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => {
      root.render(
        <EssenceValue amount="+15" tone="mark" variant="rewardBadge" />,
      );
    });

    const value = container.querySelector<HTMLElement>("[data-essence-value]");
    expect(value?.dataset.essenceValueVariant).toBe("rewardBadge");
    expect(value?.style.paddingBlock).toBe("var(--space-s)");
    expect(value?.style.paddingInline).toBe("var(--space-m)");
    expect(value?.dataset.essenceValueTone).toBe("mark");
    expect(value?.style.font).toBe("var(--t-numeral-lg)");
    expect(value?.style.background).toBe("var(--surface-chrome)");
    expect(value?.style.borderRadius).toBe("var(--radius-pill)");
    expect(value?.style.color).toBe("var(--text-primary)");
    expect((value?.lastElementChild as HTMLElement | null)?.style.color).toBe(
      "var(--essence)",
    );
    expect(value?.querySelector("i.bxf.bx-crypto")).not.toBeNull();

    act(() => root.unmount());
  });

  it("derives an icon InfoCard from Essence domain data", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <CumulusRoot>
          <EssenceValue
            amount={120}
            entity={{
              id: "journey-start-caller",
              glossaryId: GLOSSARY_IDS.startingEssence,
            }}
          />
        </CumulusRoot>,
      );
    });

    const source = container.querySelector<HTMLElement>(
      "[data-essence-source]",
    );
    expect(source?.dataset.revealFeedback).toBe("measured");
    expect(source?.dataset.revealEntityType).toBe("resource-essence");
    expect(source?.dataset.revealEntityId).toMatch(/^[0-9a-f-]{36}$/);
    expect(source?.dataset.revealPrimaryVariant).toBe("icon");
    expect(source?.dataset.revealSecondaryTitles).toBe("");

    act(() => root.unmount());
    container.remove();
  });
});
