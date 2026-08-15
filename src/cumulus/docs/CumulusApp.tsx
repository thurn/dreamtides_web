// Standalone documentation endpoint for the Cumulus design system, reachable at
// `/cumulus` (see the route branch in `src/main.tsx`). Switches on the hash route
// (see route.ts) between the overview, first-class cross-component UI-system
// contracts, component reference pages, and full-screen component mockups. The
// chrome is styled lightly with Cumulus tokens — dogfooding the design system it
// documents.
import "../primitives/cumulus-tokens.css";
import "../primitives/legibility.css";
import "../assets/phosphor.css";

import type { CSSProperties } from "react";
import { useCumulusRoute } from "./route";
import { useOverviewScrollRestoration } from "./use-overview-scroll-restoration";
import {
  CUMULUS_COMPONENT_GROUPS,
  CUMULUS_COMPONENTS,
  type CumulusComponent,
  type CumulusComponentGroup,
  type CumulusComponentId,
} from "./registry";
import { getComponent } from "./registry";
import { getMockup } from "./mockups/registry";
import { ComponentPage } from "./ComponentPage";
import { ComponentShowcase } from "./ComponentShowcase";
import { SystemPage } from "./SystemPage";
import { SystemShowcase } from "./SystemShowcase";
import {
  CUMULUS_UI_SYSTEMS,
  type CumulusUISystem,
  type CumulusUISystemId,
} from "./systems/registry";
import { IntroSection } from "./IntroSection";
import { DesignTokensSection, TOKEN_TOC_ENTRIES } from "./DesignTokensSection";
import { TableOfContents, type TocEntry } from "./TableOfContents";
import { token } from "../primitives/tokens";
import type { DomElementId } from "../types/dom";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: token("--bg-app"),
  color: token("--text-primary"),
  fontFamily: token("--font-ui"),
  padding: token("--space-3xl"),
  boxSizing: "border-box",
};

const contentStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
};

interface ComponentGroup {
  group: CumulusComponentGroup;
  entries: CumulusComponent[];
}

/** Group registry entries in the catalog's stable reader-facing order. */
function groupComponents(
  components: CumulusComponent[],
): ComponentGroup[] {
  const groups = new Map<CumulusComponentGroup, CumulusComponent[]>();
  for (const component of components) {
    const bucket = groups.get(component.group) ?? [];
    bucket.push(component);
    groups.set(component.group, bucket);
  }
  return CUMULUS_COMPONENT_GROUPS.flatMap((group) => {
    const entries = groups.get(group);
    return entries === undefined ? [] : [{ group, entries }];
  });
}

/** Stable DOM-id slug for a component group's overview section, e.g.
 * "Components" -> "cumulus-toc-group-components". */
function groupAnchorId(group: CumulusComponentGroup): DomElementId {
  const slug = group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `cumulus-toc-group-${slug}`;
}

/** Stable DOM-id for a single component's showcase anchor. */
function componentAnchorId(id: CumulusComponentId): DomElementId {
  return `cumulus-toc-component-${id}`;
}

const UI_SYSTEMS_ANCHOR_ID = "cumulus-toc-ui-systems";
const COMPONENTS_ANCHOR_ID = "cumulus-toc-components";

function systemAnchorId(id: CumulusUISystemId): DomElementId {
  return `cumulus-toc-system-${id}`;
}

/** Builds the table-of-contents entries in the exact top-to-bottom order the
 * overview renders its sections: prose, component groups, then UI systems. */
function buildTocEntries(
  groups: ComponentGroup[],
  systems: readonly CumulusUISystem[],
): TocEntry[] {
  const entries: TocEntry[] = [
    { id: "cumulus-toc-philosophy", label: "Design Philosophy", depth: 0 },
    { id: "cumulus-toc-tokens", label: "Design Tokens", depth: 0 },
    // The token section's categories (Color, Typography, ...) nest one rung in,
    // derived from the section itself so they can't drift from its headings.
    ...TOKEN_TOC_ENTRIES.map((entry) => ({ ...entry, depth: 1 as const })),
    { id: COMPONENTS_ANCHOR_ID, label: "Components", depth: 0 },
  ];
  for (const { group, entries: components } of groups) {
    entries.push({ id: groupAnchorId(group), label: group, depth: 1 });
    for (const component of components) {
      entries.push({
        id: componentAnchorId(component.id),
        label: component.title,
        depth: 2,
      });
    }
  }
  entries.push(
    { id: UI_SYSTEMS_ANCHOR_ID, label: "UI Systems", depth: 0 },
    ...systems.map((system) => ({
      id: systemAnchorId(system.id),
      label: system.title,
      depth: 1 as const,
    })),
  );
  return entries;
}

