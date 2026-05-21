// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { HTMLAttributes, ReactNode } from "react";
import { SiteCard } from "./SiteCard";
import type { SiteState } from "../types/quest";

vi.mock("framer-motion", () => ({
  motion: {
    button: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    div: ({
      animate: _animate,
      children,
      exit: _exit,
      initial: _initial,
      layout: _layout,
      transition: _transition,
      whileHover: _whileHover,
      whileTap: _whileTap,
      ...props
    }: {
      animate?: unknown;
      children: ReactNode;
      exit?: unknown;
      initial?: unknown;
      layout?: unknown;
      transition?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
    } & HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}));

function renderSite(site: SiteState): string {
  return renderToStaticMarkup(
    <SiteCard
      site={site}
      isLocked={false}
      completionLevel={0}
      biomeColor="#38bdf8"
      remainingSitesToUnlockBattle={0}
      onSiteClick={vi.fn()}
    />,
  );
}

describe("SiteCard", () => {
  it("labels default draft sites with the draft pick count", () => {
    const html = renderSite({
      id: "site-draft",
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    });

    expect(html).toContain("Draft 5x");
  });

  it("labels configured draft sites with their configured draft pick count", () => {
    const html = renderSite({
      id: "site-draft-short",
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
      data: { draftPickCount: 3 },
    });

    expect(html).toContain("Draft 3x");
  });
});
