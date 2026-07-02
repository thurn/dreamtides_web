// Unit tests for parseTangoRoute, the pure hash-string -> TangoRoute parser
// backing the /tango doc site's hash router. Each test pins one bug class
// the parser must not regress into (see comments on each case).

import { describe, expect, it } from "vitest";
import { parseTangoRoute } from "./route";

describe("parseTangoRoute", () => {
  it.each(["", "#", "#/"])(
    "treats empty hash %j as overview, not a component with id \"\"",
    (hash) => {
      expect(parseTangoRoute(hash)).toEqual({ view: "overview" });
    },
  );

  it("parses a single segment as a component route", () => {
    expect(parseTangoRoute("#/button")).toEqual({
      view: "component",
      id: "button",
    });
  });

  it("parses a /mockup suffix as a mockup route for that id", () => {
    expect(parseTangoRoute("#/button/mockup")).toEqual({
      view: "mockup",
      id: "button",
    });
  });

  it("falls back to the component view for an unrecognized trailing segment, rather than crashing or treating it as a mockup", () => {
    expect(parseTangoRoute("#/button/xyz")).toEqual({
      view: "component",
      id: "button",
    });
  });

  it("canonicalizes ids by trimming and lowercasing so links can't diverge", () => {
    expect(parseTangoRoute("#/Button")).toEqual(parseTangoRoute("#/button"));
    expect(parseTangoRoute("#/Button")).toEqual({
      view: "component",
      id: "button",
    });
    expect(parseTangoRoute("#/ button ")).toEqual({
      view: "component",
      id: "button",
    });
  });

  it("tolerates extra leading/trailing/duplicate slashes", () => {
    expect(parseTangoRoute("#//button//")).toEqual({
      view: "component",
      id: "button",
    });
  });

  it("accepts a hash value without the leading '#'", () => {
    expect(parseTangoRoute("/button")).toEqual({
      view: "component",
      id: "button",
    });
    expect(parseTangoRoute("button")).toEqual({
      view: "component",
      id: "button",
    });
  });

  it("canonicalizes the mockup suffix's own case", () => {
    expect(parseTangoRoute("#/button/Mockup")).toEqual({
      view: "mockup",
      id: "button",
    });
  });
});
