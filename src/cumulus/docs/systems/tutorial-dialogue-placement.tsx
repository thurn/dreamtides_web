import { token } from "../../primitives/tokens";

const roles = [
  [
    "Tutorial state",
    "Chooses the presentation, message, visibility, and named placement preference.",
  ],
  [
    "Host",
    "Installs the coordinator and registers route-local geometry with stable semantic IDs.",
  ],
  ["Anchor", "Names the element an anchored dialogue should sit above."],
  [
    "Obstacle",
    "Registers a measured card, chrome, control, or dialogue region to avoid.",
  ],
  [
    "Dialogue",
    "Measures CharacterDialogue and deterministically selects a safe viewport position.",
  ],
] as const;

function Flow() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
        gap: token("--space-s"),
      }}
    >
      {roles.map(([title, body]) => (
        <div
          key={title}
          style={{
            padding: token("--space-m"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--radius-control"),
            background: token("--surface-card"),
          }}
        >
          <strong>{title}</strong>
          <p style={{ marginBottom: 0, color: token("--text-secondary") }}>
            {body}
          </p>
        </div>
      ))}
    </div>
  );
}
export function TutorialDialoguePlacementPreview() {
  return <Flow />;
}
export function TutorialDialoguePlacementDocs() {
  return (
    <div style={{ display: "grid", gap: token("--space-2xl") }}>
      <Flow />
      <section>
        <h2>Registration lifecycle</h2>
        <p>
          Anchors and obstacles register through callback refs. Strict Mode
          remounts and route transitions replace registrations by semantic ID,
          and cleanup removes only the matching route-local element.
        </p>
      </section>
      <section>
        <h2>Placement contract</h2>
        <p>
          Floating dialogue avoids registered cards and chrome. Anchored
          dialogue first attempts the named anchor, then uses the deterministic
          floating algorithm when the available space cannot fit the measured
          bubble.
        </p>
      </section>
      <section>
        <h2>Ownership</h2>
        <p>
          Components report geometry, the coordinator stores mounted elements,
          pure rectangle helpers choose a position, and tutorial state remains
          responsible for sequencing, persistence, triggers, and message
          indices.
        </p>
      </section>
    </div>
  );
}
