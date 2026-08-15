// @vitest-environment node

import fs from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { gameDataRonPlugin } from "../vite.config.ts";

function server() {
  return {
    httpServer: { once: vi.fn() },
    watcher: { once: vi.fn() },
    ws: { send: vi.fn() },
  };
}

describe("RON generation Vite integration", () => {
  it("materializes on startup and debounces regeneration by dataset", async () => {
    vi.useFakeTimers();
    const rootDir = "/fixture";
    const ensure = vi.fn().mockResolvedValue({ ok: true });
    const listeners = new Map();
    const watch = vi.spyOn(fs, "watch").mockImplementation((directory, _options, listener) => {
      listeners.set(directory, listener);
      return { close: vi.fn() };
    });
    const instance = server();
    try {
      await gameDataRonPlugin({
        rootDir,
        ensure,
        debounceMs: 10,
        list: () => ({ datasets: [
          { id: "cards", source: "data/cards.ron" },
          { id: "draft", source: "data/draft_site.ron" },
        ] }),
      }).configureServer(instance);
      expect(ensure).toHaveBeenNthCalledWith(1, { rootDir });
      const listener = listeners.get(join(rootDir, "data"));
      listener("change", "cards.ron");
      listener("change", "cards.ron");
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();
      expect(ensure).toHaveBeenCalledTimes(2);
      expect(ensure).toHaveBeenLastCalledWith({ rootDir, dataset: "cards" });
      expect(instance.ws.send).toHaveBeenCalledWith({
        type: "custom",
        event: "game-data:generated",
        data: { datasetId: "cards", source: "data/cards.ron" },
      });
    } finally {
      watch.mockRestore();
      vi.useRealTimers();
    }
  });

  it("reports an invalid candidate and accepts a later valid save", async () => {
    vi.useFakeTimers();
    const rootDir = "/fixture";
    const ensure = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("MALFORMED_SOURCE: line 4, column 2"))
      .mockResolvedValueOnce({ ok: true });
    let listener;
    const watch = vi.spyOn(fs, "watch").mockImplementation((_directory, _options, callback) => {
      listener = callback;
      return { close: vi.fn() };
    });
    const instance = server();
    try {
      await gameDataRonPlugin({
        rootDir, ensure, debounceMs: 10,
        list: () => ({ datasets: [{ id: "draft", source: "data/draft_site.ron" }] }),
      }).configureServer(instance);
      listener("change", "draft_site.ron");
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();
      expect(instance.ws.send).toHaveBeenCalledWith(expect.objectContaining({
        type: "error",
        err: expect.objectContaining({ message: expect.stringContaining("draft") }),
      }));
      listener("change", "draft_site.ron");
      await vi.advanceTimersByTimeAsync(10);
      await Promise.resolve();
      expect(ensure).toHaveBeenCalledTimes(3);
      expect(instance.ws.send).toHaveBeenCalledWith(expect.objectContaining({
        type: "custom",
        event: "game-data:generated",
      }));
    } finally {
      watch.mockRestore();
      vi.useRealTimers();
    }
  });
});
