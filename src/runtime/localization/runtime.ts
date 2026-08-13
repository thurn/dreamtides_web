import {
  canonicalJson,
  assertLocalized,
  Localizer,
  LocalizedString,
  opaque,
  bundleFromCanonicalJSON,
  type Bundle,
  type Diagnostic,
  type Argument,
  type LocalizedStringWire,
} from "@trox/runtime";
import { localizedRuntimeTemplate } from "./runtime-templates.generated";
import enUSBundleJSON from "../../generated/localization/en-US.trox.json?raw";
import { logEvent } from "../../logging";

export type QALocale = "ar" | "es" | "ja" | "ru";

export interface LocalizationRuntime {
  readonly bundle: Bundle;
  readonly localizer: Localizer;
  readonly locale: string;
  readonly direction: Bundle["direction"];
  readonly sourceCatalog: Localizer["sourceCatalog"];
}

function logDiagnostic(diagnostic: Diagnostic): void {
  logEvent("trox_resolution_diagnostic", {
    code: diagnostic.code,
    entryId: diagnostic.entry_id ?? null,
  });
}

function logSourceDiagnostic(diagnostic: Diagnostic): void {
  if (diagnostic.code === "trox.missing-row") return;
  logDiagnostic(diagnostic);
}

function deduplicateDiagnostics(
  diagnostic: (diagnostic: Diagnostic) => void,
): (diagnostic: Diagnostic) => void {
  const seen = new Set<string>();
  return (value) => {
    const key = `${value.code}\u0000${value.entry_id ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostic(value);
  };
}

export function loadCanonicalBundle(
  canonicalJSON: string,
  role: "source" | "target",
): Bundle {
  try {
    const bundle = bundleFromCanonicalJSON(canonicalJSON);
    logEvent("trox_bundle_loaded", {
      role,
      locale: bundle.locale,
      direction: bundle.direction,
      catalogFingerprint: bundle.source_catalog_fingerprint,
      outcome: "loaded",
    });
    return bundle;
  } catch (error) {
    logEvent("trox_bundle_loaded", {
      role,
      outcome: "failed",
      errorKind: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

export function createSourceLocalizationRuntime(
  source: Bundle,
  diagnostic: (diagnostic: Diagnostic) => void = logSourceDiagnostic,
): LocalizationRuntime {
  // Source English must remain byte-identical to the existing presentation.
  // Directional isolation is a target-locale concern; inserting FSI/PDI into
  // en-US would alter visible/accessibility strings in the parity ledger.
  const presentationSource: Bundle = { ...source, isolation: "none" };
  const localizer = new Localizer(presentationSource, presentationSource, {
    diagnostic: deduplicateDiagnostics(diagnostic),
  });
  return {
    bundle: presentationSource,
    localizer,
    locale: presentationSource.locale,
    direction: presentationSource.direction,
    sourceCatalog: localizer.sourceCatalog,
  };
}

export function createTargetLocalizationRuntime(
  target: Bundle,
  source: Bundle = requireSourceRuntime().bundle,
  diagnostic: (diagnostic: Diagnostic) => void = logDiagnostic,
): LocalizationRuntime {
  const localizer = new Localizer(target, source, {
    strict: true,
    diagnostic: deduplicateDiagnostics(diagnostic),
  });
  return {
    bundle: target,
    localizer,
    locale: target.locale,
    direction: target.direction,
    sourceCatalog: localizer.sourceCatalog,
  };
}

let bootstrapError: unknown = null;
let sourceRuntime: LocalizationRuntime | null = null;
try {
  sourceRuntime = createSourceLocalizationRuntime(
    loadCanonicalBundle(enUSBundleJSON, "source"),
  );
} catch (error) {
  bootstrapError = error;
}

export function getLocalizationBootstrapError(): unknown {
  return bootstrapError;
}

export function requireSourceRuntime(): LocalizationRuntime {
  if (sourceRuntime === null) {
    throw bootstrapError instanceof Error
      ? bootstrapError
      : new Error("Trox source runtime is unavailable.");
  }
  return sourceRuntime;
}

/**
 * Reconstitutes static text emitted by the canonical RON compatibility
 * pipeline as an unresolved Trox value authorized by the source catalog.
 *
 * Compatibility JSON deliberately retains plain source text for gameplay and
 * editor consumers. Presentation adapters call this function at that semantic
 * boundary instead of treating canonical localized content as an untranslated
 * string.
 */
const localizedSourceTextCache = new Map<string, LocalizedString>();

export function localizedSourceText(
  sourceText: string,
  values: Readonly<Record<string, number | boolean | LocalizedString>> = {},
): LocalizedString {
  const isStatic = Object.keys(values).length === 0;
  if (!isStatic) {
    const template = localizedRuntimeTemplate(sourceText, values);
    if (template !== null) return template;
  }
  const cached = isStatic
    ? localizedSourceTextCache.get(sourceText)
    : undefined;
  if (cached !== undefined) return cached;
  const runtime = requireSourceRuntime();
  const canonicalPattern = isStatic
    ? sourceText.split("{").join("{{").split("}").join("}}")
    : sourceText;
  const matches = Object.entries(runtime.bundle.entries).filter(
    ([, entry]) =>
      entry.identity?.meaning === null &&
      entry.identity.pattern.kind === "text" &&
      entry.identity.pattern.text === canonicalPattern &&
      Object.keys(entry.arguments ?? {}).length ===
        Object.keys(values).length &&
      Object.keys(values).every((name) => name in (entry.arguments ?? {})),
  );
  if (matches.length === 0 && import.meta.env.MODE === "test") {
    const placeholderPattern = /\{([A-Za-z_][A-Za-z0-9_-]*)\}/g;
    const renderedFixture = sourceText.replace(
      placeholderPattern,
      (_placeholder, name: string) => {
        if (!(name in values)) {
          throw new Error(`missing value for {${name}}`);
        }
        return values[name] instanceof LocalizedString
          ? resolveSource(values[name])
          : String(values[name]);
      },
    );
    return assertLocalized(renderedFixture);
  }
  if (matches.length !== 1) {
    throw new Error(
      `Canonical localized source text must match exactly one Trox entry; found ${String(matches.length)} for ${JSON.stringify(sourceText)}.`,
    );
  }
  const [entryId, entry] = matches[0];
  const wire: LocalizedStringWire = {
    arguments: Object.fromEntries(
      Object.entries(values).map(([name, value]): [string, Argument] => [
        name,
        value instanceof LocalizedString
          ? opaque(value)
          : typeof value === "number"
            ? { kind: "number", value }
            : { kind: "boolean", value },
      ]),
    ),
    entry_id: entryId,
    format: "trox-localized-string",
    identity: entry.identity!,
    selectors: [],
    source_signature: entry.source_signature,
    version: { major: 1, minor: 0 },
  };
  const localized = runtime.sourceCatalog.localizedStringFromJSON(
    canonicalJson(wire),
  );
  if (isStatic) localizedSourceTextCache.set(sourceText, localized);
  return localized;
}

export function requestedQALocaleFromBrowser(): QALocale | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("qaLocale");
  if (
    requested !== "ar" &&
    requested !== "es" &&
    requested !== "ja" &&
    requested !== "ru"
  ) {
    return null;
  }
  return requested;
}

export function resolveChecked(
  message: LocalizedString,
  runtime: LocalizationRuntime = requireSourceRuntime(),
): string {
  return runtime.localizer.resolveChecked(message);
}

/** Resolve catalog-authorized source copy for parsing or technical logging. */
export function resolveSource(message: LocalizedString): string {
  return requireSourceRuntime().localizer.resolve(message);
}
