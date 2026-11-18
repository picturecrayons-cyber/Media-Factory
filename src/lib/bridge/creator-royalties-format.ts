export function formatCreatorMinorAmount(amount: string, currency: string): string {
  let minor: bigint;
  try {
    minor = BigInt(amount);
  } catch {
    return "Amount unavailable";
  }
  if (currency === "INR") {
    const major = minor / 100n;
    const fraction = (minor % 100n).toString().padStart(2, "0");
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(major)}.${fraction}`;
  }
  return `${minor.toString()} ${currency} minor units`;
}

export function formatCreatorRoyaltyDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
