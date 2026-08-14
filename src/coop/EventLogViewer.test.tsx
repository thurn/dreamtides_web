// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asRoomId } from "../types/identifiers";

const fake = vi.hoisted(() => ({
  onCorrupt: null as (() => void) | null,
}));

vi.mock("../eventlog/subscribe", () => ({
  subscribeToLog: (
    _db: unknown,
    _gameId: string,
    _onNode: unknown,
    onCorrupt?: () => void,
  ) => {
    fake.onCorrupt = onCorrupt ?? null;
    return () => {
      fake.onCorrupt = null;
    };
  },
}));

vi.mock("./journey-log-sink", () => ({
  readRoomLogLines: vi.fn(() => Promise.resolve([])),
}));

const { EventLogViewer } = await import("./EventLogViewer");

describe("EventLogViewer", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    fake.onCorrupt = null;
  });

  it("surfaces a corrupt decoded event log instead of waiting forever", async () => {
    await act(async () => {
      root.render(
        <EventLogViewer db={{} as never} gameId={asRoomId("room1")} />,
      );
      await Promise.resolve();
    });

    act(() => {
      fake.onCorrupt?.();
    });

    const alert = container.querySelector("[role='alert']");
    expect(alert?.textContent).toContain("event log node is corrupted");
    expect(container.textContent).toContain("decoded log unreadable");
  });
});
