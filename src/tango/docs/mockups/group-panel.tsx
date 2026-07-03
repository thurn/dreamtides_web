// Full-screen mockup for GroupPanel — a Dreamcaller-select screen: two liquid-
// glass panes over real scene art, each collecting one Dreamcaller's related
// info (portrait, name + title, ability) into a single unit — the canonical
// "console" use this component's own doc comment calls out. Both Dreamcallers
// are real records from `data/tabula/dreamcallers_v2.toml` (Threxan, Drusus
// Calvus), identified by id, with their real portraits and real ability text
// (`rendered-text`) — never invented copy.

import { GroupPanel } from "../../components/GroupPanel";
import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { assetUrl } from "../../../runtime/asset-url";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

/** A Dreamcaller's character render, resolved the same way `assetUrl` resolves
 * every other binary art asset (see `src/components/DreamcallerPortrait.tsx`
 * for the production equivalent — reimplemented locally here so this
 * tango-isolated mockup never imports from `src/components/`). */
function dreamcallerPortraitUrl(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

interface DreamcallerCard {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  ability: string;
}

// Real dreamcaller records, from data/tabula/dreamcallers_v2.toml.
const CANDIDATES: DreamcallerCard[] = [
  {
    id: "B99936CA-97F9-4930-AF5A-FA9EF92557EF",
    name: "Threxan",
    title: "the Resounding Wrath",
    imageNumber: "0025",
    ability: "At the start of your first turn, draw a card.",
  },
  {
    id: "BDD3A3A7-242C-4D2B-8071-EBE56891A340",
    name: "Drusus Calvus",
    title: "Triumphator",
    imageNumber: "0083",
    ability: "At the start of your first turn, gain 1●.",
  },
];

function Candidate({ dreamcaller }: { dreamcaller: DreamcallerCard }) {
  // GroupPanel is a fixed glass pane: the consumer sizes it (the wrapper) and
  // lays out its content (the inner flex column), so the pane itself exposes no
  // width / layout / radius knobs.
  return (
    <div style={{ width: "min(300px, 42vw)", minWidth: 220 }}>
      <GroupPanel>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: token("--space-4"),
            textAlign: "center",
          }}
        >
          <img
            src={dreamcallerPortraitUrl(dreamcaller.imageNumber)}
            alt={`${dreamcaller.name}, ${dreamcaller.title}`}
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              objectFit: "cover",
              border: `1px solid ${token("--border-accent")}`,
            }}
          />
          <div>
            <div style={{ font: token("--t-lead"), color: token("--text-primary") }}>{dreamcaller.name}</div>
            <div style={{ font: token("--t-caption"), color: token("--text-secondary"), marginTop: 2 }}>
              {dreamcaller.title}
            </div>
          </div>
          <div
            style={{
              height: 1,
              width: "100%",
              background:
                "linear-gradient(90deg, transparent, var(--line-strong) 18%, var(--line-strong) 82%, transparent)",
            }}
          />
          <p style={{ font: token("--t-rules"), fontSize: 15, lineHeight: 1.4, color: token("--text-primary"), margin: 0 }}>
            {dreamcaller.ability}
          </p>
        </div>
      </GroupPanel>
    </div>
  );
}

export function GroupPanelMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.4) 0%, rgba(8,5,17,0.55) 50%, rgba(8,5,17,0.9) 100%), url(${dreamscapeSceneUrl("tumbleleaf_village")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-9"),
        padding: token("--space-8"),
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center", pointerEvents: "none" }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: 0,
          }}
        >
          New Dream
        </p>
        <h1 style={{ font: token("--t-display"), margin: `${token("--space-3")} 0 0`, color: token("--text-primary") }}>
          Choose Your Dreamcaller
        </h1>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-7"),
          justifyContent: "center",
        }}
      >
        {CANDIDATES.map((dreamcaller) => (
          <Candidate key={dreamcaller.id} dreamcaller={dreamcaller} />
        ))}
      </div>

      <SceneCaption
        eyebrow="Group Panel"
        title="Two liquid-glass panes over real scene art, each collecting a real Dreamcaller's portrait, name, and ability."
        corner="bottom-left"
      />
    </div>
  );
}
