import type { CSSProperties, ReactNode } from "react";
import { TideDisc } from "../../components/hud/TideDisc";
import { TidesInfoLabel } from "../../components/hud/TidesInfoLabel";
import { token } from "../../primitives/tokens";

const flowSteps = [
  ["Named source", "Owns semantic identity and strict reveal content."],
  ["Source binding", "Registers interaction handlers with the root coordinator."],
  ["Coordinator", "Chooses one active group and owns its lifecycle."],
  ["Overlay + geometry", "Measures content and selects safe placement."],
  ["Strict surface", "InfoCard or GameCard renders the visual content."],
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

function Section({
  id,
  title,
  children,
}: {
  readonly id: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section
      id={id}
      style={{ display: "flex", flexDirection: "column", gap: token("--space-l") }}
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
      data-entity-reveal-flow={compact ? "preview" : "docs"}
      aria-label="Entity reveal coordination flow"
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
              style={{
                color: token("--accent-bright"),
              }}
            >
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

export function EntityRevealCoordinatorPreview() {
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

function LiveRevealStage() {
  return (
    <div
      data-entity-reveal-system-demo=""
      style={{
        position: "relative",
        minHeight: 320,
        overflow: "auto",
        padding: token("--space-2xl"),
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
        borderRadius: token("--radius-panel"),
        boxSizing: "border-box",
      }}
    >
      <div
        className="cumulus-entity-reveal-demo-row"
        style={{
          gap: token("--space-2xl"),
        }}
      >
        <div
          data-entity-reveal-demo-source="left"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-s"),
          }}
        >
          <span style={{ color: token("--text-muted"), font: token("--t-caption") }}>
            Left source
          </span>
          <TideDisc
            tide="valor"
            id="cumulus-docs-entity-reveal-valor"
            label="Rising Valor"
            description="A steadfast tide that rewards holding the line."
          />
        </div>

        <div
          style={{
            maxWidth: 260,
            textAlign: "center",
            color: token("--text-secondary"),
            font: token("--t-body-sm"),
          }}
        >
          <TidesInfoLabel />
          <p style={{ margin: `${token("--space-s")} 0 0` }}>
            Hover or focus a source. On touch, press and hold. The coordinator
            measures the reveal and chooses its safe side.
          </p>
        </div>

        <div
          data-entity-reveal-demo-source="right"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-s"),
          }}
        >
          <span style={{ color: token("--text-muted"), font: token("--t-caption") }}>
            Right source
          </span>
          <TideDisc
            tide="vision"
            id="cumulus-docs-entity-reveal-vision"
            label="Rising Vision"
            description="A lucid tide that rewards seeing the next possibility."
          />
        </div>
      </div>
    </div>
  );
}

const responsibilities = [
  [
    "Named semantic component",
    "Resolves UUID-backed domain data into one strict primary, ordered secondaries, optional adjacent cards, and activation. It attaches the private source binding to its visible trigger.",
  ],
  [
    "CumulusRoot coordinator",
    "Registers mounted sources, arbitrates one active reveal group, runs the input state machine, owns dismissal and accessibility descriptions, and records open/close diagnostics.",
  ],
  [
    "Reveal overlay",
    "Portals a pointer-transparent group to document.body, renders a hidden measurement pass, observes content size, and places the final group above screen stacking contexts.",
  ],
  [
    "Placement geometry",
    "Chooses desktop or mobile layout from the visual viewport, respects physical safe areas and scroll boundaries, reserves persistent HUD space, and keeps the highest-priority prefix that fits.",
  ],
  [
    "InfoCard and GameCard",
    "Own strict visual content, intrinsic geometry, and rendering. They do not select a trigger, portal, open state, or screen position.",
  ],
  [
    "Product screen",
    "Renders the named semantic component and supplies domain data plus activation callbacks. It does not construct reveal specs, anchors, delays, sides, or controlled shown state.",
  ],
] as const;

