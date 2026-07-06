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
import { GroupPanel } from "../components/controls/GroupPanel";

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
    <section id="tango-toc-philosophy" aria-labelledby="tango-intro-heading" style={{ marginBottom: token("--space-10") }}>
      <p style={eyebrowStyle}>Introduction</p>
      <h2 id="tango-intro-heading" style={sectionTitleStyle}>
        Design Philosophy
      </h2>
      <p style={leadStyle}>
        Tango is the design system for Dreamtides — one small, strict catalog
        of components that every screen is built from. Three ideas define it.
        It is a game interface, not a document: tangible objects stay in gentle
        motion and travel between states rather than blinking in and out. It is
        legible by construction: content earns clarity through the way it is
        rendered, never through a scrim or wash painted behind it. And it is
        deliberately closed: each component exposes a tight, typed surface with
        no style or className escape hatch, so no screen can quietly drift from
        the system. The principles below expand on those ideas.
      </p>

      <div style={principleListStyle}>
        <Principle title="Material Continuity">
          <p style={bodyStyle}>
            Nothing in Tango fades into existence. The entities that carry
            meaning — cards, dreamsigns, essence, and Dreamcallers — travel
            and expand between the states they occupy
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
            trigger reveals the card; a press does not reveal, it only gives the
            target its press feedback. On
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

        <Principle title="Strict, Controlled APIs">
          <p style={bodyStyle}>
            Every component exposes a small, strongly-typed surface —
            enumerated variants, sizes, and named content slots — and nothing
            else. A component never accepts a raw <code>className</code>, an
            inline <code>style</code> object, an arbitrary corner radius,
            padding, color, filter, or any other free-form token override.
            Those escape hatches let a caller silently drift from the system,
            so they simply do not exist. A value that is not free-form text is a{" "}
            <em>named</em> value, not a string: a color is a{" "}
            <code>TangoColor</code> (a palette role, or a <code>#hex</code>{" "}
            literal for a genuinely data-driven one), a glyph is a{" "}
            <code>Glyph</code> from the icon registry, a piece of art is an{" "}
            <code>ArtRef</code> the component resolves itself, and a media
            filter or crop is a named union. So a prop that is really a color,
            icon, or image can never be an arbitrary CSS string, class, or URL.{" "}
            <strong>Adding arbitrary token customization to a component is never
            acceptable</strong> — not a one-off color, not &ldquo;just this
            once&rdquo; padding. When a
            screen needs to size or position a component it wraps it in its own
            element: layout is the caller&rsquo;s concern, the component&rsquo;s
            fixed appearance is the system&rsquo;s. Adding a new <em>strict</em>
            prop — one more enumerated variant — is fine when you are confident
            no existing variant can express what you need; widening an existing
            prop into an open value is not. When in doubt, look at how the
            other screens solve it and match them rather than inventing a knob.
          </p>
          <p style={bodyStyle}>
            The knobs that keep trying to sneak back in are worth naming, because
            each looks harmless in isolation: a numeric <code>size</code>,{" "}
            <code>scale</code>, <code>elevation</code>, <code>gap</code>, or{" "}
            <code>threshold</code>; a per-instance <code>accent</code> or{" "}
            <code>color</code> so &ldquo;this one node&rdquo; can be a different
            hue; a decorative badge or wash toggle. Every one of these is a
            &ldquo;no.&rdquo; A pixel measurement is layout — the caller wraps and
            sizes its own element. A per-instance color is the design system
            drifting one call site at a time; a component reads the same
            everywhere, and the handful of states that legitimately differ
            (a battle node looming larger, a locked node dimmed) are decided{" "}
            <em>inside</em> the component from its semantic model, never handed in
            as a raw value. If you find yourself reaching for one of these, the
            component is being asked to do the caller&rsquo;s job — stop and wrap
            it instead.
          </p>
          <p style={bodyStyle}>
            This is enforced, not just documented: the{" "}
            <code>no-escape-hatch-props</code> ESLint rule errors when a
            component or primitive <code>*Props</code> type grows a{" "}
            <code>style</code>/<code>className</code> member, a{" "}
            <code>CSSProperties</code>-typed prop, a DOM-attribute{" "}
            <code>extends</code>, or an index signature, and a contract test
            re-checks the resolved surface — including a guard that a glyph,
            color, image, or filter prop never resolves to a bare{" "}
            <code>string</code>. So re-adding a knob fails lint or the build,
            not code review.
          </p>
        </Principle>
      </div>
    </section>
  );
}
