import { localizationTodo } from "@trox/runtime";
import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { useMessages, formatMessageDescriptor } from "../hooks/use-messages";
import type { FluentMessageDescriptor } from "../../data/localization-messages";

/** One labelled value in an application-state comparison. */
export interface ApplicationStateComparisonRow {
  readonly label: FluentMessageDescriptor;
  readonly expected: string | FluentMessageDescriptor;
  readonly actual: string | FluentMessageDescriptor;
  readonly differs: boolean;
}

/** One explicit action offered by an application-state screen. */
export interface ApplicationStateAction {
  readonly id: "primary" | "secondary";
  readonly label: FluentMessageDescriptor;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

interface ApplicationStateBase {
  readonly title: FluentMessageDescriptor;
  readonly message: FluentMessageDescriptor;
  readonly detailMessage?: FluentMessageDescriptor;
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
      readonly busyLabel: FluentMessageDescriptor;
    })
  | (ApplicationStateBase & {
      readonly kind: "roomCreation";
      readonly busyLabel: FluentMessageDescriptor;
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

const EYEBROW_FOR_KIND: Record<
  ApplicationStateView["kind"],
  FluentMessageDescriptor
> = {
  loading: { id: "application-eyebrow-dreamtides" },
  roomCreation: { id: "application-eyebrow-dreamtides" },
  recoverableError: { id: "application-eyebrow-journey-status" },
  fatalConfiguration: { id: "application-eyebrow-configuration" },
  versionGate: { id: "application-eyebrow-game-version" },
  contentConfigGate: { id: "application-eyebrow-game-settings" },
  unreadableRoom: { id: "application-eyebrow-game-data" },
  unreachableRoom: { id: "application-eyebrow-game-connection" },
};

/** Pure Cumulus presentation for bootstrap, room, and compatibility states. */
export function ApplicationStateScreen({
  view,
}: ApplicationStateScreenProps): ReactElement {
  const t = useMessages();
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
        paddingTop: `max(${token(SAFE_AREA_INSET_PROPERTIES.top)}, ${token("--space-2xl")})`,
        paddingRight: `max(${token(SAFE_AREA_INSET_PROPERTIES.right)}, ${token("--space-l")})`,
        paddingBottom: `max(${token(SAFE_AREA_INSET_PROPERTIES.bottom)}, ${token("--space-2xl")})`,
        paddingLeft: `max(${token(SAFE_AREA_INSET_PROPERTIES.left)}, ${token("--space-l")})`,
        background: token("--bg-loading"),
      }}
    >
      <div style={{ width: "min(100%, 640px)" }}>
        <GlassPanel
          eyebrow={localizationTodo(formatMessageDescriptor(t, EYEBROW_FOR_KIND[view.kind]))}
          title={localizationTodo(formatMessageDescriptor(t, view.title))}
          subtitle={localizationTodo(formatMessageDescriptor(t, view.message))}
          headingLevel="h1"
          titleVoice="hero"
          headerSpacing="spacious"
          testId={`application-state-${view.kind}`}
        >
          <div
            style={{
              display: "grid",
              gap: token("--space-l"),
              padding: token("--space-2xl"),
              color: token("--text-on-glass"),
              font: token("--t-body"),
            }}
          >
            {busy && <BusyIndicator label={formatMessageDescriptor(t, view.busyLabel)} />}
            {view.kind === "contentConfigGate" && (
              <ComparisonTable rows={view.comparison} />
            )}
            {(view.detailMessage !== undefined || view.detail !== undefined) && (
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
                {view.detailMessage === undefined
                  ? view.detail
                  : formatMessageDescriptor(t, view.detailMessage)}
              </p>
            )}
            {view.actions !== undefined && view.actions.length > 0 && (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "center",
                  gap: token("--space-s"),
                }}
              >
                {view.actions.map((action) => (
                  <GlassButton
                    key={action.id}
                    label={formatMessageDescriptor(t, action.label)}
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
  const t = useMessages();
  return (
    <dl
      data-application-state-comparison
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
        gap: token("--space-xs"),
        margin: 0,
        font: token("--t-rules"),
      }}
    >
      <span aria-hidden="true" />
      <dt style={{ color: token("--text-on-glass-muted") }}>
        {formatMessageDescriptor(t, { id: "application-comparison-this-game" })}
      </dt>
      <dt style={{ color: token("--text-on-glass-muted") }}>
        {formatMessageDescriptor(t, { id: "application-comparison-yours" })}
      </dt>
      {rows.map((row) => (
        <ComparisonRow key={row.label.id} row={row} />
      ))}
    </dl>
  );
}

function ComparisonRow({
  row,
}: {
  readonly row: ApplicationStateComparisonRow;
}): ReactElement {
  const t = useMessages();
  const valueColor = row.differs ? token("--danger") : token("--text-on-glass");
  return (
    <>
      <dt style={{ color: token("--text-on-glass-muted") }}>
        {formatMessageDescriptor(t, row.label)}
      </dt>
      <dd style={{ margin: 0, color: valueColor }}>
        {typeof row.expected === "string"
          ? row.expected
          : formatMessageDescriptor(t, row.expected)}
      </dd>
      <dd style={{ margin: 0, color: valueColor }}>
        {typeof row.actual === "string"
          ? row.actual
          : formatMessageDescriptor(t, row.actual)}
      </dd>
    </>
  );
}
