import { describe, expect, it } from "vitest";
import {
  loadFavoriteImageNumbers,
  parseFavoriteImageNumbers,
  persistFavoriteImageNumbers,
} from "./image-viewer-favorites";

describe("parseFavoriteImageNumbers", () => {
  it("normalizes a persisted image-number list", () => {
    expect([
      ...parseFavoriteImageNumbers('[" 300 ","100","300",7,""]'),
    ]).toEqual(["300", "100"]);
  });

  it("returns an empty set for malformed or non-array data", () => {
    expect(parseFavoriteImageNumbers("not json").size).toBe(0);
    expect(parseFavoriteImageNumbers('{"imageNumber":"100"}').size).toBe(0);
  });
});

describe("favorite image-number persistence", () => {
  it("writes a stable list and reads it back", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };

    persistFavoriteImageNumbers(new Set(["300", "100"]), storage);

    expect(stored).toBe('["100","300"]');
    expect([...loadFavoriteImageNumbers(storage)]).toEqual(["100", "300"]);
  });

  it("degrades to empty when storage cannot be read", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => undefined,
    };

    expect(loadFavoriteImageNumbers(storage).size).toBe(0);
  });
});
