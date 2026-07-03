// IntroSection — the Introduction / Design Philosophy section of the /tango
// overview (spec §6). Condenses the design's governing principles — material
// continuity, always-in-motion, the legibility ladder, the popup rule, and the
// content voice — into prose, so a reader gets the "why" before the component
// catalog below it. Renders above the component table of contents in
// `TangoApp.tsx`'s `Overview`.
//
// Dogfoods Tango tokens for all of its own chrome (type scale, color, spacing,
// radius) via `token(...)` — no raw hex/px that has a token equivalent — and
// renders one live `GroupPanel` as a worked example of legibility-ladder rung
// two, rather than only describing it.

import type { CSSProperties, ReactElement } from "react";
import { token } from "../primitives/tokens";
import { GroupPanel } from "../components/GroupPanel";

const eyebrowStyle: CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--accent-bright"),
  margin: 0,
};

const sectionTitleStyle: CSSProperties = {
  font: token("--t-title"),
  color: token("--text-primary"),
  margin: `${token("--space-3")} 0 ${token("--space-6")}`,
};

const leadStyle: CSSProperties = {
  font: token("--t-lead"),
  color: token("--text-secondary"),
  margin: `0 0 ${token("--space-9")}`,
  maxWidth: "62ch",
};

const principleTitleStyle: CSSProperties = {
  font: token("--t-title-sm"),
  color: token("--text-primary"),
  margin: `0 0 ${token("--space-3")}`,
};

const bodyStyle: CSSProperties = {
  font: token("--t-body"),
  color: token("--text-secondary"),
  margin: 0,
  maxWidth: "68ch",
};

const principleListStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-8"),
  paddingBottom: token("--space-9"),
  borderBottom: `1px solid ${token("--border-soft")}`,
  marginBottom: token("--space-9"),
};

interface PrincipleProps {
  title: string;
  children: ReactElement | ReactElement[];
}

function Principle({ title, children }: PrincipleProps): ReactElement {
  return (
    <section>
      <h3 style={principleTitleStyle}>{title}</h3>
      {children}
    </section>
  );
}

const exampleWrapStyle: CSSProperties = {
  marginTop: token("--space-5"),
  maxWidth: "320px",
};

const exampleEyebrowStyle: CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--text-muted"),
  margin: `0 0 ${token("--space-2")}`,
};

const exampleBodyStyle: CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-secondary"),
  margin: 0,
};

/**
 * A worked example of legibility-ladder rung two: a live `GroupPanel`
 * collecting several related values into one glass pane, rather than the
 * page describing the pattern in the abstract.
 */
function GroupPanelExample(): ReactElement {
  return (
    <div style={exampleWrapStyle}>
      <GroupPanel>
        <p style={exampleEyebrowStyle}>Dreamcaller</p>
        <p style={exampleBodyStyle}>
          Essence, Spark, and the docked dreamsigns for the current run,
          grouped into one pane because they belong together — not to give a
          lone label something to sit on.
        </p>
      </GroupPanel>
    </div>
  );
}

/**
 * The Introduction / Design Philosophy section of the /tango overview.
 * Condensed prose covering material continuity, always-in-motion, the
 * legibility ladder, the popup rule, and the content voice — the governing
 * principles every Tango component is built against. Pure prose content;
 * dogfoods Tango tokens for its own chrome, including one live `GroupPanel`
 * worked example.
 */
export function IntroSection(): ReactElement {
  return (
    <section aria-labelledby="tango-intro-heading" style={{ marginBottom: token("--space-10") }}>
      <p style={eyebrowStyle}>Introduction</p>
      <h2 id="tango-intro-heading" style={sectionTitleStyle}>
        Design Philosophy
      </h2>
      <p style={leadStyle}>
        Tango is token-scaled and responsive, and reads the same on any
        screen. The rules underneath every component hold constant: objects
        persist rather than appear, tangible things are always in gentle
        motion, information earns a backdrop instead of being handed one, and
        every reveal-on-interaction popup speaks the same contract. The
        principles below are what every component in the catalog is built
        against.
      </p>

      <div style={principleListStyle}>
        <Principle title="Material Continuity">
          <p style={bodyStyle}>
            Nothing in Tango fades into existence. The four entities that
            carry meaning across screens — cards, dreamsigns, essence, and
            Dreamcallers — travel and expand between the states they occupy
            rather than appearing or disappearing. Two canonical transitions
            cover every case: object-travel, when a value moves between two
            anchors, and container-transform, when an object expands into its
            own detail view. Every component specs its enter, change, and
            exit against one of these two, so timing and easing never diverge
            by surface.
          </p>
        </Principle>

        <Principle title="Always in Motion">
          <p style={bodyStyle}>
            Dreamtides is a video game, and it honors the genre&rsquo;s
            conventions. Physical game entities — a card or a dreamsign resting
            in a shop display, a resource waiting to be spent — are always in
            gentle motion, floating up and down rather than sitting inert, so
            the world reads as alive rather than as a static document. Motion
            is a property of the object, not the screen: chrome meant for
            reviewing already-seen values, like the <strong>QuestStatusBar</strong>{" "}
            or a deck viewer, is allowed to hold still, because its job is
            legibility, not presence. When in doubt, a tangible object drifts;
            a readout rests.
          </p>
        </Principle>

        <Principle title="The Legibility Ladder">
          <p style={bodyStyle}>
            Content earns legibility by the way it is rendered, not by a
            backdrop painted behind it. Rung one is on-media: text and glyphs
            sitting directly on scene art carry their own outline dilation
            (<code>.hud-outline</code>) that hugs their contour, in place of a
            plate or blur. Rung two is <strong>GroupPanel</strong>, the one
            card used to collect genuinely dense, related information — several
            values, a heading with a body and an action — into a single
            liquid-glass pane. There is no rung for a scrim, wash, or vignette
            painted over scene art to fake legibility; the ladder simply does
            not include one.
          </p>
          <GroupPanelExample />
        </Principle>

        <Principle title="The Popup Rule">
          <p style={bodyStyle}>
            Every reveal-on-interaction popup — a tide description, the
            Dreamcaller profile, a dreamsign&rsquo;s ability text, a site
            description, essence — renders through the single{" "}
            <strong>InfoCard</strong> engine, so the vocabulary and timing
            cannot diverge by screen or by input. The card is anchored to the
            pointer or trigger, never centered, and there is no close button
            and no scrim. The reveal is a single contract expressed through
            whichever gesture is native to the device, and neither input is the
            primary one. On a fine pointer — a mouse or trackpad — hovering a
            trigger reveals the card and a press only compresses the target. On
            touch, touch-down reveals the card and release dismisses it, with a
            short click window (about 300ms) separating a tap that enters a
            screen from a hold that reads a popup. Hover-to-reveal and
            hold-to-reveal are the same behavior: a desktop reader and a touch
            reader get the identical card, each by the gesture their device
            already speaks.
          </p>
        </Principle>

        <Principle title="Content Voice">
          <p style={bodyStyle}>
            Copy addresses the player directly in the second person, in a
            literary register rather than a UI-label one. Titles are set in
            Title Case; eyebrow labels — the small tags above a heading, like
            the one above this section — are uppercase and monospaced. No
            emoji appears anywhere in Tango&rsquo;s chrome or content.
          </p>
        </Principle>
      </div>
    </section>
  );
}
