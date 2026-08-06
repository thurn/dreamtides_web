// @vitest-environment node

import fs from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  glossaryDataHotReloadPlugin,
  glossaryDataWatchPath,
} from "../vite.config.ts";

describe("glossary data hot reload Vite integration", () => {
  it("invalidates the cached raw TOML module before notifying the app", async () => {
    vi.useFakeTimers();
    let onChange;
    const close = vi.fn();
    const watch = vi.spyOn(fs, "watch").mockImplementation(
      (_path, _options, listener) => {
        onChange = listener;
        return { close };
      },
    );
    const onFileChange = vi.fn();
    const send = vi.fn();
    const refreshAtlasData = vi.fn();
    const server = {
      httpServer: { once: vi.fn() },
      watcher: { once: vi.fn() },
      moduleGraph: { onFileChange },
      ws: { send },
    };

    try {
      glossaryDataHotReloadPlugin(refreshAtlasData).configureServer(server);
      expect(onChange).toBeTypeOf("function");

      onChange("change", "glossary.toml");
      await vi.advanceTimersByTimeAsync(120);

      expect(refreshAtlasData).toHaveBeenCalledOnce();
      expect(onFileChange).toHaveBeenCalledWith(glossaryDataWatchPath);
      expect(send).toHaveBeenCalledWith({
        type: "custom",
        event: "glossary-data:changed",
      });
      expect(onFileChange.mock.invocationCallOrder[0]).toBeLessThan(
        send.mock.invocationCallOrder[0],
      );
    } finally {
      watch.mockRestore();
      vi.useRealTimers();
    }
  });

  it("ignores other TOML files in the shared source directory", async () => {
    vi.useFakeTimers();
    let onChange;
    const watch = vi.spyOn(fs, "watch").mockImplementation(
      (_path, _options, listener) => {
        onChange = listener;
        return { close: vi.fn() };
      },
    );
    const onFileChange = vi.fn();
    const send = vi.fn();
    const refreshAtlasData = vi.fn();

    try {
      glossaryDataHotReloadPlugin(refreshAtlasData).configureServer({
        httpServer: { once: vi.fn() },
        watcher: { once: vi.fn() },
        moduleGraph: { onFileChange },
        ws: { send },
      });

      onChange("change", "cards.toml");
      await vi.advanceTimersByTimeAsync(120);

      expect(refreshAtlasData).not.toHaveBeenCalled();
      expect(onFileChange).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
    } finally {
      watch.mockRestore();
      vi.useRealTimers();
    }
  });
});
