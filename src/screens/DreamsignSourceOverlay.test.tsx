// @vitest-environment jsdom

import { act } from "react";
import type { HTMLAttributes, ReactElement, ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DreamsignSourceOverlay } from "./DreamsignSourceOverlay";
import type { Dreamsign } from "../types/quest";
import type { DreamsignTemplate } from "../types/content";

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    aside: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      transition: _transition,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      transition?: unknown;
    } & HTMLAttributes<HTMLElement>) => <aside {...props}>{children}</aside>,
  },
}));

function makeOfferedDreamsigns(): Dreamsign[] {
  return [
    {
      id: "embers-whisper",
      name: "Ember's Whisper",
      effectDescription: "Fire.",
      isBane: false,
    },
    {
      id: "drifter-mark",
      name: "Drifter Mark",
      effectDescription: "Wander.",
      isBane: false,
    },
  ];
}

function makeTemplates(): DreamsignTemplate[] {
  return [
    {
      id: "embers-whisper",
      name: "Ember's Whisper",
      effectDescription: "Fire.",
      packageTides: ["core", "support-a"],
    },
    {
      id: "drifter-mark",
      name: "Drifter Mark",
      effectDescription: "Wander.",
      packageTides: ["outsider"],
    },
    {
      id: "glacial-insight",
      name: "Glacial Insight",
      effectDescription: "Ice.",
      packageTides: ["core"],
    },
  ];
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DreamsignSourceOverlay", () => {
  it("renders the surface label and offered dreamsign names", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={vi.fn()}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={["core"]}
        optionalTides={["support-a"]}
        remainingPoolSize={3}
      />,
    );

    expect(container.textContent).toContain("Why am I seeing these dreamsigns?");
    expect(container.textContent).toContain("Dreamsign Draft");
    expect(container.textContent).toContain("Ember's Whisper");
    expect(container.textContent).toContain("Drifter Mark");

    act(() => {
      root.unmount();
    });
  });

  it("labels dreamsigns matching a selected tide as selected and shows their matched tides", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={vi.fn()}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={[makeOfferedDreamsigns()[0]]}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={["core"]}
        optionalTides={["support-a"]}
        remainingPoolSize={3}
      />,
    );

    expect(container.textContent).toContain("selected");
    expect(container.textContent).toContain("core");
    expect(container.textContent).toContain("support-a");

    act(() => {
      root.unmount();
    });
  });

  it("labels dreamsigns with no overlapping selected tide as fallback", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={vi.fn()}
        screenLabel="Dreamsign Offering"
        offeredDreamsigns={[makeOfferedDreamsigns()[1]]}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={["core"]}
        optionalTides={["support-a"]}
        remainingPoolSize={2}
      />,
    );

    expect(container.textContent).toContain("fallback");
    expect(container.textContent).toContain("outsider");

    act(() => {
      root.unmount();
    });
  });

  it("renders the remaining dreamsign pool size in the header copy", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={vi.fn()}
        screenLabel="Dreamsign Offering"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={["core"]}
        optionalTides={[]}
        remainingPoolSize={7}
      />,
    );

    expect(container.textContent).toContain("7");

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={onClose}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={[]}
        optionalTides={[]}
        remainingPoolSize={2}
      />,
    );

    const closeButton = Array.from(
      container.querySelectorAll("button"),
    ).find(
      (candidate) =>
        candidate.getAttribute("aria-label") === "Close dreamsign source overlay",
    );
    if (!closeButton) {
      throw new Error("close button not rendered");
    }
    act(() => {
      closeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    const { root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={onClose}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={[]}
        optionalTides={[]}
        remainingPoolSize={2}
      />,
    );

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("calls onClose when the surrounding backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={onClose}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={[]}
        optionalTides={[]}
        remainingPoolSize={2}
      />,
    );

    const backdrop = container.querySelector(
      "[data-testid='dreamsign-source-overlay-backdrop']",
    );
    if (!backdrop) {
      throw new Error("backdrop not rendered");
    }
    act(() => {
      backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });

  it("does not close when a click bubbles up from inside the panel", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={onClose}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={[]}
        optionalTides={[]}
        remainingPoolSize={2}
      />,
    );

    const panel = container.querySelector("aside");
    if (!panel) {
      throw new Error("panel not rendered");
    }
    act(() => {
      panel.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });

  it("renders nothing when isOpen is false", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen={false}
        onClose={vi.fn()}
        screenLabel="Dreamsign Draft"
        offeredDreamsigns={makeOfferedDreamsigns()}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={[]}
        optionalTides={[]}
        remainingPoolSize={0}
      />,
    );

    expect(container.textContent).not.toContain("Why am I seeing these dreamsigns?");

    act(() => {
      root.unmount();
    });
  });

  it("handles offered dreamsigns whose template has no matching entry without crashing", () => {
    const { container, root } = mount(
      <DreamsignSourceOverlay
        isOpen
        onClose={vi.fn()}
        screenLabel="Dreamsign Offering"
        offeredDreamsigns={[
          { id: "unknown-id", name: "Mystery", effectDescription: "?", isBane: false },
        ]}
        dreamsignTemplates={makeTemplates()}
        mandatoryTides={["core"]}
        optionalTides={[]}
        remainingPoolSize={1}
      />,
    );

    expect(container.textContent).toContain("Mystery");
    // missing-template entries should be shown as fallback (no tide overlap data)
    expect(container.textContent).toContain("fallback");

    act(() => {
      root.unmount();
    });
  });
});
