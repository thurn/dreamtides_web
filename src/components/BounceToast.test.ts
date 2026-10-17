import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BounceToast,
  INVALID_ACTION_MESSAGE,
  bounceMessageForReason,
} from "./BounceToast";

describe("bounceMessageForReason", () => {
  it("describes a domain bounce as an invalid action", () => {
    expect(bounceMessageForReason("invalid_action")).toBe(
      INVALID_ACTION_MESSAGE,
    );
    expect(bounceMessageForReason(undefined)).toBe(INVALID_ACTION_MESSAGE);
  });

  it("gives distinct copy for pending prompts and internal errors", () => {
    expect(bounceMessageForReason("prompt_pending")).not.toBe(INVALID_ACTION_MESSAGE);
    expect(bounceMessageForReason("fold_error")).not.toBe(INVALID_ACTION_MESSAGE);
  });
});

describe("BounceToast", () => {
  it("renders its status toast inside its own Cumulus token scope", () => {
    // LocalGameProvider mounts the toast outside every screen's scope, so
    // the toast's outermost element must establish one.
    const markup = renderToStaticMarkup(createElement(BounceToast));
    expect(markup).toMatch(
      /^<div [^>]*class="cumulus"[^>]*>.*data-transient-status-toast/s,
    );
  });
});
