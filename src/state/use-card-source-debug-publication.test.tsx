// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { CardSourceDebugState } from "../types/quest";
import type { QuestMutations } from "./quest-context";
import { useCardSourceDebugPublication } from "./use-card-source-debug-publication";

const debugState: CardSourceDebugState = {
  screenLabel: "Draft",
  surface: "Draft",
  entries: [],
};

function Publisher({ publish }: { publish: QuestMutations["setCardSourceDebug"] }) {
  useCardSourceDebugPublication(publish, debugState, "shown", "hidden");
  return null;
}

describe("useCardSourceDebugPublication", () => {
  it("publishes once through StrictMode replay and clears once on final unmount", async () => {
    const publish = vi.fn<QuestMutations["setCardSourceDebug"]>();
    const container = document.createElement("div");
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <StrictMode>
          <Publisher publish={publish} />
        </StrictMode>,
      );
      await Promise.resolve();
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.slice(0, 2)).toEqual([debugState, "shown"]);

    await act(async () => {
      root.unmount();
      await Promise.resolve();
    });

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[1]?.slice(0, 2)).toEqual([null, "hidden"]);
  });
});
