// Standalone documentation endpoint for the Tango design system, reachable at
// `/tango` (see the route branch in `src/main.tsx`). Switches on the hash route
// (see route.ts) between the overview gallery — which embeds each component's
// live, interactive mockup inline and links out to its docs page and its
// full-screen mockup — a component's doc page, and a component's full-screen
// mockup: a realistic full-bleed scene composing the component with real
// content. The chrome is styled lightly with Tango tokens — dogfooding the
// design system it documents.
import "../primitives/tango-tokens.css";
import "../assets/phosphor.css";

import type { CSSProperties } from "react";
import { useLayoutEffect, useRef } from "react";
import { useTangoRoute } from "./route";
import { TANGO_COMPONENTS, type TangoComponent } from "./registry";
import { getComponent } from "./registry";
import { getMockup } from "./mockups/registry";
import { ComponentPage } from "./ComponentPage";
import { ComponentShowcase } from "./ComponentShowcase";
import { IntroSection } from "./IntroSection";
import { PrimitivesSection, TOKEN_TOC_ENTRIES } from "./PrimitivesSection";
import { TableOfContents, type TocEntry } from "./TableOfContents";
import { token } from "../primitives/tokens";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: token("--bg-app"),
  color: token("--text-primary"),
  fontFamily: token("--font-ui"),
  padding: token("--space-9"),
  boxSizing: "border-box",
};

const contentStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
};

/** Group registry entries by their `group`, preserving first-seen order. */
function groupComponents(
  components: TangoComponent[],
): { group: string; entries: TangoComponent[] }[] {
  const groups: { group: string; entries: TangoComponent[] }[] = [];
  for (const component of components) {
    let bucket = groups.find((candidate) => candidate.group === component.group);
    if (!bucket) {
      bucket = { group: component.group, entries: [] };
      groups.push(bucket);
    }
    bucket.entries.push(component);
  }
  return groups;
}

/** Stable DOM-id slug for a component group's overview section, e.g.
 * "Components" -> "tango-toc-group-components". */
function groupAnchorId(group: string): string {
  const slug = group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `tango-toc-group-${slug}`;
}

/** Stable DOM-id for a single component's showcase anchor. */
function componentAnchorId(id: string): string {
  return `tango-toc-component-${id}`;
}

/** Builds the table-of-contents entries in the exact top-to-bottom order the
 * overview renders its sections: the two prose sections, then each component
 * group with its components nested one rung in. */
function buildTocEntries(
  groups: { group: string; entries: TangoComponent[] }[],
): TocEntry[] {
  const entries: TocEntry[] = [
    { id: "tango-toc-philosophy", label: "Design Philosophy", depth: 0 },
    { id: "tango-toc-tokens", label: "Design Tokens", depth: 0 },
    // The token section's categories (Color, Typography, ...) nest one rung in,
    // derived from the section itself so they can't drift from its headings.
    ...TOKEN_TOC_ENTRIES.map((entry) => ({ ...entry, depth: 1 as const })),
  ];
  for (const { group, entries: components } of groups) {
    entries.push({ id: groupAnchorId(group), label: group, depth: 0 });
    for (const component of components) {
      entries.push({
        id: componentAnchorId(component.id),
        label: component.title,
        depth: 1,
      });
    }
  }
  return entries;
}

function Overview() {
  const groups = groupComponents(TANGO_COMPONENTS);
  const tocEntries = buildTocEntries(groups);
  return (
    <div>
      <TableOfContents entries={tocEntries} />
      <header style={{ marginBottom: token("--space-10") }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: `0 0 ${token("--space-3")}`,
          }}
        >
          Design System
        </p>
        <h1 style={{ font: token("--t-display"), margin: 0 }}>Tango</h1>
      </header>

      <IntroSection />

      <PrimitivesSection />

      {groups.length === 0 ? (
        <p style={{ color: token("--text-muted"), font: token("--t-body") }}>
          Components coming soon.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: token("--space-10") }}>
          {groups.map(({ group, entries }) => (
            <section key={group} id={groupAnchorId(group)}>
              <h2
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  textTransform: "uppercase",
                  color: token("--text-muted"),
                  margin: `0 0 ${token("--space-6")}`,
                }}
              >
                {group}
              </h2>
              <div style={{ display: "flex", flexDirection: "column", gap: token("--space-9") }}>
                {entries.map((entry) => (
                  <ComponentShowcase
                    key={entry.id}
                    entry={entry}
                    anchorId={componentAnchorId(entry.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Floating "← Back" affordance overlaid on a full-screen mockup. */
function MockupBackLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#/${id}`}
      style={{
        position: "fixed",
        top: token("--space-5"),
        left: token("--space-5"),
        zIndex: 100,
        display: "inline-flex",
        alignItems: "center",
        gap: token("--space-2"),
        padding: `${token("--space-2")} ${token("--space-4")}`,
        background: "rgba(12, 8, 22, 0.72)",
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-pill"),
        backdropFilter: "blur(8px)",
        color: token("--text-primary"),
        font: token("--t-button-sm"),
        textDecoration: "none",
      }}
    >
      ← Back to {label}
    </a>
  );
}

/**
 * Full-viewport host for a component's mockup. Bypasses the centered content
 * column so the mockup renders full-bleed (100vw×100vh), and overlays a fixed
 * back affordance to the component's doc page. Unknown / not-yet-built ids get a
 * graceful centered note with the same back link.
 */
function MockupView({ id }: { id: string }) {
  const Mockup = getMockup(id);
  const title = getComponent(id)?.title ?? id;
  return (
    <div
      style={{
        position: "relative",
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: token("--bg-app"),
      }}
    >
      <MockupBackLink id={id} label={title} />
      {Mockup ? (
        <Mockup />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: token("--space-9"),
            textAlign: "center",
            color: token("--text-secondary"),
            font: token("--t-lead"),
          }}
        >
          <p>No full-screen mockup yet for {title}.</p>
        </div>
      )}
    </div>
  );
}

export default function TangoApp() {
  const route = useTangoRoute();

  // Preserve the overview's scroll position across navigations. The overview
  // gallery is tall; component and mockup pages are short, so leaving the
  // overview clamps `window.scrollY` to 0 and returning would otherwise snap
  // to the top. While the overview is shown we record the latest scroll offset,
  // and on re-entry we restore it so "← Overview" lands the reader back where
  // they were.
  const overviewScrollRef = useRef(0);
  useLayoutEffect(() => {
    if (route.view !== "overview") return undefined;
    window.scrollTo(0, overviewScrollRef.current);
    const onScroll = () => {
      overviewScrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [route.view]);

  // The mockup view renders full-bleed, so it bypasses the centered, max-width
  // content column that the overview and component pages sit inside.
  if (route.view === "mockup") {
    return (
      <div className="tango">
        <MockupView id={route.id} />
      </div>
    );
  }

  return (
    <div className="tango" style={pageStyle}>
      <div style={contentStyle}>
        {route.view === "overview" && <Overview />}
        {route.view === "component" && (
          // key on the route id so a direct component→component hash change
          // (both `{view:"component"}`, no intervening overview) remounts the
          // page and re-seeds its args from the new component's defaultArgs —
          // otherwise React reconciles it as the same element and stale args
          // leak onto the new component.
          <ComponentPage key={route.id} id={route.id} />
        )}
      </div>
    </div>
  );
}
