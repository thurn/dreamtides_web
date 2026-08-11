export class TroxValueError extends Error {
    code;
    constructor(code, message) {
        super(`${code}: ${message}`);
        this.name = "TroxValueError";
        this.code = code;
    }
}
export class TroxDeserializeError extends Error {
    code;
    constructor(code, message) {
        super(`${code}: ${message}`);
        this.name = "TroxDeserializeError";
        this.code = code;
    }
}
export class TroxResolveError extends Error {
    code;
    constructor(code, message) {
        super(`${code}: ${message}`);
        this.name = "TroxResolveError";
        this.code = code;
    }
}
