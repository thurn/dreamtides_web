/** Closed plain application data. Catalog resolution supplies semantic validation. */
import { TRANSFIGURATION_RULES } from "../content/transfiguration";
import type { CardSubtype } from "../types/card-identity";
import type { TransfigurationSourceState } from "../transfiguration/transfiguration-logic";
import type { ConstituentTransfiguration, TransfigurationApplication } from "./dsl/types";

export interface TransfigurationPrefixState extends TransfigurationSourceState {
  readonly initiallyAmplified: boolean;
  readonly typeRemap?: CardSubtype;
  readonly steps: readonly ConstituentTransfiguration[];
  readonly eligible: readonly ConstituentTransfiguration[];
}

const CONSTITUENTS: readonly ConstituentTransfiguration[] = ["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned"];
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function constituent(value: unknown): value is ConstituentTransfiguration {
  return CONSTITUENTS.some(form => form === value);
}
function dense(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length;
}
export function isTransfigurationApplications(value: unknown): value is readonly TransfigurationApplication[] {
  return dense(value) && Array.from(value).every(application => {
    if (!record(application) || !Object.prototype.hasOwnProperty.call(application, "form")) return false;
    if (application.form !== "Perfected") return Object.keys(application).every(key => key === "form") && constituent(application.form);
    return Object.keys(application).every(key => key === "form" || key === "constituents") && Object.prototype.hasOwnProperty.call(application, "constituents") && dense(application.constituents) && Array.from(application.constituents).every(constituent) &&
      application.constituents.length >= TRANSFIGURATION_RULES.perfected.minimumEligibleForms && new Set(application.constituents).size === application.constituents.length &&
      application.constituents.every((form, index, all) => index === 0 || CONSTITUENTS.indexOf(all[index - 1] as ConstituentTransfiguration) < CONSTITUENTS.indexOf(form as ConstituentTransfiguration));
  });
}
export function copyTransfigurationApplications(value: readonly TransfigurationApplication[]): TransfigurationApplication[] {
  return value.map(application => application.form === "Perfected" ? { form: application.form, constituents: [...application.constituents] } : { form: application.form });
}

/** A worker table is catalog authority, derived by the source catalog's actual fold. */
export function isTransfigurationPrefixState(value: unknown): value is TransfigurationPrefixState {
  if (!record(value) || Object.keys(value).some(key => !["initiallyAmplified", "typeRemap", "steps", "eligible", "amplified", "resonant"].includes(key)) ||
    typeof value.initiallyAmplified !== "boolean" || typeof value.amplified !== "boolean" ||
    value.typeRemap !== undefined && typeof value.typeRemap !== "string" || !dense(value.steps) || !Array.from(value.steps).every(constituent) ||
    !dense(value.eligible) || !Array.from(value.eligible).every(constituent)) return false;
  const eligible = value.eligible;
  if (new Set(eligible).size !== eligible.length || !eligible.every((form, index) => index === 0 || CONSTITUENTS.indexOf(eligible[index - 1] as ConstituentTransfiguration) < CONSTITUENTS.indexOf(form as ConstituentTransfiguration))) return false;
  const selection = value.resonant;
  return selection === null || record(selection) && Object.keys(selection).length === 3 &&
    ["oncePerTurn", "dawn", "materialized"].includes(String(selection.change)) &&
    Number.isSafeInteger(selection.ordinal) && Number(selection.ordinal) >= 0 && Number.isSafeInteger(selection.count) && Number(selection.count) > Number(selection.ordinal);
}
