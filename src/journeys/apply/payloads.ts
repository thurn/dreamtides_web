// Payload narrowing helpers for option.costs[] and option.effects[].
//
// The manifest declares each option's costs and effects as `unknown[]` because
// the dispatch loop is the only place that needs to know their concrete shape.
// These guards turn a raw entry into a typed `SharedCostPayload` or
// `SharedRewardPayload`, or return `null` so the caller can log and skip the
// malformed envelope rather than crash. The guards stay pure — logging is the
// caller's job.

import type { TemplateParams } from "../journey/shared/types";

export type SharedCostPayload = {
  kind: "shared_cost_template";
  templateId: string;
  params: TemplateParams;
  text: string;
  convertedEssence: number;
};

export type SharedRewardPayload = {
  kind: "shared_reward_template";
  templateId: string;
  params: TemplateParams;
  text: string;
  convertedEssence: number;
};

// Internal helper. Validates the shared envelope shape and the `kind` literal.
// Returns the narrowed object or `null`. Both public guards delegate here so
// the field-level checks live in exactly one place.
function narrowPayload<K extends string>(
  value: unknown,
  expectedKind: K,
): { kind: K; templateId: string; params: TemplateParams; text: string; convertedEssence: number } | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.kind !== expectedKind) return null;
  const { templateId, params, text, convertedEssence } = record;
  if (typeof templateId !== "string") return null;
  if (params === null || typeof params !== "object" || Array.isArray(params)) return null;
  if (typeof text !== "string") return null;
  if (typeof convertedEssence !== "number") return null;
  return {
    kind: expectedKind,
    templateId,
    params: params as TemplateParams,
    text,
    convertedEssence,
  };
}

export function narrowSharedCostPayload(value: unknown): SharedCostPayload | null {
  return narrowPayload(value, "shared_cost_template");
}

export function narrowSharedRewardPayload(value: unknown): SharedRewardPayload | null {
  return narrowPayload(value, "shared_reward_template");
}
