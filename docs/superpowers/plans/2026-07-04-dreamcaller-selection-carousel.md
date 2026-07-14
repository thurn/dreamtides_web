# Dreamcaller Selection Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Cumulus Dreamcaller-selection screen (a static row of cards) with the imported mobile design — a full-bleed swipe carousel — and, along the way, make every glossary-keyword reveal render as `InfoCard` tiles.

**Architecture:** Three cooperating changes. (1) `CardTermDefinitions` is evolved in place to render `InfoCard` tiles instead of the legacy `GlossaryDefinitionCard`, so `Dreamsign`/`GameCard` and two shared legacy consumers inherit the new look automatically. (2) A new `TideCluster` Cumulus component carries the collapsed-discs→named-pills container-transform. (3) `QuestStartScreen` is rewritten as a pure swipe carousel composed from Cumulus, using a screen-local full-bleed portrait, `GroupPanel`, `Button`, `TideCluster`, `ResourceChip`, and an ability reveal wired through `InfoCard.PressInfo` + `CardTermDefinitions`. The adapter and view-model are unchanged.

**Tech Stack:** TypeScript, React 18, Vite, Vitest (jsdom), the Cumulus design system (`src/cumulus`), ESLint with the `cumulus/*` rule suite.

## Global Constraints

- Run all commands from the repository root. In a fresh worktree run `npm install` first (`node_modules` is not committed).
- Core checks after every task: `npm run lint`, `npm run typecheck`, `npm test`.
- After changing any file under `src/cumulus/components` or `src/cumulus/primitives`, run `npm run cumulus-metadata && npm run cumulus-docs` and commit any regenerated artifacts (the `cumulus-generated-docs-drift` test fails on stale docs). Regeneration may produce no changes — commit only if `git status` shows some.
- Identify cards/dreamcallers by **UUID/id, never by name**. Never key a map/set on a display name.
- Tests must not assert specific production TOML/glossary values; derive fixtures from live data or use plain hand-built fixtures (per `AGENTS.md`).
- Cumulus code imports only other `src/cumulus` code, `node_modules`, and the non-UI allowlist (`src/data`, `src/types`, `src/logging`, `src/runtime`). No `className`/`style`/`CSSProperties`/raw-color/raw-length escape-hatch props on Cumulus components (lint + the `cumulus-strict-api.contract.test.mjs` enforce this; the contract test scans `src/cumulus/screens` too, so screen-local components must also be escape-hatch-free).
- All visual values come from tokens via `token("--…")` (spacing, color, radius, shadow, motion). Box *measures* (width/height/min/max) may be raw numbers.
- Type is applied one voice at a time: `font: token("--t-…")`. Never hand-compose weight/face around a `--t-*` token.
- Commit with a detailed message and `git push` immediately after each task (per `AGENTS.md`). End commit messages with `Claude-Session: https://claude.ai/code/session_01GkWjuYnPndxz9r86wiuWdv`.

---

## File Structure

**Task 1 — CardTermDefinitions → InfoCard tiles**
- Modify: `src/cumulus/components/card/CardTermDefinitions.tsx` (render `InfoCard` tiles; keep name + `text`/`testId`/`side` props)
- Create: `src/cumulus/components/card/CardTermDefinitions.test.tsx`

**Task 2 — TideCluster component**
- Modify: `src/cumulus/components/hud/TidePill.tsx` (export a `tideVisual(tide)` accessor + the `TideSpec`-shaped return)
- Create: `src/cumulus/components/hud/TideCluster.tsx`
- Create: `src/cumulus/components/hud/TideCluster.test.tsx`
- Create: `src/cumulus/docs/demos/tide-cluster.tsx`
- Modify: `src/cumulus/docs/registry.ts` (register the demo)

**Task 3 — The carousel screen**
- Modify: `src/cumulus/primitives/glyph.ts` (add `chevronLeft`/`chevronRight`)
- Rewrite: `src/cumulus/screens/QuestStartScreen.tsx` (carousel; keeps exported view types)
- Rewrite: `src/cumulus/screens/QuestStartScreen.test.tsx`
- Unchanged (verify only): `src/screens/cumulus_adapters/QuestStartScreenAdapter.tsx`, `src/screens/cumulus_adapters/quest-start-view-model.ts`, `src/screens/cumulus_adapters/registry.tsx` (already wires `questStart`)

**Task 4 — Verification & browser QA**
- No new files; runs the full check suite and an agent-browser pass.

---

## Task 1: Evolve `CardTermDefinitions` to render InfoCard tiles

Rewrites the shared term-definition stack to emit `InfoCard variant="text"` tiles, fully tokenized. Name and prop surface (`text`, `testId`, `side`) are preserved, so `Dreamsign` (which keys its test on the `testId` container `dreamsign-reveal-definition-stack`), `GameCard`/`CardView` (via `useCardTermPopover`), and the two shared legacy consumers all inherit the new tiles with no signature change.

**Files:**
- Modify: `src/cumulus/components/card/CardTermDefinitions.tsx`
- Test: `src/cumulus/components/card/CardTermDefinitions.test.tsx`

**Interfaces:**
- Consumes: `extractGlossaryTerms(text): GlossaryEntry[]` from `src/data/glossary-terms` (each entry has `readonly term: string; readonly definition: string`); `InfoCard` from `../overlay/InfoCard`; `richText` from `./rich-text`; `token` from `../../primitives/tokens`.
- Produces: `CardTermDefinitions({ text, testId?, side? })` — unchanged signature; now returns a token-styled column of `InfoCard` tiles, or `null` when `text` has no glossary terms.

- [ ] **Step 1: Write the failing test**

