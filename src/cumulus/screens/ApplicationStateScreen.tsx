import { meaning, tx, type LocalizedString } from "@trox/runtime";
import type { ReactElement } from "react";
import { GlassButton } from "../components/controls/GlassButton";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { SAFE_AREA_INSET_PROPERTIES } from "../primitives/safe-area";
import { token } from "../primitives/tokens";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export type ApplicationStateComparisonValue =
  | { readonly kind: "raw"; readonly value: string }
  | { readonly kind: "message"; readonly message: LocalizedString };

/** One labelled value in an application-state comparison. */
export interface ApplicationStateComparisonRow {
  readonly id: string;
  readonly label: LocalizedString;
  readonly expected: ApplicationStateComparisonValue;
  readonly actual: ApplicationStateComparisonValue;
  readonly differs: boolean;
}

/** One explicit action offered by an application-state screen. */
export interface ApplicationStateAction {
  readonly id: "primary" | "secondary";
  readonly label: LocalizedString;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}

interface ApplicationStateBase {
  readonly title: LocalizedString;
  readonly message: LocalizedString;
  readonly detailMessage?: LocalizedString;
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
      readonly busyLabel: LocalizedString;
    })
  | (ApplicationStateBase & {
      readonly kind: "roomCreation";
      readonly busyLabel: LocalizedString;
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

function eyebrowForKind(kind: ApplicationStateView["kind"]): LocalizedString {
  switch (kind) {
    case "loading":
    case "roomCreation":
      return tx(
        meaning("product-eyebrow", "Dreamtides"),
        "Product eyebrow above application loading and shared-room creation states.",
      );
    case "recoverableError":
      return tx(
        "Journey Status",
        "Eyebrow above a recoverable Journey state failure.",
      );
    case "fatalConfiguration":
      return tx(
        "Configuration",
        "Eyebrow above a fatal application configuration problem.",
      );
    case "versionGate":
      return tx(
        "Game Version",
        "Eyebrow above a shared room reducer-version compatibility gate.",
      );
    case "contentConfigGate":
      return tx(
        "Game Settings",
        "Eyebrow above a shared room content-settings comparison gate.",
      );
    case "unreadableRoom":
      return tx(
        "Game Data",
        "Eyebrow above a shared room whose persisted data cannot be decoded.",
      );
    case "unreachableRoom":
      return tx(
        "Game Connection",
        "Eyebrow above a shared room connection failure.",
      );
  }
}

/** Pure Cumulus presentation for bootstrap, room, and compatibility states. */
export function ApplicationStateScreen({
  view,
}: ApplicationStateScreenProps): ReactElement {
  const resolve = useLocalizer();
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
          eyebrow={eyebrowForKind(view.kind)}
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
              gap: token("--space-l"),
              padding: token("--space-2xl"),
              color: token("--text-on-glass"),
              font: token("--t-body"),
            }}
          >
            {busy && <BusyIndicator label={view.busyLabel} />}
            {view.kind === "contentConfigGate" && (
              <ComparisonTable rows={view.comparison} />
            )}
            {(view.detailMessage !== undefined ||
              view.detail !== undefined) && (
              <p
                role={
                  view.kind === "recoverableError" ||
                  view.kind === "fatalConfiguration"
                    ? "alert"
                    : undefined
                }
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
                  : resolve(view.detailMessage)}
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

function BusyIndicator({
  label,
}: {
  readonly label: LocalizedString;
}): ReactElement {
  const resolve = useLocalizer();
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
      {resolve(label)}
    </p>
  );
}

function ComparisonTable({
  rows,
}: {
  readonly rows: readonly ApplicationStateComparisonRow[];
}): ReactElement {
  const resolve = useLocalizer();
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
        {resolve(
          tx(
            "This Game",
            "Comparison-table heading for the shared room's expected content configuration.",
          ),
        )}
      </dt>
      <dt style={{ color: token("--text-on-glass-muted") }}>
        {resolve(
          tx(
            "Yours",
            "Comparison-table heading for the local client's content configuration.",
          ),
        )}
      </dt>
      {rows.map((row) => (
        <ComparisonRow key={row.id} row={row} />
      ))}
    </dl>
  );
}

function ComparisonRow({
  row,
}: {
  readonly row: ApplicationStateComparisonRow;
}): ReactElement {
  const resolve = useLocalizer();
  const valueColor = row.differs ? token("--danger") : token("--text-on-glass");
  return (
    <>
      <dt style={{ color: token("--text-on-glass-muted") }}>
        {resolve(row.label)}
      </dt>
      <dd style={{ margin: 0, color: valueColor }}>
        {row.expected.kind === "raw"
          ? row.expected.value
          : resolve(row.expected.message)}
      </dd>
      <dd style={{ margin: 0, color: valueColor }}>
        {row.actual.kind === "raw"
          ? row.actual.value
          : resolve(row.actual.message)}
      </dd>
    </>
  );
}
