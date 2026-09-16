/** ISO 4217 code → display symbol for plan/pricing UI */
export const CURRENCY_SYMBOL_MAP: Record<string, string> = {
    USD: "$",
    EUR: "€",
    GBP: "£",
    INR: "₹",
    AUD: "$",
    ZAR: "R",
    CAD: "C$",
    BRL: "R$",
};

export function getCurrencySymbol(currencyCode: string | undefined | null): string {
    if (!currencyCode) return "$";
    return CURRENCY_SYMBOL_MAP[currencyCode] ?? "$";
}
