import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";

/** One labelled value in an application-state comparison. */
export interface ApplicationStateComparisonRow {
  readonly label: string;
  readonly expected: string;
  readonly actual: string;
  readonly differs: boolean;
}

/** One explicit action offered by an application-state screen. */
export interface ApplicationStateAction {
  readonly id: "primary" | "secondary";
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

interface ApplicationStateBase {
  readonly title: string;
  readonly message: string;
  readonly detail?: string;
  readonly actions?: readonly ApplicationStateAction[];
}

/**
 * The complete player-visible vocabulary for app bootstrap and coop gates.
 * Controllers select a state and retain all IO, URL, Firebase, and room-log
 * effects; this screen only renders the supplied copy, values, and callback.
 */
export type ApplicationStateView =
  | (ApplicationStateBase & {
      readonly kind: "loading";
      readonly busyLabel: string;
    })
  | (ApplicationStateBase & {
      readonly kind: "roomCreation";
      readonly busyLabel: string;
    })
  | (ApplicationStateBase & { readonly kind: "recoverableError" })
  | (ApplicationStateBase & { readonly kind: "fatalConfiguration" })
  | (ApplicationStateBase & { readonly kind: "versionGate" })
  | (ApplicationStateBase & {
      readonly kind: "contentConfigGate";
      readonly comparison: readonly ApplicationStateComparisonRow[];
    })
  | (ApplicationStateBase & { readonly kind: "unreadableRoom" })
  | (ApplicationStateBase & { readonly kind: "unreachableRoom" });

export interface ApplicationStateScreenProps {
  /** Strict bootstrap / coop state selected by the external controller. */
  readonly view: ApplicationStateView;
}

const EYEBROW_FOR_KIND: Record<ApplicationStateView["kind"], string> = {
  loading: "Dreamtides",
  roomCreation: "Dreamtides",
  recoverableError: "Quest Status",
  fatalConfiguration: "Configuration",
  versionGate: "Game Version",
  contentConfigGate: "Game Settings",
  unreadableRoom: "Game Data",
  unreachableRoom: "Game Connection",
};

/** Pure Cumulus presentation for bootstrap, room, and compatibility states. */
export function ApplicationStateScreen({
  view,
}: ApplicationStateScreenProps): ReactElement {
  const busy = view.kind === "loading" || view.kind === "roomCreation";
  return (
    <main
      className="cumulus"
      data-application-state={view.kind}
      data-config-gate={view.kind === "contentConfigGate" ? "true" : undefined}
      data-version-gate={view.kind === "versionGate" ? "true" : undefined}
      data-unreadable-room={view.kind === "unreadableRoom" ? "true" : undefined}
      aria-busy={busy || undefined}
      style={{
        minHeight: "100vh",
        boxSizing: "border-box",
        display: "grid",
        placeItems: "center",
        paddingTop: `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-8")})`,
        paddingRight: `max(${token(SAFE_AREA_INSET_PROPERTIES.right)}, ${token("--space-6")})`,
        paddingBottom: `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-8")})`,
        paddingLeft: `max(${token(SAFE_AREA_INSET_PROPERTIES.left)}, ${token("--space-6")})`,
        background: token("--bg-loading"),
      }}
    >
      <div style={{ width: "min(100%, 640px)" }}>
        <GlassPanel
          eyebrow={EYEBROW_FOR_KIND[view.kind]}
          title={view.title}
          subtitle={view.message}
          headingLevel="h1"
          titleVoice="hero"
          headerSpacing="spacious"
          testId={`application-state-${view.kind}`}
        >
          <div
            style={{
              display: "grid",
              gap: token("--space-6"),
              padding: token("--space-8"),
              color: token("--text-on-glass"),
              font: token("--t-body"),
            }}
          >
            {busy && <BusyIndicator label={view.busyLabel} />}
            {view.kind === "contentConfigGate" && (
              <ComparisonTable rows={view.comparison} />
            )}
            {view.detail !== undefined && (
              <p
                role={view.kind === "recoverableError" || view.kind === "fatalConfiguration" ? "alert" : undefined}
                data-application-state-detail
                style={{
                  margin: 0,
                  color: token("--text-on-glass-muted"),
                  font: token("--t-rules"),
                  overflowWrap: "anywhere",
                }}
              >
                {view.detail}
              </p>
            )}
            {view.actions !== undefined && view.actions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: token("--space-4"),
                }}
              >
                {view.actions.map((action) => (
                  <GlassButton
                    key={action.id}
                    label={action.label}
                    onPress={action.onPress}
                    disabled={action.disabled}
                    variant={action.id === "primary" ? "accent" : "default"}
                    placement="onGlass"
                    testId={`application-state-action-${action.id}`}
                  />
                ))}
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </main>
  );
}

function BusyIndicator({ label }: { readonly label: string }): ReactElement {
  return (
    <p
      role="status"
      data-application-state-busy
      style={{
        margin: 0,
        color: token("--text-on-glass-muted"),
        font: token("--t-body"),
        textAlign: "center",
      }}
    >
      {label}
    </p>
  );
}

function ComparisonTable({
  rows,
}: {
  readonly rows: readonly ApplicationStateComparisonRow[];
}): ReactElement {
  return (
    <dl
      data-application-state-comparison
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
        gap: token("--space-3"),
        margin: 0,
        font: token("--t-rules"),
      }}
    >
      <span aria-hidden="true" />
      <dt style={{ color: token("--text-on-glass-muted") }}>This Game</dt>
      <dt style={{ color: token("--text-on-glass-muted") }}>Yours</dt>
      {rows.map((row) => (
        <ComparisonRow key={row.label} row={row} />
      ))}
    </dl>
  );
}

function ComparisonRow({
  row,
}: {
  readonly row: ApplicationStateComparisonRow;
}): ReactElement {
  const valueColor = row.differs ? token("--danger") : token("--text-on-glass");
  return (
    <>
      <dt style={{ color: token("--text-on-glass-muted") }}>{row.label}</dt>
      <dd style={{ margin: 0, color: valueColor }}>{row.expected}</dd>
      <dd style={{ margin: 0, color: valueColor }}>{row.actual}</dd>
    </>
  );
}
