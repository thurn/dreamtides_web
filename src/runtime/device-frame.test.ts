// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  applyDeviceFrame,
  applyDeviceFrameFromSearch,
  parseDeviceFrame,
  type DeviceFrame,
} from "./device-frame";

const FRAME: DeviceFrame = {
  safeArea: { top: 59, right: 0, bottom: 34, left: 0 },
  cutout: { top: 11, left: 133.5, right: 133.5, width: 126, height: 37 },
};

function encode(descriptor: unknown): string {
  return `?deviceFrame=${encodeURIComponent(JSON.stringify(descriptor))}`;
}

afterEach(() => {
  document.documentElement.removeAttribute("style");
});

describe("parseDeviceFrame", () => {
  it("decodes an encoded descriptor with a cutout", () => {
    expect(parseDeviceFrame(encode(FRAME))).toEqual(FRAME);
  });

  it("decodes a descriptor with no cutout", () => {
    const frame = { safeArea: { top: 0, right: 0, bottom: 0, left: 0 } };
    expect(parseDeviceFrame(encode(frame))).toEqual(frame);
  });

  it("returns null when the param is absent", () => {
    expect(parseDeviceFrame("?goto=atlas")).toBeNull();
    expect(parseDeviceFrame("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseDeviceFrame("?deviceFrame=not-json")).toBeNull();
  });

  it("returns null when safeArea is missing or non-numeric", () => {
    expect(parseDeviceFrame(encode({ cutout: FRAME.cutout }))).toBeNull();
    expect(
      parseDeviceFrame(encode({ safeArea: { top: "x" } })),
    ).toBeNull();
  });

  it("drops a malformed cutout but keeps a valid safe area", () => {
    const frame = parseDeviceFrame(
      encode({ safeArea: FRAME.safeArea, cutout: { top: 1 } }),
    );
    expect(frame).toEqual({ safeArea: FRAME.safeArea });
  });

  it("treats omitted safe-area edges as zero", () => {
    expect(parseDeviceFrame(encode({ safeArea: { top: 59 } }))).toEqual({
      safeArea: { top: 59, right: 0, bottom: 0, left: 0 },
    });
  });
});

describe("applyDeviceFrame", () => {
  it("publishes safe-area and cutout custom properties", () => {
    applyDeviceFrame(FRAME);
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--safe-area-inset-top")).toBe("59px");
    expect(root.style.getPropertyValue("--safe-area-inset-bottom")).toBe("34px");
    expect(root.style.getPropertyValue("--display-cutout")).toBe("1");
    expect(root.style.getPropertyValue("--display-cutout-width")).toBe("126px");
    expect(root.style.getPropertyValue("--display-cutout-height")).toBe("37px");
  });

  it("clears stale cutout properties when re-applied without a cutout", () => {
    applyDeviceFrame(FRAME);
    applyDeviceFrame({ safeArea: { top: 0, right: 0, bottom: 0, left: 0 } });
    const root = document.documentElement;
    expect(root.style.getPropertyValue("--display-cutout")).toBe("");
    expect(root.style.getPropertyValue("--display-cutout-width")).toBe("");
    expect(root.style.getPropertyValue("--safe-area-inset-top")).toBe("0px");
  });
});

describe("applyDeviceFrameFromSearch", () => {
  it("applies and returns the frame when the param is present", () => {
    const applied = applyDeviceFrameFromSearch(encode(FRAME));
    expect(applied).toEqual(FRAME);
    expect(
      document.documentElement.style.getPropertyValue("--safe-area-inset-top"),
    ).toBe("59px");
  });

  it("is a no-op that returns null without the param", () => {
    expect(applyDeviceFrameFromSearch("?goto=atlas")).toBeNull();
    expect(
      document.documentElement.style.getPropertyValue("--safe-area-inset-top"),
    ).toBe("");
  });
});
