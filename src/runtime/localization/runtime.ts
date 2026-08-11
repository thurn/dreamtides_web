import {
  Localizer,
  bundleFromCanonicalJSON,
  type Bundle,
  type Diagnostic,
  type LocalizedString,
} from "@trox/runtime";
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

export function loadCanonicalBundle(canonicalJSON: string, role: "source" | "target"): Bundle {
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
  sourceRuntime = createSourceLocalizationRuntime(loadCanonicalBundle(enUSBundleJSON, "source"));
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

export function requestedQALocaleFromBrowser(): QALocale | null {
  if (!import.meta.env.DEV || typeof window === "undefined") return null;
  const requested = new URLSearchParams(window.location.search).get("qaLocale");
  if (requested !== "ar" && requested !== "es" && requested !== "ja" && requested !== "ru") {
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
