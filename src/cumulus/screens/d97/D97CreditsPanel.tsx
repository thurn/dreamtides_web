// D97CreditsPanel — the art credits, opened from the overworld Menu: one entry
// per art source in the manifest (P23), each its title as a link to the page
// that publishes it, the licenses it is offered under, its credited authors,
// and the attribution files that ship with it holding per-file credits. The
// panel hugs its entries and scrolls past the viewport. Escape or the close
// disc closes it. PURE: it renders from a view model and reports Close.

import type { ReactElement } from "react";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { useEscapeToClose } from "../../primitives/use-escape-to-close";
import { D97Panel } from "./D97Panel";

export interface D97CreditsSourceView {
  /** The source's library directory, unique per source: its test hook and React key. */
  readonly directory: string;
  readonly title: string;
  /** The page that publishes the source. */
  readonly url: string;
  readonly licenses: readonly string[];
  readonly authors: readonly string[];
  /** File names of the attribution files that ship with the source. */
  readonly creditsFiles: readonly string[];
}

export interface D97CreditsView {
  readonly sources: readonly D97CreditsSourceView[];
}

export interface D97CreditsPanelProps {
  readonly view: D97CreditsView;
  readonly onClose: () => void;
}

const COPY = {
  title: "Credits",
  subtitle: "The art of this dream comes from these open works and the artists who made them.",
  licenses: "Licenses",
  authors: "Artists",
  creditsFiles: "Per-file credits",
};

function CreditLine({ label, values, hook }: { label: string; values: readonly string[]; hook: string }): ReactElement {
  return (
    <p data-d97-credits-line={hook} data-count={values.length} style={{ margin: 0, font: token("--t-body-sm"), color: token("--text-on-glass-muted") }}>
      <span style={{ color: token("--text-on-glass") }}>{label}</span>
      {` · ${values.join(", ")}`}
    </p>
  );
}

function CreditsEntry({ source }: { source: D97CreditsSourceView }): ReactElement {
  // Pressable forwards every extra prop to the element it renders; its props
  // type names only the global HTML attributes, so the anchor's own travel in
  // a spread.
  const link = { href: source.url, target: "_blank", rel: "noopener noreferrer" };
  return (
    <li data-d97-credits-source={source.directory} style={{ display: "flex", flexDirection: "column", gap: token("--space-xxs") }}>
      <Pressable
        as="a"
        {...link}
        data-d97-credits-link={source.directory}
        style={{
          alignSelf: "flex-start",
          font: token("--t-lead"),
          color: token("--text-on-glass"),
          textDecoration: "underline",
          textUnderlineOffset: token("--space-xxs"),
          overflowWrap: "anywhere",
        }}
      >
        {source.title}
      </Pressable>
      <CreditLine label={COPY.licenses} values={source.licenses} hook="licenses" />
      <CreditLine label={COPY.authors} values={source.authors} hook="authors" />
      {source.creditsFiles.length > 0 && <CreditLine label={COPY.creditsFiles} values={source.creditsFiles} hook="credits-files" />}
    </li>
  );
}

export function D97CreditsPanel({ view, onClose }: D97CreditsPanelProps): ReactElement {
  useEscapeToClose(onClose);
  return (
    <D97Panel kind="credits" title={COPY.title} subtitle={COPY.subtitle} onClose={onClose} closeTestId="d97-credits-close">
      <ul
        data-d97-credits=""
        data-count={view.sources.length}
        style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: token("--space-l") }}
      >
        {view.sources.map((source) => (
          <CreditsEntry key={source.directory} source={source} />
        ))}
      </ul>
    </D97Panel>
  );
}
