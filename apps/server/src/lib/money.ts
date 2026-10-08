/**
 * Money is stored as numeric(12,2): lei with bani. Amounts used to be integer
 * columns and every write did Math.round, so 49,50 RON became 50.
 */
export function roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
