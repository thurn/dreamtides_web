// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  isPushedDetailHistoryEntry,
  parseDetailIdFromUrl,
  pushDetailIdInUrl,
  replaceDetailIdInUrl,
} from "./avatar-detail-url-state";
import { testAvatarId } from "../types/test-identities";

const DETAIL_ID = testAvatarId("detail");

describe("Avatar detail URL state", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/avatars");
  });

  it("returns null when no detail parameter is present", () => {
    expect(parseDetailIdFromUrl("")).toBeNull();
    expect(parseDetailIdFromUrl("?q=Aurora&sort=name")).toBeNull();
    expect(parseDetailIdFromUrl("?detail=")).toBeNull();
  });

  it("reads the selected avatar id from the detail parameter", () => {
    expect(parseDetailIdFromUrl(`?detail=${DETAIL_ID}`)).toBe(DETAIL_ID);
    expect(parseDetailIdFromUrl(`?q=Aurora&detail=${DETAIL_ID}&sort=name`)).toBe(DETAIL_ID);
  });

  it("pushes a marked history entry that preserves existing list parameters", () => {
    window.history.replaceState(null, "", "/avatars?q=Aurora&sort=name");

    pushDetailIdInUrl(DETAIL_ID);

    expect(parseDetailIdFromUrl(window.location.search)).toBe(DETAIL_ID);
    expect(window.location.search).toContain("q=Aurora");
    expect(window.location.search).toContain("sort=name");
    expect(isPushedDetailHistoryEntry()).toBe(true);
  });

  it("replacing the detail parameter clears it without marking the entry", () => {
    pushDetailIdInUrl(DETAIL_ID);
    expect(parseDetailIdFromUrl(window.location.search)).toBe(DETAIL_ID);

    replaceDetailIdInUrl(null);

    expect(parseDetailIdFromUrl(window.location.search)).toBeNull();
    expect(isPushedDetailHistoryEntry()).toBe(false);
  });

  it("does not treat the originating list entry as a pushed detail entry", () => {
    expect(isPushedDetailHistoryEntry()).toBe(false);
  });
});
