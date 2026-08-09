export function formatAuthoredTemplate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{([^{}]+)\}/gu, (_match, slot: string) => {
    const value = values[slot];
    if (value === undefined)
      throw new Error(`Missing authored template value {${slot}}`);
    return String(value);
  });
}
