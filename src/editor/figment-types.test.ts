import { describe, expect, it } from "vitest";
import { figmentHasTitleBar } from "./figment-types";

describe("figmentHasTitleBar", () => {
  it("hides the title bar when the figment's identity matches its subtype", () => {
    // A plain figment whose name is just "<Subtype> Figment" reads its identity
    // off the foot type line, so it needs no title bar.
    expect(figmentHasTitleBar("Warrior Figment", "Warrior")).toBe(false);
    expect(figmentHasTitleBar("Ancient Figment", "Ancient")).toBe(false);
    expect(figmentHasTitleBar("Spirit Animal Figment", "Spirit Animal")).toBe(
      false,
    );
  });

  it("shows the title bar when the identity differs from the subtype", () => {
    // A named figment that shares a card type with a plain figment (a
    // Legionnaire that is a Warrior) needs a title bar to disambiguate.
    expect(figmentHasTitleBar("Legionnaire Figment", "Warrior")).toBe(true);
  });

  it("ignores case and the trailing Figment suffix", () => {
    expect(figmentHasTitleBar("warrior figment", "Warrior")).toBe(false);
    expect(figmentHasTitleBar("Warrior", "warrior")).toBe(false);
  });

  it("shows no title bar for a nameless figment", () => {
    expect(figmentHasTitleBar("", "Warrior")).toBe(false);
    expect(figmentHasTitleBar("Figment", "Warrior")).toBe(false);
  });
});
