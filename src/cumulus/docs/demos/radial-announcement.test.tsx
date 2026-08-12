// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { radialAnnouncementDemo } from "./radial-announcement";
import { CumulusRoot } from "../../CumulusRoot";

describe("RadialAnnouncement documentation demo", () => {
  it("keeps the transient announcement visible as a frozen specimen", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const Demo = radialAnnouncementDemo.Component;

    act(() =>
      root.render(
        <CumulusRoot>
          <Demo tone="reward" />
        </CumulusRoot>,
      ),
    );

    const frozenDemo = container.querySelector(
      "[data-radial-announcement-demo-frozen]",
    );
    const freezeStyles = frozenDemo?.querySelector("style")?.textContent;

    expect(frozenDemo?.querySelector("[data-radial-announcement]")).not.toBeNull();
    expect(freezeStyles).toContain("[data-radial-announcement-disc]");
    expect(freezeStyles).toContain("[data-radial-announcement-copy]");
    expect(freezeStyles).toContain("animation: none !important");

    act(() => root.unmount());
    container.remove();
  });
});