function Responsibilities() {
  return (
    <div className="cumulus-system-responsibilities" data-entity-reveal-responsibilities="">
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

export function EntityRevealCoordinatorDocs() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: token("--space-4xl"),
        paddingBottom: token("--space-4xl"),
      }}
    >
      <Section id="entity-reveal-contract" title="System Contract">
        <p style={bodyStyle}>
          Entity reveals are coordinated behavior, not a feature of any one
          React component. Named semantic sources supply identity and content;
          one application-wide coordinator decides when that content is active,
          measures it, places it, and renders it through strict surfaces. This
          keeps screens declarative and gives every entity the same interaction,
          accessibility, placement, dismissal, and logging contract.
        </p>
        <Flow />
      </Section>

      <Section id="entity-reveal-live-behavior" title="Live Behavior">
        <p style={bodyStyle}>
          These are production TideDisc and TidesInfoLabel sources using the real
          coordinator. Their reveal cards render through the root portal rather
          than inside this documentation stage.
        </p>
        <LiveRevealStage />
      </Section>

      <Section id="entity-reveal-responsibility" title="Responsibility Boundary">
        <Responsibilities />
      </Section>

      <Section id="entity-reveal-input" title="Input And Lifecycle">
        <ContractList>
          <li>
            Fine pointers reveal immediately on hover. Keyboard focus reveals
            the same group, and Escape suppresses the current focus visit.
          </li>
          <li>
            Touch begins with a short intent filter. A quick release may activate
            an actionable source; holding reads the reveal without activating it.
          </li>
          <li>
            Pointer movement, release or cancellation, scroll, drag, resize,
            orientation change, window blur, route change, source unmount, and
            replacement dismiss centrally.
          </li>
          <li>
            Exactly one pointer-transparent reveal group is active. Source
            feedback remains on the trigger; the overlay never intercepts input.
          </li>
        </ContractList>
      </Section>

      <Section id="entity-reveal-placement" title="Measurement And Placement">
        <ContractList>
          <li>
            A hidden measurement pass renders the complete primary, secondary,
            and adjacent content before any visible placement is committed.
          </li>
          <li>
            Desktop InfoCards normally sit beside their source on the side with
            enough safe space. Complete source cards may remain in place while
            their ordered definitions appear beside them.
          </li>
          <li>
            Below the 900px coordinator breakpoint, mobile placement uses 45% of
            the visual viewport per card and accounts for the touch point and a
            clearance circle around the finger.
          </li>
          <li>
            Physical safe-area insets, the nearest scrolling boundary, and the
            desktop journey status bar constrain the usable placement rectangle.
          </li>
          <li>
            Ordered secondaries and adjacent cards preserve their semantic
            priority: the coordinator renders the longest prefix that fits and
            logs any truncation or fallback.
          </li>
          <li>
            OfferTile may request the single Augury-specific desktop exception,
            which centers its body-only InfoCard above that offer. Other sources
            use automatic placement.
          </li>
        </ContractList>
      </Section>

      <Section id="entity-reveal-usage" title="Using The System">
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
              Start with the named semantic component for the entity: GameCard,
              AtlasNode, Dreamsign, DreamAvatarPortrait, TideDisc, EssenceValue,
              SiteNode, GlossaryTerm, or another registered
              source.
            </li>
            <li>
              Pass UUID-backed domain data and any activation callback. The
              application entry already mounts exactly one CumulusRoot.
            </li>
            <li>
              Let the component derive and register the reveal. Do not render a
              popup InfoCard from a screen or calculate an anchor, delay, side,
              portal, or open state there.
            </li>
            <li>
              When a new entity kind is genuinely required, implement its named
              component inside Cumulus and bind it to the private coordinator
              contract there.
            </li>
          </ol>
        </div>
      </Section>

      <Section id="entity-reveal-related" title="Related References">
        <div style={{ display: "flex", gap: token("--space-s"), flexWrap: "wrap" }}>
          <a
            data-system-related-component="info-card"
            href="#/info-card"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            InfoCard visual contract →
          </a>
          <a
            href="#/game-card"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            GameCard source contract →
          </a>
          <a
            href="/?demo=entity-reveals"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            Open deterministic conformance harness ↗
          </a>
        </div>
      </Section>
    </div>
  );
}
