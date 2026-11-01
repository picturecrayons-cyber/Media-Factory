export type PublicAccountType = "independent_creator" | "studio" | "buyer";

/** Maps only supported public signup roles. Internal/investor roles must be provisioned separately. */
export function publicAccountTypeFrom(value: unknown): PublicAccountType | null {
  if (value === "independent_creator" || value === "creator") return "independent_creator";
  if (value === "studio") return "studio";
  if (value === "buyer") return "buyer";
  return null;
}
