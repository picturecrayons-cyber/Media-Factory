export type DistributionFormInput = {
  territories: string;
  languages: string;
  windowStart: string;
  windowEnd: string;
};

export function validateDistributionForm(input: DistributionFormInput): string[] {
  const errors: string[] = [];
  const territories = input.territories.split(",").map((value) => value.trim()).filter(Boolean);
  const languages = input.languages.split(",").map((value) => value.trim()).filter(Boolean);

  // Match the server preflight exactly: accepted territory must be uppercase WORLDWIDE.
  if (territories.length !== 1 || territories[0] !== "WORLDWIDE") {
    errors.push("Current Crayons Loop preflight requires exactly WORLDWIDE territory. Confirm the signed rights grant covers it; do not use this value unless authorized.");
  }
  if (languages.length === 0) {
    errors.push("Enter at least one language covered by the signed rights grant.");
  }
  if (!input.windowStart || !input.windowEnd) {
    errors.push("Enter both distribution window start and end dates.");
  } else {
    const start = new Date(input.windowStart);
    const end = new Date(input.windowEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      errors.push("Enter valid distribution window dates.");
    } else if (end <= start) {
      errors.push("Distribution window end must be strictly after the start.");
    }
  }
  return errors;
}
