// D97OverworldPlaceholderScreen — the Dreamtides 97 overworld's stand-in until
// the overworld renderer lands: a centered glass panel naming the run's
// Avatar over the app background, with the control that opens the deck
// editor.
// PURE: it renders from a view model; the adapter owns state and identity.

import type { ReactElement } from "react";
import {
  AvatarPortrait,
  type AvatarVisual,
} from "../../components/hud/AvatarPortrait";
import { GlassButton } from "../../components/controls/GlassButton";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { token } from "../../primitives/tokens";
import type { AvatarId, D97RunId } from "../../../types/identifiers";

export interface D97OverworldAvatarView extends AvatarVisual {
  readonly id: AvatarId;
  readonly ability: string;
}

export interface D97OverworldPlaceholderView {
  readonly runId: D97RunId;
  /** Null when the run's Avatar is missing from the catalog. */
  readonly avatar: D97OverworldAvatarView | null;
  /** Copies in the active deck. */
  readonly deckCount: number;
}

export interface D97OverworldPlaceholderScreenProps {
  readonly view: D97OverworldPlaceholderView;
  /** Opens the deck editor. */
  readonly onEditDeck: () => void;
}

/** Portrait column width inside the panel. */
const PORTRAIT_WIDTH_PX = 112;
/** The panel's readable measure. */
const PANEL_MAX_WIDTH_PX = 420;

/** The placeholder overworld of a started D97 run. */
export function D97OverworldPlaceholderScreen({
  view,
  onEditDeck,
}: D97OverworldPlaceholderScreenProps): ReactElement {
  return (
    <main
      className="cumulus"
      data-d97-screen="overworld"
      data-d97-run-id={view.runId}
      data-d97-avatar={view.avatar?.id}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: token("--space-l"),
        boxSizing: "border-box",
        background: token("--bg-app"),
      }}
    >
      <div style={{ width: "100%", maxWidth: PANEL_MAX_WIDTH_PX }}>
        <GlassPanel
          eyebrow={"Dreamtides 97"}
          title={"The Dream Awaits"}
          subtitle={"Your run has begun. The overworld will open here."}
          headingLevel="h1"
          testId="d97-overworld-placeholder-panel"
          footer={
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: token("--space-l"),
              }}
            >
              <GlassButton
                label={`Edit Deck · ${String(view.deckCount)}`}
                onPress={onEditDeck}
                placement="onGlass"
                testId="d97-overworld-edit-deck"
              />
            </div>
          }
        >
          {view.avatar !== null && (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: token("--space-l"),
              }}
            >
              <div style={{ width: PORTRAIT_WIDTH_PX, lineHeight: 0 }}>
                <AvatarPortrait
                  avatar={view.avatar}
                  variant="panel"
                  profile={{ id: view.avatar.id, ability: view.avatar.ability }}
                />
              </div>
            </div>
          )}
        </GlassPanel>
      </div>
    </main>
  );
}
