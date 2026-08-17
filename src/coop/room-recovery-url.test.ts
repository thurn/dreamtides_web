import { describe, expect, it } from "vitest";
import { recoveryUrlFromLocation } from "./room-recovery-url";

describe("recoveryUrlFromLocation", () => {
  it("builds an explicit cold route for the same emulator room", () => {
    expect(
      recoveryUrlFromLocation(
        "http://localhost:5173/dreamscape/1-frostforge?game=yu3nox",
      ),
    ).toBe("http://localhost:5173/recover?game=yu3nox");
  });

  it("preserves cloud database selection", () => {
    expect(
      recoveryUrlFromLocation(
        "https://example.test/tutorial?realtime=1&game=room42",
      ),
    ).toBe("https://example.test/recover?game=room42&realtime=1");
  });

  it("rejects a URL without a valid room identity", () => {
    expect(recoveryUrlFromLocation("https://example.test/tutorial")).toBeNull();
  });
});
