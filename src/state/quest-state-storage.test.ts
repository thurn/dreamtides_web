// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistedQuestState,
  loadQuestState,
  saveQuestState,
} from "./quest-state-storage";
import { createDefaultState } from "./quest-context";
import type { QuestState } from "../types/quest";

const STORAGE_KEY = "quest-prototype-state-v1";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  sessionStorage.clear();
});

describe("loadQuestState", () => {
  it("returns null when nothing has been persisted", () => {
    expect(loadQuestState()).toBeNull();
  });

  it("returns null and clears the slot when the version does not match", () => {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 999, state: createDefaultState() }),
    );

    expect(loadQuestState()).toBeNull();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("returns null when the payload is malformed", () => {
    sessionStorage.setItem(STORAGE_KEY, "this is not json");
    expect(loadQuestState()).toBeNull();
  });

  it("round-trips a saved state through save then load", () => {
    const state: QuestState = {
      ...createDefaultState(),
      essence: 1234,
      screen: { type: "site", siteId: "site-99" },
      currentDreamscape: "dreamscape-7",
    };

    saveQuestState(state);
    const restored = loadQuestState();

    expect(restored).not.toBeNull();
    expect(restored?.essence).toBe(1234);
    expect(restored?.screen).toEqual({ type: "site", siteId: "site-99" });
    expect(restored?.currentDreamscape).toBe("dreamscape-7");
  });

  it("normalizes legacy saved state to include site runtime", () => {
    const legacyState = { ...createDefaultState() } as Partial<QuestState>;
    delete legacyState.siteRuntime;
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, state: legacyState }),
    );

    expect(loadQuestState()?.siteRuntime).toEqual({});
  });
});

describe("clearPersistedQuestState", () => {
  it("removes the persisted entry", () => {
    saveQuestState(createDefaultState());
    expect(sessionStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearPersistedQuestState();
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("is a no-op when nothing is persisted", () => {
    expect(() => {
      clearPersistedQuestState();
    }).not.toThrow();
  });
});
