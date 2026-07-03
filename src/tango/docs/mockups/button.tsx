// Full-screen mockup for Button — the ONE button, composed into a
// realistic Merchant site screen: a few purchase rows at 'sm'/'md' with a
// leading icon and an inline essence cost, one row priced beyond the player's
// current essence (disabled, per real affordability), and the 'lg' commit
// button ("Continue Your Dream") at the bottom — the same button, only
// taller, exactly per the component's own doc comment ("commit is a size, not
// a variant"). The scene uses real Dream Atlas backdrop art; the essence
// balance in the header uses ResourceChip, matching how the game pairs the
// two components everywhere a price appears.

import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { Button } from "../../components/Button";
import { ResourceChip } from "../../components/ResourceChip";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

const PLAYER_ESSENCE = 240;

interface OfferRowProps {
  icon: string;
  label: string;
  blurb: string;
  cost: number;
  size?: "sm" | "md";
}

function OfferRow({ icon, label, blurb, cost, size = "md" }: OfferRowProps) {
  const affordable = cost <= PLAYER_ESSENCE;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: token("--space-6"),
        padding: `${token("--space-5")} 0`,
        borderBottom: `1px solid ${token("--border-soft")}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: token("--space-5") }}>
        <span
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            display: "grid",
            placeItems: "center",
            background: token("--accent-tint"),
            border: `1px solid ${token("--border-accent")}`,
            flex: "0 0 auto",
          }}
        >
          <i className={icon} aria-hidden="true" style={{ fontSize: 20, color: token("--accent-bright") }} />
        </span>
        <div>
          <div style={{ font: token("--t-lead"), color: token("--text-primary") }}>{label}</div>
          <div style={{ font: token("--t-caption"), color: token("--text-muted"), marginTop: 2 }}>
            {blurb}
          </div>
        </div>
      </div>
      <Button
        size={size}
        cost={cost}
        disabled={!affordable}
        icon={<i className="bxf bx-crypto" aria-hidden="true" />}
      >
        Buy
      </Button>
    </div>
  );
}

export function ButtonMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        backgroundImage: `linear-gradient(to bottom, rgba(8,5,17,0.4) 0%, rgba(8,5,17,0.55) 45%, rgba(8,5,17,0.92) 100%), url(${dreamscapeSceneUrl("hopes_end")})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: token("--space-8"),
        // Extra bottom padding reserves room for the bottom-left SceneCaption
        // so the centered panel never grows tall enough (on a narrow, tall
        // viewport) to sit under it.
        paddingBottom: "calc(72px + " + token("--space-8") + ")",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          maxWidth: 520,
          marginTop: token("--space-6"),
        }}
      >
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: 0,
          }}
        >
          Merchant
        </p>
        <ResourceChip kind="essence" value={PLAYER_ESSENCE} chip size={18} gap={6} />
      </div>

      <div style={{ margin: "auto", width: "100%", maxWidth: 520 }}>
        <div
          style={{
            padding: token("--space-7"),
            background: token("--surface-glass"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--r-xl"),
            boxShadow: token("--shadow-lg"),
          }}
        >
          <h1
            style={{
              font: token("--t-title-sm"),
              margin: `0 0 ${token("--space-2")}`,
              color: token("--text-primary"),
            }}
          >
            The Wandering Merchant
          </h1>
          <p style={{ font: token("--t-body-sm"), color: token("--text-muted"), margin: `0 0 ${token("--space-6")}` }}>
            Spend essence on cards, dreamsigns, and services before you move on.
          </p>

          <OfferRow icon="bxf bx-dice-6" label="Draft Booster" blurb="Three fresh cards to choose from" cost={60} />
          <OfferRow
            icon="bxf bx-refresh-cw"
            label="Reroll Offers"
            blurb="Shuffle this Merchant's stock"
            cost={20}
            size="sm"
          />
          <OfferRow
            icon="bxf bx-gem"
            label="Rare Dreamsign"
            blurb="A powerful passive — priced beyond reach today"
            cost={500}
          />

          <div style={{ marginTop: token("--space-7") }}>
            <Button size="lg" full>
              Continue Your Dream
            </Button>
          </div>
        </div>
      </div>

      <SceneCaption
        eyebrow="Button"
        title="sm/md purchase rows with icon + cost, a disabled unaffordable row, and the lg commit height."
        corner="bottom-left"
      />
    </div>
  );
}
