
/**
 * Bans raw `env(safe-area-inset-*)` reads in Cumulus's product-UI tier.
 *
 * The device-frame screenshot iframe (used for QA and design review) cannot
 * simulate the browser's native safe-area insets — a raw `env()` read
 * resolves to 0 inside it, silently ignoring the simulated notch/home-
 * indicator inset the harness injects. App code must read the injected
 * `var(--safe-area-inset-top)` (or `--safe-area-inset-bottom`/`-left`/
 * `-right`) channel instead, or a `--safe-*` design floor built on top of
 * it — see the safe-area chapter of the Cumulus token docs.
 *
 * eslint.config.js decides which files this rule governs.
 */

/** Matches a raw `env(safe-area-inset-*)` read. */
const RAW_SAFE_AREA_ENV_RE = /env\(\s*safe-area-inset-/;

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban raw env(safe-area-inset-*) reads in Cumulus product UI; read the injected var(--safe-area-inset-*) channel instead.",
    },
    schema: [],
    messages: {
      rawSafeAreaEnv:
        "Raw `env(safe-area-inset-*)` reads as 0 inside the device-frame screenshot iframe, silently ignoring the simulated inset. Read the injected `var(--safe-area-inset-top)` (or the matching bottom/left/right channel) — or a `--safe-*` design floor built on it — instead. See the safe-area chapter of the Cumulus token docs.",
    },
  },

  create(context) {
    return {
      Literal(node) {
        if (
          typeof node.value === "string" &&
          RAW_SAFE_AREA_ENV_RE.test(node.value)
        ) {
          context.report({ node, messageId: "rawSafeAreaEnv" });
        }
      },
      TemplateElement(node) {
        if (RAW_SAFE_AREA_ENV_RE.test(node.value.raw)) {
          context.report({ node, messageId: "rawSafeAreaEnv" });
        }
      },
    };
  },
};

export default rule;