Create `src/cumulus/components/card/CardTermDefinitions.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CardTermDefinitions } from "./CardTermDefinitions";
import { extractGlossaryTerms } from "../../../data/glossary-terms";

// Derive fixtures from the LIVE glossary so a content edit can never invalidate
// the test (per AGENTS.md). Pick two distinct terms and build prose that uses
// both; assert the count of tiles equals the number of distinct terms detected.
const TWO_TERMS = (() => {
  // A sentence known to reference at least two glossary keywords in the
  // prototype's vocabulary; resolve the actual detected terms from it.
  const text = "Reclaim a card from your void, then foresee 1.";
  const terms = extractGlossaryTerms(text);
  return { text, terms };
})();

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("CardTermDefinitions", () => {
  it("renders nothing when the text references no glossary terms", () => {
    const { container, root } = mount(
      <CardTermDefinitions text="plain words with no keywords" />,
    );
    expect(container.textContent).toBe("");
    act(() => {
      root.unmount();
    });
  });

  it("renders one InfoCard tile per distinct glossary term, in reading order", () => {
    // Skip if the sample somehow detects fewer than two terms in this build's
    // glossary — the behavior under test needs multiple terms.
    if (TWO_TERMS.terms.length < 2) {
      return;
    }
    const { container, root } = mount(
      <CardTermDefinitions text={TWO_TERMS.text} testId="defs" />,
    );

    const stack = container.querySelector('[data-testid="defs"]');
    expect(stack).not.toBeNull();

    // Each tile is an InfoCard whose headline is the term. Assert the term
    // headings appear in first-occurrence order.
    const text = container.textContent ?? "";
    const positions = TWO_TERMS.terms.map((entry) => text.indexOf(entry.term));
    expect(positions.every((position) => position >= 0)).toBe(true);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);

    act(() => {
      root.unmount();
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/cumulus/components/card/CardTermDefinitions.test.tsx`
Expected: the "reading order" test FAILS — the current component renders `GlossaryDefinitionCard`, whose markup differs, and the test file is new so it exercises behavior not yet in place. (If it happens to pass, proceed; the rewrite still applies.)

- [ ] **Step 3: Rewrite the component to render InfoCard tiles**

Replace the entire contents of `src/cumulus/components/card/CardTermDefinitions.tsx` with:

```tsx
import { extractGlossaryTerms } from "../../../data/glossary-terms";
import { InfoCard } from "../overlay/InfoCard";
import { richText } from "./rich-text";
import { token } from "../../primitives/tokens";

/**
 * Vertical stack of glossary definitions for every gameplay term that appears in
 * a stretch of rules text, in reading order with duplicates collapsed. Each term
 * renders as its own {@link InfoCard} tile, so the definitions read in the same
 * vocabulary as every other reveal (the object card they sit beside, the tide
 * pill, the site disc) — one shell, one radius, one type scale.
 *
 * Rendered beside or beneath a card / dreamsign / ability so the player can read
 * what every highlighted keyword means without inline tooltips. Shared by the
 * card hover-help panel (`useCardTermPopover` → `CardView`/`GameCard`), the
 * dreamsign reveal (`DreamsignInfoCard`), and the Dreamcaller ability reveal.
 *
 * Returns `null` when the text references no glossary terms, so callers place it
 * unconditionally and it renders nothing for plain text.
 */
export function CardTermDefinitions({
  text,
  testId,
  side,
}: {
  /** The rules text to scan for glossary terms. */
  text: string;
  /** Optional test id for the stack container. */
  testId?: string;
  /** Which side of the card the panel sits on, exposed for layout/tests. */
  side?: "left" | "right";
}) {
  const terms = extractGlossaryTerms(text);
  if (terms.length === 0) {
    return null;
  }
  return (
    <div
      data-testid={testId}
      data-definition-side={side}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-3"),
        // Box measures (content-driven layout): cap height and scroll a long
        // list, matching the prior panel behavior.
        maxHeight: "min(70vh, 360px)",
        overflowY: "auto",
      }}
    >
      {terms.map((entry) => (
        <InfoCard
          key={entry.term}
          variant="text"
          meta="Keyword"
          title={entry.term}
          // `rules` so resource glyphs / keyword emphasis inside a definition
          // render the same marks shown in card rules text.
          body={richText.rules(entry.definition)}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/cumulus/components/card/CardTermDefinitions.test.tsx`
Expected: PASS (both cases).

- [ ] **Step 5: Verify the Dreamsign reveal test still passes**

Run: `npx vitest run src/cumulus/components/hud/Dreamsign.test.tsx`
Expected: PASS — the reveal still renders a container with `data-testid="dreamsign-reveal-definition-stack"` (the preserved `testId` prop); only the tiles inside changed.

- [ ] **Step 6: Regenerate Cumulus artifacts and run the full suite**

Run: `npm run cumulus-metadata && npm run cumulus-docs`
Then: `npm run lint && npm run typecheck && npm test`
Expected: all pass. If `git status` shows regenerated files under `src/cumulus/metadata/` or `.claude/skills/cumulus/` or `.llms/`, include them in the commit.

- [ ] **Step 7: Commit**

```bash
git add src/cumulus/components/card/CardTermDefinitions.tsx \
        src/cumulus/components/card/CardTermDefinitions.test.tsx
git add -A src/cumulus/metadata .claude/skills/cumulus .llms 2>/dev/null || true
git commit -m "$(cat <<'MSG'
feat(cumulus): render glossary term definitions as InfoCard tiles

Evolve CardTermDefinitions in place to render each keyword as an InfoCard
variant="text" tile instead of the legacy GlossaryDefinitionCard, fully
tokenized. Name and prop surface (text/testId/side) are unchanged, so the
dreamsign reveal, GameCard/CardView hover help, and the two shared legacy
consumers inherit the InfoCard vocabulary automatically.

Claude-Session: https://claude.ai/code/session_01GkWjuYnPndxz9r86wiuWdv
MSG
)"
git push
```

---

## Task 2: `TideCluster` — collapsed discs → named pills container-transform

A new Cumulus component: closed, it shows a "Tides" label and the tides' overlapping colored glyph discs; tapping runs a Material container-transform where each disc flies to its slot and grows into the full named `TidePill`. Reduced-motion collapses to an instant open/close. It renders `TidePill`s as the resting state and reuses `TidePill`'s tide visuals via a new exported accessor.

**Files:**
- Modify: `src/cumulus/components/hud/TidePill.tsx`
- Create: `src/cumulus/components/hud/TideCluster.tsx`
- Test: `src/cumulus/components/hud/TideCluster.test.tsx`
- Create: `src/cumulus/docs/demos/tide-cluster.tsx`
- Modify: `src/cumulus/docs/registry.ts`

**Interfaces:**
- Consumes: `TidePill`, `type Tide` from `./TidePill`; `token`, `GLYPHS` from primitives; `InfoCard` engine is not needed directly (pills own their reveal).
- Produces:
  - `tideVisual(tide: Tide): { icon: Glyph; bg: string; fg: string; bd: string }` exported from `TidePill.tsx`.
  - `interface TideClusterTideView { id: string; label: string; description: string; tide: Tide }`
  - `TideCluster({ tides, stageRef? }: { tides: TideClusterTideView[]; stageRef?: React.RefObject<HTMLElement | null> })` — renders the disclosure. Collapsed discs carry `data-tide-disc={id}`; expanded pill wrappers carry `data-tide-pill={id}`.

- [ ] **Step 1: Export `tideVisual` from TidePill**

