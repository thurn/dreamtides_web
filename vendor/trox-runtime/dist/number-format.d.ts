export interface NumberFormat {
    readonly decimal: string;
    readonly digits: string;
    readonly exponent: string;
    readonly group: string;
    readonly grouping: readonly [number, number];
    readonly minimum_grouping_digits: number;
    readonly minus: string;
    readonly plus: string;
}
export declare function formatNumber(value: number, format: NumberFormat): string;
