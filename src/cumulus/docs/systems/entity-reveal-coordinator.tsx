import type { CSSProperties, ReactNode } from "react";
import { TideDisc } from "../../components/hud/TideDisc";
import { TidesInfoLabel } from "../../components/hud/TidesInfoLabel";
import { token } from "../../primitives/tokens";
import { UsageSection } from "../UsageSection";

const flowSteps = [
  [
    "Render an entity",
    "Use a reveal-enabled component such as GameCard, Dreamsign, or TideDisc.",
  ],
  [
    "The player inspects it",
    "Hover or focus with a keyboard, or press and hold on a touch screen.",
  ],
  [
    "Readable details appear",
    "Cumulus shows the full object and any useful definitions in safe screen space.",
  ],
] as const;

const concepts = [
  [
    "Entity",
    "A game object with stable meaning and identity, such as a card, Dreamsign, tide, avatar, site, or glossary term.",
  ],
  [
    "Source",
    "The compact thing already visible on the screen—the card, icon, portrait, value, or text that the player inspects.",
  ],
  [
    "Reveal",
    "The temporary, read-only detail view. It may contain one primary card plus related definitions or referenced cards.",
  ],
  [
    "Action",
    "An optional click, quick tap, or keyboard action such as selecting a card. Touch-holding reads the reveal without firing it.",
  ],
] as const;

const revealComponents = [
  {
    id: "game-card",
    name: "GameCard",
    use: "Playable cards, battlefield cards, and compact card collections.",
    api: "model; optional onPress, unavailable, selection, exhausted, presentation",
    note: "The model supplies a UUID and a complete display snapshot. The reveal includes the full card, status and glossary definitions, and referenced Figments when present.",
  },
  {
    id: "dream-avatar-portrait",
    name: "DreamAvatarPortrait",
    use: "Avatar portraits that should expose the avatar's title and ability.",
    api: "dreamAvatar; profile to enable the reveal; optional onPress and unavailable",
    note: "Without profile, the portrait is decorative art and has no reveal behavior.",
  },
  {
    id: "dreamsign",
    name: "Dreamsign",
    use: "Dreamsign art in lists, rewards, shops, and the journey HUD.",
    api: "dreamsign; optional onPress, unavailable, variant",
    note: "The Dreamsign's UUID, art, rules text, and glossary terms supply its reveal; its layout wrapper owns the rendered size.",
  },
  {
    id: "tide-disc",
    name: "TideDisc",
    use: "A compact tide glyph that still needs a name and explanation.",
    api: "tide, id, label, description",
    note: "The reveal shows the named tide, its description, and the shared Tides definition.",
  },
  {
    id: "rules-text",
    name: "RulesText",
    use: "Standalone rules copy whose terms need contextual definitions.",
    api: "text, owner; glossaryInteraction defaults to source",
    note: "Use glossaryInteraction=\"delegated\" when a containing entity, such as GameCard, already owns the reveal.",
  },
  {
    id: "essence-value",
    name: "EssenceValue",
    use: "Essence amounts that should explain the currency on inspection.",
    api: "amount; optional entity enables the reveal",
    note: "Without entity, EssenceValue is a passive formatted value.",
  },
  {
    id: "atlas-node",
    name: "AtlasNode",
    use: "Dream Atlas destinations with scene, site, affiliation, and reward details.",
    api: "model, onPress",
    note: "Availability in the model decides whether the node activates; it remains readable in other states.",
  },
  {
    id: "site-node",
    name: "SiteNode",
    use: "Sites placed in a Dreamscape scene or shown as a choice or reward.",
    api: "model, motion, onSelect; optional presentation",
    note: "The model supplies the stable site identity, label, icon, state, and whether selection is allowed.",
  },
  {
    id: "offer-tile",
    name: "OfferTile",
    use: "The two symbolic choices in Augury.",
    api: "model, onPress; optional size",
    note: "This component owns Augury's special above-offer placement; callers do not configure reveal placement.",
  },
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

const inlineCodeStyle: CSSProperties = {
  color: token("--text-primary"),
  fontFamily: token("--font-meta"),
  fontSize: "12px",
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
      className="cumulus-system-flow cumulus-system-flow--entity-reveals"
      data-entity-reveal-flow={compact ? "preview" : "docs"}
      aria-label="How a player reads an entity reveal"
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
        style={{ gap: token("--space-2xl") }}
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
            Valor
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
            maxWidth: 300,
            textAlign: "center",
            color: token("--text-secondary"),
            font: token("--t-body-sm"),
          }}
        >
          <TidesInfoLabel />
          <p style={{ margin: `${token("--space-s")} 0 0` }}>
            Move your pointer over either disc, or Tab to it. On a touch screen,
            press and hold. Notice that the details choose a side with enough
            room and disappear when you move away.
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
            Vision
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

