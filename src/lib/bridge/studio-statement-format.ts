export type StudioMinorAmount = string | number | null;

function exactMinorAmount(value: StudioMinorAmount): bigint | null {
  if (value === null) return null;
  if (typeof value === "number" && !Number.isSafeInteger(value)) return null;
  const raw = String(value).trim();
  if (!/^-?\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

/** Normalize database minor-unit values without converting through IEEE-754. */
export function normalizeStudioMinorAmount(value: StudioMinorAmount): string | null {
  return exactMinorAmount(value)?.toString() ?? null;
}

/** Format integer minor units exactly; unknown/unsafe amounts fail closed. */
export function formatStudioMinorAmount(value: StudioMinorAmount, currency: string): string {
  const amount = exactMinorAmount(value);
  if (value === null) return "Not reported";
  if (amount === null) return "Amount unavailable";

  if (currency === "INR") {
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const major = absolute / 100n;
    const minor = (absolute % 100n).toString().padStart(2, "0");
    const sign = negative ? "-" : "";
    return `${sign}₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(major)}.${minor}`;
  }

  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)} ${currency} minor units`;
}
