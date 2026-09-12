/**
 * Vocabulary and pure helpers shared by the model and the fake backend.
 *
 * Nothing here knows about MobX or mobx-sentinel — it is the kind of plain
 * domain code you would already have in an application.
 */

export const CURRENCIES = ["USD", "EUR", "JPY"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** How many decimal places each currency actually bills in. */
const MINOR_UNITS: Record<CurrencyCode, number> = { USD: 2, EUR: 2, JPY: 0 };

export function roundToMinorUnit(amount: number, currency: CurrencyCode): number {
  const factor = 10 ** MINOR_UNITS[currency];
  return Math.round(amount * factor) / factor;
}

export function formatMoney(amount: number, currency: CurrencyCode): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export enum PaymentTerms {
  DUE_ON_RECEIPT = "DUE_ON_RECEIPT",
  NET_15 = "NET_15",
  NET_30 = "NET_30",
  CUSTOM = "CUSTOM",
}

export const PAYMENT_TERMS: Record<PaymentTerms, { label: string; netDays: number | null }> = {
  // `netDays: null` means the user has to pick the due date themselves.
  [PaymentTerms.DUE_ON_RECEIPT]: { label: "Due on receipt", netDays: 0 },
  [PaymentTerms.NET_15]: { label: "Net 15", netDays: 15 },
  [PaymentTerms.NET_30]: { label: "Net 30", netDays: 30 },
  [PaymentTerms.CUSTOM]: { label: "Pick a date", netDays: null },
};

export enum TaxCategory {
  STANDARD = "STANDARD",
  REDUCED = "REDUCED",
  EXEMPT = "EXEMPT",
}

export const TAX_CATEGORIES: Record<TaxCategory, { label: string; rate: number }> = {
  [TaxCategory.STANDARD]: { label: "Standard 10%", rate: 0.1 },
  [TaxCategory.REDUCED]: { label: "Reduced 8%", rate: 0.08 },
  [TaxCategory.EXEMPT]: { label: "Exempt", rate: 0 },
};

export type CountryCode = "US" | "DE" | "JP";

export const COUNTRIES: Record<
  CountryCode,
  {
    name: string;
    /** Postal rules differ per country, so validation has to react to the selected one. */
    postalCode: { label: string; pattern: RegExp; example: string };
    region: { label: string; required: boolean };
  }
> = {
  US: {
    name: "United States",
    postalCode: { label: "ZIP code", pattern: /^\d{5}(-\d{4})?$/, example: "94103" },
    region: { label: "State", required: true },
  },
  DE: {
    name: "Germany",
    postalCode: { label: "Postal code", pattern: /^\d{5}$/, example: "10115" },
    region: { label: "State", required: false },
  },
  JP: {
    name: "Japan",
    postalCode: { label: "Postal code", pattern: /^\d{3}-\d{4}$/, example: "150-0001" },
    region: { label: "Prefecture", required: true },
  },
};

/**
 * Dates are kept at midnight UTC because that is what `<input type="date">`
 * hands back through `valueAsDate`.
 */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function toDateInput(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
