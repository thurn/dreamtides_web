// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryCheckpointCommitter } from "./RecoveryCheckpointCommitter";

const mocks = vi.hoisted(() => ({
  write: vi.fn(),
  log: vi.fn(),
}));

vi.mock("./hooks", () => ({
  useRoomRecoveryContext: () => ({
    db: {},
    roomId: "fixture-room",
    genesis: {},
    confirmedGameState: {},
    confirmedHead: 7,
    confirmedGeneration: 2,
  }),
}));

vi.mock("./room-recovery", () => ({
  buildRoomRecoveryCheckpoint: () => ({
    checkpointId: "2:7:fixture",
    generation: 2,
    sourceHead: 7,
    sourcePath: "/tutorial",
    stateHash: "fixture",
  }),
  writeRoomRecoveryCheckpoint: mocks.write,
}));

vi.mock("../logging", () => ({ logEvent: mocks.log }));

describe("RecoveryCheckpointCommitter", () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.useFakeTimers();
    mocks.write.mockReset();
    mocks.log.mockReset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("retries the same checkpoint after a transient write failure", async () => {
    mocks.write
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(true);

    await act(async () => {
      root.render(<RecoveryCheckpointCommitter sourcePath="/tutorial" />);
      await Promise.resolve();
    });
    expect(mocks.write).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(mocks.write).toHaveBeenCalledTimes(2);
    expect(mocks.log).toHaveBeenCalledWith(
      "room_recovery_checkpoint_written",
      expect.objectContaining({ checkpointId: "2:7:fixture" }),
    );
  });
});
