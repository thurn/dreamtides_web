// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { IntroSection } from "./IntroSection";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Cumulus design philosophy prose", () => {
  it("visibly separates adjacent authored paragraphs", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<IntroSection />));

    const principleBodies = Array.from(
      container.querySelectorAll<HTMLElement>(
        "[data-cumulus-doc-principle-body]",
      ),
    );
    const longFormBody = principleBodies.find(
      (body) => body.querySelectorAll(":scope > p").length > 1,
    );

    expect(longFormBody).toBeDefined();
    expect(longFormBody?.style.gap).toBe("var(--space-l)");

    act(() => root.unmount());
  });
});
