export type PublicAccountType = "independent_creator" | "studio" | "buyer" | "investor";

/** Public account intent is captured at signup; server-resolved permissions still gate every workspace. */
export function publicAccountTypeFrom(value: unknown): PublicAccountType | null {
  if (value === "independent_creator" || value === "creator") return "independent_creator";
  if (value === "studio") return "studio";
  if (value === "buyer") return "buyer";
  if (value === "investor") return "investor";
  return null;
}
