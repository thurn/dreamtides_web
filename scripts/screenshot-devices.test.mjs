import { describe, expect, it } from "vitest";
import {
  deviceCutoutBox,
  deviceFrameDescriptor,
  deviceSafeArea,
} from "./screenshot-devices.mjs";

// Synthetic devices — the derivation is exercised against fixtures defined
// here, not the live DEVICES registry, so tuning a real device's geometry never
// breaks these tests.
const ISLAND_PHONE = {
  logicalWidth: 393,
  cutout: { type: "island", width: 126, height: 37, top: 11 },
  home: "ios",
};

const PUNCH_PHONE = {
  logicalWidth: 480,
  cutout: { type: "punch-hole", height: 12, top: 15 },
  home: "android",
};

const NOTCHLESS_PHONE = {
  logicalWidth: 375,
  cutout: { type: "none" },
  home: "none",
};

describe("deviceCutoutBox", () => {
  it("centers an island and reports equal left/right insets", () => {
    const box = deviceCutoutBox(ISLAND_PHONE);
    expect(box).toEqual({
      top: 11,
      left: (393 - 126) / 2,
      right: (393 - 126) / 2,
      width: 126,
      height: 37,
    });
  });

  it("uses the punch-hole diameter as its width", () => {
    const box = deviceCutoutBox(PUNCH_PHONE);
    expect(box.width).toBe(12);
    expect(box.height).toBe(12);
    expect(box.left).toBe((480 - 12) / 2);
  });

  it("returns null when there is no cutout", () => {
    expect(deviceCutoutBox(NOTCHLESS_PHONE)).toBeNull();
  });
});

describe("deviceSafeArea", () => {
  it("seats the island top inset just below the cutout and reserves the iOS bar", () => {
    expect(deviceSafeArea(ISLAND_PHONE)).toEqual({
      top: 11 + 37 + 11,
      right: 0,
      bottom: 34,
      left: 0,
    });
  });

  it("reserves an Android gesture bar and a punch-hole status band", () => {
    expect(deviceSafeArea(PUNCH_PHONE)).toEqual({
      top: 15 + 12 + 12,
      right: 0,
      bottom: 24,
      left: 0,
    });
  });

  it("is all-zero for a notchless phone with a physical home button", () => {
    expect(deviceSafeArea(NOTCHLESS_PHONE)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });

  it("prefers an explicit safeArea override", () => {
    const override = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(deviceSafeArea({ ...ISLAND_PHONE, safeArea: override })).toBe(
      override,
    );
  });
});

describe("deviceFrameDescriptor", () => {
  it("includes the cutout box when the cutout is painted", () => {
    const descriptor = deviceFrameDescriptor(ISLAND_PHONE, true);
    expect(descriptor.safeArea).toEqual(deviceSafeArea(ISLAND_PHONE));
    expect(descriptor.cutout).toEqual(deviceCutoutBox(ISLAND_PHONE));
  });

  it("omits the cutout when it is not painted (--no-cutout)", () => {
    const descriptor = deviceFrameDescriptor(ISLAND_PHONE, false);
    expect(descriptor.cutout).toBeUndefined();
    expect(descriptor.safeArea).toBeDefined();
  });
});
