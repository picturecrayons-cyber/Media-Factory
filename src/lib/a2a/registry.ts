export type A2ASkill = {
  id: string;
  name: string;
  agent: string;
  description: string;
  mode: "read";
};

export const A2A_SKILLS: readonly A2ASkill[] = [
  { id: "lead_qualification", name: "Lead Qualification", agent: "sales_intelligence", description: "Score and explain lead fit using approved business signals.", mode: "read" },
  { id: "account_prioritisation", name: "Account Prioritisation", agent: "sales_intelligence", description: "Rank target accounts by commercial opportunity and readiness.", mode: "read" },
  { id: "campaign_intelligence", name: "Campaign Intelligence", agent: "marketing_intelligence", description: "Summarise campaign performance and identify next opportunities.", mode: "read" },
  { id: "market_opportunity", name: "Market Opportunity", agent: "market_intelligence", description: "Produce structured market and category opportunity briefs.", mode: "read" },
  { id: "partner_discovery", name: "Partner Discovery", agent: "partnership_intelligence", description: "Prioritise prospective buyers, distributors and strategic partners.", mode: "read" },
  { id: "revenue_summary", name: "Revenue Summary", agent: "revenue_intelligence", description: "Summarise commercial activity from authoritative payment and deal data.", mode: "read" },
  { id: "executive_brief", name: "Executive Brief", agent: "executive_intelligence", description: "Combine approved intelligence into a concise management brief.", mode: "read" },
];

export function getA2ASkill(id: string): A2ASkill | undefined {
  return A2A_SKILLS.find((skill) => skill.id === id);
}
