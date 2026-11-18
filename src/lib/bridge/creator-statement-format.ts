export type CreatorStatementAmount = {
  amountPaise: string | number;
  currency: string;
};

export function formatCreatorStatementAmount(amountMinor: string | number, currency: string): string {
  let amount: bigint;
  try {
    amount = BigInt(amountMinor);
  } catch {
    return "Amount unavailable";
  }

  if (currency === "INR") {
    const major = amount / 100n;
    const paise = (amount % 100n).toString().padStart(2, "0");
    return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(major)}.${paise}`;
  }

  return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(amount)} ${currency} minor units`;
}

/** Sum independently per currency; never combine unlike currencies. */
export function sumCreatorStatementAmounts(
  lines: readonly CreatorStatementAmount[],
): Array<{ currency: string; amountMinor: string }> {
  const totals = new Map<string, bigint>();
  for (const line of lines) {
    let amount: bigint;
    try {
      amount = BigInt(line.amountPaise);
    } catch {
      throw new Error("Creator statement contains an invalid minor-unit amount");
    }
    totals.set(line.currency, (totals.get(line.currency) ?? 0n) + amount);
  }
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amount]) => ({ currency, amountMinor: amount.toString() }));
}
