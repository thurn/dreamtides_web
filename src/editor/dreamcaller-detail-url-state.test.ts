// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  isPushedDetailHistoryEntry,
  parseDetailIdFromUrl,
  pushDetailIdInUrl,
  replaceDetailIdInUrl,
} from "./dreamcaller-detail-url-state";

describe("Dreamcaller detail URL state", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/dreamcallers");
  });

  it("returns null when no detail parameter is present", () => {
    expect(parseDetailIdFromUrl("")).toBeNull();
    expect(parseDetailIdFromUrl("?q=Aurora&sort=name")).toBeNull();
    expect(parseDetailIdFromUrl("?detail=")).toBeNull();
  });

  it("reads the selected dreamcaller id from the detail parameter", () => {
    expect(parseDetailIdFromUrl("?detail=abc-123")).toBe("abc-123");
    expect(parseDetailIdFromUrl("?q=Aurora&detail=abc-123&sort=name")).toBe("abc-123");
  });

  it("pushes a marked history entry that preserves existing list parameters", () => {
    window.history.replaceState(null, "", "/dreamcallers?q=Aurora&sort=name");

    pushDetailIdInUrl("abc-123");

    expect(parseDetailIdFromUrl(window.location.search)).toBe("abc-123");
    expect(window.location.search).toContain("q=Aurora");
    expect(window.location.search).toContain("sort=name");
    expect(isPushedDetailHistoryEntry()).toBe(true);
  });

  it("replacing the detail parameter clears it without marking the entry", () => {
    pushDetailIdInUrl("abc-123");
    expect(parseDetailIdFromUrl(window.location.search)).toBe("abc-123");

    replaceDetailIdInUrl(null);

    expect(parseDetailIdFromUrl(window.location.search)).toBeNull();
    expect(isPushedDetailHistoryEntry()).toBe(false);
  });

  it("does not treat the originating list entry as a pushed detail entry", () => {
    expect(isPushedDetailHistoryEntry()).toBe(false);
  });
});
