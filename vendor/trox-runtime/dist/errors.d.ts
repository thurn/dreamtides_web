export declare class TroxValueError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class TroxDeserializeError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class TroxResolveError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
