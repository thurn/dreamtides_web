import {
  FLUENT_MESSAGE_IDS,
  FLUENT_MESSAGE_VARIABLE_NAMES,
  type FluentMessageDescriptor,
  type FluentMessageId,
  type FluentMessageIdsWithVariables,
  type FluentMessageIdsWithoutVariables,
  type FluentMessageVariables,
  type PersistedFluentVariable,
} from "./localization-messages";

type ExactVariables<Expected, Actual extends Expected> = Actual &
  Record<Exclude<keyof Actual, keyof Expected>, never>;

export type MessageDescriptorFor<Id extends FluentMessageId> = Extract<
  FluentMessageDescriptor,
  { readonly id: Id }
>;

/**
 * Constructs a JSON-safe message descriptor for a non-React boundary.
 *
 * The generic exact-key constraint catches extra properties on aliased
 * variable objects, while the runtime check protects descriptors crossing a
 * persisted or untrusted boundary.
 */
export function createMessageDescriptor<
  Id extends FluentMessageIdsWithoutVariables,
>(id: Id): MessageDescriptorFor<Id>;
export function createMessageDescriptor<
  Id extends FluentMessageIdsWithVariables,
  Variables extends FluentMessageVariables<Id>,
>(
  id: Id,
  variables: ExactVariables<FluentMessageVariables<Id>, Variables>,
): MessageDescriptorFor<Id>;
export function createMessageDescriptor(
  id: FluentMessageId,
  variables?: Readonly<Record<string, PersistedFluentVariable>>,
): FluentMessageDescriptor {
  if (variables === undefined) {
    return { id } as FluentMessageDescriptor;
  }
  return { id, variables } as FluentMessageDescriptor;
}

export function isPersistedFluentVariable(
  value: unknown,
): value is PersistedFluentVariable {
  return (
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasOwn(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isKnownMessageId(value: unknown): value is FluentMessageId {
  return (
    typeof value === "string" &&
    (FLUENT_MESSAGE_IDS as readonly string[]).includes(value)
  );
}

/** Validates the exact JSON-safe descriptor contract at an untrusted boundary. */
export function isFluentMessageDescriptor(
  value: unknown,
): value is FluentMessageDescriptor {
  if (!isPlainRecord(value) || !isKnownMessageId(value.id)) return false;

  const variableNames = FLUENT_MESSAGE_VARIABLE_NAMES[value.id];
  if (variableNames.length === 0) {
    return !hasOwn(value, "variables");
  }

  if (!hasOwn(value, "variables") || !isPlainRecord(value.variables)) {
    return false;
  }
  const variables = value.variables;

  const keys = Object.keys(variables).sort();
  const expectedKeys = [...variableNames].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return false;
  }
  return keys.every((key) => isPersistedFluentVariable(variables[key]));
}
