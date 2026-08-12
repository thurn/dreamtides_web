import {
  Localizer,
  bundleFromCanonicalJSON,
  plural,
  meaning,
  one,
  other,
  tx,
  txa,
} from "@trox/runtime";
import { describe, expect, it } from "vitest";
import arBundleJSON from "../../generated/localization/ar.trox.json?raw";
import enUSBundleJSON from "../../generated/localization/en-US.trox.json?raw";
import esBundleJSON from "../../generated/localization/es.trox.json?raw";
import jaBundleJSON from "../../generated/localization/ja.trox.json?raw";
import ruBundleJSON from "../../generated/localization/ru.trox.json?raw";
import {
  createTargetLocalizationRuntime,
  loadCanonicalBundle,
  requireSourceRuntime,
} from "./runtime";
import { withSyntheticTranslations } from "./testing";

const source = bundleFromCanonicalJSON(enUSBundleJSON);
const esTemplate = bundleFromCanonicalJSON(esBundleJSON);
const arTemplate = bundleFromCanonicalJSON(arBundleJSON);
const jaTemplate = bundleFromCanonicalJSON(jaBundleJSON);
const ruTemplate = bundleFromCanonicalJSON(ruBundleJSON);

function searchMessage() {
  return tx(
    "Search cards",
    "Visible label for the Pool Viewer field that searches authored card names and rules text.",
  );
}

function algorithmMessage(algorithm_id: string) {
  return txa(
    "Algorithm: {algorithm_id}",
    { algorithm_id },
    "Visible Pool Viewer diagnostic summary naming the pool-construction algorithm. algorithm_id is a stable raw internal identifier such as tides4; translators may reorder it but the identifier itself remains unchanged.",
  );
}

function countMessage(visible_count: number, total_count: number) {
  return txa(
    meaning("pool-filtered-count-subtitle", plural(total_count, [
      one("{visible_count} of {total_count} Card"),
      other("{visible_count} of {total_count} Cards"),
    ])),
    { visible_count, total_count },
    "Filtered card-browser subtitle. visible_count is the non-negative number matching the active filters; total_count is the non-negative collection size before filtering and governs Card grammar.",
  );
}

describe("Trox localization runtime", () => {
  it("loads the committed canonical source bundle and resolves source values", () => {
    expect(loadCanonicalBundle(enUSBundleJSON, "source").source_catalog_fingerprint).toBe(
      source.source_catalog_fingerprint,
    );
    expect(requireSourceRuntime().localizer.resolve(searchMessage())).not.toBe("");
  });

  it("supports target placeholder reordering, repetition, and omission", () => {
    const message = algorithmMessage("tides4");
    const repeated = withSyntheticTranslations(esTemplate, [{
      message,
      translation: "{algorithm_id} / {algorithm_id}",
    }]);
    const repeatedRuntime = createTargetLocalizationRuntime(repeated, source);
    const repeatedText = repeatedRuntime.localizer.resolveChecked(message);
    expect(repeatedText.match(/\u2068/gu)).toHaveLength(2);
    expect(repeatedText.match(/\u2069/gu)).toHaveLength(2);

    const omitted = withSyntheticTranslations(esTemplate, [{
      message,
      translation: "Algoritmo",
    }]);
    expect(createTargetLocalizationRuntime(omitted, source).localizer.resolveChecked(message)).not.toBe("");
  });

  it("uses target number formatting and RTL placeholder isolation", () => {
    const message = countMessage(12, 1234);
    const target = withSyntheticTranslations(arTemplate, [{
      message,
      translation: "{visible_count}/{total_count}",
    }]);
    const runtime = createTargetLocalizationRuntime(target, source);
    const text = runtime.localizer.resolveChecked(message);
    expect(runtime.direction).toBe("rtl");
    expect(text.match(/\u2068/gu)).toHaveLength(2);
    expect(text.match(/\u2069/gu)).toHaveLength(2);
    expect(text).not.toContain("{visible_count}");
    expect(text).not.toContain("{total_count}");
  });

  it("selects Russian plural rows and supports long Japanese reordering", () => {
    const count = countMessage(2, 2);
    const russian = withSyntheticTranslations(ruTemplate, [{
      message: count,
      translation: "{total_count}: {visible_count}",
    }]);
    expect(createTargetLocalizationRuntime(russian, source).localizer.resolveChecked(count)).not.toContain("{total_count}");

    const algorithm = algorithmMessage("tides4");
    const japanese = withSyntheticTranslations(jaTemplate, [{
      message: algorithm,
      translation: "非常に長い翻訳コンテキスト — {algorithm_id} — 非常に長い翻訳コンテキスト",
    }]);
    const resolved = createTargetLocalizationRuntime(japanese, source).localizer.resolveChecked(algorithm);
    expect(resolved.length).toBeGreaterThan(20);
    expect(resolved).not.toContain("{algorithm_id}");
  });

  it("reports a checked missing target row and visibly recovers to source", () => {
    const diagnostics: string[] = [];
    const localizer = new Localizer(esTemplate, source, {
      strict: true,
      diagnostic: (diagnostic) => diagnostics.push(diagnostic.code),
    });
    const message = algorithmMessage("tides4");
    expect(() => localizer.resolveChecked(message)).toThrow(/missing-row/);
    const recovered = localizer.resolve(message);
    expect(recovered).not.toContain("{algorithm_id}");
    expect(recovered).not.toContain("tx1_");
    expect(diagnostics).toContain("trox.missing-row");
  });

  it("deduplicates repeated runtime diagnostics by code and entry", () => {
    const diagnostics: string[] = [];
    const runtime = createTargetLocalizationRuntime(esTemplate, source, (diagnostic) => {
      diagnostics.push(`${diagnostic.code}:${diagnostic.entry_id ?? ""}`);
    });
    const message = algorithmMessage("tides4");
    runtime.localizer.resolve(message);
    runtime.localizer.resolve(message);
    expect(diagnostics).toHaveLength(1);
  });

  it("keeps diagnostics observational and rejects malformed canonical bundles", () => {
    const localizer = new Localizer(esTemplate, source, {
      diagnostic: () => {
        throw new Error("diagnostic sink failed");
      },
    });
    expect(localizer.resolve(searchMessage())).not.toContain("tx1_");
    expect(() => loadCanonicalBundle(JSON.stringify(JSON.parse(enUSBundleJSON), null, 2), "source")).toThrow();
  });

  it("requires explicit resolution and canonical serialization", () => {
    const message = searchMessage();
    expect(() => String(message)).toThrow(/must be resolved/);
    expect(JSON.stringify(message)).toBe("{}");
    expect(requireSourceRuntime().sourceCatalog.localizedStringFromJSON(message.toCanonicalJSON()).entryId)
      .toBe(message.entryId);
  });
});
