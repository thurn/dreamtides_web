// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  editorTomlParam,
  loadEditorCards,
  saveEditorCardField,
} from "./editor-api";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/editor");
});

describe("editor-api", () => {
  it("falls back to the HTTP status for non-JSON error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("Bad gateway", { status: 502 }))),
    );

    await expect(loadEditorCards()).rejects.toThrow(
      "Editor API request failed with 502",
    );
  });

  it("falls back to the HTTP status for empty error responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("", { status: 503 }))),
    );

    await expect(loadEditorCards()).rejects.toThrow(
      "Editor API request failed with 503",
    );
  });

  it("preserves JSON error messages from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                error: { message: "Card source unavailable" },
              }),
              { status: 500 },
            ),
          ),
      ),
    );

    await expect(loadEditorCards()).rejects.toThrow("Card source unavailable");
  });

  it("preserves structured validation errors from save responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  code: "INVALID_EDIT",
                  details: { field: "name" },
                  message: "Name cannot be blank.",
                },
              }),
              { status: 400 },
            ),
          ),
      ),
    );

    await expect(
      saveEditorCardField({
        field: "name",
        id: "card-id",
        value: "",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_EDIT",
      details: { field: "name" },
      message: "Name cannot be blank.",
      status: 400,
    });
  });

  it("passes an abort signal to the card load request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ cards: [] }), { status: 200 }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(loadEditorCards(controller.signal)).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/editor/cards",
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("reads the toml selection from the URL", () => {
    expect(editorTomlParam()).toBeNull();

    window.history.replaceState({}, "", "/editor?toml=data/tabula/cards.toml");
    expect(editorTomlParam()).toBe("data/tabula/cards.toml");

    window.history.replaceState({}, "", "/editor?toml=");
    expect(editorTomlParam()).toBeNull();
  });

  it("forwards the toml selection on the card load request", async () => {
    window.history.replaceState({}, "", "/editor?toml=data/tabula/cards.toml");
    const fetchMock = vi.fn(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ cards: [] }), { status: 200 }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadEditorCards();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/editor/cards?toml=data%2Ftabula%2Fcards.toml",
      expect.anything(),
    );
  });

  it("forwards the toml selection on the field save request", async () => {
    window.history.replaceState({}, "", "/editor?toml=cards.toml");
    const fetchMock = vi.fn(
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ card: {} }), { status: 200 }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await saveEditorCardField({ field: "name", id: "card-id", value: "Renamed" });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/editor/cards/card-id?toml=cards.toml",
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
