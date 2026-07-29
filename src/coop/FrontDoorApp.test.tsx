// @vitest-environment jsdom

import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "../runtime/runtime-config";

const appMock = vi.hoisted(() => vi.fn(() => <div data-unified-room-app />));

vi.mock("../App", () => ({ default: appMock }));

const { default: FrontDoorApp } = await import("./FrontDoorApp");

describe("FrontDoorApp compatibility entry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    appMock.mockClear();
  });

  it("delegates front-door paths to the unified room runtime", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const runtimeConfig = {
      seedOverride: null,
      aiMode: false,
      gameId: "room42",
      databaseMode: "emulator",
    } as RuntimeConfig;

    act(() => {
      root.render(
        <FrontDoorApp
          runtimeConfig={runtimeConfig}
          entry="tutorial"
          directTutorialBattle
          previewTutorialVictory
        />,
      );
    });

    expect(container.querySelector("[data-unified-room-app]")).not.toBeNull();
    expect(appMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeConfig,
        frontDoorEntry: "tutorial",
        directTutorialBattle: true,
        previewTutorialVictory: true,
      }),
      undefined,
    );
    act(() => root.unmount());
  });
});
