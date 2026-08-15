// Unit tests for parseCumulusRoute, the pure hash-string -> CumulusRoute parser
// backing the /cumulus doc site's hash router. Each test pins one bug class
// the parser must not regress into (see comments on each case).

import { describe, expect, it } from "vitest";
import { parseCumulusRoute } from "./route";

describe("parseCumulusRoute", () => {
  it.each(["", "#", "#/"])(
    "treats empty hash %j as overview, not a component with id \"\"",
    (hash) => {
      expect(parseCumulusRoute(hash)).toEqual({ view: "overview" });
    },
  );

  it("parses a single segment as a component route", () => {
    expect(parseCumulusRoute("#/glass-button")).toEqual({
      view: "component",
      id: "glass-button",
    });
  });

  it("keeps UI systems in their own route namespace", () => {
    expect(parseCumulusRoute("#/systems/entity-reveals")).toEqual({
      view: "system",
      id: "entity-reveals",
    });
  });

  it("canonicalizes UI system ids", () => {
    expect(parseCumulusRoute("#/SYSTEMS/Entity-Reveals")).toEqual({
      view: "system",
      id: "entity-reveals",
    });
  });

  it("parses a /mockup suffix as a mockup route for that id", () => {
    expect(parseCumulusRoute("#/glass-button/mockup")).toEqual({
      view: "mockup",
      id: "glass-button",
    });
  });

  it("falls back to the component view for an unrecognized trailing segment, rather than crashing or treating it as a mockup", () => {
    expect(parseCumulusRoute("#/glass-button/xyz")).toEqual({
      view: "component",
      id: "glass-button",
    });
  });

  it("canonicalizes ids by trimming and lowercasing so links can't diverge", () => {
    expect(parseCumulusRoute("#/Glass-Button")).toEqual(
      parseCumulusRoute("#/glass-button"),
    );
    expect(parseCumulusRoute("#/Glass-Button")).toEqual({
      view: "component",
      id: "glass-button",
    });
    expect(parseCumulusRoute("#/ glass-button ")).toEqual({
      view: "component",
      id: "glass-button",
    });
  });

  it("tolerates extra leading/trailing/duplicate slashes", () => {
    expect(parseCumulusRoute("#//glass-button//")).toEqual({
      view: "component",
      id: "glass-button",
    });
  });

  it("accepts a hash value without the leading '#'", () => {
    expect(parseCumulusRoute("/glass-button")).toEqual({
      view: "component",
      id: "glass-button",
    });
    expect(parseCumulusRoute("glass-button")).toEqual({
      view: "component",
      id: "glass-button",
    });
  });

  it("canonicalizes the mockup suffix's own case", () => {
    expect(parseCumulusRoute("#/glass-button/Mockup")).toEqual({
      view: "mockup",
      id: "glass-button",
    });
  });
});
