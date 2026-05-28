// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appImport: vi.fn(),
  createRoot: vi.fn(),
  render: vi.fn(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: mocks.createRoot,
}));

vi.mock("./CardEditorApp", () => ({
  default: function MockCardEditorApp() {
    return null;
  },
}));

vi.mock("../App.tsx", () => {
  mocks.appImport();
  return {
    default: function MockApp() {
      return null;
    },
  };
});

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  mocks.appImport.mockClear();
  mocks.createRoot.mockClear();
  mocks.render.mockClear();
  mocks.createRoot.mockReturnValue({ render: mocks.render });
  vi.resetModules();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("main editor route", () => {
  it("mounts the isolated editor for the Vite-served /editor/ path", async () => {
    window.history.pushState(null, "", "/editor/");

    await import("../main.tsx");

    expect(mocks.appImport).not.toHaveBeenCalled();
    expect(mocks.createRoot).toHaveBeenCalledWith(
      document.getElementById("root"),
    );
    expect(mocks.render).toHaveBeenCalledTimes(1);
  });
});