function Overview() {
  const groups = groupComponents(CUMULUS_COMPONENTS);
  const tocEntries = buildTocEntries(groups, CUMULUS_UI_SYSTEMS);
  return (
    <div>
      <TableOfContents entries={tocEntries} />
      <header style={{ marginBottom: token("--space-4xl") }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: `0 0 ${token("--space-xs")}`,
          }}
        >
          Design System
        </p>
        <h1 style={{ font: token("--t-display"), margin: 0 }}>
          Cumulus Design System
        </h1>
      </header>

      <IntroSection />

      <DesignTokensSection />

      <section
        id={COMPONENTS_ANCHOR_ID}
        data-cumulus-components=""
        style={{ marginBottom: token("--space-4xl") }}
      >
        <h2
          style={{
            margin: `0 0 ${token("--space-2xl")}`,
            color: token("--text-muted"),
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
          }}
        >
          Components
        </h2>
        {groups.length === 0 ? (
          <p style={{ color: token("--text-muted"), font: token("--t-body") }}>
            Components coming soon.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: token("--space-4xl") }}>
            {groups.map(({ group, entries }) => (
              <section key={group} id={groupAnchorId(group)}>
                <h3
                  style={{
                    font: token("--t-eyebrow"),
                    letterSpacing: token("--tracking-eyebrow"),
                    textTransform: "uppercase",
                    color: token("--text-muted"),
                    margin: `0 0 ${token("--space-l")}`,
                  }}
                >
                  {group}
                </h3>
                <div style={{ display: "flex", flexDirection: "column", gap: token("--space-3xl") }}>
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
      </section>

      <section
        id={UI_SYSTEMS_ANCHOR_ID}
        data-cumulus-ui-systems=""
        style={{ marginBottom: token("--space-4xl") }}
      >
        <h2
          style={{
            margin: `0 0 ${token("--space-s")}`,
            color: token("--text-muted"),
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
          }}
        >
          UI Systems
        </h2>
        <p
          style={{
            maxWidth: "68ch",
            margin: `0 0 ${token("--space-2xl")}`,
            color: token("--text-secondary"),
            font: token("--t-body"),
          }}
        >
          Cross-component behavior belongs here when it has its own lifecycle,
          coordination, placement, or invariants. System pages document the
          contract among components and the application host; component pages
          continue to document visual roles and typed props.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: token("--space-2xl") }}>
          {CUMULUS_UI_SYSTEMS.map((system) => (
            <SystemShowcase
              key={system.id}
              system={system}
              anchorId={systemAnchorId(system.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/** Floating "← Back" affordance overlaid on a full-screen mockup. */
function MockupBackLink({
  id,
  label,
}: {
  id: CumulusComponentId;
  label: string;
}) {
  return (
    <a
      href={`#/${id}`}
      style={{
        position: "fixed",
        top: token("--space-m"),
        left: token("--space-m"),
        zIndex: 100,
        display: "inline-flex",
        alignItems: "center",
        gap: token("--space-xs"),
        padding: `${token("--space-xs")} ${token("--space-s")}`,
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
function MockupView({ id }: { id: CumulusComponentId }) {
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
            padding: token("--space-3xl"),
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

export default function CumulusApp() {
  const route = useCumulusRoute();
  useOverviewScrollRestoration(route);

  // The mockup view renders full-bleed, so it bypasses the centered, max-width
  // content column that the overview and component pages sit inside.
  if (route.view === "mockup") {
    return (
      <div className="cumulus">
        <MockupView id={route.id} />
      </div>
    );
  }

  return (
    <div className="cumulus" style={pageStyle}>
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
        {route.view === "system" && <SystemPage key={route.id} id={route.id} />}
      </div>
    </div>
  );
}
