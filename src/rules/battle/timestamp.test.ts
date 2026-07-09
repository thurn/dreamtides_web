import { describe, expect, it } from "vitest";
import { isoTimestampToMs } from "./timestamp";

describe("isoTimestampToMs", () => {
  it("parses a canonical ISO-8601 UTC timestamp", () => {
    expect(isoTimestampToMs("1970-01-01T00:00:00.000Z")).toBe(0);
    expect(isoTimestampToMs("2026-07-08T12:34:56.789Z")).toBe(
      Date.UTC(2026, 6, 8, 12, 34, 56, 789),
    );
  });

  it("parses without a milliseconds component", () => {
    expect(isoTimestampToMs("2026-07-08T12:34:56Z")).toBe(
      Date.UTC(2026, 6, 8, 12, 34, 56, 0),
    );
  });

  it("round-trips new Date().toISOString()", () => {
    const now = new Date(Date.UTC(2024, 2, 3, 4, 5, 6, 7));
    expect(isoTimestampToMs(now.toISOString())).toBe(now.getTime());
  });

  it("rejects a natural-language date", () => {
    expect(isoTimestampToMs("July 8 2026")).toBeNull();
  });

  it("rejects a non-UTC-offset timestamp", () => {
    expect(isoTimestampToMs("2026-07-08T12:34:56.789+05:00")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(isoTimestampToMs("")).toBeNull();
    expect(isoTimestampToMs("not-a-date")).toBeNull();
    expect(isoTimestampToMs("2026-07-08")).toBeNull();
  });

  it("rejects a calendar-invalid date instead of normalizing it", () => {
    expect(isoTimestampToMs("2026-13-01T00:00:00.000Z")).toBeNull();
    expect(isoTimestampToMs("2026-02-30T00:00:00.000Z")).toBeNull();
  });

  it("never returns NaN", () => {
    for (const input of ["", "garbage", "2026-99-99T99:99:99.999Z"]) {
      const result = isoTimestampToMs(input);
      expect(result === null || Number.isFinite(result)).toBe(true);
    }
  });
});
