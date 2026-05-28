import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEditorCards, saveEditorCardField } from "./editor-api";

afterEach(() => {
  vi.unstubAllGlobals();
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
});
