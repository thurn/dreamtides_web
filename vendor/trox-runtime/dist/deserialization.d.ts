export declare function parseCanonicalJson(input: string, label: string): unknown;
export declare function deserializeBoundary<T>(operation: () => T): T;
export declare function assertDictionary(value: unknown, label: string): asserts value is Record<string, unknown>;
export declare function assertObjectKeys(record: unknown, required: readonly string[], optional: readonly string[], label: string): asserts record is Record<string, unknown>;
export declare function ownValue<T>(record: Readonly<Record<string, T>>, key: string): T | undefined;
