import type { CSSProperties, ReactNode } from "react";
import { token } from "../../primitives/tokens";
import type { DomElementId } from "../../types/dom";

const flowSteps = [
  ["Journey state", "The folded run selects one Screen and active site."],
  ["ScreenRouter", "Keys the route, logs it, and owns transition presence."],
  [
    "Exhaustive resolver",
    "screenFor or siteDispositionFor selects the registered adapter or disposition.",
  ],
  [
    "Journey chrome",
    "Route policy selects journey chrome, battle chrome, or a deliberate bypass.",
  ],
  [
    "Composed surface",
    "Pure screen content shares the viewport with host-owned HUD and overlays.",
  ],
] as const;

const sectionHeadingStyle: CSSProperties = {
  margin: 0,
  color: token("--text-primary"),
  font: token("--t-title-sm"),
};

const bodyStyle: CSSProperties = {
  maxWidth: "72ch",
  margin: 0,
  color: token("--text-secondary"),
  font: token("--t-body"),
};

const surfaceStyle: CSSProperties = {
  padding: token("--space-l"),
  background: token("--surface-card"),
  border: `1px solid ${token("--border-soft")}`,
  borderRadius: token("--radius-control"),
};

const codeStyle: CSSProperties = {
  color: token("--text-primary"),
};

function Section({
  id,
  title,
  children,
}: {
  readonly id: DomElementId;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-l"),
      }}
    >
      <h2 style={sectionHeadingStyle}>{title}</h2>
      {children}
    </section>
  );
}