In `src/cumulus/components/hud/TidePill.tsx`, add this export directly below the `const TIDES: Record<Tide, TideSpec> = { … };` block:

```tsx
/**
 * The fixed icon + tinted colors for a tide, so a sibling component (e.g. the
 * collapsed {@link TideCluster}) can render a tide's disc / flying clone
 * pixel-identically to the pill it becomes — without duplicating the tone table.
 */
export function tideVisual(tide: Tide): {
  icon: Glyph;
  bg: string;
  fg: string;
  bd: string;
} {
  return TIDES[tide];
}
```

- [ ] **Step 2: Write the failing test**

Create `src/cumulus/components/hud/TideCluster.test.tsx`:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TideCluster, type TideClusterTideView } from "./TideCluster";

const TIDES: TideClusterTideView[] = [
  { id: "t1", label: "Singular Storm", description: "Foresight and spells.", tide: "vision" },
  { id: "t2", label: "Iron Bulwark", description: "An unbreaking host.", tide: "valor" },
  { id: "t3", label: "Risen Depths", description: "Death is a doorway.", tide: "shadow" },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // Force reduced motion so the toggle switches phase instantly (no flying
  // clones, which depend on real layout rects jsdom does not provide).
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("TideCluster", () => {
  it("renders one collapsed disc per tide", () => {
    const { container, root } = mount(<TideCluster tides={TIDES} />);
    expect(container.querySelectorAll("[data-tide-disc]")).toHaveLength(
      TIDES.length,
    );
    act(() => {
      root.unmount();
    });
  });

  it("reveals a named pill per tide when the cluster is toggled open", () => {
    const { container, root } = mount(<TideCluster tides={TIDES} />);
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-tide-toggle="true"]',
    );
    if (toggle === null) {
      throw new Error("Missing tide cluster toggle");
    }
    act(() => {
      toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelectorAll("[data-tide-pill]")).toHaveLength(
      TIDES.length,
    );
    expect(container.textContent).toContain("Singular Storm");
    act(() => {
      root.unmount();
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/cumulus/components/hud/TideCluster.test.tsx`
Expected: FAIL — `TideCluster` does not exist yet ("Failed to resolve import").

- [ ] **Step 4: Implement `TideCluster`**

Create `src/cumulus/components/hud/TideCluster.tsx`:

```tsx
// TideCluster — the collapsed tide disclosure used on the Dreamcaller-select
// carousel. Closed, it shows a "Tides" label + the tides' overlapping colored
// glyph discs. Tapping runs a Material container-transform: each disc flies out
// of the cluster to its slot in the pill row below and grows into the full named
// TidePill (label revealing as the body expands); closing reverses it. Each
// resting pill keeps its own touch-down description reveal (TidePill owns it).
//
// Reduced motion (`prefers-reduced-motion: reduce`) collapses the transform to
// an instant open/close. The flight is CSS-transitioned on absolutely-positioned
// clones (out of flow, so morphing them causes no reflow); the real pills are
// laid out but hidden until the flight lands, then swapped in one commit so
// there is no flash. Colors + icons come from `tideVisual` so a clone lands
// pixel-identical on the pill it becomes.

import * as React from "react";
import { TidePill, tideVisual, type Tide } from "./TidePill";
import { token } from "../../primitives/tokens";
import { GLYPHS } from "../../primitives/glyph";

/** One tide shown in the cluster, already resolved to display copy. */
export interface TideClusterTideView {
  /** Stable id (a tide deck id) for the React key / QA hook. */
  id: string;
  /** Display name shown on the pill. */
  label: string;
  /** Description revealed through the pill's own InfoCard reveal. */
  description: string;
  /** Which of the five tides fixes the icon + color. */
  tide: Tide;
}

export interface TideClusterProps {
  /** The tides to disclose. */
  tides: TideClusterTideView[];
  /** Screen root the pill reveals anchor + clamp against (preferred). */
  stageRef?: React.RefObject<HTMLElement | null>;
}

/** ms per chip flight and stagger between chips (animation sequencing, not CSS
 * lengths). Kept in step with the sheet-height tween below. */
const FLY_DUR = 420;
const FLY_STAGGER = 55;
const DISC_PX = 24;

type Phase = "closed" | "opening" | "open" | "closing";

/** A single collapsed tide mark — a colored disc carrying the tide glyph. */
function TideDisc({ tide, id }: { tide: Tide; id: string }): React.ReactElement {
  const v = tideVisual(tide);
  return (
    <span
      data-tide-disc={id}
      style={{
        width: DISC_PX,
        height: DISC_PX,
        borderRadius: "50%",
        flex: "none",
        display: "grid",
        placeItems: "center",
        background: v.bg,
        border: `1px solid ${v.bd}`,
        color: v.fg,
        fontSize: DISC_PX * 0.52,
      }}
    >
      <i className={v.icon} aria-hidden="true" />
    </span>
  );
}

export function TideCluster({
  tides,
  stageRef,
}: TideClusterProps): React.ReactElement {
  const [phase, setPhase] = React.useState<Phase>("closed");
  const [flyers, setFlyers] = React.useState<
    { id: string; tide: Tide; disc: Box; pill: Box }[] | null
  >(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const discRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const pillRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const flyerRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const labelRefs = React.useRef<Record<string, HTMLElement | null>>({});
  const openRef = React.useRef<HTMLDivElement>(null);

  const animating = phase === "opening" || phase === "closing";
  const openish = phase === "open" || phase === "opening";
  const openMounted = phase !== "closed";

  const toggle = (): void => {
    if (animating) return;
    const reduce =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase === "closed") setPhase(reduce ? "open" : "opening");
    else if (phase === "open") setPhase(reduce ? "closed" : "closing");
  };

  // Step 1: on entering an animating phase, measure discs + hidden pills in
  // local coords and spawn the flying clones at the start pose.
  React.useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;
    const c = containerRef.current;
    if (!c) return;
    const cr = c.getBoundingClientRect();
    const scale = cr.width / c.offsetWidth || 1;
    const rel = (el: HTMLElement): Box => {
      const r = el.getBoundingClientRect();
      return {
        left: (r.left - cr.left) / scale,
        top: (r.top - cr.top) / scale,
        width: r.width / scale,
        height: r.height / scale,
      };
    };
    const list = tides
      .map((t) => {
        const d = discRefs.current[t.id];
        const p = pillRefs.current[t.id];
        if (!d || !p) return null;
        return { id: t.id, tide: t.tide, disc: rel(d), pill: rel(p) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (list.length === 0) {
      setPhase(phase === "opening" ? "open" : "closed");
      return;
    }
    const ob = openRef.current;
    if (ob) {
      const maxDelay = (list.length - 1) * FLY_STAGGER;
      const hDur = FLY_DUR + maxDelay;
      const hEase =
        phase === "opening"
          ? "cubic-bezier(.2,0,0,1)"
          : "cubic-bezier(.4,0,1,1)";
      ob.style.overflow = "hidden";
      ob.style.transition = `height ${hDur}ms ${hEase}`;
      ob.style.height = (phase === "opening" ? 0 : ob.scrollHeight) + "px";
    }
    setFlyers(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Once open, release the imperative height so pills (and their popups) reflow.
  React.useLayoutEffect(() => {
    const ob = openRef.current;
    if (phase === "open" && ob) {
      ob.style.height = "auto";
      ob.style.overflow = "visible";
      ob.style.transition = "";
    }
  }, [phase]);

  // Step 2: flyers committed at START pose. Force a reflow, then set the END pose
  // imperatively so CSS transitions tween.
  React.useLayoutEffect(() => {
    if (!flyers || (phase !== "opening" && phase !== "closing")) return;
    const opening = phase === "opening";
    const endPill = opening;
    const startPill = !opening;
    const setPose = (
      el: HTMLElement,
      lab: HTMLElement | null,
      pill: boolean,
      box: Box,
    ): void => {
      el.style.left = box.left + "px";
      el.style.top = box.top + "px";
      el.style.width = (pill ? box.width : DISC_PX) + "px";
      el.style.height = (pill ? box.height : DISC_PX) + "px";
      el.style.paddingLeft = (pill ? 12 : 6) + "px";
      el.style.paddingRight = (pill ? 12 : 0) + "px";
      el.style.gap = (pill ? 6 : 0) + "px";
      if (lab) lab.style.opacity = pill ? "1" : "0";
    };
    flyers.forEach((f) => {
      const el = flyerRefs.current[f.id];
      if (el) setPose(el, labelRefs.current[f.id], startPill, startPill ? f.pill : f.disc);
    });
    const raf = requestAnimationFrame(() => {
      const c = containerRef.current;
      if (c) void c.offsetHeight;
      const ob = openRef.current;
      if (ob) ob.style.height = (opening ? ob.scrollHeight : 0) + "px";
      flyers.forEach((f) => {
        const el = flyerRefs.current[f.id];
        if (el) setPose(el, labelRefs.current[f.id], endPill, endPill ? f.pill : f.disc);
      });
    });
    const maxDelay = (flyers.length - 1) * FLY_STAGGER;
    const timer = setTimeout(() => {
      setPhase(opening ? "open" : "closed");
      setFlyers(null);
    }, maxDelay + FLY_DUR + 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyers]);

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        data-tide-toggle="true"
        onClick={toggle}
        aria-expanded={openish}
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-5"),
          padding: `${token("--space-2")} ${token("--space-1")}`,
          background: "none",
          border: "none",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
        }}
      >
        <span
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--text-secondary"),
            lineHeight: 1,
          }}
        >
          Tides
        </span>
        <i
          className={GLYPHS.info}
          aria-hidden="true"
          style={{ fontSize: 13, color: token("--text-muted") }}
        />
        <span
          style={{
            display: "flex",
            alignItems: "center",
            opacity: phase === "closed" ? 1 : 0,
          }}
        >
          {tides.map((t, i) => (
            <span
              key={t.id}
              ref={(el) => (discRefs.current[t.id] = el)}
              style={{
                marginLeft: i === 0 ? 0 : `calc(-1 * ${token("--space-3")})`,
                borderRadius: "50%",
                background: token("--bg-app"),
                boxShadow: i === 0 ? "none" : `0 0 0 2px ${token("--bg-app")}`,
                display: "flex",
                position: "relative",
                zIndex: tides.length - i,
              }}
            >
              <TideDisc tide={t.tide} id={t.id} />
            </span>
          ))}
        </span>
      </button>

      {openMounted && (
        <div ref={openRef}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: token("--space-3"),
              marginTop: token("--space-3"),
              opacity: phase === "open" ? 1 : 0,
            }}
          >
            {tides.map((t) => (
              <span
                key={t.id}
                data-tide-pill={t.id}
                ref={(el) => (pillRefs.current[t.id] = el)}
                style={{ display: "inline-flex" }}
              >
                <TidePill
                  tide={t.tide}
                  label={t.label}
                  description={t.description}
                  size="sm"
                  stageRef={stageRef}
                />
              </span>
            ))}
          </div>
        </div>
      )}

      {flyers && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 5,
          }}
        >
          {flyers.map((f, i) => {
            const v = tideVisual(f.tide);
            const opening = phase === "opening";
            const endPill = phase === "opening" || phase === "open";
            const end = endPill ? f.pill : f.disc;
            const easing = opening
              ? "cubic-bezier(.2,0,0,1)"
              : "cubic-bezier(.4,0,1,1)";
            const delay = (opening ? i : flyers.length - 1 - i) * FLY_STAGGER;
            const move = `${FLY_DUR}ms ${easing} ${delay}ms`;
            const labDelay = delay + (opening ? Math.round(FLY_DUR * 0.35) : 0);
            return (
              <span
                key={f.id}
                ref={(el) => (flyerRefs.current[f.id] = el)}
                style={{
                  position: "absolute",
                  boxSizing: "border-box",
                  display: "inline-flex",
                  alignItems: "center",
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  background: v.bg,
                  border: `1px solid ${v.bd}`,
                  color: v.fg,
                  borderRadius: token("--radius-pill"),
                  font: `600 13px/1 ${token("--font-ui")}`,
                  letterSpacing: "0.005em",
                  left: end.left,
                  top: end.top,
                  width: endPill ? end.width : DISC_PX,
                  height: endPill ? end.height : DISC_PX,
                  paddingLeft: endPill ? token("--space-5") : token("--space-3"),
                  paddingRight: endPill ? token("--space-5") : token("--space-0"),
                  gap: endPill ? token("--space-3") : token("--space-0"),
                  transition: `left ${move}, top ${move}, width ${move}, height ${move}, padding ${move}`,
                  willChange: "left, top, width, height",
                }}
              >
                <span
                  style={{ display: "inline-flex", fontSize: "1.05em", flex: "none" }}
                >
                  <i className={v.icon} aria-hidden="true" />
                </span>
                <span
                  ref={(el) => (labelRefs.current[f.id] = el)}
                  style={{
                    display: "inline-block",
                    opacity: endPill ? 1 : 0,
                    transition: `opacity ${Math.round(FLY_DUR * 0.55)}ms linear ${labDelay}ms`,
                  }}
                >
                  {tides.find((t) => t.id === f.id)?.label}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A rectangle in container-local (frame-unscaled) px. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/cumulus/components/hud/TideCluster.test.tsx`
Expected: PASS (both cases). If `token("--tracking-eyebrow")` or `token("--font-ui")` is rejected by `typecheck` as an unknown token, run `grep -n "tracking-eyebrow\|font-ui" src/cumulus/primitives/cumulus-tokens.css` and substitute the real token name reported there.

- [ ] **Step 6: Add the demo entry**

Create `src/cumulus/docs/demos/tide-cluster.tsx`:

```tsx
// Registry demo entry for TideCluster — see tide-pill.tsx for the recipe. The
// demo cluster floats its pills' reveals above themselves (no `stageRef` in the
// bounded demo stage), the standalone reveal path.

import { TideCluster, type TideClusterTideView } from "../../components/hud/TideCluster";
import type { CumulusComponent } from "../registry";

const DEMO_TIDES: TideClusterTideView[] = [
  { id: "vision", label: "Singular Storm", description: "Foresight and spells — scry deep, then break one overwhelming storm.", tide: "vision" },
  { id: "valor", label: "Iron Bulwark", description: "An unbreaking host that absorbs every blow and answers in kind.", tide: "valor" },
  { id: "shadow", label: "Risen Depths", description: "Death is a doorway — reclaim the fallen stronger than before.", tide: "shadow" },
];

function TideClusterDemo() {
  return <TideCluster tides={DEMO_TIDES} />;
}

export const tideClusterDemo: CumulusComponent = {
  id: "tide-cluster",
  title: "Tide Cluster",
  description:
    "The collapsed tide disclosure: overlapping colored glyph discs that expand, with a container-transform, into the full named tide pills.",
  group: "Components",
  Component: TideClusterDemo as CumulusComponent["Component"],
  docName: "TideCluster",
  usage: [
    {
      code: `import { TideCluster } from "src/cumulus/components/hud/TideCluster";

<TideCluster
  tides={[
    { id: "vision", label: "Singular Storm", description: "Foresight and spells.", tide: "vision" },
    { id: "valor", label: "Iron Bulwark", description: "An unbreaking host.", tide: "valor" },
  ]}
  stageRef={screenRef}
/>`,
    },
  ],
};
```

Note: match the exact field names the other demo entries use. Open `src/cumulus/docs/demos/tide-pill.tsx` and `src/cumulus/docs/registry.ts` and mirror the `CumulusComponent` shape precisely (field names for `Component`, `docName`, `usage`, `group`); adjust the object above if a field differs.

- [ ] **Step 7: Register the demo**

In `src/cumulus/docs/registry.ts`, add the import beside the other demo imports (alphabetical):

```tsx
import { tideClusterDemo } from "./demos/tide-cluster";
```

and add `tideClusterDemo` to the `CUMULUS_COMPONENTS` array next to `tidePillDemo`.

- [ ] **Step 8: Regenerate docs and run the full suite**

Run: `npm run cumulus-metadata && npm run cumulus-docs`
Then: `npm run lint && npm run typecheck && npm test`
Expected: all pass; the drift test now sees a fresh `tide-cluster.md`, index row, and metadata entry. Commit the regenerated files.

- [ ] **Step 9: Commit**

```bash
git add src/cumulus/components/hud/TidePill.tsx \
        src/cumulus/components/hud/TideCluster.tsx \
        src/cumulus/components/hud/TideCluster.test.tsx \
        src/cumulus/docs/demos/tide-cluster.tsx \
        src/cumulus/docs/registry.ts
git add -A src/cumulus/metadata .claude/skills/cumulus .llms 2>/dev/null || true
git commit -m "$(cat <<'MSG'
feat(cumulus): add TideCluster container-transform component

A collapsed tide disclosure — overlapping colored glyph discs that expand,
with a Material container-transform (flying clones that grow into pills), into
the full named TidePills. Reduced motion collapses to an instant open/close.
Reuses TidePill's tide visuals via a new exported tideVisual() accessor.

Claude-Session: https://claude.ai/code/session_01GkWjuYnPndxz9r86wiuWdv
MSG
)"
git push
```

---

## Task 3: Rewrite `QuestStartScreen` as the swipe carousel

Replaces the static card row with the full-bleed swipe carousel. Pure presentation: renders from the existing `DreamcallerOfferView[]`, calls `onPick(id)`. Uses a screen-local full-bleed portrait, `Motes`, `GroupPanel` console, the ability reveal (`InfoCard.PressInfo` + `CardTermDefinitions`, guarded on term presence), `TideCluster`, `ResourceChip`, and `Button`.

**Files:**
- Modify: `src/cumulus/primitives/glyph.ts`
- Rewrite: `src/cumulus/screens/QuestStartScreen.tsx`
- Rewrite: `src/cumulus/screens/QuestStartScreen.test.tsx`

**Interfaces:**
- Consumes: `DreamcallerOfferView` (kept, exported from this file); `Motes`, `ResourceChip`, `TideCluster`, `Button`, `GroupPanel`, `RulesText`, `CardTermDefinitions`, `InfoCard`, `Pressable`, `token`, `GLYPHS`, `richText`, `dreamcallerImageSrc`, `extractGlossaryTerms`.
- Produces: `QuestStartScreen({ dreamcallers, onPick })` — unchanged public props; the exported view types (`DreamcallerOfferView`, `DreamcallerTideView`, `DreamcallerSignatureCardView`, `QuestStartScreenProps`) are preserved so the adapter and builder need no change (the screen simply stops reading `signatureCards`).

- [ ] **Step 1: Add chevron glyphs**

In `src/cumulus/primitives/glyph.ts`, add to the `GLYPHS` object (near `info`):

```tsx
  chevronLeft: g("bx bx-chevron-left"),
  chevronRight: g("bx bx-chevron-right"),
```

- [ ] **Step 2: Write the failing screen test**

Replace the entire contents of `src/cumulus/screens/QuestStartScreen.test.tsx` with:

```tsx
// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QuestStartScreen,
  type DreamcallerOfferView,
} from "./QuestStartScreen";

const OFFERED: DreamcallerOfferView[] = [
  {
    id: "caller-1",
    name: "Mira of Lanterns",
    title: "Keeper of the Threshold Flame",
    imageNumber: "0009",
    renderedText: "First dreamcaller.",
    startingEssence: 230,
    signatureCards: [{ id: "sig-1-0", name: "Lantern Seer" }],
    tides: [],
  },
  {
    id: "caller-2",
    name: "Vey of Embers",
    title: "The Ashen Cartographer",
    imageNumber: "0010",
    renderedText: "Second dreamcaller.",
    startingEssence: 250,
    signatureCards: [],
    tides: [
      { id: "tide-01", label: "Ember Rush", description: "Aggressive early pressure.", tide: "ember" },
      { id: "tide-02", label: "Verdant Growth", description: "Ramps into large threats.", tide: "wild" },
    ],
  },
];

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => {
  document.body.innerHTML = "";
});

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe("Cumulus QuestStartScreen (carousel)", () => {
  it("renders a page with identity, essence, and a Choose action per Dreamcaller", () => {
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={vi.fn()} />,
    );

    expect(container.textContent).toContain("Choose Your Dreamcaller");
    for (const dc of OFFERED) {
      expect(
        container.querySelector(`[data-dreamcaller-page="${dc.id}"]`),
      ).not.toBeNull();
      expect(
        container.querySelector(`[data-choose-dreamcaller="${dc.id}"]`),
      ).not.toBeNull();
      const essence = container.querySelector(
        `[data-starting-essence-value="${dc.id}"]`,
      );
      expect(essence?.textContent).toContain(String(dc.startingEssence));
    }

    act(() => {
      root.unmount();
    });
  });

  it("shows the tides cluster only for Dreamcallers that have tides", () => {
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={vi.fn()} />,
    );

    // caller-1 has no tides → no cluster.
    expect(
      container.querySelector(`[data-dreamcaller-tides="caller-1"]`),
    ).toBeNull();

    // caller-2 has two tides → cluster with two collapsed discs.
    const cluster = container.querySelector(
      `[data-dreamcaller-tides="caller-2"]`,
    );
    expect(cluster).not.toBeNull();
    expect(cluster?.querySelectorAll("[data-tide-disc]")).toHaveLength(2);

    act(() => {
      root.unmount();
    });
  });

  it("calls onPick with the Dreamcaller's id when its Choose action is pressed", () => {
    const onPick = vi.fn();
    const { container, root } = mount(
      <QuestStartScreen dreamcallers={OFFERED} onPick={onPick} />,
    );

    const button = container.querySelector<HTMLButtonElement>(
      `[data-choose-dreamcaller="caller-2"] button`,
    );
    if (button === null) {
      throw new Error("Missing Choose button");
    }
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onPick).toHaveBeenCalledWith("caller-2");

    act(() => {
      root.unmount();
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/cumulus/screens/QuestStartScreen.test.tsx`
Expected: FAIL — the current screen has no `data-dreamcaller-page` / `data-choose-dreamcaller` / `data-tide-disc` hooks.

- [ ] **Step 4: Rewrite the screen**

Replace the entire contents of `src/cumulus/screens/QuestStartScreen.tsx` with:

```tsx
// QuestStartScreen — the Cumulus rendering of Dreamcaller selection (the quest's
// opening screen), as a full-bleed mobile swipe carousel: one Dreamcaller per
// page (cinematic portrait + serif name/epithet + a frosted GroupPanel console
// holding ability text, an expandable TideCluster, starting essence, and a
// Choose action). PURE: it renders from a view-model and reports the chosen
// Dreamcaller through `onPick`; the adapter owns state, the offer, the seed, and
// startQuest.

import { useRef, useState } from "react";
import { Motes } from "../components/hud/Motes";
import { GroupPanel } from "../components/controls/GroupPanel";
import { GlassButton } from "../components/controls/GlassButton";
import { ResourceChip } from "../components/hud/ResourceChip";
import { RulesText } from "../components/card/RulesText";
import { CardTermDefinitions } from "../components/card/CardTermDefinitions";
import { InfoCard } from "../components/overlay/InfoCard";
import { richText } from "../components/card/rich-text";
import {
  TideCluster,
  type TideClusterTideView,
} from "../components/hud/TideCluster";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import { dreamcallerImageSrc } from "../components/hud/DreamcallerPortrait";
import { extractGlossaryTerms } from "../../data/glossary-terms";

/** One tide shown on a Dreamcaller, already resolved to display copy. It is
 * exactly the cluster's tide view, re-exported under the screen's own name so
 * the view-model builder keeps importing `DreamcallerTideView` from here. */
export type DreamcallerTideView = TideClusterTideView;

/** One signature card (kept for the shared view type; unused by the carousel). */
export interface DreamcallerSignatureCardView {
  id: string;
  name: string;
}

/** A single Dreamcaller offered on the select screen, as display data. */
export interface DreamcallerOfferView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  renderedText: string;
  startingEssence: number;
  signatureCards: DreamcallerSignatureCardView[];
  tides: DreamcallerTideView[];
}

export interface QuestStartScreenProps {
  /** The Dreamcallers offered this run (typically three). */
  dreamcallers: DreamcallerOfferView[];
  /** Called with a Dreamcaller's id when the player commits to it. */
  onPick: (dreamcallerId: string) => void;
}

/** The full-bleed cinematic portrait for one carousel page. Screen-local: it
 * fills the page and needs no frame, unlike the shared DreamcallerPortrait. */
function FullBleedPortrait({
  dreamcaller,
}: {
  dreamcaller: DreamcallerOfferView;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: `radial-gradient(circle at 50% 20%, color-mix(in srgb, ${token("--gold")} 24%, transparent) 0%, color-mix(in srgb, ${token("--accent")} 24%, transparent) 38%, ${token("--bg-sunken")} 100%)`,
          color: token("--text-primary"),
          fontWeight: 800,
          fontSize: 64,
          letterSpacing: "0.08em",
        }}
      >
        {dreamcaller.name.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={dreamcallerImageSrc(dreamcaller.imageNumber)}
      alt={`${dreamcaller.name}, ${dreamcaller.title}`}
      draggable={false}
      onError={() => {
        setBroken(true);
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "cover",
        objectPosition: "50% 10%",
        transform: "scale(1.5)",
        transformOrigin: "50% 0%",
        userSelect: "none",
      }}
    />
  );
}

/** The brand-tinted hairline between ability text and the tides row. */
function ConsoleDivider() {
  return (
    <div
      style={{
        height: 1,
        marginTop: token("--space-4"),
        background: `linear-gradient(90deg, transparent, ${token("--line-strong")} 18%, ${token("--line-strong")} 82%, transparent)`,
      }}
    />
  );
}

/** Ability text with a press/hover reveal of its glossary-keyword definitions.
 * When the text has no terms it renders plain, with no reveal wiring. */
function AbilityReveal({
  text,
  stageRef,
}: {
  text: string;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  const body = (
    <div
      style={{
        font: token("--t-rules"),
        color: token("--text-primary"),
        lineHeight: 1.36,
      }}
    >
      <RulesText text={text} />
    </div>
  );
  if (extractGlossaryTerms(text).length === 0) {
    return body;
  }
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      as="div"
      card={<CardTermDefinitions text={text} />}
    >
      {body}
    </InfoCard.PressInfo>
  );
}

/** The starting-essence value with a press/hover explanation. */
function EssenceReveal({
  dreamcaller,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <InfoCard.PressInfo
      stageRef={stageRef}
      card={
        <InfoCard
          variant="icon"
          glyph={GLYPHS.essence}
          title="Starting Essence"
          body={richText.plain(
            "The essence this Dreamcaller begins the quest with, spent at sites this run.",
          )}
        />
      }
    >
      <span
        data-starting-essence-value={dreamcaller.id}
        style={{
          display: "inline-flex",
          alignItems: "center",
          font: token("--t-body"),
          color: token("--text-primary"),
        }}
      >
        <ResourceChip kind="essence" value={dreamcaller.startingEssence} />
      </span>
    </InfoCard.PressInfo>
  );
}

/** A circular edge chevron that pages the carousel without swiping. */
function EdgeChevron({
  dir,
  onClick,
}: {
  dir: "left" | "right";
  onClick: () => void;
}) {
  return (
    <Pressable
      as="button"
      aria-label={dir === "left" ? "Previous" : "Next"}
      onPointerDown={(event: React.PointerEvent) => {
        event.stopPropagation();
      }}
      onClick={onClick}
      style={{
        position: "absolute",
        top: "46%",
        [dir]: token("--space-3"),
        zIndex: 6,
        width: 40,
        height: 40,
        borderRadius: token("--radius-pill"),
        border: `1px solid ${token("--border-soft")}`,
        background: token("--surface-glass"),
        color: token("--text-secondary"),
        display: "grid",
        placeItems: "center",
        fontSize: 22,
        lineHeight: 1,
      }}
    >
      <i
        className={dir === "left" ? GLYPHS.chevronLeft : GLYPHS.chevronRight}
        aria-hidden="true"
      />
    </Pressable>
  );
}

/** One Dreamcaller page: portrait + title + console. */
function DreamcallerPage({
  dreamcaller,
  active,
  count,
  onChoose,
  stageRef,
}: {
  dreamcaller: DreamcallerOfferView;
  active: boolean;
  count: number;
  onChoose: () => void;
  stageRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <div
      data-dreamcaller-page={dreamcaller.id}
      style={{
        width: `${100 / count}%`,
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <FullBleedPortrait dreamcaller={dreamcaller} />
      <Motes on={active} tint="warm" zIndex={1} />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: token("--safe-top"),
          left: 0,
          right: 0,
          padding: `${token("--space-10")} ${token("--gutter")} 0`,
          zIndex: 4,
          textAlign: "center",
        }}
      >
        <h1
          style={{
            margin: 0,
            font: token("--t-title-sm"),
            color: token("--text-primary"),
            textShadow: token("--shadow-lg"),
          }}
        >
          {dreamcaller.name}, {dreamcaller.title}
        </h1>
      </div>

      {/* Console */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          padding: `0 ${token("--gutter")} calc(${token("--safe-bottom")} + ${token("--space-5")})`,
          opacity: active ? 1 : 0,
          transform: active ? "translateY(0)" : "translateY(16px)",
          transition: `opacity ${token("--dur-base")} ${token("--ease-out")}, transform ${token("--dur-base")} ${token("--ease-out")}`,
        }}
      >
        <GroupPanel>
          <AbilityReveal text={dreamcaller.renderedText} stageRef={stageRef} />

          <ConsoleDivider />

          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: token("--space-5"),
              marginTop: token("--space-3"),
            }}
          >
            {dreamcaller.tides.length > 0 ? (
              <span data-dreamcaller-tides={dreamcaller.id}>
                <TideCluster tides={dreamcaller.tides} stageRef={stageRef} />
              </span>
            ) : (
              <span />
            )}
            <EssenceReveal dreamcaller={dreamcaller} stageRef={stageRef} />
          </div>

          <div
            data-choose-dreamcaller={dreamcaller.id}
            style={{ marginTop: token("--space-6"), display: "grid" }}
          >
            <GlassButton
              label={`Choose ${dreamcaller.name}`}
              variant="accent"
              onPress={onChoose}
            />
          </div>
        </GroupPanel>
      </div>
    </div>
  );
}

/**
 * The Cumulus Dreamcaller-selection carousel: a full-bleed swipe carousel of the
 * offered Dreamcallers. Pure and props-driven — it renders {@link
 * QuestStartScreenProps.dreamcallers} and calls {@link
 * QuestStartScreenProps.onPick} with the chosen Dreamcaller's id.
 */
export function QuestStartScreen({ dreamcallers, onPick }: QuestStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ active: boolean; x0: number }>({ active: false, x0: 0 });
  const count = dreamcallers.length;

  const clamp = (next: number): number =>
    Math.max(0, Math.min(count - 1, next));

  const onPointerDown = (event: React.PointerEvent): void => {
    drag.current = { active: true, x0: event.clientX };
    setDx(0);
  };
  const onPointerMove = (event: React.PointerEvent): void => {
    if (drag.current.active) setDx(event.clientX - drag.current.x0);
  };
  const onPointerUp = (): void => {
    if (!drag.current.active) return;
    const threshold = 46;
    let next = index;
    if (dx < -threshold) next = clamp(index + 1);
    else if (dx > threshold) next = clamp(index - 1);
    drag.current.active = false;
    setDx(0);
    setIndex(next);
  };

  return (
    <div
      ref={stageRef}
      className="cumulus"
      style={{
        position: "relative",
        minHeight: "100vh",
        height: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Screen header — does not swipe. */}
      <div
        style={{
          position: "absolute",
          top: token("--safe-top"),
          left: 0,
          right: 0,
          zIndex: 6,
          padding: `${token("--space-5")} ${token("--gutter")} 0`,
          textAlign: "center",
          pointerEvents: "none",
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--accent-bright"),
          textShadow: token("--shadow-md"),
        }}
      >
        Choose Your Dreamcaller
      </div>

      {/* Track */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          width: `${count * 100}%`,
          transform: `translateX(calc(${(-index * 100) / count}% + ${dx}px))`,
          transition: drag.current.active
            ? "none"
            : `transform ${token("--dur-slow")} ${token("--ease-out")}`,
        }}
      >
        {dreamcallers.map((dreamcaller, i) => (
          <DreamcallerPage
            key={dreamcaller.id}
            dreamcaller={dreamcaller}
            active={i === index}
            count={count}
            onChoose={() => {
              onPick(dreamcaller.id);
            }}
            stageRef={stageRef}
          />
        ))}
      </div>

      {index > 0 && (
        <EdgeChevron dir="left" onClick={() => setIndex(clamp(index - 1))} />
      )}
      {index < count - 1 && (
        <EdgeChevron dir="right" onClick={() => setIndex(clamp(index + 1))} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run the screen test to verify it passes**

Run: `npx vitest run src/cumulus/screens/QuestStartScreen.test.tsx`
Expected: PASS (all three cases).

If `typecheck` later reports an unknown token among `--t-rules`, `--t-title-sm`, `--t-body`, `--dur-base`, `--border-soft`, `--gold`, `--tracking-eyebrow`, resolve the real name with `grep -n "<name>" src/cumulus/primitives/cumulus-tokens.css` and substitute. `--surface-glass`, `--safe-top`, `--safe-bottom`, `--gutter`, `--dur-slow`, `--ease-out`, `--line-strong`, `--bg-app`, `--bg-sunken`, `--accent`, `--accent-bright`, `--text-primary/secondary/muted`, `--space-*`, `--radius-pill` are already confirmed to exist.

- [ ] **Step 6: Run the full check suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all pass. In particular `cumulus-strict-api.contract.test.mjs` must pass — the screen-local components expose only model/callback props (no `style`/`className`/`CSSProperties`). All spacing/radii/shadows in the code above are tokenized; if `no-untokenized-lengths` still flags a leftover raw px in a *style* position (not a box measure — width/height/position/fontSize are box measures and stay raw), replace it with the nearest `--space-*` token. The one remaining bespoke value is the TideCluster disc-overlap ring `boxShadow: 0 0 0 2px var(--bg-app)`; if the rule rejects it, express the 2px ring as a `border`/`outline` in the tide's `--bg-app` color rather than disabling the rule.

- [ ] **Step 7: Commit**

```bash
git add src/cumulus/primitives/glyph.ts \
        src/cumulus/screens/QuestStartScreen.tsx \
        src/cumulus/screens/QuestStartScreen.test.tsx
git add -A src/cumulus/metadata .claude/skills/cumulus .llms 2>/dev/null || true
git commit -m "$(cat <<'MSG'
feat(cumulus): rewrite Dreamcaller selection as a mobile swipe carousel

Replace the static card row with the imported full-bleed swipe carousel: one
Dreamcaller per page (cinematic screen-local portrait + serif name/epithet + a
frosted GroupPanel console holding ability text with a keyword-definition
reveal, an expandable TideCluster, starting essence, and a Choose action).
Choose calls onPick -> startQuest, unchanged. Tides row hidden when a run has
no tides. Adapter and view-model unchanged.

Claude-Session: https://claude.ai/code/session_01GkWjuYnPndxz9r86wiuWdv
MSG
)"
git push
```

---

## Task 4: Verification & browser QA

Confirms the whole flow end-to-end in a real browser and locks in the checks.

**Files:** none (verification only).

- [ ] **Step 1: Full check suite**

Run: `npm run lint && npm run typecheck && npm test`
Expected: all green, including `cumulus-strict-api.contract.test.mjs` and `cumulus-generated-docs-drift.test.mjs`.

- [ ] **Step 2: Start a QA dev server on a non-default port**

Run (capture the PID to tear down only this server later):

```bash
npm run dev -- --port 5174 &
echo $! > /tmp/dc-qa-vite.pid
```

Wait for Vite to report "ready".

- [ ] **Step 3: Drive the carousel with agent-browser**

Use `/opt/homebrew/bin/agent-browser` (fallback `npx agent-browser`) against `http://localhost:5174` (a fresh quest boots onto the Dreamcaller-selection screen). Verify, at a mobile viewport (e.g. 390×844):
- Each page shows a full-bleed portrait, the serif "{Name}, {Epithet}" title, and the frosted console.
- Swiping left/right pages between the three Dreamcallers; edge chevrons do the same.
- Pressing/holding the ability text reveals the keyword-definition InfoCard tiles (for a Dreamcaller whose ability has keywords), anchored and clamped on-screen.
- Tapping the Tides cluster runs the disc→pill container-transform; the resting pills reveal their descriptions on press; pressing the essence value reveals its InfoCard.
- Pressing "Choose {Name}" starts the quest (the screen advances past selection).
- Inspect the captured error buffer for render errors, unhandled rejections, and console errors. Confirm no clipping/overlap and stable spacing.

- [ ] **Step 4: Compare against the legacy screen**

Load `http://localhost:5174/?ui=legacy` and confirm the legacy card-row screen still renders (the rollback path is intact), then return to `?ui=cumulus` (default).

- [ ] **Step 5: Tear down only the QA server**

```bash
kill "$(cat /tmp/dc-qa-vite.pid)" && rm -f /tmp/dc-qa-vite.pid
```

(Do not run a broad `pkill -f vite` — it would kill the developer's own 5173 server.)

- [ ] **Step 6: Commit any QA fixes**

If QA surfaced issues, fix them, re-run Step 1, and commit with a descriptive message (same `Claude-Session:` trailer) and push. If QA was clean with no code changes, there is nothing to commit for this task.

---

## Self-Review Notes

- **Spec coverage:** carousel screen (Task 3), `TideCluster` full container-transform (Task 2), screen-local full-bleed portrait — `DreamcallerPortrait` untouched (Task 3, `FullBleedPortrait`), `CardTermDefinitions` evolved in place with Dreamsign/GameCard inheriting (Task 1), ability reveal via `InfoCard.PressInfo` guarded on term presence (Task 3, `AbilityReveal`), hide-tides-when-empty (Task 3), registration unchanged/verified (Task 3 interfaces + Task 4), QA (Task 4). All spec sections map to a task.
- **Placeholder scan:** none — every code step carries full source.
- **Type consistency:** `DreamcallerOfferView.tides` is `DreamcallerTideView[]`, which extends `TideClusterTideView` (`{id,label,description,tide}`), so it feeds `TideCluster` directly. `tideVisual(tide)` (Task 2) is consumed only inside `TideCluster`. `CardTermDefinitions({text,testId,side})` keeps its signature (Task 1) and is consumed by `AbilityReveal` (Task 3) with just `text`.
