export declare function canonicalJson(value: unknown): string;
export declare function base32(bytes: Uint8Array): string;
export declare function hex(bytes: Uint8Array): string;
export declare function comparePaths(left: readonly number[], right: readonly number[]): number;
export declare function sortRecord<T>(value: Record<string, T>): Record<string, T>;
export declare function deepFreeze<T>(value: T): T;
