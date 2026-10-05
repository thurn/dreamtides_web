import { describe, it, expect } from "vitest";
import {
  LAYER_COUNT,
  LAYER_ORDER,
  LayerName,
  isLayerName,
  layerAtOrdinal,
  layerDisplayNumber,
  layerOrdinal,
  layerRoman,
  nextLayer,
} from "./layer-name";

describe("LayerName ordinals and display", () => {
  it("orders the seven layers from One to Seven", () => {
    expect(LAYER_COUNT).toBe(7);
    expect(LAYER_ORDER[0]).toBe(LayerName.One);
    expect(LAYER_ORDER[LAYER_COUNT - 1]).toBe(LayerName.Seven);
  });

  it("maps each layer to a 0-based ordinal and back", () => {
    for (let ordinal = 0; ordinal < LAYER_COUNT; ordinal += 1) {
      const layer = layerAtOrdinal(ordinal);
      expect(layer).toBeDefined();
      expect(layerOrdinal(layer as LayerName)).toBe(ordinal);
    }
  });

  it("returns undefined for an out-of-range ordinal", () => {
    expect(layerAtOrdinal(-1)).toBeUndefined();
    expect(layerAtOrdinal(LAYER_COUNT)).toBeUndefined();
  });

  it("shows a 1-based player number, one above the ordinal", () => {
    expect(layerDisplayNumber(LayerName.One)).toBe(1);
    expect(layerDisplayNumber(LayerName.Seven)).toBe(7);
  });

  it("renders Roman numerals matching the display number", () => {
    expect(layerRoman(LayerName.One)).toBe("I");
    expect(layerRoman(LayerName.Four)).toBe("IV");
    expect(layerRoman(LayerName.Seven)).toBe("VII");
  });

  it("steps to the next deeper layer and stops past the boss", () => {
    expect(nextLayer(LayerName.One)).toBe(LayerName.Two);
    expect(nextLayer(LayerName.Six)).toBe(LayerName.Seven);
    expect(nextLayer(LayerName.Seven)).toBeUndefined();
  });
});

describe("isLayerName", () => {
  it("recognizes only the enum string values as LayerName", () => {
    expect(isLayerName("three")).toBe(true);
    expect(isLayerName("Three")).toBe(false);
    expect(isLayerName(2)).toBe(false);
  });
});
