import {
  arBundleJSON,
  esBundleJSON,
  jaBundleJSON,
  ruBundleJSON,
} from "virtual:trox-bundles";
import { logEvent } from "../../logging";
import {
  createTargetLocalizationRuntime,
  loadCanonicalBundle,
  requireSourceRuntime,
  type LocalizationRuntime,
  type QALocale,
} from "./runtime";

const qaBundleJSON: Readonly<Record<QALocale, string>> = {
  ar: arBundleJSON,
  es: esBundleJSON,
  ja: jaBundleJSON,
  ru: ruBundleJSON,
};

const qaRuntimeCache = new Map<QALocale, LocalizationRuntime>();

/** Development/test-only loader. Production code reaches this module only
 * through an import.meta.env.DEV-gated dynamic import in the provider. */
export function loadQALocalizationRuntime(locale: QALocale): LocalizationRuntime {
  const cached = qaRuntimeCache.get(locale);
  if (cached !== undefined) return cached;
  try {
    const source = requireSourceRuntime();
    const runtime = createTargetLocalizationRuntime(
      loadCanonicalBundle(qaBundleJSON[locale], "target"),
      source.bundle,
    );
    qaRuntimeCache.set(locale, runtime);
    return runtime;
  } catch (error) {
    logEvent("trox_target_runtime_created", {
      locale,
      outcome: "failed",
      errorKind: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}