function Flow({ compact = false }: { readonly compact?: boolean }) {
  return (
    <div
      className="cumulus-system-flow"
      data-journey-screen-host-flow={compact ? "preview" : "docs"}
      aria-label="Journey screen host composition flow"
    >
      {flowSteps.map(([title, description], index) => (
        <div
          key={title}
          style={{
            position: "relative",
            minHeight: compact ? undefined : 112,
            padding: compact ? token("--space-s") : token("--space-m"),
            background: token("--bg-sunken"),
            border: `1px solid ${token("--border-mid")}`,
            borderRadius: token("--radius-control"),
          }}
        >
          <p
            style={{
              margin: 0,
              color: token("--text-primary"),
              font: compact ? token("--t-caption") : token("--t-button-sm"),
            }}
          >
            {title}
          </p>
          {!compact && (
            <p
              style={{
                margin: `${token("--space-xs")} 0 0`,
                color: token("--text-muted"),
                font: token("--t-caption"),
              }}
            >
              {description}
            </p>
          )}
          {index < flowSteps.length - 1 && (
            <span
              className="cumulus-system-flow__arrow"
              aria-hidden="true"
              style={{ color: token("--accent-bright") }}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function JourneyScreenHostChromePreview() {
  return (
    <div
      style={{
        padding: token("--space-l"),
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-control"),
      }}
    >
      <Flow compact />
    </div>
  );
}

const responsibilities = [
  [
    "JourneyApp",
    "Supplies app-shell handlers, connected-room count, retained overlay state, and the outer app-shell error boundary. Its deck, pool, debug, editor, starting-deck, and card-source overlays remain siblings of ScreenRouter and each receives an isolated overlay boundary.",
  ],
  [
    "ScreenRouter",
    "Reads the folded Screen, emits the screen_rendered diagnostic, resolves the route, chooses chrome policy, keys transition presence, and places one resettable screen boundary around the complete route composition.",
  ],
  [
    "screenFor",
    "Exhaustively maps every non-site Screen discriminant to its stateful adapter. The resolver returns screen content; it does not choose shared chrome.",
  ],
  [
    "siteDispositionFor",
    "Exhaustively maps every SiteType to a registered screen adapter, the battle host, or inline Dreamscape resolution. A directly-routed inline site is an invalid state.",
  ],
  [
    "CumulusJourneyChrome",
    "Builds the HUD view from journey state, owns the stage reference used by contextual guidance, and layers presence, status, and utility chrome according to its journey or battle variant.",
  ],
  [
    "Adapter and screen",
    "The adapter acquires state and supplies a view model. The pure Cumulus screen renders route content and callbacks without importing or reproducing the HUD, menu, presence indicator, tutorial controller, or route boundary.",
  ],
] as const;

function Responsibilities() {
  return (
    <div
      className="cumulus-system-responsibilities"
      data-journey-screen-host-responsibilities=""
    >
      {responsibilities.map(([owner, contract]) => (
        <div key={owner} style={{ display: "contents" }}>
          <div
            style={{
              padding: token("--space-m"),
              background: token("--surface-raised"),
              color: token("--text-primary"),
              font: token("--t-button-sm"),
            }}
          >
            {owner}
          </div>
          <div
            style={{
              padding: token("--space-m"),
              background: token("--surface-card"),
              color: token("--text-secondary"),
              font: token("--t-body-sm"),
            }}
          >
            {contract}
          </div>
        </div>
      ))}
    </div>
  );
}

function ContractList({ children }: { readonly children: ReactNode }) {
  return (
    <ul
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-s"),
        maxWidth: "72ch",
        margin: 0,
        paddingLeft: token("--space-l"),
        color: token("--text-secondary"),
        font: token("--t-body"),
      }}
    >
      {children}
    </ul>
  );
}

const routePolicies = [
  {
    id: "journey-start",
    route: "journeyStart",
    resolver: "screenFor",
    chrome: "Bypass",
    contract:
      "The selection screen owns the opening composition. A run inventory and DreamAvatar-backed utility menu are not available yet.",
  },
  {
    id: "active-run",
    route: "dreamscape · atlas",
    resolver: "screenFor",
    chrome: "Journey",
    contract:
      "Full status HUD, journey tutorial controller, presence policy, and utility menu. Atlas alone receives the Regenerate Atlas utility action.",
  },
  {
    id: "terminal-run",
    route: "journeyComplete · journeyFailed",
    resolver: "screenFor",
    chrome: "Journey, status hidden",
    contract:
      "The route keeps utility and presence chrome while its screen-owned summary carries the terminal run readout.",
  },
  {
    id: "hosted-site",
    route: "screen site",
    resolver: "siteDispositionFor → screen",
    chrome: "Journey",
    contract:
      "Registered site adapter inside the standard host. Augury contributes contextual utility actions; Purge and Shop explicitly suppress the host presence indicator.",
  },
  {
    id: "battle-preview",
    route: "Battle preview",
    resolver: "siteDispositionFor → battle",
    chrome: "Journey",
    contract:
      "The opposing-DreamAvatar preview remains part of journey navigation, including the complete HUD, menu, presence, and journey tutorial layer.",
  },
  {
    id: "playable-battle",
    route: "Playable Battle",
    resolver: "BattleSiteRoute",
    chrome: "Battle",
    contract:
      "The battle variant omits journey guidance and utility menu. Desktop keeps the partial Essence and Dreamsign HUD; mobile uses the battle shell without the journey HUD. Presence defaults hidden.",
  },
  {
    id: "inline-site",
    route: "Essence · Reward",
    resolver: "siteDispositionFor → inline",
    chrome: "Dreamscape-owned",
    contract:
      "These sites resolve within Dreamscape. Reaching ScreenRouter with one of their site IDs throws so an invalid route cannot silently invent a screen host.",
  },
] as const;

function RoutePolicyTable() {
  const headerStyle: CSSProperties = {
    padding: token("--space-m"),
    background: token("--surface-raised"),
    color: token("--text-primary"),
    font: token("--t-button-sm"),
    textAlign: "left",
  };
  const cellStyle: CSSProperties = {
    padding: token("--space-m"),
    borderTop: `1px solid ${token("--border-soft")}`,
    color: token("--text-secondary"),
    font: token("--t-body-sm"),
    verticalAlign: "top",
  };

  return (
    <div
      data-journey-screen-host-route-policies=""
      style={{
        overflowX: "auto",
        border: `1px solid ${token("--border-mid")}`,
        borderRadius: token("--radius-control"),
      }}
    >
      <table
        style={{ width: "100%", minWidth: 760, borderCollapse: "collapse" }}
      >
        <thead>
          <tr>
            <th style={headerStyle}>Route</th>
            <th style={headerStyle}>Resolution</th>
            <th style={headerStyle}>Host policy</th>
            <th style={headerStyle}>Composed contract</th>
          </tr>
        </thead>
        <tbody>
          {routePolicies.map((policy) => (
            <tr key={policy.id} data-route-policy={policy.id}>
              <td style={{ ...cellStyle, color: token("--text-primary") }}>
                {policy.route}
              </td>
              <td style={{ ...cellStyle, color: token("--text-primary") }}>
                {policy.resolver}
              </td>
              <td style={cellStyle}>{policy.chrome}</td>
              <td style={cellStyle}>{policy.contract}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function JourneyScreenHostChromeDocs() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-4xl"),
        paddingBottom: token("--space-4xl"),
      }}
    >
      <Section id="journey-screen-host-contract" title="System Contract">
        <p style={bodyStyle}>
          Journey screen composition is an application-host concern. Folded
          journey state selects a route; exhaustive resolvers select an adapter
          or a site disposition; ScreenRouter applies the route policy; and
          CumulusJourneyChrome layers shared journey behavior around the pure
          screen. This makes chrome consistent by registration and keeps screen
          view models limited to their own content.
        </p>
        <Flow />
      </Section>

      <Section
        id="journey-screen-host-responsibility"
        title="Responsibility Boundary"
      >
        <Responsibilities />
      </Section>

      <Section id="journey-screen-host-routes" title="Route Policy Matrix">
        <p style={bodyStyle}>
          The route discriminant decides the hosting policy. A screen does not
          opt into chrome, and a screen-specific layout does not remove it. Each
          exception is expressed by ScreenRouter or BattleSiteRoute at the same
          level that selects the route.
        </p>
        <RoutePolicyTable />
        <p style={bodyStyle}>
          Application loading and recoverable-error states that occur before a
          journey route is ready render as application-state screens outside
          this route composition.
        </p>
      </Section>

      <Section id="journey-screen-host-layers" title="Chrome Layers">
        <ContractList>
          <li>
            <span style={codeStyle}>children</span> render inside the fixed
            Cumulus stage. The stage reference defines the visible route subtree
            that contextual tutorial guidance may inspect.
          </li>
          <li>
            Journey chrome mounts JourneyCardTutorialController after the
            screen. It observes visible UUID-backed cards and authored semantic
            anchors, reconciles guidance with the shared tutorial fold, and
            renders guidance through its own overlay boundary. Site tutorial
            state takes precedence while it is active.
          </li>
          <li>
            CoopPresenceStatus receives the presence-derived client count and an
            explicit visibility decision. A null count reports connection in
            progress. Presence is informational, pointer-transparent chrome.
          </li>
          <li>
            JourneyStatusBar is built from the current journey state. Journey
            routes use the complete inventory in grand desktop or compact mobile
            form. Playable battle exposes only the desktop partial HUD defined
            by the battle variant.
          </li>
          <li>
            The utility CommandMenu appears for journey chrome once a
            DreamAvatar exists. It uses the top-end gear on desktop and the
            top-start menu glyph on mobile, combines app actions with built-in
            commands, and accepts host-resolved contextual actions.
          </li>
        </ContractList>
      </Section>

      <Section
        id="journey-screen-host-presence"
        title="Route Presence And Input"
      >
        <div style={surfaceStyle}>
          <p style={{ ...bodyStyle, maxWidth: undefined }}>
            AnimatePresence retains an outgoing route long enough to fade it,
            while JourneyScreenFrame immediately marks that subtree inert,
            aria-hidden, and pointer-inactive. Non-site keys use the Screen
            discriminant; site keys include the site identifier. The retained
            screen therefore cannot receive input through a fixed descendant
            while its replacement becomes active.
          </p>
        </div>
      </Section>

      <Section id="journey-screen-host-errors" title="Error Containment">
        <ContractList>
          <li>
            The app-shell boundary contains failures across ScreenRouter and the
            retained app overlays, preserving a visible emergency fallback.
          </li>
          <li>
            Each route composition receives a
            <span style={codeStyle}> screen:&lt;type&gt;</span> boundary whose
            reset key includes the site identifier for site routes. Navigation
            gives the next route a fresh rendering attempt.
          </li>
          <li>
            Tutorial guidance, the status HUD, and the utility menu have named
            overlay boundaries inside CumulusJourneyChrome. A failure in one
            shared layer does not replace healthy screen content or the other
            chrome layers.
          </li>
          <li>
            Retained app overlays such as the deck viewer have sibling overlay
            boundaries and close recovery. Captured failures log their scope and
            are mirrored to the browser-QA error buffer. Event handlers and
            asynchronous work handle their own failures because React error
            boundaries cover rendering.
          </li>
        </ContractList>
      </Section>

      <Section id="journey-screen-host-usage" title="Registering A Screen">
        <div style={surfaceStyle}>
          <ol
            style={{
              display: "flex",
              flexDirection: "column",
              gap: token("--space-s"),
              margin: 0,
              paddingLeft: token("--space-l"),
              color: token("--text-secondary"),
              font: token("--t-body"),
            }}
          >
            <li>
              Build the pure Cumulus screen, pure view-model builder, and thin
              state adapter. Keep shared journey layers out of all three view
              models and screen render trees.
            </li>
            <li>
              Register a non-site adapter in{" "}
              <span style={codeStyle}>screenFor</span>, or give every new
              SiteType an explicit
              <span style={codeStyle}> siteDispositionFor</span> branch.
            </li>
            <li>
              Express a genuine route exception in ScreenRouter,
              BattleSiteRoute, or the named CumulusJourneyChrome variant. Do not
              conditionally hide host chrome from inside screen presentation.
            </li>
            <li>
              Extend the table-driven registry contract and exercise the normal
              route through the production router so resolution, shared chrome,
              transitions, and error containment are verified together.
            </li>
          </ol>
        </div>
      </Section>

      <Section id="journey-screen-host-related" title="Related References">
        <div
          style={{ display: "flex", gap: token("--space-s"), flexWrap: "wrap" }}
        >
          <a
            data-system-related-component="journey-status-bar"
            href="#/journey-status-bar"
            style={{
              color: token("--accent-bright"),
              font: token("--t-body-sm"),
            }}
          >
            Journey Status Bar →
          </a>
          <a
            href="#/command-menu"
            style={{
              color: token("--accent-bright"),
              font: token("--t-body-sm"),
            }}
          >
            Command Menu →
          </a>
          <a
            href="#/coop-presence-status"
            style={{
              color: token("--accent-bright"),
              font: token("--t-body-sm"),
            }}
          >
            Coop Presence Status →
          </a>
        </div>
      </Section>
    </div>
  );
}
