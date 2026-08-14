// TableOfContents — the floating left-hand rail on the /cumulus overview. Lists
// the overview's top-level sections (Design Philosophy, Design Tokens,
// Components, UI Systems), the component groups nested beneath Components, and
// each system or component nested beneath its owner. It keeps the entry the reader is
// currently scrolled to highlighted. The rail only appears when the viewport is
// wide enough for it to float in the gutter beside the centered content column
// without overlapping it — the width breakpoint lives in table-of-contents.css.
//
// Chrome dogfoods Cumulus tokens (via the CSS classes in table-of-contents.css),
// matching the rest of the doc site.

import { useEffect, useState, type ReactElement } from "react";
import "./table-of-contents.css";

/** One row in the table of contents. `depth` 0 is a top-level section, depth 1
 * is a section child, and depth 2 is a component nested under its group. `id`
 * is the DOM `id` of the anchor element the row scrolls to and observes. */
export interface TocEntry {
  id: string;
  label: string;
  depth: 0 | 1 | 2;
}

// How far below the viewport top a section's start must cross before it counts
// as the active section — roughly the overview's top padding, so a section is
// "active" once its heading reaches the top reading band rather than the moment
// its bottom edge appears.
const ACTIVE_MARKER_PX = 96;

/**
 * Tracks which of `entries` the reader is currently scrolled to: the last entry
 * whose anchor top has crossed above {@link ACTIVE_MARKER_PX}. Falls back to the
 * first entry before any section has scrolled past. Recomputes on scroll and
 * resize (both passive), and once on mount so the initial paint is correct even
 * when the page loads already scrolled.
 */
function useActiveEntryId(entries: TocEntry[]): string | null {
  const ids = entries.map((entry) => entry.id).join("|");
  const [activeId, setActiveId] = useState<string | null>(
    () => entries[0]?.id ?? null,
  );

  useEffect(() => {
    const orderedIds = ids.length > 0 ? ids.split("|") : [];
    if (orderedIds.length === 0) {
      return undefined;
    }

    const recompute = () => {
      let current = orderedIds[0];
      for (const id of orderedIds) {
        const element = document.getElementById(id);
        if (element === null) {
          continue;
        }
        if (element.getBoundingClientRect().top - ACTIVE_MARKER_PX <= 0) {
          current = id;
        } else {
          // Anchors are in document order top-to-bottom, so the first one that
          // has not yet crossed the marker means every later one is further
          // down still — nothing after it can be the active section.
          break;
        }
      }
      setActiveId(current);
    };

    recompute();
    window.addEventListener("scroll", recompute, { passive: true });
    window.addEventListener("resize", recompute, { passive: true });
    return () => {
      window.removeEventListener("scroll", recompute);
      window.removeEventListener("resize", recompute);
    };
  }, [ids]);

  return activeId;
}

/** The ids of the entries that own the active entry, from its nearest parent
 * through its top-level section. These provide a trail for both levels of the
 * Components hierarchy. */
function ancestorIdsOf(entries: TocEntry[], activeId: string | null): Set<string> {
  const activeIndex = entries.findIndex((entry) => entry.id === activeId);
  if (activeIndex === -1 || entries[activeIndex].depth === 0) {
    return new Set();
  }
  const ancestors = new Set<string>();
  let nextDepth = entries[activeIndex].depth - 1;
  for (let index = activeIndex - 1; index >= 0; index -= 1) {
    if (entries[index].depth === nextDepth) {
      ancestors.add(entries[index].id);
      nextDepth -= 1;
      if (nextDepth < 0) {
        break;
      }
    }
  }
  return ancestors;
}

/** Smooth-scrolls to an anchor, landing it just below the viewport top rather
 * than flush against it, so the section heading is not clipped by the reading
 * band. Falls through silently if the anchor is missing. */
function scrollToAnchor(id: string): void {
  const element = document.getElementById(id);
  if (element === null) {
    return;
  }
  const top = element.getBoundingClientRect().top + window.scrollY - 24;
  window.scrollTo({ top, behavior: "smooth" });
}

/**
 * The floating table of contents for the /cumulus overview. Renders a fixed rail
 * in the left gutter (on wide viewports only — see table-of-contents.css) that
 * lists `entries` and highlights the section the reader is scrolled to, with the
 * owning group shown as a dimmed trail when a child is active. Clicking a row
 * smooth-scrolls to its section.
 */
export function TableOfContents({ entries }: { entries: TocEntry[] }): ReactElement | null {
  const activeId = useActiveEntryId(entries);
  const ancestorIds = ancestorIdsOf(entries, activeId);

  if (entries.length === 0) {
    return null;
  }

  return (
    <nav className="cumulus-toc" aria-label="Table of contents">
      <p className="cumulus-toc__eyebrow">On this page</p>
      <ul className="cumulus-toc__list">
        {entries.map((entry) => {
          const classes = ["cumulus-toc__item"];
          if (entry.depth === 1) {
            classes.push("cumulus-toc__item--child");
          } else if (entry.depth === 2) {
            classes.push("cumulus-toc__item--grandchild");
          }
          if (entry.id === activeId) {
            classes.push("cumulus-toc__item--active");
          } else if (ancestorIds.has(entry.id)) {
            classes.push("cumulus-toc__item--trail");
          }
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={classes.join(" ")}
                aria-current={entry.id === activeId ? "true" : undefined}
                onClick={() => scrollToAnchor(entry.id)}
              >
                {entry.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
