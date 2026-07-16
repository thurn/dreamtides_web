// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { BattleActionBar } from "./BattleActionBar";

describe("BattleActionBar", () => {
  it("keeps automation controls off the battle surface", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    act(() => {
      root.render(
        <BattleActionBar
          isBattleLogOpen={false}
          isDesktopInspectorLayout
          isInspectorDrawerOpen={false}
          onOpenForesee={vi.fn()}
          onToggleBattleLog={vi.fn()}
          onToggleDreamwellHistory={vi.fn()}
          onToggleInspector={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-battle-action="toggle-automation"]')).toBeNull();
    expect(container.querySelector('[aria-label^="Basic automation"]')).toBeNull();
    expect(container.textContent).toContain("Dreamwell");
    expect(container.textContent).toContain("Log");

    act(() => {
      root.unmount();
    });
  });
});
