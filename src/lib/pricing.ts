/**
 * Single source of truth for how the GitPush Pro price is *displayed*.
 *
 * The amount actually charged lives on the Paystack Plan referenced by
 * PAYSTACK_PRO_PLAN_CODE — nothing here can change what a customer pays.
 * Paystack Nigerian accounts settle in NGN, so the Plan must be created
 * with an amount of ₦17,000 (1_700_000 kobo). If the Plan amount and
 * PRO_PRICE_NGN below ever disagree, fix the Plan in Paystack; don't
 * "fix" it by editing this file.
 */
export const PRO_PRICE_NGN = 17000;

/**
 * Indicative NGN -> local conversion rates, used only for the "≈ $12"
 * style hint next to the real NGN price. Deliberately approximate and
 * clearly marked as such in the UI, so we never imply a guaranteed
 * exchange rate we don't control.
 */
const NGN_PER_UNIT: Record<string, number> = {
  USD: 1417,
  EUR: 1530,
  GBP: 1790,
  CAD: 1030,
  AUD: 925,
  ZAR: 78,
  KES: 11,
  GHS: 108,
  INR: 16.5,
  JPY: 9.3,
};

const LOCALE_CURRENCY: Record<string, string> = {
  NG: "NGN",
  US: "USD",
  GB: "GBP",
  CA: "CAD",
  AU: "AUD",
  ZA: "ZAR",
  KE: "KES",
  GH: "GHS",
  IN: "INR",
  JP: "JPY",
  DE: "EUR",
  FR: "EUR",
  ES: "EUR",
  IT: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  BE: "EUR",
  AT: "EUR",
  FI: "EUR",
};

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: amount >= 100 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount)}`;
  }
}

/** The billed price, always in NGN — e.g. "₦17,000". */
export function proPriceNGN(): string {
  return money(PRO_PRICE_NGN, "NGN");
}

/**
 * Best-effort local-currency equivalent for the viewer, e.g. "≈ $12".
 * Returns null for Nigerian viewers (nothing to convert) or when we have
 * no rate for their currency — callers should simply omit the hint then.
 */
export function proPriceLocalEquivalent(): string | null {
  const region =
    typeof navigator !== "undefined"
      ? (new Intl.Locale(navigator.language || "en-US").maximize().region ?? "US")
      : "US";
  const currency = LOCALE_CURRENCY[region] ?? "USD";
  if (currency === "NGN") return null;
  const rate = NGN_PER_UNIT[currency];
  if (!rate) return null;
  return `≈ ${money(PRO_PRICE_NGN / rate, currency)}`;
}