function DefinitionGrid({
  rows,
}: {
  readonly rows: readonly (readonly [string, string])[];
}) {
  return (
    <div className="cumulus-system-definition-grid">
      {rows.map(([term, definition]) => (
        <div key={term} style={{ display: "contents" }}>
          <div
            style={{
              padding: token("--space-m"),
              background: token("--surface-raised"),
              color: token("--text-primary"),
              font: token("--t-button-sm"),
            }}
          >
            {term}
          </div>
          <div
            style={{
              padding: token("--space-m"),
              background: token("--surface-card"),
              color: token("--text-secondary"),
              font: token("--t-body-sm"),
            }}
          >
            {definition}
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

function CodeExample({ children }: { readonly children: string }) {
  return <UsageSection examples={[{ code: children }]} />;
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
      <Section id="entity-reveal-introduction" title="What Is An Entity Reveal?">
        <p style={bodyStyle}>
          An entity reveal is the temporary detail view that appears when a
          player asks to inspect a game object. It lets a small card, icon,
          portrait, value, or piece of rules text remain compact while its full
          meaning is still easy to read. The reveal is for information; it does
          not navigate away from the current screen or ask the player to manage
          a popup.
        </p>
        <p style={bodyStyle}>
          You do not place an “entity reveal” component yourself. Reveal
          behavior is already built into semantic Cumulus components such as
          GameCard, Dreamsign, and TideDisc. Render the component with its real
          domain data and it supplies its own detail content, interaction, and
          accessibility behavior.
        </p>
        <Flow />
        <DefinitionGrid rows={concepts} />
      </Section>

      <Section id="entity-reveal-live-behavior" title="Try It">
        <p style={bodyStyle}>
          The two discs below are ordinary TideDisc components running through
          the same reveal system as the game. Try the input method you expect
          your players to use.
        </p>
        <LiveRevealStage />
      </Section>

      <Section id="entity-reveal-quick-start" title="Quick Start">
        <p style={bodyStyle}>
          Choose the Cumulus component that represents the object, then pass its
          semantic model. There is no reveal state, anchor, placement, delay, or
          portal prop to configure.
        </p>
        <CodeExample>{`<GameCard
  model={{ cardId: card.id, displaySnapshot: card }}
  onPress={() => selectCard(card.id)}
/>

<TideDisc
  tide="valor"
  id={tideDeck.id}
  label={tideDeck.label}
  description={tideDeck.description}
/>`}</CodeExample>
        <div style={surfaceStyle}>
          <p style={{ ...bodyStyle, maxWidth: "none" }}>
            <strong style={{ color: token("--text-primary") }}>What happens:</strong>{" "}
            GameCard derives a complete reading copy and the relevant status,
            timing, glossary, and Figment details from its model. TideDisc builds
            a tide InfoCard from its label and description. Both register with
            the CumulusRoot already mounted by the application.
          </p>
        </div>
      </Section>

      <Section id="entity-reveal-components" title="Choose A Reveal-Enabled Component">
        <p style={bodyStyle}>
          The component is the public API. Its normal props contain everything
          the reveal needs; follow the component link for the complete prop
          table and visual examples.
        </p>
        <div className="cumulus-entity-reveal-component-grid">
          {revealComponents.map((component) => (
            <article key={component.id} style={surfaceStyle}>
              <h3 style={{ margin: 0, font: token("--t-button") }}>
                <a
                  href={`#/${component.id}`}
                  style={{ color: token("--accent-bright") }}
                >
                  {component.name} →
                </a>
              </h3>
              <p
                style={{
                  margin: `${token("--space-s")} 0 0`,
                  color: token("--text-secondary"),
                  font: token("--t-body-sm"),
                }}
              >
                {component.use}
              </p>
              <p
                style={{
                  margin: `${token("--space-s")} 0 0`,
                  color: token("--text-muted"),
                  font: token("--t-caption"),
                }}
              >
                <strong style={{ color: token("--text-primary") }}>Reveal API:</strong>{" "}
                <code style={inlineCodeStyle}>{component.api}</code>
              </p>
              <p
                style={{
                  margin: `${token("--space-s")} 0 0`,
                  color: token("--text-muted"),
                  font: token("--t-caption"),
                }}
              >
                {component.note}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section id="entity-reveal-input" title="How Players Use It">
        <DefinitionGrid
          rows={[
            [
              "Mouse or hover-capable pen",
              "Hovering shows the reveal immediately. Moving away dismisses it. Clicking still performs the component's onPress action when one is supplied.",
            ],
            [
              "Keyboard",
              "Tabbing to the source shows the same reveal. Enter or Space performs its action. Escape hides the reveal for the current focus visit.",
            ],
            [
              "Touch",
              "A quick tap performs the action. Pressing and holding shows the reveal and suppresses the action, so reading never accidentally selects or buys the entity.",
            ],
            [
              "Dismissal",
              "The reveal closes when the player leaves, releases, scrolls, drags, changes route, resizes, rotates, or moves focus. Only one reveal is shown at a time.",
            ],
          ]}
        />
      </Section>

      <Section id="entity-reveal-content" title="What The Reveal Contains">
        <p style={bodyStyle}>
          Each reveal-enabled component translates its domain model into an
          ordered group. Callers provide meaning; the component decides how that
          meaning should be presented.
        </p>
        <DefinitionGrid
          rows={[
            [
              "Primary",
              "The main thing being read: usually an InfoCard, a complete GameCard, or the already-visible source when its full content is readable in place.",
            ],
            [
              "Secondary details",
              "Related InfoCards in importance order, such as Exhausted, timing rules, keyword definitions, or a Dreamsign's rules terms.",
            ],
            [
              "Adjacent cards",
              "Small referenced card objects, such as materialized Figment previews. These appear when a desktop layout has room and are omitted on touch layouts.",
            ],
          ]}
        />
        <p style={bodyStyle}>
          If every detail cannot fit safely, Cumulus preserves that order and
          shows the highest-priority prefix. The player always gets the primary
          content first.
        </p>
      </Section>

      <Section id="entity-reveal-usage" title="Usage Rules">
        <ContractList>
          <li>
            Pass stable domain identity and resolved display data. Cards use
            UUIDs, and the <code style={inlineCodeStyle}>displaySnapshot.id</code>{" "}
            must match <code style={inlineCodeStyle}>cardId</code>. Never use a
            display name as identity.
          </li>
          <li>
            Supply <code style={inlineCodeStyle}>onPress</code> or the component's
            named action callback only when the source is actionable. Use
            <code style={inlineCodeStyle}> unavailable</code> when it should stay
            readable without responding to selection.
          </li>
          <li>
            Let a layout wrapper size and position the source component. Reveal
            placement is automatic and accounts for the viewport, safe areas,
            scroll containers, the source position, the player's finger, and
            persistent HUD space.
          </li>
          <li>
            Use <code style={inlineCodeStyle}>InfoCard</code> to define visual
            information content, not as a screen-owned popup. A reveal-enabled
            component decides when and where InfoCard appears.
          </li>
          <li>
            The application entry mounts one <code style={inlineCodeStyle}>CumulusRoot</code>.
            Product screens beneath it do not mount another root or keep reveal
            state in React.
          </li>
        </ContractList>
      </Section>

      <Section id="entity-reveal-implementation" title="How It Works">
        <p style={bodyStyle}>
          A reveal-enabled component privately registers its stable identity,
          detail specification, visible source element, and optional action with
          the coordinator installed by CumulusRoot. The coordinator interprets
          mouse, keyboard, pen, and touch input as one consistent interaction
          lifecycle.
        </p>
        <p style={bodyStyle}>
          Before showing anything, the overlay renders the complete group in a
          hidden measurement pass. It then chooses a mobile or desktop layout,
          keeps the group inside the usable viewport, and renders it through a
          pointer-transparent portal above application overlays. Open, close,
          placement fallback, and truncation data are logged so a production
          interaction can be reconstructed.
        </p>
      </Section>

      <Section id="entity-reveal-extension" title="Adding A New Entity Type">
        <p style={bodyStyle}>
          First check whether an existing reveal-enabled component already
          represents the object. If the object is genuinely new, add a named
          semantic component inside Cumulus. That component owns the mapping
          from domain data to its primary and secondary detail cards and uses the
          private reveal-source binding internally.
        </p>
        <CodeExample>{`const binding = useRevealSource({
  identity: { entityType, entityId },
  spec: { primary, secondaries, adjacentCards },
  onActivate,
});

return (
  <Pressable ref={binding.ref} {...binding.sourceProps}>
    {/* the visible source */}
  </Pressable>
);`}</CodeExample>
        <p style={bodyStyle}>
          This is a contributor extension point, not a screen API. Product
          screens consume the finished named component and its typed props.
          Keep component actions named <code style={inlineCodeStyle}>onPress</code>{" "}
          (or a specific name such as <code style={inlineCodeStyle}>onNodePress</code>),
          and keep placement, timing, and controlled open state out of the
          public props.
        </p>
      </Section>

      <Section id="entity-reveal-related" title="Related References">
        <div style={{ display: "flex", gap: token("--space-s"), flexWrap: "wrap" }}>
          <a
            data-system-related-component="info-card"
            href="#/info-card"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            InfoCard component →
          </a>
          <a
            href="#/game-card"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            GameCard component →
          </a>
          <a
            href="/?demo=entity-reveals"
            style={{ color: token("--accent-bright"), font: token("--t-body-sm") }}
          >
            Open the deterministic interaction harness ↗
          </a>
        </div>
      </Section>
    </div>
  );
}
