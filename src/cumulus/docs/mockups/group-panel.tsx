// Full-screen mockup for GroupPanel — a DreamAvatar-select screen: two liquid-
// glass panes over real scene art, each collecting one DreamAvatar's related
// info (portrait, name + title, ability) into a single unit — the canonical
// "console" use this component's own doc comment calls out. Both DreamAvatars
// are real records from `data/tabula/dream_avatars.toml` (Threxan, Drusus
// Calvus), identified by id, with their real portraits and real ability text
// (`rendered-text`) — never invented copy.

import { GroupPanel } from "../../components/controls/GroupPanel";
import { dreamscapeSceneUrl } from "../../components/atlas/atlas-display";
import { assetUrl } from "../../../runtime/asset-url";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

/** A DreamAvatar's character render, resolved the same way `assetUrl` resolves
 * every other binary art asset (see `src/components/DreamAvatarPortrait.tsx`
 * for the production equivalent — reimplemented locally here so this
 * cumulus-isolated mockup never imports from `src/components/`). */
function dreamAvatarPortraitUrl(imageNumber: string): string {
  return assetUrl(`/dream-avatars/${imageNumber}.png`);
}

interface DreamAvatarCard {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  ability: string;
}

// Real dreamAvatar records, from data/tabula/dream_avatars.toml.
const CANDIDATES: DreamAvatarCard[] = [
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

function Candidate({ dreamAvatar }: { dreamAvatar: DreamAvatarCard }) {
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
            src={dreamAvatarPortraitUrl(dreamAvatar.imageNumber)}
            alt={`${dreamAvatar.name}, ${dreamAvatar.title}`}
            style={{
              width: 92,
              height: 92,
              borderRadius: "50%",
              objectFit: "cover",
              border: `1px solid ${token("--border-accent")}`,
            }}
          />
          <div>
            <div style={{ font: token("--t-lead"), color: token("--text-primary") }}>{dreamAvatar.name}</div>
            <div style={{ font: token("--t-caption"), color: token("--text-secondary"), marginTop: 2 }}>
              {dreamAvatar.title}
            </div>
          </div>
          <div
            style={{
              height: 1,
              width: "100%",
              background:
                "linear-gradient(90deg, transparent, var(--border-accent) 18%, var(--border-accent) 82%, transparent)",
            }}
          />
          <p style={{ font: token("--t-rules"), fontSize: 15, lineHeight: 1.4, color: token("--text-primary"), margin: 0 }}>
            {dreamAvatar.ability}
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
          Choose Your Avatar
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
        {CANDIDATES.map((dreamAvatar) => (
          <Candidate key={dreamAvatar.id} dreamAvatar={dreamAvatar} />
        ))}
      </div>

    </div>
  );
}
